import { and, asc, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import {
  authUsersTable, db, loveAuditTable, loveBlocksTable, loveConversationMembersTable,
  loveConversationsTable, loveMessageReactionsTable, loveMessagesTable, lovePresenceTable,
  loveReportsTable, loveSettingsTable,
} from "@workspace/db";
import { authenticatedSession } from "../lib/auth";
import { insertSyncEvent, reserveSyncEventId } from "../lib/sync-events";
import { notifyCommittedSyncEvent } from "../lib/sync-hub";
import {
  createLoveMediaUpload, finalizeMediaUpload, getStoredObject, InvalidMediaReferenceError,
  ObjectNotFoundError, streamStoredObject, validateLoveMediaReference,
  validateLoveMediaMetadata,
} from "../lib/object-storage";

const router: IRouter = Router();
const GENERAL_ROOM = "love-general";
const MAX_BODY = 4000;
const ALLOWED_REACTIONS = new Set(["❤️", "👍", "😂", "😮", "😢", "🔥"]);
const attempts = new Map<string, { count: number; reset: number }>();

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(value);
}
function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
}
function limited(userId: string): boolean {
  const now = Date.now(), current = attempts.get(userId);
  if (!current || current.reset < now) { attempts.set(userId, { count: 1, reset: now + 10_000 }); return false; }
  current.count += 1;
  return current.count > 40;
}
async function session(req: Parameters<typeof authenticatedSession>[0], res: any) {
  const found = await authenticatedSession(req);
  if (!found) { res.status(401).json({ error: "Oturum gerekli." }); return null; }
  return found;
}
async function blocked(a: string, b: string): Promise<boolean> {
  const rows = await db.select({ blockerId: loveBlocksTable.blockerId }).from(loveBlocksTable).where(or(
    and(eq(loveBlocksTable.blockerId, a), eq(loveBlocksTable.blockedId, b)),
    and(eq(loveBlocksTable.blockerId, b), eq(loveBlocksTable.blockedId, a)),
  )).limit(1);
  return rows.length > 0;
}
async function member(userId: string, conversationId: string): Promise<boolean> {
  const rows = await db.select({ userId: loveConversationMembersTable.userId })
    .from(loveConversationMembersTable)
    .where(and(eq(loveConversationMembersTable.userId, userId), eq(loveConversationMembersTable.conversationId, conversationId), sql`${loveConversationMembersTable.leftAt} IS NULL`))
    .limit(1);
  return rows.length > 0;
}
async function eventInTransaction(tx: any, conversationId: string, entityId: string, type: string, payload: Record<string, unknown>) {
  const audience = conversationId === GENERAL_ROOM ? null : (await tx.select({ userId: loveConversationMembersTable.userId }).from(loveConversationMembersTable).where(eq(loveConversationMembersTable.conversationId, conversationId))).map((x: { userId: string }) => x.userId);
  const id = await reserveSyncEventId(tx);
  const committed = await insertSyncEvent(tx, id, {
    entityType: "message", entityId, isPublic: conversationId === GENERAL_ROOM,
    audienceUserIds: audience, payload: { type, payload: { ...payload }, conversationId, love: true },
  });
  return committed;
}
async function event(conversationId: string, entityId: string, type: string, payload: Record<string, unknown>) {
  const committed = await db.transaction(tx => eventInTransaction(tx, conversationId, entityId, type, payload));
  await notifyCommittedSyncEvent(committed.id);
}
async function userShape(id: string) {
  const [u] = await db.select({ id: authUsersTable.id, username: authUsersTable.username, displayName: authUsersTable.displayName, bio: authUsersTable.bio, avatarColor: authUsersTable.avatarColor, avatarUrl: authUsersTable.avatarUrl, isPremium: authUsersTable.isPremium }).from(authUsersTable).where(eq(authUsersTable.id, id)).limit(1);
  return u ?? null;
}
async function ensureGeneral(userId: string) {
  await db.insert(loveConversationsTable).values({ id: GENERAL_ROOM, kind: "general" }).onConflictDoNothing();
  await db.insert(loveConversationMembersTable).values({ conversationId: GENERAL_ROOM, userId }).onConflictDoNothing();
}

