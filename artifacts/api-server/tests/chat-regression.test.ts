import express from "express";
import pinoHttp from "pino-http";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, count, eq } from "drizzle-orm";
import { Readable } from "node:stream";

const storageState = vi.hoisted(() => ({
  uploads: new Map<string, { bytes: Buffer; contentType: string; createdAt?: number }>(),
  photos: new Map<string, { bytes: Buffer; contentType: string }>(),
  failSave: false,
  failDelete: false,
}));
vi.mock("../src/lib/chatPhotoStorage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/chatPhotoStorage")>();
  return {
    ...actual,
    chatPhotoStorage: {
      requestUpload: vi.fn(async (id: string) => `https://storage.invalid/${id}`),
      readUpload: vi.fn(async (id: string, size: number, contentType: string) => {
        const file = storageState.uploads.get(id);
        if (!file || file.bytes.length !== size || file.contentType !== contentType || size > actual.MAX_CHAT_PHOTO_BYTES) {
          throw new actual.InvalidChatPhoto("Invalid photo metadata");
        }
        actual.validatePhotoBytes(file.bytes, contentType);
        return file.bytes;
      }),
      savePhoto: vi.fn(async (id: string, bytes: Buffer, contentType: string) => {
        if (storageState.failSave) throw new Error("storage unavailable");
        storageState.photos.set(actual.photoPath(id), { bytes, contentType });
      }),
      deleteUpload: vi.fn(async (id: string) => {
        if (storageState.failDelete) throw new Error("storage unavailable");
        storageState.uploads.delete(id);
      }),
      deletePhoto: vi.fn(async (id: string) => {
        if (storageState.failDelete) throw new Error("storage unavailable");
        storageState.photos.delete(actual.photoPath(id));
      }),
      sweepStaleUploads: vi.fn(async (before: Date) => {
        if (storageState.failDelete) throw new Error("storage unavailable");
        for (const [id, file] of storageState.uploads) {
          if ((file.createdAt ?? Date.now()) < before.getTime()) storageState.uploads.delete(id);
        }
      }),
      readPhoto: vi.fn(async (path: string) => {
        const photo = storageState.photos.get(path);
        if (!photo) throw new Error("not found");
        return { contentType: photo.contentType, stream: Readable.from(photo.bytes) };
      }),
    },
  };
});

vi.mock("@workspace/db", async () => ({
  ...await import("../../../lib/db/src/schema"),
  ...await import("../../../lib/db/tests/isolated-chat-db"),
}));
// Only the identity provider boundary is replaced: production requireAuth,
// block checks, admin checks, validation, transactions and SQL all run unchanged.
vi.mock("@clerk/express", () => ({
  getAuth: (req: express.Request) => ({ userId: req.headers["x-test-user"] ?? null }),
  clerkClient: { users: { getUser: vi.fn(() => { throw new Error("Unexpected identity lookup"); }) } },
}));
vi.mock("../src/lib/shopifyAdmin", () => ({
  shopifyAdminGraphql: vi.fn(() => { throw new Error("Shopify calls are forbidden in chat tests"); }),
  throwShopifyUserErrors: vi.fn(() => { throw new Error("Unexpected Shopify operation"); }),
}));
vi.mock("../src/lib/shopifyStorefrontClient", () => ({
  createCheckoutUrl: vi.fn(() => { throw new Error("Real checkout is forbidden"); }),
  shopifyStorefrontRequest: vi.fn(() => { throw new Error("Shopify calls are forbidden in chat tests"); }),
}));

import router from "../src/routes/favori";
import { shopifyAdminGraphql } from "../src/lib/shopifyAdmin";
import {
  db, favoriBooksTable, favoriProfilesTable, favoriRoomMessagesTable,
  favoriMessagesTable, afilliUserBlocksTable,
  favoriChatPhotoUploadsTable, afilliChatGifsTable, afilliRoomPoliciesTable,
} from "@workspace/db";
import { cleanupChatPhotos } from "../src/lib/chatPhotoCleanup";
import { chatPhotoStorage, photoPath } from "../src/lib/chatPhotoStorage";
import { setupDatabase, resetDatabase, closeDatabase, delayRoomInserts, failRoomInserts } from "../../../lib/db/tests/isolated-chat-db";

function makeApp() {
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.use(express.json({ limit: "4mb" }));
  app.use("/api", router);
  return app;
}
const app = makeApp();
const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6xkAAAAASUVORK5CYII=";
const photoBytes = Buffer.from(photo.split(",")[1], "base64");
const rooms = ["general", "afilli", "magazin", "serbest"];
async function reservePhoto(user = "alice", room = "general") {
  const response = await request(app).post(`/api/chat/rooms/${room}/photos`).set("x-test-user", user)
    .send({ size: photoBytes.length, contentType: "image/png" });
  if (response.status === 200) storageState.uploads.set(response.body.uploadId, { bytes: photoBytes, contentType: "image/png" });
  return response;
}
async function send(user: string, room: string, body: { kind?: string; mediaUrl?: string; uploadId?: string; [key: string]: unknown }) {
  if (body.kind === "image" && body.mediaUrl === photo) {
    const upload = await reservePhoto(user, room);
    if (upload.status !== 200) return upload;
    body = { ...body, uploadId: upload.body.uploadId };
    delete body.mediaUrl;
  }
  return request(app).post(`/api/chat/rooms/${room}/messages`).set("x-test-user", user).send(body);
}

