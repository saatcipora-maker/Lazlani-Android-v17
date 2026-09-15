import { asc, desc, gt } from "drizzle-orm";
import type { Response } from "express";
import { db, pool, syncEventsTable } from "@workspace/db";
import { isSessionActive } from "./auth";
import { logger } from "./logger";

const CHANNEL = "sync_events";
const RECONNECT_DELAY_MS = 1_000;

export type SyncClientEvent = {
  id: number;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
};

export type SyncSubscriber = {
  userId: string;
  sessionTokenHash: string;
  sessionExpiresAt: Date;
  response: Response;
  replaying: boolean;
  pending: SyncClientEvent[];
};

type ListenerClient = {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
  on: (
    event: "notification" | "error",
    listener: (value: { channel: string; payload?: string } | Error) => void,
  ) => unknown;
  removeAllListeners: (event?: string | symbol) => unknown;
  release: (destroy?: boolean) => void;
};

const subscribers = new Set<SyncSubscriber>();
const notificationQueue = new Set<number>();
let lastProcessedEventId = 0;
let drainPromise: Promise<void> | null = null;
let listenerClient: ListenerClient | null = null;
let startPromise: Promise<void> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function objectPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function eventForClient(event: typeof syncEventsTable.$inferSelect): SyncClientEvent {
  return {
    id: event.id,
    entityType: event.entityType,
    entityId: event.entityId,
    payload: objectPayload(event.payload),
    createdAt: event.createdAt,
  };
}

function writeSseEvent(response: Response, event: SyncClientEvent): void {
  response.write(`id: ${event.id}\n`);
  response.write("event: sync\n");
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function canReceive(userId: string, event: typeof syncEventsTable.$inferSelect): boolean {
  return event.isPublic || Boolean(event.audienceUserIds?.includes(userId));
}

async function broadcastEvent(event: typeof syncEventsTable.$inferSelect): Promise<void> {
  const clientEvent = eventForClient(event);
  for (const subscriber of subscribers) {
    if (!await isSessionActive(
      subscriber.sessionTokenHash,
      subscriber.userId,
      subscriber.sessionExpiresAt,
    )) {
      removeAndEndSubscriber(subscriber);
      continue;
    }
    if (!canReceive(subscriber.userId, event)) continue;
    if (subscriber.replaying) {
      subscriber.pending.push(clientEvent);
    } else if (!subscriber.response.writableEnded) {
      try {
        writeSseEvent(subscriber.response, clientEvent);
      } catch (error) {
        logger.warn({ err: error, userId: subscriber.userId }, "Removing failed sync SSE subscriber");
        subscribers.delete(subscriber);
      }
    }
  }
}

function removeAndEndSubscriber(subscriber: SyncSubscriber): void {
  subscribers.delete(subscriber);
  if (!subscriber.response.writableEnded) subscriber.response.end();
}

async function drainNotificationQueue(): Promise<void> {
  if (drainPromise) return drainPromise;
  drainPromise = (async () => {
    while (notificationQueue.size > 0) {
      notificationQueue.clear();
      // Always reload the durable log rather than trusting notification order.
      // This also catches events published while this instance was offline.
      const events = await db.select().from(syncEventsTable)
        .where(gt(syncEventsTable.id, lastProcessedEventId))
        .orderBy(asc(syncEventsTable.id));
      for (const event of events) {
        await broadcastEvent(event);
        lastProcessedEventId = event.id;
      }
    }
  })().finally(() => {
    drainPromise = null;
    if (notificationQueue.size > 0) {
      void drainNotificationQueue().catch(error => {
        logger.error({ err: error }, "Failed to drain queued sync notifications");
      });
    }
  });
  return drainPromise;
}

export async function queueSyncEventId(eventId: number): Promise<void> {
  if (!Number.isInteger(eventId) || eventId <= 0) return;
  notificationQueue.add(eventId);
  await drainNotificationQueue();
}

/** Test seam for exercising notification reordering without a second server. */
export function enqueueSyncEventNotificationForTest(eventId: number): void {
  if (Number.isInteger(eventId) && eventId > 0) notificationQueue.add(eventId);
}

export async function drainSyncEventQueueForTest(): Promise<void> {
  await drainNotificationQueue();
}

export function resetSyncHubCursorForTest(cursor = 0): void {
  notificationQueue.clear();
  lastProcessedEventId = cursor;
}

async function initializeEventCursor(): Promise<void> {
  if (lastProcessedEventId > 0) {
    notificationQueue.add(lastProcessedEventId + 1);
    await drainNotificationQueue();
    return;
  }
  const [latest] = await db.select({ id: syncEventsTable.id }).from(syncEventsTable)
    .orderBy(desc(syncEventsTable.id)).limit(1);
  // LISTEN was installed before this cursor query. Events published while it
  // ran are queued by the notification callback and drained after this line.
  lastProcessedEventId = latest?.id ?? 0;
  await drainNotificationQueue();
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void ensureSyncHubStarted();
  }, RECONNECT_DELAY_MS);
}

