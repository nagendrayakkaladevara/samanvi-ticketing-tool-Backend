import { createHash } from "node:crypto";

export function hashPassword(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function verifyPassword(value: string, hash: string): boolean {
  return hashPassword(value) === hash;
}