beforeAll(async () => {
  vi.stubEnv("AFILLI_ADMIN_USER_ID", "admin");
  await setupDatabase();
});
afterAll(async () => {
  await closeDatabase();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  storageState.uploads.clear();
  storageState.photos.clear();
  storageState.failSave = false;
  storageState.failDelete = false;
  vi.stubEnv("FAVORI_SHOP_OWNER_USER_ID", "bob");
  await resetDatabase();
  await db.insert(favoriProfilesTable).values(
    ["alice", "bob", "admin"].map((id) => ({ id, handle: id, name: `Reader ${id}` })),
  );
  await db.insert(favoriBooksTable).values([
    { id: "book-alice", title: "Alice's book", author: "Alice", authorId: "alice", category: "Roman", coverUrl: "https://example.com/cover.png" },
    { id: "book-bob", title: "Bob's book", author: "Bob", authorId: "bob", category: "Roman" },
    { id: "draft-alice", title: "Draft", author: "Alice", authorId: "alice", category: "Roman", status: "draft" },
  ]);
});

describe("store ownership and paid access boundaries", () => {
  const product = { title: "Test book", description: "", price: 100, quantity: 1, category: "Kitap" };

  it("denies guests, ordinary readers and even the chat admin before contacting Shopify", async () => {
    expect((await request(app).post("/api/store/products").send(product)).status).toBe(401);
    for (const id of ["alice", "admin"]) {
      expect((await request(app).post("/api/store/products").set("x-test-user", id).send(product)).status).toBe(403);
    }
    expect(shopifyAdminGraphql).not.toHaveBeenCalled();
  });

  it("allows only the configured owner through to Shopify without creating a real product", async () => {
    const response = await request(app).post("/api/store/products").set("x-test-user", "bob").send(product);
    // The transport deliberately throws: authorization passed, no external write occurred.
    expect(response.status).toBe(502);
    expect(response.body.error).toContain("Shopify calls are forbidden in chat tests");
    expect(response.body).toMatchObject({ stage: "create", recoveryRequired: true });
    expect(shopifyAdminGraphql).toHaveBeenCalledOnce();
    expect(shopifyAdminGraphql).toHaveBeenCalledWith(
      expect.stringContaining("mutation FavoriProductCreate"),
      expect.objectContaining({ product: expect.objectContaining({ title: product.title }) }),
    );
  });

  it("fails closed without a configured owner and when the owner is blocked", async () => {
    vi.stubEnv("FAVORI_SHOP_OWNER_USER_ID", "");
    expect((await request(app).post("/api/store/products").set("x-test-user", "bob").send(product)).status).toBe(403);
    vi.stubEnv("FAVORI_SHOP_OWNER_USER_ID", "bob");
    await db.update(favoriProfilesTable).set({ isBlocked: true }).where(eq(favoriProfilesTable.id, "bob"));
    expect((await request(app).post("/api/store/products").set("x-test-user", "bob").send(product)).status).toBe(403);
    expect(shopifyAdminGraphql).not.toHaveBeenCalled();
  });

  it.each(["alice", "bob", "admin"])("allows registered account %s to use magazine and Special for free", async (id) => {
    const response = await request(app).get("/api/memberships").set("x-test-user", id);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      store: id === "bob", magazine: true, special: true, available: false,
      message: expect.any(String),
    });
  });
});

describe("room persistence and API response contracts", () => {
  it.each(rooms)("persists text, image and book in %s across fresh app reads", async (roomId) => {
    const bodies = [
      { body: "  Kalıcı mesaj 📚  ", kind: "text" },
      { body: "", kind: "image", mediaUrl: photo },
      { body: "", kind: "book", bookId: "book-alice" },
    ];
    const created = [];
    for (const body of bodies) {
      const response = await send("alice", roomId, body);
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ roomId, senderId: "alice", kind: body.kind });
      expect(Number.isFinite(Date.parse(response.body.createdAt))).toBe(true);
      created.push(response.body);
    }
    expect(created[0].body).toBe("Kalıcı mesaj 📚");
    expect(created[1].mediaUrl).toBe(`/api/chat/rooms/${roomId}/photos/${created[1].id}`);
    expect(created[2]).toMatchObject({ bookId: "book-alice", bookTitle: "Alice's book", bookCoverUrl: "https://example.com/cover.png" });
    const rows = await db.select().from(favoriRoomMessagesTable).where(eq(favoriRoomMessagesTable.roomId, roomId));
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.kind === "image")?.mediaUrl).toMatch(/^\/objects\/chat\/photos\//);
    expect(rows.find((row) => row.kind === "book")?.bookId).toBe("book-alice");
    // A new application instance and a different reader cannot rely on writer-side state.
    const reloaded = await request(makeApp()).get(`/api/chat/rooms/${roomId}/messages`).set("x-test-user", "bob");
    expect(reloaded.status).toBe(200);
    expect(reloaded.body).toEqual(created);
    const otherRoom = rooms.find((id) => id !== roomId)!;
    const unrelated = await request(app).get(`/api/chat/rooms/${otherRoom}/messages`).set("x-test-user", "alice");
    expect(unrelated.body).toEqual([]);
  });

  it.each(["book-bob", "draft-alice", "missing"])("rejects non-shareable book %s without persisting it", async (bookId) => {
    expect((await send("alice", "general", { body: "", kind: "book", bookId })).status).toBe(400);
    expect(await db.select().from(favoriRoomMessagesTable)).toEqual([]);
  });
});

