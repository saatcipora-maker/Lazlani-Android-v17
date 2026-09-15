import { createInsertSchema } from "drizzle-zod";
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const authUsersTable = pgTable("auth_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  bio: text("bio").notNull().default(""),
  avatarColor: text("avatar_color").notNull().default("#9B59F5"),
  coverColor: text("cover_color").notNull().default("#4C1D95"),
  avatarUrl: text("avatar_url"),
  coverUrl: text("cover_url"),
  theme: text("theme"),
  joinedAt: text("joined_at").notNull(),
  isPremium: boolean("is_premium").notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authSessionsTable = pgTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  id: uuid("id").notNull().unique(),
  userId: text("user_id").notNull().references(() => authUsersTable.id, { onDelete: "cascade" }),
  credentialUpdatedAt: timestamp("credential_updated_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  userAgent: text("user_agent"),
});

export const insertAuthUserSchema = createInsertSchema(authUsersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertAuthSessionSchema = createInsertSchema(authSessionsTable).omit({
  createdAt: true,
});

export type InsertAuthUser = z.infer<typeof insertAuthUserSchema>;
export type AuthUser = typeof authUsersTable.$inferSelect;
export type InsertAuthSession = z.infer<typeof insertAuthSessionSchema>;
export type AuthSession = typeof authSessionsTable.$inferSelect;