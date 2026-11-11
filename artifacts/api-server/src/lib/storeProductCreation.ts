import { createHash } from "node:crypto";
import { db, favoriShopImagesTable, storeProductAttemptsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateStoreProductBody, CreateStoreProductResponse, type StoreProductRecovery } from "@workspace/api-zod";
import { shopifyAdminGraphql, throwShopifyUserErrors } from "./shopifyAdmin";

const stages = {
  claim: "işlem kaydı",
  create: "taslak ürün oluşturma",
  details: "varyant, konum ve yayın kanalı sorgulama",
  price: "fiyat belirleme",
  tracking: "stok takibi",
  inventoryActivation: "stok konumunu etkinleştirme",
  quantity: "stok miktarı",
  mapping: "yerel ürün eşlemesi",
  activation: "ürünü etkinleştirme",
  publication: "yayınlama",
  completion: "sonucu kaydetme",
};
type Stage = keyof typeof stages;
type Input = ReturnType<typeof CreateStoreProductBody.parse>;
type UserErrors = { userErrors: Array<{ message: string }> };

export class StoreProductCreationError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: StoreProductRecovery,
  ) {
    super(body.error);
  }
}

function recoveryError(
  status: number, id: string, stage: string, productId: string | null, cause?: unknown,
) {
  const label = stages[stage as Stage] ?? stage;
  const visibility = ["publication", "completion"].includes(stage) ? "unknown" : "not_published_by_this_operation";
  const reference = productId ?? `afilli-${id}`;
  // Database errors can contain SQL parameters (including the uploaded image).
  // Keep those in server logs, not in the owner's recovery message.
  const causeText = cause instanceof Error && !cause.message.includes("Failed query:")
    ? ` ${cause.message}` : "";
  return new StoreProductCreationError(status, {
    error: `Ürün ekleme durdu: ${label}.${causeText} Yeni ürün oluşturulmadığından emin olmadan tekrar eklemeyin veya bilgileri değiştirerek denemeyin. Shopify yönetiminde ${reference} kaydını kontrol edip mevcut ürünü oradan tamamlayın; bulamazsanız işlem referansı ${id} ile destek isteyin. Otomatik yeniden oluşturma, yayınlama veya silme yapılmayacak.${visibility === "unknown" ? " Yayınlama sonucu belirsiz; ürün görünür olabilir." : ""}`,
    stage, operationId: id, productId, recoveryRequired: true, visibility,
  });
}

/**
 * Explicit recovery, not a distributed transaction: identical validated input
 * shares one durable claim. Failed/in-flight/ambiguous attempts never repeat
 * writes, even after a restart. Completed attempts replay the saved response.
 * Changing input represents a different operation; the error warns against it.
 */
