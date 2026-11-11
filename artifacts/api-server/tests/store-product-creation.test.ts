import express from "express";
import pinoHttp from "pino-http";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

vi.mock("@workspace/db", async () => ({
  ...await import("../../../lib/db/src/schema"),
  ...await import("../../../lib/db/tests/isolated-chat-db"),
}));
vi.mock("@clerk/express", () => ({
  getAuth: (req: express.Request) => ({ userId: req.headers["x-test-user"] ?? null }),
  clerkClient: { users: { getUser: vi.fn(() => { throw new Error("Unexpected identity lookup"); }) } },
}));
// Mock only the transport; use the real mutation userErrors checker.
vi.mock("../src/lib/shopifyAdmin", async (original) => ({
  ...await original<typeof import("../src/lib/shopifyAdmin")>(),
  shopifyAdminGraphql: vi.fn(),
}));
vi.mock("../src/lib/shopifyStorefrontClient", () => ({
  createCheckoutUrl: vi.fn(() => { throw new Error("Real checkout forbidden"); }),
  shopifyStorefrontRequest: vi.fn(() => { throw new Error("Real Shopify forbidden"); }),
}));

import router from "../src/routes/favori";
import { shopifyAdminGraphql } from "../src/lib/shopifyAdmin";
import { db, favoriProfilesTable, favoriShopImagesTable, storeProductAttemptsTable } from "@workspace/db";
import { setupDatabase, resetDatabase, closeDatabase } from "../../../lib/db/tests/isolated-chat-db";

const app = express();
app.use(pinoHttp({ enabled: false }));
app.use(express.json());
app.use("/api", router);
const input = { title: "Kitap", description: "<okuma>", price: 125.5, quantity: 3, category: "Kitap" };
const productId = "gid://shopify/Product/101";
const transport = vi.mocked(shopifyAdminGraphql);
const steps = [
  ["create", "FavoriProductCreate", "productCreate"],
  ["details", "FavoriProductSetup", null],
  ["price", "FavoriPriceUpdate", "productVariantsBulkUpdate"],
  ["tracking", "FavoriInventoryTracking", "inventoryItemUpdate"],
  ["inventoryActivation", "FavoriInventoryActivate", "inventoryActivate"],
  ["quantity", "FavoriInventoryQuantity", "inventorySetQuantities"],
  ["activation", "FavoriProductActivate", "productUpdate"],
  ["publication", "FavoriPublish", "publishablePublish"],
] as const;
let failOperation: string | undefined;
let failureMode: "transport" | "userErrors" = "transport";
let publicationName = "Replit";
let missingVariant = false;
let missingLocation = false;
let missingProduct = false;

function post(user = "owner", body: object = input) {
  return request(app).post("/api/store/products").set("x-test-user", user).send(body);
}
function operations() {
  return transport.mock.calls.map(([query]) => steps.find(([, name]) => query.includes(name))?.[0]);
}
function fakeShopify(query: string) {
  const step = steps.find(([, name]) => query.includes(name));
  if (!step) throw new Error(`Unexpected Shopify call: ${query}`);
  if (step[1] === failOperation && failureMode === "transport") {
    // The remote mutation MAY already have committed before this timeout.
    throw new Error("Simulated Shopify timeout");
  }
  if (step[0] === "details") return {
    product: { variants: { nodes: missingVariant ? [] : [{ id: "variant-101", inventoryItem: { id: "inventory-101" } }] } },
    locations: { nodes: missingLocation ? [] : [{ id: "location-1" }] },
    publications: { nodes: publicationName ? [{ id: "publication-1", name: publicationName }] : [] },
    shop: { currencyCode: "TRY" },
  };
  return { [step[2]!]: {
    userErrors: step[1] === failOperation ? [{ message: "Simulated Shopify user error" }] : [],
    ...(step[0] === "create" ? { product: missingProduct ? null : { id: productId } } : {}),
  } };
}