router.post("/love/media/request-url", async (req, res) => {
  const s = await session(req, res); if (!s) return;
  const size = Number(req.body?.size), contentType = typeof req.body?.contentType === "string" ? req.body.contentType.toLowerCase() : "";
  if (validateLoveMediaMetadata({ size, contentType })) { res.status(400).json({ error: "LOVE medyası JPEG, PNG, WebP veya GIF ve en fazla 10 MB olmalıdır." }); return; }
  try { res.json({ ...(await createLoveMediaUpload(s.user.id)), contentType, size }); }
  catch (error) { req.log.error({ err: error }, "Love media upload URL failed"); res.status(503).json({ error: "Medya yükleme hizmeti kullanılamıyor." }); }
});

router.post("/love/media/finalize", async (req, res) => {
  const s = await session(req, res); if (!s) return;
  const objectPath = text(req.body?.objectPath, 500), size = Number(req.body?.size), contentType = typeof req.body?.contentType === "string" ? req.body.contentType.toLowerCase() : "";
  if (!objectPath || validateLoveMediaMetadata({ size, contentType })) { res.status(400).json({ error: "Geçerli LOVE medya bilgileri gerekli." }); return; }
  try { res.json(await finalizeMediaUpload(s.user.id, objectPath, { size, contentType }, "love-media")); }
  catch (error) {
    if (error instanceof ObjectNotFoundError) { res.status(404).json({ error: "Medya bulunamadı." }); return; }
    if (error instanceof InvalidMediaReferenceError) { res.status(403).json({ error: error.message }); return; }
    res.status(400).json({ error: "Medya doğrulanamadı." });
  }
});

router.get("/love/media/*path", async (req, res) => {
  const s = await session(req, res); if (!s) return;
  const rawPath = Array.isArray(req.params.path) ? req.params.path.join("/") : req.params.path;
  const objectPath = `/objects/love-media/${rawPath}`;
  const [message] = await db.select({ conversationId: loveMessagesTable.conversationId, senderId: loveMessagesTable.senderId })
    .from(loveMessagesTable).where(eq(loveMessagesTable.mediaObjectPath, objectPath)).limit(1);
  if (!message || !(await member(s.user.id, message.conversationId))) { res.status(404).json({ error: "Medya bulunamadı." }); return; }
  try { await validateLoveMediaReference(objectPath, message.senderId); await streamStoredObject(await getStoredObject(objectPath), res, { private: true, loveMedia: true }); }
  catch (error) { if (error instanceof ObjectNotFoundError) res.status(404).json({ error: "Medya bulunamadı." }); else res.status(403).json({ error: "Medya erişimi reddedildi." }); }
});

router.get("/love/room", async (req, res) => {
  const s = await session(req, res); if (!s) return;
  await ensureGeneral(s.user.id);
  res.json({ id: GENERAL_ROOM, kind: "general", title: "LOVE", isMember: true });
});

