import { and, eq, gt, isNull, notInArray, or, sql } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { SubmitSyncOperationBody, SubmitSyncOperationResponse } from "@workspace/api-zod";
import {
  authUsersTable,
  db,
  syncEventsTable,
  syncInteractionsTable,
  syncMediaAttachmentsTable,
  syncOperationsTable,
  syncRecordsTable,
  type SyncEntityType,
  type SyncOperationType,
} from "@workspace/db";
import { authenticatedSession } from "../lib/auth";
import {
  addSyncSubscriber,
  ensureSyncHubStarted,
  eventForClient,
  flushPendingSyncEvents,
  notifyCommittedSyncEvent,
  revalidateSyncSubscriber,
  removeSyncSubscriber,
  type SyncClientEvent,
  type SyncSubscriber,
} from "../lib/sync-hub";
import { readSyncSnapshot, syncRecordForClient } from "../lib/sync-snapshot";
import { insertSyncEvent, reserveSyncEventId } from "../lib/sync-events";
import {
  InvalidBookCoverReferenceError,
  InvalidMediaReferenceError,
  canonicalMediaObjectReference,
  deleteStoredObject,
  validateMediaReference,
  type MediaObjectReference,
  validateBookCoverReference,
} from "../lib/object-storage";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();
const HEARTBEAT_MS = 25_000;
export const SYNC_REPLAY_BATCH_SIZE = 500;

export class SyncDomainError extends Error {
  readonly code = "SYNC_DOMAIN_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "SyncDomainError";
  }
}

type InteractionPreLockHook = () => void | Promise<void>;
let interactionPreLockHookForTest: InteractionPreLockHook | null = null;

/**
 * Test-only seam for reversing request arrival and aggregate-lock order.
 * This is not reachable through request data or any production route.
 */
export function setInteractionPreLockHookForTest(hook: InteractionPreLockHook | null): void {
  interactionPreLockHookForTest = hook;
}

export function syncErrorStatus(error: unknown): 400 | 503 {
  return error instanceof SyncDomainError ? 400 : 503;
}

type JsonObject = Record<string, unknown>;
function objectPayload(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as JsonObject) }
    : {};
}

