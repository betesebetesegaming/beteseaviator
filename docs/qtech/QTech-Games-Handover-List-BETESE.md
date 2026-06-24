# QTech Games Handover List — BETESE

**Operator:** BETESE  
**Brand:** BETESE Aviator  
**Integration type:** Common Wallet (seamless)  
**Date:** June 2026  

> **Pass-Key:** Generate in **Admin → QTech & Games → Generate Pass-Key**, save in section 3, and use the **same value** in staging and production below.  
> Or run: `node scripts/fill-handover-xlsx.mjs` (prints a new Pass-Key each run).

---

## 1. Account Details

| No. | Required info | Value |
|-----|---------------|-------|
| 1 | Client company name | **BETESE** |
| 2 | Brand URL | **https://www.beteseaviator.com/play** |
| 3 | Brand name | **BETESE Aviator** |
| 4 | Language | **English (en_GM)** |
| 5 | Currency | **GMD** (Gambian Dalasi) |
| 6 | Target market | **Gambia** |
| 7 | Hosting location | **Google Cloud Firebase (us-central1)** |
| 8 | API type | **Common Wallet** |

---

## 2. Access Details

| No. | Required info | Value |
|-----|---------------|-------|
| 1 | IP addresses for accessing QT Back Office in **staging** | To be provided if required |
| 2 | IP addresses for accessing API in **staging** | Serverless (no fixed inbound IP). QTech calls our wallet URL over HTTPS. |
| 3 | IP addresses for accessing QT Back Office in **production** | To be provided if required |
| 4 | IP addresses for accessing API in **production** | Serverless (no fixed inbound IP). If QTech requires a fixed outbound IP for us calling your API, we will provide a Cloud NAT static IP on request. |

---

## 3. Contact Details

| No. | Required info | Value |
|-----|---------------|-------|
| 1 | IT manager Skype & email | BETESE IT — care@beteseaviator.com *(update if needed)* |
| 2 | Finance manager Skype & email | BETESE Finance — care@beteseaviator.com *(update if needed)* |
| 3 | Game release contact & email | BETESE Operations — care@beteseaviator.com *(update if needed)* |
| 4 | Campaign manager / casino manager contact & email | BETESE — care@beteseaviator.com *(update if needed)* |

---

## 4. Common Wallet — Operator implementation (BETESE hosts wallet)

*Below info only needed for common (seamless) wallet.*

| No. | Required info | Staging | Production |
|-----|---------------|---------|------------|
| 1 | Base URL for your implementation of QT API | `https://us-central1-beteseaviator-a05ae.cloudfunctions.net/qtcwApi` | `https://us-central1-beteseaviator-a05ae.cloudfunctions.net/qtcwApi` |
| 2 | Your preferred PassKey | *(see note at top — generate & save in admin)* | *(same as staging)* |
| 3 | Promotion status URL | Not implemented — N/A | Not implemented — N/A |
| 4 | Rewards URL | `https://us-central1-beteseaviator-a05ae.cloudfunctions.net/qtcwApi/bonus/reward` | `https://us-central1-beteseaviator-a05ae.cloudfunctions.net/qtcwApi/bonus/reward` |

### Wallet API endpoints (under base URL)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/accounts/{playerId}/session` | Verify session |
| GET | `/accounts/{playerId}/balance` | Get balance |
| POST | `/transactions/` | Bet (withdrawal / DEBIT) |
| POST | `/transactions` | Win (deposit / CREDIT) |
| POST | `/transactions/rollback` | Rollback (v2) |
| POST | `/transactions/{referenceId}/rollback` | Rollback (v1) |
| POST | `/bonus/reward` | Bonus reward |
| GET | `/health` | Health check |

**Authentication:** QTech sends header `Pass-Key` + `Wallet-Session` on each wallet call.

---

## 5. QTech Mobile APP (QT Play) integration

*Not required for web integration — N/A for BETESE.*

| No. | Required info | Value |
|-----|---------------|-------|
| 1 | Operator name | N/A — web integration only |
| 2 | APP name | N/A |
| 3 | Login URL in staging | N/A |
| 4 | Login URL in production | N/A |
| 5 | Verify token URL in staging | N/A |
| 6 | Verify token URL in production | N/A |
| 7 | Cashier option (embedded or browser) | N/A |
| 8 | Cashier URL in staging | N/A |
| 9 | Cashier URL in production | N/A |

---

## 6. Games requested

| Game | Lobby category | Notes |
|------|----------------|-------|
| Aviator | Aviator | Awaiting QTech catalog `gameId` |
| Crash | Crash | Awaiting QTech catalog `gameId` |

---

## 7. What we need from QTech to complete integration

Please confirm and provide:

| Item | Purpose |
|------|---------|
| **Sandbox API base URL** | e.g. `https://api-int.qtplatform.com` — for game launch |
| **Operator username + password** | For `GET /v1/auth/token` |
| **Aviator `gameId`** | e.g. `TK-...` |
| **Crash `gameId`** | Catalog ID for Crash |
| **GMD enabled** | Confirm currency on operator account |
| **Pass-Key confirmation** | Must match value we provide above |
| **Wallet certification** | Run tester against our wallet URL |
| **Enable games** | Activate Aviator + Crash for operator BETESE |

---

## 8. Operator game launch (BETESE calls QTech)

Per Common Wallet API v2.53:

- **Auth:** `GET /v1/auth/token?grant_type=password&response_type=token&username={username}&password={password}`
- **Launch:** `POST /v1/games/{gameId}/launch-url`
- **Required body:** `playerId`, `currency` (GMD), `country` (GM), `lang` (en_GM), `mode=real`, `device`, `returnUrl`, **`walletSessionId`**

**Lobby return URL:** `https://www.beteseaviator.com/play`

---

## 9. Certification tester

After Pass-Key is agreed, wallet can be verified with:

```text
docs/qtech/cw_qtcw_tester.py all
```

Config: `docs/qtech/cw_qtcw_tester.cfg`  
See: `docs/qtech/README.txt`

---

## 10. Related files in this repo

| File | Description |
|------|-------------|
| `docs/qtech/QTech-Games-Handover-List-BETESE.md` | This document |
| `docs/qtech/handover-betese-filled.txt` | Plain-text summary |
| `scripts/fill-handover-xlsx.mjs` | Generates filled Excel with new Pass-Key |
| `docs/qtech/common-wallet-api-2-53.txt` | QTech Common Wallet API spec (extracted) |
| `docs/qtech/transfer-wallet-api-1-51.txt` | QTech Transfer Wallet API spec (extracted) |

---

## Email template (copy to QTech)

```text
Hello,

Please find our completed QTech Games Handover List for BETESE (Gambia, GMD, Common Wallet).

Wallet API base URL (staging & production):
https://us-central1-beteseaviator-a05ae.cloudfunctions.net/qtcwApi

Pass-Key: [INSERT YOUR PASS-KEY]

Rewards URL:
https://us-central1-beteseaviator-a05ae.cloudfunctions.net/qtcwApi/bonus/reward

Brand URL: https://www.beteseaviator.com/play

Kindly share sandbox API credentials, operator login, and Aviator/Crash game IDs for GMD,
and confirm wallet certification steps.

Thank you,
BETESE Team
```
