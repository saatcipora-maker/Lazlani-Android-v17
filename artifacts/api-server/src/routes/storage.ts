import {
  FinalizeUploadBody,
  FinalizeUploadResponse,
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { authenticatedUser } from "../lib/auth";
import { eq } from "drizzle-orm";
import { db, syncMediaAttachmentsTable } from "@workspace/db";
import {
  createMediaUpload,
  createBookCoverUpload,
  deleteStoredObject,
  finalizeMediaUpload,
  getStoredObject,
  InvalidObjectError,
  ObjectNotFoundError,
  ObjectOwnershipError,
  streamStoredObject,
} from "../lib/object-storage";

const router: IRouter = Router();
const MAX_COVER_BYTES = 10 * 1024 * 1024;
const ALLOWED_COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateBookCoverMetadata(value: {
  size: number;
  contentType: string;
}): string | null {
  if (!ALLOWED_COVER_TYPES.has(value.contentType.toLowerCase())) {
    return "Yalnız JPEG, PNG veya WebP kapak görselleri yüklenebilir.";
  }
  if (value.size < 1 || value.size > MAX_COVER_BYTES) {
    return "Kapak görseli en fazla 10 MB olabilir.";
  }
  return null;
}

function mediaNamespace(value: unknown): "book-covers" | "social-posts" | "dm-photos" {
  return value === "social-posts" || value === "dm-photos" ? value : "book-covers";
}

function objectPathOwner(objectPath: string, userId: string): boolean {
  const match = objectPath.match(/^\/objects\/(?:social-posts|dm-photos)\/([^/]+)\/[A-Za-z0-9_-]+$/);
  if (!match?.[1]) return false;
  try {
    return decodeURIComponent(match[1]) === userId && encodeURIComponent(userId) === match[1];
  } catch {
    return false;
  }
}

router.post("/storage/uploads/request-url", async (req, res): Promise<void> => {
  const user = await authenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Oturum gerekli." });
    return;
  }

  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçerli dosya bilgileri gerekli." });
    return;
  }

  const validationError = validateBookCoverMetadata(parsed.data);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  try {
    const namespace = mediaNamespace(parsed.data.namespace);
    const upload = namespace === "book-covers"
      ? await createBookCoverUpload(user.id)
      : await createMediaUpload(user.id, namespace);
    res.json(RequestUploadUrlResponse.parse({
      ...upload,
      metadata: parsed.data,
    }));
  } catch (error) {
    req.log.error({ err: error }, "Could not create book cover upload URL");
    res.status(503).json({ error: "Kapak yükleme hizmeti şu anda kullanılamıyor." });
  }
});

router.post("/storage/uploads/finalize", async (req, res): Promise<void> => {
  const user = await authenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Oturum gerekli." });
    return;
  }

  const parsed = FinalizeUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçerli yükleme bilgileri gerekli." });
    return;
  }

  try {
    const relative = parsed.data.objectPath.slice("/objects/".length);
    const namespace = relative.startsWith("social-posts/")
      ? "social-posts"
      : relative.startsWith("dm-photos/") ? "dm-photos" : "book-covers";
    const finalized = await finalizeMediaUpload(
      user.id,
      parsed.data.objectPath,
      parsed.data.size !== undefined && parsed.data.contentType !== undefined
        ? { size: parsed.data.size, contentType: parsed.data.contentType }
        : undefined,
      namespace,
    );
    res.json(FinalizeUploadResponse.parse(finalized));
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Yüklenen kapak görseli bulunamadı." });
      return;
    }
    if (error instanceof ObjectOwnershipError) {
      res.status(403).json({ error: "Bu yüklemeyi kullanma yetkiniz yok." });
      return;
    }
    if (error instanceof InvalidObjectError) {
      res.status(400).json({ error: "Yüklenen dosya geçerli bir kapak görseli değil." });
      return;
    }
    req.log.error({ err: error }, "Could not finalize book cover upload");
    res.status(503).json({ error: "Kapak yükleme hizmeti şu anda kullanılamıyor." });
  }
});

router.delete("/storage/objects/*path", async (req, res): Promise<void> => {
  const user = await authenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Oturum gerekli." });
    return;
  }

  const rawPath = req.params.path;
  const relativePath = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
  try {
    const namespace = relativePath.startsWith("social-posts/")
      ? "social-posts"
      : relativePath.startsWith("dm-photos/") ? "dm-photos" : "book-covers";
    await deleteStoredObject(user.id, `/objects/${relativePath}`, namespace);
    res.status(204).send();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Kapak görseli bulunamadı." });
      return;
    }
    if (error instanceof ObjectOwnershipError) {
      res.status(403).json({ error: "Bu kapak görselini silme yetkiniz yok." });
      return;
    }
    req.log.error({ err: error }, "Could not delete stored object");
    res.status(503).json({ error: "Kapak görseli silinemedi." });
  }
});

router.get("/storage/objects/*path", async (req, res): Promise<void> => {
  try {
    const rawPath = req.params.path;
    const relativePath = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
    const objectPath = `/objects/${relativePath}`;
    if (relativePath.startsWith("dm-photos/")) {
      const user = await authenticatedUser(req);
      if (!user) {
        res.status(401).json({ error: "Oturum gerekli." });
        return;
      }
      const [attachment] = await db.select().from(syncMediaAttachmentsTable)
        .where(eq(syncMediaAttachmentsTable.objectPath, objectPath))
        .limit(1);
      // The object path is only a reference. A DM photo is readable when it
      // is attached to a message whose canonical audience contains the user.
      if (attachment?.active) {
        if (!attachment.audienceUserIds.includes(user.id)) {
          res.status(403).json({ error: "Bu mesaj görselini görüntüleme yetkiniz yok." });
          return;
        }
      } else if (attachment) {
        res.status(403).json({ error: "Bu mesaj görseli artık erişilebilir değil." });
        return;
      } else if (!objectPathOwner(objectPath, user.id)) {
        res.status(403).json({ error: "Bu mesaj görselini görüntüleme yetkiniz yok." });
        return;
      }
    } else if (relativePath.startsWith("social-posts/")) {
      const [attachment] = await db.select().from(syncMediaAttachmentsTable)
        .where(eq(syncMediaAttachmentsTable.objectPath, objectPath))
        .limit(1);
      if (attachment?.active) {
        if (!attachment.isPublic && !attachment.audienceUserIds.includes((await authenticatedUser(req))?.id ?? "")) {
          res.status(403).json({ error: "Bu gönderi görselini görüntüleme yetkiniz yok." });
          return;
        }
      } else if (attachment) {
        res.status(403).json({ error: "Bu gönderi görseli artık erişilebilir değil." });
        return;
      } else {
        const user = await authenticatedUser(req);
        if (!user || !objectPathOwner(objectPath, user.id)) {
          res.status(401).json({ error: "Oturum gerekli." });
          return;
        }
      }
    }
    const file = await getStoredObject(objectPath);
    await streamStoredObject(file, res, { private: relativePath.startsWith("dm-photos/") });
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Kapak görseli bulunamadı." });
      return;
    }
    req.log.error({ err: error }, "Could not serve stored object");
    res.status(500).json({ error: "Kapak görseli yüklenemedi." });
  }
});

export default router;