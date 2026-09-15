import assert from 'node:assert/strict';
import { commitSyncEvent } from '../services/syncEventCommit.ts';
import { mergeProjectionRecords } from '../services/syncProjectionJournal.ts';
import { reconcileCommentCount } from '../services/postProjection.ts';

const post = {
  id: 'post-1',
  entityType: 'post',
  version: 1,
  updatedAt: '2025-01-01T00:00:00.000Z',
  payload: { id: 'post-1', createdAt: '2025-01-01T00:00:00.000Z' },
};
const tombstone = {
  ...post,
  version: 2,
  updatedAt: '2025-01-02T00:00:00.000Z',
  payload: { id: 'post-1', deleted: true },
};
assert.equal(mergeProjectionRecords([post], [tombstone])[0].payload.deleted, true);
assert.equal(mergeProjectionRecords([tombstone], [post])[0].payload.deleted, true);

assert.equal(reconcileCommentCount(2, undefined, 1, true, false), 2);
assert.equal(reconcileCommentCount(2, undefined, 1, false, false), 3);
assert.equal(reconcileCommentCount(3, 2, -1, false, true), 2);

let cursor = 4;
let applied = 0;
const event = {
  id: 5,
  entityId: 'post-1',
  entityType: 'post',
  createdAt: '2025-01-02T00:00:00.000Z',
  payload: { id: 'post-1', deleted: true },
};
assert.equal(await commitSyncEvent({
  event,
  currentCursor: cursor,
  userId: 'user-1',
  isActive: () => true,
  persistRecord: async () => {},
  persistCursor: async () => {},
  setCursor: value => { cursor = value; },
  applyRecord: () => { applied += 1; },
}), true);
assert.equal(cursor, 5);
assert.equal(applied, 1);
assert.equal(await commitSyncEvent({
  event,
  currentCursor: cursor,
  userId: 'user-1',
  isActive: () => true,
  persistRecord: async () => { throw new Error('must not replay'); },
  persistCursor: async () => {},
  setCursor: () => {},
  applyRecord: () => { throw new Error('must not replay'); },
}), false);

let retryCursor = 5;
let retryApplied = 0;
assert.equal(await commitSyncEvent({
  event: { ...event, id: 6 },
  currentCursor: retryCursor,
  userId: 'user-1',
  isActive: () => true,
  persistRecord: async () => { throw new Error('temporary projection failure'); },
  persistCursor: async () => { throw new Error('must not advance cursor'); },
  setCursor: value => { retryCursor = value; },
  applyRecord: () => { retryApplied += 1; },
}).catch(() => false), false);
assert.equal(retryCursor, 5);
assert.equal(retryApplied, 0);