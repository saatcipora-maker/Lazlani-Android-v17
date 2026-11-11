import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A durable, atomic claim must commit BEFORE any Shopify write. Never expire or
// remove unfinished claims automatically: a timed-out write may have succeeded.
export const storeProductAttemptsTable = pgTable("store_product_attempts", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  stage: text("stage").notNull(),
  productId: text("product_id"),
  response: jsonb("response").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertStoreProductAttemptSchema = createInsertSchema(storeProductAttemptsTable);
export type InsertStoreProductAttempt = z.infer<typeof insertStoreProductAttemptSchema>;
export type StoreProductAttempt = typeof storeProductAttemptsTable.$inferSelect;
