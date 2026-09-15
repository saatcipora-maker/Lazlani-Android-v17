import assert from 'node:assert/strict';
import { planLegacyMigration } from '../services/legacyMigrationPlanner.ts';
import { resolveLegacyOwnerUserId } from '../services/authStorageBinding.ts';
import { commitSyncEvent } from '../services/syncEventCommit.ts';
import { mergeProjectionRecords, projectionEntityKey } from '../services/syncProjectionJournal.ts';
import { shouldApplyAggregateVersion } from '../services/aggregateVersion.ts';

const userId = 'user-a';
const input = {
  conversations: [{ id: 'old-conv', participantId: 'user-b' }],
  messagesByConv: {
    'old-conv': [
      { id: 'outgoing', conversationId: 'old-conv', senderId: userId, content: 'mine' },
      { id: 'incoming', conversationId: 'old-conv', senderId: 'user-b', content: 'theirs' },
    ],
  },
  comments: [{
    id: 'comment-1',
    authorId: userId,
    content: 'mine',
    replies: [{ id: 'reply-in', authorId: 'user-b', commentId: 'comment-1' }],
  }],
  postComments: [{
    id: 'post-comment',
    postId: 'regular-post',
    authorId: userId,
  }],
  ozelPosts: [
    { id: 'owned-video', authorId: userId },
    { id: 'other-video', authorId: 'user-b' },
  ],
  ozelComments: [
    { id: 'owned-ozel-comment', postId: 'owned-video', authorId: userId },
    { id: 'owned-on-other-video', postId: 'other-video', authorId: userId },
    { id: 'other-ozel-comment', postId: 'other-video', authorId: 'user-b' },
  ],
  likedIds: ['book-1'],
  postCommentLikedIds: ['post-comment'],
  ozelLikedIds: ['owned-video', 'other-video'],
  ozelCommentLikedIds: ['owned-ozel-comment', 'other-ozel-comment'],
  userRatings: { 'book-1': 4 },
  reactions: [
    { targetId: 'post-comment', targetType: 'post_comment', value: '❤️' },
    { targetId: 'owned-ozel-comment', targetType: 'ozel_comment', value: '🔥' },
  ],
  passthroughScopedWrites: { lazlani_notifications: [{ id: 'n1' }] },
};

const plan = planLegacyMigration(input, userId, userId);
assert.equal(plan.eligible, true);
assert.equal(plan.operations.filter(operation => operation.operationType === 'create_message').length, 1);
assert.equal(plan.operations.filter(operation => operation.operationType === 'create_comment').length, 2);
assert.equal(plan.operations.some(operation => operation.payload.id === 'incoming'), false);
assert.equal(plan.operations.some(operation => operation.payload.id === 'reply-in'), false);
assert.equal(plan.operations.some(operation => operation.operationType === 'toggle_like'), true);
assert.equal(plan.operations.some(operation => operation.operationType === 'set_reaction'), true);
assert.deepEqual(plan.scopedWrites.lazlani_notifications, [{ id: 'n1' }]);
assert.equal(plan.operations.some(operation => operation.operationType === 'create_notification'), false);
assert.equal(plan.scopedWrites.lazlani_post_comments[0].postId, 'regular-post');
assert.notEqual(plan.scopedWrites.lazlani_ozel_comments[0].postId, 'owned-video');
assert.equal(plan.scopedWrites.lazlani_ozel_comments[1].postId, 'other-video');
assert.equal(plan.scopedWrites.lazlani_ozel_comments[2].postId, 'other-video');
const normalizedPostCommentId = plan.scopedWrites.lazlani_post_comments[0].id;
const normalizedOzelVideoId = plan.scopedWrites.lazlani_ozel_posts[0].id;
const normalizedOzelCommentId = plan.scopedWrites.lazlani_ozel_comments[0].id;
assert.equal(plan.scopedWrites.lazlani_post_comment_likes[0], normalizedPostCommentId);
assert.equal(plan.scopedWrites.lazlani_ozel_likes[0], normalizedOzelVideoId);
assert.equal(plan.scopedWrites.lazlani_ozel_likes[1], 'other-video');
assert.equal(plan.scopedWrites.lazlani_ozel_comment_likes[0], normalizedOzelCommentId);
assert.equal(plan.scopedWrites.lazlani_ozel_comment_likes[1], 'other-ozel-comment');
assert.equal(plan.operations.some(operation =>
  operation.operationType === 'toggle_like'
  && operation.payload.targetId === normalizedPostCommentId), true);
