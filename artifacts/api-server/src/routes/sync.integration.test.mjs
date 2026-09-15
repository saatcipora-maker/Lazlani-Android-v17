import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, eq, like } from "drizzle-orm";
import app from "../app.ts";
import {
  addSyncSubscriber,
  closeSyncHub,
  drainSyncEventQueueForTest,
  enqueueSyncEventNotificationForTest,
  removeSyncSubscriber,
  resetSyncHubCursorForTest,
} from "../lib/sync-hub.ts";
import { hashSessionToken } from "../lib/auth.ts";
import { replayEvents, SYNC_REPLAY_BATCH_SIZE } from "./sync.ts";
import {
  setInteractionPreLockHookForTest,
  SyncDomainError,
  syncErrorStatus,
} from "./sync.ts";
import { readSyncSnapshot } from "../lib/sync-snapshot.ts";
import { insertSyncEvent, reserveSyncEventId } from "../lib/sync-events.ts";
import {
  authSessionsTable,
  authUsersTable,
  db,
  passwordCredentialsTable,
  syncEventsTable,
  syncInteractionsTable,
  syncOperationsTable,
  syncRecordsTable,
} from "@workspace/db";

const marker = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `sync-test-${marker}@example.com`;
const username = `sync_test_${marker.replace(/[^a-zA-Z0-9_]/g, "_").slice(-16)}`;
const otherEmail = `sync-other-${marker}@example.com`;
const otherUsername = `sync_other_${marker.replace(/[^a-zA-Z0-9_]/g, "_").slice(-16)}`;
const thirdEmail = `sync-third-${marker}@example.com`;
const thirdUsername = `sync_third_${marker.replace(/[^a-zA-Z0-9_]/g, "_").slice(-16)}`;
let baseUrl = "";
let server;
let userId;
let token;
let otherUserId;
let otherToken;
let thirdUserId;
let thirdToken;

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}/api`;
  const registration = await request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, displayName: "Sync Test", email, password: "SyncPass!16" }),
  });
  assert.equal(registration.response.status, 201);
  token = registration.body.token;
  userId = registration.body.user.id;
  const otherRegistration = await request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: otherUsername,
      displayName: "Other Sync Test",
      email: otherEmail,
      password: "SyncPass!16",
    }),
  });
  assert.equal(otherRegistration.response.status, 201);
  otherToken = otherRegistration.body.token;
  otherUserId = otherRegistration.body.user.id;
  const thirdRegistration = await request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: thirdUsername,
      displayName: "Third Sync Test",
      email: thirdEmail,
      password: "SyncPass!16",
    }),
  });
  assert.equal(thirdRegistration.response.status, 201);
  thirdToken = thirdRegistration.body.token;
  thirdUserId = thirdRegistration.body.user.id;
});

after(async () => {
  await db.delete(syncOperationsTable).where(eq(syncOperationsTable.userId, userId));
  await db.delete(syncInteractionsTable).where(eq(syncInteractionsTable.userId, userId));
  await db.delete(syncInteractionsTable).where(like(
    syncInteractionsTable.targetId,
    "message-private-interaction-%",
  ));
  await db.delete(syncInteractionsTable).where(like(
    syncInteractionsTable.targetId,
    "interaction-order-target-%",
  ));
  await db.delete(syncRecordsTable).where(eq(
    syncRecordsTable.id,
    `interaction:like:${userId}:comment:comment-sync-test-${marker}`,
  ));
  await db.delete(syncRecordsTable).where(eq(
    syncRecordsTable.id,
    `interaction:vote:${userId}:comment:comment-sync-test-${marker}`,
  ));
  await db.delete(syncRecordsTable).where(like(syncRecordsTable.id, "comment-sync-test-%"));
  await db.delete(syncRecordsTable).where(like(syncRecordsTable.id, "comment-sync-order-%"));
  await db.delete(syncRecordsTable).where(like(
    syncRecordsTable.id,
    "interaction:like:%:comment:interaction-order-target-%",
  ));
  await db.delete(syncRecordsTable).where(eq(
    syncRecordsTable.id,
    `message-sync-test-${marker}`,
  ));
  await db.delete(syncRecordsTable).where(eq(
    syncRecordsTable.id,
    `message-revoked-${marker}`,
  ));
  await db.delete(syncRecordsTable).where(eq(
    syncRecordsTable.id,
    `book-sync-test-${marker}`,
  ));
  await db.delete(syncRecordsTable).where(eq(
    syncRecordsTable.id,
    `book-draft-sync-test-${marker}`,
  ));
  await db.delete(syncRecordsTable).where(like(syncRecordsTable.id, "%message-private-interaction-%"));
  await db.delete(syncEventsTable).where(like(syncEventsTable.entityId, "comment-sync-test-%"));
  await db.delete(syncEventsTable).where(like(syncEventsTable.entityId, "comment-sync-order-%"));
  await db.delete(syncEventsTable).where(like(syncEventsTable.entityId, "sync-replay-batch-%"));
  await db.delete(syncEventsTable).where(like(syncEventsTable.entityId, "sync-commit-order-%"));
  await db.delete(syncEventsTable).where(like(
    syncEventsTable.entityId,
    "interaction:like:%:comment:interaction-order-target-%",
  ));
  await db.delete(syncRecordsTable).where(like(syncRecordsTable.id, "sync-commit-order-%"));
  await db.delete(syncEventsTable).where(eq(
    syncEventsTable.entityId,
    `message-sync-test-${marker}`,
  ));
  await db.delete(syncEventsTable).where(eq(
    syncEventsTable.entityId,
    `message-revoked-${marker}`,
  ));
  await db.delete(syncEventsTable).where(eq(
    syncEventsTable.entityId,
    `book-sync-test-${marker}`,
  ));
  await db.delete(syncEventsTable).where(eq(
    syncEventsTable.entityId,
    `book-draft-sync-test-${marker}`,
  ));
  await db.delete(syncEventsTable).where(like(syncEventsTable.entityId, "%message-private-interaction-%"));
  await db.delete(authSessionsTable).where(eq(authSessionsTable.userId, userId));
  await db.delete(passwordCredentialsTable).where(eq(passwordCredentialsTable.email, email));
  await db.delete(authUsersTable).where(eq(authUsersTable.id, userId));
  await db.delete(syncOperationsTable).where(eq(syncOperationsTable.userId, otherUserId));
  await db.delete(authSessionsTable).where(eq(authSessionsTable.userId, otherUserId));
  await db.delete(passwordCredentialsTable).where(eq(passwordCredentialsTable.email, otherEmail));
  await db.delete(authUsersTable).where(eq(authUsersTable.id, otherUserId));
  await db.delete(authSessionsTable).where(eq(authSessionsTable.userId, thirdUserId));
  await db.delete(passwordCredentialsTable).where(eq(passwordCredentialsTable.email, thirdEmail));
  await db.delete(authUsersTable).where(eq(authUsersTable.id, thirdUserId));
  closeSyncHub();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

test("sync domain errors are client errors while infrastructure failures are retryable", () => {
  assert.equal(syncErrorStatus(new SyncDomainError("invalid sync input")), 400);
  assert.equal(syncErrorStatus(new Error("database unavailable")), 503);
  assert.equal(syncErrorStatus({}), 503);
});

test("duplicate client operations return one canonical committed result", async () => {
  const operation = {
    clientOperationId: `comment-${marker}`,
    operationType: "create_comment",
    payload: { id: `comment-sync-test-${marker}`, body: "one server comment" },
  };
  const first = await request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(operation),
  });
  const second = await request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(operation),
  });
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(first.body.duplicate, false);
  assert.equal(second.body.duplicate, true);
  assert.equal(first.body.event.id, second.body.event.id);
  assert.equal(first.body.record.version, second.body.record.version);
  const snapshot = await readSyncSnapshot(userId);
  assert.ok(snapshot.cursor >= first.body.event.id);
  assert.equal(snapshot.records.find(record => record.id === operation.payload.id).payload.body, "one server comment");
});

test("book operations upsert full canonical payloads and leave a tombstone on delete", async () => {
  const id = `book-sync-test-${marker}`;
  const book = {
    id,
    title: "Cross-device book",
    coverColor: "#123456",
    authorId: "client-supplied-owner",
    authorName: "Sync Test",
    authorAvatarColor: "#abcdef",
    description: "A complete book payload",
    genre: "Roman",
    chapters: [],
    likesCount: 0,
    commentsCount: 0,
    rating: 0,
    ratingCount: 0,
    readCount: 0,
    isFeatured: false,
    isEditorChoice: false,
    isDraft: true,
    createdAt: new Date().toISOString(),
    tags: ["sync"],
  };
  const create = await request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      clientOperationId: `book-create-${marker}`,
      operationType: "create_book",
      payload: book,
    }),
  });
  assert.equal(create.response.status, 200, JSON.stringify(create.body));
  assert.equal(create.body.record.payload.authorId, userId);
  assert.equal(create.body.record.payload.coverUrl, undefined);

  const update = await request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      clientOperationId: `book-update-${marker}`,
      operationType: "update_book",
      payload: { ...book, title: "Updated cross-device book" },
    }),
  });
  assert.equal(update.response.status, 200);
  assert.equal(update.body.record.payload.title, "Updated cross-device book");
  assert.equal(update.body.record.version, create.body.record.version + 1);

  const hostileUpdate = await request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${otherToken}` },
    body: JSON.stringify({
      clientOperationId: `book-hostile-${marker}`,
      operationType: "update_book",
      payload: { ...book, title: "Hostile overwrite" },
    }),
  });
  assert.equal(hostileUpdate.response.status, 400);

  const remove = await request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      clientOperationId: `book-delete-${marker}`,
      operationType: "delete_book",
      payload: { id },
    }),
  });
  assert.equal(remove.response.status, 200);
  assert.equal(remove.body.record.payload.deleted, true);
  const [tombstone] = await db.select().from(syncRecordsTable).where(eq(syncRecordsTable.id, id));
  assert.ok(tombstone.deletedAt);
  const snapshot = await readSyncSnapshot(userId);
  assert.equal(snapshot.records.find(record => record.id === id).payload.deleted, true);
});