describe("bidirectional block visibility in room history", () => {
  type Message = { id: string; roomId: string; senderId: string };
  const readers = ["alice", "bob", "carol"];

  beforeEach(async () => {
    await db.insert(favoriProfilesTable).values({ id: "carol", handle: "carol", name: "Reader carol" });
  });

  async function addHistory(history: Map<string, Message[]>, label: string) {
    for (const [roomId, messages] of history) {
      for (const sender of readers) {
        const response = await send(sender, roomId, { kind: "text", body: `${label}:${roomId}:${sender}` });
        expect(response.status).toBe(201);
        messages.push(response.body);
      }
    }
  }

  async function expectFreshHistory(history: Map<string, Message[]>, blocked: boolean) {
    for (const [roomId, messages] of history) {
      for (const reader of readers) {
        const hiddenSender = reader === "alice" ? "bob" : reader === "bob" ? "alice" : null;
        const expected = blocked ? messages.filter((message) => message.senderId !== hiddenSender) : messages;
        // Each read mounts the real router on a new app, with no writer-side state.
        const response = await request(makeApp()).get(`/api/chat/rooms/${roomId}/messages`).set("x-test-user", reader);
        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(expected.length);
        // Compare complete DTOs without depending on ordering of tied timestamps.
        expect(response.body).toEqual(expect.arrayContaining(expected));
      }
    }
  }

  it.each([["alice", "bob"], ["bob", "alice"]])(
    "hides both directions across rooms after %s blocks %s and restores the untouched history",
    async (blocker, blockedReader) => {
      const history = new Map(rooms.map((roomId) => [roomId, [] as Message[]]));
      await addHistory(history, "before-block");
      const originalRows = await db.select().from(favoriRoomMessagesTable).orderBy(favoriRoomMessagesTable.id);
      await expectFreshHistory(history, false);

      const block = await request(app).put(`/api/chat/blocks/${blockedReader}`).set("x-test-user", blocker).send({ blocked: true });
      expect(block.status).toBe(200);
      expect(block.body.active).toBe(true);
      await expectFreshHistory(history, true);
      expect(await db.select().from(favoriRoomMessagesTable).orderBy(favoriRoomMessagesTable.id)).toEqual(originalRows);

      // New shared-room messages also stay hidden only from the other party.
      // Carol still sees all senders; Alice and Bob retain their own messages.
      await addHistory(history, "during-block");
      const rowsWhileBlocked = await db.select().from(favoriRoomMessagesTable).orderBy(favoriRoomMessagesTable.id);
      expect(rowsWhileBlocked).toHaveLength(originalRows.length * 2);
      expect(rowsWhileBlocked).toEqual(expect.arrayContaining(originalRows));
      await expectFreshHistory(history, true);

      const unblock = await request(makeApp()).put(`/api/chat/blocks/${blockedReader}`).set("x-test-user", blocker).send({ blocked: false });
      expect(unblock.status).toBe(200);
      expect(unblock.body.active).toBe(false);
      expect(await db.select().from(afilliUserBlocksTable)).toEqual([]);
      await expectFreshHistory(history, false);
      expect(await db.select().from(favoriRoomMessagesTable).orderBy(favoriRoomMessagesTable.id)).toEqual(rowsWhileBlocked);
      expect(shopifyAdminGraphql).not.toHaveBeenCalled();
    },
  );

  it("keeps history hidden until both readers remove their independent blocks", async () => {
    const history = new Map(rooms.map((roomId) => [roomId, [] as Message[]]));
    await addHistory(history, "mutual-block");
    const originalRows = await db.select().from(favoriRoomMessagesTable).orderBy(favoriRoomMessagesTable.id);
    for (const [blocker, blockedReader] of [["alice", "bob"], ["bob", "alice"]]) {
      expect((await request(app).put(`/api/chat/blocks/${blockedReader}`).set("x-test-user", blocker).send({ blocked: true })).status).toBe(200);
    }
    expect(await db.select().from(afilliUserBlocksTable)).toHaveLength(2);
    await expectFreshHistory(history, true);

    expect((await request(makeApp()).put("/api/chat/blocks/bob").set("x-test-user", "alice").send({ blocked: false })).status).toBe(200);
    expect(await db.select().from(afilliUserBlocksTable)).toEqual([
      expect.objectContaining({ blockerId: "bob", blockedId: "alice" }),
    ]);
    await expectFreshHistory(history, true);
    expect(await db.select().from(favoriRoomMessagesTable).orderBy(favoriRoomMessagesTable.id)).toEqual(originalRows);

    expect((await request(makeApp()).put("/api/chat/blocks/alice").set("x-test-user", "bob").send({ blocked: false })).status).toBe(200);
    expect(await db.select().from(afilliUserBlocksTable)).toEqual([]);
    await expectFreshHistory(history, false);
    expect(await db.select().from(favoriRoomMessagesTable).orderBy(favoriRoomMessagesTable.id)).toEqual(originalRows);
    expect(shopifyAdminGraphql).not.toHaveBeenCalled();
  });
});

