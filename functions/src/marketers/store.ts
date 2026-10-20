/**
 * Narrow storage interface for the marketing directory. Production uses Firestore
 * (mk* collections only); tests use an in-memory implementation of the same contract.
 */
import * as admin from "firebase-admin";

export type Data = Record<string, unknown>;
export interface Doc {
  id: string;
  data: Data;
}

export type Op = "==" | ">=" | "<" | ">" | "<=" | "array-contains";
export type Where = [field: string, op: Op, value: unknown];

export interface QuerySpec {
  where?: Where[];
  orderBy?: [field: string, dir: "asc" | "desc"];
  limit?: number;
  /** Cursor: value of the orderBy field + doc id of the last row already shown. */
  after?: { v: unknown; id: string } | null;
}

export interface Tx {
  get(path: string): Promise<Doc | null>;
  set(path: string, data: Data, merge?: boolean): void;
  create(path: string, data: Data): void;
  update(path: string, data: Data): void;
}

export interface Store {
  get(path: string): Promise<Doc | null>;
  /** Throws AlreadyExistsError when the doc exists. */
  create(path: string, data: Data): Promise<void>;
  set(path: string, data: Data, merge?: boolean): Promise<void>;
  update(path: string, data: Data): Promise<void>;
  delete(path: string): Promise<void>;
  query(collection: string, spec: QuerySpec): Promise<Doc[]>;
  count(collection: string, where: Where[]): Promise<number>;
  sum(collection: string, where: Where[], field: string): Promise<number>;
  txn<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  newId(collection: string): string;
}

export class AlreadyExistsError extends Error {}

function isAlreadyExists(e: unknown): boolean {
  const code = (e as { code?: number | string }).code;
  return code === 6 || code === "already-exists" || String(e).includes("ALREADY_EXISTS");
}

export function firestoreStore(db: admin.firestore.Firestore): Store {
  const build = (collection: string, spec: QuerySpec) => {
    let q: admin.firestore.Query = db.collection(collection);
    for (const [f, op, v] of spec.where ?? []) q = q.where(f, op, v);
    if (spec.orderBy) {
      q = q.orderBy(spec.orderBy[0], spec.orderBy[1]).orderBy(admin.firestore.FieldPath.documentId(), spec.orderBy[1]);
      if (spec.after) q = q.startAfter(spec.after.v, spec.after.id);
    }
    if (spec.limit) q = q.limit(spec.limit);
    return q;
  };
  const toDoc = (s: admin.firestore.DocumentSnapshot): Doc | null =>
    s.exists ? { id: s.id, data: s.data() as Data } : null;

  return {
    async get(path) {
      return toDoc(await db.doc(path).get());
    },
    async create(path, data) {
      try {
        await db.doc(path).create(data);
      } catch (e) {
        if (isAlreadyExists(e)) throw new AlreadyExistsError(path);
        throw e;
      }
    },
    async set(path, data, merge = false) {
      await db.doc(path).set(data, { merge });
    },
    async update(path, data) {
      await db.doc(path).update(data);
    },
    async delete(path) {
      await db.doc(path).delete();
    },
    async query(collection, spec) {
      const snap = await build(collection, spec).get();
      return snap.docs.map((d) => ({ id: d.id, data: d.data() as Data }));
    },
    async count(collection, where) {
      const snap = await build(collection, { where }).count().get();
      return snap.data().count;
    },
    async sum(collection, where, field) {
      const snap = await build(collection, { where })
        .aggregate({ total: admin.firestore.AggregateField.sum(field) })
        .get();
      return Number(snap.data().total ?? 0);
    },
    async txn(fn) {
      try {
        return await db.runTransaction(async (t) =>
          fn({
            get: async (path) => toDoc(await t.get(db.doc(path))),
            set: (path, data, merge = false) => void t.set(db.doc(path), data, { merge }),
            create: (path, data) => void t.create(db.doc(path), data),
            update: (path, data) => void t.update(db.doc(path), data),
          }),
        );
      } catch (e) {
        if (isAlreadyExists(e)) throw new AlreadyExistsError(String(e));
        throw e;
      }
    },
    newId(collection) {
      return db.collection(collection).doc().id;
    },
  };
}