test("draft books stay owner-only until publication and then reach other devices", async () => {
  const id = `book-draft-sync-test-${marker}`;
  const book = {
    id,
    title: "Private draft",
    coverColor: "#123456",
    authorId: "client-supplied-owner",
    authorName: "Sync Test",
    authorAvatarColor: "#abcdef",
    description: "A draft that must not leak",
    genre: "Roman",
    chapters: [],
    likesCount: 0,
    commentsCount: 0,
    rating: 0,
    ratingCount: 0,
    readCount: 0,
    isFeatured: false,
    isEditorChoice: false,
    isDraft: true,
    createdAt: new Date().toISOString(),
    tags: ["draft"],
  };
  const otherBefore = await readSyncSnapshot(otherUserId);
  const create = await request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      clientOperationId: `book-draft-create-${marker}`,
      operationType: "create_book",
      payload: book,
    }),
  });
  assert.equal(create.response.status, 200, JSON.stringify(create.body));
  assert.equal(create.body.record.payload.isDraft, true);
  assert.equal((await readSyncSnapshot(userId)).records.some(record => record.id === id), true);
  assert.equal((await readSyncSnapshot(otherUserId)).records.some(record => record.id === id), false);
  assert.equal((await replayEvents(otherUserId, otherBefore.cursor)).some(event => event.entityId === id), false);

  const publish = await request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      clientOperationId: `book-draft-publish-${marker}`,
      operationType: "update_book",
      payload: { ...book, isDraft: false, title: "Published book" },
    }),
  });
  assert.equal(publish.response.status, 200, JSON.stringify(publish.body));
  assert.equal(publish.body.record.payload.isDraft, false);
  assert.equal((await readSyncSnapshot(otherUserId)).records.some(record => record.id === id), true);
  assert.equal((await replayEvents(otherUserId, otherBefore.cursor)).some(event => event.entityId === id), true);

  const publishedCursor = (await readSyncSnapshot(otherUserId)).cursor;
  const rejectedUnpublish = await request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      clientOperationId: `book-draft-reject-unpublish-${marker}`,
      operationType: "update_book",
      payload: { ...book, isDraft: true },
    }),
  });
  assert.equal(rejectedUnpublish.response.status, 400);
  const [stillPublished] = await db.select().from(syncRecordsTable).where(eq(syncRecordsTable.id, id));
  assert.equal(stillPublished.isPublic, true);
  assert.equal(stillPublished.payload.isDraft, false);
  assert.equal((await readSyncSnapshot(otherUserId)).records.find(record => record.id === id).payload.isDraft, false);
  assert.equal((await replayEvents(otherUserId, publishedCursor)).some(event => event.entityId === id), false);
});

