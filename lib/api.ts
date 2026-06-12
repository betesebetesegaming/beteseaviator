import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { PaymentProvider, Role } from "./types";

function call<Req, Res>(name: string) {
  return async (data: Req): Promise<Res> => {
    const fn = httpsCallable<Req, Res>(functions, name);
    const result = await fn(data);
    return result.data;
  };
}

// ---------- auth / profile ----------

export const completeRegistration = call<
  { name: string; phone?: string; email?: string; ref?: string | null },
  { ok: true; role: Role }
>("completeRegistration");

/** Agent username login: verifies password server-side, returns a custom token. */
export const agentLogin = call<
  { username: string; password: string },
  { token: string }
>("agentLogin");

/** One-time platform bootstrap: creates admin + demo data when no admin exists yet. */
export const seedPlatform = call<
  { adminEmail: string; adminPassword: string; withDemoData: boolean },
  { ok: true; created: string[] }
>("seedPlatform");

export const ensurePrimaryAdmin = call<
  { password?: string },
  { ok: true; uid: string; action: string; login?: string; email?: string }
>("ensurePrimaryAdmin");

// ---------- game ----------

export const placeBet = call<
  { gameId: string; betAmount: number; autoCashoutAt?: number | null },
  { sessionId: string; roundId: string; hash: string }
>("placeBet");

export const cashout = call<
  { sessionId: string },
  { multiplier: number; winAmount: number }
>("cashout");

// ---------- wallet ----------

export const requestDeposit = call<
  { provider: PaymentProvider; phone: string; amount: number },
  { requestId: string; reference: string; instructions: string }
>("requestDeposit");

export const requestWithdrawal = call<
  { provider: PaymentProvider; phone: string; amount: number },
  { requestId: string }
>("requestWithdrawal");

// ---------- agent ----------

export const agentCreateCustomer = call<
  { name: string; phone: string; password: string },
  { uid: string }
>("agentCreateCustomer");

export const agentDepositToCustomer = call<
  { customerId: string; amount: number },
  { ok: true }
>("agentDepositToCustomer");

export const agentCreateSubAgent = call<
  { name: string; email: string; username: string; password: string },
  { uid: string; slug: string }
>("agentCreateSubAgent");

export const agentTransferToSubAgent = call<
  { subAgentId: string; amount: number },
  { ok: true }
>("agentTransferToSubAgent");

// ---------- admin ----------

export const adminCreateUser = call<
  {
    role: Role;
    name: string;
    email?: string;
    phone?: string;
    username?: string;
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

export const adminResolvePayment = call<
  { requestId: string; action: "approve" | "reject"; reason?: string },
  { ok: true; status: string }
>("adminResolvePayment");

export const adminSaveSettings = call<Record<string, unknown>, { ok: true }>(
  "adminSaveSettings"
);

import type { PromoSlide } from "./games/promotions";

export const adminSaveLobbyPromos = call<
  { slides: PromoSlide[]; ticker?: string[] },
  { ok: true }
>("adminSaveLobbyPromos");

export const adminRefreshDailyDemos = call<
  Record<string, never>,
  { ok: true; date: string; accounts: unknown[] }
>("adminRefreshDailyDemos");

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    const msg = String((e as { message: unknown }).message);
    // Firebase callable errors arrive as "functions/xyz: actual message" sometimes
    return msg.replace(/^(functions\/[\w-]+:?\s*)/, "");
  }
  return "Something went wrong. Please try again.";
}
