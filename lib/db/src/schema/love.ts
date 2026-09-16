import { boolean, index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const loveConversationsTable = pgTable("love_conversations", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull().default("dm"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  lastMessageId: text("last_message_id"),
}, table => ({ kindUpdated: index("love_conversations_kind_updated_idx").on(table.kind, table.updatedAt) }));

export const loveConversationMembersTable = pgTable("love_conversation_members", {
  conversationId: text("conversation_id").notNull().references(() => loveConversationsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  role: text("role").notNull().default("member"),
  lastReadMessageId: text("last_read_message_id"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  leftAt: timestamp("left_at", { withTimezone: true }),
}, table => ({
  membership: unique("love_conversation_membership_key").on(table.conversationId, table.userId),
  userLookup: index("love_conversation_members_user_idx").on(table.userId, table.leftAt),
}));

export const loveMessagesTable = pgTable("love_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => loveConversationsTable.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull(),
  clientMessageId: text("client_message_id").notNull(),
  body: text("body"),
  mediaObjectPath: text("media_object_path"),
  mediaType: text("media_type"),
  version: integer("version").notNull().default(1),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  clientIdentity: unique("love_messages_sender_conversation_client_key").on(
    table.senderId, table.conversationId, table.clientMessageId,
  ),
  conversationOrder: index("love_messages_conversation_order_idx").on(table.conversationId, table.createdAt, table.id),
}));

export const loveMessageReactionsTable = pgTable("love_message_reactions", {
  messageId: text("message_id").notNull().references(() => loveMessagesTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  reaction: text("reaction").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({ uniqueReaction: unique("love_message_reaction_key").on(table.messageId, table.userId, table.reaction) }));

export const lovePresenceTable = pgTable("love_presence", {
  userId: text("user_id").primaryKey(),
  status: text("status").notNull().default("online"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loveBlocksTable = pgTable("love_blocks", {
  blockerId: text("blocker_id").notNull(),
  blockedId: text("blocked_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({ blockKey: unique("love_block_key").on(table.blockerId, table.blockedId) }));

export const loveReportsTable = pgTable("love_reports", {
  id: text("id").primaryKey(),
  reporterId: text("reporter_id").notNull(),
  messageId: text("message_id"),
  reportedUserId: text("reported_user_id"),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({ statusCreated: index("love_reports_status_created_idx").on(table.status, table.createdAt) }));

export const loveAuditTable = pgTable("love_audit", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  targetId: text("target_id"),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loveSettingsTable = pgTable("love_settings", {
  userId: text("user_id").primaryKey(),
  notifications: boolean("notifications").notNull().default(true),
  sound: boolean("sound").notNull().default(true),
  vibration: boolean("vibration").notNull().default(true),
  theme: text("theme").notNull().default("rose"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLoveMessageSchema = createInsertSchema(loveMessagesTable);
export type LoveMessage = typeof loveMessagesTable.$inferSelect;