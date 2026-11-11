import { Router, type Request, type RequestHandler } from "express";
import { and, count, eq, gt, gte, or } from "drizzle-orm";
import { db, afilliUserBlocksTable, favoriChatPhotoUploadsTable, favoriProfilesTable, favoriRoomMessagesTable } from "@workspace/db";
import { GetChatPhotoParams, ListRoomMessagesParams, RequestChatPhotoUploadBody, RequestChatPhotoUploadResponse } from "@workspace/api-zod";
import { CHAT_PHOTO_TTL_MS, chatPhotoStorage, InvalidChatPhoto, photoPath } from "../../lib/chatPhotoStorage";
import { logger } from "../../lib/logger";
import { newId } from "./seed";

export function dayStart() {
  const shifted = new Date(Date.now() + 3 * 60 * 60 * 1000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 3 * 60 * 60 * 1000);
}
const quotaError = { status: 429, error: "Bugünkü 5 fotoğraf hakkını doldurdun. Yarın tekrar deneyebilirsin." };

async function removeUncommittedFiles(id: string) {
  try {
    await chatPhotoStorage.deleteUpload(id);
    await chatPhotoStorage.deletePhoto(id);
  } catch {
    logger.warn({ uploadId: id }, "Uncommitted chat photo cleanup will retry from ledger");
  }
}

export async function cancelPhoto(userId: string, uploadId: string) {
  await db.transaction(async (tx) => {
    await tx.select({ id: favoriProfilesTable.id }).from(favoriProfilesTable).where(eq(favoriProfilesTable.id, userId)).for("update");
    const [upload] = await tx.select().from(favoriChatPhotoUploadsTable).where(and(eq(favoriChatPhotoUploadsTable.id, uploadId), eq(favoriChatPhotoUploadsTable.userId, userId)));
    if (!upload || upload.state === "complete") return;
    await tx.update(favoriChatPhotoUploadsTable).set({ state: "cancelled" }).where(eq(favoriChatPhotoUploadsTable.id, uploadId));
    await removeUncommittedFiles(uploadId);
  });
}

type PhotoMessageResult =
  | { status: number; error: string }
  | { status: 201; message: typeof favoriRoomMessagesTable.$inferSelect };

export async function sendPhotoMessage(userId: string, roomId: string, senderName: string, uploadId: string, body: string): Promise<PhotoMessageResult> {
  try {
    return await db.transaction<PhotoMessageResult>(async (tx) => {
      await tx.select({ id: favoriProfilesTable.id }).from(favoriProfilesTable).where(eq(favoriProfilesTable.id, userId)).for("update");
      const [upload] = await tx.select().from(favoriChatPhotoUploadsTable).where(and(eq(favoriChatPhotoUploadsTable.id, uploadId), eq(favoriChatPhotoUploadsTable.userId, userId)));
      if (!upload || upload.state !== "pending") return { status: 400, error: "Fotoğraf yüklemesi bulunamadı veya zaten kullanıldı." };
      if (upload.roomId !== roomId || upload.expiresAt.getTime() <= Date.now()) {
        await tx.update(favoriChatPhotoUploadsTable).set({ state: "cancelled" }).where(eq(favoriChatPhotoUploadsTable.id, uploadId));
        await removeUncommittedFiles(uploadId);
        return { status: 400, error: "Fotoğrafın odası veya yükleme süresi geçersiz." };
      }
      const [photos] = await tx.select({ value: count() }).from(favoriRoomMessagesTable).where(and(eq(favoriRoomMessagesTable.senderId, userId), eq(favoriRoomMessagesTable.kind, "image"), gte(favoriRoomMessagesTable.createdAt, dayStart())));
      if (photos.value >= 5) {
        await tx.update(favoriChatPhotoUploadsTable).set({ state: "cancelled" }).where(eq(favoriChatPhotoUploadsTable.id, uploadId));
        await removeUncommittedFiles(uploadId);
        return quotaError;
      }
      const bytes = await chatPhotoStorage.readUpload(uploadId, upload.size, upload.contentType);
      await chatPhotoStorage.savePhoto(uploadId, bytes, upload.contentType);
      const [message] = await tx.insert(favoriRoomMessagesTable).values({
        id: newId("chat"), roomId, senderId: userId, senderName, body: body.trim(), kind: "image", mediaUrl: photoPath(uploadId),
      }).returning();
      if (!message) throw new Error("Photo message insert returned no row");
      await tx.update(favoriChatPhotoUploadsTable).set({ state: "complete" }).where(eq(favoriChatPhotoUploadsTable.id, uploadId));
      return { status: 201, message };
    });
  } catch (error) {
    // Includes transaction/commit failures. A fresh transaction checks ownership
    // and completion before deleting anything; ambiguous commits preserve media.
    try { await cancelPhoto(userId, uploadId); }
    catch { logger.warn({ uploadId }, "Chat photo failure retained for cleanup"); }
    if (error instanceof InvalidChatPhoto) return { status: 400, error: error.message };
    logger.warn({ uploadId }, "Chat photo could not be committed");
    return { status: 503, error: "Fotoğraf kaydedilemedi. Lütfen tekrar seçip gönder." };
  }
}

