import type { Request, Response } from "express";
import { SESSION_COOKIE, cookieOptions } from "../middleware/auth.js";
import * as auth from "../services/auth.service.js";

function meta(req: Request) {
  return { userAgent: req.get("user-agent"), ip: req.ip };
}

export async function register(req: Request, res: Response) {
  const user = await auth.register(req.body);
  const { token, expiresAt } = await auth.createSession(user.id, meta(req));
  res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt.getTime() - Date.now()));
  res.status(201).json({ user: await auth.getMe(user.id) });
}

export async function login(req: Request, res: Response) {
  const user = await auth.verifyCredentials(req.body);
  const { token, expiresAt } = await auth.createSession(user.id, meta(req));
  res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt.getTime() - Date.now()));
  res.json({ user: await auth.getMe(user.id) });
}

export async function logout(req: Request, res: Response) {
  if (req.user) await auth.destroySession(req.user.sessionId);
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  res.json({ user: await auth.getMe(req.user!.id) });
}

export async function forgotPassword(req: Request, res: Response) {
  await auth.requestPasswordReset(req.body.email);
  res.json({ message: "If an account exists for that email, a reset link is on its way." });
}

export async function resetPassword(req: Request, res: Response) {
  await auth.resetPassword(req.body.token, req.body.password);
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.json({ message: "Password updated. Sign in with your new password." });
}

export async function changePassword(req: Request, res: Response) {
  await auth.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword, req.user!.sessionId);
  res.json({ message: "Password updated. Other devices have been signed out." });
}