test("rejects a hostile client-id collision without changing ownership or audience", async () => {
  const collision = await request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${otherToken}` },
    body: JSON.stringify({
      clientOperationId: `hostile-${marker}`,
      operationType: "create_comment",
      payload: {
        id: `comment-sync-test-${marker}`,
        body: "hostile overwrite",
        actorUserId: otherUserId,
      },
    }),
  });
  assert.equal(collision.response.status, 400);
  const [record] = await db.select().from(syncRecordsTable).where(eq(
    syncRecordsTable.id,
    `comment-sync-test-${marker}`,
  ));
  assert.equal(record.ownerUserId, userId);
  assert.equal(record.isPublic, true);
  assert.deepEqual(record.audienceUserIds, []);
  assert.equal(record.payload.body, "one server comment");
});

test("publishes committed private events and filters the reloaded event by audience", async () => {
  const receivedByOwner = [];
  const receivedByRecipient = [];
  const receivedByUnrelatedUser = [];
  const subscribers = [
    { userId, token, chunks: receivedByOwner },
    { userId: otherUserId, token: otherToken, chunks: receivedByRecipient },
    { userId: thirdUserId, token: thirdToken, chunks: receivedByUnrelatedUser },
  ].map(({ userId: subscriberUserId, token: subscriberToken, chunks }) => ({
    userId: subscriberUserId,
    sessionTokenHash: hashSessionToken(subscriberToken),
    sessionExpiresAt: new Date(Date.now() + 60_000),
    replaying: false,
    pending: [],
    response: {
      writableEnded: false,
      write(chunk) {
        chunks.push(String(chunk));
      },
    },
  }));
  subscribers.forEach(addSyncSubscriber);
  try {
    const result = await request("/sync/operations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        clientOperationId: `private-message-${marker}`,
        operationType: "create_message",
        payload: {
          id: `message-sync-test-${marker}`,
          recipientUserId: otherUserId,
          body: "private event",
        },
      }),
    });
    assert.equal(result.response.status, 200);
    const deadline = Date.now() + 1_000;
    while (receivedByRecipient.length === 0 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(receivedByOwner.join("").includes(`id: ${result.body.event.id}`));
    assert.ok(receivedByRecipient.join("").includes(`id: ${result.body.event.id}`));
    assert.equal(receivedByUnrelatedUser.length, 0);
  } finally {
    subscribers.forEach(removeSyncSubscriber);
  }
});

test("message interactions preserve private audience and reject unrelated users", async () => {
  const targetId = `message-private-interaction-${marker}`;
  const created = await request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      clientOperationId: `private-interaction-message-${marker}`,
      operationType: "create_message",
      payload: { id: targetId, recipientUserId: otherUserId, body: "private target" },
    }),
  });
  assert.equal(created.response.status, 200);

  const chunks = { owner: [], recipient: [], unrelated: [] };
  const subscribers = [
    [userId, token, chunks.owner],
    [otherUserId, otherToken, chunks.recipient],
    [thirdUserId, thirdToken, chunks.unrelated],
  ].map(([subscriberUserId, subscriberToken, received]) => ({
    userId: subscriberUserId,
    sessionTokenHash: hashSessionToken(subscriberToken),
    sessionExpiresAt: new Date(Date.now() + 60_000),
    replaying: false,
    pending: [],
    response: {
      writableEnded: false,
      write(chunk) {
        received.push(String(chunk));
      },
    },
  }));
  subscribers.forEach(addSyncSubscriber);
  try {
    const recipientLike = await request("/sync/operations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${otherToken}` },
      body: JSON.stringify({
        clientOperationId: `private-interaction-recipient-${marker}`,
        operationType: "toggle_like",
        payload: { targetType: "message", targetId, active: true },
      }),
    });
    assert.equal(recipientLike.response.status, 200);
    assert.equal(recipientLike.body.event.payload.activeCount, 1);
    assert.equal(recipientLike.body.event.payload.actorUserId, otherUserId);

    const ownerLike = await request("/sync/operations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        clientOperationId: `private-interaction-owner-${marker}`,
        operationType: "toggle_like",
        payload: { targetType: "message", targetId, active: true },
      }),
    });
    assert.equal(ownerLike.response.status, 200);
    assert.equal(ownerLike.body.event.payload.activeCount, 2);
    await drainSyncEventQueueForTest();

    const [interactionRecord] = await db.select().from(syncRecordsTable).where(eq(
      syncRecordsTable.id,
      `interaction:like:${otherUserId}:message:${targetId}`,
    ));
    assert.equal(interactionRecord.isPublic, false);
    assert.deepEqual(interactionRecord.audienceUserIds?.sort(), [otherUserId, userId].sort());
    assert.equal(ownerLike.body.event.payload.targetId, targetId);
    assert.ok(chunks.owner.join("").includes(`id: ${ownerLike.body.event.id}`));
    assert.ok(chunks.recipient.join("").includes(`id: ${ownerLike.body.event.id}`));
    assert.equal(chunks.unrelated.join("").includes(`id: ${ownerLike.body.event.id}`), false);

    const unrelated = await request("/sync/operations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${thirdToken}` },
      body: JSON.stringify({
        clientOperationId: `private-interaction-unrelated-${marker}`,
        operationType: "toggle_like",
        payload: { targetType: "message", targetId, active: true },
      }),
    });
    assert.equal(unrelated.response.status, 400);
    assert.equal(unrelated.body.error.includes(targetId), false);
  } finally {
    subscribers.forEach(removeSyncSubscriber);
  }
});

