import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/env/publicConfig";
import { toWaveAccountNumber } from "@/lib/phone";

export const runtime = "nodejs";

function isOldSevenDigitReject(message: string): boolean {
  const err = String(message || "");
  return /7-digit/i.test(err) && !/7 or 9/i.test(err);
}

function checkoutOk(res: Response, data: Record<string, unknown>): boolean {
  return res.ok && Boolean(data.checkoutUrl || data.sessionId || data.ok || data.awaitWalletApproval);
}

/** Wave checkout via Vercel so 9-digit numbers work even if Cloud Functions still expect 7. */
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

  const phones =
    method === "wave" && wave9
      ? [wave9, wave9.slice(2)].filter((phone, i, all) => phone.length >= 7 && all.indexOf(phone) === i)
      : [rawPhone];

  const url = `${getApiBaseUrl()}/modempayApi/modempay-checkout`;
  let lastStatus = 502;
  let lastData: Record<string, unknown> = { error: "Could not start checkout" };

  for (const phone of phones) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify({ ...body, customerPhone: phone }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    lastStatus = res.status;
    lastData = data;
    if (checkoutOk(res, data)) {
      return NextResponse.json(data);
    }
    const err = String(data.error || data.message || "");
    if (!isOldSevenDigitReject(err)) {
      return NextResponse.json(data, { status: res.status || 400 });
    }
  }

  return NextResponse.json(lastData, { status: lastStatus || 400 });
}
