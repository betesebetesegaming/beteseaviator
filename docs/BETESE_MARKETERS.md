# Betese Marketers (`/m`)

Separate staff app for marketers, running on the shared Betese Aviator backend (Firebase project
`beteseaviator-a05ae`). Phase 1, from `CLAUDE_HANDOFF.md` (Betese Marketers package, 20 Oct 2026).

## What it does

- **Roles**: the owner is the existing `admin`. Marketers have a new `marketer` role: no wallet, no referral slug, no
  commissions. They sign in at `/s` with their name (e.g. `ebrimajallow`) or phone plus a password of 10+ characters,
  and land on `/m`. Disable and password reset end their sessions immediately (checked on every request).
- **Customers**: one record per canonical Gambian phone (`functions/src/phone.ts`, Gambia9-aware), Football / Aviator /
  both, adult confirmation, SMS consent with wording version and revocation history. The first marketer to record a
  number keeps it; a duplicate shows no details of the other marketer.
- **Verification (Aviator, read-only)**: phone → `phones/` index → `users/` player → registration time. Registered after
  the referral (or within the owner's referral window, default 24 h before) → new signup, counted. Older accounts →
  owner decision in Owner → Disputes, with audit. Not found / ambiguous / timeout stay unverified.
- **Deposits (Aviator, read-only)**: completed `transactions` with `type == "deposit"`, excluding demo resets, repairs and
  QTech test funding. Stored once each in `mkDeposits` as integer bututs + currency. First deposit vs later, reversals
  kept apart, GMD only. Daily sync at 03:00 Banjul, plus Owner → Links & settings → Sync now.
- **Dashboard**: per product verified customers and deposits, unique total, played-both; today / week / month / custom
  (deposit timestamps); owner sees overall + per marketer.
- **Invite**: copy/open buttons for the owner-approved links (default `https://beteseaviator.com/`,
  `https://betesegaming.com/`). No tracking, no SMS, no account creation.
- **Campaigns**: marketer requests (template or "owner writes it") + approved link + own consenting customers. Each
  revision freezes message, link, sender, schedule, recipient list (hash), segments and estimated cost. Owner revisions
  create a new revision; approval re-checks consent, ownership, product and link, and invalidates rather than approving
  a changed list. Approved revisions cannot change. **There is no send action.**

## Code

| Area | Files |
|------|-------|
| Callable `marketers` + schedule `marketersDailySync` | `functions/src/marketers/index.ts` |
| Service (authorization, workflows) | `functions/src/marketers/service.ts` |
| Pure rules (phone, links, SMS segments, attribution, ranges) | `functions/src/marketers/domain.ts` |
| Aviator adapter (read-only) / Football placeholder | `functions/src/marketers/providers.ts` |
| Storage interface | `functions/src/marketers/store.ts` |
| UI | `app/m/`, `components/marketers/`, `lib/marketersApi.ts` |
| Data | `mkContacts`, `mkConsentEvents`, `mkProductAccounts`, `mkDeposits`, `mkCampaignRevisions`, `mkTemplates`, `mkSettings`, `mkAudit` — no client access in `firestore.rules`; indexes in `firestore.indexes.json` |

Touched outside the new module: `marketer` role (types, roles, `resolveStaffSession`, `/s` → `/m` routing), `m` reserved
as a path/slug, and agent login sync no longer overwrites a marketer's sign-in key.

## Tests

```bash
cd functions; npm test
```

22 tests against an in-memory store with the same contract as Firestore: marketer isolation (including direct
calls), owner-only actions, session ending, phone collisions, attribution/disputes, duplicate deposits, first deposit,
reversals and currencies, ledger filtering, campaign approval/revision/invalidation/tamper, link policy, SMS segments,
date ranges. Not covered: the Firestore emulator (needs Java, not installed here) and a live Aviator data test.

## Deploy (not done)

```bash
npx firebase-tools@latest deploy --only firestore:rules,firestore:indexes
cd functions; npm run build; cd ..
npx firebase-tools@latest deploy --only functions:marketers,functions:marketersDailySync
```

Deploy indexes first and wait for them to finish building. The frontend ships with the normal Vercel deploy; push the
branch for a preview URL. The callable must be deployed for `/m` to load data.

## Blockers

- **Football (betesegaming.com)**: no backend, API docs or credentials found. Needed: account-by-phone lookup with
  registration time, settled deposits/reversals per account with cursor, read-only server credentials, webhook signing
  secret or agreed sync window.
- **SMS sending**: needs a provider with per-message delivery reports, signed webhooks, idempotency keys, approved sender
  ID, price per segment, and opt-out handling. The current promo path (`promoSms.ts` → betesepmu `sendOtp`) has none of
  these.
- **Per-marketer referral links**: not built. Needs signed opaque referral IDs integrated into each signup flow.
