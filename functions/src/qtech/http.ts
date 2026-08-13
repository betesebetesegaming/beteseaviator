/** Shared QTech HTTP client — retries undici keep-alive drops ("other side closed"). */

const TRANSIENT =
  /UND_ERR_SOCKET|other side closed|ECONNRESET|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|EAI_AGAIN|fetch failed/i;

function errorCause(e: unknown): string {
  if (e instanceof Error) return String((e as Error & { cause?: unknown }).cause ?? e.message);
  return String(e);
}

export async function qtechFetch(url: string, init?: RequestInit, retries = 3): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetch(url, {
        ...init,
        cache: "no-store",
        headers: {
          Connection: "close",
          ...(init?.headers ?? {}),
        },
      });
    } catch (e) {
      lastErr = e;
      if (!TRANSIENT.test(errorCause(e)) || attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  throw lastErr;
}
