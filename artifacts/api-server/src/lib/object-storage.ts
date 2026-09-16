import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Storage, type File } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

export class InvalidObjectError extends Error {
  constructor(message = "Invalid book cover object") {
    super(message);
    this.name = "InvalidObjectError";
  }
}

export class ObjectOwnershipError extends Error {
  constructor() {
    super("Object does not belong to this user");
    this.name = "ObjectOwnershipError";
  }
}

export class InvalidBookCoverReferenceError extends Error {
  constructor(message = "Invalid book cover reference") {
    super(message);
    this.name = "InvalidBookCoverReferenceError";
  }
}

export class InvalidMediaReferenceError extends Error {
  constructor(message = "Invalid media reference") {
    super(message);
    this.name = "InvalidMediaReferenceError";
  }
}

export type MediaObjectReference = {
  objectPath: string;
  namespace: "social-posts" | "dm-photos" | "love-media";
};

export const MAX_COVER_BYTES = 10 * 1024 * 1024;
export const MAX_LOVE_MEDIA_BYTES = 10 * 1024 * 1024;
export const ALLOWED_COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const ALLOWED_LOVE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const MEDIA_NAMESPACES = ["book-covers", "social-posts", "dm-photos", "love-media"] as const;
type MediaNamespace = (typeof MEDIA_NAMESPACES)[number];

export function validateLoveMediaMetadata(value: { size: number; contentType: string }): string | null {
  const contentType = value.contentType.toLowerCase().split(";", 1)[0].trim();
  if (!ALLOWED_LOVE_MEDIA_TYPES.has(contentType)) return "LOVE media must be JPEG, PNG, WebP, or GIF.";
  if (!Number.isSafeInteger(value.size) || value.size < 1 || value.size > MAX_LOVE_MEDIA_BYTES) {
    return "LOVE media must be at most 10 MB.";
  }
  return null;
}

function privateObjectDir(): string {
  const value = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!value) throw new Error("PRIVATE_OBJECT_DIR is not configured");
  return value.replace(/\/+$/, "");
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const parts = path.replace(/^\/+/, "").split("/");
  if (parts.length < 2) throw new Error("Invalid object path");
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