test("revoked SSE sessions are revalidated and ended before private delivery", async () => {
  const currentSnapshot = await request("/sync/snapshot", {
    headers: { authorization: `Bearer ${token}` },
  });
  const stream = await fetch(`${baseUrl}/sync/events?cursor=${currentSnapshot.body.cursor}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const connected = await reader.read();
  assert.match(new TextDecoder().decode(connected.value), /connected/);

  const logout = await request("/auth/session", {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(logout.response.status, 204);

  const event = await request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${otherToken}` },
    body: JSON.stringify({
      clientOperationId: `revoked-private-${marker}`,
      operationType: "create_message",
      payload: {
        id: `message-revoked-${marker}`,
        recipientUserId: userId,
        body: "must not be delivered",
      },
    }),
  });
  assert.equal(event.response.status, 200);
  const ended = await Promise.race([
    reader.read(),
    new Promise(resolve => setTimeout(() => resolve({ done: false, value: new Uint8Array() }), 1_000)),
  ]);
  assert.equal(ended.done, true);
  await reader.cancel();
  const login = await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "SyncPass!16" }),
  });
  assert.equal(login.response.status, 200);
  token = login.body.token;
});

test("serializes out-of-order notifications by durable event id", async () => {
  const first = await request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      clientOperationId: `order-one-${marker}`,
      operationType: "create_comment",
      payload: { id: `comment-sync-order-one-${marker}`, body: "one" },
    }),
  });
  const second = await request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      clientOperationId: `order-two-${marker}`,
      operationType: "create_comment",
      payload: { id: `comment-sync-order-two-${marker}`, body: "two" },
    }),
  });
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  await drainSyncEventQueueForTest();

  const chunks = [];
  const subscriber = {
    userId,
    sessionTokenHash: hashSessionToken(token),
    sessionExpiresAt: new Date(Date.now() + 60_000),
    replaying: false,
    pending: [],
    response: {
      writableEnded: false,
      write(chunk) {
        chunks.push(String(chunk));
      },
    },
  };
  addSyncSubscriber(subscriber);
  try {
    resetSyncHubCursorForTest(first.body.event.id - 1);
    enqueueSyncEventNotificationForTest(second.body.event.id);
    enqueueSyncEventNotificationForTest(first.body.event.id);
    await drainSyncEventQueueForTest();
    const ids = chunks.join("").match(/^id: \d+$/gm)
      .map(line => Number(line.slice(4)));
    assert.deepEqual(ids, [first.body.event.id, second.body.event.id]);
  } finally {
    removeSyncSubscriber(subscriber);
  }
});

