import { boolean, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const afilliMediaTable = pgTable("afilli_media", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  // "cancelled" revokes publishing while retaining the cleanup ledger.
  purpose: text("purpose").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  objectPath: text("object_path").notNull(),
  ready: boolean("ready").notNull().default(false),
  // Display hint only; cleanup must query actual content references.
  linked: boolean("linked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const afilliStoriesTable = pgTable("afilli_stories", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull(),
  body: text("body").notNull().default(""),
  mediaId: text("media_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const afilliVideosTable = pgTable("afilli_videos", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  mediaId: text("media_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const afilliContentViewsTable = pgTable("afilli_content_views", {
  userId: text("user_id").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.targetType, table.targetId] })]);