router.get("/love/conversations", async (req, res) => {
  const s = await session(req, res); if (!s) return;
  await ensureGeneral(s.user.id);
  const rows = await db.select({ conversation: loveConversationsTable, member: loveConversationMembersTable })
    .from(loveConversationMembersTable).innerJoin(loveConversationsTable, eq(loveConversationsTable.id, loveConversationMembersTable.conversationId))
    .where(and(eq(loveConversationMembersTable.userId, s.user.id), sql`${loveConversationMembersTable.leftAt} IS NULL`))
    .orderBy(desc(loveConversationsTable.updatedAt));
  const conversations = await Promise.all(rows.map(async r => {
    const [lastMessage] = await db.select().from(loveMessagesTable).where(eq(loveMessagesTable.conversationId, r.conversation.id)).orderBy(desc(loveMessagesTable.createdAt), desc(loveMessagesTable.id)).limit(1);
    const [partner] = await db.select({ id: authUsersTable.id, username: authUsersTable.username, displayName: authUsersTable.displayName, avatarColor: authUsersTable.avatarColor, avatarUrl: authUsersTable.avatarUrl })
      .from(loveConversationMembersTable).innerJoin(authUsersTable, eq(authUsersTable.id, loveConversationMembersTable.userId))
      .where(and(eq(loveConversationMembersTable.conversationId, r.conversation.id), sql`${loveConversationMembersTable.userId} <> ${s.user.id}`, sql`${loveConversationMembersTable.leftAt} IS NULL`)).limit(1);
    const [marker] = r.member.lastReadMessageId ? await db.select({ createdAt: loveMessagesTable.createdAt }).from(loveMessagesTable).where(eq(loveMessagesTable.id, r.member.lastReadMessageId)).limit(1) : [];
    const unread = await db.select({ count: sql<number>`count(*)` }).from(loveMessagesTable).where(and(eq(loveMessagesTable.conversationId, r.conversation.id), sql`${loveMessagesTable.senderId} <> ${s.user.id}`, marker ? gt(loveMessagesTable.createdAt, marker.createdAt) : sql`true`));
    return { ...r.conversation, partner: partner ?? null, lastMessage: lastMessage ?? null, unreadCount: Number(unread[0]?.count ?? 0), lastReadMessageId: r.member.lastReadMessageId };
  }));
  res.json({ conversations });
});

router.post("/love/conversations", async (req, res) => {
  const s = await session(req, res); if (!s) return;
  const other = text(req.body?.userId, 120);
  if (!other || other === s.user.id || !(await userShape(other))) { res.status(400).json({ error: "Geçersiz kullanıcı." }); return; }
  if (await blocked(s.user.id, other)) { res.status(403).json({ error: "Bu kullanıcıyla iletişim engellendi." }); return; }
  const pair = [s.user.id, other].sort().join(":");
  const id = `love-dm-${Buffer.from(pair).toString("base64url").slice(0, 80)}`;
  await db.insert(loveConversationsTable).values({ id, kind: "dm" }).onConflictDoNothing();
  await db.insert(loveConversationMembersTable).values([{ conversationId: id, userId: s.user.id }, { conversationId: id, userId: other }]).onConflictDoNothing();
  await event(id, id, "love.conversation.created", { conversation: { id, kind: "dm" }, partnerUserId: other });
  res.status(201).json({ id, kind: "dm" });
});

