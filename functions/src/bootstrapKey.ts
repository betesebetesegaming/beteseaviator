import type { Request, Response } from "express";

/** Env-only bootstrap key — never hardcode in source. Disabled when unset. */
export function getBootstrapKey(): string {
  return String(process.env.ADMIN_BOOTSTRAP_KEY ?? "").trim();
}

export function requireBootstrapKey(req: Request, res: Response): boolean {
  const expected = getBootstrapKey();
  if (!expected) {
    res.status(403).json({ error: "bootstrap_disabled" });
    return false;
  }
  const key = String(req.query.key ?? req.body?.key ?? "").trim();
  if (key !== expected) {
    res.status(403).json({ error: "forbidden" });
    return false;
  }
  return true;
}
