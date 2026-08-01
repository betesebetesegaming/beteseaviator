# Deploy — Smart Bonus: direct gift + auto-SMS

Ship two additions to the existing Smart Bonus engine (backend + frontend). Fully additive; no changes to deposit/withdraw/ModemPay code.

## What changed

- **Direct free-gift bonus** — new admin-only callable `smartBonusGift` credits a bonus straight to the player's account (no deposit), reusing the existing `walletWrite`(creditAsBonus) + `recordBonusWageringRequirement` path. Keeps the wager multiplier so it isn't instantly withdrawable. Transaction-guarded against double-credit.
- **Automatic SMS with a tap-through link** — `smartBonusSend({channel:"sms"})` now texts the customer server-side via the Africell gateway, and every message ends with the rewards link so the player taps through to their bonus. New helper `smartBonusNotify.ts` reuses `sendViaAfricell` (now exported from `routes/otp.ts`).
- **Admin UI** — "🎁 Gift now" button on each offer; "Send SMS" now delivers server-side; offers carry a `kind: "match" | "gift"` field (existing offers default to `"match"`).

## Files

```
 M app/admin/smart-bonus/page.tsx      # Gift button, server-side SMS, GIFT badge
 M functions/src/index.ts              # export smartBonusGift
 M functions/src/routes/otp.ts         # export sendViaAfricell (added `export`, no behavior change)
 M functions/src/smartBonus.ts         # smartBonusGift + auto-SMS in smartBonusSend + kind field
 M lib/api.ts                          # smartBonusGift client wrapper + typed smartBonusSend
 M lib/types.ts                        # SmartBonusOffer.kind / giftedBy
?? functions/src/smartBonusNotify.ts   # NEW: server-side outreach SMS + rewards link
```

## Prerequisites (already in place — just confirm)

- `functions/.env` has `ANTHROPIC_API_KEY`, `AFRICELL_SMS_URL`, `AFRICELL_SMS_USERNAME`, `AFRICELL_SMS_PASSWORD`, `AFRICELL_SMS_SENDER`.
- Optional: `PUBLIC_SITE_URL` in `functions/.env` (defaults to `https://www.beteseaviator.com`). Only set it if the domain changes.
- Africell SMS sender account must have message tokens (a 407 from the gateway = out of tokens; the bonus still credits, only the text is skipped).

## Deploy

Both are typechecked clean (`cd functions && npm run build`, and `npx tsc --noEmit` at root).

1. **Functions** (ships the new `smartBonusGift` + auto-SMS + picks up `.env`):
   ```bash
   firebase deploy --only functions --project beteseaviator-a05ae
   ```

2. **Frontend** (admin page): push to GitHub `betesebetesegaming/beteseaviator` branch `main` — the host auto-rebuilds.

## Verify

1. `firebase functions:log --only smartBonusGift,smartBonusSend --project beteseaviator-a05ae`
2. In **Admin → Smart Bonus → Run analysis now**, pick a test player:
   - **Send SMS** → customer receives the text (ending in `…/play/rewards`); log shows `smartBonus SMS sent`.
   - **🎁 Gift now** → account is credited immediately (player sees "Smart Bonus active"), customer gets the gift SMS; log shows `action: gifted`.
3. If SMS shows `smartBonus SMS failed`, check Africell tokens/credentials — the bonus credit is unaffected.

## Not included / do not touch

- WhatsApp auto-send is NOT included (needs a WhatsApp Business API account + approved template). The WhatsApp button stays one-tap-send from the admin's own app.
- Do not modify deposit/withdraw/ModemPay code — this feature does not touch it.

## Rollback

Revert the 7 files above and redeploy functions. No schema/rules/index changes were made, so there is nothing else to undo.
