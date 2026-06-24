import type { Request, Response, NextFunction } from "express";
import { logger } from "firebase-functions/v2";
import { getQTechSettings } from "./config";
import { resolveWalletSession } from "./session";
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
  const raw = req.header("Wallet-Session") || req.header("wallet-session");
  return raw?.trim() || undefined;
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
  const session = await resolveWalletSession(walletSession(req), { requireActive: true });
  if (!session || session.uid !== playerId) {
    sendError(res, 400, "INVALID_TOKEN");
    return false;
  }
  return true;
}

function handleWalletError(res: Response, e: unknown): void {
  const parsed = parseQtechError(e);
  sendError(res, parsed.status, parsed.code, parsed.message);
}

export async function verifySessionHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!(await requirePassKey(req, res))) return;
    const playerId = String(req.params.playerId || "");
    const session = await resolveWalletSession(walletSession(req), { requireActive: true });
    if (!session || session.uid !== playerId) {
      sendError(res, 400, "INVALID_TOKEN");
      return;
    }
    const cfg = await getQTechSettings();
    const { balance, currency } = await getBalanceForPlayer(playerId);
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
    const session = walletSession(req);
    if (session) {
      const resolved = await resolveWalletSession(session);
      if (!resolved || resolved.uid !== playerId) {
        // Expired/invalid session still returns balance per QTech tester getbalance_expired_session
      }
    }
    const { balance, currency } = await getBalanceForPlayer(playerId);
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