async function signPutUrl(bucketName: string, objectName: string): Promise<string> {
  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method: "PUT",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Object URL signing failed with status ${response.status}`);
  const payload = await response.json() as { signed_url?: unknown };
  if (typeof payload.signed_url !== "string") throw new Error("Object URL signing returned no URL");
  return payload.signed_url;
}

function objectPathFor(namespace: string, userId: string, objectId: string): string {
  return `/objects/${namespace}/${encodeURIComponent(userId)}/${objectId}`;
}

function relativeObjectPath(objectPath: string): string {
  if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
  const relativePath = objectPath.slice("/objects/".length);
  if (!relativePath || relativePath.includes("..") || relativePath.includes("\\")) {
    throw new ObjectNotFoundError();
  }
  return relativePath;
}

function ownerSegmentFor(userId: string): string {
  return encodeURIComponent(userId);
}

/**
 * Validate the URL shape before touching storage. Keeping this separate makes
 * the sync boundary testable without granting tests access to the bucket.
 */
export function canonicalBookCoverObjectPath(
  reference: unknown,
  ownerUserId: string,
  trustedApiOrigin: string,
): string | undefined {
  if (reference === undefined || reference === null || reference === "") return undefined;
  if (typeof reference !== "string") {
    throw new InvalidBookCoverReferenceError("Book cover reference must be a URL");
  }

  let expectedOrigin: URL;
  let parsed: URL;
  try {
    expectedOrigin = new URL(trustedApiOrigin);
    parsed = new URL(reference);
  } catch {
    throw new InvalidBookCoverReferenceError("Book cover reference is not a valid URL");
  }
  if (expectedOrigin.protocol !== "https:" || parsed.protocol !== "https:"
    || parsed.origin !== expectedOrigin.origin
    || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new InvalidBookCoverReferenceError("Book cover reference must use the trusted HTTPS API");
  }

  const match = parsed.pathname.match(/^\/api\/storage\/objects\/book-covers\/([^/]+)\/([A-Za-z0-9_-]+)$/);
  if (!match?.[1] || !match[2]) {
    throw new InvalidBookCoverReferenceError("Book cover reference must point to a finalized cover");
  }
  let decodedOwner: string;
  try {
    decodedOwner = decodeURIComponent(match[1]);
  } catch {
    throw new InvalidBookCoverReferenceError("Book cover reference has an invalid owner");
  }
  if (decodedOwner !== ownerUserId || encodeURIComponent(decodedOwner) !== match[1]) {
    throw new InvalidBookCoverReferenceError("Book cover reference belongs to another user");
  }
  return `/objects/book-covers/${match[1]}/${match[2]}`;
}

/**
 * Validate and canonicalize a persisted book cover reference. A URL is not
 * trusted merely because it has the right shape: the finalized object must
 * still exist in object storage.
 */
export async function validateBookCoverReference(
  reference: unknown,
  ownerUserId: string,
  trustedApiOrigin: string,
): Promise<string | undefined> {
  const objectPath = canonicalBookCoverObjectPath(reference, ownerUserId, trustedApiOrigin);
  if (!objectPath) return undefined;
  try {
    await getStoredObject(objectPath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      throw new InvalidBookCoverReferenceError("Book cover object does not exist");
    }
    throw error;
  }
  return `${new URL(trustedApiOrigin).origin}/api/storage${objectPath}`;
}

/**
 * Validate a finalized social/DM media reference before it is attached to a
 * sync record. Staged paths and another user's finalized object are never
 * accepted. Non-storage URLs are left to the product's content policy.
 */
export async function validateMediaReference(
  reference: unknown,
  ownerUserId: string,
  trustedApiOrigin: string,
): Promise<MediaObjectReference | undefined> {
  if (typeof reference !== "string" || !reference.trim()) return;
  const parsedReference = canonicalMediaObjectReference(reference, trustedApiOrigin);
  if (!parsedReference) return;
  const { objectPath, namespace } = parsedReference;
  if (!isNamespaceObjectPath(objectPath, namespace)
    || ownerFromObjectPath(objectPath, namespace) !== ownerUserId) {
    throw new InvalidMediaReferenceError("Media object belongs to another user or is not finalized");
  }
  try {
    await getStoredObject(objectPath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      throw new InvalidMediaReferenceError("Media object does not exist");
    }
    throw error;
  }
  return { objectPath, namespace };
}

export function canonicalMediaObjectReference(
  reference: string,
  trustedApiOrigin: string,
): MediaObjectReference | undefined {
  let objectPath = reference;
  if (reference.startsWith("http")) {
    let parsed: URL;
    try {
      parsed = new URL(reference);
      const origin = new URL(trustedApiOrigin);
      if (parsed.origin !== origin.origin || parsed.protocol !== "https:"
        || parsed.search || parsed.hash || parsed.username || parsed.password) return;
      const match = parsed.pathname.match(
        /^\/api\/storage\/objects\/(social-posts|dm-photos)\/([^/]+)\/([A-Za-z0-9_-]+)$/,
      );
      if (!match) return;
      objectPath = `/objects/${match[1]}/${match[2]}/${match[3]}`;
    } catch {
      return;
    }
  }
  const relative = objectPath.replace(/^\/objects\//, "");
  if (!relative.startsWith("social-posts/") && !relative.startsWith("dm-photos/")) return;
  const namespace = relative.startsWith("social-posts/") ? "social-posts" : "dm-photos";
  try {
    if (!isNamespaceObjectPath(objectPath, namespace)) {
      throw new InvalidMediaReferenceError("Media object path is not finalized");
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      throw new InvalidMediaReferenceError("Media object path is not finalized");
    }
    throw error;
  }
  return { objectPath, namespace };
}

function isNamespaceObjectPath(
  objectPath: string,
  namespace: "uploads/book-covers" | "book-covers"
    | "uploads/social-posts" | "social-posts"
    | "uploads/dm-photos" | "dm-photos"
    | "uploads/love-media" | "love-media",
): boolean {
  const relative = relativeObjectPath(objectPath);
  const parts = namespace.split("/");
  const prefix = parts.length === 2 ? `${parts[0]}/` : "";
  const kind = parts.length === 2 ? parts[1] : parts[0];
  return Boolean(relative.match(new RegExp(
    `^${prefix}${kind}/([^/]+)/([A-Za-z0-9_-]+)$`,
  )));
}

function ownerFromObjectPath(
  objectPath: string,
  namespace: "uploads/book-covers" | "book-covers"
    | "uploads/social-posts" | "social-posts"
    | "uploads/dm-photos" | "dm-photos"
    | "uploads/love-media" | "love-media",
): string | null {
  const relative = relativeObjectPath(objectPath);
  const parts = namespace.split("/");
  const prefix = parts.length === 2 ? `${parts[0]}/` : "";
  const kind = parts.length === 2 ? parts[1] : parts[0];
  const match = relative.match(new RegExp(`^${prefix}${kind}/([^/]+)/([A-Za-z0-9_-]+)$`));
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export async function createBookCoverUpload(userId: string): Promise<{
  uploadURL: string;
  objectPath: string;
}> {
  const objectPath = `uploads/book-covers/${ownerSegmentFor(userId)}/${randomUUID()}`;
  const { bucketName, objectName } = parseObjectPath(`${privateObjectDir()}/${objectPath}`);
  return {
    uploadURL: await signPutUrl(bucketName, objectName),
    objectPath: `/objects/${objectPath}`,
  };
}

export async function createMediaUpload(
  userId: string,
  namespace: Exclude<MediaNamespace, "book-covers">,
): Promise<{ uploadURL: string; objectPath: string }> {
  const objectPath = `uploads/${namespace}/${ownerSegmentFor(userId)}/${randomUUID()}`;
  const { bucketName, objectName } = parseObjectPath(`${privateObjectDir()}/${objectPath}`);
  return {
    uploadURL: await signPutUrl(bucketName, objectName),
    objectPath: `/objects/${objectPath}`,
  };
}

export async function createLoveMediaUpload(userId: string): Promise<{ uploadURL: string; objectPath: string }> {
  return createMediaUpload(userId, "love-media");
}

export function isSupportedBookCoverMagic(contentType: string, bytes: Uint8Array): boolean {
  const type = contentType.toLowerCase().split(";", 1)[0].trim();
  if (type === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  if (type === "image/webp") {
    return bytes.length >= 12
      && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  return false;
}

export async function finalizeBookCoverUpload(
  userId: string,
  objectPath: string,
  expectedMetadata?: { size: number; contentType: string },
): Promise<{
  objectPath: string;
}> {
  return finalizeMediaUpload(userId, objectPath, expectedMetadata, "book-covers");
}

export async function finalizeMediaUpload(
  userId: string,
  objectPath: string,
  expectedMetadata: { size: number; contentType: string } | undefined,
  namespace: MediaNamespace,
): Promise<{ objectPath: string }> {
  const stagingNamespace = `uploads/${namespace}` as
    | "uploads/book-covers" | "uploads/social-posts" | "uploads/dm-photos" | "uploads/love-media";
  if (!isNamespaceObjectPath(objectPath, stagingNamespace)
    || ownerFromObjectPath(objectPath, stagingNamespace) !== userId) {
    throw new ObjectOwnershipError();
  }

  const relativePath = relativeObjectPath(objectPath);
  const { bucketName, objectName } = parseObjectPath(`${privateObjectDir()}/${relativePath}`);
  const bucket = storage.bucket(bucketName);
  const stagingFile = bucket.file(objectName);
  const [exists] = await stagingFile.exists();
  if (!exists) throw new ObjectNotFoundError();

  const [metadata] = await stagingFile.getMetadata();
  const contentType = String(metadata.contentType || "").toLowerCase().split(";", 1)[0].trim();
  const size = Number(metadata.size);
  const allowedTypes = namespace === "love-media" ? ALLOWED_LOVE_MEDIA_TYPES : ALLOWED_COVER_TYPES;
  const maxBytes = namespace === "love-media" ? MAX_LOVE_MEDIA_BYTES : MAX_COVER_BYTES;
  if (!allowedTypes.has(contentType) || !Number.isSafeInteger(size)
    || size < 1 || size > maxBytes
    || (expectedMetadata && (
      expectedMetadata.size !== size
      || expectedMetadata.contentType.toLowerCase() !== contentType
    ))) {
    throw new InvalidObjectError("Uploaded object metadata is not a valid book cover");
  }

  const [contents] = await stagingFile.download();
  if (contents.length !== size || !isSupportedImageMagic(contentType, contents)) {
    throw new InvalidObjectError("Uploaded object bytes are not a supported image");
  }

  const finalId = randomUUID();
  const finalObjectName = `${namespace}/${ownerSegmentFor(userId)}/${finalId}`;
  const finalFile = bucket.file(finalObjectName);
  await stagingFile.copy(finalFile);
  await stagingFile.delete();
  return { objectPath: objectPathFor(namespace, userId, finalId) };
}

export function isSupportedImageMagic(contentType: string, bytes: Uint8Array): boolean {
  if (isSupportedBookCoverMagic(contentType, bytes)) return true;
  const type = contentType.toLowerCase().split(";", 1)[0].trim();
  if (type !== "image/gif") return false;
  return bytes.length >= 6
    && ((bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46
      && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61));
}

export async function validateLoveMediaReference(reference: unknown, ownerUserId: string): Promise<string> {
  if (typeof reference !== "string" || !isNamespaceObjectPath(reference, "love-media")
    || ownerFromObjectPath(reference, "love-media") !== ownerUserId) {
    throw new InvalidMediaReferenceError("Love media belongs to another user or is not finalized");
  }
  try {
    await getStoredObject(reference);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) throw new InvalidMediaReferenceError("Love media object does not exist");
    throw error;
  }
  return reference;
}

export async function getStoredObject(objectPath: string): Promise<File> {
  if (!MEDIA_NAMESPACES.some(namespace => isNamespaceObjectPath(objectPath, namespace))) {
    throw new ObjectNotFoundError();
  }
  const relativePath = relativeObjectPath(objectPath);
  const { bucketName, objectName } = parseObjectPath(`${privateObjectDir()}/${relativePath}`);
  const file = storage.bucket(bucketName).file(objectName);
  const [exists] = await file.exists();
  if (!exists) throw new ObjectNotFoundError();
  return file;
}

export async function deleteBookCover(userId: string, objectPath: string): Promise<void> {
  await deleteStoredObject(userId, objectPath, "book-covers");
}

export async function deleteStoredObject(
  userId: string,
  objectPath: string,
  namespace: MediaNamespace,
): Promise<void> {
  if (!isNamespaceObjectPath(objectPath, namespace)
    || ownerFromObjectPath(objectPath, namespace) !== userId) {
    throw new ObjectOwnershipError();
  }
  const relativePath = relativeObjectPath(objectPath);
  const { bucketName, objectName } = parseObjectPath(`${privateObjectDir()}/${relativePath}`);
  const file = storage.bucket(bucketName).file(objectName);
  const [exists] = await file.exists();
  if (!exists) throw new ObjectNotFoundError();
  await file.delete();
}

export async function streamStoredObject(
  file: File,
  response: import("express").Response,
  options: { private?: boolean; loveMedia?: boolean } = {},
): Promise<void> {
  const [metadata] = await file.getMetadata();
  const contentType = String(metadata.contentType || "").toLowerCase().split(";", 1)[0].trim();
  const size = Number(metadata.size);
  const allowedTypes = options.loveMedia ? ALLOWED_LOVE_MEDIA_TYPES : ALLOWED_COVER_TYPES;
  const maxBytes = options.loveMedia ? MAX_LOVE_MEDIA_BYTES : MAX_COVER_BYTES;
  if (!allowedTypes.has(contentType) || !Number.isSafeInteger(size)
    || size < 1 || size > maxBytes) {
    throw new ObjectNotFoundError();
  }
  response.setHeader("Content-Type", contentType);
  response.setHeader(
    "Cache-Control",
    options.private ? "private, no-store, max-age=0" : "public, max-age=31536000, immutable",
  );
  response.setHeader("Content-Length", String(size));
  response.setHeader("Content-Disposition", "inline");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  response.setHeader(
    "Cross-Origin-Resource-Policy",
    options.private ? "same-origin" : "cross-origin",
  );
  Readable.from(file.createReadStream()).pipe(response);
}