import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const PASSWORD_HASH_PREFIX = "scrypt";
const CODE_TTL_MS = 15 * 60 * 1000;
const scryptAsync = promisify(scrypt);

export const PASSWORD_RESET_CODE_TTL_SECONDS = CODE_TTL_MS / 1000;
export const PASSWORD_RESET_MAX_ATTEMPTS = 5;

function resetCodeSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be configured for password reset codes.");
  }
  return secret;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createResetCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashResetCode(email: string, code: string): string {
  return createHash("sha256")
    .update(`${resetCodeSecret()}:${normalizeEmail(email)}:${code}`)
    .digest("hex");
}

export async function createPasswordHash(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64) as Buffer).toString("hex");
  return `${PASSWORD_HASH_PREFIX}$${salt}$${derivedKey}`;
}

export async function verifyPasswordHash(password: string, encodedHash: string): Promise<boolean> {
  const [prefix, salt, expectedHex] = encodedHash.split("$");
  if (prefix !== PASSWORD_HASH_PREFIX || !salt || !expectedHex) return false;

  try {
    const actual = await scryptAsync(password, salt, 64) as Buffer;
    const expected = Buffer.from(expectedHex, "hex");
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function hashesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function getResetExpiry(): Date {
  return new Date(Date.now() + CODE_TTL_MS);
}