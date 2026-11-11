import { Router, type Request, type RequestHandler } from "express";
import { and, count, desc, eq, gte, notInArray, or, sql } from "drizzle-orm";
import {
  db, afilliChatGifsTable, afilliRoomPoliciesTable, afilliUserBlocksTable,
  favoriBooksTable, favoriMessagesTable, favoriProfilesTable, favoriRoomMessagesTable,
} from "@workspace/db";
import {
  AddChatGifsBody, GetChatBootstrapResponse, ListChatAdminUsersResponse,
  ListRoomMessagesParams, ListRoomMessagesResponse, ReadConversationBody,
  SendRoomMessageBody, SendRoomMessageResponse, SetChatBlockBody,
  SetChatRoomPolicyBody, SetChatUserStatusBody,
} from "@workspace/api-zod";
import { newId } from "./seed";
import { createChatPhotoRouter, dayStart, sendPhotoMessage } from "./chatPhotos";

const rooms = [
  { id: "general" as const, title: "Yazar Sohbeti", description: "Tüm yazarlar için genel sohbet" },
  { id: "afilli" as const, title: "Afilli", description: "Afilli ailesinin genel sohbet odası" },
  { id: "magazin" as const, title: "Magazin", description: "Magazin ve kitap gündemi" },
  { id: "serbest" as const, title: "Serbest", description: "Her konuda serbest sohbet" },
];
function param(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value ?? ""; }
function isAdmin(id: string | null) { return !!id && !!process.env.AFILLI_ADMIN_USER_ID && id === process.env.AFILLI_ADMIN_USER_ID.trim(); }
function userDto(profile: typeof favoriProfilesTable.$inferSelect) {
  return { id: profile.id, name: profile.name, handle: profile.handle, avatarUrl: profile.avatarUrl, isBlocked: profile.isBlocked, online: !!profile.lastSeenAt && Date.now() - profile.lastSeenAt.getTime() < 120000 };
}
async function messageDto(message: typeof favoriRoomMessagesTable.$inferSelect) {
  const [book] = message.bookId ? await db.select().from(favoriBooksTable).where(eq(favoriBooksTable.id, message.bookId)).limit(1) : [];
  const mediaUrl = message.mediaUrl?.startsWith("/objects/chat/photos/")
    ? `/api/chat/rooms/${message.roomId}/photos/${message.id}` : message.mediaUrl;
  return { id: message.id, roomId: message.roomId, senderId: message.senderId, sender: message.senderName, body: message.body, kind: message.kind, mediaUrl, bookId: message.bookId, bookTitle: book?.title ?? null, bookCoverUrl: book?.coverUrl ?? null, createdAt: message.createdAt.toISOString() };
}