assert.equal(plan.operations.some(operation =>
  operation.operationType === 'toggle_like'
  && operation.payload.targetId === normalizedOzelVideoId), true);
assert.equal(plan.operations.some(operation =>
  operation.operationType === 'set_reaction'
  && operation.payload.targetId === normalizedPostCommentId), true);
assert.equal(plan.operations.some(operation =>
  operation.operationType === 'set_reaction'
  && operation.payload.targetId === normalizedOzelCommentId), true);
assert.equal(plan.scopedWrites.lazlani_messages[Object.keys(plan.scopedWrites.lazlani_messages)[0]][1].id, 'incoming');

const rerun = planLegacyMigration(input, userId, userId);
assert.deepEqual(
  plan.operations.map(operation => operation.clientOperationId),
  rerun.operations.map(operation => operation.clientOperationId),
);

const mismatched = planLegacyMigration(input, 'different-user', userId);
assert.deepEqual(mismatched, { eligible: false, scopedWrites: {}, operations: [] });
const capturedMismatch = planLegacyMigration(input, 'old-account', userId);
assert.equal(capturedMismatch.eligible, false);
assert.equal(capturedMismatch.operations.length, 0);
assert.equal(capturedMismatch.scopedWrites.lazlani_notifications, undefined);

const oldLayout = JSON.stringify({ id: userId, displayName: 'Legacy User' });
assert.equal(resolveLegacyOwnerUserId(null, oldLayout), userId);
assert.equal(resolveLegacyOwnerUserId(oldLayout, oldLayout), userId);
const historicalPlan = planLegacyMigration(
  input,
  resolveLegacyOwnerUserId(null, oldLayout),
  userId,
);
assert.equal(historicalPlan.eligible, true);
assert.equal(historicalPlan.operations.some(operation => operation.operationType === 'create_message'), true);
assert.equal(Object.keys(historicalPlan.scopedWrites.lazlani_messages).length, 1);
assert.equal(resolveLegacyOwnerUserId(
  JSON.stringify({ id: 'new-user' }),
  oldLayout,
), null);
assert.equal(resolveLegacyOwnerUserId(null, null), null);

let generation = 1;
let activeUser = userId;
let cursor = 3;
let persisted = 0;
let applied = 0;
let releasePersistence;
const barrier = new Promise(resolve => { releasePersistence = resolve; });
const inFlight = commitSyncEvent({
  event: {
    id: 4,
    entityId: 'message-1',
    entityType: 'message',
    createdAt: '2025-01-01T00:00:00.000Z',
    payload: { actorUserId: userId },
  },
  currentCursor: cursor,
  userId,
  isActive: () => generation === 1 && activeUser === userId,
  persistRecord: async () => { await barrier; },
  persistCursor: async () => {
    persisted += 1;
    await barrier;
  },
  setCursor: value => { cursor = value; },
  applyRecord: () => { applied += 1; },
});
generation = 2;
activeUser = 'new-user';
releasePersistence();
assert.equal(await inFlight, false);
assert.equal(cursor, 3);
assert.equal(applied, 0);

let stalePersisted = 0;
let staleApplied = 0;
const stale = await commitSyncEvent({
  event: {
    id: 5,
    entityId: 'message-2',
    entityType: 'message',
    createdAt: '2025-01-01T00:00:01.000Z',
    payload: { actorUserId: userId },
  },
  currentCursor: cursor,
  userId,
  isActive: () => false,
  persistRecord: async () => { stalePersisted += 1; },
  persistCursor: async () => { stalePersisted += 1; },
  setCursor: value => { cursor = value; },
  applyRecord: () => { staleApplied += 1; },
});
assert.equal(stale, false);
assert.equal(stalePersisted, 0);
assert.equal(staleApplied, 0);