test("serializes event allocation through commit and keeps snapshot and hub cursors contiguous", async () => {
  const priorSnapshot = await readSyncSnapshot(userId);
  const lowerEntityId = `sync-commit-order-lower-${marker}`;
  const higherEntityId = `sync-commit-order-higher-${marker}`;
  let releaseFirstTransaction;
  const firstTransactionReleased = new Promise(resolve => {
    releaseFirstTransaction = resolve;
  });
  let firstEventReady;
  const firstEventReadyPromise = new Promise(resolve => {
    firstEventReady = resolve;
  });
  const firstTransaction = db.transaction(async tx => {
    const id = await reserveSyncEventId(tx);
    await insertSyncEvent(tx, id, {
      entityType: "comment",
      entityId: lowerEntityId,
      isPublic: true,
      audienceUserIds: null,
      payload: { body: "lower event" },
      createdAt: new Date(),
    });
    firstEventReady(id);
    await firstTransactionReleased;
    return id;
  });

  let lowerId;
  try {
    lowerId = await firstEventReadyPromise;
    const higherOperation = request("/sync/operations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        clientOperationId: `commit-order-${marker}`,
        operationType: "create_comment",
        payload: { id: higherEntityId, body: "higher event" },
      }),
    });
    const completedBeforeFirstCommit = await Promise.race([
      higherOperation.then(() => true),
      new Promise(resolve => setTimeout(() => resolve(false), 100)),
    ]);
    assert.equal(completedBeforeFirstCommit, false);

    const openSnapshot = await readSyncSnapshot(userId);
    assert.equal(openSnapshot.cursor, priorSnapshot.cursor);

    releaseFirstTransaction();
    const [committedLowerId, higher] = await Promise.all([firstTransaction, higherOperation]);
    assert.equal(committedLowerId, lowerId);
    assert.equal(higher.response.status, 200);
    assert.ok(higher.body.event.id > lowerId);
    assert.equal(higher.body.event.payload.recordVersion, 1);

    const replayed = await replayEvents(userId, priorSnapshot.cursor);
    const expectedIds = [lowerId, higher.body.event.id];
    const replayedIds = replayed.map(event => event.id).filter(id => expectedIds.includes(id));
    assert.deepEqual(replayedIds, expectedIds);

    await drainSyncEventQueueForTest();
    const chunks = [];
    const subscriber = {
      userId,
      sessionTokenHash: hashSessionToken(token),
      sessionExpiresAt: new Date(Date.now() + 60_000),
      replaying: false,
      pending: [],
      response: {
        writableEnded: false,
        write(chunk) {
          chunks.push(String(chunk));
        },
      },
    };
    addSyncSubscriber(subscriber);
    try {
      resetSyncHubCursorForTest(priorSnapshot.cursor);
      enqueueSyncEventNotificationForTest(higher.body.event.id);
      enqueueSyncEventNotificationForTest(lowerId);
      await drainSyncEventQueueForTest();
      const hubIds = chunks.join("").match(/^id: \d+$/gm)
        .map(line => Number(line.slice(4)))
        .filter(id => expectedIds.includes(id));
      assert.deepEqual(hubIds, expectedIds);
    } finally {
      removeSyncSubscriber(subscriber);
    }
  } finally {
    releaseFirstTransaction();
    await firstTransaction;
  }
});

