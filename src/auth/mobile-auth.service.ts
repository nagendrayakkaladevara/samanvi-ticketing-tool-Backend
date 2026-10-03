import { createHash, createHmac, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { env } from "../config/env";
import { AppError } from "../core/errors/app-error";
import { prisma } from "../lib/prisma";
import { hashPassword, verifyPassword } from "./password";

const MOBILE_ISSUER = "samanvi-api";
const MOBILE_AUDIENCE = "samanvi-driver-mobile";
const DAY_MS = 86_400_000;
const dummyPasswordHash = hashPassword(randomBytes(32).toString("base64url"));

function requireMobileSecret(value: string | undefined, name: string): string {
  if (!value || value.length < 32) {
    throw mobileAuthError(
      503,
      "MOBILE_AUTH_NOT_CONFIGURED",
      `Mobile authentication is unavailable because ${name} is not configured correctly.`,
    );
  }
  return value;
}

export interface MobileAccessTokenPayload {
  sub: string;
  sid: string;
  deviceBindingId: string;
  tokenType: "mobile_driver";
  username: string;
  displayName: string;
}

export interface MobileDeviceInput {
  installationId: string;
  platform?: string;
  deviceName?: string;
  osVersion?: string;
  appVersion?: string;
}

export function mobileAuthError(
  statusCode: number,
  code: string,
  message: string,
): AppError {
  return new AppError({ statusCode, code, message });
}

export function normalizeMobileUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function hashInstallationId(installationId: string): string {
  return createHmac(
    "sha256",
    requireMobileSecret(env.mobileDevicePepper, "MOBILE_DEVICE_PEPPER"),
  )
    .update(installationId)
    .digest("hex");
}

function newRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function issueMobileAccessToken(input: {
  userId: string;
  sessionId: string;
  deviceId: string;
  username: string;
  displayName: string;
}): string {
  const payload: MobileAccessTokenPayload = {
    sub: input.userId,
    sid: input.sessionId,
    deviceBindingId: input.deviceId,
    tokenType: "mobile_driver",
    username: input.username,
    displayName: input.displayName,
  };
  return jwt.sign(
    payload,
    requireMobileSecret(env.mobileJwtSecret, "MOBILE_JWT_SECRET"),
    {
      algorithm: "HS256",
      issuer: MOBILE_ISSUER,
      audience: MOBILE_AUDIENCE,
      expiresIn: env.mobileAccessTokenExpiresIn as jwt.SignOptions["expiresIn"],
      jwtid: randomBytes(16).toString("hex"),
    },
  );
}

export function verifyMobileAccessToken(token: string): MobileAccessTokenPayload {
  const secret = requireMobileSecret(env.mobileJwtSecret, "MOBILE_JWT_SECRET");
  try {
    const payload = jwt.verify(
      token,
      secret,
      {
        algorithms: ["HS256"],
        issuer: MOBILE_ISSUER,
        audience: MOBILE_AUDIENCE,
      },
    ) as MobileAccessTokenPayload;
    if (payload.tokenType !== "mobile_driver" || !payload.sid || !payload.deviceBindingId) {
      throw new Error("Invalid mobile token claims");
    }
    return payload;
  } catch {
    throw mobileAuthError(401, "ACCESS_TOKEN_INVALID", "Your session is invalid or has expired.");
  }
}

function serializeMobileUser(user: {
  id: string;
  username: string;
  displayName: string;
  driverId: string | null;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    driverId: user.driverId,
  };
}

export async function loginMobileDriver(input: {
  username: string;
  password: string;
  device: MobileDeviceInput;
  requestId?: string;
}) {
  const username = normalizeMobileUsername(input.username);
  const user = await prisma.mobileDriverUser.findUnique({ where: { username } });
  const passwordMatches = user
    ? await verifyPassword(input.password, user.passwordHash)
    : await verifyPassword(input.password, await dummyPasswordHash);

  if (!user || !passwordMatches || user.deletedAt) {
    throw mobileAuthError(401, "INVALID_CREDENTIALS", "Invalid username or password.");
  }
  if (!user.isActive) {
    await prisma.mobileDriverAuthAudit.create({
      data: { userId: user.id, eventType: "LOGIN_BLOCKED_INACTIVE", requestId: input.requestId },
    });
    throw mobileAuthError(401, "ACCOUNT_DEACTIVATED", "This account has been deactivated. Please contact the administrator.");
  }

  const installationIdHash = hashInstallationId(input.device.installationId);
  const now = new Date();
  const refreshToken = newRefreshToken();

  const result = await prisma.$transaction(async (tx) => {
    const existingDevice = await tx.mobileDriverDevice.findUnique({ where: { userId: user.id } });
    if (existingDevice && existingDevice.installationIdHash !== installationIdHash) {
      await tx.mobileDriverAuthAudit.create({
        data: { userId: user.id, eventType: "LOGIN_BLOCKED_DEVICE_MISMATCH", requestId: input.requestId },
      });
      throw mobileAuthError(
        409,
        "DEVICE_ALREADY_REGISTERED",
        "This account is already registered to another device. Please contact the administrator.",
      );
    }

    const device = await tx.mobileDriverDevice.upsert({
      where: { userId: user.id },
      update: {
        lastSeenAt: now,
        platform: input.device.platform,
        deviceName: input.device.deviceName,
        osVersion: input.device.osVersion,
        appVersion: input.device.appVersion,
      },
      create: {
        userId: user.id,
        installationIdHash,
        platform: input.device.platform,
        deviceName: input.device.deviceName,
        osVersion: input.device.osVersion,
        appVersion: input.device.appVersion,
      },
    });
    // Re-check after the upsert so simultaneous first logins from two devices
    // cannot both enroll successfully.
    if (device.installationIdHash !== installationIdHash) {
      throw mobileAuthError(
        409,
        "DEVICE_ALREADY_REGISTERED",
        "This account is already registered to another device. Please contact the administrator.",
      );
    }

    await tx.mobileDriverSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now, revocationReason: "NEW_LOGIN" },
    });

    const absoluteExpiresAt = new Date(now.getTime() + env.mobileSessionAbsoluteDays * DAY_MS);
    const expiresAt = new Date(
      Math.min(now.getTime() + env.mobileRefreshTokenDays * DAY_MS, absoluteExpiresAt.getTime()),
    );
    const session = await tx.mobileDriverSession.create({
      data: {
        userId: user.id,
        deviceId: device.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt,
        absoluteExpiresAt,
      },
    });
    await tx.mobileDriverAuthAudit.create({
      data: {
        userId: user.id,
        eventType: existingDevice ? "LOGIN_SUCCESS" : "DEVICE_REGISTERED",
        requestId: input.requestId,
        metadata: { platform: input.device.platform, appVersion: input.device.appVersion },
      },
    });
    return { device, session, firstRegistration: !existingDevice };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return {
    accessToken: issueMobileAccessToken({
      userId: user.id,
      sessionId: result.session.id,
      deviceId: result.device.id,
      username: user.username,
      displayName: user.displayName,
    }),
    refreshToken,
    tokenType: "Bearer" as const,
    accessTokenExpiresIn: env.mobileAccessTokenExpiresIn,
    refreshTokenExpiresAt: result.session.expiresAt,
    user: serializeMobileUser(user),
    device: {
      platform: result.device.platform,
      deviceName: result.device.deviceName,
      registeredAt: result.device.registeredAt,
      firstRegistration: result.firstRegistration,
    },
  };
}

