import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { chatPhotoStorage, MAX_CHAT_PHOTO_BYTES } from "../src/lib/chatPhotoStorage";

// Opt-in cloud transport checks; no database, auth-provider or Shopify writes.
// Run: CHAT_STORAGE_INTEGRATION=1 pnpm exec vitest run artifacts/api-server/tests/chat-photo-storage.integration.test.ts
describe.skipIf(process.env.CHAT_STORAGE_INTEGRATION !== "1")("real App Storage upload size boundary", () => {
  it.each([false, true])("rejects oversized PUT before persisting an object (forged range: %s)", async (forgeRange) => {
    const id = `integration_${randomUUID().replaceAll("-", "")}`;
    try {
      const url = await chatPhotoStorage.requestUpload(id, 16, "image/png");
      const headers: Record<string, string> = { "Content-Type": "image/png" };
      if (forgeRange) headers["Content-Range"] = "bytes 0-31/32";
      const response = await fetch(url, { method: "PUT", headers, body: Buffer.alloc(32) });
      expect(response.status).toBe(400);
      // No finalized object exists: metadata lookup must fail.
      await expect(chatPhotoStorage.readUpload(id, 16, "image/png")).rejects.toThrow();
    } finally {
      await chatPhotoStorage.deleteUpload(id);
    }
  });

  it("rejects an oversized reservation before creating a storage session", async () => {
    await expect(chatPhotoStorage.requestUpload("integration_invalid", MAX_CHAT_PHOTO_BYTES + 1, "image/png")).rejects.toThrow();
  });

  it("accepts an exact-size photo and preserves its validated bytes", async () => {
    const id = `integration_${randomUUID().replaceAll("-", "")}`;
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6xkAAAAASUVORK5CYII=", "base64");
    try {
      const url = await chatPhotoStorage.requestUpload(id, bytes.length, "image/png");
      const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "image/png" }, body: bytes });
      expect(response.status).toBe(200);
      const uploaded = await chatPhotoStorage.readUpload(id, bytes.length, "image/png");
      expect(uploaded).toEqual(bytes);
      await chatPhotoStorage.savePhoto(id, uploaded, "image/png");
      const stored = await chatPhotoStorage.readPhoto(`/objects/chat/photos/${id}`);
      const chunks: Buffer[] = [];
      for await (const chunk of stored.stream) chunks.push(chunk);
      expect(Buffer.concat(chunks)).toEqual(bytes);
    } finally {
      await chatPhotoStorage.deleteUpload(id);
      await chatPhotoStorage.deletePhoto(id);
    }
  });
});
