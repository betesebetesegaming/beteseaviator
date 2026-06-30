import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import {
  db,
  FieldValue,
  getSettings,
  normalizePhone,
  requireAuth,
  requireRole,
  round2,
  staffLoginKey,
  walletRead,
  walletWrite,
  bumpDailyStats,
  bumpPlatformStats,
  todayIso,
  type Settings,
  type Provider,
} from "./helpers";

export interface PlayerReferralSettings {
  enabled: boolean;
  bonusAmount: number;
  minQualifyingDeposit: number;
  requireFirstBet: boolean;
  /** Every Monday, unclaimed referral balance moves to play credit (default true). */
  weeklyReleaseToPlay?: boolean;
}

export function playerReferralSettings(settings: Settings): PlayerReferralSettings {
  const pr = (settings as Settings & { playerReferral?: Partial<PlayerReferralSettings> }).playerReferral;
  return {
    enabled: pr?.enabled !== false,
    bonusAmount: Number(pr?.bonusAmount ?? 10),
    minQualifyingDeposit: Number(pr?.minQualifyingDeposit ?? 50),
    requireFirstBet: pr?.requireFirstBet !== false,
    weeklyReleaseToPlay: pr?.weeklyReleaseToPlay !== false,
  };
}

/** Next Monday 08:00 Africa/Dakar (when weekly play-credit release runs). */
export function nextReferralReleaseAt(from = new Date()): string {
  const tz = "Africa/Dakar";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(from);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = Number(get("year"));
  const m = Number(get("month")) - 1;
  const d = Number(get("day"));
  const weekday = get("weekday");
  const hour = Number(get("hour"));
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dayMap[weekday.slice(0, 3)] ?? 0;
  let daysUntil = (8 - dow) % 7;
  if (daysUntil === 0 && hour >= 8) daysUntil = 7;
  const release = new Date(Date.UTC(y, m, d + daysUntil, 8, 0, 0));
  return release.toISOString();
}

export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
}

function referralCodeBase(name: string): string {
  const key = staffLoginKey(name).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (key || "PLAYER").slice(0, 12);
}

/** Find an unused player referral code (reads only — use before any transaction writes). */
export async function pickPlayerReferralCode(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  name: string
): Promise<string> {
  const base = referralCodeBase(name);
  const suffix = uid.replace(/\D/g, "").slice(-4) || uid.slice(0, 4);
  let candidate = `${base}${suffix}`.slice(0, 16);

  for (let i = 0; i < 8; i++) {
    const code = i === 0 ? candidate : `${base}${suffix}${i}`.slice(0, 16);
    const snap = await tx.get(db.doc(`playerRefs/${code}`));
    if (!snap.exists || snap.data()!.uid === uid) {
      return code;
    }
  }

  return `${base}${uid.slice(0, 6)}`.slice(0, 16);
}

