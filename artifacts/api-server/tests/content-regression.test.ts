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
vi.mock("../src/lib/contentStorage", () => {
  const verify = vi.fn(async (_asset?: unknown) => undefined);
  return {
    contentObjectPath: (id: string) => `/test-bucket/content/${id}`,
    signContentFile: vi.fn(async () => "https://storage.invalid/temporary-signed-url"),
    contentFile: vi.fn(() => ({ delete: vi.fn(async () => undefined) })),
    verifyContentFile: verify,
    finalizeContentFile: async (asset: { objectPath: string }) => { await verify(asset); return `${asset.objectPath}/ready`; },
  };
});
import router from "../src/routes/favori";
import { verifyContentFile } from "../src/lib/contentStorage";
import { db, afilliMediaTable, afilliStoriesTable, favoriBooksTable, favoriProfilesTable, favoriPostsTable, favoriReadingProgressTable, afilliUserBlocksTable } from "@workspace/db";
import { setupDatabase, resetDatabase, closeDatabase } from "../../../lib/db/tests/isolated-chat-db";
const app = express();
app.use(pinoHttp({ enabled: false }), express.json({ limit: "4mb" }));
app.use("/api", router);
const post = { type: "magazine", title: "Ücretsiz dergi", body: "Bir okurun notları.", allowLikes: true, allowComments: true };
beforeAll(async () => { vi.stubEnv("AFILLI_ADMIN_USER_ID", "admin"); vi.stubEnv("FAVORI_SHOP_OWNER_USER_ID", "bob"); await setupDatabase(); });
afterAll(async () => { await closeDatabase(); vi.unstubAllEnvs(); });
beforeEach(async () => {
  await resetDatabase();
  await db.insert(favoriProfilesTable).values(["alice", "bob", "admin"].map((id) => ({ id, handle: id, name: `Reader ${id}` })));
  await db.insert(favoriBooksTable).values([
    { id: "published-alice", title: "Kalıcı kitap", author: "Alice", authorId: "alice", category: "Roman" },
    { id: "draft-alice", title: "Taslak", author: "Alice", authorId: "alice", category: "Roman", status: "draft" },
  ]);
});
async function upload(user: string, purpose: "post" | "story" | "video") {
  const response = await request(app).post("/api/content/uploads").set("x-test-user", user).send({ purpose, mime: purpose === "video" ? "video/mp4" : "image/png", size: 64 });
  expect(response.status).toBe(201);
  const completed = await request(app).post(`/api/content/uploads/${response.body.id}/complete`).set("x-test-user", user);
  expect(completed.status).toBe(200);
  return completed.body as { id: string; path: string };
}
describe("free publishing and content ownership", () => {
  it("keeps guest access closed, without charging registered readers", async () => {
    expect((await request(app).get("/api/memberships")).body).toMatchObject({ magazine: false, special: false });
    expect((await request(app).post("/api/posts").send(post)).status).toBe(401);
    expect((await request(app).post("/api/posts").set("x-test-user", "alice").send(post)).status).toBe(201);
    expect((await request(app).get("/api/memberships").set("x-test-user", "alice")).body).toMatchObject({ magazine: true, special: true, available: false, store: false });
  });
  it("persists edits, counts a reader once and forbids modifying another reader's post", async () => {
    const created = await request(app).post("/api/posts").set("x-test-user", "alice").send(post);
    const id = created.body.id;
    expect((await request(app).patch(`/api/content/posts/${id}`).set("x-test-user", "bob").send({ ...post, body: "Yetkisiz" })).status).toBe(403);
    expect((await request(app).delete(`/api/content/posts/${id}`).set("x-test-user", "bob")).status).toBe(403);
    const changed = await request(app).patch(`/api/content/posts/${id}`).set("x-test-user", "alice").send({ ...post, body: "Güncel metin", allowLikes: false });
    expect(changed.body).toMatchObject({ body: "Güncel metin", allowLikes: false, authorId: "alice", canManage: true });
    await request(app).get(`/api/content/posts/${id}`).set("x-test-user", "bob");
    const reread = await request(app).get(`/api/content/posts/${id}`).set("x-test-user", "bob");
    expect(reread.body.views).toBe(1);
    expect((await request(app).get("/api/posts?authorId=alice")).body.some((item: { id: string }) => item.id === id)).toBe(true);
    expect((await request(app).get("/api/posts?authorId=bob")).body.some((item: { id: string }) => item.id === id)).toBe(false);
    expect((await request(app).delete(`/api/content/posts/${id}`).set("x-test-user", "alice")).status).toBe(204);
    expect((await request(app).get(`/api/content/posts/${id}`)).status).toBe(404);
  });
  it("enforces word limits and allows a verified photo without a fake caption", async () => {
    for (const [type, words] of [["newsletter", 1001], ["magazine", 3001]] as const) {
      expect((await request(app).post("/api/posts").set("x-test-user", "alice").send({ ...post, type, body: "a ".repeat(words) })).status).toBe(400);
    }
    const asset = await upload("alice", "post");
    expect((await request(app).post("/api/posts").set("x-test-user", "bob").send({ ...post, imageUrl: asset.path })).status).toBe(400);
    const created = await request(app).post("/api/posts").set("x-test-user", "alice").send({ ...post, type: "photo", title: "", body: "", imageUrl: asset.path });
    expect(created.status).toBe(201);
    expect(created.body.imageUrl).toBe(asset.path);
    expect((await request(app).get(`/api/content/media/${asset.id}/url`)).status).toBe(200);
    await request(app).delete(`/api/content/posts/${created.body.id}`).set("x-test-user", "alice");
    expect((await request(app).get(`/api/content/media/${asset.id}/url`)).status).toBe(404);
    const [stored] = await db.select().from(afilliMediaTable).where(eq(afilliMediaTable.id, asset.id));
    expect(stored.objectPath).toMatch(/^\/test-bucket\//);
    expect(stored.linked).toBe(false);
  });
  it("validates allocations, rejects incomplete bytes and never exposes another user's pending file", async () => {
    expect((await request(app).post("/api/content/uploads").send({ purpose: "story", mime: "image/png", size: 64 })).status).toBe(401);
    expect((await request(app).post("/api/content/uploads").set("x-test-user", "alice").send({ purpose: "story", mime: "video/mp4", size: 64 })).status).toBe(400);
    expect((await request(app).post("/api/content/uploads").set("x-test-user", "alice").send({ purpose: "post", mime: "image/png", size: 11000000 })).status).toBe(400);
    const allocated = await request(app).post("/api/content/uploads").set("x-test-user", "alice").send({ purpose: "post", mime: "image/png", size: 64 });
    vi.mocked(verifyContentFile).mockRejectedValueOnce(new Error("invalid bytes"));
    expect((await request(app).post(`/api/content/uploads/${allocated.body.id}/complete`).set("x-test-user", "alice")).status).toBe(400);
    expect((await request(app).delete(`/api/content/uploads/${allocated.body.id}`).set("x-test-user", "bob")).status).toBe(404);
    expect((await request(app).get(`/api/content/media/${allocated.body.id}/url`).set("x-test-user", "bob")).status).toBe(404);
    expect((await request(app).delete(`/api/content/uploads/${allocated.body.id}`).set("x-test-user", "alice")).status).toBe(204);
  });
  it("supports text/photo stories, seen state, expiry, blocks and owner-only deletion", async () => {
    const asset = await upload("alice", "story");
    const created = await request(app).post("/api/content/stories").set("x-test-user", "alice").send({ body: "Bugünün kitabı", mediaId: asset.id });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect((await request(app).get("/api/content/stories")).status).toBe(401);
    expect((await request(app).get(`/api/content/media/${asset.id}/url`)).status).toBe(401);
    expect((await request(app).post(`/api/content/stories/${id}/view`).set("x-test-user", "bob")).status).toBe(204);
    expect((await request(app).get("/api/content/stories").set("x-test-user", "bob")).body.find((item: { id: string }) => item.id === id).seen).toBe(true);
    expect((await request(app).delete(`/api/content/stories/${id}`).set("x-test-user", "bob")).status).toBe(403);
    await db.insert(afilliUserBlocksTable).values({ blockerId: "bob", blockedId: "alice" });
    expect((await request(app).get("/api/content/stories").set("x-test-user", "bob")).body).toHaveLength(0);
    await db.update(afilliStoriesTable).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(afilliStoriesTable.id, id));
    expect((await request(app).get(`/api/content/media/${asset.id}/url`).set("x-test-user", "alice")).status).toBe(404);
    expect((await request(app).delete(`/api/content/stories/${id}`).set("x-test-user", "alice")).status).toBe(204);
  });
  it("publishes real video references with per-reader views, reactions, comments and safe deletion", async () => {
    const asset = await upload("alice", "video");
    const created = await request(app).post("/api/content/videos").set("x-test-user", "alice").send({ title: "Okuma anı", body: "", mediaId: asset.id });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect((await request(app).get("/api/content/videos")).status).toBe(401);
    await request(app).post(`/api/content/videos/${id}/view`).set("x-test-user", "bob");
    await request(app).post(`/api/content/videos/${id}/view`).set("x-test-user", "bob");
    expect((await request(app).post(`/api/content/videos/${id}/like`).set("x-test-user", "bob")).body).toMatchObject({ views: 1, likes: 1, likedByMe: true });
    expect((await request(app).post(`/api/content/videos/${id}/like`).set("x-test-user", "bob")).body.likes).toBe(0);
    const comment = await request(app).post(`/api/content/videos/${id}/comments`).set("x-test-user", "bob").send({ body: "Güzel öneri." });
    expect(comment.status).toBe(201);
    expect((await request(app).delete(`/api/content/comments/${comment.body.id}`).set("x-test-user", "alice")).status).toBe(403);
    expect((await request(app).delete(`/api/content/comments/${comment.body.id}`).set("x-test-user", "bob")).status).toBe(204);
    expect((await request(app).delete(`/api/content/videos/${id}`).set("x-test-user", "bob")).status).toBe(403);
    expect((await request(app).delete(`/api/content/videos/${id}`).set("x-test-user", "alice")).status).toBe(204);
    expect((await request(app).get(`/api/content/media/${asset.id}/url`).set("x-test-user", "alice")).status).toBe(404);
  });
  it("lets only admins review a real owner's published-book promotion", async () => {
    expect((await request(app).post("/api/book-ads").set("x-test-user", "alice").send({ bookId: "draft-alice", budget: 10 })).status).toBe(404);
    const created = await request(app).post("/api/book-ads").set("x-test-user", "alice").send({ bookId: "published-alice", budget: 10 });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect((await request(app).get("/api/content/ads").set("x-test-user", "bob")).body).toHaveLength(0);
    expect((await request(app).patch(`/api/content/ads/${id}`).set("x-test-user", "alice").send({ status: "approved" })).status).toBe(403);
    expect((await request(app).patch(`/api/content/ads/${id}`).set("x-test-user", "admin").send({ status: "approved" })).body.status).toBe("approved");
    const [book] = await db.select().from(favoriBooksTable).where(eq(favoriBooksTable.id, "published-alice"));
    expect(book.isPromoted).toBe(true);
    await request(app).patch(`/api/content/ads/${id}`).set("x-test-user", "admin").send({ status: "rejected" });
    expect((await db.select().from(favoriBooksTable).where(eq(favoriBooksTable.id, "published-alice")))[0].isPromoted).toBe(false);
  });
  it("prevents deleting another author's book and removes dependent data for one's own book", async () => {
    await db.insert(favoriReadingProgressTable).values({ userId: "bob", bookId: "published-alice", progress: 50 });
    await db.insert(favoriPostsTable).values({ id: "book-share", authorId: "alice", type: "newsletter", body: "Kitabım", bookId: "published-alice" });
    expect((await request(app).delete("/api/content/books/published-alice").set("x-test-user", "bob")).status).toBe(403);
    expect((await request(app).delete("/api/content/books/published-alice").set("x-test-user", "alice")).status).toBe(204);
    expect((await db.select().from(favoriReadingProgressTable)).length).toBe(0);
    expect((await db.select().from(favoriPostsTable).where(eq(favoriPostsTable.id, "book-share")))[0].bookId).toBeNull();
  });
});
