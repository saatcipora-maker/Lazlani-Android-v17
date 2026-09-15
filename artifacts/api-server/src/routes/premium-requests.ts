import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  ApprovePremiumRequestResponse,
  CreatePremiumRequestBody,
  CreatePremiumRequestResponse,
  GetPremiumRequestResponse,
  ListAdminPremiumRequestsResponse,
  ListPremiumRequestsResponse,
  RejectPremiumRequestResponse,
} from "@workspace/api-zod";
import {
  authUsersTable,
  db,
  premiumRequestsTable,
  type AuthUser,
  type PremiumRequest,
} from "@workspace/db";
import { authenticatedUser } from "../lib/auth";

export const PREMIUM_MONTHLY_PRICE_TRY = 100;

const router: IRouter = Router();

type PremiumRequestWithUser = {
  request: PremiumRequest;
  user: Pick<AuthUser, "id" | "username" | "displayName" | "email">;
};

function serializePremiumRequest(
  request: PremiumRequest,
  user?: Pick<AuthUser, "id" | "username" | "displayName" | "email">,
) {
  return {
    id: request.id,
    userId: request.userId,
    price: request.price,
    currency: request.currency,
    status: request.status,
    reviewedBy: request.reviewedBy ?? undefined,
    reviewedAt: request.reviewedAt ?? undefined,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    user: user
      ? {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
        }
      : undefined,
  };
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && (current as { code?: unknown }).code === "23505") {
      return true;
    }
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

async function getRequestForUser(requestId: string, userId: string): Promise<PremiumRequestWithUser | undefined> {
  const [row] = await db
    .select({
      request: premiumRequestsTable,
      user: {
        id: authUsersTable.id,
        username: authUsersTable.username,
        displayName: authUsersTable.displayName,
        email: authUsersTable.email,
      },
    })
    .from(premiumRequestsTable)
    .innerJoin(authUsersTable, eq(premiumRequestsTable.userId, authUsersTable.id))
    .where(and(eq(premiumRequestsTable.id, requestId), eq(premiumRequestsTable.userId, userId)))
    .limit(1);
  return row;
}

