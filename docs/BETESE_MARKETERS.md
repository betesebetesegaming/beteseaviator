# Betese Marketers (`/staff/marketers`)

Separate staff app for marketers on the shared Betese Aviator backend (Firebase project `beteseaviator-a05ae`).
Branch `feat/betese-marketers`. **Nothing here is deployed.** SMS sending does not exist in this code.

## Route

`/staff/marketers` — two path segments on purpose. The middleware only treats single-segment paths
(`beteseaviator.com/<slug>`) as agent referral links, so this route can never collide with an agent link and **no slug
is reserved**. (`/staff` on its own still redirects to `/s` exactly as before.) An earlier draft used `/m` and reserved
`m`; that was removed.

## Roles and sign-in

- Owner = existing `admin`. New role `marketer`: no wallet, no referral slug, no commissions.
- Marketers sign in at `/s` with their name key (e.g. `ebrimajallow`) or phone + a 10–64 character password that is not
  only digits. Login goes through the existing `agentLogin` → Firebase Auth path.
- Every `marketers` call reloads the caller's profile: suspended accounts and sessions older than a disable/password
  reset are rejected immediately.

## Customer attribution (owner rule)

- **Automatic** only when the Aviator account was registered **after** the marketer recorded the number. Marketers are
  told to record the number first, then share the link.
- **Owner review** for every registration before the recording (or with no registration time). Nothing is counted or
  earned until the owner decides, with a required reason in the audit trail:
  - *Credit from registration* — the marketer signed them up (first deposit counts);
  - *Credit from recording only* — an existing customer they reactivated (only later deposits count);
  - *Do not credit*.
- **Review hint window** (default 24 h, owner setting): labels a registration "registered shortly before recording" in
  the review list. It never credits anything by itself.

## My Business & Earnings

Bookkeeping only — separate collections, never wallets, the ledger or agent commissions. **No default rates**: every
amount and percentage is entered by the owner.

| Piece | Who | Rule |
|---|---|---|
| Targets | Marketer proposes (measure, product, threshold, dates) | Owner approves with a bonus amount (0 allowed) or rejects. Approved targets are frozen. Progress is live. |
| Payment agreement | Owner drafts and approves → **marketer accepts** → active | Statuses `draft → awaiting_acceptance → active → ended` (or `declined` / `withdrawn`). The marketer accepts against a hash of the exact terms. Earning starts at max(start date, acceptance). Accepting a new version ends the previous one at that moment; old versions and their earnings are kept unchanged. Marketers never see drafts. |
| Target + commission | Term (from an application/proposal or the owner) | Weekly (Mon–Sun) or monthly; customer target and/or qualifying-deposit target; rate 5–15% if met and an explicit owner-set rate (0% up to the agreed rate) if missed; owner-set number of days a customer's deposits qualify after joining. Products are paid on separate lines; the target is judged on their total. Open periods pay the missed rate until the target is reached. Owner tiers cap the rate. |
| Fixed customer reward | Term | Per counted new customer of a product, on verified signup or on first deposit (optional minimum). |
| Percentage commission | Term (basis points) | Per calendar month on **net** verified deposits (deposits − reversals) of a product; truncated to whole bututs. Open months update while pending. |
| Fixed campaign payment | Term referencing an approved campaign | Earned only after the owner confirms the campaign was completed. |
| Target bonus | Approved target with bonus > 0 | Earned once the period has ended and the target was met. |
| Earnings lines | Engine | `pending → approved → paid` (or `void`). Approved/paid lines never change; later facts (reversals, rejected attribution) create separate **adjustment** lines. Owner voids are respected on recalculation. |
| Payments | Owner records | Records an off-system payment (Wave/cash/bank/other, reference, date) against approved lines. Moves no money. |

### Become a Marketer, invites, requests, disputes

- **Public application** at `/staff/apply` (no sign-in): name, phone, Football/Aviator/both, weekly/monthly, customer
  target, deposit target (GMD), requested commission 5–15%. Shows qualifying conditions and a per-period **estimate**
  (deposit target × requested rate). Limited by owner **commission tiers** (minimum deposit target and optional minimum
  customers → maximum rate); with no tiers configured, proposals still go to review. 5 submissions per IP per hour;
  one pending application per phone; existing marketer phones refused; owner can close applications.