export function writePlayerReferralCode(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  name: string,
  code: string
): void {
  tx.set(
    db.doc(`playerRefs/${code}`),
    { uid, name, active: true, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

/** Allocate a unique player referral code and index doc (reads then writes). */
export async function allocatePlayerReferralCode(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  name: string
): Promise<string> {
  const code = await pickPlayerReferralCode(tx, uid, name);
  writePlayerReferralCode(tx, uid, name, code);
  return code;
}

export async function resolvePlayerReferrerUid(code: string): Promise<string | null> {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  const snap = await db.doc(`playerRefs/${normalized}`).get();
  if (!snap.exists || snap.data()?.active === false) return null;
  return String(snap.data()!.uid);
}

export interface ReferralInvite {
  referrerId: string;
  referralCode: string;
  deviceId: string | null;
  signupIp: string | null;
  depositQualified: boolean;
  firstBetQualified: boolean;
  rewardStatus: "pending" | "paid" | "rejected";
  rejectReason: string | null;
  qualifyingDepositAmount: number;
  createdAt: FirebaseFirestore.FieldValue;
}

/** Attach player-to-player referrer at registration (writes only — read invite first). */
export function writeAttachPlayerReferrer(
  tx: FirebaseFirestore.Transaction,
  referredUid: string,
  referrerUid: string,
  referralCode: string,
  opts: { deviceId?: string | null; signupIp?: string | null }
): void {
  if (referrerUid === referredUid) return;

  const deviceId = opts.deviceId?.trim().slice(0, 128) || null;
  const signupIp = opts.signupIp?.trim().slice(0, 64) || null;

  tx.set(db.doc(`referralInvites/${referredUid}`), {
    referrerId: referrerUid,
    referralCode: normalizeReferralCode(referralCode),
    deviceId,
    signupIp,
    depositQualified: false,
    firstBetQualified: false,
    rewardStatus: "pending",
    rejectReason: null,
    qualifyingDepositAmount: 0,
    createdAt: FieldValue.serverTimestamp(),
  } satisfies ReferralInvite);

  if (deviceId) {
    tx.set(
      db.doc(`referral_devices/${deviceId}`),
      { uid: referredUid, referrerId: referrerUid, createdAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }
  if (signupIp) {
    tx.set(
      db.doc(`referral_ips/${signupIp.replace(/[./]/g, "_")}`),
      { lastUid: referredUid, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }

  tx.set(
    db.doc(`users/${referrerUid}`),
    { stats: { referralInvites: FieldValue.increment(1) } },
    { merge: true }
  );
}

/** @deprecated Prefer pickPlayerReferralCode + writeAttachPlayerReferrer with reads first. */
export async function attachPlayerReferrer(
  tx: FirebaseFirestore.Transaction,
  referredUid: string,
  referrerUid: string,
  referralCode: string,
  opts: { deviceId?: string | null; signupIp?: string | null }
): Promise<void> {
  if (referrerUid === referredUid) return;

  const inviteRef = db.doc(`referralInvites/${referredUid}`);
  const existing = await tx.get(inviteRef);
  if (existing.exists) return;

  writeAttachPlayerReferrer(tx, referredUid, referrerUid, referralCode, opts);
}

type ReferralInviteState = ReferralInvite & { rewardStatus?: string };

interface ReferralBonusPlan {
  inviteRef: FirebaseFirestore.DocumentReference;
  invite: ReferralInviteState;
  fraud: string | null;
  referrerWallet: Awaited<ReturnType<typeof walletRead>> | null;
}

/** Mark deposit milestone for referred player (inside deposit transaction). */
export async function onReferralDeposit(
  tx: FirebaseFirestore.Transaction,
  referredUid: string,
  depositAmount: number,
  settings: Settings
): Promise<void> {
  const cfg = playerReferralSettings(settings);
  if (!cfg.enabled || depositAmount < cfg.minQualifyingDeposit) return;

  const inviteRef = db.doc(`referralInvites/${referredUid}`);
  const inviteSnap = await tx.get(inviteRef);
  if (!inviteSnap.exists) return;
  const invite = inviteSnap.data() as ReferralInviteState;
  if (invite.rewardStatus !== "pending") return;
  if (invite.depositQualified) return;

  const inviteAfterDeposit: ReferralInviteState = {
    ...invite,
    depositQualified: true,
    qualifyingDepositAmount: round2(depositAmount),
  };
  const bonusPlan = !cfg.requireFirstBet
    ? await planReferralBonusPay(tx, referredUid, settings, inviteAfterDeposit)
    : null;

  tx.update(inviteRef, {
    depositQualified: true,
    qualifyingDepositAmount: round2(depositAmount),
  });

  if (bonusPlan) {
    commitReferralBonusPay(tx, referredUid, settings, bonusPlan);
  }
}

/** Mark first real-money bet for referred player (inside bet transaction). */
export async function onReferralFirstBet(
  tx: FirebaseFirestore.Transaction,
  referredUid: string,
  settings: Settings
): Promise<void> {
  const cfg = playerReferralSettings(settings);
  if (!cfg.enabled || !cfg.requireFirstBet) return;

  const inviteRef = db.doc(`referralInvites/${referredUid}`);
  const inviteSnap = await tx.get(inviteRef);
  if (!inviteSnap.exists) return;
  const invite = inviteSnap.data() as ReferralInviteState;
  if (invite.rewardStatus !== "pending") return;
  if (!invite.depositQualified) return;
  if (invite.firstBetQualified) return;

  const inviteAfterBet: ReferralInviteState = { ...invite, firstBetQualified: true };
  const bonusPlan = await planReferralBonusPay(tx, referredUid, settings, inviteAfterBet);

  tx.update(inviteRef, { firstBetQualified: true });
  if (bonusPlan) {
    commitReferralBonusPay(tx, referredUid, settings, bonusPlan);
  }
}

async function fraudRejectReason(
  tx: FirebaseFirestore.Transaction,
  referredUid: string,
  invite: ReferralInvite
): Promise<string | null> {
  if (invite.referrerId === referredUid) return "self_referral";

  const [referrerSnap, referredSnap] = await Promise.all([
    tx.get(db.doc(`users/${invite.referrerId}`)),
    tx.get(db.doc(`users/${referredUid}`)),
  ]);
  if (!referrerSnap.exists || !referredSnap.exists) return "missing_profile";

  const referrerPhone = String(referrerSnap.data()?.phone ?? "");
  const referredPhone = String(referredSnap.data()?.phone ?? "");
  if (referrerPhone && referredPhone && referrerPhone === referredPhone) {
    return "same_phone";
  }

  if (invite.deviceId) {
    const deviceSnap = await tx.get(db.doc(`referral_devices/${invite.deviceId}`));
    const paidUid = deviceSnap.data()?.paidReferralUid as string | undefined;
    if (paidUid && paidUid !== referredUid) return "device_already_rewarded";
  }

  if (invite.signupIp) {
    const ipKey = invite.signupIp.replace(/[./]/g, "_");
    const ipSnap = await tx.get(db.doc(`referral_ip_rewards/${ipKey}`));
    const count = Number(ipSnap.data()?.paidCount ?? 0);
    if (count >= 5) return "ip_limit";
  }

  return null;
}

/** Read-only phase — must run before any writes in the same transaction. */
async function planReferralBonusPay(
  tx: FirebaseFirestore.Transaction,
  referredUid: string,
  settings: Settings,
  invite: ReferralInviteState
): Promise<ReferralBonusPlan | null> {
  const cfg = playerReferralSettings(settings);
  if (!cfg.enabled || cfg.bonusAmount <= 0) return null;
  if (invite.rewardStatus !== "pending") return null;
  if (!invite.depositQualified) return null;
  if (cfg.requireFirstBet && !invite.firstBetQualified) return null;

  const inviteRef = db.doc(`referralInvites/${referredUid}`);
  const fraud = await fraudRejectReason(tx, referredUid, invite);
  const referrerWallet = fraud ? null : await walletRead(tx, invite.referrerId);
  return { inviteRef, invite, fraud, referrerWallet };
}

/** Write-only phase — call after planReferralBonusPay and any prerequisite writes. */
function commitReferralBonusPay(
  tx: FirebaseFirestore.Transaction,
  referredUid: string,
  settings: Settings,
  plan: ReferralBonusPlan
): void {
  const cfg = playerReferralSettings(settings);
  const { inviteRef, invite, fraud, referrerWallet } = plan;

  if (fraud) {
    tx.update(inviteRef, { rewardStatus: "rejected", rejectReason: fraud });
    return;
  }
  if (!referrerWallet) return;

  const bonusAmount = round2(cfg.bonusAmount);
  const referralBefore = round2(referrerWallet.referralBalance ?? 0);
  const referralAfter = round2(referralBefore + bonusAmount);
  referrerWallet.referralBalance = referralAfter;

  tx.set(
    db.doc(`wallets/${invite.referrerId}`),
    {
      referralBalance: referralAfter,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  tx.set(db.collection("transactions").doc(), {
    userId: invite.referrerId,
    type: "referral_reward",
    amount: bonusAmount,
    balanceBefore: round2(referrerWallet.balance),
    balanceAfter: round2(referrerWallet.balance),
    reference: `REF-${invite.referralCode}-${referredUid.slice(0, 6)}`,
    status: "completed",
    description: `Referral bonus — friend qualified (${invite.referralCode})`,
    meta: {
      source: "player_referral",
      referredUserId: referredUid,
      referralCode: invite.referralCode,
      referralBalanceBefore: referralBefore,
      referralBalanceAfter: referralAfter,
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  const rewardRef = db.collection("referral_rewards").doc();
  tx.set(rewardRef, {
    referrerId: invite.referrerId,
    referredUserId: referredUid,
    referralCode: invite.referralCode,
    bonusAmount,
    status: "paid",
    createdAt: FieldValue.serverTimestamp(),
    paidAt: FieldValue.serverTimestamp(),
  });

  tx.update(inviteRef, { rewardStatus: "paid", rejectReason: null });
  tx.set(
    db.doc(`users/${invite.referrerId}`),
    {
      stats: {
        referralQualified: FieldValue.increment(1),
        referralBonusEarned: FieldValue.increment(bonusAmount),
      },
    },
    { merge: true }
  );

  if (invite.deviceId) {
    tx.set(
      db.doc(`referral_devices/${invite.deviceId}`),
      { paidReferralUid: referredUid, paidAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }
  if (invite.signupIp) {
    const ipKey = invite.signupIp.replace(/[./]/g, "_");
    tx.set(
      db.doc(`referral_ip_rewards/${ipKey}`),
      { paidCount: FieldValue.increment(1) },
      { merge: true }
    );
  }
}

/** Ensure existing players have a referral code (callable + registration). */
export async function ensurePlayerReferralCode(uid: string, name: string): Promise<string> {
  const userRef = db.doc(`users/${uid}`);
  const snap = await userRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Profile not found.");
  const existing = snap.data()?.referralCode as string | undefined;
  if (existing) return existing;

  let code = "";
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(userRef);
    const current = fresh.data()?.referralCode as string | undefined;
    if (current) {
      code = current;
      return;
    }
    code = await allocatePlayerReferralCode(tx, uid, name);
    tx.set(userRef, { referralCode: code }, { merge: true });
  });
  return code;
}

export const getPlayerReferralDashboard = onCall(async (req) => {
  const uid = requireAuth(req);
  await requireRole(req, ["player"]);

  const settings = await getSettings();
  const cfg = playerReferralSettings(settings);
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) throw new HttpsError("not-found", "Profile not found.");
  const name = String(userSnap.data()!.name ?? "Player");

  const referralCode = await ensurePlayerReferralCode(uid, name);

  const [invitesSnap, rewardsSnap] = await Promise.all([
    db.collection("referralInvites").where("referrerId", "==", uid).get(),
    db.collection("referral_rewards").where("referrerId", "==", uid).get(),
  ]);

  let friendsInvited = invitesSnap.size;
  let qualifiedFriends = 0;
  let pendingBonuses = 0;
  let totalBonusEarned = 0;

  for (const doc of invitesSnap.docs) {
    const d = doc.data();
    if (d.rewardStatus === "paid") qualifiedFriends += 1;
    else if (d.rewardStatus === "pending" && d.depositQualified) pendingBonuses += 1;
  }

  for (const doc of rewardsSnap.docs) {
    totalBonusEarned = round2(totalBonusEarned + Number(doc.data().bonusAmount ?? 0));
  }

  const stats = userSnap.data()?.stats as Record<string, number> | undefined;
  if (stats?.referralBonusEarned) {
    totalBonusEarned = Math.max(totalBonusEarned, round2(stats.referralBonusEarned));
  }

  const walletSnap = await db.doc(`wallets/${uid}`).get();
  const referralBalance = round2(Number(walletSnap.data()?.referralBalance ?? 0));

  return {
    enabled: cfg.enabled,
    bonusAmount: cfg.bonusAmount,
    minQualifyingDeposit: cfg.minQualifyingDeposit,
    requireFirstBet: cfg.requireFirstBet,
    weeklyReleaseToPlay: cfg.weeklyReleaseToPlay !== false,
    nextReleaseAt: nextReferralReleaseAt(),
    referralCode,
    friendsInvited,
    qualifiedFriends,
    pendingBonuses,
    totalBonusEarned,
    referralBalance,
  };
});

/** Move referralBalance → play balance for one or all players (Monday batch). */
export async function releaseReferralBonusesToPlay(opts?: {
  uid?: string;
}): Promise<{ players: number; total: number }> {
  const settings = await getSettings();
  const cfg = playerReferralSettings(settings);
  if (!cfg.weeklyReleaseToPlay) return { players: 0, total: 0 };

  let docs: FirebaseFirestore.QueryDocumentSnapshot[];
  if (opts?.uid) {
    const snap = await db.doc(`wallets/${opts.uid}`).get();
    if (!snap.exists || Number(snap.data()?.referralBalance ?? 0) <= 0) {
      return { players: 0, total: 0 };
    }
    docs = [snap as FirebaseFirestore.QueryDocumentSnapshot];
  } else {
    const snap = await db.collection("wallets").where("referralBalance", ">", 0).get();
    docs = snap.docs;
  }

  let players = 0;
  let total = 0;

  for (const doc of docs) {
    try {
      const released = await db.runTransaction(async (tx) => {
        const wallet = await walletRead(tx, doc.id);
        const available = round2(wallet.referralBalance ?? 0);
        if (available <= 0) return 0;

        wallet.referralBalance = 0;
        tx.set(
          db.doc(`wallets/${doc.id}`),
          { referralBalance: 0, updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
        walletWrite(tx, wallet, {
          uid: doc.id,
          amount: available,
          type: "referral_to_balance",
          description: "Referral bonus — Monday release to play credit",
          meta: { source: "weekly_referral_release" },
        });
        return available;
      });
      if (released > 0) {
        players += 1;
        total = round2(total + released);
      }
    } catch (e) {
      logger.warn("referral weekly release failed", { uid: doc.id, error: String(e) });
    }
  }

  logger.info("releaseReferralBonusesToPlay", { players, total, singleUid: opts?.uid ?? null });
  return { players, total };
}

/** Every Monday 08:00 Dakar — move unclaimed referral bonuses to play credit. */
export const releaseReferralBonusesWeekly = onSchedule(
  { schedule: "0 8 * * 1", timeZone: "Africa/Dakar" },
  async () => {
    await releaseReferralBonusesToPlay();
  }
);

/** Admin can run Monday release early (e.g. first launch). */
export const adminReleaseReferralBonuses = onCall(async (req) => {
  await requireRole(req, ["admin"]);
  const uid = req.data?.uid ? String(req.data.uid) : undefined;
  return releaseReferralBonusesToPlay(uid ? { uid } : undefined);
});

function assertProvider(raw: string): Provider {
  const p = raw.toLowerCase();
  if (p === "wave" || p === "afrimoney" || p === "aps" || p === "qmoney") return p;
  throw new HttpsError("invalid-argument", "Invalid payment provider.");
}

/** Claim referral earnings — players withdraw to phone; play credit releases every Monday. */
export const claimReferralEarnings = onCall(async (req) => {
  const uid = requireAuth(req);
  const { profile } = await requireRole(req, ["player"]);
  const mode = String(req.data?.mode ?? "") as "play" | "withdraw";
  const settings = await getSettings();
  const cfg = playerReferralSettings(settings);

  if (mode !== "play" && mode !== "withdraw") {
    throw new HttpsError("invalid-argument", "mode must be play or withdraw.");
  }

  if (mode === "play") {
    throw new HttpsError(
      "failed-precondition",
      "Referral bonuses move to your play balance every Monday. Withdraw to your phone anytime instead."
    );
  }

  const provider = assertProvider(String(req.data?.provider ?? ""));
  const phone = normalizePhone(String(req.data?.phone ?? ""));
  if (settings.providers[provider] === false) {
    throw new HttpsError("failed-precondition", "This provider is currently disabled.");
  }
  if (!phone) {
    throw new HttpsError("invalid-argument", "A valid payout phone is required.");
  }

  const ref = db.collection("paymentRequests").doc();

  await db.runTransaction(async (tx) => {
    const wallet = await walletRead(tx, uid);
    const available = round2(wallet.referralBalance ?? 0);
    if (available <= 0) {
      throw new HttpsError("failed-precondition", "No referral earnings to claim.");
    }

    const claimAmount =
      req.data?.amount !== undefined ? round2(Number(req.data.amount)) : available;
    if (!Number.isFinite(claimAmount) || claimAmount <= 0 || claimAmount > available) {
      throw new HttpsError("invalid-argument", "Invalid claim amount.");
    }

    wallet.referralBalance = round2(available - claimAmount);
    tx.set(
      db.doc(`wallets/${uid}`),
      { referralBalance: wallet.referralBalance, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    if (claimAmount < cfg.bonusAmount) {
      throw new HttpsError(
        "invalid-argument",
        `Minimum referral withdrawal is ${cfg.bonusAmount} GMD.`
      );
    }

    tx.set(db.collection("transactions").doc(), {
      userId: uid,
      type: "referral_withdrawal",
      amount: -claimAmount,
      balanceBefore: round2(wallet.balance),
      balanceAfter: round2(wallet.balance),
      reference: ref.id,
      status: "completed",
      description: "Referral earnings withdrawal request",
      meta: { source: "referral_claim", mode: "withdraw", provider, phone, requestId: ref.id },
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.set(ref, {
      userId: uid,
      userName: profile.name,
      userRole: profile.role,
      type: "withdrawal",
      amount: claimAmount,
      payoutAmount: claimAmount,
      earlyWithdrawalFee: 0,
      bonusForfeited: 0,
      playthroughMet: true,
      provider,
      status: "pending",
      providerRef: null,
      approvedBy: null,
      meta: { phone, source: "referral_balance" },
      createdAt: FieldValue.serverTimestamp(),
    });
    bumpDailyStats(tx, todayIso(), { withdrawals: claimAmount });
    bumpPlatformStats(tx, { totalWithdrawals: claimAmount });
  });

  return { ok: true as const, requestId: ref.id };
});