test("timestamps interaction aggregates after lock order and replay converges to snapshot", async () => {
  const targetId = `interaction-order-target-${marker}`;
  const target = await request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      clientOperationId: `interaction-order-target-${marker}`,
      operationType: "create_comment",
      payload: { id: targetId, body: "interaction lock target" },
    }),
  });
  assert.equal(target.response.status, 200);
  const before = await readSyncSnapshot(userId);

  let releaseFirst;
  const firstReleased = new Promise(resolve => {
    releaseFirst = resolve;
  });
  let firstAtPreLock;
  const firstAtPreLockPromise = new Promise(resolve => {
    firstAtPreLock = resolve;
  });
  let hookCalls = 0;
  setInteractionPreLockHookForTest(async () => {
    hookCalls += 1;
    if (hookCalls === 1) {
      firstAtPreLock();
      await firstReleased;
    }
  });

  let firstOperation;
  try {
    firstOperation = request("/sync/operations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        clientOperationId: `interaction-order-first-${marker}`,
        operationType: "toggle_like",
        payload: { targetType: "comment", targetId, active: true },
      }),
    });
    await firstAtPreLockPromise;

    // The first request arrived first but is paused before its aggregate lock.
    // The second request therefore acquires the lock and commits first.
    const second = await request("/sync/operations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${otherToken}` },
      body: JSON.stringify({
        clientOperationId: `interaction-order-second-${marker}`,
        operationType: "toggle_like",
        payload: { targetType: "comment", targetId, active: true },
      }),
    });
    assert.equal(second.response.status, 200);
    assert.equal(hookCalls, 2);
    await new Promise(resolve => setTimeout(resolve, 30));

    releaseFirst();
    const first = await firstOperation;
    assert.equal(first.response.status, 200);
    assert.ok(second.body.event.id < first.body.event.id);
    assert.equal(second.body.event.payload.aggregateRevision, second.body.event.id);
    assert.equal(first.body.event.payload.aggregateRevision, first.body.event.id);
    assert.ok(first.body.event.payload.aggregateRevision > second.body.event.payload.aggregateRevision);
    assert.ok(new Date(second.body.event.createdAt) <= new Date(first.body.event.createdAt));
    assert.ok(new Date(second.body.record.updatedAt) <= new Date(first.body.record.updatedAt));

    const replayed = await replayEvents(userId, before.cursor);
    const expectedIds = [second.body.event.id, first.body.event.id];
    const ordered = replayed.filter(event => expectedIds.includes(event.id));
    assert.deepEqual(ordered.map(event => event.id), expectedIds);

    const applied = new Map();
    for (const event of ordered) {
      assert.equal(event.payload.aggregateRevision, event.id);
      const payload = { ...event.payload };
      delete payload.recordVersion;
      applied.set(event.entityId, payload);
    }
    const snapshot = await readSyncSnapshot(userId);
    const laterRecord = snapshot.records.find(record => record.id === first.body.event.entityId);
    assert.ok(laterRecord);
    assert.equal(laterRecord.payload.aggregateRevision, first.body.event.payload.aggregateRevision);
    for (const [entityId, payload] of applied) {
      const record = snapshot.records.find(candidate => candidate.id === entityId);
      assert.ok(record);
      assert.deepEqual(record.payload, payload);
    }
  } finally {
    releaseFirst();
    setInteractionPreLockHookForTest(null);
    if (firstOperation) await firstOperation.catch(() => {});
  }
});