export async function createStoreProduct(ownerId: string, input: Input) {
  // Fixed property order makes JSON key ordering and omitted/null images irrelevant.
  const normalized = {
    title: input.title, description: input.description, category: input.category,
    price: input.price, quantity: input.quantity, imageUrl: input.imageUrl ?? null,
  };
  const id = createHash("sha256").update(JSON.stringify([ownerId, normalized])).digest("hex");
  let stage: Stage = "claim";
  let productId: string | null = null;
  // This is deliberately outside any transaction that wraps Shopify I/O.
  // If persisting the claim fails, no external request is permitted.
  try {
    const [claim] = await db.insert(storeProductAttemptsTable)
      .values({ id, ownerId, stage: "create" }).onConflictDoNothing().returning();
    if (!claim) {
      const [existing] = await db.select().from(storeProductAttemptsTable)
        .where(eq(storeProductAttemptsTable.id, id)).limit(1);
      if (existing?.response) {
        return CreateStoreProductResponse.parse({ ...existing.response, imageUrl: normalized.imageUrl });
      }
      throw recoveryError(409, id, existing?.stage ?? "claim", existing?.productId ?? null);
    }
    stage = "create";
    const advance = async (next: Stage) => {
      // Save the NEXT stage before the side effect. A process death or failed
      // checkpoint therefore remains recoverable and must never unlock a retry.
      stage = next;
      await db.update(storeProductAttemptsTable).set({ stage, productId })
        .where(eq(storeProductAttemptsTable.id, id));
    };
    const created = await shopifyAdminGraphql<{
      productCreate: UserErrors & { product: { id: string } | null };
    }>(`mutation FavoriProductCreate($product: ProductCreateInput!) {
      productCreate(product: $product) { product { id } userErrors { field message } }
    }`, { product: {
      title: input.title,
      handle: `afilli-${id}`,
      descriptionHtml: `<p>${escapeHtml(input.description)}</p>`,
      productType: input.category,
      status: "DRAFT",
    } });
    throwShopifyUserErrors(created.productCreate.userErrors);
    productId = created.productCreate.product?.id ?? null;
    if (!productId) throw new Error("Shopify ürün kimliği dönmedi; oluşturma sonucu belirsiz.");

    await advance("details");
    const details = await shopifyAdminGraphql<{
      product: { variants: { nodes: Array<{ id: string; inventoryItem: { id: string } }> } } | null;
      locations: { nodes: Array<{ id: string }> };
      publications: { nodes: Array<{ id: string; name: string }> };
      shop: { currencyCode: string };
    }>(`query FavoriProductSetup($productId: ID!) {
      product(id: $productId) {
        variants(first: 20) { nodes { id inventoryItem { id } } }
      }
      locations(first: 1) { nodes { id } }
      publications(first: 20) { nodes { id name } }
      shop { currencyCode }
    }`, { productId });
    const variant = details.product?.variants.nodes[0];
    const location = details.locations.nodes[0];
    if (!variant || !location) throw new Error("Shopify varyantı veya stok konumu bulunamadı.");
    // Do not silently publish to an unrelated live-store channel.
    const publication = details.publications.nodes.find((item) => item.name.toLowerCase().includes("replit"));
    if (!publication) throw new Error("Replit satış kanalı bulunamadı; ürün taslak bırakıldı.");

    await advance("price");
    const priced = await shopifyAdminGraphql<{ productVariantsBulkUpdate: UserErrors }>(
      `mutation FavoriPriceUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
      }`, { productId, variants: [{ id: variant.id, price: input.price.toFixed(2) }] });
    throwShopifyUserErrors(priced.productVariantsBulkUpdate.userErrors);

    await advance("tracking");
    const tracked = await shopifyAdminGraphql<{ inventoryItemUpdate: UserErrors }>(
      `mutation FavoriInventoryTracking($id: ID!, $input: InventoryItemInput!) {
        inventoryItemUpdate(id: $id, input: $input) { userErrors { field message } }
      }`, { id: variant.inventoryItem.id, input: { tracked: true } });
    throwShopifyUserErrors(tracked.inventoryItemUpdate.userErrors);

    await advance("inventoryActivation");
    const activated = await shopifyAdminGraphql<{ inventoryActivate: UserErrors }>(
      `mutation FavoriInventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
        inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) { userErrors { field message } }
      }`, { inventoryItemId: variant.inventoryItem.id, locationId: location.id });
    throwShopifyUserErrors(activated.inventoryActivate.userErrors);

    await advance("quantity");
    const stocked = await shopifyAdminGraphql<{ inventorySetQuantities: UserErrors }>(
      `mutation FavoriInventoryQuantity($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) { userErrors { field message } }
      }`, { input: {
        name: "available", reason: "correction",
        quantities: [{ inventoryItemId: variant.inventoryItem.id, locationId: location.id, quantity: input.quantity }],
      } });
    throwShopifyUserErrors(stocked.inventorySetQuantities.userErrors);

    await advance("mapping");
    await db.insert(favoriShopImagesTable).values({
      shopifyProductId: productId, imageData: input.imageUrl ?? null, category: input.category,
    }).onConflictDoUpdate({
      target: favoriShopImagesTable.shopifyProductId,
      set: { imageData: input.imageUrl ?? null, category: input.category },
    });
    // Validate the final response before any publication side effect.
    const response = CreateStoreProductResponse.parse({
      id: productId, title: input.title, description: input.description,
      imageUrl: input.imageUrl ?? null, price: input.price, category: input.category,
      currency: details.shop.currencyCode, variantId: variant.id, availableForSale: input.quantity > 0,
    });

    await advance("activation");
    const active = await shopifyAdminGraphql<{ productUpdate: UserErrors }>(
      `mutation FavoriProductActivate($product: ProductUpdateInput!) {
        productUpdate(product: $product) { userErrors { field message } }
      }`, { product: { id: productId, status: "ACTIVE" } });
    throwShopifyUserErrors(active.productUpdate.userErrors);

    await advance("publication");
    const published = await shopifyAdminGraphql<{ publishablePublish: UserErrors }>(
      `mutation FavoriPublish($productId: ID!, $publicationId: ID!) {
        publishablePublish(id: $productId, input: [{ publicationId: $publicationId }]) { userErrors { field message } }
      }`, { productId, publicationId: publication.id });
    throwShopifyUserErrors(published.publishablePublish.userErrors);

    await advance("completion");
    // The hash already binds the submitted image. Do not duplicate potentially
    // large legacy data URLs in the journal; replay uses that same validated input.
    await db.update(storeProductAttemptsTable).set({ stage: "completed", response: { ...response, imageUrl: null } })
      .where(eq(storeProductAttemptsTable.id, id));
    return response;
  } catch (error) {
    if (error instanceof StoreProductCreationError) throw error;
    // Keep the claim even when recording an error would itself fail.
    throw recoveryError(502, id, stage, productId, error);
  }
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
