import express from "express";
import pinoHttp from "pino-http";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@workspace/db", async () => ({
  ...await import("../../../lib/db/src/schema"),
  ...await import("../../../lib/db/tests/isolated-chat-db"),
}));
vi.mock("@clerk/express", () => ({
  getAuth: (req: express.Request) => ({ userId: req.headers["x-test-user"] ?? null }),
  clerkClient: { users: { getUser: vi.fn(() => { throw new Error("Unexpected identity lookup"); }) } },
}));
const transport = vi.hoisted(() => ({
  objects: new Map<string, { path: string; generation: string; updatedAt: Date; size: number }>(),
  failures: new Set<string>(),
  deleted: [] as string[],
  beforeDelete: undefined as undefined | (() => Promise<void>),
}));
vi.mock("../src/lib/contentStorage", async (original) => {
  const actual = await original<typeof import("../src/lib/contentStorage")>();
  return {
    ...actual,
    listContentObjects: vi.fn(async () => [...transport.objects.values()].filter((o) => actual.contentAssetId(o.path))),
    deleteContentObject: vi.fn(async (object: { path: string; generation: string }) => {
      await transport.beforeDelete?.();
      if (transport.failures.has(object.path)) throw new Error("Simulated storage failure");
      const current = transport.objects.get(object.path);
      if (current && current.generation !== object.generation) throw new Error("Generation precondition failed");
      transport.deleted.push(object.path);
      transport.objects.delete(object.path);
    }),
    signContentFile: vi.fn(async () => "https://storage.invalid/signed"),
    finalizeContentFile: vi.fn(async (asset: { objectPath: string }) => `${asset.objectPath}/ready`),
  };
});
import router from "../src/routes/favori";
import { cleanupContent, hasContentReferences } from "../src/lib/contentCleanup";
import { contentObjectPath, listContentObjects } from "../src/lib/contentStorage";
import { withContentLifecycleLock } from "../src/lib/contentLifecycle";
import {
  db, afilliMediaTable, afilliStoriesTable, afilliVideosTable,
  favoriBooksTable, favoriPostsTable, favoriProfilesTable,
} from "@workspace/db";
import { closeDatabase, resetDatabase, setupDatabase } from "../../../lib/db/tests/isolated-chat-db";

const now = new Date();
const old = new Date(now.getTime() - 3 * 86400000);
const app = express();
app.use(pinoHttp({ enabled: false }), express.json());
app.use("/api", router);
beforeAll(async () => { vi.stubEnv("PRIVATE_OBJECT_DIR", "/test-bucket/private"); await setupDatabase(); });
afterAll(async () => { await closeDatabase(); vi.unstubAllEnvs(); });
beforeEach(async () => {
  await resetDatabase();
  transport.objects.clear(); transport.failures.clear(); transport.deleted = []; transport.beforeDelete = undefined;
  vi.mocked(listContentObjects).mockClear();
  await db.insert(favoriProfilesTable).values(["alice", "bob"].map((id) => ({ id, handle: id, name: id })));
});
function object(id: string, ready = false, updatedAt = old) {
  const path = `${contentObjectPath(id)}${ready ? "/ready" : ""}`;
  transport.objects.set(path, { path, generation: "1", updatedAt, size: 64 });
  return path;
}
async function media(id: string, options: { purpose?: string; ready?: boolean; linked?: boolean; createdAt?: Date; ownerId?: string } = {}) {
  const row = {
    id, ownerId: "alice", purpose: "post", ready: true, linked: false,
    mime: "image/png", size: 64, createdAt: old, ...options,
    objectPath: `${contentObjectPath(id)}${options.ready === false ? "" : "/ready"}`,
  };
  await db.insert(afilliMediaTable).values(row);
  object(id); object(id, true);
  return row;
}
async function stored(id: string) {
  return (await db.select().from(afilliMediaTable).where(eq(afilliMediaTable.id, id)))[0];
}
const postData = { type: "photo", title: "", body: "", allowLikes: true, allowComments: true };