describe("archive GIF policies and persistence", () => {
  const gifInput = { url: "https://example.com/archive.gif", category: "Kitap" };

  async function addGif() {
    const response = await request(app).post("/api/chat/admin/gifs").set("x-test-user", "admin")
      .send({ items: [gifInput] });
    expect(response.status).toBe(201);
    expect(response.body).toEqual([expect.objectContaining({ id: expect.any(String), ...gifInput })]);
    return response.body[0].id as string;
  }

  it.each(rooms)("rejects disabled GIFs in %s and persists archive shares after the admin reopens it", async (roomId) => {
    const gifId = await addGif();
    const disabled = await request(app).patch(`/api/chat/admin/rooms/${roomId}`)
      .set("x-test-user", "admin").send({ allowGifs: false });
    expect(disabled.status).toBe(200);
    expect(disabled.body).toMatchObject({ id: roomId, allowGifs: false });
    expect(await db.select().from(afilliRoomPoliciesTable)).toEqual([{ roomId, allowGifs: false }]);

    const denied = await send("alice", roomId, { body: "", kind: "gif", gifId });
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ error: "Bu odada GIF paylaşımı yönetici tarafından kapatıldı." });
    expect(await db.select().from(favoriRoomMessagesTable)).toEqual([]);
    const disabledBootstrap = await request(makeApp()).get("/api/chat/bootstrap").set("x-test-user", "bob");
    expect(disabledBootstrap.status).toBe(200);
    expect(disabledBootstrap.body.rooms.find((room: { id: string }) => room.id === roomId))
      .toMatchObject({ allowGifs: false });
    expect(disabledBootstrap.body.rooms.filter((room: { id: string }) => room.id !== roomId))
      .toEqual(expect.arrayContaining(rooms.filter((id) => id !== roomId)
        .map((id) => expect.objectContaining({ id, allowGifs: true }))));

    const reopened = await request(app).patch(`/api/chat/admin/rooms/${roomId}`)
      .set("x-test-user", "admin").send({ allowGifs: true });
    expect(reopened.status).toBe(200);
    expect(reopened.body).toMatchObject({ id: roomId, allowGifs: true });
    expect(await db.select().from(afilliRoomPoliciesTable)).toEqual([{ roomId, allowGifs: true }]);

    const created = await send("alice", roomId, { body: "  Arşivden GIF  ", kind: "gif", gifId });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      id: expect.any(String), roomId, senderId: "alice", sender: "Reader alice",
      body: "Arşivden GIF", kind: "gif", mediaUrl: gifInput.url, bookId: null,
    });
    expect(Number.isFinite(Date.parse(created.body.createdAt))).toBe(true);
    expect(await db.select().from(favoriRoomMessagesTable)).toEqual([
      expect.objectContaining({
        id: created.body.id, roomId, senderId: "alice", body: "Arşivden GIF",
        kind: "gif", mediaUrl: gifInput.url, bookId: null,
      }),
    ]);
    const reloaded = await request(makeApp()).get(`/api/chat/rooms/${roomId}/messages`).set("x-test-user", "bob");
    expect(reloaded.status).toBe(200);
    expect(reloaded.body).toEqual([created.body]);
    const bootstrap = await request(makeApp()).get("/api/chat/bootstrap").set("x-test-user", "bob");
    expect(bootstrap.status).toBe(200);
    expect(bootstrap.body.rooms.find((room: { id: string }) => room.id === roomId))
      .toMatchObject({ allowGifs: true });
    expect(bootstrap.body.gifs).toEqual([{ id: gifId, ...gifInput }]);
  });

  it("rejects a deleted archive ID without deleting or changing an earlier GIF message", async () => {
    const gifId = await addGif();
    const created = await send("alice", "general", { body: "", kind: "gif", gifId });
    expect(created.status).toBe(201);
    const before = await db.select().from(favoriRoomMessagesTable);

    const removed = await request(app).delete(`/api/chat/admin/gifs/${gifId}`).set("x-test-user", "admin");
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ active: false, count: 0, value: 0 });
    expect(await db.select().from(afilliChatGifsTable)).toEqual([]);
    const bootstrap = await request(makeApp()).get("/api/chat/bootstrap").set("x-test-user", "bob");
    expect(bootstrap.status).toBe(200);
    expect(bootstrap.body.gifs).toEqual([]);

    const rejected = await send("bob", "general", { body: "", kind: "gif", gifId });
    expect(rejected.status).toBe(404);
    expect(rejected.body).toEqual({ error: "GIF arşivde bulunamadı." });
    expect(await db.select().from(favoriRoomMessagesTable)).toEqual(before);
    const reloaded = await request(makeApp()).get("/api/chat/rooms/general/messages").set("x-test-user", "bob");
    expect(reloaded.status).toBe(200);
    expect(reloaded.body).toEqual([created.body]);
  });
});

