14# BETESE Aviator — iOS app (website shell)

The iOS app is a **Capacitor WebView** that loads the **same** live site as Safari:

`https://www.beteseaviator.com/play`

There is **no separate app UI**. Login, lobby, games, wallet, and deposits are identical to mobile Safari.

## Prerequisites

| Machine | What you can do |
|---------|-----------------|
| Windows (this repo) | Scaffold, sync config, commit `ios/` |
| **Mac + Xcode** | Build Simulator / device, TestFlight, App Store |

You need an [Apple Developer](https://developer.apple.com) account to install on a physical iPhone or ship to TestFlight.

## One-time setup (already done in repo)

- [`capacitor.config.ts`](../capacitor.config.ts) — `com.betese.aviator`, live `server.url`
- [`www/`](../www/) — offline fallback page + icon
- [`public/app-icon.png`](../public/app-icon.png) — your BETESE Aviator logo
- npm scripts: `cap:sync`, `cap:ios`

## Mac: build & run

```bash
cd /path/to/aviator
npm install
npx cap sync ios
npx cap open ios
```

In Xcode:

1. Select the **App** target → **Signing & Capabilities** → choose your **Team**
2. Bundle ID: `com.betese.aviator` (change only if Apple already took that id)
3. Pick a Simulator or a plugged-in iPhone → **Run**

## Safari + app parity (must feel the same)

The website already uses `viewport-fit=cover` and safe-area padding. After deploy of the frontend, verify on **iPhone Safari** and in the **app**:

- [ ] Lobby loads with correct logo / branding
- [ ] Login / register with phone OTP
- [ ] Open a QTech game (full screen, back / wallet controls usable)
- [ ] Deposit (Wave / AfriMoney / etc.) completes and returns to wallet
- [ ] Balance updates after deposit
- [ ] Notch / home indicator: headers and bottom bars not clipped
- [ ] No unwanted page zoom while typing amounts
- [ ] Add to Home Screen (Safari) uses the new app icon

## Updating the app after a website change

Most updates need **no new App Store build** — just deploy the website (Vercel). Rebuild the iOS binary only when you change:

- App icon / splash
- Bundle id / permissions
- Capacitor plugins
- `server.url` / allowNavigation hosts

Then on Mac: `npx cap sync ios` → Archive in Xcode.

## Android (later)

Same Capacitor config can add Android with `npx cap add android` when you want a Play Store shell.