test("replay paging returns every visible event in ascending order", async () => {
  const rows = await db.insert(syncEventsTable).values(
    Array.from({ length: SYNC_REPLAY_BATCH_SIZE + 3 }, (_, index) => ({
      entityType: "comment",
      entityId: `sync-replay-batch-${marker}-${index}`,
      isPublic: true,
      audienceUserIds: [],
      payload: { index },
      createdAt: new Date(),
    })),
  ).returning({ id: syncEventsTable.id });
  const start = Math.min(...rows.map(row => row.id)) - 1;
  const replayed = await replayEvents(userId, start);
  const ids = new Set(rows.map(row => row.id));
  const replayedIds = replayed.map(event => event.id).filter(id => ids.has(id));
  assert.deepEqual(replayedIds, rows.map(row => row.id).sort((left, right) => left - right));
});

test("desired-state likes and rating replacement keep one user-target interaction", async () => {
  const operation = {
    clientOperationId: `like-${marker}-one`,
    operationType: "toggle_like",
    payload: { targetType: "comment", targetId: `comment-sync-test-${marker}`, active: true },
  };
  const secondOperation = {
    ...operation,
    clientOperationId: `like-${marker}-two`,
  };
  const requests = await Promise.all([operation, secondOperation].map(operationInput => request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(operationInput),
  })));
  assert.ok(requests.every(({ response }) => response.status === 200));
  const [interaction] = await db.select().from(syncInteractionsTable).where(and(
    eq(syncInteractionsTable.userId, userId),
    eq(syncInteractionsTable.targetId, `comment-sync-test-${marker}`),
    eq(syncInteractionsTable.interactionType, "like"),
  ));
  assert.ok(interaction);
  assert.equal(interaction.active, true);
  assert.equal(requests[0].body.event.payload.activeCount, 1);
  assert.equal(requests[1].body.event.payload.activeCount, 1);
  const likeRetry = await request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(secondOperation),
  });
  assert.equal(likeRetry.response.status, 200);
  assert.equal(likeRetry.body.event.payload.activeCount, 1);
  const snapshot = await request("/sync/snapshot", {
    headers: { authorization: `Bearer ${token}` },
  });
  const likeRecord = snapshot.body.records.find(record =>
    record.id === `interaction:like:${userId}:comment:comment-sync-test-${marker}`,
  );
  assert.equal(likeRecord.payload.activeCount, 1);

  const voteOperation = {
    clientOperationId: `vote-${marker}-three`,
    operationType: "toggle_vote",
    payload: { targetType: "comment", targetId: `comment-sync-test-${marker}`, rating: 3 },
  };
  const replacementVote = {
    ...voteOperation,
    clientOperationId: `vote-${marker}-five`,
    payload: { ...voteOperation.payload, rating: 5 },
  };
  const firstVote = await request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(voteOperation),
  });
  const secondVote = await request("/sync/operations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(replacementVote),
  });
  assert.equal(firstVote.response.status, 200);
  assert.equal(secondVote.response.status, 200);
  const votes = await db.select().from(syncInteractionsTable).where(and(
    eq(syncInteractionsTable.userId, userId),
    eq(syncInteractionsTable.targetId, `comment-sync-test-${marker}`),
    eq(syncInteractionsTable.interactionType, "vote"),
  ));
  assert.equal(votes.length, 1);
  assert.equal(votes[0].active, true);
  assert.equal(votes[0].value, "5");
  assert.equal(firstVote.body.event.payload.rating, 3);
  assert.equal(secondVote.body.event.payload.rating, 5);
  assert.equal(firstVote.body.event.payload.ratingCount, 1);
  assert.equal(firstVote.body.event.payload.ratingAverage, 3);
  assert.equal(secondVote.body.event.payload.ratingCount, 1);
  assert.equal(secondVote.body.event.payload.ratingAverage, 5);
  assert.equal(secondVote.body.event.payload.value, undefined);
});