function stringValue(payload: JsonObject, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(payload: JsonObject, key: string): boolean | null {
  const value = payload[key];
  return typeof value === "boolean" ? value : null;
}

function ratingValue(payload: JsonObject): number | null {
  const value = payload.rating !== undefined ? payload.rating : payload.value;
  const rating = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
}

function sanitizedPayload(input: unknown, userId: string): JsonObject {
  const payload = objectPayload(input);
  // These fields are deliberately discarded rather than merely overwritten:
  // clients must not be able to smuggle an actor identity into a record.
  const { actorId: _actorId, actorUserId: _actorUserId, userId: _userId, ...safe } = payload;
  return { ...safe, actorUserId: userId };
}

function privateAudience(userId: string, recipientUserId: string | null): string[] {
  return recipientUserId && recipientUserId !== userId
    ? [userId, recipientUserId]
    : [userId];
}

function visibleTo(userId: string, table: typeof syncEventsTable | typeof syncRecordsTable) {
  return or(
    eq(table.isPublic, true),
    sql`${table.audienceUserIds} @> ARRAY[${userId}]::text[]`,
  );
}

function cursorFromRequest(req: Request): number {
  const raw = req.get("Last-Event-ID") ?? (typeof req.query.cursor === "string" ? req.query.cursor : undefined);
  const parsed = Number(raw ?? 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function trustedApiOrigin(req: Request): string {
  const configured = process.env.PUBLIC_API_ORIGIN?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      throw new SyncDomainError("Configured public API origin is invalid");
    }
  }
  const host = req.get("host");
  if (!host) throw new SyncDomainError("API host is unavailable");
  return `https://${host}`;
}

export async function replayEvents(userId: string, cursor: number): Promise<SyncClientEvent[]> {
  const events: SyncClientEvent[] = [];
  let nextCursor = cursor;
  while (true) {
    const rows = await db
      .select()
      .from(syncEventsTable)
      .where(and(gt(syncEventsTable.id, nextCursor), visibleTo(userId, syncEventsTable)))
      .orderBy(syncEventsTable.id)
      .limit(SYNC_REPLAY_BATCH_SIZE);
    events.push(...rows.map(eventForClient));
    const last = rows.at(-1);
    if (!last || rows.length < SYNC_REPLAY_BATCH_SIZE) break;
    nextCursor = last.id;
  }
  return events;
}

function asOperationType(value: string): SyncOperationType {
  return value as SyncOperationType;
}

function operationEntityType(operationType: SyncOperationType): SyncEntityType {
  switch (operationType) {
    case "create_message": return "message";
    case "delete_message": return "message";
    case "create_notification": return "notification";
    case "create_comment": return "comment";
    case "delete_comment": return "comment";
    case "create_reply": return "reply";
    case "create_ozel_comment": return "ozel_comment";
    case "create_ozel_reply": return "ozel_reply";
    case "upsert_ozel_video": return "ozel_video";
    case "toggle_like": return "like";
    case "set_reaction": return "reaction";
    case "toggle_vote": return "vote";
    case "create_book":
    case "update_book":
    case "delete_book":
      return "book";
    case "create_post":
    case "update_post":
    case "delete_post":
      return "post";
    case "start_reading":
      return "reading";
  }
}

const BOOK_REQUIRED_FIELDS = [
  "title",
  "coverColor",
  "authorId",
  "authorName",
  "authorAvatarColor",
  "description",
  "genre",
  "chapters",
  "likesCount",
  "commentsCount",
  "rating",
  "ratingCount",
  "readCount",
  "isFeatured",
  "isEditorChoice",
  "isDraft",
  "createdAt",
  "tags",
] as const;

function assertFullBookPayload(payload: JsonObject): void {
  if (!stringValue(payload, "id")) throw new SyncDomainError("Book id is required");
  for (const field of BOOK_REQUIRED_FIELDS) {
    if (payload[field] === undefined || payload[field] === null) {
      throw new SyncDomainError(`Full book payload is missing ${field}`);
    }
  }
  if (!Array.isArray(payload.chapters) || !Array.isArray(payload.tags)) {
    throw new SyncDomainError("Book chapters and tags must be arrays");
  }
}

async function validateAttachedMedia(
  payload: JsonObject,
  userId: string,
  apiOrigin: string,
): Promise<MediaObjectReference[]> {
  const references: MediaObjectReference[] = [];
  const visit = async (value: unknown): Promise<void> => {
    if (typeof value === "string") {
      const storageLike = value.startsWith("/objects/")
        || value.includes("/api/storage/objects/");
      if (!storageLike) return;
      try {
        const canonical = canonicalMediaObjectReference(value, apiOrigin);
        if (!canonical) throw new InvalidMediaReferenceError("Media must use a social media namespace");
        const validated = await validateMediaReference(value, userId, apiOrigin);
        if (!validated) throw new InvalidMediaReferenceError("Media reference is invalid");
        references.push(validated);
      } catch (error) {
        if (error instanceof InvalidMediaReferenceError) {
          throw new SyncDomainError(error.message);
        }
        throw error;
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) await visit(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const item of Object.values(value)) await visit(item);
    }
  };
  // Walk the complete typed envelope, not just the conventional media/photo
  // keys. Clients may send galleries as nested arrays or custom metadata.
  await visit(payload);
  return [...new Map(references.map(reference => [reference.objectPath, reference])).values()];
}

async function applyOperation(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  operationType: SyncOperationType,
  inputPayload: unknown,
  apiOrigin: string,
) {
  let payload = sanitizedPayload(inputPayload, userId);
  const interaction = operationType === "toggle_like"
    || operationType === "set_reaction"
    || operationType === "toggle_vote"
    || operationType === "start_reading";
  const entityType = operationEntityType(operationType);
  let now: Date;
  let eventId: number | undefined;
  let entityId = stringValue(payload, "id") ?? randomUUID();
  let isPublic = !["create_message", "create_notification"].includes(operationType);
  let audienceUserIds: string[] = [];
  let deletedAt: Date | null = null;
  let attachedMedia: MediaObjectReference[] = [];
  let commentParentId: string | null = null;
  let cleanupObjectPaths: string[] = [];
  const bookOperation = operationType === "create_book"
    || operationType === "update_book"
    || operationType === "delete_book";
  const deleteOperation = operationType === "delete_message"
    || operationType === "delete_comment"
    || operationType === "delete_post"
    || operationType === "delete_book";
  const postOperation = operationType === "create_post"
    || operationType === "update_post"
    || operationType === "delete_post";

  if (interaction) {
    const targetId = stringValue(payload, "targetId");
    const targetType = stringValue(payload, "targetType") ?? (operationType === "start_reading" ? "book" : "content");
    if (!targetId) throw new SyncDomainError("targetId is required for interactions");
    if (operationType === "start_reading" && targetType !== "book") {
      throw new SyncDomainError("Reading starts must target a book");
    }
    const interactionType = operationType === "toggle_like"
      ? "like"
      : operationType === "toggle_vote"
        ? "vote"
        : operationType === "start_reading" ? "reading" : "reaction";
    const rating = operationType === "toggle_vote" ? ratingValue(payload) : null;
    if (operationType === "toggle_vote" && rating === null) {
      throw new SyncDomainError("vote rating must be an integer from 1 to 5");
    }
    if (targetType === "message" || operationType === "start_reading") {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${
        `sync-record:${targetId}`
      }))`);
      const [targetRecord] = await tx.select().from(syncRecordsTable)
        .where(eq(syncRecordsTable.id, targetId))
        .limit(1);
      if (targetType === "message" && (!targetRecord
        || targetRecord.entityType !== "message"
        || targetRecord.isPublic
        || !targetRecord.audienceUserIds?.includes(userId))) {
        throw new SyncDomainError("Target is not available for interaction");
      }
      if (operationType === "start_reading" && targetRecord
        && (targetRecord.entityType !== "book"
          || !targetRecord.isPublic && targetRecord.ownerUserId !== userId
            && !targetRecord.audienceUserIds?.includes(userId))) {
        throw new SyncDomainError("Target is not available for reading");
      }
      if (targetType === "message") {
        isPublic = false;
        audienceUserIds = [...(targetRecord.audienceUserIds ?? [])];
      }
    }
    // Serialize all updates for one target aggregate. Without this lock two
    // concurrent users could each calculate a count that omits the other's
    // still-uncommitted interaction.
    await interactionPreLockHookForTest?.();
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${
      `sync-interaction:${interactionType}:${targetType}:${targetId}`
    }))`);
    now = new Date();
    // Reserve the event id while the target lock is held and before any
    // materialized interaction record is written. This revision is an
    // absolute aggregate version and remains ordered with the event log.
    eventId = await reserveSyncEventId(tx);
    payload.aggregateRevision = eventId;
    await tx.insert(syncInteractionsTable).values({
      userId,
      targetType,
      targetId,
      interactionType,
      active: false,
      value: interactionType === "reaction" ? stringValue(payload, "value") : rating === null ? null : String(rating),
    }).onConflictDoNothing();

    const [state] = operationType === "set_reaction"
      ? await tx.update(syncInteractionsTable)
        .set({
          active: booleanValue(payload, "active") ?? stringValue(payload, "value") !== null,
          value: stringValue(payload, "value"),
          updatedAt: now,
        })
        .where(and(
          eq(syncInteractionsTable.userId, userId),
          eq(syncInteractionsTable.targetType, targetType),
          eq(syncInteractionsTable.targetId, targetId),
          eq(syncInteractionsTable.interactionType, interactionType),
        ))
        .returning()
      : operationType === "toggle_vote"
        ? await tx.update(syncInteractionsTable)
          .set({ active: true, value: String(rating), updatedAt: now })
          .where(and(
            eq(syncInteractionsTable.userId, userId),
            eq(syncInteractionsTable.targetType, targetType),
            eq(syncInteractionsTable.targetId, targetId),
            eq(syncInteractionsTable.interactionType, interactionType),
          ))
          .returning()
      : operationType === "start_reading"
        ? await tx.update(syncInteractionsTable)
          .set({ active: true, value: null, updatedAt: now })
          .where(and(
            eq(syncInteractionsTable.userId, userId),
            eq(syncInteractionsTable.targetType, targetType),
            eq(syncInteractionsTable.targetId, targetId),
            eq(syncInteractionsTable.interactionType, interactionType),
          ))
          .returning()
      : await tx.update(syncInteractionsTable)
        .set({
          active: booleanValue(payload, "active") ?? sql`NOT ${syncInteractionsTable.active}`,
          updatedAt: now,
        })
        .where(and(
          eq(syncInteractionsTable.userId, userId),
          eq(syncInteractionsTable.targetType, targetType),
          eq(syncInteractionsTable.targetId, targetId),
          eq(syncInteractionsTable.interactionType, interactionType),
        ))
        .returning();
    if (!state) throw new Error("Interaction state could not be updated");
    entityId = `interaction:${interactionType}:${userId}:${targetType}:${targetId}`;
    payload.targetType = targetType;
    payload.targetId = targetId;
    payload.active = state.active;
    if (operationType === "toggle_vote") {
      delete payload.value;
      payload.rating = Number(state.value);
    } else if (state.value !== null) {
      payload.value = state.value;
    }
    const aggregateRows = await tx.select({
      active: syncInteractionsTable.active,
      value: syncInteractionsTable.value,
    }).from(syncInteractionsTable).where(and(
      eq(syncInteractionsTable.targetType, targetType),
      eq(syncInteractionsTable.targetId, targetId),
      eq(syncInteractionsTable.interactionType, interactionType),
    ));
    const activeRows = aggregateRows.filter(row => row.active);
    if (interactionType === "vote") {
      const ratings = activeRows
        .map(row => Number(row.value))
        .filter(rating => Number.isFinite(rating));
      payload.ratingCount = ratings.length;
      payload.ratingAverage = ratings.length
        ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length
        : 0;
    } else if (interactionType === "reading") {
      // Reading is a unique-user absolute aggregate, not an increment
      // operation. Replaying with another client operation id remains a
      // no-op at the interaction layer and emits the current absolute value.
      payload.aggregateCount = activeRows.length;
      payload.absoluteCount = activeRows.length;
      payload.readCount = activeRows.length;
      payload.aggregateType = "absolute";
      payload.aggregateValue = activeRows.length;
    } else {
      payload.activeCount = activeRows.length;
      if (interactionType === "reaction") {
        payload.valueCounts = Object.fromEntries(
          activeRows.reduce((counts, row) => {
            if (row.value !== null) counts.set(row.value, (counts.get(row.value) ?? 0) + 1);
            return counts;
          }, new Map<string, number>()),
        );
      }
    }
    // Non-message interactions are public state changes. Message
    // interactions retain the target message's private audience.
    if (targetType !== "message") isPublic = true;
  } else {
    now = new Date();
    const recipientUserId = stringValue(payload, "recipientUserId");
    if (operationType === "create_message" || operationType === "create_notification") {
      if (!recipientUserId) throw new SyncDomainError("recipientUserId is required for private records");
      const [recipient] = await tx.select({ id: authUsersTable.id }).from(authUsersTable)
        .where(eq(authUsersTable.id, recipientUserId)).limit(1);
      if (!recipient) throw new SyncDomainError("Private recipient does not exist");
      audienceUserIds = privateAudience(userId, recipientUserId);
      payload.recipientUserId = recipientUserId;
      isPublic = false;
    }
    if (operationType === "create_comment") {
      const targetId = stringValue(payload, "targetId");
      const targetType = stringValue(payload, "targetType");
      if (targetType === "message") {
        if (!targetId) throw new SyncDomainError("targetId is required for message comments");
        const [target] = await tx.select().from(syncRecordsTable)
          .where(eq(syncRecordsTable.id, targetId)).limit(1);
        if (!target || target.entityType !== "message" || target.isPublic
          || !target.audienceUserIds?.includes(userId)) {
          throw new SyncDomainError("Target is not available for comment");
        }
        isPublic = false;
        audienceUserIds = [...(target.audienceUserIds ?? [])];
      }
    }
    if (operationType === "create_message" || operationType === "create_post"
      || operationType === "update_post") {
      attachedMedia = await validateAttachedMedia(payload, userId, apiOrigin);
      const expectedNamespace = operationType === "create_message" ? "dm-photos" : "social-posts";
      if (attachedMedia.some(reference => reference.namespace !== expectedNamespace)) {
        throw new SyncDomainError(`Media namespace must be ${expectedNamespace}`);
      }
    }
    if (postOperation && operationType !== "delete_post") {
      if (!stringValue(payload, "id")) throw new SyncDomainError("Post id is required");
      isPublic = true;
      audienceUserIds = [];
    }
    if (deleteOperation && !stringValue(payload, "id")) {
      throw new SyncDomainError("Record id is required");
    }
    if (bookOperation) {
      if (operationType === "delete_book") {
        if (!stringValue(payload, "id")) throw new SyncDomainError("Book id is required");
      } else {
        assertFullBookPayload(payload);
        try {
          const canonicalCoverUrl = await validateBookCoverReference(
            payload.coverUrl,
            userId,
            apiOrigin,
          );
          if (canonicalCoverUrl) payload.coverUrl = canonicalCoverUrl;
          else delete payload.coverUrl;
        } catch (error) {
          if (error instanceof InvalidBookCoverReferenceError) {
            throw new SyncDomainError(error.message);
          }
          throw error;
        }
      }
      const isDraft = payload.isDraft === true;
      isPublic = !isDraft;
      audienceUserIds = isDraft ? [userId] : [];
      // Book ownership is canonicalized from the authenticated actor. The
      // submitted author identity is never trusted, while all other fields
      // (including coverUrl) travel as part of the full-book payload.
      payload.authorId = userId;
      delete payload.deleted;
      delete payload.deletedAt;
    }
    if (deleteOperation && !bookOperation) {
      deletedAt = now;
    }
    if (operationType === "create_comment") {
      commentParentId = stringValue(payload, "targetId")
        ?? stringValue(payload, "postId")
        ?? stringValue(payload, "parentId");
    }
  }

  // Client-selected record ids are an object-level authorization boundary.
  // Serialize absent-row races with an advisory lock, then lock and inspect
  // the existing row before allowing an upsert.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`sync-record:${entityId}`}))`);
  await tx.execute(sql`SELECT id FROM sync_records WHERE id = ${entityId} FOR UPDATE`);
  const [existingRecord] = await tx.select().from(syncRecordsTable)
    .where(eq(syncRecordsTable.id, entityId)).limit(1);
  if (existingRecord) {
    if (existingRecord.ownerUserId !== userId) {
      throw new SyncDomainError("You are not authorized to overwrite this sync record");
    }
    if (existingRecord.entityType !== entityType) {
      throw new SyncDomainError("Sync record type and visibility are immutable");
    }
    if (deleteOperation) {
      commentParentId = existingRecord.parentId
        ?? stringValue(objectPayload(existingRecord.payload), "targetId")
        ?? stringValue(objectPayload(existingRecord.payload), "postId")
        ?? stringValue(objectPayload(existingRecord.payload), "parentId");
      isPublic = existingRecord.isPublic;
      audienceUserIds = [...(existingRecord.audienceUserIds ?? [])];
    }
    // Books are the one record type whose publication state is mutable. A
    // draft is private to its owner; publishing it (or unpublishing it)
    // changes visibility and therefore must not be rejected as an immutable
    // record attribute.
    const allowsBookVisibilityChange = bookOperation && operationType !== "delete_book";
    if (!allowsBookVisibilityChange && existingRecord.isPublic !== isPublic) {
      throw new SyncDomainError("Sync record type and visibility are immutable");
    }
    if (operationType === "update_book" && existingRecord.isPublic && payload.isDraft === true) {
      // We can safely grant visibility on draft -> published, but this
      // protocol has no revocation event for devices that already received a
      // public book. Reject public -> draft rather than leaking it.
      throw new SyncDomainError("Published books cannot be changed back to drafts");
    }
    if (!isPublic && !allowsBookVisibilityChange) {
      const existingAudience = [...(existingRecord.audienceUserIds ?? [])].sort();
      const nextAudience = [...audienceUserIds].sort();
      if (!existingAudience.includes(userId) ||
        existingAudience.length !== nextAudience.length ||
        existingAudience.some((id, index) => id !== nextAudience[index])) {
        throw new SyncDomainError("Private sync record audience is immutable");
      }
    }
    if (deleteOperation) {
      isPublic = existingRecord.isPublic;
      audienceUserIds = [...(existingRecord.audienceUserIds ?? [])];
      payload = {
        id: entityId,
        actorUserId: userId,
        deleted: true,
        ...(commentParentId ? { parentId: commentParentId } : {}),
      };
      deletedAt = now;
    }
  } else if (deleteOperation) {
    throw new SyncDomainError("Record does not exist");
  } else if (operationType === "update_post") {
    throw new SyncDomainError("Post does not exist");
  }

  if (operationType === "create_comment" || operationType === "delete_comment") {
    if (commentParentId) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${
        `sync-comments:${commentParentId}`
      }))`);
    }
  }

  let [record] = await tx.insert(syncRecordsTable).values({
    id: entityId,
    entityType,
    ownerUserId: userId,
    isPublic,
    audienceUserIds,
    payload,
    parentId: commentParentId,
    version: 1,
    deletedAt,
    updatedAt: now,
    createdAt: now,
  }).onConflictDoUpdate({
    target: syncRecordsTable.id,
    set: {
      entityType,
      ownerUserId: userId,
      isPublic,
      audienceUserIds,
      payload,
      parentId: commentParentId,
      version: sql`${syncRecordsTable.version} + 1`,
      deletedAt,
      updatedAt: now,
    },
  }).returning();
  if (!record) throw new Error("Sync record could not be saved");

  const mediaOperation = operationType === "create_message"
    || operationType === "create_post"
    || operationType === "update_post"
    || operationType === "delete_message"
    || operationType === "delete_post";
  if (mediaOperation) {
    const retiredAttachments = await tx.select({
      objectPath: syncMediaAttachmentsTable.objectPath,
    }).from(syncMediaAttachmentsTable).where(and(
      eq(syncMediaAttachmentsTable.entityType, entityType),
      eq(syncMediaAttachmentsTable.entityId, entityId),
      eq(syncMediaAttachmentsTable.active, true),
      ...(attachedMedia.length
        ? [notInArray(syncMediaAttachmentsTable.objectPath, attachedMedia.map(item => item.objectPath))]
        : []),
    ));
    cleanupObjectPaths = retiredAttachments.map(item => item.objectPath);
    const attachmentRetirement = [
      eq(syncMediaAttachmentsTable.entityType, entityType),
      eq(syncMediaAttachmentsTable.entityId, entityId),
      eq(syncMediaAttachmentsTable.active, true),
      ...(attachedMedia.length
        ? [notInArray(syncMediaAttachmentsTable.objectPath, attachedMedia.map(item => item.objectPath))]
        : []),
    ];
    await tx.update(syncMediaAttachmentsTable)
      .set({ active: false })
      .where(and(...attachmentRetirement));
    for (const reference of attachedMedia) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${
        `sync-media:${reference.objectPath}`
      }))`);
      const [existingAttachment] = await tx.select().from(syncMediaAttachmentsTable)
        .where(eq(syncMediaAttachmentsTable.objectPath, reference.objectPath))
        .limit(1);
      if (existingAttachment && (
        !existingAttachment.active
        || existingAttachment.entityType !== entityType
        || existingAttachment.entityId !== entityId
      )) {
        throw new SyncDomainError("Media object is already bound to another social record");
      }
      await tx.insert(syncMediaAttachmentsTable).values({
        objectPath: reference.objectPath,
        entityType,
        entityId,
        ownerUserId: userId,
        audienceUserIds: isPublic ? [] : audienceUserIds,
        isPublic,
        active: true,
      }).onConflictDoUpdate({
        target: syncMediaAttachmentsTable.objectPath,
        set: {
          entityType,
          entityId,
          ownerUserId: userId,
          audienceUserIds: isPublic ? [] : audienceUserIds,
          isPublic,
          active: true,
        },
      });
    }
  }

  eventId ??= await reserveSyncEventId(tx);
  if ((operationType === "create_comment" || operationType === "delete_comment")
    && commentParentId) {
    // parent_id is backfilled by migration 0010. Keep the aggregate correct
    // while a rolling deployment still has legacy rows with a null column.
    const legacyParentId = sql`COALESCE(
      CASE WHEN jsonb_typeof(${syncRecordsTable.payload}->'postId') = 'string'
        THEN NULLIF(btrim(${syncRecordsTable.payload}->>'postId'), '') END,
      CASE WHEN jsonb_typeof(${syncRecordsTable.payload}->'targetId') = 'string'
        THEN NULLIF(btrim(${syncRecordsTable.payload}->>'targetId'), '') END,
      CASE WHEN jsonb_typeof(${syncRecordsTable.payload}->'parentId') = 'string'
        THEN NULLIF(btrim(${syncRecordsTable.payload}->>'parentId'), '') END
    )`;
    const [aggregate] = await tx.select({
      count: sql<number>`count(*)::int`,
    }).from(syncRecordsTable).where(and(
      eq(syncRecordsTable.entityType, "comment"),
      isNull(syncRecordsTable.deletedAt),
      or(
        eq(syncRecordsTable.parentId, commentParentId),
        and(isNull(syncRecordsTable.parentId), eq(legacyParentId, commentParentId)),
      ),
    ));
    payload.commentsCount = aggregate?.count ?? 0;
    payload.aggregateRevision = eventId;
    payload.parentId = commentParentId;
    const [updatedRecord] = await tx.update(syncRecordsTable)
      .set({ payload, updatedAt: now })
      .where(eq(syncRecordsTable.id, entityId))
      .returning();
    if (!updatedRecord) throw new Error("Comment aggregate could not be saved");
    record = updatedRecord;
  }
  const eventValues = {
    entityType,
    entityId,
    isPublic,
    audienceUserIds: isPublic ? null : audienceUserIds,
    payload: {
      ...payload,
      recordVersion: record.version,
      ...(deletedAt ? { deletedAt: deletedAt.toISOString() } : {}),
    },
    createdAt: now,
  } satisfies Omit<typeof syncEventsTable.$inferInsert, "id">;
  return { eventId, eventValues, record, cleanupObjectPaths };
}

