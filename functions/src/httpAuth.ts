import type { NextFunction, Request, Response } from "express";
import { auth, db, type ProfileData, type Role } from "./helpers";
import { roleAllowed } from "./roles";

export interface AuthenticatedRequest extends Request {
  authUid?: string;
  authRole?: Role;
}

export async function verifyBearerToken(
  req: Request,
): Promise<{ uid: string; role?: string } | null> {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;
  try {
    const decoded = await auth.verifyIdToken(match[1]);
    return { uid: decoded.uid, role: decoded.role as string | undefined };
  } catch {
    return null;
  }
}

async function loadActiveProfile(uid: string): Promise<ProfileData | null> {
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) return null;
  const profile = snap.data() as ProfileData;
  if (profile.status !== "active") return null;
  return profile;
}

/** Require a valid Firebase ID token on HTTP routes. */
export function requireHttpAuth() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const tokenAuth = await verifyBearerToken(req);
    if (!tokenAuth) {
      res.status(401).json({ error: "Sign in required." });
      return;
    }
    const profile = await loadActiveProfile(tokenAuth.uid);
    if (!profile) {
      res.status(403).json({ error: "Account not found or suspended." });
      return;
    }
    req.authUid = tokenAuth.uid;
    req.authRole = profile.role;
    next();
  };
}

/** Require Firebase auth plus an active staff role (Firestore is source of truth). */
export function requireHttpRole(roles: Role[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const tokenAuth = await verifyBearerToken(req);
    if (!tokenAuth) {
      res.status(401).json({ error: "Sign in required." });
      return;
    }
    const profile = await loadActiveProfile(tokenAuth.uid);
    if (!profile) {
      res.status(403).json({ error: "Account not found or suspended." });
      return;
    }
    if (!roleAllowed(profile.role, roles)) {
      res.status(403).json({ error: "Not allowed." });
      return;
    }
    req.authUid = tokenAuth.uid;
    req.authRole = profile.role;
    next();
  };
}
