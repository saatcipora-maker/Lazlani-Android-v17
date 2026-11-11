import { ReplitConnectors } from "@replit/connectors-sdk";

type ShopifyAdminEnvelope<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

const connectors = new ReplitConnectors();
const ADMIN_GRAPHQL_PATH = "/admin/api/2026-04/graphql.json";

export async function shopifyAdminGraphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await connectors.proxy(
    "shopify-store",
    ADMIN_GRAPHQL_PATH,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    },
  );
  const payload = (await response.json()) as ShopifyAdminEnvelope<T>;
  const topLevelError = payload.errors?.find((error) => error.message);

  if (!response.ok || topLevelError) {
    throw new Error(
      topLevelError?.message ?? `Shopify request failed (${response.status})`,
    );
  }
  if (!payload.data) {
    throw new Error("Shopify returned an empty response.");
  }
  return payload.data;
}

export function throwShopifyUserErrors(
  errors: Array<{ message: string }> | undefined,
): void {
  const firstError = errors?.[0];
  if (firstError) {
    throw new Error(firstError.message);
  }
}