test("comment aggregates include legacy rows without parent_id across create and delete", async () => {
  const parentId = `comment-parent-legacy-${marker}`;
  const legacyId = `comment-legacy-${marker}`;
  const createdId = `comment-new-${marker}`;
  await db.insert(syncRecordsTable).values({
    id: legacyId,
    entityType: "comment",
    ownerUserId: userId,
    isPublic: true,
    audienceUserIds: [],
    payload: {
      id: legacyId,
      postId: parentId,
      body: "legacy comment",
      actorUserId: userId,
    },
    parentId: null,
    version: 1,
    deletedAt: null,
  });

  try {
    const created = await request("/sync/operations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        clientOperationId: `comment-legacy-create-${marker}`,
        operationType: "create_comment",
        payload: { id: createdId, postId: parentId, body: "new comment" },
      }),
    });
    assert.equal(created.response.status, 200);
    assert.equal(created.body.event.payload.parentId, parentId);
    assert.equal(created.body.event.payload.commentsCount, 2);
    assert.equal(created.body.event.payload.aggregateRevision, created.body.event.id);

    const deleted = await request("/sync/operations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        clientOperationId: `comment-legacy-delete-${marker}`,
        operationType: "delete_comment",
        payload: { id: createdId },
      }),
    });
    assert.equal(deleted.response.status, 200);
    assert.equal(deleted.body.event.payload.parentId, parentId);
    assert.equal(deleted.body.event.payload.commentsCount, 1);
    assert.equal(deleted.body.event.payload.aggregateRevision, deleted.body.event.id);
  } finally {
    await db.delete(syncRecordsTable).where(eq(syncRecordsTable.id, legacyId));
    await db.delete(syncRecordsTable).where(eq(syncRecordsTable.id, createdId));
    await db.delete(syncEventsTable).where(eq(syncEventsTable.entityId, legacyId));
    await db.delete(syncEventsTable).where(eq(syncEventsTable.entityId, createdId));
  }
});