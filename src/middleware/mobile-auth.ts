import type { RequestHandler } from "express";
import { verifyMobileAccessToken, mobileAuthError } from "../auth/mobile-auth.service";
import { prisma } from "../lib/prisma";

export const requireMobileDriverAuth: RequestHandler = async (req, _res, next) => {
  try {
    const authorization = req.headers.authorization;
    const [scheme, token] = authorization?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) {
      throw mobileAuthError(401, "MOBILE_AUTH_REQUIRED", "Please sign in to continue.");
    }
    const payload = verifyMobileAccessToken(token);
    const session = await prisma.mobileDriverSession.findUnique({
      where: { id: payload.sid },
      include: { user: true, device: true },
    });
    if (!session || session.userId !== payload.sub || session.revokedAt) {
      throw mobileAuthError(401, "SESSION_REVOKED", "Your session is no longer valid. Please sign in again.");
    }
    if (session.user.deletedAt) {
      throw mobileAuthError(401, "ACCOUNT_DELETED", "This account is no longer available.");
    }
    if (!session.user.isActive) {
      throw mobileAuthError(401, "ACCOUNT_DEACTIVATED", "This account has been deactivated. Please contact the administrator.");
    }
    if (!session.device || session.device.id !== payload.deviceBindingId) {
      throw mobileAuthError(401, "DEVICE_BINDING_INVALID", "This session is not valid on this device.");
    }
    req.mobileDriver = payload;
    next();
  } catch (error) {
    next(error);
  }
};
