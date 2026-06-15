import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  db,
  FieldValue,
  getSettings,
  requireAuth,
  requireRole,
  round2,
  staffLoginKey,
  walletRead,
  walletWrite,
  type Settings,
} from "./helpers";
import { recordBonusWageringRequirement, playthroughRates } from "./wagering";

export interface PlayerReferralSettings {
  enabled: boolean;
  bonusAmount: number;
  minQualifyingDeposit: number;
  requireFirstBet: boolean;
}

export function playerReferralSettings(settings: Settings): PlayerReferralSettings {
  const pr = (settings as Settings & { playerReferral?: Partial<PlayerReferralSettings> }).playerReferral;
  return {
    enabled: pr?.enabled !== false,
    bonusAmount: Number(pr?.bonusAmount ?? 10),
    minQualifyingDeposit: Number(pr?.minQualifyingDeposit ?? 50),
    requireFirstBet: pr?.requireFirstBet !== false,
  };
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
  const invite = inviteSnap.data() as ReferralInvite & { rewardStatus?: string };
  if (invite.rewardStatus !== "pending") return;
  if (invite.depositQualified) return;

  tx.update(inviteRef, {
    depositQualified: true,
    qualifyingDepositAmount: round2(depositAmount),
  });

  if (!cfg.requireFirstBet) {
    await tryPayReferralBonus(tx, referredUid, settings);
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
  const invite = inviteSnap.data() as ReferralInvite & { rewardStatus?: string };
  if (invite.rewardStatus !== "pending") return;
  if (!invite.depositQualified) return;
  if (invite.firstBetQualified) return;

  tx.update(inviteRef, { firstBetQualified: true });
  await tryPayReferralBonus(tx, referredUid, settings);
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

async function tryPayReferralBonus(
  tx: FirebaseFirestore.Transaction,
  referredUid: string,
  settings: Settings
): Promise<void> {
  const cfg = playerReferralSettings(settings);
  if (!cfg.enabled || cfg.bonusAmount <= 0) return;

  const inviteRef = db.doc(`referralInvites/${referredUid}`);
  const inviteSnap = await tx.get(inviteRef);
  if (!inviteSnap.exists) return;

  const invite = inviteSnap.data() as ReferralInvite;
  if (invite.rewardStatus !== "pending") return;
  if (!invite.depositQualified) return;
  if (cfg.requireFirstBet && !invite.firstBetQualified) return;

  const fraud = await fraudRejectReason(tx, referredUid, invite);
  if (fraud) {
    tx.update(inviteRef, { rewardStatus: "rejected", rejectReason: fraud });
    return;
  }

  const referrerWallet = await walletRead(tx, invite.referrerId);
  const bonusAmount = round2(cfg.bonusAmount);
  const { bonusMultiplier } = playthroughRates(settings);

  walletWrite(tx, referrerWallet, {
    uid: invite.referrerId,
    amount: bonusAmount,
    type: "bonus",
    creditAsBonus: true,
    description: `Referral bonus — friend qualified (${invite.referralCode})`,
    meta: { source: "player_referral", referredUserId: referredUid, referralCode: invite.referralCode },
  });
  recordBonusWageringRequirement(tx, invite.referrerId, referrerWallet, bonusAmount, bonusMultiplier);

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

  return {
    enabled: cfg.enabled,
    bonusAmount: cfg.bonusAmount,
    minQualifyingDeposit: cfg.minQualifyingDeposit,
    requireFirstBet: cfg.requireFirstBet,
    referralCode,
    friendsInvited,
    qualifiedFriends,
    pendingBonuses,
    totalBonusEarned,
  };
});
