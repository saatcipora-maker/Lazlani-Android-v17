import { and, asc, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { db, passwordResetTokensTable } from "@workspace/db";

const CLEANUP_LOCK = "password-reset-token-cleanup";
export const PASSWORD_RESET_TOKEN_RETENTION_MS = 24 * 60 * 60 * 1_000;
export const PASSWORD_RESET_CLEANUP_BATCH_SIZE = 1_000;

export async function cleanupPasswordResetTokens(options?: {
  now?: Date;
  retentionMs?: number;
  batchSize?: number;
}): Promise<number> {
  const now = options?.now ?? new Date();
  const retentionMs = options?.retentionMs ?? PASSWORD_RESET_TOKEN_RETENTION_MS;
  const batchSize = options?.batchSize ?? PASSWORD_RESET_CLEANUP_BATCH_SIZE;
  if (!Number.isFinite(retentionMs) || retentionMs < 0) {
    throw new Error("Password reset token retention must be a non-negative finite duration.");
  }
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("Password reset cleanup batch size must be a positive integer.");
  }
  const cutoff = new Date(now.getTime() - retentionMs);

  return db.transaction(async tx => {
    const lockResult = await tx.execute<{ acquired: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(hashtext(${CLEANUP_LOCK})) AS acquired`,
    );
    if (!lockResult.rows[0]?.acquired) return 0;

    const candidates = await tx
      .select({ id: passwordResetTokensTable.id })
      .from(passwordResetTokensTable)
      .where(
        or(
          and(
            isNotNull(passwordResetTokensTable.usedAt),
            lt(passwordResetTokensTable.usedAt, cutoff),
          ),
          lt(passwordResetTokensTable.expiresAt, cutoff),
        ),
      )
      .orderBy(asc(passwordResetTokensTable.id))
      .limit(batchSize);
    if (candidates.length === 0) return 0;

    const deleted = await tx
      .delete(passwordResetTokensTable)
      .where(inArray(passwordResetTokensTable.id, candidates.map(token => token.id)))
      .returning({ id: passwordResetTokensTable.id });
    return deleted.length;
  });
}