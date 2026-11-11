import { type File } from "@google-cloud/storage";
import { objectStorageClient, ObjectStorageService } from "./objectStorage";

export const MAX_CHAT_PHOTO_BYTES = 2_250_000;
export const CHAT_PHOTO_TTL_MS = 5 * 60_000;
const storage = new ObjectStorageService();

export function photoPath(id: string) {
  return `/objects/chat/photos/${id}`;
}

function fileFor(path: string) {
  if (!/^\/objects\/chat\/(uploads|photos)\/[a-zA-Z0-9_-]+$/.test(path)) {
    throw new Error("Invalid chat photo path");
  }
  const fullPath = `${storage.getPrivateObjectDir().replace(/\/$/, "")}/${path.slice("/objects/".length)}`;
  const [, bucket, ...parts] = fullPath.split("/");
  return objectStorageClient.bucket(bucket).file(parts.join("/"));
}

function stagingPath(id: string) {
  return `/objects/chat/uploads/${id}`;
}

export class InvalidChatPhoto extends Error {}

export function validatePhotoBytes(bytes: Buffer, contentType: string) {
  const valid = contentType === "image/jpeg" ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : contentType === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : contentType === "image/gif" ? /^(GIF87a|GIF89a)$/.test(bytes.subarray(0, 6).toString("ascii"))
    : contentType === "image/webp" ? bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP"
    : false;
  if (!valid) throw new InvalidChatPhoto("Fotoğraf içeriği dosya türüyle uyuşmuyor.");
}

// Only this narrow transport boundary is replaced by regression tests.
export const chatPhotoStorage = {
  async requestUpload(id: string, size: number, contentType: string, origin?: string) {
    if (!Number.isInteger(size) || size < 1 || size > MAX_CHAT_PHOTO_BYTES) {
      throw new InvalidChatPhoto("Fotoğraf çok büyük.");
    }
    const file = fileFor(stagingPath(id));
    // A plain signed PUT cannot enforce size. The authenticated initiation sets
    // X-Upload-Content-Length on GCS itself; GCS rejects larger PUTs before an
    // object is created. The returned capability is for this one upload only.
    const [url] = await file.createResumableUpload({
      origin,
      metadata: { contentType, contentLength: size },
    });
    return url;
  },
  async readUpload(id: string, size: number, contentType: string) {
    const file = fileFor(stagingPath(id));
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) !== size || size > MAX_CHAT_PHOTO_BYTES || metadata.contentType !== contentType) {
      throw new InvalidChatPhoto("Fotoğraf türü veya boyutu geçersiz.");
    }
    // Pin the generation to avoid a second PUT changing bytes after validation.
    const version = file.bucket.file(file.name, { generation: metadata.generation });
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of version.createReadStream({ validation: "crc32c" })) {
      length += chunk.length;
      if (length > size) throw new InvalidChatPhoto("Fotoğraf çok büyük.");
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length !== size) throw new InvalidChatPhoto("Fotoğraf boyutu uyuşmuyor.");
    validatePhotoBytes(bytes, contentType);
    return bytes;
  },
  async savePhoto(id: string, bytes: Buffer, contentType: string) {
    // Final objects are never exposed by a signed PUT, so uploaded bytes cannot
    // be replaced after validation or after a message was created.
    await fileFor(photoPath(id)).save(bytes, {
      resumable: false, contentType,
      metadata: { cacheControl: "private, no-store" },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  },
  async deleteUpload(id: string) {
    await fileFor(stagingPath(id)).delete({ ignoreNotFound: true });
  },
  async deletePhoto(id: string) {
    await fileFor(photoPath(id)).delete({ ignoreNotFound: true });
  },
  async sweepStaleUploads(before: Date) {
    const sample = fileFor(stagingPath("sweep"));
    const prefix = sample.name.slice(0, -"sweep".length);
    // Scan the staging namespace, not the ledger. This also finds an upload
    // that finishes after its ledger was removed or after server downtime.
    for await (const entry of sample.bucket.getFilesStream({ prefix })) {
      const file = entry as File;
      const created = file.metadata.timeCreated;
      if (created && new Date(created).getTime() < before.getTime()) {
        // Delete precisely the generation we listed; a concurrent completion
        // of a new generation will be picked up on a later sweep.
        await sample.bucket.file(file.name, { generation: file.metadata.generation }).delete({ ignoreNotFound: true });
      }
    }
  },
  async readPhoto(path: string) {
    const file = fileFor(path);
    const [metadata] = await file.getMetadata();
    return { contentType: metadata.contentType ?? "application/octet-stream", stream: file.createReadStream() };
  },
};
