import { and, eq, gt, or, sql } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { SubmitSyncOperationBody, SubmitSyncOperationResponse } from "@workspace/api-zod";
import {
  authUsersTable,
  db,
  syncEventsTable,
  syncInteractionsTable,
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
    case "create_notification": return "notification";
    case "create_comment": return "comment";
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

async function applyOperation(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  operationType: SyncOperationType,
  inputPayload: unknown,
  apiOrigin: string,
) {
  let payload = sanitizedPayload(inputPayload, userId);
  const interaction = operationType === "toggle_like" || operationType === "set_reaction" || operationType === "toggle_vote";
  const entityType = operationEntityType(operationType);
  let now: Date;
  let eventId: number | undefined;
  let entityId = stringValue(payload, "id") ?? randomUUID();
  let isPublic = !["create_message", "create_notification"].includes(operationType);
  let audienceUserIds: string[] = [];
  let deletedAt: Date | null = null;
  const bookOperation = operationType === "create_book"
    || operationType === "update_book"
    || operationType === "delete_book";

  if (interaction) {
    const targetId = stringValue(payload, "targetId");
    const targetType = stringValue(payload, "targetType") ?? "content";
    if (!targetId) throw new SyncDomainError("targetId is required for interactions");
    const interactionType = operationType === "toggle_like" ? "like" : operationType === "toggle_vote" ? "vote" : "reaction";
    const rating = operationType === "toggle_vote" ? ratingValue(payload) : null;
    if (operationType === "toggle_vote" && rating === null) {
      throw new SyncDomainError("vote rating must be an integer from 1 to 5");
    }
    if (targetType === "message") {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${
        `sync-record:${targetId}`
      }))`);
      const [targetRecord] = await tx.select().from(syncRecordsTable)
        .where(eq(syncRecordsTable.id, targetId))
        .limit(1);
      if (!targetRecord ||
        targetRecord.entityType !== "message" ||
        targetRecord.isPublic ||
        !targetRecord.audienceUserIds?.includes(userId)) {
        throw new SyncDomainError("Target is not available for interaction");
      }
      isPublic = false;
      audienceUserIds = [...(targetRecord.audienceUserIds ?? [])];
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
    if (bookOperation && operationType === "delete_book") {
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
    if (bookOperation && operationType === "delete_book") {
      isPublic = existingRecord.isPublic;
      audienceUserIds = [...(existingRecord.audienceUserIds ?? [])];
      payload = {
        id: entityId,
        actorUserId: userId,
        deleted: true,
      };
      deletedAt = now;
    }
  } else if (bookOperation && operationType === "delete_book") {
    throw new SyncDomainError("Book does not exist");
  }

  const [record] = await tx.insert(syncRecordsTable).values({
    id: entityId,
    entityType,
    ownerUserId: userId,
    isPublic,
    audienceUserIds,
    payload,
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
      version: sql`${syncRecordsTable.version} + 1`,
      deletedAt,
      updatedAt: now,
    },
  }).returning();
  if (!record) throw new Error("Sync record could not be saved");

  eventId ??= await reserveSyncEventId(tx);
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
  return { eventId, eventValues, record };
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
      };
    });

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