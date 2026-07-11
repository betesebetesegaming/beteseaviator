# BETESE Aviator - Admin + Agent Pay (Credit) & Withdraw - Full Code Reference

> Snapshot of the **exact deployed code** on `main` at commit `ffb8617`
> ("Let cash-desk agents credit/withdraw any customer").
>
> This is a local reference document. Source of truth remains the files linked below.

---

## Who can do what

| Action | Admin | Agent (cash desk ON) | Agent (cash desk OFF) |
|--------|-------|----------------------|------------------------|
| **Credit (cash)** - physical cash -> wallet credit | Yes (`adminOtcCashDeposit`) + customer OTP | Yes (`agentOtcCashDeposit`) + customer OTP | No |
| **Withdraw (cash)** - pay cash -> debit + withdrawal code | Yes (`adminOtcCashWithdraw`) + customer OTP | Yes (`agentOtcCashWithdraw`) + customer OTP | No |
| **Serve any customer** by Player ID / phone | Via admin Customers (`isAdmin`) | Yes (`agentLookupCustomer`) | No |
| **Credit (balance)** - from agent float/commission | N/A on cash desk | Yes (`agentDepositToCustomer`) | Yes |
| **All Wallets Credit/Withdraw** (audited reason, no OTP) | Yes (`adminAdjustWallet`) | No | No |
| **Freeze / unfreeze wallet** | Yes (`adminFreezeWallet`) | No | No |
| **Enable cash desk** for an agent | Yes (`adminSetAgentCashOps`) | No | No |

Two different admin money paths:

1. **OTC cash** (Customers page) - physical cash at the counter; **customer OTP required**; writes `otcCash` meta + withdrawal codes.
2. **All Wallets adjust** (Wallets page) - support/ops adjustment; **reason required**; **no OTP**.

---

## Wiring (which page renders which piece)

| Page | Path | What it shows |
|------|------|----------------|
| Agent My Customers / Players | `app/agent/players/page.tsx` | `AgentServeAnyCustomer` + `AgentCustomerCashActions` |
| Admin Customers | `app/admin/customers/page.tsx` | Same components with `isAdmin` when role is admin |
| Admin Agents | `app/admin/agents/page.tsx` | Enable cash desk -> `adminSetAgentCashOps` |
| Admin Wallets | `app/admin/wallets/page.tsx` | `adminAdjustWallet` / `adminFreezeWallet` (no OTP) |

Shared UI:

- `components/agent/AgentCashDesk.tsx` - modal, row actions, walk-in lookup
- `components/shared/CustomerOtpGate.tsx` - send/verify Africell OTP to **customer** phone

---

## Firestore rules that keep walk-in lookup safe

Client apps **cannot** read `phones/{key}` or write withdrawal codes / OTP docs.
Lookup and money moves go only through Cloud Functions (Admin SDK).

```javascript
match /agentWithdrawalCodes/{docId} {
      allow read: if isAdmin()
        || (isAgent() && resource.data.agentId == uid());
      allow write: if false;
    }

    match /phones/{phone} {
      allow read, write: if false;
    }

    /** OTP codes — Cloud Functions only (Africell SMS verification). */
    match /otp_codes/{phone} {
      allow read, write: if false;
    }

    /** Recent OTP verifications — Cloud Functions only. */
    match /otp_verified/{phone} {
      allow read, write: if false;
    }
```

---

## Deploy (backend)

```bash
cd functions
npm run build
firebase deploy --only functions:adminSetAgentCashOps,functions:agentOtcCashDeposit,functions:agentOtcCashWithdraw,functions:agentLookupCustomer,functions:adminOtcCashDeposit,functions:adminOtcCashWithdraw,functions:adminAdjustWallet,functions:adminFreezeWallet
```

Frontend deploys via Vercel on push to `main`.

---

## Layer 1 — Backend Cloud Functions

### `functions/src/index.ts` (relevant exports)

```typescript
export {
  adminSetAgentCashOps,
  agentOtcCashDeposit,
  agentOtcCashWithdraw,
  agentLookupCustomer,
  adminOtcCashDeposit,
  adminOtcCashWithdraw,
} from "./agentCashOps";
export {
  adminAdjustWallet,
  adminFreezeWallet,
  // …other admin exports
} from "./admin";
```

### Full `functions/src/agentCashOps.ts`

