# Deploy — Smart Bonus: automatic SMS + "gift bonus" wording

Ships two improvements to the existing Smart Bonus engine. The deposit-match
mechanic itself is unchanged and already live — this only adds automatic SMS
delivery and updates the customer-facing wording. Fully additive; no
deposit/withdraw/ModemPay code touched.

## What this ships

1. **Automatic SMS with a tap-through link** — clicking "Send SMS" on an offer now
   texts the customer server-side via the Africell gateway (previously it only
   opened the admin's own SMS app). Every message ends with
   `https://www.beteseaviator.com/play/rewards` so the player taps straight to
   their bonus. New helper `smartBonusNotify.ts` reuses `sendViaAfricell`
   (exported from `routes/otp.ts`).
2. **"Gift bonus — match it — start using it" wording** — the SMS text, the
   customer claim card, the top banner, and the Claude outreach prompt now frame
   the offer as a gift bonus the player claims by matching it with a deposit of
   the same amount (e.g. "GMD 100 gift bonus — match with a GMD 100 deposit,
   play with GMD 200").
3. **Send a bonus to a specific number** — new admin callable
   `adminCreateSmartBonusOffer` + a "Send a bonus to a number" form in
   Admin → Smart Bonus. Type a player number, set bonus + match, hit send: it
   creates the offer, marks it sent, and texts the player immediately — bypassing
   the nightly lapsed-player rules. The bonus activates the normal way when the
   player deposits the matching amount.
4. **Happy Hour broadcast** — new callable `adminStartHappyHour` (queues a
   campaign) + new **scheduled worker** `processHappyHour` (runs every minute,
   rolls the campaign out in batches of 25, claim-locked so runs can't overlap or
   double-send) + a "Happy Hour" form with live progress in Admin → Smart Bonus.
   Fires one fixed bonus to every recently-active player (last 14 days) via in-app
   banner + SMS. Writes to a new `happyHourCampaigns` collection (admin-read; the
   worker writes via the Admin SDK). The `processHappyHour` cron is created
   automatically on the functions deploy.

WhatsApp stays one-tap-from-the-admin's-app (true auto-WhatsApp needs a WhatsApp
Business API account). There is no direct/no-deposit gift — every bonus is
deposit-match.

## Note on git history

An automated commit `f561876` already captured `functions/src/routes/otp.ts`,
`functions/src/smartBonusNotify.ts`, and this file. The remaining changes below
are working-tree modifications. Commit them and push together — the net result
is the match + auto-SMS + wording described here.

## Files

```
 M app/admin/smart-bonus/page.tsx        # "Send SMS" = server-side auto-send
 M components/wallet/SmartBonusBanner.tsx # "gift bonus" wording + amount
 M components/wallet/SmartBonusCard.tsx   # gift-bonus claim card wording
 M functions/src/index.ts                 # exports (no smartBonusGift)
 M functions/src/smartBonus.ts            # auto-SMS in smartBonusSend + wording
 M functions/src/smartBonusAi.ts          # AI outreach prompt = gift-bonus framing
 M lib/api.ts                             # typed smartBonusSend
 M lib/smartBonus.ts                      # offerMessage wording
 M lib/types.ts
    functions/src/routes/otp.ts           # (in commit f561876) export sendViaAfricell
    functions/src/smartBonusNotify.ts     # (in commit f561876) SMS + rewards link
```

## Prerequisites (already in place — just confirm)

- `functions/.env` has `AFRICELL_SMS_URL`, `AFRICELL_SMS_USERNAME`,
  `AFRICELL_SMS_PASSWORD`, `AFRICELL_SMS_SENDER`, and `ANTHROPIC_API_KEY`.
- Optional `PUBLIC_SITE_URL` in `functions/.env` (defaults to
  `https://www.beteseaviator.com`). Set only if the domain changes.
- Africell sender account must have SMS tokens (a 407 = out of tokens; the offer
  still saves, only the text is skipped).

## Deploy

Typechecked clean: `cd functions && npm run build`, and `npx tsc --noEmit` at root.

1. **Functions** (includes the new `processHappyHour` scheduled worker):
   ```bash
   firebase deploy --only functions --project beteseaviator-a05ae
   ```
2. **Firestore rules** (adds admin read for `happyHourCampaigns`):
   ```bash
   firebase deploy --only firestore:rules --project beteseaviator-a05ae
   ```
3. **Frontend**: commit the working-tree changes and push to GitHub
   `betesebetesegaming/beteseaviator` branch `main` — the host auto-rebuilds.

## Verify

1. `firebase functions:log --only smartBonusSend --project beteseaviator-a05ae`
2. Admin → Smart Bonus → **Run analysis now** → pick a test player → **Approve** →
   **Send SMS**. The customer receives the text ending in `…/play/rewards`; log
   shows `smartBonus SMS sent`. In the app they see the banner and the
   "BETESE gift bonus" claim card (deposit to match, then play).
3. If the log shows `smartBonus SMS failed`, check Africell tokens/credentials —
   the offer is unaffected.

## Do not touch

- Deposit/withdraw/ModemPay code — this feature does not modify it.
- WhatsApp auto-send is out of scope (needs a WhatsApp Business API account).

## Rollback

Revert the changed files and redeploy functions + rules. The only rules change is
an added admin-read block for `happyHourCampaigns`; no indexes or schema changes.
A Happy Hour can be stopped mid-rollout from the UI (the **Stop** button on the
progress line, backed by `adminCancelHappyHour`) — the worker only processes
`running` campaigns, and its final write can't clobber a cancel.
