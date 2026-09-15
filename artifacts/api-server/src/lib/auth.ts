import { and, eq, gt } from "drizzle-orm";
import { type Request } from "express";
import {
  authUsersTable,
  authSessionsTable,
  db,
  passwordCredentialsTable,
  type AuthUser,
} from "@workspace/db";
import { createHash } from "node:crypto";

export function bearerToken(req: Request): string | null {
  const value = req.headers.authorization;
  if (!value?.startsWith("Bearer ")) return null;
  return value.slice(7).trim() || null;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type AuthenticatedSession = {
  user: AuthUser;
  id: string;
  tokenHash: string;
  expiresAt: Date;
};

/**
 * Resolve the bearer token to the server-owned user. Callers must use the
 * returned user id for writes; request payload actor ids are never trusted.
 */
export async function authenticatedSession(req: Request): Promise<AuthenticatedSession | null> {
  const token = bearerToken(req);
  if (!token) return null;

  const [row] = await db
    .select({
      user: authUsersTable,
      id: authSessionsTable.id,
      tokenHash: authSessionsTable.tokenHash,
      expiresAt: authSessionsTable.expiresAt,
    })
    .from(authSessionsTable)
    .innerJoin(authUsersTable, eq(authSessionsTable.userId, authUsersTable.id))
    .innerJoin(passwordCredentialsTable, eq(authUsersTable.email, passwordCredentialsTable.email))
    .where(
      and(
        eq(authSessionsTable.tokenHash, hashSessionToken(token)),
        gt(authSessionsTable.expiresAt, new Date()),
        eq(authSessionsTable.credentialUpdatedAt, passwordCredentialsTable.updatedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function authenticatedUser(req: Request): Promise<AuthUser | null> {
  return (await authenticatedSession(req))?.user ?? null;
}

/**
 * Recheck a long-lived stream against the durable session and credentials.
 * The token hash is safe to retain as an opaque session identity, but is
 * never logged or returned to clients.
 */
export async function isSessionActive(
  tokenHash: string,
  userId: string,
  expiresAt: Date,
): Promise<boolean> {
  if (expiresAt.getTime() <= Date.now()) return false;
  const [row] = await db
    .select({ tokenHash: authSessionsTable.tokenHash })
    .from(authSessionsTable)
    .innerJoin(authUsersTable, eq(authSessionsTable.userId, authUsersTable.id))
    .innerJoin(passwordCredentialsTable, eq(authUsersTable.email, passwordCredentialsTable.email))
    .where(
      and(
        eq(authSessionsTable.tokenHash, tokenHash),
        eq(authSessionsTable.userId, userId),
        gt(authSessionsTable.expiresAt, new Date()),
        eq(authSessionsTable.credentialUpdatedAt, passwordCredentialsTable.updatedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}