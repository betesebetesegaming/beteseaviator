# BETESE Aviator

Multi-tenant crash/aviator real-money gaming platform for the West-African market (XOF, mobile-money payments).

**Domain:** [beteseaviator.com](https://beteseaviator.com)  
**Firebase project:** `beteseaviator-a05ae`  
**GitHub:** [betesebetesegaming/beteseaviator](https://github.com/betesebetesegaming/beteseaviator)

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 + TypeScript + Tailwind CSS 4 + Lucide icons → **Vercel** |
| Auth | Firebase Auth — phone + password, Google, SMS OTP |
| Database | Cloud Firestore (users, wallets, ledger, games, commissions) |
| Live game | Firebase Realtime Database (round multiplier feed) |
| Backend logic | Firebase Cloud Functions (bets, payouts, commissions, webhooks) |
| Files | Firebase Storage (profile/KYC uploads) |

## Demo mode (guests)

Visitors can open `/play` and watch live Aviator rounds **without signing in**. When they tap **Sign up to bet**, a popup offers:

- Phone + password registration
- Google sign-in
- SMS code sign-in

Real-money bets require a completed player profile (phone number on file).

## Project layout

```
app/              Next.js pages (/play, /agent, /admin)
components/       UI, Logo, AuthModal, role guards
lib/              Firebase client, auth context, callable API helpers
functions/        Cloud Functions (game engine, wallet, payments, commissions)
firestore.rules   Firestore security rules (reads scoped; writes via Functions)
database.rules.json   RTDB rules (public read on live rounds)
storage.rules     Storage rules (user uploads)
```

## First-time Firebase setup

1. **Enable auth providers** in [Firebase Console](https://console.firebase.google.com/project/beteseaviator-a05ae/authentication/providers):
   - Email/Password
   - Google
   - Phone

2. **Deploy backend:**

```bash
cd functions; npm install; npm run build; cd ..
npx firebase-tools@latest deploy --only functions,firestore:rules,firestore:indexes,database,storage
```

3. **Seed the primary admin** (backend-only): the `ensurePrimaryAdmin` Cloud Function creates the
   admin staff account on first run. There is no public setup page — bootstrapping is done from the
   backend so no credentials or setup keys are ever exposed in the frontend.

## Running locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Functions emulator (optional):

```bash
cd functions; npm run serve
```

## Deploy frontend to Vercel via GitHub

```bash
git remote add origin https://github.com/betesebetesegaming/beteseaviator.git
git branch -M main
git push -u origin main
```

In Vercel:

1. Import the GitHub repo `betesebetesegaming/beteseaviator`
2. Add all `NEXT_PUBLIC_FIREBASE_*` variables from `.env.example`
3. Deploy — every push to `main` auto-deploys

## Accounts

The primary admin is seeded by the `ensurePrimaryAdmin` backend function and signs in at
`/admin/login`. Credentials are not published in the app or this README — they are held by the
platform operator. Agents and customers are created from the admin/agent panels.

## Roles

- **Customers** — deposit, bet, win, withdraw (phone login)
- **Agents** — referral links, commission on GGR (cannot play)
- **Admin** — users, wallets, withdrawal approvals, reports, settings
