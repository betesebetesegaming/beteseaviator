/**
 * In-memory implementation of the marketers Store contract (src/marketers/store.ts),
 * mirroring the Firestore semantics the service relies on: create() conflicts,
 * deep-merge set, top-level update, ordered cursors, count/sum, buffered transactions.
 */
const { AlreadyExistsError } = require("../lib/marketers/store");

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const isPlain = (v) => v && typeof v === "object" && !Array.isArray(v);

function deepMerge(target, src) {
  const out = { ...target };
  for (const [k, v] of Object.entries(src)) {
    out[k] = isPlain(v) && isPlain(out[k]) ? deepMerge(out[k], v) : clone(v);
  }
  return out;
}

function cmp(a, b) {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  return a < b ? -1 : 1;
}

function matches(data, [field, op, value]) {
  const v = field.split(".").reduce((o, k) => (o == null ? undefined : o[k]), data);
  switch (op) {
    case "==":
      return v === value;
    case ">=":
      return v !== undefined && v !== null && v >= value;
    case ">":
      return v !== undefined && v !== null && v > value;
    case "<":
      return v !== undefined && v !== null && v < value;
    case "<=":
      return v !== undefined && v !== null && v <= value;
    case "array-contains":
      return Array.isArray(v) && v.includes(value);
    default:
      throw new Error(`op ${op}`);
  }
}

function memoryStore() {
  const docs = new Map();
  let seq = 0;

  const collectionDocs = (collection) =>
    [...docs.entries()]
      .filter(([p]) => p.startsWith(`${collection}/`) && p.split("/").length === 2)
      .map(([p, data]) => ({ id: p.split("/")[1], data: clone(data) }));

  const write = (path, data, mode) => {
    const existing = docs.get(path);
    if (mode === "create") {
      if (existing) throw new AlreadyExistsError(path);
      docs.set(path, clone(data));
    } else if (mode === "merge") {
      docs.set(path, deepMerge(existing ?? {}, data));
    } else if (mode === "set") {
      docs.set(path, clone(data));
    } else if (mode === "update") {
      if (!existing) throw new Error(`NOT_FOUND ${path}`);
      docs.set(path, { ...existing, ...clone(data) });
    }
  };

  const store = {
    docs,
    async get(path) {
      const d = docs.get(path);
      return d ? { id: path.split("/").pop(), data: clone(d) } : null;
    },
    async create(path, data) {
      write(path, data, "create");
    },
    async set(path, data, merge = false) {
      write(path, data, merge ? "merge" : "set");
    },
    async update(path, data) {
      write(path, data, "update");
    },
    async delete(path) {
      docs.delete(path);
    },
    async query(collection, spec) {
      let rows = collectionDocs(collection).filter((r) => (spec.where ?? []).every((w) => matches(r.data, w)));
      if (spec.orderBy) {
        const [f, dir] = spec.orderBy;
        const sign = dir === "desc" ? -1 : 1;
        rows.sort((a, b) => sign * (cmp(a.data[f], b.data[f]) || cmp(a.id, b.id)));
        if (spec.after) {
          const { v, id } = spec.after;
          rows = rows.filter((r) => sign * (cmp(r.data[f], v) || cmp(r.id, id)) > 0);
        }
      }
      return spec.limit ? rows.slice(0, spec.limit) : rows;
    },
    async count(collection, where) {
      return (await store.query(collection, { where })).length;
    },
    async sum(collection, where, field) {
      return (await store.query(collection, { where })).reduce((n, r) => n + Number(r.data[field] ?? 0), 0);
    },
    async txn(fn) {
      const pending = [];
      const tx = {
        get: (path) => store.get(path),
        set: (path, data, merge = false) => pending.push([path, data, merge ? "merge" : "set"]),
        create: (path, data) => pending.push([path, data, "create"]),
        update: (path, data) => pending.push([path, data, "update"]),
      };
      const result = await fn(tx);
      for (const [path, , mode] of pending) {
        if (mode === "create" && docs.has(path)) throw new AlreadyExistsError(path);
      }
      for (const [path, data, mode] of pending) write(path, data, mode);
      return result;
    },
    newId(collection) {
      seq += 1;
      return `${collection}-${String(seq).padStart(6, "0")}`;
    },
  };
  return store;
}

module.exports = { memoryStore };
