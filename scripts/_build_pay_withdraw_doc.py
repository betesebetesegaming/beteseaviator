#!/usr/bin/env python3
"""One-shot: assemble docs/pay-withdraw-full-code.md from current sources."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (root / rel).read_text(encoding="utf-8")


agent_cash = read("functions/src/agentCashOps.ts")
agent_ui = read("components/agent/AgentCashDesk.tsx")
otp_gate = read("components/shared/CustomerOtpGate.tsx")
wallets = read("app/admin/wallets/page.tsx")

admin_adjust = read("functions/src/admin.ts")
start = admin_adjust.index("/** Credit or debit any wallet")
end = admin_adjust.index("/** Reset a player's sign-in password")
admin_excerpt = admin_adjust[start:end].rstrip() + "\n"

api = read("lib/api.ts")
api_start = api.index("export const agentOtcCashDeposit")
api_end = api.index("export const adminResetPlayerPassword")
api_excerpt = api[api_start:api_end].rstrip() + "\n"

rules = read("firestore.rules")
r_start = rules.index("match /agentWithdrawalCodes")
r_end = rules.index("match /referral_rewards")
rules_excerpt = rules[r_start:r_end].rstrip() + "\n"

parts = []
parts.append(
    """# BETESE Aviator - Admin + Agent Pay (Credit) & Withdraw - Full Code Reference

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
"""
)
parts.append(rules_excerpt)
parts.append(
    """```

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
"""
)
parts.append(agent_cash)
parts.append(
    """```

### `adminAdjustWallet` + `adminFreezeWallet` (from `functions/src/admin.ts`)

```typescript
"""
)
parts.append(admin_excerpt)
parts.append(
    """```

---

## Layer 2 — Client API wrappers (`lib/api.ts`)

Typed `httpsCallable` bindings (region `us-central1`):

```typescript
"""
)
parts.append(api_excerpt)
parts.append(
    """```

---

## Layer 3 — Frontend UI

### Full `components/agent/AgentCashDesk.tsx`

```tsx
"""
)
parts.append(agent_ui)
parts.append(
    """```

### Full `components/shared/CustomerOtpGate.tsx`

```tsx
"""
)
parts.append(otp_gate)
parts.append(
    """```

### Full `app/admin/wallets/page.tsx`

```tsx
"""
)
parts.append(wallets)
parts.append(
    """```

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
"""
)

out = root / "docs" / "pay-withdraw-full-code.md"
out.write_text("".join(parts), encoding="utf-8")
print(f"Wrote {out} ({out.stat().st_size:,} bytes)")