```typescript
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { formatPlayerId } from "./playerIds";
import { isAgentRole } from "./roles";
import {
  requireOtpVerifiedForPhone,
  consumeOtpVerifiedForPhone,
} from "./otpVerification";
import {
  db,
  FieldValue,
  normalizePhone,
  requireRole,
  round2,
  todayIso,
  walletRead,
  walletWrite,
  bumpDailyStats,
  bumpPlatformStats,
  type ProfileData,
} from "./helpers";

function withdrawalToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

async function requireAgentCashOps(agentUid: string): Promise<ProfileData> {
  const snap = await db.doc(`users/${agentUid}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Agent profile not found.");
  const profile = snap.data() as ProfileData;
  if (!isAgentRole(profile.role)) {
    throw new HttpsError("permission-denied", "Only agents can use cash desk operations.");
  }
  if (!profile.cashOpsEnabled) {
    throw new HttpsError(
      "permission-denied",
      "Cash desk is not enabled for your account. Ask BETESE admin to turn it on.",
    );
  }
  return profile;
}

/**
 * Find ANY player by BTE Player ID (e.g. "BTE-00042" or "42") or phone number.
 * Cash-desk agents serve walk-in customers who opened their own account, so this
 * is intentionally not limited to the agent's own network — every cash move is
 * still authorised by the customer's own OTP.
 */
async function findCustomerByIdOrPhone(
  raw: string,
): Promise<(ProfileData & { uid: string }) | null> {
  const cleaned = raw.trim();
  if (!cleaned) return null;

  // Player ID: "BTE-00042", "bte00042", or a bare number.
  const idMatch = cleaned.toUpperCase().replace(/\s/g, "").match(/^(?:BTE-?)?0*(\d+)$/);
  if (idMatch) {
    const num = Number(idMatch[1]);
    if (num > 0) {
      const snap = await db
        .collection("users")
        .where("role", "==", "player")
        .where("playerNumber", "==", num)
        .limit(1)
        .get();
      if (!snap.empty) {
        const d = snap.docs[0];
        return { uid: d.id, ...(d.data() as ProfileData) };
      }
    }
  }

  // Phone: normalise to the 7-digit storage key, then use the phones/{key} index.
  const phoneKey = normalizePhone(cleaned);
  if (phoneKey) {
    const phoneDoc = await db.doc(`phones/${phoneKey}`).get();
    if (phoneDoc.exists) {
      const uid = String(phoneDoc.data()?.uid ?? "");
      if (uid) {
        const userSnap = await db.doc(`users/${uid}`).get();
        if (userSnap.exists) {
          const data = userSnap.data() as ProfileData;
          if (data.role === "player") return { uid, ...data };
        }
      }
    }
  }

  return null;
}

