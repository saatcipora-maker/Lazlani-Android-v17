import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  jsonb,
  index,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const syncEntityTypes = [
  "message",
  "post",
  "notification",
  "comment",
  "reply",
  "ozel_comment",
  "ozel_reply",
  "ozel_video",
  "like",
  "reaction",
  "vote",
  "book",
  "reading",
] as const;
export type SyncEntityType = (typeof syncEntityTypes)[number];
export const syncEntityTypeEnum = pgEnum("sync_entity_type", syncEntityTypes);

export const syncOperationTypes = [
  "create_message",
  "delete_message",
  "create_notification",
  "create_comment",
  "delete_comment",
  "create_reply",
  "create_ozel_comment",
  "create_ozel_reply",
  "upsert_ozel_video",
  "toggle_like",
  "set_reaction",
  "toggle_vote",
  "create_book",
  "update_book",
  "delete_book",
  "create_post",
  "update_post",
  "delete_post",
  "start_reading",
] as const;
export type SyncOperationType = (typeof syncOperationTypes)[number];
export const syncOperationTypeEnum = pgEnum("sync_operation_type", syncOperationTypes);

export const syncInteractionTypes = ["like", "reaction", "vote", "reading"] as const;
export type SyncInteractionType = (typeof syncInteractionTypes)[number];
export const syncInteractionTypeEnum = pgEnum("sync_interaction_type", syncInteractionTypes);

/**
 * The materialized, latest version of every synchronizable record. Public
 * records have an empty audience list; private records list every user that
 * may read the record (normally the sender and recipient).
 */
export const syncRecordsTable = pgTable(
  "sync_records",
  {
    id: text("id").primaryKey(),
    entityType: syncEntityTypeEnum("entity_type").notNull(),
    ownerUserId: text("owner_user_id"),
    isPublic: boolean("is_public").notNull().default(false),
    audienceUserIds: text("audience_user_ids").array().notNull().default([]),
    payload: jsonb("payload").notNull(),
    parentId: text("parent_id"),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    entityIdentity: unique("sync_records_entity_identity").on(table.entityType, table.id),
    parentLookup: index("sync_records_parent_lookup").on(table.entityType, table.parentId, table.deletedAt),
  }),
);

/** Append-only event log used by snapshot cursors and SSE replay. */
export const syncEventsTable = pgTable("sync_events", {
  id: serial("id").primaryKey(),
  entityType: syncEntityTypeEnum("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  isPublic: boolean("is_public").notNull().default(false),
  audienceUserIds: text("audience_user_ids").array(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A client operation is immutable after it is committed. The unique
 * user/client key makes retries return the original canonical result.
 */
export const syncOperationsTable = pgTable(
  "sync_operations",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    clientOperationId: text("client_operation_id").notNull(),
    operationType: syncOperationTypeEnum("operation_type").notNull(),
    payload: jsonb("payload").notNull(),
    canonicalResult: jsonb("canonical_result").notNull(),
    eventId: integer("event_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    idempotencyKey: unique("sync_operations_user_client_key").on(table.userId, table.clientOperationId),
  }),
);

/**
 * Current interaction state. The composite key prevents duplicate likes and
 * votes even when two devices submit an operation at the same time.
 */
export const syncInteractionsTable = pgTable(
  "sync_interactions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    interactionType: syncInteractionTypeEnum("interaction_type").notNull(),
    active: boolean("active").notNull().default(false),
    value: text("value"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    oneInteractionPerTarget: unique("sync_interactions_user_target_key").on(
      table.userId,
      table.targetType,
      table.targetId,
      table.interactionType,
    ),
    aggregateTargetLookup: index("sync_interactions_target_aggregate_idx").on(
      table.targetType,
      table.targetId,
      table.interactionType,
    ),
  }),
);

/**
 * A finalized media object is bound to one canonical social record. Keeping
 * this relation separate from JSON payloads makes audience checks exact and
 * indexed, and prevents re-attaching a DM photo to another conversation.
 */
export const syncMediaAttachmentsTable = pgTable(
  "sync_media_attachments",
  {
    objectPath: text("object_path").primaryKey(),
    entityType: syncEntityTypeEnum("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    audienceUserIds: text("audience_user_ids").array().notNull().default([]),
    isPublic: boolean("is_public").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    entityLookup: index("sync_media_attachments_entity_lookup").on(table.entityType, table.entityId),
    audienceLookup: index("sync_media_attachments_audience_lookup").on(table.audienceUserIds),
  }),
);

export const insertSyncRecordSchema = createInsertSchema(syncRecordsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertSyncEventSchema = createInsertSchema(syncEventsTable).omit({ id: true, createdAt: true });
export const insertSyncOperationSchema = createInsertSchema(syncOperationsTable).omit({ id: true, createdAt: true });
export const insertSyncInteractionSchema = createInsertSchema(syncInteractionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertSyncMediaAttachmentSchema = createInsertSchema(syncMediaAttachmentsTable).omit({
  createdAt: true,
});

export type SyncRecord = typeof syncRecordsTable.$inferSelect;
export type InsertSyncRecord = z.infer<typeof insertSyncRecordSchema>;
export type SyncEvent = typeof syncEventsTable.$inferSelect;
export type InsertSyncEvent = z.infer<typeof insertSyncEventSchema>;
export type SyncOperation = typeof syncOperationsTable.$inferSelect;
export type InsertSyncOperation = z.infer<typeof insertSyncOperationSchema>;
export type SyncInteraction = typeof syncInteractionsTable.$inferSelect;
export type InsertSyncInteraction = z.infer<typeof insertSyncInteractionSchema>;
export type SyncMediaAttachment = typeof syncMediaAttachmentsTable.$inferSelect;
export type InsertSyncMediaAttachment = z.infer<typeof insertSyncMediaAttachmentSchema>;