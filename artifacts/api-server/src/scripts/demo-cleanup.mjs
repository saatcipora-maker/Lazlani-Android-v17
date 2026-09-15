import { and, eq, inArray } from "drizzle-orm";
import {
  authSessionsTable,
  authUsersTable,
  db,
  passwordCredentialsTable,
  passwordResetTokensTable,
} from "@workspace/db";

const DATASET_VERSION = "lazlani-demo-auth-v1";
const DEMO_ACCOUNTS = [
  { id: "u1", email: "ayse@example.com" },
  { id: "u2", email: "mehmet@example.com" },
  { id: "u3", email: "elif@example.com" },
  { id: "u4", email: "burak@example.com" },
  { id: "u5", email: "zeynep@example.com" },
];
async function main() {
  const apply = process.argv.includes("--apply");

  if (process.env.NODE_ENV === "production" || process.env.DEMO_CLEANUP_TARGET !== "development") {
    throw new Error("Demo cleanup is restricted to an explicitly marked development database.");
  }
  if (apply && process.env.DEMO_CLEANUP_CONFIRM !== DATASET_VERSION) {
    throw new Error(`Apply refused. Set DEMO_CLEANUP_CONFIRM=${DATASET_VERSION} after reviewing dry-run.`);
  }

  const ids = DEMO_ACCOUNTS.map(account => account.id);
  const expectedById = new Map(DEMO_ACCOUNTS.map(account => [account.id, account.email]));
  const users = await db.select({
    id: authUsersTable.id,
    email: authUsersTable.email,
  }).from(authUsersTable).where(inArray(authUsersTable.id, ids));

  const approvedUsers = users.filter(user => expectedById.get(user.id) === user.email);
  const ambiguousUsers = users.filter(user => expectedById.get(user.id) !== user.email);
  const approvedIds = approvedUsers.map(user => user.id);
  const approvedEmails = approvedUsers.map(user => user.email);
  const sessions = approvedIds.length
    ? await db.select({ userId: authSessionsTable.userId })
      .from(authSessionsTable).where(inArray(authSessionsTable.userId, approvedIds))
    : [];
  const credentials = approvedEmails.length
    ? await db.select({ email: passwordCredentialsTable.email })
      .from(passwordCredentialsTable).where(inArray(passwordCredentialsTable.email, approvedEmails))
    : [];
  const resetTokens = approvedEmails.length
    ? await db.select({ email: passwordResetTokensTable.email })
      .from(passwordResetTokensTable).where(inArray(passwordResetTokensTable.email, approvedEmails))
    : [];

  const report = {
    datasetVersion: DATASET_VERSION,
    mode: apply ? "apply" : "dry-run",
    approvedAccountIds: approvedIds,
    ambiguousAccountIds: ambiguousUsers.map(user => user.id),
    counts: {
      users: approvedUsers.length,
      sessions: sessions.length,
      credentials: credentials.length,
      passwordResetTokens: resetTokens.length,
    },
    protectedAccountIds: ["superadmin"],
  };

  console.info(JSON.stringify(report, null, 2));

  if (apply) {
    if (ambiguousUsers.length > 0) {
      throw new Error("Apply refused because a manifest ID has an unexpected email.");
    }
    await db.transaction(async tx => {
      for (const account of approvedUsers) {
        await tx.delete(authSessionsTable).where(eq(authSessionsTable.userId, account.id));
        await tx.delete(passwordResetTokensTable).where(eq(passwordResetTokensTable.email, account.email));
        await tx.delete(passwordCredentialsTable).where(eq(passwordCredentialsTable.email, account.email));
        await tx.delete(authUsersTable).where(and(
          eq(authUsersTable.id, account.id),
          eq(authUsersTable.email, account.email),
        ));
      }
    });
    console.info(JSON.stringify({ ...report, completed: true }, null, 2));
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});