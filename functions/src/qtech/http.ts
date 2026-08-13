/** Outbound QTech HTTP — HTTP/1.1, no keep-alive (Node fetch/HTTP2 gets RST by QTech). */

import * as https from "node:https";
import { URL } from "node:url";

const TRANSIENT =
  /UND_ERR_SOCKET|other side closed|ECONNRESET|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|EAI_AGAIN|fetch failed|socket hang up/i;

function errorCause(e: unknown): string {
  if (e instanceof Error) return String((e as Error & { cause?: unknown }).cause ?? e.message);
  return String(e);
}

function headerRecord(headers?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const [k, v] of headers) out[k] = String(v);
    return out;
  }
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined) out[k] = String(v);
  }
  return out;
}

function httpsOnce(url: string, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const method = String(init?.method || "GET").toUpperCase();
    const body =
      typeof init?.body === "string" ? init.body : init?.body != null ? String(init.body) : undefined;
    const headers = headerRecord(init?.headers);
    if (body && !headers["Content-Length"] && !headers["content-length"]) {
      headers["Content-Length"] = String(Buffer.byteLength(body));
    }

    const req = https.request(
      {
        protocol: "https:",
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method,
        headers,
        agent: false,
        timeout: 20_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => {
          const raw = res.headers;
          const hdrs = new Headers();
          for (const [key, value] of Object.entries(raw)) {
            if (!key || value == null) continue;
            hdrs.set(key, Array.isArray(value) ? value.join(", ") : String(value));
          }
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode || 0,
              headers: hdrs,
            }),
          );
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("ETIMEDOUT"));
    });
    if (body) req.write(body);
    req.end();
  });
}

export async function qtechFetch(url: string, init?: RequestInit, retries = 3): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await httpsOnce(url, init);
    } catch (e) {
      lastErr = e;
      if (!TRANSIENT.test(errorCause(e)) || attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  throw lastErr;
}
