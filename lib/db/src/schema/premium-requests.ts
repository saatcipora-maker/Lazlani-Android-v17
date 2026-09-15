import { createInsertSchema } from "drizzle-zod";
import { integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { authUsersTable } from "./auth";

export const premiumRequestStatuses = ["pending", "approved", "rejected"] as const;
export type PremiumRequestStatus = (typeof premiumRequestStatuses)[number];
export const premiumRequestStatusEnum = pgEnum("premium_request_status", premiumRequestStatuses);

export const premiumRequestsTable = pgTable(
  "premium_requests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => authUsersTable.id, { onDelete: "cascade" }),
    price: integer("price").notNull(),
    currency: text("currency").notNull().default("TRY"),
    status: premiumRequestStatusEnum("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by").references(() => authUsersTable.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    onePendingRequestPerUser: uniqueIndex("premium_requests_one_pending_per_user")
      .on(table.userId)
      .where(sql`${table.status} = 'pending'`),
  }),
);

export const insertPremiumRequestSchema = createInsertSchema(premiumRequestsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertPremiumRequest = z.infer<typeof insertPremiumRequestSchema>;
export type PremiumRequest = typeof premiumRequestsTable.$inferSelect;