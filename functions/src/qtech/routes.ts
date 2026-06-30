import type { Request, Response, NextFunction } from "express";
import { logger } from "firebase-functions/v2";
import { getQTechSettings } from "./config";
import {
  normalizeWalletSessionId,
  qtechPlayerIdsMatch,
  resolveWalletSession,
  touchWalletSession,
} from "./session";
import {
  getBalanceForPlayer,
  parseQtechError,
  parseQTechTxnType,
  processDeposit,
  processReward,
  processRollback,
  processWithdrawal,
} from "./walletOps";
import { sendError, sendSuccess } from "./responses";

function passKey(req: Request): string {
  return String(req.header("Pass-Key") || req.header("pass-key") || "").trim();
}

function walletSession(req: Request): string | undefined {
  const header =
    req.header("Wallet-Session") ||
    req.header("wallet-session") ||
    req.header("Wallet-Session-Id") ||
    req.header("wallet-session-id");
  if (header?.trim()) return header.trim();
  const query = req.query.walletSession ?? req.query.walletSessionId ?? req.query.session;
  if (typeof query === "string" && query.trim()) return query.trim();
  return undefined;
}

function sessionMatchesPlayer(
  session: { uid: string },
  playerId: string,
  context: string,
  sessionToken?: string
): boolean {
  if (qtechPlayerIdsMatch(session.uid, playerId)) return true;
  logger.warn("QTech wallet session player mismatch", {
    context,
    sessionUid: session.uid,
    playerId,
    sessionToken: sessionToken ? `${sessionToken.slice(0, 8)}…` : undefined,
  });
  return false;
}

async function requireValidSession(
  req: Request,
  res: Response,
  playerId: string,
  context: string
): Promise<{ uid: string } | null> {
  const rawSession = walletSession(req);
  const session = await resolveWalletSession(rawSession, { requireActive: true });
  if (!session) {
    logger.warn("QTech wallet session invalid or expired", {
      context,
      playerId,
      hasSessionHeader: Boolean(rawSession),
      sessionToken: rawSession ? `${normalizeWalletSessionId(rawSession)?.slice(0, 8)}…` : undefined,
    });
    sendError(res, 400, "INVALID_TOKEN");
    return null;
  }
  if (!sessionMatchesPlayer(session, playerId, context, rawSession)) {
    sendError(res, 400, "INVALID_TOKEN");
    return null;
  }
  return session;
}

async function requirePassKey(req: Request, res: Response): Promise<boolean> {
  const cfg = await getQTechSettings();
  const key = passKey(req);
  if (!cfg.passKey) {
    logger.error("QT_PASS_KEY / settings.qtech.passKey is not configured");
    sendError(res, 401, "LOGIN_FAILED", "Wallet pass-key not configured");
    return false;
  }
  if (key !== cfg.passKey) {
    sendError(res, 401, "LOGIN_FAILED");
    return false;
  }
  return true;
}

async function requireSessionForWithdrawal(
  req: Request,
  res: Response,
  playerId: string
): Promise<boolean> {
  const session = await requireValidSession(req, res, playerId, "withdrawal");
  return session !== null;
}

function handleWalletError(res: Response, e: unknown): void {
  const parsed = parseQtechError(e);
  sendError(res, parsed.status, parsed.code, parsed.message);
}

export async function verifySessionHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!(await requirePassKey(req, res))) return;
    const playerId = String(req.params.playerId || "");
    const session = await requireValidSession(req, res, playerId, "verifySession");
    if (!session) return;
    await touchWalletSession(walletSession(req) ?? "");
    const cfg = await getQTechSettings();
    const { balance, currency } = await getBalanceForPlayer(session.uid);
    sendSuccess(res, { balance, currency: currency || cfg.currency });
  } catch (e) {
    handleWalletError(res, e);
  }
}

export async function getBalanceHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!(await requirePassKey(req, res))) return;
    const playerId = String(req.params.playerId || "");
    const cfg = await getQTechSettings();
    let balanceUid = playerId;
    const sessionRaw = walletSession(req);
    if (sessionRaw) {
      const resolved = await resolveWalletSession(sessionRaw);
      if (resolved && qtechPlayerIdsMatch(resolved.uid, playerId)) {
        balanceUid = resolved.uid;
      }
    }
    const { balance, currency } = await getBalanceForPlayer(balanceUid);
    sendSuccess(res, { balance, currency: currency || cfg.currency });
  } catch (e) {
    handleWalletError(res, e);
  }
}

export async function withdrawalHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!(await requirePassKey(req, res))) return;
    const body = req.body as Record<string, unknown>;
    const playerId = String(body.playerId ?? "");
    if (!(await requireSessionForWithdrawal(req, res, playerId))) return;
    const cfg = await getQTechSettings();
    const result = await processWithdrawal(body, cfg.currency);
    sendSuccess(res, result);
  } catch (e) {
    handleWalletError(res, e);
  }
}

export async function depositHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!(await requirePassKey(req, res))) return;
    const cfg = await getQTechSettings();
    const result = await processDeposit(req.body as Record<string, unknown>, cfg.currency);
    sendSuccess(res, result);
  } catch (e) {
    handleWalletError(res, e);
  }
}

/**
 * QTech sends bets (DEBIT) and wins (CREDIT) to the same /transactions URL.
 * Route by txnType — Express also treats /transactions and /transactions/ as equivalent,
 * so separate path-based handlers caused wins to be processed as withdrawals.
 */
export async function transactionHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!(await requirePassKey(req, res))) return;
    const body = req.body as Record<string, unknown>;
    const cfg = await getQTechSettings();
    const txnType = parseQTechTxnType(body);

    if (txnType === "CREDIT") {
      const result = await processDeposit(body, cfg.currency);
      sendSuccess(res, result);
      return;
    }

    const playerId = String(body.playerId ?? "");
    if (!(await requireSessionForWithdrawal(req, res, playerId))) return;
    const result = await processWithdrawal(body, cfg.currency);
    sendSuccess(res, result);
  } catch (e) {
    handleWalletError(res, e);
  }
}

export async function rollbackV1Handler(req: Request, res: Response): Promise<void> {
  try {
    if (!(await requirePassKey(req, res))) return;
    const cfg = await getQTechSettings();
    const referenceId = String(req.params.referenceId || "");
    const result = await processRollback(req.body as Record<string, unknown>, cfg.currency, {
      referenceId,
    });
    if (result.referenceId) {
      sendSuccess(res, result);
    } else {
      sendSuccess(res, { balance: result.balance });
    }
  } catch (e) {
    handleWalletError(res, e);
  }
}

export async function rollbackV2Handler(req: Request, res: Response): Promise<void> {
  try {
    if (!(await requirePassKey(req, res))) return;
    const cfg = await getQTechSettings();
    const body = req.body as Record<string, unknown>;
    const betId = String(body.betId ?? "");
    const result = await processRollback(body, cfg.currency, { betId });
    if (result.referenceId) {
      sendSuccess(res, result);
    } else {
      sendSuccess(res, { balance: result.balance });
    }
  } catch (e) {
    handleWalletError(res, e);
  }
}

export async function rewardHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!(await requirePassKey(req, res))) return;
    const cfg = await getQTechSettings();
    const result = await processReward(req.body as Record<string, unknown>, cfg.currency);
    sendSuccess(res, result);
  } catch (e) {
    handleWalletError(res, e);
  }
}

export function qtechErrorMiddleware(err: Error, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  logger.error("QTech wallet unhandled error", err);
  sendError(res, 400, "REQUEST_DECLINED", err.message);
}
