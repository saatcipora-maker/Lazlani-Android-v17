import { desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import {
  ListAdminUsersResponse,
  UpdateAdminUserRoleBody,
  UpdateAdminUserRoleResponse,
} from "@workspace/api-zod";
import { authUsersTable, db, type AuthUser } from "@workspace/db";
import { authenticatedUser } from "../lib/auth";

const router: IRouter = Router();
type AuthorizationResult =
  | { status: 401 | 403; error: string }
  | { user: AuthUser };

function serializeAdminUser(user: typeof authUsersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    isSuperAdmin: user.isSuperAdmin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function superadmin(req: Request): Promise<AuthorizationResult> {
  const user = await authenticatedUser(req);
  if (!user) return { status: 401 as const, error: "Oturum gerekli." };
  if (!user.isSuperAdmin) return { status: 403 as const, error: "Superadmin yetkisi gerekli." };
  return { user };
}

router.get("/admin/users", async (req, res): Promise<void> => {
  const authorization = await superadmin(req);
  if ("error" in authorization) {
    res.status(authorization.status).json({ error: authorization.error });
    return;
  }

  const users = await db
    .select()
    .from(authUsersTable)
    .orderBy(desc(authUsersTable.createdAt));
  res.json(ListAdminUsersResponse.parse({
    users: users.map(serializeAdminUser),
  }));
});

router.patch("/admin/users/:userId/role", async (req, res): Promise<void> => {
  const authorization = await superadmin(req);
  if ("error" in authorization) {
    res.status(authorization.status).json({ error: authorization.error });
    return;
  }

  const parsed = UpdateAdminUserRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Rol yalnızca user veya admin olabilir." });
    return;
  }
  const { userId } = req.params;
  if (userId === authorization.user.id) {
    res.status(400).json({ error: "Kendi rolünüzü değiştiremezsiniz." });
    return;
  }

  const result = await db.transaction(async tx => {
    const [target] = await tx
      .select()
      .from(authUsersTable)
      .where(eq(authUsersTable.id, userId))
      .limit(1);
    if (!target) return { kind: "not-found" as const };
    if (target.isSuperAdmin) return { kind: "superadmin" as const };

    const [updated] = await tx
      .update(authUsersTable)
      .set({
        isAdmin: parsed.data.role === "admin",
        updatedAt: new Date(),
      })
      .where(eq(authUsersTable.id, target.id))
      .returning();
    return updated ? { kind: "updated" as const, user: updated } : { kind: "not-found" as const };
  });

  if (result.kind === "not-found") {
    res.status(404).json({ error: "Kullanıcı bulunamadı." });
    return;
  }
  if (result.kind === "superadmin") {
    res.status(409).json({ error: "Superadmin rolü yalnızca bootstrap CLI ile değiştirilebilir." });
    return;
  }
  res.json(UpdateAdminUserRoleResponse.parse({
    user: serializeAdminUser(result.user),
  }));
});

export default router;