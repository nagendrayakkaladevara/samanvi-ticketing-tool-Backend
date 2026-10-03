import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  loginMobileDriver,
  mobileAuthError,
  normalizeMobileUsername,
  refreshMobileSession,
} from "../auth/mobile-auth.service";
import { badRequest } from "../core/errors/http-errors";
import { asyncHandler } from "../core/http/async-handler";
import { prisma } from "../lib/prisma";
import { requireMobileDriverAuth } from "../middleware/mobile-auth";

const deviceSchema = z.object({
  installationId: z.string().trim().min(16).max(200),
  platform: z.enum(["android", "ios"]).optional(),
  deviceName: z.string().trim().max(120).optional(),
  osVersion: z.string().trim().max(50).optional(),
  appVersion: z.string().trim().max(50).optional(),
});

const loginSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(1).max(128),
  device: deviceSchema,
});

const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(500),
  installationId: z.string().trim().min(16).max(200),
});

const mobileLoginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const username = typeof req.body?.username === "string"
      ? normalizeMobileUsername(req.body.username)
      : "unknown";
    return `${req.ip ?? "unknown"}:${username}`;
  },
  validate: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many login attempts. Please wait and try again.",
      code: "LOGIN_RATE_LIMITED",
      requestId: req.requestId,
    });
  },
});

const mobileAuthRouter = Router();

mobileAuthRouter.post("/login", mobileLoginLimiter, asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid mobile login payload", { issues: parsed.error.issues });
  }
  const result = await loginMobileDriver({ ...parsed.data, requestId: req.requestId });
  res.set("Cache-Control", "no-store");
  res.status(200).json({ success: true, data: result });
}));

mobileAuthRouter.post("/refresh", asyncHandler(async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    throw mobileAuthError(401, "REFRESH_TOKEN_INVALID", "Your session has expired. Please sign in again.");
  }
  const result = await refreshMobileSession({ ...parsed.data, requestId: req.requestId });
  res.set("Cache-Control", "no-store");
  res.status(200).json({ success: true, data: result });
}));

mobileAuthRouter.post("/logout", requireMobileDriverAuth, asyncHandler(async (req, res) => {
  const sessionId = req.mobileDriver!.sid;
  const now = new Date();
  await prisma.$transaction([
    prisma.mobileDriverSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now, revocationReason: "LOGOUT" },
    }),
    prisma.mobileDriverAuthAudit.create({
      data: {
        userId: req.mobileDriver!.sub,
        eventType: "LOGOUT",
        requestId: req.requestId,
      },
    }),
  ]);
  res.status(200).json({ success: true, data: { loggedOut: true } });
}));

mobileAuthRouter.get("/me", requireMobileDriverAuth, asyncHandler(async (req, res) => {
  const user = await prisma.mobileDriverUser.findUnique({
    where: { id: req.mobileDriver!.sub },
    select: {
      id: true,
      username: true,
      displayName: true,
      driverId: true,
      device: {
        select: {
          platform: true,
          deviceName: true,
          registeredAt: true,
          lastSeenAt: true,
        },
      },
    },
  });
  if (!user) {
    throw mobileAuthError(401, "ACCOUNT_DELETED", "This account is no longer available.");
  }
  res.set("Cache-Control", "no-store");
  res.status(200).json({ success: true, data: { user } });
}));

export { mobileAuthRouter };