describe("isolated content cleanup", () => {
  it("previews expired stories, abandoned allocations and orphan bytes without writes", async () => {
    await media("expired", { purpose: "story", linked: true });
    await db.insert(afilliStoriesTable).values({ id: "expired-story", authorId: "alice", mediaId: "expired", expiresAt: new Date(now.getTime() - 86400000) });
    await media("abandoned", { ready: false });
    object("orphan", true);
    const report = await cleanupContent({ now });
    expect(report).toMatchObject({ mode: "preview", expiredStories: 1, abandonedMedia: 1, orphanObjects: 1, candidateObjects: 5, candidateBytes: 320, deletedObjects: 0, deletedMedia: 0 });
    expect(transport.deleted).toEqual([]);
    expect(await stored("expired")).toBeDefined();
    expect(await stored("abandoned")).toBeDefined();
  });

  it("protects actual posts, draft books, profiles, live stories and videos despite false linked hints", async () => {
    for (const id of ["post", "book", "story", "video", "profile"]) await media(id, { ownerId: "bob" });
    await db.insert(favoriPostsTable).values({ id: "p", authorId: "alice", type: "photo", body: "", imageUrl: "/api/content/media/post" });
    await db.insert(favoriBooksTable).values({ id: "b", author: "alice", authorId: "alice", title: "draft", category: "Roman", status: "draft", coverUrl: "https://example.invalid/api/content/media/book/url" });
    await db.insert(afilliStoriesTable).values({ id: "s", authorId: "alice", mediaId: "story", expiresAt: new Date(now.getTime() + 3600000) });
    await db.insert(afilliVideosTable).values({ id: "v", authorId: "alice", mediaId: "video", title: "Video" });
    await db.update(favoriProfilesTable).set({ avatarUrl: "/api/content/media/profile" }).where(eq(favoriProfilesTable.id, "alice"));
    expect(await cleanupContent({ apply: true, now })).toMatchObject({ protectedMedia: 5, deletedObjects: 0, deletedMedia: 0 });
    expect(transport.deleted).toEqual([]);
    // Removing one expired reference never overrides another active reference.
    await db.insert(afilliStoriesTable).values({ id: "expired-shared", authorId: "bob", mediaId: "post", expiresAt: old });
    expect(await hasContentReferences("post", now)).toBe(true);
  });

  it("protects recent allocations, late writes and story URL grace", async () => {
    await media("new", { createdAt: now, ready: false });
    await media("late", { ready: false }); object("late", true, now);
    await media("grace", { purpose: "story" });
    await db.insert(afilliStoriesTable).values({ id: "s", authorId: "alice", mediaId: "grace", expiresAt: new Date(now.getTime() - 60000) });
    object("late-orphan", false, now);
    expect(await cleanupContent({ apply: true, now })).toMatchObject({ recentMedia: 4, deletedObjects: 0 });
  });

  it("retries failed deletes, sweeps partial ready copies and is safe to run twice", async () => {
    await media("partial", { ready: false });
    const ready = `${contentObjectPath("partial")}/ready`;
    transport.failures.add(ready);
    expect(await cleanupContent({ apply: true, now })).toMatchObject({ deletedObjects: 1, deletedMedia: 0, failures: 1 });
    expect(await stored("partial")).toBeDefined();
    transport.failures.clear();
    expect(await cleanupContent({ apply: true, now })).toMatchObject({ deletedObjects: 1, deletedMedia: 1, failures: 0 });
    expect(await stored("partial")).toBeUndefined();
    expect(await cleanupContent({ apply: true, now })).toMatchObject({ deletedObjects: 0, deletedMedia: 0 });
    // A PUT started earlier may materialize after its ledger is gone.
    object("partial", false, now);
    expect(await cleanupContent({ apply: true, now })).toMatchObject({ deletedObjects: 0, recentMedia: 1 });
    expect(await cleanupContent({ apply: true, now: new Date(now.getTime() + 2 * 86400000) })).toMatchObject({ deletedObjects: 1, orphanObjects: 1 });
  });

  it("does not touch chat paths or trust corrupted ledger paths", async () => {
    await media("bad");
    await db.update(afilliMediaTable).set({ objectPath: "/test-bucket/private/chat/photos/keep" }).where(eq(afilliMediaTable.id, "bad"));
    transport.objects.set("/test-bucket/private/chat/photos/keep", { path: "/test-bucket/private/chat/photos/keep", generation: "1", updatedAt: old, size: 10 });
    expect(await cleanupContent({ apply: true, now })).toMatchObject({ unsafePaths: 1, deletedObjects: 0 });
    expect(transport.objects.size).toBe(3);
    vi.mocked(listContentObjects).mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(cleanupContent({ apply: true, now })).rejects.toThrow("storage unavailable");
    expect(transport.deleted).toEqual([]);
  });

  it("retains the ledger if a replacement arrives after listing", async () => {
    await media("replaced");
    transport.beforeDelete = async () => {
      const file = transport.objects.get(contentObjectPath("replaced"))!;
      file.generation = "2";
    };
    expect(await cleanupContent({ apply: true, now })).toMatchObject({ failures: 1, deletedMedia: 0 });
    expect(await stored("replaced")).toBeDefined();
  });

  it("prevents other owners from completing or cancelling and protects real references on cancellation", async () => {
    await media("owned", { ready: false, createdAt: now });
    expect((await request(app).post("/api/content/uploads/owned/complete").set("x-test-user", "bob")).status).toBe(404);
    expect((await request(app).delete("/api/content/uploads/owned").set("x-test-user", "bob")).status).toBe(404);
    await db.insert(favoriBooksTable).values({ id: "book", author: "Alice", authorId: "alice", category: "Roman", title: "Book", coverUrl: "/api/content/media/owned" });
    expect((await request(app).delete("/api/content/uploads/owned").set("x-test-user", "alice")).status).toBe(409);
    expect(transport.deleted).toEqual([]);
  });

  it("cancels without losing retry state and rejects expired or cancelled completion", async () => {
    await media("cancel", { createdAt: now, ready: false });
    expect((await request(app).delete("/api/content/uploads/cancel").set("x-test-user", "alice")).status).toBe(204);
    expect(await stored("cancel")).toMatchObject({ purpose: "cancelled", ready: false, ownerId: "alice" });
    expect((await request(app).post("/api/content/uploads/cancel/complete").set("x-test-user", "alice")).status).toBe(410);
    await media("expired-upload", { ready: false });
    expect((await request(app).post("/api/content/uploads/expired-upload/complete").set("x-test-user", "alice")).status).toBe(410);
    expect(transport.deleted).toEqual([]);
  });

  it("serializes publishing against cleanup and revalidates ownership after acquiring the lock", async () => {
    await media("race");
    let entered!: () => void;
    let release!: () => void;
    const enteredDelete = new Promise<void>((resolve) => { entered = resolve; });
    const canDelete = new Promise<void>((resolve) => { release = resolve; });
    transport.beforeDelete = async () => { entered(); await canDelete; };
    const cleanup = cleanupContent({ apply: true, now });
    await enteredDelete;
    let finished = false;
    const publish = request(app).post("/api/posts").set("x-test-user", "alice")
      .send({ ...postData, imageUrl: "/api/content/media/race" })
      .then((response) => { finished = true; return response; });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(finished).toBe(false);
    release();
    await cleanup;
    expect((await publish).status).toBe(400);
    expect(await db.select().from(favoriPostsTable)).toHaveLength(0);
  });

  it("protects a newly published reference and retries after process-style lock release", async () => {
    await media("publish-first");
    const published = await request(app).post("/api/posts").set("x-test-user", "alice").send({ ...postData, imageUrl: "/api/content/media/publish-first" });
    expect(published.status).toBe(201);
    expect(await cleanupContent({ apply: true, now })).toMatchObject({ protectedMedia: 1, deletedObjects: 0 });
    await expect(withContentLifecycleLock(async () => { throw new Error("crash"); })).rejects.toThrow("crash");
    expect(await cleanupContent({ now })).toMatchObject({ mode: "preview", protectedMedia: 1 });
  });
});