let failureCursor = 1;
let failureApplied = 0;
const failedProjection = await commitSyncEvent({
  event: {
    id: 2,
    entityId: 'message-3',
    entityType: 'message',
    createdAt: '2025-01-01T00:00:02.000Z',
    payload: { actorUserId: userId },
  },
  currentCursor: failureCursor,
  userId,
  isActive: () => true,
  persistRecord: async () => { throw new Error('projection failed'); },
  persistCursor: async () => { throw new Error('cursor must not persist'); },
  setCursor: value => { failureCursor = value; },
  applyRecord: () => { failureApplied += 1; },
}).catch(() => false);
assert.equal(failedProjection, false);
assert.equal(failureCursor, 1);
assert.equal(failureApplied, 0);

const actorA = {
  id: 'same-target',
  entityType: 'like',
  version: 0,
  updatedAt: '2025-01-01T00:00:01.000Z',
  payload: { actorUserId: 'a', targetId: 'target', targetType: 'post', active: true },
};
const actorB = { ...actorA, payload: { ...actorA.payload, actorUserId: 'b' } };
const mergedJournal = mergeProjectionRecords([actorA], [actorB]);
assert.equal(mergedJournal.length, 2);
assert.notEqual(projectionEntityKey(actorA), projectionEntityKey(actorB));

const manyEntities = Array.from({ length: 600 }, (_, index) => ({
  id: `message-${index}`,
  entityType: 'message',
  version: 1,
  updatedAt: '2025-01-01T00:00:00.000Z',
  payload: { actorUserId: userId },
}));
assert.equal(mergeProjectionRecords([], manyEntities).length, manyEntities.length);

const sameTimestamp = '2025-01-01T00:00:00.000Z';
assert.equal(shouldApplyAggregateVersion(
  { updatedAt: sameTimestamp, tieBreaker: 'z', aggregateRevision: 4 },
  { updatedAt: sameTimestamp, tieBreaker: 'a', aggregateRevision: 5 },
), true);
assert.equal(shouldApplyAggregateVersion(
  { updatedAt: sameTimestamp, tieBreaker: 'a', aggregateRevision: 5 },
  { updatedAt: sameTimestamp, tieBreaker: 'z', aggregateRevision: 4 },
), false);
assert.equal(shouldApplyAggregateVersion(
  { updatedAt: sameTimestamp, tieBreaker: 'z', aggregateRevision: 5 },
  { updatedAt: sameTimestamp, tieBreaker: 'a', aggregateRevision: 5 },
), false);
assert.equal(shouldApplyAggregateVersion(
  { updatedAt: sameTimestamp, tieBreaker: 'z' },
  { updatedAt: sameTimestamp, tieBreaker: 'a', aggregateRevision: 0 },
), true);
assert.equal(shouldApplyAggregateVersion(
  { updatedAt: sameTimestamp, tieBreaker: 'a', aggregateRevision: 0 },
  { updatedAt: sameTimestamp, tieBreaker: 'z' },
), false);

const snapshotRecords = [
  { updatedAt: sameTimestamp, tieBreaker: 'actor-b', aggregateRevision: 9 },
  { updatedAt: sameTimestamp, tieBreaker: 'actor-a', aggregateRevision: 8 },
];
let revisionedState;
for (const record of snapshotRecords) {
  if (shouldApplyAggregateVersion(revisionedState, record)) revisionedState = record;
}
assert.equal(revisionedState.aggregateRevision, 9);
revisionedState = undefined;
for (const record of [...snapshotRecords].reverse()) {
  if (shouldApplyAggregateVersion(revisionedState, record)) revisionedState = record;
}
assert.equal(revisionedState.aggregateRevision, 9);

let versionedRecord;
await commitSyncEvent({
  event: {
    id: 6,
    entityId: 'versioned-message',
    entityType: 'message',
    createdAt: '2025-01-01T00:00:03.000Z',
    payload: { actorUserId: userId, recordVersion: 7 },
  },
  currentCursor: 5,
  userId,
  isActive: () => true,
  persistRecord: async record => { versionedRecord = record; },
  persistCursor: async () => {},
  setCursor: () => {},
  applyRecord: () => {},
});
assert.equal(versionedRecord.version, 7);

console.log('legacy migration planner tests passed');