router.get("/love/conversations/:id/messages", async (req, res) => {
  const s = await session(req, res); if (!s) return;
  const id = req.params.id; if (!validId(id)) { res.status(400).json({ error: "Geçersiz sohbet." }); return; }
  if (!(await member(s.user.id, id))) { res.status(403).json({ error: "Sohbet erişimi yok." }); return; }
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const before = typeof req.query.before === "string" ? req.query.before : null;
  let cursor: { createdAt: string; id: string } | null = null;
  if (before) {
    try { const parsed = JSON.parse(Buffer.from(before, "base64url").toString("utf8")); if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") throw new Error(); cursor = parsed; }
    catch { res.status(400).json({ error: "Geçersiz sayfalama imleci." }); return; }
  }
  const rows = await db.select().from(loveMessagesTable).where(and(
    eq(loveMessagesTable.conversationId, id),
    cursor ? or(lt(loveMessagesTable.createdAt, new Date(cursor.createdAt)), and(eq(loveMessagesTable.createdAt, new Date(cursor.createdAt)), lt(loveMessagesTable.id, cursor.id))) : sql`true`,
  )).orderBy(desc(loveMessagesTable.createdAt), desc(loveMessagesTable.id)).limit(limit);
  const oldest = rows.at(-1);
  const nextCursor = rows.length === limit && oldest ? Buffer.from(JSON.stringify({ createdAt: oldest.createdAt.toISOString(), id: oldest.id })).toString("base64url") : null;
  res.json({ messages: rows.reverse(), nextCursor });
});

router.post("/love/conversations/:id/messages", async (req, res) => {
  const s = await session(req, res); if (!s) return;
  if (limited(s.user.id)) { res.status(429).json({ error: "Çok fazla mesaj." }); return; }
  const conversationId = req.params.id, body = text(req.body?.body, MAX_BODY), clientMessageId = text(req.body?.clientMessageId, 200);
  if (!validId(conversationId) || !clientMessageId || (!body && !text(req.body?.mediaObjectPath, 500))) { res.status(400).json({ error: "Mesaj metni veya medya gerekli." }); return; }
  if (!(await member(s.user.id, conversationId))) { res.status(403).json({ error: "Sohbet erişimi yok." }); return; }
  const members = await db.select({ userId: loveConversationMembersTable.userId }).from(loveConversationMembersTable).where(eq(loveConversationMembersTable.conversationId, conversationId));
  if (members.some(m => m.userId !== s.user.id) && (await Promise.any(members.filter(m => m.userId !== s.user.id).map(m => blocked(s.user.id, m.userId))))) { res.status(403).json({ error: "Engellenen kullanıcıya mesaj gönderilemez." }); return; }
  const existing = await db.select().from(loveMessagesTable).where(and(eq(loveMessagesTable.senderId, s.user.id), eq(loveMessagesTable.conversationId, conversationId), eq(loveMessagesTable.clientMessageId, clientMessageId))).limit(1);
  if (existing[0]) { res.json({ message: existing[0], duplicate: true }); return; }
  const mediaObjectPath = text(req.body?.mediaObjectPath, 500);
  if (mediaObjectPath) {
    try { await validateLoveMediaReference(mediaObjectPath, s.user.id); }
    catch { res.status(400).json({ error: "Medya yüklenmeli ve önce doğrulanmalıdır." }); return; }
  }
  const message = { id: randomUUID(), conversationId, senderId: s.user.id, clientMessageId, body, mediaObjectPath, mediaType: text(req.body?.mediaType, 80), version: 1 };
  const { created, duplicate, eventId } = await db.transaction(async tx => {
    const [row] = await tx.insert(loveMessagesTable).values(message).onConflictDoNothing({
      target: [loveMessagesTable.senderId, loveMessagesTable.conversationId, loveMessagesTable.clientMessageId],
    }).returning();
    if (!row) {
      const [canonical] = await tx.select().from(loveMessagesTable).where(and(eq(loveMessagesTable.senderId, s.user.id), eq(loveMessagesTable.conversationId, conversationId), eq(loveMessagesTable.clientMessageId, clientMessageId))).limit(1);
      if (!canonical) throw new Error("Idempotent LOVE message could not be recovered");
      return { created: canonical, duplicate: true };
    }
    await tx.update(loveConversationsTable).set({ updatedAt: new Date(), lastMessageId: row.id, lastMessageAt: row.createdAt }).where(eq(loveConversationsTable.id, conversationId));
    const committed = await eventInTransaction(tx, conversationId, row.id, "love.message.created", { message: row });
    return { created: row, duplicate: false, eventId: committed.id };
  });
  if (!duplicate && eventId) await notifyCommittedSyncEvent(eventId);
  res.status(duplicate ? 200 : 201).json({ message: created, duplicate });
});

router.patch("/love/messages/:id", async (req, res) => {
  const s = await session(req, res); if (!s) return; const body = text(req.body?.body, MAX_BODY);
  if (!body) { res.status(400).json({ error: "Mesaj boş olamaz." }); return; }
  const [old] = await db.select().from(loveMessagesTable).where(eq(loveMessagesTable.id, req.params.id)).limit(1);
  if (!old || old.senderId !== s.user.id || old.deletedAt) { res.status(404).json({ error: "Mesaj bulunamadı." }); return; }
  const [updated] = await db.update(loveMessagesTable).set({ body, version: old.version + 1, editedAt: new Date() }).where(and(eq(loveMessagesTable.id, old.id), eq(loveMessagesTable.senderId, s.user.id))).returning();
  await event(old.conversationId, old.id, "love.message.edited", { message: updated });
  res.json({ message: updated });
});

router.delete("/love/messages/:id", async (req, res) => {
  const s = await session(req, res); if (!s) return;
  const [old] = await db.select().from(loveMessagesTable).where(eq(loveMessagesTable.id, req.params.id)).limit(1);
  if (!old || old.senderId !== s.user.id) { res.status(404).json({ error: "Mesaj bulunamadı." }); return; }
  const [updated] = await db.update(loveMessagesTable).set({ body: null, mediaObjectPath: null, version: old.version + 1, deletedAt: new Date() }).where(eq(loveMessagesTable.id, old.id)).returning();
  await event(old.conversationId, old.id, "love.message.deleted", { message: updated });
  res.json({ message: updated });
});

router.put("/love/messages/:id/reactions/:reaction", async (req, res) => {
  const s = await session(req, res); if (!s || !ALLOWED_REACTIONS.has(req.params.reaction)) { res.status(400).json({ error: "Geçersiz tepki." }); return; }
  const [message] = await db.select().from(loveMessagesTable).where(eq(loveMessagesTable.id, req.params.id)).limit(1);
  if (!message || !(await member(s.user.id, message.conversationId))) { res.status(403).json({ error: "Erişim yok." }); return; }
  await db.insert(loveMessageReactionsTable).values({ messageId: message.id, userId: s.user.id, reaction: req.params.reaction }).onConflictDoNothing();
  await event(message.conversationId, message.id, "love.message.reaction", { messageId: message.id, userId: s.user.id, reaction: req.params.reaction, active: true });
  res.json({ active: true });
});
router.delete("/love/messages/:id/reactions/:reaction", async (req, res) => {
  const s = await session(req, res); if (!s) return;
  const [message] = await db.select().from(loveMessagesTable).where(eq(loveMessagesTable.id, req.params.id)).limit(1);
  if (!message || !(await member(s.user.id, message.conversationId))) { res.status(403).json({ error: "Erişim yok." }); return; }
  await db.delete(loveMessageReactionsTable).where(and(eq(loveMessageReactionsTable.messageId, message.id), eq(loveMessageReactionsTable.userId, s.user.id), eq(loveMessageReactionsTable.reaction, req.params.reaction)));
  await event(message.conversationId, message.id, "love.message.reaction", { messageId: message.id, userId: s.user.id, reaction: req.params.reaction, active: false });
  res.json({ active: false });
});

router.put("/love/conversations/:id/read", async (req, res) => {
  const s = await session(req, res); if (!s) return; if (!(await member(s.user.id, req.params.id))) { res.status(403).json({ error: "Erişim yok." }); return; }
  const messageId = text(req.body?.messageId, 120); if (!messageId) { res.status(400).json({ error: "Mesaj gerekli." }); return; }
  const [target] = await db.select({ createdAt: loveMessagesTable.createdAt }).from(loveMessagesTable).where(and(eq(loveMessagesTable.id, messageId), eq(loveMessagesTable.conversationId, req.params.id))).limit(1);
  if (!target) { res.status(400).json({ error: "Mesaj bu sohbete ait değil." }); return; }
  const [current] = await db.select({ lastReadMessageId: loveConversationMembersTable.lastReadMessageId }).from(loveConversationMembersTable).where(and(eq(loveConversationMembersTable.conversationId, req.params.id), eq(loveConversationMembersTable.userId, s.user.id))).limit(1);
  let advance = !current?.lastReadMessageId;
  if (current?.lastReadMessageId) {
    const [old] = await db.select({ createdAt: loveMessagesTable.createdAt }).from(loveMessagesTable).where(eq(loveMessagesTable.id, current.lastReadMessageId)).limit(1);
    advance = !old || target.createdAt > old.createdAt;
  }
  if (advance) await db.update(loveConversationMembersTable).set({ lastReadMessageId: messageId }).where(and(eq(loveConversationMembersTable.conversationId, req.params.id), eq(loveConversationMembersTable.userId, s.user.id)));
  await event(req.params.id, messageId, "love.conversation.read", { userId: s.user.id, messageId });
  res.json({ messageId });
});

router.get("/love/users/search", async (req, res) => {
  const s = await session(req, res); if (!s) return; const q = text(req.query.q, 80) ?? "";
  const users = await db.select({ id: authUsersTable.id, username: authUsersTable.username, displayName: authUsersTable.displayName, bio: authUsersTable.bio, avatarColor: authUsersTable.avatarColor, avatarUrl: authUsersTable.avatarUrl }).from(authUsersTable).where(q ? sql`(${authUsersTable.username} ILIKE ${"%" + q + "%"} OR ${authUsersTable.displayName} ILIKE ${"%" + q + "%"})` : sql`true`).orderBy(asc(authUsersTable.username)).limit(30);
  res.json({ users });
});
router.get("/love/users/:id", async (req, res) => { const s = await session(req, res); if (!s) return; const user = await userShape(req.params.id); if (!user) { res.status(404).json({ error: "Kullanıcı bulunamadı." }); return; } const [p] = await db.select().from(lovePresenceTable).where(and(eq(lovePresenceTable.userId, user.id), gt(lovePresenceTable.expiresAt, new Date()))); res.json({ user, presence: p ?? { status: "offline" } }); });

router.put("/love/presence", async (req, res) => { const s = await session(req, res); if (!s) return; const status = ["online", "busy", "offline"].includes(req.body?.status) ? req.body.status : "online"; await db.insert(lovePresenceTable).values({ userId: s.user.id, status, expiresAt: new Date(Date.now() + 90_000), updatedAt: new Date() }).onConflictDoUpdate({ target: lovePresenceTable.userId, set: { status, expiresAt: new Date(Date.now() + 90_000), updatedAt: new Date() } }); res.json({ status, expiresAt: new Date(Date.now() + 90_000) }); });
router.get("/love/presence", async (req, res) => { const s = await session(req, res); if (!s) return; const rows = await db.select().from(lovePresenceTable).where(gt(lovePresenceTable.expiresAt, new Date())); res.json({ presence: rows }); });

router.post("/love/blocks/:userId", async (req, res) => { const s = await session(req, res); if (!s || s.user.id === req.params.userId) { res.status(400).json({ error: "Geçersiz kullanıcı." }); return; } await db.insert(loveBlocksTable).values({ blockerId: s.user.id, blockedId: req.params.userId }).onConflictDoNothing(); res.status(204).end(); });
router.delete("/love/blocks/:userId", async (req, res) => { const s = await session(req, res); if (!s) return; await db.delete(loveBlocksTable).where(and(eq(loveBlocksTable.blockerId, s.user.id), eq(loveBlocksTable.blockedId, req.params.userId))); res.status(204).end(); });
router.get("/love/blocks", async (req, res) => { const s = await session(req, res); if (!s) return; const rows = await db.select().from(loveBlocksTable).where(eq(loveBlocksTable.blockerId, s.user.id)); res.json({ blocks: rows }); });

router.post("/love/reports", async (req, res) => {
  const s = await session(req, res); if (!s) return;
  const reason = text(req.body?.reason, 500), messageId = text(req.body?.messageId, 120), reportedUserId = text(req.body?.reportedUserId, 120);
  if (!reason || (!messageId && !reportedUserId)) { res.status(400).json({ error: "Gerekçe ve görünür bir hedef gerekli." }); return; }
  if (messageId) {
    const [message] = await db.select({ conversationId: loveMessagesTable.conversationId, senderId: loveMessagesTable.senderId }).from(loveMessagesTable).where(eq(loveMessagesTable.id, messageId)).limit(1);
    if (!message || !(await member(s.user.id, message.conversationId))) { res.status(404).json({ error: "Mesaj bulunamadı." }); return; }
    if (reportedUserId && reportedUserId !== message.senderId) { res.status(400).json({ error: "Rapor hedefi mesaj gönderen kullanıcı olmalıdır." }); return; }
  } else if (!(await userShape(reportedUserId!))) { res.status(404).json({ error: "Kullanıcı bulunamadı." }); return; }
  const [report] = await db.insert(loveReportsTable).values({ id: randomUUID(), reporterId: s.user.id, messageId, reportedUserId: reportedUserId ?? undefined, reason }).returning();
  res.status(201).json({ report });
});
router.get("/admin/love/reports", async (req, res) => { const s = await session(req, res); if (!s) return; if (!s.user.isAdmin && !s.user.isSuperAdmin) { res.status(403).json({ error: "Yönetici yetkisi gerekli." }); return; } res.json({ reports: await db.select().from(loveReportsTable).orderBy(desc(loveReportsTable.createdAt)).limit(200) }); });
router.get("/admin/love/audit", async (req, res) => { const s = await session(req, res); if (!s) return; if (!s.user.isAdmin && !s.user.isSuperAdmin) { res.status(403).json({ error: "Yönetici yetkisi gerekli." }); return; } res.json({ audit: await db.select().from(loveAuditTable).orderBy(desc(loveAuditTable.createdAt)).limit(500) }); });
router.patch("/admin/love/reports/:id", async (req, res) => { const s = await session(req, res); if (!s) return; if (!s.user.isAdmin && !s.user.isSuperAdmin) { res.status(403).json({ error: "Yönetici yetkisi gerekli." }); return; } const status = ["open", "resolved", "dismissed"].includes(req.body?.status) ? req.body.status : null; if (!status) { res.status(400).json({ error: "Geçersiz durum." }); return; } const [report] = await db.update(loveReportsTable).set({ status, reviewedBy: s.user.id, reviewedAt: new Date() }).where(eq(loveReportsTable.id, req.params.id)).returning(); await db.insert(loveAuditTable).values({ id: randomUUID(), actorId: s.user.id, action: `report.${status}`, targetId: req.params.id }); res.json({ report }); });
router.patch("/admin/love/messages/:id/hide", async (req, res) => { const s = await session(req, res); if (!s) return; if (!s.user.isAdmin && !s.user.isSuperAdmin) { res.status(403).json({ error: "Yönetici yetkisi gerekli." }); return; } const [message] = await db.update(loveMessagesTable).set({ body: null, deletedAt: new Date(), version: sql`${loveMessagesTable.version} + 1` }).where(eq(loveMessagesTable.id, req.params.id)).returning(); if (message) await db.insert(loveAuditTable).values({ id: randomUUID(), actorId: s.user.id, action: "message.hide", targetId: message.id }); res.json({ message }); });

router.get("/love/settings", async (req, res) => { const s = await session(req, res); if (!s) return; const [settings] = await db.select().from(loveSettingsTable).where(eq(loveSettingsTable.userId, s.user.id)); res.json({ settings: settings ?? { userId: s.user.id, notifications: true, sound: true, vibration: true, theme: "rose" } }); });
router.put("/love/settings", async (req, res) => { const s = await session(req, res); if (!s) return; const values = { notifications: typeof req.body?.notifications === "boolean" ? req.body.notifications : true, sound: typeof req.body?.sound === "boolean" ? req.body.sound : true, vibration: typeof req.body?.vibration === "boolean" ? req.body.vibration : true, theme: ["rose", "dark", "system"].includes(req.body?.theme) ? req.body.theme : "rose", updatedAt: new Date() }; const [settings] = await db.insert(loveSettingsTable).values({ userId: s.user.id, ...values }).onConflictDoUpdate({ target: loveSettingsTable.userId, set: values }).returning(); res.json({ settings }); });

export default router;