export function createChatRouter(helpers: {
  requireAuth: RequestHandler;
  requestUserId: (req: Request) => string | null;
  ensureUserProfile: (id: string) => Promise<typeof favoriProfilesTable.$inferSelect>;
}) {
  const router = Router();
  const { requireAuth, requestUserId, ensureUserProfile } = helpers;
  router.use(createChatPhotoRouter(helpers));
  const requireAdmin: RequestHandler = (req, res, next) => {
    if (!isAdmin(requestUserId(req))) { res.status(403).json({ error: "Bu işlem yalnızca atanmış Afilli yöneticisine açıktır." }); return; }
    next();
  };
  router.get("/chat/bootstrap", requireAuth, async (req, res) => {
    const id = requestUserId(req)!;
    await ensureUserProfile(id);
    await db.update(favoriProfilesTable).set({ lastSeenAt: new Date() }).where(eq(favoriProfilesTable.id, id));
    const [policies, gifs, users, blocks, photos] = await Promise.all([
      db.select().from(afilliRoomPoliciesTable),
      db.select().from(afilliChatGifsTable).orderBy(desc(afilliChatGifsTable.createdAt)).limit(200),
      db.select().from(favoriProfilesTable).where(eq(favoriProfilesTable.isBlocked, false)).orderBy(sql`${favoriProfilesTable.lastSeenAt} desc nulls last`).limit(200),
      db.select().from(afilliUserBlocksTable).where(eq(afilliUserBlocksTable.blockerId, id)),
      db.select({ value: count() }).from(favoriRoomMessagesTable).where(and(eq(favoriRoomMessagesTable.senderId, id), eq(favoriRoomMessagesTable.kind, "image"), gte(favoriRoomMessagesTable.createdAt, dayStart()))),
    ]);
    res.json(GetChatBootstrapResponse.parse({ rooms: rooms.map((room) => ({ ...room, allowGifs: policies.find((policy) => policy.roomId === room.id)?.allowGifs ?? true })), gifs, users: users.map(userDto), blockedIds: blocks.map((block) => block.blockedId), photoCount: photos[0]?.value ?? 0, canManage: isAdmin(id) }));
  });
  router.get("/chat/rooms/:roomId/messages", requireAuth, async (req, res) => {
    const parsed = ListRoomMessagesParams.safeParse(req.params);
    if (!parsed.success) { res.status(404).json({ error: "Oda bulunamadı." }); return; }
    const id = requestUserId(req)!;
    await ensureUserProfile(id);
    await db.update(favoriProfilesTable).set({ lastSeenAt: new Date() }).where(eq(favoriProfilesTable.id, id));
    const blocks = await db.select().from(afilliUserBlocksTable).where(or(eq(afilliUserBlocksTable.blockerId, id), eq(afilliUserBlocksTable.blockedId, id)));
    const hiddenIds = blocks.map((block) => block.blockerId === id ? block.blockedId : block.blockerId);
    const rows = await db.select().from(favoriRoomMessagesTable).where(and(eq(favoriRoomMessagesTable.roomId, parsed.data.roomId), hiddenIds.length ? notInArray(favoriRoomMessagesTable.senderId, hiddenIds) : undefined)).orderBy(desc(favoriRoomMessagesTable.createdAt)).limit(100);
    res.json(ListRoomMessagesResponse.parse(await Promise.all(rows.reverse().map(messageDto))));
  });
  router.post("/chat/rooms/:roomId/messages", requireAuth, async (req, res) => {
    const room = ListRoomMessagesParams.safeParse(req.params);
    const body = SendRoomMessageBody.safeParse(req.body);
    if (!room.success || !body.success) { res.status(400).json({ error: "Oda veya mesaj geçersiz." }); return; }
    const id = requestUserId(req)!;
    const profile = await ensureUserProfile(id);
    const kind = body.data.kind ?? "text";
    let mediaUrl: string | null = null;
    let bookId: string | null = null;
    if (kind === "text" && !body.data.body.trim()) { res.status(400).json({ error: "Mesaj boş olamaz." }); return; }
    if (kind === "image") {
      if (!body.data.uploadId) { res.status(400).json({ error: "Önce geçerli bir galeri fotoğrafı yükle." }); return; }
      const result = await sendPhotoMessage(id, room.data.roomId, profile.name, body.data.uploadId, body.data.body);
      if (!("message" in result)) { res.status(result.status).json({ error: result.error }); return; }
      res.status(201).json(SendRoomMessageResponse.parse(await messageDto(result.message)));
      return;
    }
    if (kind === "gif") {
      const [policy] = await db.select().from(afilliRoomPoliciesTable).where(eq(afilliRoomPoliciesTable.roomId, room.data.roomId));
      if (policy?.allowGifs === false) { res.status(403).json({ error: "Bu odada GIF paylaşımı yönetici tarafından kapatıldı." }); return; }
      const [gif] = await db.select().from(afilliChatGifsTable).where(eq(afilliChatGifsTable.id, body.data.gifId ?? ""));
      if (!gif) { res.status(404).json({ error: "GIF arşivde bulunamadı." }); return; }
      mediaUrl = gif.url;
    }
    if (kind === "book") {
      const [book] = await db.select().from(favoriBooksTable).where(and(eq(favoriBooksTable.id, body.data.bookId ?? ""), eq(favoriBooksTable.authorId, id), eq(favoriBooksTable.status, "published")));
      if (!book) { res.status(400).json({ error: "Yayınlanmış kendi kitaplarından birini seç." }); return; }
      bookId = book.id;
    }
    const message = await db.transaction(async (tx) => {
      await tx.select({ id: favoriProfilesTable.id }).from(favoriProfilesTable).where(eq(favoriProfilesTable.id, id)).for("update");
      const [created] = await tx.insert(favoriRoomMessagesTable).values({ id: newId("chat"), roomId: room.data.roomId, senderId: id, senderName: profile.name, body: body.data.body.trim(), kind, mediaUrl, bookId }).returning();
      return created;
    });
    if (!message) { res.status(429).json({ error: "Bugünkü 5 fotoğraf hakkını doldurdun. Yarın tekrar deneyebilirsin." }); return; }
    res.status(201).json(SendRoomMessageResponse.parse(await messageDto(message)));
  });
  router.put("/chat/blocks/:profileId", requireAuth, async (req, res) => {
    const id = requestUserId(req)!;
    const target = param(req.params.profileId);
    const body = SetChatBlockBody.safeParse(req.body);
    if (!body.success || target === id) { res.status(400).json({ error: "Engelleme isteği geçersiz." }); return; }
    const [profile] = await db.select().from(favoriProfilesTable).where(eq(favoriProfilesTable.id, target));
    if (!profile) { res.status(404).json({ error: "Okur bulunamadı." }); return; }
    if (body.data.blocked) await db.insert(afilliUserBlocksTable).values({ blockerId: id, blockedId: target }).onConflictDoNothing();
    else await db.delete(afilliUserBlocksTable).where(and(eq(afilliUserBlocksTable.blockerId, id), eq(afilliUserBlocksTable.blockedId, target)));
    res.json({ active: body.data.blocked, count: body.data.blocked ? 1 : 0, value: body.data.blocked ? 1 : 0 });
  });
  router.post("/messages/read", requireAuth, async (req, res) => {
    const body = ReadConversationBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "Sohbet seçilmedi." }); return; }
    const rows = await db.update(favoriMessagesTable).set({ isRead: true }).where(and(eq(favoriMessagesTable.recipientId, requestUserId(req)!), eq(favoriMessagesTable.senderId, body.data.profileId))).returning({ id: favoriMessagesTable.id });
    res.json({ active: true, count: rows.length, value: rows.length });
  });
  router.get("/chat/admin/users", requireAuth, requireAdmin, async (_req, res) => {
    const users = await db.select().from(favoriProfilesTable).orderBy(desc(favoriProfilesTable.createdAt)).limit(500);
    res.json(ListChatAdminUsersResponse.parse(users.map(userDto)));
  });
  router.patch("/chat/admin/users/:profileId", requireAuth, requireAdmin, async (req, res) => {
    const target = param(req.params.profileId);
    const body = SetChatUserStatusBody.safeParse(req.body);
    if (!body.success || target === requestUserId(req) || isAdmin(target)) { res.status(400).json({ error: "Yönetici hesabı engellenemez." }); return; }
    const [profile] = await db.update(favoriProfilesTable).set({ isBlocked: body.data.blocked }).where(eq(favoriProfilesTable.id, target)).returning();
    if (!profile) { res.status(404).json({ error: "Okur bulunamadı." }); return; }
    res.json(userDto(profile));
  });
  router.patch("/chat/admin/rooms/:roomId", requireAuth, requireAdmin, async (req, res) => {
    const room = ListRoomMessagesParams.safeParse(req.params);
    const body = SetChatRoomPolicyBody.safeParse(req.body);
    if (!room.success || !body.success) { res.status(400).json({ error: "Oda ayarı geçersiz." }); return; }
    await db.insert(afilliRoomPoliciesTable).values({ roomId: room.data.roomId, allowGifs: body.data.allowGifs }).onConflictDoUpdate({ target: afilliRoomPoliciesTable.roomId, set: { allowGifs: body.data.allowGifs } });
    res.json({ ...rooms.find((item) => item.id === room.data.roomId), allowGifs: body.data.allowGifs });
  });
  router.post("/chat/admin/gifs", requireAuth, requireAdmin, async (req, res) => {
    const body = AddChatGifsBody.safeParse(req.body);
    if (!body.success || body.data.items.reduce((size, item) => size + item.url.length, 0) > 8000000) { res.status(400).json({ error: "En fazla 20 GIF ve toplam 8 MB yükleyin." }); return; }
    for (const gif of body.data.items) {
      const isData = /^data:image\/gif;base64,[a-zA-Z0-9+/=]+$/.test(gif.url);
      let isHttps = false;
      try { const url = new URL(gif.url); isHttps = url.protocol === "https:" && !url.username && !url.password; } catch { /* data URI */ }
      if (!isData && !isHttps) { res.status(400).json({ error: "GIF dosyası veya HTTPS GIF bağlantısı kullanın." }); return; }
    }
    const gifs = await db.insert(afilliChatGifsTable).values(body.data.items.map((gif) => ({ id: newId("gif"), url: gif.url, category: gif.category.trim() }))).returning();
    res.status(201).json(gifs);
  });
  router.delete("/chat/admin/gifs/:gifId", requireAuth, requireAdmin, async (req, res) => {
    const rows = await db.delete(afilliChatGifsTable).where(eq(afilliChatGifsTable.id, param(req.params.gifId))).returning({ id: afilliChatGifsTable.id });
    if (!rows.length) { res.status(404).json({ error: "GIF bulunamadı." }); return; }
    res.json({ active: false, count: 0, value: 0 });
  });
  return router;
}
