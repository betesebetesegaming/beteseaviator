import type { Application, Request, Response, NextFunction } from "express";
import cors from "cors";

const AGENT_DOMAIN =
  process.env.AGENT_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_AGENT_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "") ||
  "beteseaviator.com";

/** Agent marketing subdomains, e.g. fatou.beteseaviator.com */
const AGENT_SUBDOMAIN_ORIGIN = new RegExp(
  `^https://[a-z0-9-]+\\.${AGENT_DOMAIN.replace(/\./g, "\\.")}$`,
  "i"
);

/** Browser origins allowed to call public payment HTTP endpoints. */
export const PAYMENT_HTTP_ORIGINS: (string | RegExp)[] = [
  `https://${AGENT_DOMAIN}`,
  `https://www.${AGENT_DOMAIN}`,
  AGENT_SUBDOMAIN_ORIGIN,
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/i,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

export function isAllowedPaymentOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return PAYMENT_HTTP_ORIGINS.some((entry) =>
    typeof entry === "string" ? origin === entry : entry.test(origin)
  );
}

/** Handles preflight + response headers before route handlers run. */
export function applyPaymentCors(app: Application): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && isAllowedPaymentOrigin(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With"
    );
    res.setHeader("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || isAllowedPaymentOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin not allowed: ${origin}`));
      },
      credentials: true,
    })
  );
}
