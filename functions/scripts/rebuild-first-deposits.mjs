/**
 * One-off: fill marketer first-open cash from the deposit ledger.
 * Uses gcloud user credentials (not Firebase Auth).
 */
const PROJECT = "beteseaviator-a05ae";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const MIN_FIRST = 25;

function val(field) {
  if (!field) return undefined;
  if (field.stringValue != null) return field.stringValue;
  if (field.integerValue != null) return Number(field.integerValue);
  if (field.doubleValue != null) return field.doubleValue;
  if (field.booleanValue != null) return field.booleanValue;
  if (field.timestampValue != null) return Date.parse(field.timestampValue);
  if (field.arrayValue?.values) return field.arrayValue.values.map(val);
  if (field.mapValue?.fields) {
    const o = {};
    for (const [k, v] of Object.entries(field.mapValue.fields)) o[k] = val(v);
    return o;
  }
  return undefined;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function linkOwners(fields) {
  const ancestors = Array.isArray(val(fields.ancestors))
    ? val(fields.ancestors).filter((id) => typeof id === "string" && id)
    : [];
  const parentId = val(fields.parentId);
  const ids = parentId && !ancestors.includes(parentId) ? [parentId, ...ancestors] : ancestors;
  return [...new Set(ids)];
}

async function runQuery(token, structuredQuery) {
  const out = [];
  let startAfter = null;
  for (;;) {
    const body = {
      structuredQuery: {
        ...structuredQuery,
        limit: 500,
        orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
        ...(startAfter
          ? { startAt: { values: [{ referenceValue: startAfter }], before: false } }
          : {}),
      },
    };
    const res = await fetch(`${BASE}:runQuery`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`runQuery ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    let last = null;
    let count = 0;
    for (const row of rows) {
      if (!row.document) continue;
      out.push(row.document);
      last = row.document.name;
      count += 1;
    }
    if (count < 500 || !last) break;
    startAfter = last;
  }
  return out;
}

async function patch(token, name, fields, mask) {
  const url = name.startsWith("http") ? name : `https://firestore.googleapis.com/v1/${name}`;
  const qs = mask.map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join("&");
  const res = await fetch(`${url}?${qs}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`PATCH ${name} ${res.status}: ${await res.text()}`);
}

function numField(n) {
  return Number.isInteger(n) ? { integerValue: String(n) } : { doubleValue: n };
}

async function main() {
  const token = process.env.GCLOUD_TOKEN;
  if (!token) throw new Error("GCLOUD_TOKEN missing");

  console.log("Loading players and agents…");
  const players = await runQuery(token, {
    from: [{ collectionId: "users" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "role" },
        op: "EQUAL",
        value: { stringValue: "player" },
      },
    },
  });
  const agents = await runQuery(token, {
    from: [{ collectionId: "users" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "role" },
        op: "IN",
        value: {
          arrayValue: {
            values: [
              { stringValue: "agent" },
              { stringValue: "super_agent" },
              { stringValue: "sub_agent" },
            ],
          },
        },
      },
    },
  });

  const playerMeta = new Map();
  for (const doc of players) {
    const uid = doc.name.split("/").pop();
    playerMeta.set(uid, { ancestors: linkOwners(doc.fields || {}), name: doc.name });
  }
  console.log(`Players ${players.length}, agents ${agents.length}`);

  console.log("Loading deposit transactions…");
  const deposits = await runQuery(token, {
    from: [{ collectionId: "transactions" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "type" },
        op: "EQUAL",
        value: { stringValue: "deposit" },
      },
    },
  });
  console.log(`Deposit rows ${deposits.length}`);

  const byPlayer = new Map();
  for (const doc of deposits) {
    const f = doc.fields || {};
    const uid = String(val(f.userId) || "");
    if (!uid || !playerMeta.has(uid)) continue;
    const amount = round2(Math.abs(Number(val(f.amount) || 0)));
    if (!(amount > 0)) continue;
    const meta = val(f.meta) || {};
    const extra = meta.otcCash && meta.agentId ? [String(meta.agentId)] : [];
    const list = byPlayer.get(uid) ?? [];
    list.push({ amount, at: Number(val(f.createdAt) || 0), extra });
    byPlayer.set(uid, list);
  }

  const byAgent = new Map();
  const daily = new Map();
  const bump = (id, fields) => {
    const cur = byAgent.get(id) ?? { customerDeposits: 0, firstDeposits: 0, firstDepositCount: 0 };
    if (fields.customerDeposits) cur.customerDeposits = round2(cur.customerDeposits + fields.customerDeposits);
    if (fields.firstDeposits) cur.firstDeposits = round2(cur.firstDeposits + fields.firstDeposits);
    if (fields.firstDepositCount) cur.firstDepositCount += fields.firstDepositCount;
    byAgent.set(id, cur);
  };

  let firstCustomers = 0;
  for (const [uid, meta] of playerMeta) {
    const deps = (byPlayer.get(uid) ?? []).sort((a, b) => a.at - b.at);
    for (const dep of deps) {
      for (const agentId of new Set([...meta.ancestors, ...dep.extra])) {
        bump(agentId, { customerDeposits: dep.amount });
      }
    }
    const first = deps.find((d) => d.amount >= MIN_FIRST);
    if (first && meta.ancestors.length) {
      firstCustomers += 1;
      const date = first.at > 0 ? new Date(first.at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      for (const agentId of meta.ancestors) {
        bump(agentId, { firstDeposits: first.amount, firstDepositCount: 1 });
        const key = `${agentId}_${date}`;
        const cur = daily.get(key) ?? { agentId, date, firstDeposits: 0, firstDepositCount: 0 };
        cur.firstDeposits = round2(cur.firstDeposits + first.amount);
        cur.firstDepositCount += 1;
        daily.set(key, cur);
      }
    }
  }

  console.log(`First-open customers ${firstCustomers}. Writing agent stats…`);
  let raised = 0;
  for (const doc of agents) {
    const uid = doc.name.split("/").pop();
    const stored = val(doc.fields?.stats) || {};
    const totals = byAgent.get(uid) ?? { customerDeposits: 0, firstDeposits: 0, firstDepositCount: 0 };
    const firstDeposits = Math.max(Number(stored.firstDeposits || 0), totals.firstDeposits);
    const firstDepositCount = Math.max(Number(stored.firstDepositCount || 0), totals.firstDepositCount);
    const customerDeposits = Math.max(Number(stored.customerDeposits || 0), totals.customerDeposits);
    if (firstDeposits > Number(stored.firstDeposits || 0)) raised += 1;
    await patch(
      token,
      doc.name,
      {
        stats: {
          mapValue: {
            fields: {
              firstDeposits: numField(firstDeposits),
              firstDepositCount: numField(firstDepositCount),
              customerDeposits: numField(customerDeposits),
            },
          },
        },
      },
      ["stats.firstDeposits", "stats.firstDepositCount", "stats.customerDeposits"]
    );
    const name = val(doc.fields?.name) || uid;
    if (firstDeposits > 0) {
      console.log(`  ${name}: first-open ${firstDeposits} GMD (${firstDepositCount} customers)`);
    }
  }

  console.log(`Writing ${daily.size} daily first-open rows…`);
  for (const row of daily.values()) {
    const name = `${BASE}/agentDailyStats/${row.agentId}_${row.date}`;
    await patch(
      token,
      name,
      {
        agentId: { stringValue: row.agentId },
        date: { stringValue: row.date },
        firstDeposits: numField(row.firstDeposits),
        firstDepositCount: numField(row.firstDepositCount),
      },
      ["agentId", "date", "firstDeposits", "firstDepositCount"]
    );
  }

  console.log(`Done. Marketers raised: ${raised}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
