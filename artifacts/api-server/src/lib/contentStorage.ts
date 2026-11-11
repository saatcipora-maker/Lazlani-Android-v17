import { Storage } from "@google-cloud/storage";

const sidecar = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${sidecar}/token`,
    type: "external_account",
    credential_source: { url: `${sidecar}/credential`, format: { type: "json", subject_token_field_name: "access_token" } },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});
export function contentObjectPath(id: string) {
  const root = process.env.PRIVATE_OBJECT_DIR?.replace(/\/+$/, "");
  if (!root) throw new Error("Dosya depolama yapılandırılmamış.");
  return `${root}/afilli-content/${id}`;
}
export function contentAssetId(path: string): string | null {
  const prefix = `${contentObjectPath("").replace(/\/+$/, "")}/`;
  if (!path.startsWith(prefix)) return null;
  const match = path.slice(prefix.length).match(/^([A-Za-z0-9_-]+)(?:\/ready)?$/);
  return match?.[1] ?? null;
}
export type ContentObject = { path: string; generation: string; updatedAt: Date; size: number };
export async function listContentObjects({ pageSize = 500 }: { pageSize?: number } = {}): Promise<ContentObject[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
    throw new RangeError("Content listing page size must be an integer between 1 and 500.");
  }
  const root = contentObjectPath("");
  const [bucket, ...parts] = root.replace(/^\//, "").split("/");
  const prefix = parts.join("/");
  const objects: ContentObject[] = [];
  let pageToken: string | undefined;
  do {
    const [files, next] = await storage.bucket(bucket).getFiles({ prefix, autoPaginate: false, maxResults: pageSize, pageToken });
    for (const file of files) {
      const path = `/${bucket}/${file.name}`;
      // Never broaden cleanup to chat photos, arbitrary nested paths or legacy files.
      if (!contentAssetId(path)) continue;
      const m = file.metadata;
      if (!m.generation || !m.updated) throw new Error("Content object metadata is incomplete; cleanup stopped.");
      objects.push({ path, generation: String(m.generation), updatedAt: new Date(m.updated), size: Number(m.size ?? 0) });
    }
    pageToken = next?.pageToken;
  } while (pageToken);
  return objects;
}
export async function deleteContentObject(object: ContentObject) {
  if (!contentAssetId(object.path)) throw new Error("Refusing deletion outside afilli-content.");
  // Delete only the listed generation. Concurrent/replayed PUTs are swept later.
  await contentFile(object.path, object.generation).delete({
    ignoreNotFound: true, ifGenerationMatch: object.generation,
  });
}
export function contentFile(path: string, generation?: string | number) {
  const [bucket, ...parts] = path.replace(/^\//, "").split("/");
  if (!bucket || !parts.length) throw new Error("Dosya yolu geçersiz.");
  return storage.bucket(bucket).file(parts.join("/"), { generation });
}
export async function signContentFile(path: string, method: "PUT" | "GET") {
  const [bucket, ...parts] = path.replace(/^\//, "").split("/");
  const response = await fetch(`${sidecar}/object-storage/signed-object-url`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket_name: bucket, object_name: parts.join("/"), method, expires_at: new Date(Date.now() + (method === "PUT" ? 900 : 300) * 1000).toISOString() }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Dosya bağlantısı oluşturulamadı.");
  const result = await response.json() as { signed_url: string };
  return result.signed_url;
}
export async function verifyContentFile(asset: { objectPath: string; mime: string; size: number }) {
  const file = contentFile(asset.objectPath);
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) !== asset.size || metadata.contentType?.split(";")[0] !== asset.mime) throw new Error("Yüklenen dosyanın boyutu veya türü seçilen dosyayla eşleşmiyor.");
  if (!metadata.generation) throw new Error("Dosya sürümü doğrulanamadı.");
  const [bytes] = await contentFile(asset.objectPath, metadata.generation).download({ start: 0, end: 31 });
  const valid =
    (asset.mime === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) ||
    (asset.mime === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (asset.mime === "image/webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") ||
    (["video/mp4", "video/quicktime"].includes(asset.mime) && bytes.toString("ascii", 4, 8) === "ftyp") ||
    (asset.mime === "video/webm" && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])));
  if (!valid) throw new Error("Dosyanın içeriği desteklenen görsel/video türü değil.");
  return metadata.generation;
}
export async function finalizeContentFile(asset: { objectPath: string; mime: string; size: number }) {
  // Never publish the object a still-valid upload URL can overwrite.
  const finalPath = `${asset.objectPath}/ready`;
  const destination = contentFile(finalPath);
  const [exists] = await destination.exists();
  if (!exists) {
    const generation = await verifyContentFile(asset);
    try {
      await contentFile(asset.objectPath, generation).copy(destination, { preconditionOpts: { ifGenerationMatch: 0 } });
    } catch (error) {
      if (!(typeof error === "object" && error && "code" in error && error.code === 412)) throw error;
    }
  }
  await verifyContentFile({ ...asset, objectPath: finalPath });
  await contentFile(asset.objectPath).delete({ ignoreNotFound: true });
  return finalPath;
}