- **Owner review**: sets the final terms (rate, missed-target rate, qualifying days, dates) and a sign-in password;
  approval creates the marketer login and an agreement **awaiting the applicant's acceptance**. Applicants cannot
  approve themselves, activate access or change an approved rate.
- **Propose a new target**: existing marketers send the same proposal; approval creates a new version they must accept.
- **Invite link**: each marketer gets `/staff/apply?invite=<12-char opaque code>` with Copy and Share. The inviter is
  recorded server-side; no phone, name or account id is in the URL. **No recruitment commission.**
- **Customer share link** (Invite tab, marketers only): `beteseaviator.com/join/<first-name>-<4 random>`, e.g.
  `/join/ebrima-7k3m`, with Copy, Share and WhatsApp. It opens a public page "Invited by Ebrima" with buttons to the
  owner-approved sites (Football `https://www.betesegaming.com/`, Aviator `https://beteseaviator.com/`). The page
  shows only the first name; a suspended marketer's link stops naming them; if the server can't be reached the buttons
  still show. The link does **not** prove attribution: the marketer still records the number under Customers.
- **My Approved Target & Commission** card (marketer Home and Business): products, targets, rates, dates, conditions,
  this period's progress and remaining, recent periods met/missed, pending/approved/paid, badges, and any offer waiting
  for acceptance with Accept/Decline.
- **Payment requests**: marketer requests all approved, unrequested lines; owner records the payment (no money moves)
  or rejects; requested lines are locked against double requests.
- **Earnings disputes**: marketer raises one; owner resolves (optionally with a manual adjustment line that still needs
  approval and is never touched by recalculation) or rejects.
- **Badges** (recognition only, from verified records) and an **opt-in leaderboard** (owner switch; first name +
  initial; new verified customers per product this month; no phones, customers or money).

Recalculation runs after the daily sync, after "Sync now", after attribution decisions, agreement approvals and
campaign confirmations, and on the owner's "Recalculate earnings" button.

## Changes to shared Aviator code (everything outside the new module)

| File | Change | Effect on existing users |
|---|---|---|
| `functions/src/roles.ts`, `lib/types.ts`, `lib/roles.ts` | Add `marketer` role + `isMarketerRole`, label "Betese Marketer" | None. `isStaffRole` / `isAgentRole` unchanged. |
| `functions/src/auth.ts` `resolveStaffSession` | Also accepts `marketer` | None for others. |
| `functions/src/auth.ts` `completeRegistration` | Refuses an existing `marketer` profile | None for others. Stops a marketer turning their staff login into a player profile. |
| `functions/src/httpAuth.ts` `requireHttpAuth` | Returns 403 for `marketer` | None for others. Keeps ModemPay deposit/payout routes away from marketer accounts (no wallets). |
| `functions/src/agent.ts` | Agent slug/login sync skips a `staffLogins` key owned by a marketer | Identical unless a marketer already owns that exact key. Adds 1–2 document reads per agent session sync. |
| `functions/src/index.ts` | Exports `marketers`, `marketersDailySync` | Two new Cloud Run services. `marketers` accepts exactly two actions without sign-in (`applicationInfo`, `apply`); every other action is authorized per call. |
| `lib/staff-routes.ts`, `lib/auth-context.tsx` | `marketer` signs in at `/s`, home is `/staff/marketers` | Admin/agent/player routing unchanged; `/admin` still excludes marketers. |
| `firestore.rules` | New `isMarketer()`; marketers cannot create `deposit_requests` / `withdrawal_requests`; 19 `mk*` collections closed to all clients | Players keep both creates; all other rules unchanged. |
| `firestore.indexes.json` | 30 new composite indexes, all on `mk*` collections | None on existing collections. |

Not changed: RTDB rules (marketers are in no read list), storage rules, wallets, ledger, games, payments, commissions,
agent screens, `/s`, middleware, `next.config.ts`.

## Aviator sign-up through a share link