router.get("/sync/snapshot", async (req, res): Promise<void> => {
  await ensureSyncHubStarted();
  const session = await authenticatedSession(req);
  if (!session) {
    res.status(401).json({ error: "Oturum gerekli." });
    return;
  }
  res.json(await readSyncSnapshot(session.user.id));
});

router.post("/sync/operations", async (req, res): Promise<void> => {
  await ensureSyncHubStarted();
  const session = await authenticatedSession(req);
  if (!session) {
    res.status(401).json({ error: "Oturum gerekli." });
    return;
  }
  const user = session.user;
  const parsed = SubmitSyncOperationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçerli bir sync operasyonu gerekli." });
    return;
  }
  // Keep the OpenAPI-validated common fields while preserving domain-specific
  // JSON fields (body, content, metadata, etc.) for the typed envelope.
  const operationPayload = objectPayload((req.body as { payload?: unknown }).payload);

  try {
    const result = await db.transaction(async tx => {
      // Serialize retries for the same user/client key before checking the
      // unique idempotency constraint. This closes the apply-twice race.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${user.id}:${parsed.data.clientOperationId}`}))`);
      const [existing] = await tx.select().from(syncOperationsTable)
        .where(and(
          eq(syncOperationsTable.userId, user.id),
          eq(syncOperationsTable.clientOperationId, parsed.data.clientOperationId),
        )).limit(1);
      if (existing) {
        return {
          duplicate: true,
          result: { ...objectPayload(existing.canonicalResult), duplicate: true },
          event: null,
          isPublic: false,
          audienceUserIds: null,
          cleanupObjectPaths: [],
        };
      }
       const applied = await applyOperation(
         tx,
         user.id,
         asOperationType(parsed.data.operationType),
         operationPayload,
         trustedApiOrigin(req),
       );
      const event = {
        id: applied.eventId,
        ...applied.eventValues,
      };
      const canonicalResult = {
        duplicate: false,
        event: eventForClient(event),
        record: syncRecordForClient(applied.record),
        clientOperationId: parsed.data.clientOperationId,
      };
      await tx.insert(syncOperationsTable).values({
        userId: user.id,
        clientOperationId: parsed.data.clientOperationId,
        operationType: asOperationType(parsed.data.operationType),
        payload: operationPayload,
        canonicalResult,
        eventId: applied.eventId,
      });
      // Keep event insertion as the final meaningful write in the
      // transaction. The sequence lock acquired by reserveSyncEventId is
      // held until this transaction commits.
      const committedEvent = await insertSyncEvent(tx, applied.eventId, applied.eventValues);
      return {
        duplicate: false,
        result: canonicalResult,
        event: eventForClient(committedEvent),
        isPublic: committedEvent.isPublic,
        audienceUserIds: committedEvent.audienceUserIds,
        cleanupObjectPaths: applied.cleanupObjectPaths,
      };
    });

    for (const objectPath of result.cleanupObjectPaths) {
      const namespace = objectPath.startsWith("/objects/social-posts/")
        ? "social-posts"
        : objectPath.startsWith("/objects/dm-photos/") ? "dm-photos" : null;
      if (!namespace) continue;
      try {
        await deleteStoredObject(user.id, objectPath, namespace);
      } catch (error) {
        // The tombstone and attachment deactivation are already committed.
        // A failed physical delete is safe to retry independently and must
        // never turn a successful canonical operation into a 503.
        req.log.warn({ err: error, objectPath }, "Deferred social media cleanup");
      }
    }

    if (result.event) {
      // Notify only after the transaction has committed. Every API instance
      // reloads and authorizes the durable event before local fanout.
      await notifyCommittedSyncEvent(result.event.id);
    }
    res.json(SubmitSyncOperationResponse.parse(result.result));
  } catch (error) {
    const status = syncErrorStatus(error);
    if (status === 400) {
      req.log.warn({ reason: (error as SyncDomainError).message }, "Rejected sync operation");
      res.status(status).json({ error: (error as SyncDomainError).message });
    } else {
      req.log.error({ err: error }, "Sync operation failed");
      res.status(status).json({ error: "Sync service temporarily unavailable." });
    }
  }
});