function requestId(req: Request): string {
  const value = req.params.requestId;
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function requireAdmin(user: AuthUser | null): user is AuthUser {
  return Boolean(user?.isAdmin || user?.isSuperAdmin);
}

router.post("/premium-requests", async (req, res): Promise<void> => {
  const user = await authenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Oturum gerekli." });
    return;
  }

  const parsed = CreatePremiumRequestBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz premium talebi." });
    return;
  }

  try {
    const created = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`premium-request:${user.id}`}))`);
      const [currentUser] = await tx
        .select({ isPremium: authUsersTable.isPremium })
        .from(authUsersTable)
        .where(eq(authUsersTable.id, user.id))
        .limit(1);
      if (!currentUser || currentUser.isPremium) return null;
      const [request] = await tx
        .insert(premiumRequestsTable)
        .values({
          id: randomUUID(),
          userId: user.id,
          price: PREMIUM_MONTHLY_PRICE_TRY,
          currency: "TRY",
          status: "pending",
        })
        .returning();
      return request;
    });
    if (!created) {
      res.status(409).json({ error: "Premium üyeliğiniz zaten aktif." });
      return;
    }
    res.status(201).json(CreatePremiumRequestResponse.parse({
      request: serializePremiumRequest(created, user),
    }));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Bekleyen bir premium talebiniz zaten var." });
      return;
    }
    req.log.error({ err: error }, "Could not create premium request");
    res.status(500).json({ error: "Premium talebi oluşturulamadı." });
  }
});

router.get("/premium-requests", async (req, res): Promise<void> => {
  const user = await authenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Oturum gerekli." });
    return;
  }

  const rows = await db
    .select({
      request: premiumRequestsTable,
      user: {
        id: authUsersTable.id,
        username: authUsersTable.username,
        displayName: authUsersTable.displayName,
        email: authUsersTable.email,
      },
    })
    .from(premiumRequestsTable)
    .innerJoin(authUsersTable, eq(premiumRequestsTable.userId, authUsersTable.id))
    .where(eq(premiumRequestsTable.userId, user.id))
    .orderBy(desc(premiumRequestsTable.createdAt));
  res.json(ListPremiumRequestsResponse.parse({
    requests: rows.map(row => serializePremiumRequest(row.request, row.user)),
  }));
});

router.get("/premium-requests/:requestId", async (req, res): Promise<void> => {
  const user = await authenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Oturum gerekli." });
    return;
  }

  const row = await getRequestForUser(requestId(req), user.id);
  if (!row) {
    res.status(404).json({ error: "Premium talebi bulunamadı." });
    return;
  }
  res.json(GetPremiumRequestResponse.parse({
    request: serializePremiumRequest(row.request, row.user),
  }));
});

router.get("/admin/premium-requests", async (req, res): Promise<void> => {
  const user = await authenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Oturum gerekli." });
    return;
  }
  if (!requireAdmin(user)) {
    res.status(403).json({ error: "Yönetici yetkisi gerekli." });
    return;
  }

  const rows = await db
    .select({
      request: premiumRequestsTable,
      user: {
        id: authUsersTable.id,
        username: authUsersTable.username,
        displayName: authUsersTable.displayName,
        email: authUsersTable.email,
      },
    })
    .from(premiumRequestsTable)
    .innerJoin(authUsersTable, eq(premiumRequestsTable.userId, authUsersTable.id))
    .orderBy(desc(premiumRequestsTable.createdAt));
  res.json(ListAdminPremiumRequestsResponse.parse({
    requests: rows.map(row => serializePremiumRequest(row.request, row.user)),
  }));
});

async function decideRequest(
  id: string,
  adminId: string,
  status: "approved" | "rejected",
): Promise<"not-found" | "conflict" | PremiumRequestWithUser> {
  const result = await db.transaction(async tx => {
    const [candidate] = await tx
      .select({ userId: premiumRequestsTable.userId })
      .from(premiumRequestsTable)
      .where(eq(premiumRequestsTable.id, id))
      .limit(1);
    if (!candidate) return "not-found" as const;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`premium-request:${candidate.userId}`}))`);
    const [updated] = await tx
      .update(premiumRequestsTable)
      .set({
        status,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(premiumRequestsTable.id, id), eq(premiumRequestsTable.status, "pending")))
      .returning();
    if (!updated) {
      const [existing] = await tx
        .select({ id: premiumRequestsTable.id, status: premiumRequestsTable.status })
        .from(premiumRequestsTable)
        .where(eq(premiumRequestsTable.id, id))
        .limit(1);
      return existing ? ("conflict" as const) : ("not-found" as const);
    }

    if (status === "approved") {
      const [entitledUser] = await tx
        .update(authUsersTable)
        .set({ isPremium: true, updatedAt: new Date() })
        .where(eq(authUsersTable.id, updated.userId))
        .returning({ id: authUsersTable.id });
      if (!entitledUser) {
        throw new Error("Premium request user no longer exists");
      }
    }

    const [row] = await tx
      .select({
        request: premiumRequestsTable,
        user: {
          id: authUsersTable.id,
          username: authUsersTable.username,
          displayName: authUsersTable.displayName,
          email: authUsersTable.email,
        },
      })
      .from(premiumRequestsTable)
      .innerJoin(authUsersTable, eq(premiumRequestsTable.userId, authUsersTable.id))
      .where(eq(premiumRequestsTable.id, updated.id))
      .limit(1);
    return row;
  });
  return result;
}

async function handleDecision(
  req: Request,
  res: Response,
  status: "approved" | "rejected",
): Promise<void> {
  const user = await authenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Oturum gerekli." });
    return;
  }
  if (!requireAdmin(user)) {
    res.status(403).json({ error: "Yönetici yetkisi gerekli." });
    return;
  }

  const result = await decideRequest(requestId(req), user.id, status);
  if (result === "not-found") {
    res.status(404).json({ error: "Premium talebi bulunamadı." });
    return;
  }
  if (result === "conflict") {
    res.status(409).json({ error: "Premium talebi daha önce karara bağlandı." });
    return;
  }

  const response = { request: serializePremiumRequest(result.request, result.user) };
  res.json(status === "approved"
    ? ApprovePremiumRequestResponse.parse(response)
    : RejectPremiumRequestResponse.parse(response));
}

router.post("/admin/premium-requests/:requestId/approve", async (req, res): Promise<void> => {
  await handleDecision(req, res, "approved");
});

router.post("/admin/premium-requests/:requestId/reject", async (req, res): Promise<void> => {
  await handleDecision(req, res, "rejected");
});

export default router;