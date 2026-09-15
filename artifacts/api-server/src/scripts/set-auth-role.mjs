import { eq, sql } from "drizzle-orm";
import { authUsersTable, db, pool } from "@workspace/db";

const args = process.argv.slice(2);
const usage = "Usage: auth-role --email <existing-user-email> --role <admin|superadmin|revoke>";

if (
  args.length !== 4
  || !["--email", "--role"].includes(args[0])
  || !["--email", "--role"].includes(args[2])
  || args[0] === args[2]
) {
  throw new Error(usage);
}

const email = (args[0] === "--email" ? args[1] : args[3]).trim().toLowerCase();
const role = args[0] === "--role" ? args[1] : args[3];
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("A valid existing user's email is required.");
}
if (!["admin", "superadmin", "revoke"].includes(role)) {
  throw new Error("Role must be admin, superadmin, or revoke.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

try {
  const result = await db.transaction(async tx => {
    // Serialize bootstrap role changes so two concurrent revocations cannot
    // remove the last superadmin.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('auth-role-bootstrap'))`);
    const [target] = await tx
      .select({
        id: authUsersTable.id,
        email: authUsersTable.email,
        isSuperAdmin: authUsersTable.isSuperAdmin,
      })
      .from(authUsersTable)
      .where(eq(authUsersTable.email, email))
      .limit(1);
    if (!target) return { kind: "not-found" };

    const removingSuperadmin = target.isSuperAdmin && role !== "superadmin";
    if (removingSuperadmin) {
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(authUsersTable)
        .where(eq(authUsersTable.isSuperAdmin, true));
      if (Number(count) <= 1) return { kind: "last-superadmin" };
    }

    const [updated] = await tx
      .update(authUsersTable)
      .set({
        isAdmin: role !== "revoke",
        isSuperAdmin: role === "superadmin",
        updatedAt: new Date(),
      })
      .where(eq(authUsersTable.id, target.id))
      .returning({
        id: authUsersTable.id,
        email: authUsersTable.email,
        isAdmin: authUsersTable.isAdmin,
        isSuperAdmin: authUsersTable.isSuperAdmin,
      });
    return { kind: "updated", user: updated };
  });

  if (result.kind === "not-found") throw new Error("No auth user exists with that normalized email.");
  if (result.kind === "last-superadmin") {
    throw new Error("Refused: cannot remove the last superadmin.");
  }
  console.info(JSON.stringify(result.user));
} finally {
  await pool.end();
}