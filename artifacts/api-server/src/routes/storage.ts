import {
  FinalizeUploadBody,
  FinalizeUploadResponse,
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { authenticatedUser } from "../lib/auth";
import {
  createBookCoverUpload,
  deleteBookCover,
  finalizeBookCoverUpload,
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
    const upload = await createBookCoverUpload(user.id);
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
    const finalized = await finalizeBookCoverUpload(
      user.id,
      parsed.data.objectPath,
      parsed.data.size !== undefined && parsed.data.contentType !== undefined
        ? { size: parsed.data.size, contentType: parsed.data.contentType }
        : undefined,
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
    await deleteBookCover(user.id, `/objects/${relativePath}`);
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
    const file = await getStoredObject(`/objects/${relativePath}`);
    await streamStoredObject(file, res);
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