export function createChatPhotoRouter(helpers: {
  requireAuth: RequestHandler;
  requestUserId: (req: Request) => string | null;
  ensureUserProfile: (id: string) => Promise<typeof favoriProfilesTable.$inferSelect>;
}) {
  const router = Router();
  const { requireAuth, requestUserId, ensureUserProfile } = helpers;
  router.post("/chat/rooms/:roomId/photos", requireAuth, async (req, res): Promise<void> => {
    const room = ListRoomMessagesParams.safeParse(req.params);
    const input = RequestChatPhotoUploadBody.safeParse(req.body);
    if (!room.success || !input.success) { res.status(400).json({ error: "JPEG, PNG, WebP veya GIF ve en fazla 2,25 MB fotoğraf seç." }); return; }
    const id = requestUserId(req)!;
    await ensureUserProfile(id);
    const result = await db.transaction(async (tx) => {
      await tx.select({ id: favoriProfilesTable.id }).from(favoriProfilesTable).where(eq(favoriProfilesTable.id, id)).for("update");
      const [photos] = await tx.select({ value: count() }).from(favoriRoomMessagesTable).where(and(eq(favoriRoomMessagesTable.senderId, id), eq(favoriRoomMessagesTable.kind, "image"), gte(favoriRoomMessagesTable.createdAt, dayStart())));
      if (photos.value >= 5) return quotaError;
      const [pending] = await tx.select({ value: count() }).from(favoriChatPhotoUploadsTable).where(and(eq(favoriChatPhotoUploadsTable.userId, id), eq(favoriChatPhotoUploadsTable.state, "pending"), gt(favoriChatPhotoUploadsTable.expiresAt, new Date())));
      if (pending.value >= 5) return { status: 429, error: "Önce bekleyen fotoğraf yüklemelerini tamamla veya iptal et." };
      const uploadId = newId("photo");
      await tx.insert(favoriChatPhotoUploadsTable).values({
        id: uploadId, userId: id, roomId: room.data.roomId, ...input.data, expiresAt: new Date(Date.now() + CHAT_PHOTO_TTL_MS),
      });
      // No bytes can exist before this transaction has committed.
      return { status: 200, uploadId };
    });
    if (!("uploadId" in result)) { res.status(result.status).json({ error: result.error }); return; }
    try {
      const uploadUrl = await chatPhotoStorage.requestUpload(result.uploadId, input.data.size, input.data.contentType, req.get("origin"));
      res.json(RequestChatPhotoUploadResponse.parse({ uploadId: result.uploadId, uploadUrl }));
    } catch {
      await cancelPhoto(id, result.uploadId);
      res.status(503).json({ error: "Fotoğraf depolama şu anda kullanılamıyor." });
    }
  });
  router.delete("/chat/photos/:uploadId", requireAuth, async (req, res): Promise<void> => {
    const uploadId = String(req.params.uploadId);
    await cancelPhoto(requestUserId(req)!, uploadId);
    res.sendStatus(204);
  });
  router.get("/chat/rooms/:roomId/photos/:messageId", requireAuth, async (req, res): Promise<void> => {
    const params = GetChatPhotoParams.safeParse(req.params);
    if (!params.success) { res.sendStatus(404); return; }
    const [message] = await db.select().from(favoriRoomMessagesTable).where(and(eq(favoriRoomMessagesTable.id, params.data.messageId), eq(favoriRoomMessagesTable.roomId, params.data.roomId), eq(favoriRoomMessagesTable.kind, "image")));
    if (!message?.mediaUrl?.startsWith("/objects/chat/photos/")) { res.sendStatus(404); return; }
    const id = requestUserId(req)!;
    const [block] = await db.select().from(afilliUserBlocksTable).where(or(
      and(eq(afilliUserBlocksTable.blockerId, id), eq(afilliUserBlocksTable.blockedId, message.senderId)),
      and(eq(afilliUserBlocksTable.blockerId, message.senderId), eq(afilliUserBlocksTable.blockedId, id)),
    )).limit(1);
    if (block) { res.sendStatus(404); return; }
    try {
      const { contentType, stream } = await chatPhotoStorage.readPhoto(message.mediaUrl);
      res.set({ "Content-Type": contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
      stream.on("error", () => { if (!res.headersSent) res.sendStatus(503); else res.destroy(); });
      stream.pipe(res);
    } catch { res.sendStatus(503); }
  });
  return router;
}
