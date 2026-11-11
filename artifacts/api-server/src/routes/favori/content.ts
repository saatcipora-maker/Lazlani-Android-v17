import { Router, type Request, type RequestHandler } from "express";
import { and, count, desc, eq, gt, or, sql } from "drizzle-orm";
import {
  db, afilliMediaTable, afilliStoriesTable, afilliVideosTable, afilliContentViewsTable,
  afilliUserBlocksTable, favoriBookAdsTable, favoriBooksTable, favoriCommentsTable,
  favoriNotificationsTable, favoriPostsTable, favoriProfilesTable, favoriReactionsTable,
  favoriReadingProgressTable,
} from "@workspace/db";
import {
  BeginContentUploadBody, CreateStoryBody, CreateSpecialVideoBody, AddVideoCommentBody,
  UpdateContentPostBody, ReviewPromotionRequestBody,
} from "@workspace/api-zod";
import { contentObjectPath, finalizeContentFile, signContentFile } from "../../lib/contentStorage";
import { newId } from "./seed";
import { expiredUpload, withContentLifecycleLock } from "../../lib/contentLifecycle";
import { hasContentReferences } from "../../lib/contentCleanup";

export class ContentError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const admin = (id: string | null) => !!id && process.env.AFILLI_ADMIN_USER_ID?.trim() === id;
export function freeAccess(id: string | null) {
  return {
    store: !!id && process.env.FAVORI_SHOP_OWNER_USER_ID?.trim() === id,
    magazine: !!id, special: !!id, available: false,
    message: id ? "Dergi ve Özel alanı tüm kayıtlı Afilli kullanıcılarına ücretsizdir. Abonelik veya ödeme gerekmez." : "Dergi ve Özel alanını ücretsiz kullanmak için giriş yap veya kaydol.",
  };
}
const idParam = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value ?? "";
async function ownedMedia(id: string, ownerId: string, purpose: string) {
  const [asset] = await db.select().from(afilliMediaTable).where(eq(afilliMediaTable.id, id)).limit(1);
  if (!asset || asset.ownerId !== ownerId || !asset.ready || asset.purpose !== purpose) throw new ContentError(400, "Bu dosya hesabına ait değil veya yükleme tamamlanmadı.");
  return asset;
}
export async function validateContentImage(url: string | null | undefined, ownerId: string) {
  const match = url?.match(/\/content\/media\/([A-Za-z0-9_-]+)/);
  if (match) await ownedMedia(match[1], ownerId, "post");
}
export async function validatePost(data: { type: string; body: string; imageUrl?: string | null; bookId?: string | null }, ownerId: string) {
  if (!data.body.trim() && !data.imageUrl && !data.bookId) throw new ContentError(400, "Bir metin, fotoğraf veya kitap seç.");
  const cap = data.type === "newsletter" ? 1000 : 3000;
  if (data.body.trim().split(/\s+/).filter(Boolean).length > cap) throw new ContentError(400, `Bu paylaşım en fazla ${cap} kelime olabilir.`);
  if (data.type === "photo" && !data.imageUrl) throw new ContentError(400, "Fotoğraf paylaşımı için bir görsel seç.");
  await validateContentImage(data.imageUrl, ownerId);
  if (data.bookId) {
    const [book] = await db.select().from(favoriBooksTable).where(and(eq(favoriBooksTable.id, data.bookId), eq(favoriBooksTable.authorId, ownerId), eq(favoriBooksTable.status, "published"))).limit(1);
    if (!book) throw new ContentError(400, "Yalnızca yayımladığın kendi kitabını paylaşabilirsin.");
  }
}
export async function linkPostMedia(imageUrl?: string | null) {
  const match = imageUrl?.match(/^\/api\/content\/media\/([A-Za-z0-9_-]+)$/);
  if (match) await db.update(afilliMediaTable).set({ linked: true }).where(eq(afilliMediaTable.id, match[1]));
}
async function releasePostMedia(imageUrl?: string | null) {
  const match = imageUrl?.match(/^\/api\/content\/media\/([A-Za-z0-9_-]+)$/);
  if (!match) return;
  const [reference] = await db.select({ id: favoriPostsTable.id }).from(favoriPostsTable).where(eq(favoriPostsTable.imageUrl, imageUrl!)).limit(1);
  if (!reference) await db.update(afilliMediaTable).set({ linked: false }).where(eq(afilliMediaTable.id, match[1]));
}