`/join/<slug>` remembers the slug on the device (30 days) and adds `?mk=<slug>` to the Aviator button. Any page
that mounts the auth modal also picks up `?mk=`. Sign-up sends it to `completeRegistration`, which — only for a
brand-new, OTP-verified profile — calls `recordShareLinkSignup`. The server checks the slug against an active link
of an active marketer, then creates the customer record for that marketer (`recordedBy: "share_link"`,
`signup.accountId` = the new uid) and matches it at once as a `new_signup` (`verificationSource: "share_link_signup"`),
so no owner review is needed. The first record of a number always wins; a later link never moves a customer.
No SMS consent is collected this way (`consent.sms = false`), so campaigns exclude these customers. Any failure is
logged and never fails sign-up.

## Football / SMS / OTP specification (docs/BETESE-Football-SMS-OTP-Flow-Spec.pdf, 7 Oct 2026)

What it provides: the OTP rules Football must copy from Aviator (Africell gateway, 6-digit hashed codes, expiry, rate
limits), the Africell HTTP contract and status codes, the PMU relay fallback, registration/reset/withdrawal/agent-cash
flows, recommended Football collections (`otp_codes`, `otp_verified`, `otp_rate_limits`, `deposit_requests`,
`withdrawal_requests`, `agentWithdrawalCodes`, `sms_log`), SMS templates and a go-live checklist. It also flags that
Aviator's public `sendOtp` accepts any `message` + `code` from anyone (open SMS relay).

What it does not provide (still needed to verify Football customers and deposits):
- where the Football backend runs (Firebase project or API base URL) and who controls it;
- an account-by-phone lookup with registration time;
- settled deposits and reversals per account (amounts, currency, timestamps, transaction ids, cursor);
- read-only server-to-server credentials and a webhook secret or agreed sync window.

For SMS it confirms the provider (Africell, sender `Betese`, message id returned) but describes **no delivery reports**,
no signed callbacks and no per-message price — all required before campaign sending.

## Tests

```bash
cd functions; npm test            # 43 unit/acceptance tests, in-memory store
cd functions; npm run test:emulator   # Firestore emulator: real rules + real Firestore store
```

`test:emulator` needs Java 21 and the Firebase CLI on PATH; it uses the offline project `demo-betese-marketers` and
never contacts the live project.

Results on 20 Oct 2026 (Temurin JDK 21.0.12.1, firebase-tools 15.34.0, Node 24.19): **unit 43/43 pass, emulator 8/8 pass** (re-run after the growth features)
(rules: mk* closed to every client; marketer limited to own profile + public docs; marketers cannot create payment
requests while players still can; players/agents/admin regression matrix unchanged. Store: create conflicts, deep merge,
cursors, count/sum, transaction rollback, full service flow on real Firestore).

## Deployment changes (not done — needs owner approval)

1. `firebase deploy --only firestore:indexes` — 30 new indexes on `mk*` collections; wait until all show *Enabled*.
2. `firebase deploy --only firestore:rules` — changes listed above.
3. `cd functions && npm run build`, then `firebase deploy --only functions:marketers,functions:marketersDailySync,functions:resolveStaffSession,functions:completeRegistration,functions:agentLogin,functions:adminCreateUser,functions:modempayApi`
   — the two new functions plus existing functions whose code paths changed (`auth.ts`, `agent.ts`, `httpAuth.ts` are
   bundled into every function, so a full `--only functions` deploy is the simplest correct option).
4. Frontend: merge to `main` → Vercel production deploy. A Vercel preview needs the branch pushed.

Rollback: redeploy `main` for functions and rules; the `mk*` collections can stay (no client access).

## Blockers

- **Football**: backend location, lookup/deposit API or read access, credentials (see above).
- **SMS sending**: provider with delivery reports, signed webhooks, idempotency, approved sender ID, price per segment,
  opt-out handling. Sending stays disabled.
- **Per-marketer referral attribution (Football only)**: Football sign-up is outside this repo and does not record the
  share link yet. Aviator is done (see below).
- **Existing issue (not changed here)**: public `sendOtp` accepts arbitrary `message`/`code`.
