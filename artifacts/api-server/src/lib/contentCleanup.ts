import { and, eq, gt, like, or } from "drizzle-orm";
import {
  db, afilliMediaTable, afilliStoriesTable, afilliVideosTable,
  favoriBooksTable, favoriPostsTable, favoriProfilesTable,
} from "@workspace/db";
import { contentAssetId, contentObjectPath, deleteContentObject, listContentObjects } from "./contentStorage";
import { contentReferencePattern, expiredUpload, withContentLifecycleLock } from "./contentLifecycle";
import { logger } from "./logger";

const DAY = 24 * 60 * 60_000;
export async function hasContentReferences(id: string, now = new Date()) {
  const pattern = contentReferencePattern(id);
  const references = await Promise.all([
    db.select({ id: afilliStoriesTable.id }).from(afilliStoriesTable)
      .where(and(eq(afilliStoriesTable.mediaId, id), gt(afilliStoriesTable.expiresAt, now))).limit(1),
    db.select({ id: afilliVideosTable.id }).from(afilliVideosTable).where(eq(afilliVideosTable.mediaId, id)).limit(1),
    db.select({ id: favoriPostsTable.id }).from(favoriPostsTable)
      .where(or(like(favoriPostsTable.imageUrl, pattern), like(favoriPostsTable.body, pattern))).limit(1),
    // Draft books count too. Neither moderation nor visibility removes ownership.
    db.select({ id: favoriBooksTable.id }).from(favoriBooksTable)
      .where(or(like(favoriBooksTable.coverUrl, pattern), like(favoriBooksTable.content, pattern), like(favoriBooksTable.description, pattern))).limit(1),
    db.select({ id: favoriProfilesTable.id }).from(favoriProfilesTable)
      .where(or(like(favoriProfilesTable.avatarUrl, pattern), like(favoriProfilesTable.coverUrl, pattern))).limit(1),
  ]);
  return references.some((rows) => rows.length > 0);
}

export type ContentCleanupReport = {
  mode: "preview" | "apply"; scannedMedia: number; scannedObjects: number;
  expiredStories: number; abandonedMedia: number; orphanObjects: number;
  protectedMedia: number; recentMedia: number; unsafePaths: number;
  candidateObjects: number; candidateBytes: number; deletedObjects: number;
  deletedMedia: number; failures: number;
};

// Preview takes the same lock and uses the same selection as apply, but writes
// neither storage nor DB. Do not rely on the denormalized `linked` flag.
export async function cleanupContent(options: { apply?: boolean; now?: Date } = {}): Promise<ContentCleanupReport> {
  return withContentLifecycleLock(async () => {
    const now = options.now ?? new Date();
    const report: ContentCleanupReport = {
      mode: options.apply ? "apply" : "preview", scannedMedia: 0, scannedObjects: 0,
      expiredStories: 0, abandonedMedia: 0, orphanObjects: 0, protectedMedia: 0,
      recentMedia: 0, unsafePaths: 0, candidateObjects: 0, candidateBytes: 0,
      deletedObjects: 0, deletedMedia: 0, failures: 0,
    };
    // A failed/incomplete listing aborts before any deletion.
    const objects = await listContentObjects();
    const assets = await db.select().from(afilliMediaTable);
    const stories = await db.select().from(afilliStoriesTable);
    report.scannedMedia = assets.length;
    report.scannedObjects = objects.length;
    const assetsById = new Map(assets.map((a) => [a.id, a]));
    const filesById = new Map<string, typeof objects>();
    const storiesById = new Map<string, typeof stories>();
    for (const file of objects) {
      const id = contentAssetId(file.path);
      if (!id) continue;
      const group = filesById.get(id) ?? [];
      group.push(file); filesById.set(id, group);
    }
    for (const story of stories) {
      if (!story.mediaId) continue;
      const group = storiesById.get(story.mediaId) ?? [];
      group.push(story); storiesById.set(story.mediaId, group);
    }
    const ids = new Set([...assetsById.keys(), ...filesById.keys()]);
    for (const id of ids) {
      const asset = assetsById.get(id);
      const files = filesById.get(id) ?? [];
      const mediaStories = storiesById.get(id) ?? [];
      if (asset && asset.objectPath !== contentObjectPath(id) && asset.objectPath !== `${contentObjectPath(id)}/ready`) {
        report.unsafePaths++; continue;
      }
      if (await hasContentReferences(id, now)) { report.protectedMedia++; continue; }
      const expiredStories = mediaStories.filter((s) => s.expiresAt.getTime() <= now.getTime() - 10 * 60_000);
      // Allocations are valid for at most 24h; PUT capability lasts only 15m.
      // Recent object timestamps also protect late writes and incomplete finalize.
      const recentFiles = files.some((o) => !Number.isFinite(o.updatedAt.getTime()) || o.updatedAt.getTime() > now.getTime() - DAY);
      const expiredStory = expiredStories.length > 0;
      const storyGrace = mediaStories.some((s) => s.expiresAt.getTime() > now.getTime() - 10 * 60_000);
      if (storyGrace || (asset && !expiredUpload(asset.createdAt, now)) || recentFiles) {
        report.recentMedia++; continue;
      }
      if (expiredStory) report.expiredStories += expiredStories.length;
      else if (asset) report.abandonedMedia++;
      else report.orphanObjects += files.length;
      report.candidateObjects += files.length;
      report.candidateBytes += files.reduce((n, o) => n + o.size, 0);
      if (!options.apply) continue;
      try {
        for (const file of files) {
          await deleteContentObject(file);
          report.deletedObjects++;
        }
        // Retain the ledger on ANY failure, including a failed DB delete.
        // Expired story rows remain historical metadata, not active references.
        if (asset) {
          await db.delete(afilliMediaTable).where(and(eq(afilliMediaTable.id, id), eq(afilliMediaTable.ownerId, asset.ownerId)));
          report.deletedMedia++;
        }
      } catch {
        report.failures++;
        logger.warn({ mediaId: id }, "Content cleanup will retry");
      }
    }
    return report;
  });
}

// Autoscaled processes can sleep: timer alone is not a scheduler. Startup and
// incoming traffic both trigger a throttled pass; duplicate instances serialize
// through the database lock. Default remains read-only until explicitly enabled.
let running = false;
let nextRun = 0;
export function triggerContentCleanup() {
  if (process.env.NODE_ENV !== "production" || running || Date.now() < nextRun) return;
  running = true;
  nextRun = Date.now() + 60 * 60_000;
  void cleanupContent({ apply: process.env.AFILLI_CONTENT_CLEANUP_MODE === "apply" })
    .then((report) => logger.info({ contentCleanup: report }, "Content cleanup finished"))
    .catch(() => { logger.warn("Content cleanup unavailable; will retry"); nextRun = Date.now() + 5 * 60_000; })
    .finally(() => { running = false; });
}

export function startContentCleanup() {
  triggerContentCleanup();
  const timer = setInterval(triggerContentCleanup, 60 * 60_000);
  timer.unref();
}
