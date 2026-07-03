import type { DocumentSnapshot, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import {
  db,
  rtdb,
  requireRole,
  type ProfileData,
  type Role,
} from "./helpers";
import { formatPlayerId } from "./playerIds";

const ONLINE_MS = 3 * 60 * 1000;

type NetworkMember = {
  uid: string;
  name: string;
  role: Role;
  phone: string | null;
  email: string | null;
  agentSlug: string | null;
  status: string;
  balance?: number;
  playerNumber?: number | null;
  playerId?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  createdAt?: number | null;
};

type LiveUser = {
  uid: string;
  name: string;
  role: Role;
  page: string;
  lastSeen: number;
  online: boolean;
};

type LedgerRow = {
  id: string;
  userId: string;
  userName?: string;
  playerId?: string | null;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reference: string;
  description: string;
  meta?: Record<string, unknown>;
  createdAt: number | null;
};

function memberFromDoc(
  d: QueryDocumentSnapshot | DocumentSnapshot,
  parentNameByUid: Map<string, string>,
): NetworkMember {
  const p = d.data() as ProfileData;
  const playerNumber = p.playerNumber ?? null;
  const parentId = p.parentId ?? null;
  return {
    uid: d.id,
    name: p.name,
    role: p.role,
    phone: p.phone,
    email: p.email,
    agentSlug: p.agentSlug,
    status: p.status,
    playerNumber,
    playerId: playerNumber ? formatPlayerId(playerNumber) : null,
    parentId,
    parentName: parentId ? parentNameByUid.get(parentId) ?? null : null,
    createdAt: p.createdAt?.toMillis?.() ?? null,
  };
}

async function loadNetwork(uid: string, profile: ProfileData): Promise<NetworkMember[]> {
  const parentNameByUid = new Map<string, string>([[uid, profile.name]]);

  const customers = await db
    .collection("users")
    .where("role", "==", "player")
    .where("ancestors", "array-contains", uid)
    .get();

  const members = customers.docs.map((d) => memberFromDoc(d, parentNameByUid));

  const walletSnaps = await Promise.all(members.map((m) => db.doc(`wallets/${m.uid}`).get()));
  walletSnaps.forEach((snap, i) => {
    if (snap.exists) members[i].balance = snap.data()?.balance as number;
  });

  members.sort((a, b) => a.name.localeCompare(b.name));
  return members;
}

async function loadAllPlatformUsers(limit: number): Promise<NetworkMember[]> {
  const snap = await db.collection("users").limit(limit).get();
  const parentNameByUid = new Map<string, string>();
  for (const d of snap.docs) {
    parentNameByUid.set(d.id, String(d.data().name ?? "Unknown"));
  }
  const members = snap.docs.map((d) => memberFromDoc(d, parentNameByUid));
  return members.sort((a, b) => a.name.localeCompare(b.name));
}

function parsePresence(
  val: Record<string, Record<string, unknown>> | null,
  allowed: Set<string> | null,
): LiveUser[] {
  if (!val) return [];
  const now = Date.now();
  const rows: LiveUser[] = [];
  for (const [id, data] of Object.entries(val)) {
    if (allowed && !allowed.has(id)) continue;
    const lastSeen = Number(data.lastSeen ?? 0);
    rows.push({
      uid: id,
      name: String(data.name ?? "Unknown"),
      role: String(data.role ?? "player") as Role,
      page: String(data.page ?? "/"),
      lastSeen,
      online: now - lastSeen <= ONLINE_MS,
    });
  }
  rows.sort((a, b) => b.lastSeen - a.lastSeen);
  return rows;
}

async function loadTransactions(opts: {
  allowed: Set<string> | null;
  typeFilter: string | null;
  limit: number;
  nameByUid: Map<string, string>;
  playerIdByUid: Map<string, string>;
}): Promise<LedgerRow[]> {
  const { allowed, typeFilter, limit, nameByUid, playerIdByUid } = opts;
  const rows: LedgerRow[] = [];

  if (!allowed) {
    let q = db.collection("transactions").orderBy("createdAt", "desc").limit(limit);
    if (typeFilter && typeFilter !== "all") {
      q = db
        .collection("transactions")
        .where("type", "==", typeFilter)
        .orderBy("createdAt", "desc")
        .limit(limit);
    }
    const snap = await q.get();
    for (const d of snap.docs) {
      const t = d.data();
      rows.push({
        id: d.id,
        userId: t.userId,
        userName: nameByUid.get(t.userId),
        playerId: playerIdByUid.get(t.userId) ?? null,
        type: t.type,
        amount: t.amount,
        balanceBefore: t.balanceBefore,
        balanceAfter: t.balanceAfter,
        reference: t.reference,
        description: t.description,
        meta: t.meta,
        createdAt: t.createdAt?.toMillis?.() ?? null,
      });
    }
    return rows;
  }

  const ids = [...allowed];
  if (ids.length === 0) return [];

  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    let q = db
      .collection("transactions")
      .where("userId", "in", chunk)
      .orderBy("createdAt", "desc")
      .limit(limit);
    if (typeFilter && typeFilter !== "all") {
      q = db
        .collection("transactions")
        .where("userId", "in", chunk)
        .where("type", "==", typeFilter)
        .orderBy("createdAt", "desc")
        .limit(limit);
    }
    const snap = await q.get();
    for (const d of snap.docs) {
      const t = d.data();
      rows.push({
        id: d.id,
        userId: t.userId,
        userName: nameByUid.get(t.userId),
        playerId: playerIdByUid.get(t.userId) ?? null,
        type: t.type,
        amount: t.amount,
        balanceBefore: t.balanceBefore,
        balanceAfter: t.balanceAfter,
        reference: t.reference,
        description: t.description,
        meta: t.meta,
        createdAt: t.createdAt?.toMillis?.() ?? null,
      });
    }
  }

  rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return rows.slice(0, limit);
}

/**
 * Unified operations hub — admin sees the whole platform; agents see their
 * network (self, sub-agents, customers) for live users and transactions.
 */
export const getOperationsHub = onCall(async (req) => {
  const { uid, profile } = await requireRole(req, ["admin", "agent"]);
  const typeFilter = req.data?.type ? String(req.data.type) : null;
  const limit = Math.min(Math.max(Number(req.data?.limit) || 150, 1), 300);

  const isAdmin = profile.role === "admin";
  let network: NetworkMember[] = [];
  let allowed: Set<string> | null = null;
  const nameByUid = new Map<string, string>();
  const playerIdByUid = new Map<string, string>();

  if (isAdmin) {
    network = await loadAllPlatformUsers(500);
    for (const m of network) {
      nameByUid.set(m.uid, m.name);
      if (m.playerId) playerIdByUid.set(m.uid, m.playerId);
    }
    nameByUid.set(uid, profile.name);
  } else {
    network = await loadNetwork(uid, profile);
    allowed = new Set([uid, ...network.map((m) => m.uid)]);
    nameByUid.set(uid, profile.name);
    for (const m of network) {
      nameByUid.set(m.uid, m.name);
      if (m.playerId) playerIdByUid.set(m.uid, m.playerId);
    }
  }

  const presenceVal = (await rtdb.ref("presence").get()).val() as Record<
    string,
    Record<string, unknown>
  > | null;
  const live = parsePresence(presenceVal, allowed);

  const transactions = await loadTransactions({
    allowed,
    typeFilter,
    limit,
    nameByUid,
    playerIdByUid,
  });

  return {
    scope: isAdmin ? "platform" : "network",
    role: profile.role,
    network,
    live,
    liveOnline: live.filter((r) => r.online).length,
    transactions,
  };
});
