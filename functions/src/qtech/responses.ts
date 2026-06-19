import type { Response } from "express";

export type QTechErrorCode =
  | "LOGIN_FAILED"
  | "INVALID_TOKEN"
  | "ACCOUNT_BLOCKED"
  | "INSUFFICIENT_FUNDS"
  | "REQUEST_DECLINED"
  | "TRANSACTION_NOT_FOUND";

export function sendJson(res: Response, status: number, body: Record<string, unknown>): void {
  res.status(status).setHeader("Content-Type", "application/json").json(body);
}

export function sendSuccess(res: Response, body: Record<string, unknown>): void {
  sendJson(res, 200, body);
}

export function sendError(res: Response, status: number, code: QTechErrorCode, message?: string): void {
  sendJson(res, status, {
    code,
    message: message || code.replace(/_/g, " ").toLowerCase(),
  });
}
