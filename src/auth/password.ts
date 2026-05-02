import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey);
    });
  });
}

const SCRYPT_PREFIX = "scrypt$";
const SALT_BYTES = 16;
const KEY_BYTES = 64;
/** OWASP-aligned work factor; tune upward if hardware allows. */
const SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
} as const;

const LEGACY_SHA256_HEX = /^[a-f0-9]{64}$/i;

function verifyLegacySha256(password: string, storedHex: string): boolean {
  const digest = createHash("sha256").update(password).digest();
  let stored: Buffer;
  try {
    stored = Buffer.from(storedHex, "hex");
  } catch {
    return false;
  }
  if (stored.length !== digest.length) {
    return false;
  }
  return timingSafeEqual(digest, stored);
}

export async function hashPassword(value: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await scryptAsync(value, salt, KEY_BYTES, SCRYPT_OPTIONS);
  return `${SCRYPT_PREFIX}${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  if (stored.startsWith(SCRYPT_PREFIX)) {
    const rest = stored.slice(SCRYPT_PREFIX.length);
    const lastSep = rest.lastIndexOf("$");
    if (lastSep <= 0) {
      return false;
    }
    const saltB64 = rest.slice(0, lastSep);
    const keyB64 = rest.slice(lastSep + 1);
    let salt: Buffer;
    let expectedKey: Buffer;
    try {
      salt = Buffer.from(saltB64, "base64url");
      expectedKey = Buffer.from(keyB64, "base64url");
    } catch {
      return false;
    }
    if (salt.length !== SALT_BYTES || expectedKey.length !== KEY_BYTES) {
      return false;
    }
    const derivedKey = await scryptAsync(
      password,
      salt,
      KEY_BYTES,
      SCRYPT_OPTIONS,
    );
    return timingSafeEqual(derivedKey, expectedKey);
  }

  if (LEGACY_SHA256_HEX.test(stored)) {
    return verifyLegacySha256(password, stored);
  }

  return false;
}