/** Admin may act on any customer account (no agent-tree restriction). */
async function getCustomerPlayer(customerId: string): Promise<ProfileData> {
  const snap = await db.doc(`users/${customerId}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Customer not found.");
  const customer = snap.data() as ProfileData;
  if (customer.role !== "player") {
    throw new HttpsError("invalid-argument", "Cash operations apply to customer accounts only.");
  }
  return customer;
}

function customerPlayerId(customer: ProfileData, customerId: string): string {
  return customer.playerNumber && customer.playerNumber > 0
    ? formatPlayerId(customer.playerNumber)
    : customerId.slice(0, 8).toUpperCase();
}

/**
 * The customer must authorise every cash move with a fresh Africell OTP sent to
 * THEIR phone. We verify before touching wallets; the code is consumed only once
 * the money op has committed, so a failed transaction lets them retry the code.
 */
async function requireCustomerOtp(customer: ProfileData): Promise<string> {
  const phone = String(customer.phone ?? "").trim();
  if (!phone) {
    throw new HttpsError(
      "failed-precondition",
      "Customer has no phone number on file — cannot send an authorisation code.",
    );
  }
  await requireOtpVerifiedForPhone(phone);
  return phone;
}

/** Shared: OTP-authorised cash credit into a customer wallet (agent + admin). */
async function doCashDeposit(opts: {
  actorUid: string;
  actorName: string;
  customerId: string;
  customer: ProfileData;
  amount: number;
}): Promise<{ ok: true; playerId: string; amount: number }> {
  const { actorUid, actorName, customerId, customer, amount } = opts;
  if (!customerId || !Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError("invalid-argument", "customerId and a positive amount are required.");
  }
  const phone = await requireCustomerOtp(customer);
  const playerId = customerPlayerId(customer, customerId);

  await db.runTransaction(async (tx) => {
    const customerWallet = await walletRead(tx, customerId);
    walletWrite(tx, customerWallet, {
      uid: customerId,
      amount,
      type: "deposit",
      description: `Cash deposit at ${actorName}`,
      meta: { otcCash: true, agentId: actorUid, agentName: actorName, playerId },
      ignoreFrozen: true,
    });
    bumpDailyStats(tx, todayIso(), { deposits: amount });
    bumpPlatformStats(tx, { totalDeposits: amount });
    for (const agentId of customer.ancestors ?? []) {
      tx.set(
        db.doc(`users/${agentId}`),
        { stats: { customerDeposits: FieldValue.increment(amount) } },
        { merge: true },
      );
    }
  });

  await consumeOtpVerifiedForPhone(phone).catch(() => undefined);
  return { ok: true, playerId, amount };
}

/** Shared: OTP-authorised cash payout (debit) from a customer wallet (agent + admin). */
async function doCashWithdraw(opts: {
  actorUid: string;
  actorName: string;
  customerId: string;
  customer: ProfileData;
  amount: number;
}): Promise<{
  ok: true;
  withdrawalCode: string;
  playerId: string;
  amount: number;
  customerName: string;
}> {
  const { actorUid, actorName, customerId, customer, amount } = opts;
  if (!customerId || !Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError("invalid-argument", "customerId and a positive amount are required.");
  }
  const phone = await requireCustomerOtp(customer);
  const playerId = customerPlayerId(customer, customerId);
  const withdrawalCode = `${playerId}-${withdrawalToken()}`;
  const codeRef = db.collection("agentWithdrawalCodes").doc();

  await db.runTransaction(async (tx) => {
    const customerWallet = await walletRead(tx, customerId);
    if (customerWallet.balance < amount) {
      throw new HttpsError("failed-precondition", "Customer balance is too low for this withdrawal.");
    }
    walletWrite(tx, customerWallet, {
      uid: customerId,
      amount: -amount,
      type: "withdrawal",
      description: `Cash withdrawal at ${actorName}`,
      meta: { otcCash: true, agentId: actorUid, agentName: actorName, withdrawalCode, playerId },
    });
    tx.set(codeRef, {
      code: withdrawalCode,
      customerId,
      customerName: customer.name,
      playerId,
      agentId: actorUid,
      agentName: actorName,
      amount,
      status: "completed",
      createdAt: FieldValue.serverTimestamp(),
    });
    bumpDailyStats(tx, todayIso(), { withdrawals: amount });
    bumpPlatformStats(tx, { totalWithdrawals: amount });
  });

  await consumeOtpVerifiedForPhone(phone).catch(() => undefined);
  return { ok: true, withdrawalCode, playerId, amount, customerName: customer.name };
}

/** Admin enables OTC cash deposit/withdraw at an agent shop (special cases only). */
export const adminSetAgentCashOps = onCall(async (req) => {
  await requireRole(req, ["admin"]);
  const uid = String(req.data?.uid ?? "");
  const enabled = Boolean(req.data?.enabled);
  if (!uid) throw new HttpsError("invalid-argument", "uid is required.");

  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "User not found.");
  const profile = snap.data() as ProfileData;
  if (!isAgentRole(profile.role)) {
    throw new HttpsError("invalid-argument", "Cash desk can only be enabled for agents.");
  }

  await db.doc(`users/${uid}`).set({ cashOpsEnabled: enabled }, { merge: true });
  return { ok: true, uid, cashOpsEnabled: enabled };
});

/** Agent receives physical cash and credits the customer wallet (OTP-authorised, no float debit). */
export const agentOtcCashDeposit = onCall(async (req) => {
  const { uid, profile } = await requireRole(req, ["agent"]);
  await requireAgentCashOps(uid);
  const customerId = String(req.data?.customerId ?? "");
  const amount = round2(Number(req.data?.amount));
  const customer = await getCustomerPlayer(customerId);
  return doCashDeposit({ actorUid: uid, actorName: profile.name, customerId, customer, amount });
});

/** Agent pays physical cash — OTP-authorised debit + office withdrawal code. */
export const agentOtcCashWithdraw = onCall(async (req) => {
  const { uid, profile } = await requireRole(req, ["agent"]);
  await requireAgentCashOps(uid);
  const customerId = String(req.data?.customerId ?? "");
  const amount = round2(Number(req.data?.amount));
  const customer = await getCustomerPlayer(customerId);
  return doCashWithdraw({ actorUid: uid, actorName: profile.name, customerId, customer, amount });
});

/**
 * Cash-desk agent looks up ANY customer by Player ID or phone so they can serve
 * walk-ins who are not in their own network. Gated by the admin-controlled cash
 * desk; the actual money move still needs the customer's OTP.
 */
export const agentLookupCustomer = onCall(async (req) => {
  const { uid } = await requireRole(req, ["agent"]);
  await requireAgentCashOps(uid);
  const q = String(req.data?.query ?? "").trim();
  if (!q) throw new HttpsError("invalid-argument", "Enter a Player ID or phone number.");

  const customer = await findCustomerByIdOrPhone(q);
  if (!customer) {
    throw new HttpsError("not-found", "No customer found with that Player ID or phone.");
  }

  const walletSnap = await db.doc(`wallets/${customer.uid}`).get();
  const balance = walletSnap.exists ? round2(Number(walletSnap.data()?.balance ?? 0)) : 0;

  return {
    uid: customer.uid,
    name: customer.name ?? "",
    phone: customer.phone ?? "",
    playerNumber: customer.playerNumber ?? null,
    playerId: customerPlayerId(customer, customer.uid),
    balance,
  };
});

/** Admin credits any customer's wallet against cash received (OTP-authorised). */
export const adminOtcCashDeposit = onCall(async (req) => {
  const { uid, profile } = await requireRole(req, ["admin"]);
  const customerId = String(req.data?.customerId ?? "");
  const amount = round2(Number(req.data?.amount));
  const customer = await getCustomerPlayer(customerId);
  return doCashDeposit({ actorUid: uid, actorName: profile.name, customerId, customer, amount });
});

/** Admin pays any customer cash — OTP-authorised debit + office withdrawal code. */
export const adminOtcCashWithdraw = onCall(async (req) => {
  const { uid, profile } = await requireRole(req, ["admin"]);
  const customerId = String(req.data?.customerId ?? "");
  const amount = round2(Number(req.data?.amount));
  const customer = await getCustomerPlayer(customerId);
  return doCashWithdraw({ actorUid: uid, actorName: profile.name, customerId, customer, amount });
});
```

### `adminAdjustWallet` + `adminFreezeWallet` (from `functions/src/admin.ts`)

```typescript
/** Credit or debit any wallet with a mandatory, audited reason. */
export const adminAdjustWallet = onCall(async (req) => {
  const { uid: adminUid } = await requireRole(req, ["admin"]);
  const uid = String(req.data?.uid ?? "");
  const amount = round2(Number(req.data?.amount));
  const reason = String(req.data?.reason ?? "").trim();
  if (!uid || !Number.isFinite(amount) || amount === 0) {
    throw new HttpsError("invalid-argument", "uid and a non-zero amount are required.");
  }
  if (!reason) throw new HttpsError("invalid-argument", "A reason is mandatory.");

  let newBalance = 0;
  await db.runTransaction(async (tx) => {
    const wallet = await walletRead(tx, uid);
    newBalance = walletWrite(tx, wallet, {
      uid,
      amount,
      type: amount > 0 ? "deposit" : "withdrawal",
      description: `Admin adjustment: ${reason}`,
      meta: { adjustedBy: adminUid, reason },
      ignoreFrozen: true,
    });
  });
  return { newBalance };
});

/** Freeze/unfreeze: frozen wallets cannot bet or withdraw; refunds still land. */
export const adminFreezeWallet = onCall(async (req) => {
  await requireRole(req, ["admin"]);
  const uid = String(req.data?.uid ?? "");
  const frozen = Boolean(req.data?.frozen);
  if (!uid) throw new HttpsError("invalid-argument", "uid is required.");
  await db.doc(`wallets/${uid}`).set(
    { frozen, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { ok: true };
});
```

---

## Layer 2 — Client API wrappers (`lib/api.ts`)

Typed `httpsCallable` bindings (region `us-central1`):

```typescript
export const agentOtcCashDeposit = call<
  { customerId: string; amount: number },
  { ok: true; playerId: string; amount: number }
>("agentOtcCashDeposit");

export const agentOtcCashWithdraw = call<
  { customerId: string; amount: number },
  {
    ok: true;
    withdrawalCode: string;
    playerId: string;
    amount: number;
    customerName: string;
  }
>("agentOtcCashWithdraw");

export const agentLookupCustomer = call<
  { query: string },
  {
    uid: string;
    name: string;
    phone: string;
    playerNumber: number | null;
    playerId: string;
    balance: number;
  }
>("agentLookupCustomer");

export const adminOtcCashDeposit = call<
  { customerId: string; amount: number },
  { ok: true; playerId: string; amount: number }
>("adminOtcCashDeposit");

export const adminOtcCashWithdraw = call<
  { customerId: string; amount: number },
  {
    ok: true;
    withdrawalCode: string;
    playerId: string;
    amount: number;
    customerName: string;
  }
>("adminOtcCashWithdraw");

export const adminSetAgentCashOps = call<
  { uid: string; enabled: boolean },
  { ok: true; uid: string; cashOpsEnabled: boolean }
>("adminSetAgentCashOps");

// ---------- admin ----------

export const adminCreateUser = call<
  {
    role: Role;
    name: string;
    email?: string;
    phone?: string;
    username?: string;
    /** Agent signup link: first name only (short) or full name. */
    linkMode?: "first" | "full";
    password: string;
    parentId?: string | null;
  },
  { uid: string; slug?: string }
>("adminCreateUser");

export const adminSetUserStatus = call<
  { uid: string; status: "active" | "suspended" },
  { ok: true }
>("adminSetUserStatus");

export const adminAdjustWallet = call<
  { uid: string; amount: number; reason: string },
  { newBalance: number }
>("adminAdjustWallet");

export const adminFreezeWallet = call<
  { uid: string; frozen: boolean },
  { ok: true }
>("adminFreezeWallet");
```

---

## Layer 3 — Frontend UI

### Full `components/agent/AgentCashDesk.tsx`

```tsx
"use client";

import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { Banknote, HandCoins, Search } from "lucide-react";
import {
  agentOtcCashDeposit,
  agentOtcCashWithdraw,
  agentLookupCustomer,
  adminOtcCashDeposit,
  adminOtcCashWithdraw,
  errorMessage,
} from "@/lib/api";
import { formatPlayerId, playerDisplayId } from "@/lib/playerId";
import { formatXof } from "@/lib/format";
import { CustomerOtpGate } from "@/components/shared/CustomerOtpGate";
import type { UserProfile } from "@/lib/types";
import { Button, Card, Input, Modal } from "@/components/ui";

type PlayerRow = UserProfile & { balance?: number };

type Props = {
  cashOpsEnabled: boolean;
  customer: PlayerRow;
  onClose: () => void;
  mode: "deposit" | "withdraw";
  /** Admin acts on any customer via the admin callables (no cash-desk gate). */
  isAdmin?: boolean;
};

export function AgentCashDeskModal({ cashOpsEnabled, customer, onClose, mode, isAdmin }: Props) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [withdrawalCode, setWithdrawalCode] = useState<string | null>(null);

  const playerId = playerDisplayId(customer);
  const officeId = customer.playerNumber ? formatPlayerId(customer.playerNumber) : null;

  async function submit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a valid amount.");
    if (!isAdmin && !cashOpsEnabled) {
      return toast.error("Cash desk is not enabled. Ask admin to turn it on.");
    }
    if (!verified) {
      return toast.error("Get the customer's code and verify it first.");
    }

    setBusy(true);
    try {
      if (mode === "deposit") {
        const depositFn = isAdmin ? adminOtcCashDeposit : agentOtcCashDeposit;
        await depositFn({ customerId: customer.uid, amount: amt });
        toast.success(`Cash deposit ${formatXof(amt)} credited to ${customer.name}.`);
        onClose();
      } else {
        if (amt > (customer.balance ?? 0)) {
          return toast.error("Customer balance is too low.");
        }
        const withdrawFn = isAdmin ? adminOtcCashWithdraw : agentOtcCashWithdraw;
        const res = await withdrawFn({ customerId: customer.uid, amount: amt });
        setWithdrawalCode(res.withdrawalCode);
        toast.success("Cash withdrawal recorded.");
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "deposit" ? `Credit (cash) — ${customer.name}` : `Withdraw — ${customer.name}`}
    >
      <div className="space-y-4">
        {officeId ? (
          <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
            Player ID: <span className="font-mono font-semibold">{officeId}</span>
          </p>
        ) : (
          <p className="text-sm text-slate-400">Player ID: {playerId}</p>
        )}

        {withdrawalCode ? (
          <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-200">
              Withdrawal code — give to customer
            </p>
            <p className="font-mono text-2xl font-bold tracking-wide text-white">{withdrawalCode}</p>
            <p className="text-sm text-slate-300">
              {formatXof(Number(amount))} paid in cash to {customer.name}
            </p>
            <p className="text-xs text-slate-500">
              Keep this code for your office records. It includes the customer Player ID.
            </p>
            <Button className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-400">
              {mode === "deposit" ? (
                <>
                  Customer gave you physical cash — this credits their wallet directly (does not use
                  your commission balance).
                </>
              ) : (
                <>
                  Pay the customer cash from the shop — their wallet is debited and you receive a
                  withdrawal code with their Player ID.
                </>
              )}
            </p>
            <p className="text-sm text-slate-500">
              Balance: {customer.balance === undefined ? "—" : formatXof(customer.balance)}
            </p>
            <Input
              label="Amount (GMD)"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <CustomerOtpGate
              phone={customer.phone}
              customerName={customer.name}
              verified={verified}
              onVerified={() => setVerified(true)}
            />
            <Button
              className="w-full"
              onClick={() => void submit()}
              disabled={busy || !verified}
            >
              {busy
                ? "Processing…"
                : mode === "deposit"
                  ? "Credit wallet (cash)"
                  : "Pay cash & get code"}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}

type RowActionsProps = {
  customer: PlayerRow;
  cashOpsEnabled: boolean;
  onFloatDeposit: () => void;
  /** Admin sees cash actions for any customer, no cash-desk gate. */
  isAdmin?: boolean;
};

export function AgentCustomerCashActions({
  customer,
  cashOpsEnabled,
  onFloatDeposit,
  isAdmin,
}: RowActionsProps) {
  const [cashMode, setCashMode] = useState<"deposit" | "withdraw" | null>(null);
  const showCash = isAdmin || cashOpsEnabled;

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="secondary"
          className="!px-2.5 !py-1 text-xs"
          onClick={onFloatDeposit}
          title="Credit customer from your own agent balance"
        >
          <span className="flex items-center gap-1">
            <Banknote size={13} /> Credit (balance)
          </span>
        </Button>
        {showCash ? (
          <>
            <Button
              variant="secondary"
              className="!px-2.5 !py-1 text-xs text-emerald-200"
              onClick={() => setCashMode("deposit")}
              title="Customer paid physical cash — credit their wallet"
            >
              <span className="flex items-center gap-1">
                <Banknote size={13} /> Credit (cash)
              </span>
            </Button>
            <Button
              variant="secondary"
              className="!px-2.5 !py-1 text-xs text-amber-200"
              onClick={() => setCashMode("withdraw")}
              title="Pay customer cash — generates withdrawal code"
            >
              <span className="flex items-center gap-1">
                <HandCoins size={13} /> Withdraw
              </span>
            </Button>
          </>
        ) : null}
      </div>
      {cashMode ? (
        <AgentCashDeskModal
          cashOpsEnabled={cashOpsEnabled}
          isAdmin={isAdmin}
          customer={customer}
          mode={cashMode}
          onClose={() => setCashMode(null)}
        />
      ) : null}
    </>
  );
}

/**
 * Cash-desk agents can serve ANY customer — including people who opened their own
 * account and are not in the agent's network. Look them up by Player ID or phone,
 * then Credit (cash) / Withdraw. Only rendered when the agent's cash desk is on.
 */
export function AgentServeAnyCustomer({ cashOpsEnabled }: { cashOpsEnabled: boolean }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlayerRow | null>(null);
  const [mode, setMode] = useState<"deposit" | "withdraw" | null>(null);

  async function find(e?: FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return toast.error("Enter a Player ID or phone number.");
    setBusy(true);
    try {
      const c = await agentLookupCustomer({ query: q });
      // Only the fields AgentCashDeskModal needs; cast through unknown to satisfy PlayerRow.
      setResult({
        uid: c.uid,
        name: c.name,
        phone: c.phone,
        playerNumber: c.playerNumber ?? undefined,
        balance: c.balance,
        role: "player",
        status: "active",
      } as unknown as PlayerRow);
    } catch (err) {
      setResult(null);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!cashOpsEnabled) return null;

  return (
    <Card className="mb-5 p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
        <Search size={15} /> Serve any customer (not only yours)
      </div>
      <p className="mb-3 text-xs text-slate-400">
        Credit or pay out a customer who opened their own account. Enter their Player ID (e.g.
        BTE-00042) or phone number.
      </p>
      <form onSubmit={find} className="flex gap-2">
        <Input
          placeholder="Player ID or phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Finding…" : "Find"}
        </Button>
      </form>

      {result ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5">
          <div className="text-sm">
            <span className="font-mono font-semibold text-emerald-300">
              {playerDisplayId(result)}
            </span>{" "}
            <span className="font-medium">{result.name}</span>
            <span className="text-slate-400">
              {" "}
              · {result.phone || "no phone"} · Balance{" "}
              {result.balance === undefined ? "—" : formatXof(result.balance)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="!px-2.5 !py-1 text-xs text-emerald-200"
              onClick={() => setMode("deposit")}
            >
              <span className="flex items-center gap-1">
                <Banknote size={13} /> Credit (cash)
              </span>
            </Button>
            <Button
              variant="secondary"
              className="!px-2.5 !py-1 text-xs text-amber-200"
              onClick={() => setMode("withdraw")}
            >
              <span className="flex items-center gap-1">
                <HandCoins size={13} /> Withdraw
              </span>
            </Button>
          </div>
        </div>
      ) : null}

      {mode && result ? (
        <AgentCashDeskModal
          cashOpsEnabled={cashOpsEnabled}
          customer={result}
          mode={mode}
          onClose={() => {
            setMode(null);
            void find();
          }}
        />
      ) : null}
    </Card>
  );
}
```

### Full `components/shared/CustomerOtpGate.tsx`

```tsx
"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { ShieldCheck, Send } from "lucide-react";
import { sendSignupOtp, verifySignupOtp } from "@/lib/otpClient";
import { Button, Input } from "@/components/ui";

type Props = {
  /** Customer's registered phone — the code is sent here. */
  phone?: string | null;
  customerName: string;
  verified: boolean;
  onVerified: () => void;
};

/**
 * Customer authorisation gate: sends a one-time Africell code to the customer's
 * phone, the staff enters what the customer reads back, and only a verified code
 * unlocks the wallet action. Server re-checks the code, so this is not the only
 * guard — it also drives the UX.
 */
export function CustomerOtpGate({ phone, customerName, verified, onVerified }: Props) {
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");

  const cleanPhone = (phone ?? "").trim();

  async function send() {
    if (!cleanPhone) return toast.error("Customer has no phone number on file.");
    setSending(true);
    try {
      const res = await sendSignupOtp(cleanPhone);
      if (!res.ok) return toast.error(res.error || "Could not send the code. Try again.");
      setSent(true);
      toast.success(`Code sent to ${customerName || "the customer"}'s phone.`);
    } finally {
      setSending(false);
    }
  }

  async function verify() {
    if (code.trim().length < 4) return toast.error("Enter the code the customer received.");
    setVerifying(true);
    try {
      const res = await verifySignupOtp(cleanPhone, code.trim());
      if (!res.ok) return toast.error(res.error || "Invalid code.");
      toast.success("Customer authorised.");
      onVerified();
    } finally {
      setVerifying(false);
    }
  }

  if (verified) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
        <ShieldCheck size={16} /> Customer authorised by OTP.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-sky-500/25 bg-sky-500/5 p-3">
      <p className="text-xs text-slate-300">
        The customer must approve this with a one-time code sent to their phone
        {cleanPhone ? (
          <>
            {" "}
            (<span className="font-mono">{cleanPhone}</span>)
          </>
        ) : null}
        .
      </p>
      {!sent ? (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => void send()}
          disabled={sending || !cleanPhone}
        >
          <span className="flex items-center justify-center gap-1.5">
            <Send size={14} /> {sending ? "Sending…" : "Send code to customer"}
          </span>
        </Button>
      ) : (
        <div className="space-y-2">
          <Input
            label="Code from customer"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => void verify()} disabled={verifying}>
              {verifying ? "Checking…" : "Verify code"}
            </Button>
            <Button variant="secondary" onClick={() => void send()} disabled={sending}>
              {sending ? "…" : "Resend"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Full `app/admin/wallets/page.tsx`

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { Search, Snowflake, Banknote, HandCoins } from "lucide-react";
import { db } from "@/lib/firestore";
import { adminAdjustWallet, adminFreezeWallet, errorMessage } from "@/lib/api";
import { formatXof, normalizePhone } from "@/lib/format";
import type { UserProfile, Wallet } from "@/lib/types";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  Spinner,
  TableShell,
  Td,
  Th,
} from "@/components/ui";

