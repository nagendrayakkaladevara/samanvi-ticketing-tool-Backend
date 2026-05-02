import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { unauthorized } from "../core/errors/http-errors";
import { getRoleLabel, type RoleCode } from "./roles";

export interface AuthUser {
  id: string;
  username: string;
  roleCode: RoleCode;
  roleLabel: string;
  displayName: string;
}

interface AuthUserWithPassword extends AuthUser {
  password: string;
}

export interface AccessTokenPayload {
  sub: string;
  username: string;
  roleCode: RoleCode;
  roleLabel: string;
  displayName: string;
}

const demoUsers: AuthUserWithPassword[] = [
  {
    id: "usr-admin-1",
    username: "admin",
    password: "admin123",
    roleCode: "admin",
    roleLabel: "Admin",
    displayName: "Admin User",
  },
  {
    id: "usr-supervisor-1",
    username: "supervisor",
    password: "supervisor123",
    roleCode: "supervisor",
    roleLabel: "Supervisor",
    displayName: "Supervisor User",
  },
  {
    id: "usr-worker-1",
    username: "worker",
    password: "worker123",
    roleCode: "worker",
    roleLabel: "Worker",
    displayName: "Worker User",
  },
];

export function authenticateDemoUser(
  username: string,
  password: string,
): AuthUser | null {
  const user = demoUsers.find(
    (u) => u.username === username && u.password === password,
  );
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    roleCode: user.roleCode,
    roleLabel: user.roleLabel ?? getRoleLabel(user.roleCode),
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
