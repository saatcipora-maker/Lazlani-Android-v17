import type { RequestHandler } from "express";
import { contentLifecyclePool } from "@workspace/db";

// Session lock uses its own bounded pool. All processes share this lock, and it
// is released automatically if the process dies. No schema changes are needed.
export async function withContentLifecycleLock<T>(action: () => Promise<T>): Promise<T> {
  const client = await contentLifecyclePool.connect();
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock(183614, 10)");
    locked = true;
    return await action();
  } finally {
    try {
      if (locked) await client.query("SELECT pg_advisory_unlock(183614, 10)");
      client.release();
    } catch {
      client.release(true);
    }
  }
}

// Await the handler, not response finish/close: disconnecting clients must not
// release the lock while their write is still running.
export const contentMutation = (handler: RequestHandler): RequestHandler =>
  async (req, res, next) => {
    await withContentLifecycleLock(async () => { await handler(req, res, next); });
  };

export const contentMediaUrl = (id: string) => `/api/content/media/${id}`;
// Treat URL aliases conservatively as references too (e.g. absolute URLs and
// /url suffixes). False positives retain bytes; false negatives destroy them.
export function contentReferencePattern(id: string) {
  return `%/content/media/${id.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

export const expiredUpload = (createdAt: Date, now = new Date()) =>
  createdAt.getTime() <= now.getTime() - 24 * 60 * 60_000;

