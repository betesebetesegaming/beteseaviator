import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/env/publicConfig";
import { toWaveAccountNumber } from "@/lib/phone";

export const runtime = "nodejs";

function checkoutOk(res: Response, data: Record<string, unknown>): boolean {
  return res.ok && Boolean(data.checkoutUrl || data.sessionId || data.ok || data.awaitWalletApproval);
}

/** Wave checkout — Wave only accepts the new 9-digit Gambia9 number. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const auth = req.headers.get("authorization") || "";
  const method = String(body.method || body.provider || "").toLowerCase();
  const rawPhone = String(body.customerPhone || "");
  const wave9 = method === "wave" ? toWaveAccountNumber(rawPhone) : "";

  if (method === "wave" && !wave9) {
    return NextResponse.json(
      { error: "Wave needs the new 9-digit number (e.g. 877793854)." },
      { status: 400 },
    );
  }

  const customerPhone = method === "wave" ? wave9 : rawPhone;
  const url = `${getApiBaseUrl()}/modempayApi/modempay-checkout`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify({ ...body, customerPhone }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (checkoutOk(res, data)) {
    return NextResponse.json(data);
  }
  return NextResponse.json(data, { status: res.status || 400 });
}