beforeAll(async () => {
  vi.stubEnv("FAVORI_SHOP_OWNER_USER_ID", "owner");
  await setupDatabase();
});
afterAll(async () => {
  await closeDatabase();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await db.execute(sql`DROP TRIGGER IF EXISTS store_mapping_failure ON favori_shop_images`);
  await db.execute(sql`DROP TRIGGER IF EXISTS store_checkpoint_failure ON store_product_attempts`);
  await resetDatabase();
  await db.insert(favoriProfilesTable).values(
    ["owner", "reader"].map((id) => ({ id, handle: id, name: id })),
  );
  transport.mockReset();
  transport.mockImplementation(async (query) => fakeShopify(query));
  failOperation = undefined;
  failureMode = "transport";
  publicationName = "Replit";
  missingVariant = missingLocation = missingProduct = false;
});

describe("durable store creation recovery without real Shopify writes", () => {
  it.each(steps)("stops at %s on an ambiguous transport failure and refuses duplicate retries", async (stage, operation) => {
    failOperation = operation;
    const failed = await post();
    expect(failed.status).toBe(502);
    expect(failed.body).toMatchObject({
      stage, recoveryRequired: true, productId: stage === "create" ? null : productId,
      visibility: stage === "publication" ? "unknown" : "not_published_by_this_operation",
    });
    expect(failed.body.error).toContain("Shopify yönetiminde");
    expect(failed.body.error).toContain("bilgileri değiştirerek denemeyin");
    const calls = transport.mock.calls.length;
    failOperation = undefined;
    const retry = await post();
    expect(retry.status).toBe(409);
    expect(retry.body.operationId).toBe(failed.body.operationId);
    expect(retry.body.stage).toBe(stage);
    expect(transport).toHaveBeenCalledTimes(calls);
    expect(operations().filter((item) => item === "create")).toHaveLength(1);
    if (stage !== "publication") expect(operations()).not.toContain("publication");
  });

  it.each(steps.filter((step) => step[2]))("stops at %s on mutation userErrors", async (stage, operation) => {
    failOperation = operation;
    failureMode = "userErrors";
    const failed = await post();
    expect(failed.status).toBe(502);
    expect(failed.body.stage).toBe(stage);
    expect(failed.body.error).toContain("Simulated Shopify user error");
    const count = transport.mock.calls.length;
    expect((await post()).status).toBe(409);
    expect(transport).toHaveBeenCalledTimes(count);
    expect(operations().at(-1)).toBe(stage);
  });

  it("sets up a draft, saves mapping before activation/publication, and replays success after a lost response", async () => {
    transport.mockImplementation(async (query) => {
      if (query.includes("FavoriProductActivate") || query.includes("FavoriPublish")) {
        expect(await db.select().from(favoriShopImagesTable)).toHaveLength(1);
      }
      return fakeShopify(query);
    });
    const created = await post();
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ id: productId, currency: "TRY", price: 125.5, availableForSale: true });
    expect(transport.mock.calls[0][1]).toMatchObject({
      product: { status: "DRAFT", descriptionHtml: "<p>&lt;okuma&gt;</p>", handle: `afilli-${(await db.select().from(storeProductAttemptsTable))[0].id}` },
    });
    expect(operations()).toEqual(steps.map(([stage]) => stage));
    const count = transport.mock.calls.length;
    // Normalized input gives the same claim despite JSON property order / null image.
    const replay = await post("owner", { imageUrl: null, ...input });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(created.body);
    expect(transport).toHaveBeenCalledTimes(count);
  });

  it("serializes concurrent identical requests with a database claim, not an in-memory lock", async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    transport.mockImplementation(async (query) => {
      if (query.includes("FavoriProductCreate")) { entered(); await gate; }
      return fakeShopify(query);
    });
    const first = post().then((response) => response);
    await started;
    try {
      const duplicates = await Promise.all(Array.from({ length: 8 }, () => post()));
      expect(duplicates.every((response) => response.status === 409)).toBe(true);
      expect(operations()).toEqual(["create"]);
    } finally { release(); }
    expect((await first).status).toBe(201);
    expect(operations().filter((stage) => stage === "create")).toHaveLength(1);
  });

  it("keeps the product unpublished when local mapping fails", async () => {
    await db.execute(sql`CREATE FUNCTION fail_store_mapping() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'mapping unavailable'; END $$`);
    await db.execute(sql`CREATE TRIGGER store_mapping_failure BEFORE INSERT ON favori_shop_images
      FOR EACH ROW EXECUTE FUNCTION fail_store_mapping()`);
    const failed = await post();
    expect(failed.status).toBe(502);
    expect(failed.body).toMatchObject({ stage: "mapping", productId });
    expect(operations()).not.toContain("activation");
    expect(operations()).not.toContain("publication");
    const count = transport.mock.calls.length;
    expect((await post()).status).toBe(409);
    expect(transport).toHaveBeenCalledTimes(count);
  });

  it.each(["create", "details", "price", "tracking", "inventoryActivation", "quantity", "mapping", "activation", "publication", "completion", "completed"])(
    "does not repeat external writes when saving checkpoint %s fails", async (stage) => {
      await db.execute(sql`CREATE OR REPLACE FUNCTION fail_store_checkpoint() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.stage = ${sql.raw(`'${stage}'`)} THEN RAISE EXCEPTION 'checkpoint unavailable'; END IF; RETURN NEW; END $$`);
      await db.execute(sql`CREATE TRIGGER store_checkpoint_failure BEFORE INSERT OR UPDATE ON store_product_attempts
        FOR EACH ROW EXECUTE FUNCTION fail_store_checkpoint()`);
      const failed = await post();
      expect(failed.status).toBe(502);
      const calls = transport.mock.calls.length;
      const retry = await post();
      expect([409, 502]).toContain(retry.status);
      expect(transport).toHaveBeenCalledTimes(calls);
      expect(operations().filter((item) => item === "create").length).toBeLessThanOrEqual(1);
      if (stage === "create") expect(transport).not.toHaveBeenCalled();
      if (["completion", "completed"].includes(stage)) {
        expect(failed.body.visibility).toBe("unknown");
        expect(retry.body.visibility).toBe("unknown");
      }
    },
  );

  it("blocks an abandoned durable claim after a process restart", async () => {
    failOperation = "FavoriProductCreate";
    const failed = await post();
    transport.mockClear(); // Discard all process-local history; only the DB remains.
    const retry = await post();
    expect(retry.status).toBe(409);
    expect(retry.body.operationId).toBe(failed.body.operationId);
    expect(transport).not.toHaveBeenCalled();
  });

  it.each(["no-channel", "online-store-only", "no-variant", "no-location", "no-product"])(
    "requires manual recovery for %s instead of reporting a published success", async (missing) => {
      if (missing === "no-channel") publicationName = "";
      if (missing === "online-store-only") publicationName = "Online Store";
      missingVariant = missing === "no-variant";
      missingLocation = missing === "no-location";
      missingProduct = missing === "no-product";
      expect((await post()).status).toBe(502);
      expect(operations()).not.toContain("publication");
      const count = transport.mock.calls.length;
      expect((await post()).status).toBe(409);
      expect(transport).toHaveBeenCalledTimes(count);
    },
  );

  it("keeps authorization and validation ahead of all claims, including cached success", async () => {
    expect((await request(app).post("/api/store/products").send(input)).status).toBe(401);
    expect((await post("reader")).status).toBe(403);
    expect((await post("owner", { ...input, price: -1 })).status).toBe(400);
    expect(await db.select().from(storeProductAttemptsTable)).toHaveLength(0);
    expect(transport).not.toHaveBeenCalled();
    expect((await post()).status).toBe(201);
    const calls = transport.mock.calls.length;
    await db.update(favoriProfilesTable).set({ isBlocked: true }).where(eq(favoriProfilesTable.id, "owner"));
    expect((await post()).status).toBe(403);
    expect(transport).toHaveBeenCalledTimes(calls);
  });
});