describe("daily photo quota uses real PostgreSQL concurrency", () => {
  it("accepts exactly five simultaneous photos across rooms, independently per account", async () => {
    await delayRoomInserts();
    const responses = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      send("alice", rooms[i % rooms.length], { body: "", kind: "image", mediaUrl: photo })));
    expect(responses.filter((response) => response.status === 201)).toHaveLength(5);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(7);
    const [stored] = await db.select({ value: count() }).from(favoriRoomMessagesTable)
      .where(and(eq(favoriRoomMessagesTable.senderId, "alice"), eq(favoriRoomMessagesTable.kind, "image")));
    expect(stored.value).toBe(5);
    const setup = await request(app).get("/api/chat/bootstrap").set("x-test-user", "alice");
    expect(setup.status).toBe(200);
    expect(setup.body.photoCount).toBe(5);
    expect((await send("bob", "general", { body: "", kind: "image", mediaUrl: photo })).status).toBe(201);
    expect((await send("alice", "general", { body: "Still allowed" })).status).toBe(201);
    expect((await send("alice", "general", { body: "", kind: "book", bookId: "book-alice" })).status).toBe(201);
  });

  it("resets at Turkey midnight, including the boundary but not the previous day", async () => {
    const now = Date.now();
    const start = new Date(now + 3 * 60 * 60 * 1000);
    start.setUTCHours(0, 0, 0, 0);
    const midnight = new Date(start.getTime() - 3 * 60 * 60 * 1000);
    vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      await db.insert(favoriRoomMessagesTable).values(Array.from({ length: 9 }, (_, i) => ({
        id: `existing-${i}`, roomId: "general", senderId: "alice", senderName: "Alice",
        body: "", kind: "image", mediaUrl: photo,
        createdAt: new Date(midnight.getTime() - (i < 5 ? 1 : 0)),
      })));
      const setup = await request(app).get("/api/chat/bootstrap").set("x-test-user", "alice");
      expect(setup.body.photoCount).toBe(4);
      const responses = await Promise.all(Array.from({ length: 4 }, () =>
        send("alice", "serbest", { body: "", kind: "image", mediaUrl: photo })));
      expect(responses.map((response) => response.status).sort()).toEqual([201, 429, 429, 429]);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("photo storage, validation and cleanup", () => {
  it("keeps legacy history readable without copying its bytes", async () => {
    await db.insert(favoriRoomMessagesTable).values({ id: "legacy", roomId: "general", senderId: "alice", senderName: "Alice", body: "", kind: "image", mediaUrl: photo });
    const response = await request(makeApp()).get("/api/chat/rooms/general/messages").set("x-test-user", "bob");
    expect(response.body[0].mediaUrl).toBe(photo);
    expect(storageState.photos.size).toBe(0);
  });

  it("serves stored photos after reload only to authorized, unblocked readers", async () => {
    const sent = await send("alice", "general", { kind: "image", body: "", mediaUrl: photo });
    expect(sent.status).toBe(201);
    const url = sent.body.mediaUrl;
    expect((await request(makeApp()).get(url)).status).toBe(401);
    const image = await request(makeApp()).get(url).set("x-test-user", "bob");
    expect(image.status).toBe(200);
    expect(image.headers["content-type"]).toContain("image/png");
    expect(image.headers["cache-control"]).toBe("private, no-store");
    expect(image.body).toEqual(photoBytes);
    await request(app).put("/api/chat/blocks/alice").set("x-test-user", "bob").send({ blocked: true });
    expect((await request(app).get(url).set("x-test-user", "bob")).status).toBe(404);
    await request(app).put("/api/chat/blocks/alice").set("x-test-user", "bob").send({ blocked: false });
    await db.update(favoriProfilesTable).set({ isBlocked: true }).where(eq(favoriProfilesTable.id, "bob"));
    expect((await request(app).get(url).set("x-test-user", "bob")).status).toBe(403);
    expect((await request(app).get(url.replace("/general/", "/magazin/")).set("x-test-user", "alice")).status).toBe(404);
  });

  it.each([
    { size: 0, contentType: "image/png" },
    { size: 2250001, contentType: "image/png" },
    { size: 1.5, contentType: "image/png" },
    { size: 42, contentType: "image/svg+xml" },
  ])("rejects invalid metadata before issuing a PUT: %j", async (data) => {
    const result = await request(app).post("/api/chat/rooms/general/photos").set("x-test-user", "alice").send(data);
    expect(result.status).toBe(400);
    expect(chatPhotoStorage.requestUpload).not.toHaveBeenCalled();
    expect(await db.select().from(favoriChatPhotoUploadsTable)).toEqual([]);
  });

  it("rejects new data URIs, foreign URLs and arbitrary object paths", async () => {
    for (const mediaUrl of [photo, "https://example.com/photo.png", "/objects/chat/photos/foreign"]) {
      expect((await send("alice", "general", { kind: "image", body: "", mediaUrl: `${mediaUrl}x` })).status).toBe(400);
    }
    expect(storageState.photos.size).toBe(0);
  });

  it("binds upload ownership and room and prevents reused IDs from deleting committed photos", async () => {
    const upload = await reservePhoto();
    const uploadId = upload.body.uploadId;
    expect((await send("bob", "general", { kind: "image", body: "", uploadId })).status).toBe(400);
    await request(app).delete(`/api/chat/photos/${uploadId}`).set("x-test-user", "bob");
    expect(storageState.uploads.has(uploadId)).toBe(true);
    const created = await send("alice", "general", { kind: "image", body: "", uploadId });
    expect(created.status).toBe(201);
    expect((await send("alice", "general", { kind: "image", body: "", uploadId })).status).toBe(400);
    await request(app).delete(`/api/chat/photos/${uploadId}`).set("x-test-user", "alice");
    expect(storageState.photos.has(photoPath(uploadId))).toBe(true);
    const wrongRoom = await reservePhoto();
    expect((await send("alice", "magazin", { kind: "image", body: "", uploadId: wrongRoom.body.uploadId })).status).toBe(400);
    expect(storageState.uploads.has(wrongRoom.body.uploadId)).toBe(false);
  });

  it.each(["bad-magic", "wrong-size", "wrong-mime", "missing", "storage-error", "expired"])("leaves no message or untracked file on %s", async (failure) => {
    const upload = await reservePhoto();
    const uploadId = upload.body.uploadId;
    if (failure === "bad-magic") storageState.uploads.set(uploadId, { bytes: Buffer.alloc(photoBytes.length), contentType: "image/png" });
    if (failure === "wrong-size") storageState.uploads.set(uploadId, { bytes: Buffer.alloc(2250001), contentType: "image/png" });
    if (failure === "wrong-mime") storageState.uploads.set(uploadId, { bytes: photoBytes, contentType: "image/jpeg" });
    if (failure === "missing") storageState.uploads.delete(uploadId);
    if (failure === "storage-error") storageState.failSave = true;
    if (failure === "expired") await db.update(favoriChatPhotoUploadsTable).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(favoriChatPhotoUploadsTable.id, uploadId));
    const result = await send("alice", "general", { kind: "image", body: "", uploadId });
    expect(result.status).toBe(failure === "storage-error" ? 503 : 400);
    expect(await db.select().from(favoriRoomMessagesTable)).toEqual([]);
    expect(storageState.uploads.size).toBe(0);
    expect(storageState.photos.size).toBe(0);
    const [ledger] = await db.select().from(favoriChatPhotoUploadsTable);
    expect(ledger.state).toBe("cancelled");
    const setup = await request(app).get("/api/chat/bootstrap").set("x-test-user", "alice");
    expect(setup.body.photoCount).toBe(0);
  });

  it("serializes finalization across rooms and cleans quota-rejected uploads", async () => {
    await db.insert(favoriRoomMessagesTable).values(Array.from({ length: 4 }, (_, i) => ({ id: `old-${i}`, roomId: "general", senderId: "alice", senderName: "Alice", body: "", kind: "image", mediaUrl: photo })));
    const uploads = [];
    for (let i = 0; i < 5; i++) uploads.push(await reservePhoto("alice", rooms[i % 4]));
    await delayRoomInserts();
    const results = await Promise.all(uploads.map((upload, i) => send("alice", rooms[i % 4], { kind: "image", body: "", uploadId: upload.body.uploadId })));
    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect(results.filter((result) => result.status === 429)).toHaveLength(4);
    expect(storageState.photos.size).toBe(1);
    for (let i = 0; i < results.length; i++) if (results[i].status === 429) expect(storageState.uploads.has(uploads[i].body.uploadId)).toBe(false);
  });

  it("retries failed cleanup after process restart and preserves committed media", async () => {
    const abandoned = await reservePhoto();
    const cancelled = await reservePhoto();
    const sent = await send("alice", "general", { kind: "image", body: "", mediaUrl: photo });
    expect(sent.status).toBe(201);
    storageState.failDelete = true;
    await request(app).delete(`/api/chat/photos/${cancelled.body.uploadId}`).set("x-test-user", "alice");
    // A client can replay a signed PUT after cancel; the ledger must outlive it.
    storageState.uploads.set(cancelled.body.uploadId, { bytes: photoBytes, contentType: "image/png" });
    const later = new Date(Date.now() + 20 * 60_000);
    await cleanupChatPhotos(later);
    expect(await db.select().from(favoriChatPhotoUploadsTable)).toHaveLength(3);
    storageState.failDelete = false;
    await cleanupChatPhotos(later);
    expect(storageState.uploads.has(abandoned.body.uploadId)).toBe(false);
    expect(storageState.uploads.size).toBe(0);
    expect(storageState.photos.size).toBe(1);
    expect(await db.select().from(favoriChatPhotoUploadsTable)).toEqual([]);
    expect((await request(makeApp()).get(sent.body.mediaUrl).set("x-test-user", "bob")).status).toBe(200);
  });

  it("sweeps a PUT that finishes after its cleanup ledger was removed", async () => {
    const upload = await reservePhoto();
    const uploadId = upload.body.uploadId;
    // Cleanup removes the ledger, but the storage request is still in flight.
    const firstSweep = Date.now() + 20 * 60_000;
    await cleanupChatPhotos(new Date(firstSweep));
    expect(await db.select().from(favoriChatPhotoUploadsTable)).toEqual([]);
    expect(storageState.uploads.size).toBe(0);
    // The late completion creates a new object without a ledger row.
    storageState.uploads.set(uploadId, { bytes: photoBytes, contentType: "image/png", createdAt: firstSweep + 1 });
    await cleanupChatPhotos(new Date(firstSweep + 5 * 60_000));
    expect(storageState.uploads.has(uploadId)).toBe(true);
    await cleanupChatPhotos(new Date(firstSweep + 16 * 60_000));
    expect(storageState.uploads.size).toBe(0);
  });

  it("supplies the validated size and MIME type to the storage-boundary upload session", async () => {
    const response = await reservePhoto();
    expect(response.status).toBe(200);
    expect(chatPhotoStorage.requestUpload).toHaveBeenCalledWith(response.body.uploadId, photoBytes.length, "image/png", undefined);
  });

  it("cleans a saved file when the database insert fails", async () => {
    const upload = await reservePhoto();
    await failRoomInserts();
    expect((await send("alice", "general", { kind: "image", body: "", uploadId: upload.body.uploadId })).status).toBe(503);
    expect(chatPhotoStorage.savePhoto).toHaveBeenCalledOnce();
    expect(storageState.photos.size).toBe(0);
    expect(storageState.uploads.size).toBe(0);
    expect(await db.select().from(favoriRoomMessagesTable)).toEqual([]);
  });

  it("protects upload and cancellation endpoints from guests and blocked users", async () => {
    expect((await request(app).post("/api/chat/rooms/general/photos").send({ size: 42, contentType: "image/png" })).status).toBe(401);
    expect((await request(app).delete("/api/chat/photos/unknown")).status).toBe(401);
    await db.update(favoriProfilesTable).set({ isBlocked: true }).where(eq(favoriProfilesTable.id, "alice"));
    expect((await reservePhoto()).status).toBe(403);
    expect(chatPhotoStorage.requestUpload).not.toHaveBeenCalled();
  });
});

describe("private message and admin access boundaries", () => {
  it.each([["bob", "alice"], ["alice", "bob"]])(
    "marks only messages received by signed-in %s from selected sender %s",
    async (recipientId, senderId) => {
      const fixtures = [
        { id: "selected-first", senderId, recipientId },
        { id: "selected-second", senderId, recipientId },
        { id: "reverse-direction", senderId: recipientId, recipientId: senderId },
        { id: "different-sender", senderId: "admin", recipientId },
        { id: "different-recipient", senderId, recipientId: "admin" },
        { id: "unrelated-conversation", senderId: "admin", recipientId: senderId },
        { id: "already-read", senderId: "admin", recipientId, isRead: true },
      ];
      await db.insert(favoriMessagesTable).values(fixtures.map((message) => ({
        senderName: `Reader ${message.senderId}`, body: message.id, ...message,
      })));
      const before = await db.select().from(favoriMessagesTable).orderBy(favoriMessagesTable.id);

      const result = await request(app).post("/api/messages/read").set("x-test-user", recipientId)
        // The recipient comes from auth, never an identity supplied by the caller.
        .send({ profileId: senderId, recipientId: "admin" });
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ active: true, count: 2, value: 2 });
      const expected = before.map((message) => ({
        ...message,
        isRead: message.senderId === senderId && message.recipientId === recipientId ? true : message.isRead,
      }));
      expect(await db.select().from(favoriMessagesTable).orderBy(favoriMessagesTable.id)).toEqual(expected);

      // A fresh reader sees the persisted state, not a client-side read flag.
      const inbox = await request(makeApp()).get("/api/messages").set("x-test-user", recipientId);
      expect(inbox.status).toBe(200);
      const visible = expected.filter((message) => message.recipientId === recipientId || message.senderId === recipientId);
      expect(inbox.body).toHaveLength(visible.length);
      expect(inbox.body).toEqual(expect.arrayContaining(visible.map(({ id, isRead }) => expect.objectContaining({ id, isRead }))));
    },
  );

  it("rejects guest and invalid read requests without changing any private message", async () => {
    await db.insert(favoriMessagesTable).values([
      { id: "alice-to-bob", senderId: "alice", recipientId: "bob", senderName: "Reader alice", body: "Unread" },
      { id: "alice-to-admin", senderId: "alice", recipientId: "admin", senderName: "Reader alice", body: "Also unread" },
    ]);
    const before = await db.select().from(favoriMessagesTable).orderBy(favoriMessagesTable.id);
    expect((await request(app).post("/api/messages/read").send({ profileId: "alice" })).status).toBe(401);
    expect(await db.select().from(favoriMessagesTable).orderBy(favoriMessagesTable.id)).toEqual(before);
    const invalid = await request(app).post("/api/messages/read").set("x-test-user", "bob").send({});
    expect(invalid.status).toBe(400);
    expect(await db.select().from(favoriMessagesTable).orderBy(favoriMessagesTable.id)).toEqual(before);
  });

  it.each([["alice", "bob"], ["bob", "alice"]])("prevents either direction after %s blocks %s and restores sending after unblock", async (blocker, blocked) => {
    const result = await request(app).put(`/api/chat/blocks/${blocked}`).set("x-test-user", blocker).send({ blocked: true });
    expect(result.status).toBe(200);
    expect(await db.select().from(afilliUserBlocksTable)).toHaveLength(1);
    for (const [sender, recipient] of [["alice", "bob"], ["bob", "alice"]]) {
      for (const address of [recipient, `@${recipient}`]) {
        const response = await request(app).post("/api/messages").set("x-test-user", sender).send({ recipient: address, body: "Merhaba" });
        expect(response.status).toBe(403);
      }
    }
    expect(await db.select().from(favoriMessagesTable)).toEqual([]);
    expect((await request(app).put(`/api/chat/blocks/${blocked}`).set("x-test-user", blocker).send({ blocked: false })).status).toBe(200);
    const allowed = await request(app).post("/api/messages").set("x-test-user", "alice").send({ recipient: "@bob", body: "Merhaba 📚" });
    expect(allowed.status).toBe(201);
    const inbox = await request(makeApp()).get("/api/messages").set("x-test-user", "bob");
    expect(inbox.body).toEqual([expect.objectContaining({ id: allowed.body.id, body: "Merhaba 📚", senderId: "alice", recipientId: "bob" })]);
  });

  it.each(["alice", "bob"])("globally blocked %s cannot send or receive private messages", async (blocked) => {
    const result = await request(app).patch(`/api/chat/admin/users/${blocked}`).set("x-test-user", "admin").send({ blocked: true });
    expect(result.status).toBe(200);
    for (const [sender, recipient] of [["alice", "bob"], ["bob", "alice"]]) {
      expect((await request(app).post("/api/messages").set("x-test-user", sender).send({ recipient, body: "No" })).status).toBe(403);
    }
    expect(await db.select().from(favoriMessagesTable)).toEqual([]);
  });

  const adminRoutes = [
    { method: "get" as const, path: "/chat/admin/users", body: undefined },
    { method: "patch" as const, path: "/chat/admin/users/bob", body: { blocked: true } },
    { method: "patch" as const, path: "/chat/admin/rooms/general", body: { allowGifs: false } },
    { method: "post" as const, path: "/chat/admin/gifs", body: { items: [{ url: "https://example.com/test.gif", category: "Test" }] } },
    { method: "delete" as const, path: "/chat/admin/gifs/unknown", body: undefined },
  ];
  it.each(adminRoutes)("denies ordinary readers and guests: $method $path", async ({ method, path, body }) => {
    const normal = await request(app)[method](`/api${path}`).set("x-test-user", "alice").send(body);
    expect(normal.status).toBe(403);
    const guest = await request(app)[method](`/api${path}`).send(body);
    expect(guest.status).toBe(401);
    const admin = await request(app)[method](`/api${path}`).set("x-test-user", "admin").send(body);
    expect(admin.status).toBe(method === "delete" ? 404 : method === "post" ? 201 : 200);
  });

  it("requires sign-in for room, bootstrap and private-message routes", async () => {
    for (const path of ["/chat/bootstrap", "/chat/rooms/general/messages", "/messages"]) {
      expect((await request(app).get(`/api${path}`)).status).toBe(401);
    }
    expect((await request(app).post("/api/chat/rooms/general/messages").send({ body: "No" })).status).toBe(401);
    expect((await request(app).post("/api/messages").send({ recipient: "bob", body: "No" })).status).toBe(401);
  });
});