router.get("/sync/events", async (req, res): Promise<void> => {
  await ensureSyncHubStarted();
  const session = await authenticatedSession(req);
  if (!session) {
    res.status(401).json({ error: "Oturum gerekli." });
    return;
  }
  res.status(200);
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  const subscriber: SyncSubscriber = {
    userId: session.user.id,
    sessionTokenHash: session.tokenHash,
    sessionExpiresAt: session.expiresAt,
    response: res,
    replaying: true,
    pending: [],
  };
  addSyncSubscriber(subscriber);
  let heartbeat: NodeJS.Timeout;
  const cleanup = () => {
    clearInterval(heartbeat);
    removeSyncSubscriber(subscriber);
  };
  heartbeat = setInterval(async () => {
    if (!await revalidateSyncSubscriber(subscriber)) return;
    if (!res.writableEnded) res.write(`: heartbeat ${Date.now()}\n\n`);
  }, HEARTBEAT_MS);
  req.on("close", cleanup);
  res.on("close", cleanup);
  res.write(": connected\n\n");
  try {
    const replayed = await replayEvents(session.user.id, cursorFromRequest(req));
    const replayedIds = new Set(replayed.map(event => event.id));
    for (const event of replayed) {
      if (!await revalidateSyncSubscriber(subscriber)) return;
      res.write(`id: ${event.id}\n`);
      res.write("event: sync\n");
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    await flushPendingSyncEvents(subscriber, replayedIds);
  } catch (error) {
    req.log.error({ err: error }, "SSE replay failed");
    cleanup();
    if (!res.headersSent) res.status(503).json({ error: "Event replay temporarily unavailable." });
  }
});

export default router;