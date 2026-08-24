import { apiUrl } from "@/lib/apiUrl";
import { authFetchHeaders } from "@/lib/authHeaders";

export type ModemPayDirection = "in" | "out";

export type ModemPayLiveTx = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  type: string;
  direction?: ModemPayDirection;
  source: string;
  reference: string;
  paymentMethod: string;
  paymentAccount: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  createdAt: string;
  paymentIntentId: string;
};

export type ModemPayLiveList = {
  ok: true;
  transactions: ModemPayLiveTx[];
  total: number | null;
  limit: number;
  offset: number;
  truncated?: boolean;
  transfersAvailable?: boolean;
  fetchedAt?: string;
};

export type ModemPayBalanceGmd = {
  available: number | null;
  pending: number | null;
  raw: unknown;
};

export async function fetchModemPayLiveTransactions(opts: {
  limit?: number;
  offset?: number;
  search?: string;
  timeframe?: number;
  all?: boolean;
}): Promise<ModemPayLiveList> {
  const url = new URL(apiUrl("/modempay-transactions"));
  url.searchParams.set("all", opts.all === false ? "0" : "1");
  url.searchParams.set("limit", String(opts.limit ?? 100));
  url.searchParams.set("offset", String(opts.offset ?? 0));
  if (opts.search?.trim()) url.searchParams.set("search", opts.search.trim());
  if (opts.timeframe && opts.timeframe > 0) {
    url.searchParams.set("timeframe", String(opts.timeframe));
  }
  const res = await fetch(url.toString(), { headers: await authFetchHeaders() });
  const data = (await res.json().catch(() => ({}))) as ModemPayLiveList & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `ModemPay list failed (${res.status})`);
  }
  return data;
}

export async function fetchModemPayBalances(): Promise<ModemPayBalanceGmd> {
  const res = await fetch(apiUrl("/modempay-balances"), { headers: await authFetchHeaders() });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; balances?: unknown; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `ModemPay balances failed (${res.status})`);
  }
  return parseModemPayBalanceGmd(data.balances);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function numish(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseModemPayBalanceGmd(raw: unknown): ModemPayBalanceGmd {
  const pick = (obj: Record<string, unknown> | null): { available: number | null; pending: number | null } => {
    if (!obj) return { available: null, pending: null };
    const available = numish(
      obj.available ?? obj.available_balance ?? obj.balance ?? obj.current_balance ?? obj.amount,
    );
    const pending = numish(obj.pending ?? obj.pending_balance ?? obj.reserved);
    return { available, pending };
  };

  const root = asRecord(raw);
  const nested = asRecord(root?.data) ?? root;
  const fromObj = pick(nested);
  if (fromObj.available != null || fromObj.pending != null) {
    return { ...fromObj, raw };
  }

  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(root?.data)
      ? root.data
      : Array.isArray(nested?.balances)
        ? nested.balances
        : [];
  const gmd = (list as Record<string, unknown>[]).find((row) => {
    const c = String(row.currency || row.code || "").toUpperCase();
    return c === "GMD" || c === "DALASI" || !c;
  });
  return { ...pick(asRecord(gmd) ?? asRecord(list[0])), raw };
}

export function txDirection(row: ModemPayLiveTx): ModemPayDirection {
  if (row.direction === "in" || row.direction === "out") return row.direction;
  const t = String(row.type || "").toLowerCase();
  if (["transfer", "payout", "withdrawal", "withdraw", "refund", "chargeback"].includes(t)) {
    return "out";
  }
  if (Number(row.amount) < 0) return "out";
  return "in";
}

export function maskModemPayAccount(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length >= 4) return `…. ${digits.slice(-4)}`;
  return raw?.trim() || "—";
}

export function minutesSince(fromIsoDate: string): number {
  const start = Date.parse(`${fromIsoDate}T00:00:00.000Z`);
  if (!Number.isFinite(start)) return 1440;
  return Math.max(1, Math.ceil((Date.now() - start) / 60_000));
}

export function liveMethodLabel(method: string): string {
  switch (String(method || "").toLowerCase()) {
    case "aps":
      return "APS";
    case "afrimoney":
      return "AfriMoney";
    case "qmoney":
      return "QMoney";
    case "wave":
      return "Wave";
    case "card":
      return "Card";
    default:
      return method ? method : "Wallet";
  }
}

const BANJUL = "Africa/Banjul";

export function formatModemPayDashDate(iso: string): string {
  const n = Date.parse(iso);
  if (!Number.isFinite(n)) return "—";
  const d = new Date(n);
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: BANJUL }).format(d);
  const nowYear = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: BANJUL }).format(new Date());
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: BANJUL,
  };
  if (year !== nowYear) opts.year = "numeric";
  return d.toLocaleString("en-US", opts);
}