export async function refreshMobileSession(input: {
  refreshToken: string;
  installationId: string;
  requestId?: string;
}) {
  const oldHash = hashRefreshToken(input.refreshToken);
  const session = await prisma.mobileDriverSession.findUnique({
    where: { refreshTokenHash: oldHash },
    include: { user: true, device: true },
  });
  const now = new Date();
  if (!session || session.revokedAt || session.expiresAt <= now || session.absoluteExpiresAt <= now) {
    throw mobileAuthError(401, "REFRESH_TOKEN_INVALID", "Your session has expired. Please sign in again.");
  }
  if (session.user.deletedAt || !session.user.isActive) {
    await prisma.mobileDriverSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: now, revocationReason: "ACCOUNT_INACTIVE" },
    });
    throw mobileAuthError(401, "ACCOUNT_DEACTIVATED", "This account has been deactivated. Please contact the administrator.");
  }
  if (
    !session.device ||
    session.device.userId !== session.userId ||
    session.device.installationIdHash !== hashInstallationId(input.installationId)
  ) {
    throw mobileAuthError(401, "DEVICE_BINDING_INVALID", "This session is not valid on this device.");
  }

  const refreshToken = newRefreshToken();
  const expiresAt = new Date(
    Math.min(now.getTime() + env.mobileRefreshTokenDays * DAY_MS, session.absoluteExpiresAt.getTime()),
  );
  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.mobileDriverSession.updateMany({
      where: { id: session.id, refreshTokenHash: oldHash, revokedAt: null },
      data: {
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt,
        lastUsedAt: now,
      },
    });
    if (claimed.count !== 1) {
      throw mobileAuthError(401, "REFRESH_TOKEN_REUSED", "Your session is no longer valid. Please sign in again.");
    }
    await tx.mobileDriverDevice.update({ where: { id: session.device!.id }, data: { lastSeenAt: now } });
    return tx.mobileDriverSession.findUniqueOrThrow({ where: { id: session.id } });
  });

  return {
    accessToken: issueMobileAccessToken({
      userId: session.user.id,
      sessionId: updated.id,
      deviceId: session.device.id,
      username: session.user.username,
      displayName: session.user.displayName,
    }),
    refreshToken,
    tokenType: "Bearer" as const,
    accessTokenExpiresIn: env.mobileAccessTokenExpiresIn,
    refreshTokenExpiresAt: updated.expiresAt,
    user: serializeMobileUser(session.user),
  };
}
