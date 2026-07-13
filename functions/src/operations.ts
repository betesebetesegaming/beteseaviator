import type { DocumentSnapshot, QueryDocumentSnapshot, QuerySnapshot } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import {
  db,
  rtdb,
  requireRole,
  todayIso,
  type ProfileData,
  type Role,
} from "./helpers";
import { formatPlayerId } from "./playerIds";

const ONLINE_MS = 3 * 60 * 1000;
const AGENT_ROLES = ["agent", "super_agent", "sub_agent"] as const;

type NetworkMember = {
  uid: string;
  name: string;
  role: Role | string;
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

type AgentSummary = {
  uid: string;
  name: string;
  agentSlug: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  customerCount: number;
  customersOpenedToday: number;
  customerDeposits: number;
  totalBets: number;
  totalWins: number;
  ggr: number;
  commissionEarned: number;
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
  agentId?: string | null;
  agentName?: string | null;
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

function agentSummaryFromDoc(
  d: QueryDocumentSnapshot,
  opensByAgent: Map<string, number>,
): AgentSummary {
  const p = d.data() as ProfileData;
  const stats = p.stats ?? {};
  const totalBets = Number(stats.totalBets ?? 0);
  const totalWins = Number(stats.totalWins ?? 0);
  return {
    uid: d.id,
    name: p.name,
    agentSlug: p.agentSlug,
    phone: p.phone,
    email: p.email,
    status: p.status,
    customerCount: Number(stats.customerCount ?? 0),
    customersOpenedToday: opensByAgent.get(d.id) ?? 0,
    customerDeposits: Number(stats.customerDeposits ?? 0),
    totalBets,
    totalWins,
    ggr: Math.max(0, totalBets - totalWins),
    commissionEarned: Number(stats.commissionEarned ?? 0),
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

async function loadAdminPlatformData(today: string): Promise<{
  network: NetworkMember[];
  agents: AgentSummary[];
  parentIdByUid: Map<string, string>;
}> {
  const [agentSnap, playerSnap, dailySnap] = await Promise.all([
    db.collection("users").where("role", "in", [...AGENT_ROLES]).get(),
    db.collection("users").where("role", "==", "player").limit(2000).get(),
    db.collection("agentDailyStats").where("date", "==", today).get(),
  ]);

  const parentNameByUid = new Map<string, string>();
  for (const d of agentSnap.docs) {
    parentNameByUid.set(d.id, String(d.data().name ?? "Unknown"));
  }

  const opensByAgent = new Map<string, number>();
  for (const d of dailySnap.docs) {
    const row = d.data();
    opensByAgent.set(String(row.agentId), Number(row.customersOpened ?? 0));
  }

  const agents = agentSnap.docs
    .map((d) => agentSummaryFromDoc(d, opensByAgent))
    .sort((a, b) => a.name.localeCompare(b.name));

  const parentIdByUid = new Map<string, string>();
  const playerMembers = playerSnap.docs.map((d) => {
    const member = memberFromDoc(d, parentNameByUid);
    if (member.parentId) parentIdByUid.set(member.uid, member.parentId);
    return member;
  });

  const walletSnaps = await Promise.all(
    playerMembers.map((m) => db.doc(`wallets/${m.uid}`).get()),
  );
  walletSnaps.forEach((snap, i) => {
    if (snap.exists) playerMembers[i].balance = snap.data()?.balance as number;
  });

  const agentMembers: NetworkMember[] = agentSnap.docs.map((d) => {
    const p = d.data() as ProfileData;
    return {
      uid: d.id,
      name: p.name,
      role: p.role,
      phone: p.phone,
      email: p.email,
      agentSlug: p.agentSlug,
      status: p.status,
      parentId: p.parentId,
      parentName: null,
      createdAt: p.createdAt?.toMillis?.() ?? null,
    };
  });

  const network = [...agentMembers, ...playerMembers].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return { network, agents, parentIdByUid };
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
  parentIdByUid: Map<string, string>;
  agentNameByUid: Map<string, string>;
  /** Also include cash-desk moves this agent performed (walk-in customers). */
  includeOtcByAgentId?: string | null;
}): Promise<LedgerRow[]> {
  const {
    allowed,
    typeFilter,
    limit,
    nameByUid,
    playerIdByUid,
    parentIdByUid,
    agentNameByUid,
    includeOtcByAgentId,
  } = opts;
  const rows: LedgerRow[] = [];
  const seen = new Set<string>();

  const enrich = (d: QueryDocumentSnapshot) => {
    const t = d.data();
    const userId = String(t.userId ?? "");
    const meta = (t.meta ?? {}) as Record<string, unknown>;
    const otcAgentId = typeof meta.agentId === "string" ? meta.agentId : null;
    const agentId = otcAgentId || parentIdByUid.get(userId) || null;
    return {
      id: d.id,
      userId,
      userName: nameByUid.get(userId),
      playerId:
        (typeof meta.playerId === "string" ? meta.playerId : null) ||
        playerIdByUid.get(userId) ||
        null,
      agentId,
      agentName: agentId
        ? (typeof meta.agentName === "string" ? meta.agentName : null) ||
          agentNameByUid.get(agentId) ||
          null
        : null,
      type: t.type,
      amount: t.amount,
      balanceBefore: t.balanceBefore,
      balanceAfter: t.balanceAfter,
      reference: t.reference,
      description: t.description,
      meta: t.meta,
      createdAt: t.createdAt?.toMillis?.() ?? null,
    };
  };

  const pushSnap = (snap: QuerySnapshot) => {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      rows.push(enrich(d));
    }
  };

  if (!allowed) {
    let q = db.collection("transactions").orderBy("createdAt", "desc").limit(limit);
    if (typeFilter && typeFilter !== "all") {
      q = db
        .collection("transactions")
        .where("type", "==", typeFilter)
        .orderBy("createdAt", "desc")
        .limit(limit);
    }
    pushSnap(await q.get());
  } else {
    const ids = [...allowed];
    if (ids.length > 0) {
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
        pushSnap(await q.get());
      }
    }
  }

  if (includeOtcByAgentId) {
    let q = db
      .collection("transactions")
      .where("meta.agentId", "==", includeOtcByAgentId)
      .orderBy("createdAt", "desc")
      .limit(limit);
    if (typeFilter && typeFilter !== "all") {
      q = db
        .collection("transactions")
        .where("meta.agentId", "==", includeOtcByAgentId)
        .where("type", "==", typeFilter)
        .orderBy("createdAt", "desc")
        .limit(limit);
    }
    pushSnap(await q.get());
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
  const today = todayIso();

  const isAdmin = profile.role === "admin";
  let network: NetworkMember[] = [];
  let agents: AgentSummary[] = [];
  let allowed: Set<string> | null = null;
  const nameByUid = new Map<string, string>();
  const playerIdByUid = new Map<string, string>();
  const parentIdByUid = new Map<string, string>();
  const agentNameByUid = new Map<string, string>();

  if (isAdmin) {
    const platform = await loadAdminPlatformData(today);
    network = platform.network;
    agents = platform.agents;
    for (const [userId, parentId] of platform.parentIdByUid) {
      parentIdByUid.set(userId, parentId);
    }
    for (const a of agents) {
      agentNameByUid.set(a.uid, a.name);
      nameByUid.set(a.uid, a.name);
    }
    for (const m of network) {
      nameByUid.set(m.uid, m.name);
      if (m.playerId) playerIdByUid.set(m.uid, m.playerId);
      if (m.parentId) parentIdByUid.set(m.uid, m.parentId);
    }
    nameByUid.set(uid, profile.name);
  } else {
    network = await loadNetwork(uid, profile);
    allowed = new Set([uid, ...network.map((m) => m.uid)]);
    nameByUid.set(uid, profile.name);
    agentNameByUid.set(uid, profile.name);
    for (const m of network) {
      nameByUid.set(m.uid, m.name);
      if (m.playerId) playerIdByUid.set(m.uid, m.playerId);
      if (m.parentId) {
        parentIdByUid.set(m.uid, m.parentId);
        if (m.parentName) agentNameByUid.set(m.parentId, m.parentName);
      }
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
    parentIdByUid,
    agentNameByUid,
    includeOtcByAgentId: isAdmin ? null : uid,
  });

  return {
    scope: isAdmin ? "platform" : "network",
    role: profile.role,
    network,
    agents: isAdmin ? agents : undefined,
    live,
    liveOnline: live.filter((r) => r.online).length,
    transactions,
  };
});