type Row = UserProfile & { wallet?: Wallet };

export default function AdminWalletsPage() {
  const [users, setUsers] = useState<UserProfile[] | null>(null);
  const [wallets, setWallets] = useState<Record<string, Wallet>>({});
  const [search, setSearch] = useState("");

  const [adjustTarget, setAdjustTarget] = useState<Row | null>(null);
  const [adjustMode, setAdjustMode] = useState<"credit" | "withdraw">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(500));
    const unsubUsers = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile));
    });
    const unsubWallets = onSnapshot(collection(db, "wallets"), (snap) => {
      const map: Record<string, Wallet> = {};
      snap.docs.forEach((d) => (map[d.id] = d.data() as Wallet));
      setWallets(map);
    });
    return () => {
      unsubUsers();
      unsubWallets();
    };
  }, []);

  const rows: Row[] | null = useMemo(() => {
    if (!users) return null;
    let list = users
      .filter((u) => u.role !== "admin")
      .map((u) => ({ ...u, wallet: wallets[u.uid] }));
    const s = search.trim().toLowerCase();
    if (s) {
      list = list.filter(
        (u) =>
          u.name?.toLowerCase().includes(s) ||
          u.email?.toLowerCase().includes(s) ||
          u.agentSlug?.toLowerCase().includes(s) ||
          u.phone?.includes(normalizePhone(s) || s)
      );
    }
    return list;
  }, [users, wallets, search]);

  function openAdjust(row: Row, mode: "credit" | "withdraw") {
    setAdjustMode(mode);
    setAmount("");
    setReason("");
    setAdjustTarget(row);
  }

  async function adjust() {
    if (!adjustTarget) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0)
      return toast.error("Enter an amount greater than zero.");
    if (adjustMode === "withdraw" && amt > (adjustTarget.wallet?.balance ?? 0))
      return toast.error("Amount is more than the wallet balance.");
    if (!reason.trim()) return toast.error("A reason is mandatory — it goes in the audit log.");
    setBusy(true);
    try {
      const signed = adjustMode === "withdraw" ? -amt : amt;
      const res = await adminAdjustWallet({
        uid: adjustTarget.uid,
        amount: signed,
        reason: reason.trim(),
      });
      toast.success(
        `${adjustMode === "withdraw" ? "Withdrew" : "Credited"} ${formatXof(amt)}. New balance: ${formatXof(res.newBalance)}.`,
      );
      setAdjustTarget(null);
      setAmount("");
      setReason("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleFreeze(row: Row) {
    setBusy(true);
    try {
      await adminFreezeWallet({ uid: row.uid, frozen: !row.wallet?.frozen });
      toast.success(`${row.name}'s wallet ${row.wallet?.frozen ? "unfrozen" : "frozen"}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold">Wallets</h1>
        <p className="text-sm text-slate-400">
          <strong>Credit</strong> (add money) or <strong>Withdraw</strong> (take money) on any
          wallet — each needs a mandatory, logged reason. You can also freeze a wallet; frozen
          wallets cannot bet or withdraw.
        </p>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
        <Input
          placeholder="Search name, phone, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState message="No users match." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Balance</Th>
              <Th>Wallet</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.uid}>
                <Td className="font-medium">{r.name}</Td>
                <Td>
                  <Badge value={r.role} />
                </Td>
                <Td className="font-semibold tabular-nums">
                  {r.wallet ? formatXof(r.wallet.balance) : "—"}
                </Td>
                <Td>
                  <Badge value={r.wallet?.frozen ? "suspended" : "active"} />
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      className="!px-2.5 !py-1 text-xs text-emerald-200"
                      onClick={() => openAdjust(r, "credit")}
                      title="Add money to this wallet"
                    >
                      <span className="flex items-center gap-1">
                        <Banknote size={13} /> Credit
                      </span>
                    </Button>
                    <Button
                      variant="secondary"
                      className="!px-2.5 !py-1 text-xs text-amber-200"
                      onClick={() => openAdjust(r, "withdraw")}
                      title="Take money from this wallet"
                    >
                      <span className="flex items-center gap-1">
                        <HandCoins size={13} /> Withdraw
                      </span>
                    </Button>
                    <Button
                      variant={r.wallet?.frozen ? "secondary" : "danger"}
                      className="!px-2.5 !py-1 text-xs"
                      disabled={busy}
                      onClick={() => toggleFreeze(r)}
                    >
                      <span className="flex items-center gap-1">
                        <Snowflake size={13} /> {r.wallet?.frozen ? "Unfreeze" : "Freeze"}
                      </span>
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <Modal
        open={!!adjustTarget}
        onClose={() => setAdjustTarget(null)}
        title={`${adjustMode === "credit" ? "Credit" : "Withdraw from"} ${adjustTarget?.name ?? ""}'s wallet`}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Current balance:{" "}
            <strong>{adjustTarget?.wallet ? formatXof(adjustTarget.wallet.balance) : "—"}</strong>.{" "}
            {adjustMode === "credit"
              ? "This amount will be added to the wallet."
              : "This amount will be taken from the wallet."}
          </p>
          <Input
            label="Amount (GMD)"
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input
            label="Reason (required, audited)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button className="w-full" onClick={adjust} disabled={busy}>
            {busy
              ? "Working…"
              : adjustMode === "credit"
                ? "Credit wallet"
                : "Withdraw from wallet"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
```

---

## Flow summary

### Agent / Admin OTC Credit (cash)

1. Staff opens **Credit (cash)** on a customer (or Find via Serve any customer).
2. `CustomerOtpGate` -> `sendSignupOtp` / `verifySignupOtp` to customer phone.
3. Callable `agentOtcCashDeposit` or `adminOtcCashDeposit`.
4. Server re-checks OTP (`requireOtpVerifiedForPhone`), credits wallet, consumes OTP.

### Agent / Admin OTC Withdraw (cash)

1. Same OTP gate.
2. Callable `agentOtcCashWithdraw` / `adminOtcCashWithdraw`.
3. Debits wallet, creates `agentWithdrawalCodes` doc, returns `withdrawalCode` (includes Player ID).

### Admin All Wallets Credit / Withdraw

1. `app/admin/wallets/page.tsx` -> amount + mandatory reason.
2. `adminAdjustWallet` with signed amount (positive credit / negative withdraw).
3. No customer OTP - audited reason only.

---

*Generated from repo at `ffb8617`. Re-run `python scripts/_build_pay_withdraw_doc.py` if these files change.*
