import { and, eq, lt } from "drizzle-orm";
import { db, favoriChatPhotoUploadsTable, favoriProfilesTable, favoriRoomMessagesTable } from "@workspace/db";
import { chatPhotoStorage, photoPath } from "./chatPhotoStorage";
import { logger } from "./logger";

// Cleanup failures retain their durable ledger row, so a future process retries.
// The ledger grace period is complemented by a storage-namespace sweep, since
// even an in-flight PUT can finish after its ledger row has been removed.
export async function cleanupChatPhotos(now = new Date()) {
  const expired = await db.select().from(favoriChatPhotoUploadsTable)
    .where(lt(favoriChatPhotoUploadsTable.expiresAt, new Date(now.getTime() - 10 * 60_000))).limit(100);
  for (const upload of expired) {
    try {
      await db.transaction(async (tx) => {
        // Same lock as message creation: never delete a photo being committed.
        await tx.select({ id: favoriProfilesTable.id }).from(favoriProfilesTable)
          .where(eq(favoriProfilesTable.id, upload.userId)).for("update");
        const [current] = await tx.select().from(favoriChatPhotoUploadsTable).where(eq(favoriChatPhotoUploadsTable.id, upload.id));
        if (!current) return;
        const [message] = await tx.select({ id: favoriRoomMessagesTable.id }).from(favoriRoomMessagesTable)
          .where(eq(favoriRoomMessagesTable.mediaUrl, photoPath(upload.id))).limit(1);
        await chatPhotoStorage.deleteUpload(upload.id);
        if (!message) await chatPhotoStorage.deletePhoto(upload.id);
        await tx.delete(favoriChatPhotoUploadsTable).where(and(eq(favoriChatPhotoUploadsTable.id, upload.id), eq(favoriChatPhotoUploadsTable.userId, upload.userId)));
      });
    } catch {
      logger.warn({ uploadId: upload.id }, "Chat photo cleanup will retry");
    }
  }
  try {
    await chatPhotoStorage.sweepStaleUploads(new Date(now.getTime() - 15 * 60_000));
  } catch {
    logger.warn("Chat photo staging sweep will retry");
  }
}

export function startChatPhotoCleanup() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await cleanupChatPhotos(); }
    catch { logger.warn("Chat photo cleanup unavailable; will retry"); }
    finally { running = false; }
  };
  void run();
  const timer = setInterval(() => void run(), 60_000);
  timer.unref();
}