export async function ensureSyncHubStarted(): Promise<void> {
  if (listenerClient) return;
  if (startPromise) return startPromise;

  startPromise = (async () => {
    let client: ListenerClient | null = null;
    try {
      client = await pool.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      listenerClient = client;
      client.on("notification", value => {
        const notification = value as { channel: string; payload?: string };
        if (notification.channel !== CHANNEL) return;
        const eventId = Number(notification.payload);
        if (Number.isInteger(eventId) && eventId > 0) {
          void queueSyncEventId(eventId).catch(error => {
            logger.error({ err: error, eventId }, "Failed to reload sync event from pub/sub");
          });
        }
      });
      client.on("error", value => {
        const error = value as Error;
        logger.error({ err: error }, "Sync pub/sub listener connection failed");
        if (listenerClient === client) listenerClient = null;
        client?.release(true);
        scheduleReconnect();
      });
      await initializeEventCursor();
      logger.info("Sync pub/sub listener connected");
    } catch (error) {
      logger.error({ err: error }, "Unable to start sync pub/sub listener");
      client?.release(true);
      scheduleReconnect();
    }
  })().finally(() => {
    startPromise = null;
  });

  return startPromise;
}

export async function notifyCommittedSyncEvent(eventId: number): Promise<void> {
  await ensureSyncHubStarted();
  try {
    await pool.query("SELECT pg_notify($1, $2)", [CHANNEL, String(eventId)]);
  } catch (error) {
    // The event is durable and SSE replay remains available if pub/sub is
    // temporarily unavailable. Do not turn a committed write into a 500.
    logger.error({ err: error, eventId }, "Failed to publish committed sync event");
  }
}

export function addSyncSubscriber(subscriber: SyncSubscriber): void {
  subscribers.add(subscriber);
}

export function removeSyncSubscriber(subscriber: SyncSubscriber): void {
  subscribers.delete(subscriber);
}

export async function flushPendingSyncEvents(
  subscriber: SyncSubscriber,
  replayedIds: Set<number>,
): Promise<void> {
  if (!await isSessionActive(
    subscriber.sessionTokenHash,
    subscriber.userId,
    subscriber.sessionExpiresAt,
  )) {
    removeAndEndSubscriber(subscriber);
    return;
  }
  subscriber.replaying = false;
  for (const event of [...subscriber.pending].sort((left, right) => left.id - right.id)) {
    if (!replayedIds.has(event.id) && !subscriber.response.writableEnded) {
      try {
        writeSseEvent(subscriber.response, event);
      } catch (error) {
        logger.warn({ err: error, userId: subscriber.userId }, "Removing failed sync SSE subscriber");
        removeAndEndSubscriber(subscriber);
      }
    }
  }
  subscriber.pending = [];
}

export async function revalidateSyncSubscriber(subscriber: SyncSubscriber): Promise<boolean> {
  if (await isSessionActive(
    subscriber.sessionTokenHash,
    subscriber.userId,
    subscriber.sessionExpiresAt,
  )) return true;
  removeAndEndSubscriber(subscriber);
  return false;
}

export function closeSyncHub(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const client = listenerClient;
  listenerClient = null;
  if (client) {
    client.removeAllListeners();
    client.release(true);
  }
  notificationQueue.clear();
  lastProcessedEventId = 0;
  drainPromise = null;
}