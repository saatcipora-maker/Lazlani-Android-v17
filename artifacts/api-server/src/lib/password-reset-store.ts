import { and, eq, lt, sql } from "drizzle-orm";
import { db, passwordResetTokensTable } from "@workspace/db";
import { PASSWORD_RESET_MAX_ATTEMPTS } from "./password-reset";

export async function consumeFailedResetAttempt(tokenId: number): Promise<number | null> {
  const [attempt] = await db
    .update(passwordResetTokensTable)
    .set({ failedAttempts: sql`${passwordResetTokensTable.failedAttempts} + 1` })
    .where(
      and(
        eq(passwordResetTokensTable.id, tokenId),
        lt(passwordResetTokensTable.failedAttempts, PASSWORD_RESET_MAX_ATTEMPTS),
      ),
    )
    .returning({ failedAttempts: passwordResetTokensTable.failedAttempts });

  return attempt?.failedAttempts ?? null;
}