export function createContentRouter(helpers: {
  requireAuth: RequestHandler;
  requestUserId: (req: Request) => string | null;
  ensureUserProfile: (id: string) => Promise<typeof favoriProfilesTable.$inferSelect>;
  getPostDto: (post: typeof favoriPostsTable.$inferSelect, viewerId: string | null) => Promise<unknown>;
}) {
  const router = Router();
  const { requireAuth, requestUserId: viewer, ensureUserProfile, getPostDto } = helpers;
  const safe = (action: RequestHandler): RequestHandler => async (req, res, next) => {
    try {
      if (req.method === "GET") await action(req, res, next);
      else await withContentLifecycleLock(async () => { await action(req, res, next); });
    }
    catch (error) { if (error instanceof ContentError) res.status(error.status).json({ error: error.message }); else next(error); }
  };
  const owned = (owner: string, id: string | null) => {
    if (id !== owner && !admin(id)) throw new ContentError(403, "Bu içerik üzerinde işlem yapamazsın.");
  };
  const visibleAuthor = async (author: string, user: string) => {
    const [block] = await db.select().from(afilliUserBlocksTable).where(or(and(eq(afilliUserBlocksTable.blockerId, author), eq(afilliUserBlocksTable.blockedId, user)), and(eq(afilliUserBlocksTable.blockerId, user), eq(afilliUserBlocksTable.blockedId, author)))).limit(1);
    const [profile] = await db.select().from(favoriProfilesTable).where(eq(favoriProfilesTable.id, author)).limit(1);
    return !block && !profile?.isBlocked;
  };
  async function videoDto(video: typeof afilliVideosTable.$inferSelect, user: string) {
    const [author] = await db.select().from(favoriProfilesTable).where(eq(favoriProfilesTable.id, video.authorId)).limit(1);
    const [reactions, views, comments] = await Promise.all([
      db.select().from(favoriReactionsTable).where(and(eq(favoriReactionsTable.targetType, "video"), eq(favoriReactionsTable.targetId, video.id))),
      db.select({ value: count() }).from(afilliContentViewsTable).where(and(eq(afilliContentViewsTable.targetType, "video"), eq(afilliContentViewsTable.targetId, video.id))),
      db.select({ value: count() }).from(favoriCommentsTable).where(and(eq(favoriCommentsTable.targetType, "video"), eq(favoriCommentsTable.targetId, video.id))),
    ]);
    return { ...video, createdAt: video.createdAt.toISOString(), author: author?.name ?? "Okur", avatarUrl: author?.avatarUrl ?? null, likes: reactions.length, views: views[0].value, comments: comments[0].value, likedByMe: reactions.some((row) => row.userId === user), canManage: video.authorId === user || admin(user) };
  }
  async function findVideo(id: string, user: string) {
    const [video] = await db.select().from(afilliVideosTable).where(eq(afilliVideosTable.id, id)).limit(1);
    if (!video || !await visibleAuthor(video.authorId, user)) throw new ContentError(404, "Video bulunamadı.");
    return video;
  }
  async function notify(userId: string, actorId: string, text: string) {
    if (userId === actorId) return;
    const actor = await ensureUserProfile(actorId);
    await db.insert(favoriNotificationsTable).values({ id: newId("notice"), userId, actorName: actor.name, actorAvatarUrl: actor.avatarUrl, action: "comment", text, timeLabel: "Az önce", relatedProfileId: actorId });
  }

  router.post("/content/uploads", requireAuth, safe(async (req, res) => {
    const parsed = BeginContentUploadBody.safeParse(req.body);
    if (!parsed.success) throw new ContentError(400, "Dosya bilgileri geçersiz.");
    const data = parsed.data;
    if ((data.purpose === "video") !== data.mime.startsWith("video/") || (data.purpose !== "video" && data.size > 10 * 1024 * 1024)) throw new ContentError(400, "Fotoğraflar en fazla 10 MB, videolar en fazla 100 MB olabilir; dosya türünü kontrol et.");
    const user = viewer(req)!;
    const id = newId("media");
    const objectPath = contentObjectPath(id);
    // Persist first: even a failed signing request leaves a cleanup ledger.
    await db.insert(afilliMediaTable).values({ id, ownerId: user, ...data, objectPath });
    const uploadUrl = await signContentFile(objectPath, "PUT");
    res.status(201).json({ id, uploadUrl });
  }));
  router.post("/content/uploads/:mediaId/complete", requireAuth, safe(async (req, res) => {
    const [asset] = await db.select().from(afilliMediaTable).where(eq(afilliMediaTable.id, idParam(req.params.mediaId))).limit(1);
    if (!asset || asset.ownerId !== viewer(req)) throw new ContentError(404, "Yükleme bulunamadı.");
    if (asset.purpose === "cancelled" || (!asset.ready && expiredUpload(asset.createdAt))) throw new ContentError(410, "Bu yüklemenin süresi doldu. Dosyayı yeniden seç.");
    if (asset.ready) { res.json({ id: asset.id, path: `/api/content/media/${asset.id}` }); return; }
    let finalPath: string;
    try { finalPath = await finalizeContentFile(asset); }
    catch { throw new ContentError(400, "Yükleme eksik veya dosya türü/boyutu geçersiz. Dosyayı yeniden seç."); }
    await db.update(afilliMediaTable).set({ ready: true, objectPath: finalPath }).where(eq(afilliMediaTable.id, asset.id));
    res.json({ id: asset.id, path: `/api/content/media/${asset.id}` });
  }));
  router.delete("/content/uploads/:mediaId", requireAuth, safe(async (req, res) => {
    const [asset] = await db.select().from(afilliMediaTable).where(eq(afilliMediaTable.id, idParam(req.params.mediaId))).limit(1);
    if (!asset || asset.ownerId !== viewer(req)) throw new ContentError(404, "Yükleme bulunamadı.");
    if (await hasContentReferences(asset.id)) throw new ContentError(409, "Yayımlanmış bir içeriğin dosyası bu işlemle silinemez.");
    // Cancel access immediately; retain ownership and allocation age until the
    // scheduled pass can safely sweep BOTH staging and /ready.
    await db.update(afilliMediaTable).set({ ready: false, linked: false, purpose: "cancelled" }).where(eq(afilliMediaTable.id, asset.id));
    res.sendStatus(204);
  }));
  router.get("/content/media/:mediaId/url", safe(async (req, res) => {
    const [asset] = await db.select().from(afilliMediaTable).where(eq(afilliMediaTable.id, idParam(req.params.mediaId))).limit(1);
    const id = viewer(req);
    if (!asset?.ready || (!asset.linked && asset.ownerId !== id)) throw new ContentError(404, "Dosya bulunamadı.");
    if (asset.purpose !== "post") {
      if (!id) throw new ContentError(401, "Bu içeriği görmek için giriş yap.");
      const [profile] = await db.select().from(favoriProfilesTable).where(eq(favoriProfilesTable.id, id)).limit(1);
      if (profile?.isBlocked || !await visibleAuthor(asset.ownerId, id)) throw new ContentError(403, "Bu içeriğe erişimin yok.");
      if (asset.purpose === "story" && asset.linked) {
        const [story] = await db.select().from(afilliStoriesTable).where(and(eq(afilliStoriesTable.mediaId, asset.id), gt(afilliStoriesTable.expiresAt, new Date()))).limit(1);
        if (!story) throw new ContentError(404, "Hikâyenin süresi doldu.");
      }
    }
    res.set("Cache-Control", "private, no-store").json({ url: await signContentFile(asset.objectPath, "GET") });
  }));
  router.get("/content/stories", requireAuth, safe(async (req, res) => {
    const user = viewer(req)!;
    const rows = await db.select().from(afilliStoriesTable).where(gt(afilliStoriesTable.expiresAt, new Date())).orderBy(desc(afilliStoriesTable.createdAt)).limit(100);
    const seen = await db.select().from(afilliContentViewsTable).where(and(eq(afilliContentViewsTable.userId, user), eq(afilliContentViewsTable.targetType, "story")));
    const output = [];
    for (const row of rows) {
      if (!await visibleAuthor(row.authorId, user)) continue;
      const author = await ensureUserProfile(row.authorId);
      output.push({ ...row, author: author.name, avatarUrl: author.avatarUrl, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString(), seen: seen.some((view) => view.targetId === row.id), canManage: row.authorId === user || admin(user) });
    }
    res.json(output);
  }));
  router.post("/content/stories", requireAuth, safe(async (req, res) => {
    const parsed = CreateStoryBody.safeParse(req.body);
    if (!parsed.success || (!parsed.data.body.trim() && !parsed.data.mediaId)) throw new ContentError(400, "Bir metin yaz veya fotoğraf seç.");
    const user = viewer(req)!;
    const author = await ensureUserProfile(user);
    if (parsed.data.mediaId) await ownedMedia(parsed.data.mediaId, user, "story");
    const [story] = await db.transaction(async (tx) => {
      if (parsed.data.mediaId) await tx.update(afilliMediaTable).set({ linked: true }).where(eq(afilliMediaTable.id, parsed.data.mediaId));
      return tx.insert(afilliStoriesTable).values({ id: newId("story"), authorId: user, ...parsed.data, expiresAt: new Date(Date.now() + 86400000) }).returning();
    });
    res.status(201).json({ ...story, createdAt: story.createdAt.toISOString(), expiresAt: story.expiresAt.toISOString(), author: author.name, avatarUrl: author.avatarUrl, seen: false, canManage: true });
  }));
  router.post("/content/stories/:storyId/view", requireAuth, safe(async (req, res) => {
    const [story] = await db.select().from(afilliStoriesTable).where(and(eq(afilliStoriesTable.id, idParam(req.params.storyId)), gt(afilliStoriesTable.expiresAt, new Date()))).limit(1);
    if (!story || !await visibleAuthor(story.authorId, viewer(req)!)) throw new ContentError(404, "Hikâye bulunamadı.");
    await db.insert(afilliContentViewsTable).values({ userId: viewer(req)!, targetType: "story", targetId: story.id }).onConflictDoNothing();
    res.sendStatus(204);
  }));
  router.delete("/content/stories/:storyId", requireAuth, safe(async (req, res) => {
    const [row] = await db.select().from(afilliStoriesTable).where(eq(afilliStoriesTable.id, idParam(req.params.storyId))).limit(1);
    if (!row) throw new ContentError(404, "Hikâye bulunamadı.");
    owned(row.authorId, viewer(req));
    await db.delete(afilliStoriesTable).where(eq(afilliStoriesTable.id, row.id));
    res.sendStatus(204);
  }));
  router.get("/content/videos", requireAuth, safe(async (req, res) => {
    const rows = await db.select().from(afilliVideosTable).orderBy(desc(afilliVideosTable.createdAt)).limit(40);
    const output = [];
    for (const row of rows) if (await visibleAuthor(row.authorId, viewer(req)!)) output.push(await videoDto(row, viewer(req)!));
    res.json(output);
  }));
  router.post("/content/videos", requireAuth, safe(async (req, res) => {
    const parsed = CreateSpecialVideoBody.safeParse(req.body);
    if (!parsed.success || !parsed.data.title.trim()) throw new ContentError(400, "Video için bir başlık ve yüklenmiş dosya seç.");
    const user = viewer(req)!;
    await ensureUserProfile(user);
    const asset = await ownedMedia(parsed.data.mediaId, user, "video");
    if (asset.linked) throw new ContentError(409, "Bu video zaten yayımlanmış.");
    const [video] = await db.transaction(async (tx) => {
      await tx.update(afilliMediaTable).set({ linked: true }).where(eq(afilliMediaTable.id, asset.id));
      return tx.insert(afilliVideosTable).values({ id: newId("video"), authorId: user, ...parsed.data }).returning();
    });
    res.status(201).json(await videoDto(video, user));
  }));
  router.delete("/content/videos/:videoId", requireAuth, safe(async (req, res) => {
    const row = await findVideo(idParam(req.params.videoId), viewer(req)!);
    owned(row.authorId, viewer(req));
    await db.transaction(async (tx) => {
      await tx.delete(afilliVideosTable).where(eq(afilliVideosTable.id, row.id));
      await tx.delete(favoriCommentsTable).where(and(eq(favoriCommentsTable.targetType, "video"), eq(favoriCommentsTable.targetId, row.id)));
      await tx.delete(favoriReactionsTable).where(and(eq(favoriReactionsTable.targetType, "video"), eq(favoriReactionsTable.targetId, row.id)));
    });
    if (!await hasContentReferences(row.mediaId)) {
      await db.update(afilliMediaTable).set({ ready: false, linked: false, purpose: "cancelled" }).where(eq(afilliMediaTable.id, row.mediaId));
    }
    res.sendStatus(204);
  }));
  router.post("/content/videos/:videoId/like", requireAuth, safe(async (req, res) => {
    const row = await findVideo(idParam(req.params.videoId), viewer(req)!);
    const user = viewer(req)!;
    await db.transaction(async (tx) => {
      await tx.select().from(afilliVideosTable).where(eq(afilliVideosTable.id, row.id)).for("update");
      const filter = and(eq(favoriReactionsTable.userId, user), eq(favoriReactionsTable.targetType, "video"), eq(favoriReactionsTable.targetId, row.id), eq(favoriReactionsTable.kind, "like"));
      const [existing] = await tx.select().from(favoriReactionsTable).where(filter).limit(1);
      if (existing) await tx.delete(favoriReactionsTable).where(filter);
      else await tx.insert(favoriReactionsTable).values({ userId: user, targetType: "video", targetId: row.id, kind: "like" });
    });
    res.json(await videoDto(row, user));
  }));
  router.post("/content/videos/:videoId/view", requireAuth, safe(async (req, res) => {
    const row = await findVideo(idParam(req.params.videoId), viewer(req)!);
    await db.insert(afilliContentViewsTable).values({ userId: viewer(req)!, targetType: "video", targetId: row.id }).onConflictDoNothing();
    res.sendStatus(204);
  }));
  router.get("/content/videos/:videoId/comments", requireAuth, safe(async (req, res) => {
    const row = await findVideo(idParam(req.params.videoId), viewer(req)!);
    const comments = await db.select().from(favoriCommentsTable).where(and(eq(favoriCommentsTable.targetType, "video"), eq(favoriCommentsTable.targetId, row.id))).orderBy(desc(favoriCommentsTable.createdAt)).limit(100);
    res.json(await Promise.all(comments.map(async (comment) => {
      const author = await ensureUserProfile(comment.authorId);
      return { ...comment, author: author.name, avatarUrl: author.avatarUrl, createdAt: comment.createdAt.toISOString() };
    })));
  }));
  router.post("/content/videos/:videoId/comments", requireAuth, safe(async (req, res) => {
    const video = await findVideo(idParam(req.params.videoId), viewer(req)!);
    const parsed = AddVideoCommentBody.safeParse(req.body);
    if (!parsed.success || !parsed.data.body.trim()) throw new ContentError(400, "Yorum metni boş olamaz.");
    const author = await ensureUserProfile(viewer(req)!);
    const [comment] = await db.insert(favoriCommentsTable).values({ id: newId("comment"), authorId: author.id, targetType: "video", targetId: video.id, body: parsed.data.body.trim() }).returning();
    await notify(video.authorId, author.id, `${video.title} videona yorum yaptı`);
    res.status(201).json({ ...comment, author: author.name, avatarUrl: author.avatarUrl, createdAt: comment.createdAt.toISOString() });
  }));
  router.delete("/content/comments/:commentId", requireAuth, safe(async (req, res) => {
    const [comment] = await db.select().from(favoriCommentsTable).where(eq(favoriCommentsTable.id, idParam(req.params.commentId))).limit(1);
    if (!comment) throw new ContentError(404, "Yorum bulunamadı.");
    owned(comment.authorId, viewer(req));
    await db.transaction(async (tx) => {
      const removed = await tx.delete(favoriCommentsTable).where(eq(favoriCommentsTable.id, comment.id)).returning();
      if (!removed.length) return;
      if (comment.targetType === "post") await tx.update(favoriPostsTable).set({ commentCount: sql`greatest(0, ${favoriPostsTable.commentCount} - 1)` }).where(eq(favoriPostsTable.id, comment.targetId));
      if (comment.targetType === "book") await tx.update(favoriBooksTable).set({ commentCount: sql`greatest(0, ${favoriBooksTable.commentCount} - 1)` }).where(eq(favoriBooksTable.id, comment.targetId));
    });
    res.sendStatus(204);
  }));
  router.get("/content/posts/:postId", safe(async (req, res) => {
    const [post] = await db.select().from(favoriPostsTable).where(eq(favoriPostsTable.id, idParam(req.params.postId))).limit(1);
    if (!post) throw new ContentError(404, "Paylaşım bulunamadı.");
    const user = viewer(req);
    if (user) {
      const inserted = await db.insert(afilliContentViewsTable).values({ userId: user, targetType: "post", targetId: post.id }).onConflictDoNothing().returning();
      if (inserted.length) { await db.update(favoriPostsTable).set({ views: sql`${favoriPostsTable.views} + 1` }).where(eq(favoriPostsTable.id, post.id)); post.views++; }
    }
    res.json(await getPostDto(post, user));
  }));
  router.patch("/content/posts/:postId", requireAuth, safe(async (req, res) => {
    const [post] = await db.select().from(favoriPostsTable).where(eq(favoriPostsTable.id, idParam(req.params.postId))).limit(1);
    if (!post) throw new ContentError(404, "Paylaşım bulunamadı.");
    if (post.authorId !== viewer(req)) throw new ContentError(403, "Yalnızca kendi paylaşımını düzenleyebilirsin.");
    const parsed = UpdateContentPostBody.safeParse(req.body);
    if (!parsed.success) throw new ContentError(400, "Paylaşım bilgileri geçersiz.");
    await validatePost(parsed.data, viewer(req)!);
    const [updated] = await db.update(favoriPostsTable).set(parsed.data).where(eq(favoriPostsTable.id, post.id)).returning();
    await linkPostMedia(updated.imageUrl);
    if (updated.imageUrl !== post.imageUrl) await releasePostMedia(post.imageUrl);
    res.json(await getPostDto(updated, viewer(req)));
  }));
  router.delete("/content/posts/:postId", requireAuth, safe(async (req, res) => {
    const [post] = await db.select().from(favoriPostsTable).where(eq(favoriPostsTable.id, idParam(req.params.postId))).limit(1);
    if (!post) throw new ContentError(404, "Paylaşım bulunamadı.");
    owned(post.authorId, viewer(req));
    await db.transaction(async (tx) => {
      await tx.delete(favoriPostsTable).where(eq(favoriPostsTable.id, post.id));
      await tx.delete(favoriCommentsTable).where(and(eq(favoriCommentsTable.targetType, "post"), eq(favoriCommentsTable.targetId, post.id)));
      await tx.delete(favoriReactionsTable).where(and(eq(favoriReactionsTable.targetType, "post"), eq(favoriReactionsTable.targetId, post.id)));
    });
    await releasePostMedia(post.imageUrl);
    res.sendStatus(204);
  }));
  router.delete("/content/books/:bookId", requireAuth, safe(async (req, res) => {
    const [book] = await db.select().from(favoriBooksTable).where(eq(favoriBooksTable.id, idParam(req.params.bookId))).limit(1);
    if (!book) throw new ContentError(404, "Kitap bulunamadı.");
    owned(book.authorId ?? "", viewer(req));
    await db.transaction(async (tx) => {
      await tx.delete(favoriBooksTable).where(eq(favoriBooksTable.id, book.id));
      await tx.delete(favoriCommentsTable).where(and(eq(favoriCommentsTable.targetType, "book"), eq(favoriCommentsTable.targetId, book.id)));
      await tx.delete(favoriReactionsTable).where(and(eq(favoriReactionsTable.targetType, "book"), eq(favoriReactionsTable.targetId, book.id)));
      await tx.delete(favoriReadingProgressTable).where(eq(favoriReadingProgressTable.bookId, book.id));
      await tx.delete(favoriBookAdsTable).where(eq(favoriBookAdsTable.bookId, book.id));
      await tx.update(favoriPostsTable).set({ bookId: null }).where(eq(favoriPostsTable.bookId, book.id));
    });
    res.sendStatus(204);
  }));
  async function adDto(row: typeof favoriBookAdsTable.$inferSelect, id: string) {
    const [book] = await db.select().from(favoriBooksTable).where(eq(favoriBooksTable.id, row.bookId)).limit(1);
    return { id: row.id, bookId: row.bookId, title: book?.title ?? "Silinmiş kitap", budget: row.budget, status: row.status, canManage: admin(id) };
  }
  router.get("/content/ads", requireAuth, safe(async (req, res) => {
    const id = viewer(req)!;
    const rows = await db.select().from(favoriBookAdsTable).where(admin(id) ? undefined : eq(favoriBookAdsTable.userId, id)).orderBy(desc(favoriBookAdsTable.createdAt)).limit(100);
    res.json(await Promise.all(rows.map((row) => adDto(row, id))));
  }));
  router.patch("/content/ads/:adId", requireAuth, safe(async (req, res) => {
    if (!admin(viewer(req))) throw new ContentError(403, "Tanıtımları yalnızca yönetici değerlendirebilir.");
    const parsed = ReviewPromotionRequestBody.safeParse(req.body);
    if (!parsed.success) throw new ContentError(400, "Geçersiz değerlendirme.");
    const [request] = await db.select().from(favoriBookAdsTable).where(eq(favoriBookAdsTable.id, idParam(req.params.adId))).limit(1);
    if (!request) throw new ContentError(404, "Talep bulunamadı.");
    const [book] = await db.select().from(favoriBooksTable).where(eq(favoriBooksTable.id, request.bookId)).limit(1);
    if (!book || book.status !== "published") throw new ContentError(409, "Yalnızca yayımlanmış bir kitap öne çıkarılabilir.");
    const [updated] = await db.transaction(async (tx) => {
      await tx.select().from(favoriBooksTable).where(eq(favoriBooksTable.id, book.id)).for("update");
      const rows = await tx.update(favoriBookAdsTable).set({ status: parsed.data.status }).where(eq(favoriBookAdsTable.id, request.id)).returning();
      const approved = await tx.select({ value: count() }).from(favoriBookAdsTable).where(and(eq(favoriBookAdsTable.bookId, book.id), eq(favoriBookAdsTable.status, "approved")));
      await tx.update(favoriBooksTable).set({ isPromoted: approved[0].value > 0 }).where(eq(favoriBooksTable.id, book.id));
      return rows;
    });
    await notify(request.userId, viewer(req)!, `${book.title} tanıtım talebin ${parsed.data.status === "approved" ? "onaylandı" : "reddedildi"}`);
    res.json(await adDto(updated, viewer(req)!));
  }));
  return router;
}
