import type { RoleCode as PrismaRoleCode } from "@prisma/client";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { unauthorized } from "../core/errors/http-errors";
import { prisma } from "../lib/prisma";
import { verifyPassword } from "./password";
import { getRoleLabel, type RoleCode } from "./roles";

export interface AuthUser {
  id: string;
  username: string;
  roleCode: RoleCode;
  roleLabel: string;
  displayName: string;
}

export interface AccessTokenPayload {
  sub: string;
  username: string;
  roleCode: RoleCode;
  roleLabel: string;
  displayName: string;
}

function toRoleCode(roleCode: PrismaRoleCode): RoleCode {
  return roleCode;
}

export async function authenticateUser(
  username: string,
  password: string,
): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      role: {
        select: {
          code: true,
          label: true,
        },
      },
    },
  });

  if (!user || !user.isActive) {
    return null;
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return null;
  }

  const roleCode = toRoleCode(user.role.code);

  return {
    id: user.id,
    username: user.username,
    roleCode,
    roleLabel: user.role.label ?? getRoleLabel(roleCode),
    displayName: user.displayName,
  };
}

export function issueAccessToken(user: AuthUser): string {
  const payload: AccessTokenPayload = {
    sub: user.id,
    username: user.username,
    roleCode: user.roleCode,
    roleLabel: user.roleLabel ?? getRoleLabel(user.roleCode),
    displayName: user.displayName,
  };

  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
  } catch {
    throw unauthorized("Invalid or expired token");
  }
}
