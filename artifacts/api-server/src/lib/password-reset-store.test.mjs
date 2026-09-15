import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { db, passwordResetTokensTable } from "@workspace/db";
import { consumeFailedResetAttempt } from "./password-reset-store.ts";
import { cleanupPasswordResetTokens } from "./password-reset-cleanup.ts";

test("parallel failed attempts cannot exceed the reset-code limit", async () => {
  const email = `security-test-${Date.now()}@example.com`;
  const [token] = await db
    .insert(passwordResetTokensTable)
    .values({
      email,
      codeHash: "0".repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    })
    .returning({ id: passwordResetTokensTable.id });

  assert.ok(token);

  try {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => consumeFailedResetAttempt(token.id)),
    );
    const accepted = results.filter((value) => value !== null);

    assert.equal(accepted.length, 5);
    assert.deepEqual([...accepted].sort((left, right) => left - right), [1, 2, 3, 4, 5]);

    const [stored] = await db
      .select({ failedAttempts: passwordResetTokensTable.failedAttempts })
      .from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.id, token.id))
      .limit(1);

    assert.equal(stored?.failedAttempts, 5);
  } finally {
    await db.delete(passwordResetTokensTable).where(eq(passwordResetTokensTable.id, token.id));
  }
});

test("cleanup deletes only safely retained used or expired reset tokens", async () => {
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `cleanup-${marker}@example.com`;
  const now = new Date();
  const hour = 60 * 60 * 1_000;
  await db
    .insert(passwordResetTokensTable)
    .values([
      {
        email,
        codeHash: `active-${marker}`,
        expiresAt: new Date(now.getTime() + hour),
        createdAt: new Date(now.getTime() - 48 * hour),
      },
      {
        email,
        codeHash: `recent-used-${marker}`,
        expiresAt: new Date(now.getTime() + hour),
        usedAt: new Date(now.getTime() - 30 * 60 * 1_000),
      },
      {
        email,
        codeHash: `old-used-${marker}`,
        expiresAt: new Date(now.getTime() + hour),
        usedAt: new Date(now.getTime() - 2 * hour),
      },
      {
        email,
        codeHash: `recent-expired-${marker}`,
        expiresAt: new Date(now.getTime() - 30 * 60 * 1_000),
      },
      {
        email,
        codeHash: `old-expired-${marker}`,
        expiresAt: new Date(now.getTime() - 2 * hour),
      },
    ]);

  try {
    const deletedCounts = await Promise.all([
      cleanupPasswordResetTokens({ now, retentionMs: hour }),
      cleanupPasswordResetTokens({ now, retentionMs: hour }),
    ]);
    assert.equal(deletedCounts.reduce((total, count) => total + count, 0), 2);

    const remaining = await db
      .select({ codeHash: passwordResetTokensTable.codeHash })
      .from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.email, email));
    assert.deepEqual(
      remaining.map(token => token.codeHash).sort(),
      [`active-${marker}`, `recent-expired-${marker}`, `recent-used-${marker}`].sort(),
    );
  } finally {
    await db.delete(passwordResetTokensTable).where(eq(passwordResetTokensTable.email, email));
  }
});