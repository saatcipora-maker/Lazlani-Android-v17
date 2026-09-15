import { fetch as expoFetch } from "expo/fetch";
import {
  deleteStorageObject,
  finalizeUpload,
  requestUploadUrl,
  type UploadUrlRequestContentType,
} from "@workspace/api-client-react";
import { apiUrl } from '@/services/apiOrigin';

const MAX_COVER_BYTES = 10 * 1024 * 1024;
const DEFAULT_CONTENT_TYPE = "image/jpeg";

function fileNameFor(contentType: string): string {
  const extension = contentType === "image/png" ? "png"
    : contentType === "image/webp" ? "webp"
      : "jpg";
  return `book-cover-${Date.now()}.${extension}`;
}

function supportedContentType(value: string): UploadUrlRequestContentType | null {
  switch (value.toLowerCase()) {
    case "image/jpeg":
    case "image/png":
    case "image/webp":
      return value.toLowerCase() as UploadUrlRequestContentType;
    default:
      return null;
  }
}

export async function uploadBookCover(localUri: string): Promise<string> {
  const localResponse = await expoFetch(localUri);
  if (!localResponse.ok) throw new Error("Seçilen kapak görseli okunamadı.");
  const blob = await localResponse.blob();
  const contentType = supportedContentType(blob.type || DEFAULT_CONTENT_TYPE);
  if (!contentType) {
    throw new Error("Yalnız JPEG, PNG veya WebP kapak görselleri yüklenebilir.");
  }
  if (blob.size < 1 || blob.size > MAX_COVER_BYTES) {
    throw new Error("Kapak görseli en fazla 10 MB olabilir.");
  }

  const upload = await requestUploadUrl({
    name: fileNameFor(contentType),
    size: blob.size,
    contentType,
  });
  const uploadResponse = await expoFetch(upload.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!uploadResponse.ok) throw new Error("Kapak görseli depolamaya yüklenemedi.");

  const finalized = await finalizeUpload({
    objectPath: upload.objectPath,
    size: blob.size,
    contentType,
  });
  return apiUrl(`/api/storage${finalized.objectPath}`);
}

export function isDeviceLocalCover(uri: string): boolean {
  return !/^https?:\/\//i.test(uri);
}

function finalizedObjectPath(uri: string): string | null {
  const prefix = apiUrl('/api/storage/objects/');
  if (!uri.startsWith(prefix)) return null;
  const value = uri.slice(prefix.length);
  return value.startsWith("book-covers/") && value.length > "book-covers/".length
    ? value
    : null;
}

/**
 * Deletes a finalized cover after its owning book has been updated or removed.
 * Legacy/local and staging URLs are intentionally ignored.
 */
export async function deleteBookCoverIfOwned(uri: string | null | undefined): Promise<void> {
  if (!uri) return;
  const objectPath = finalizedObjectPath(uri);
  if (!objectPath) return;
  await deleteStorageObject(objectPath);
}