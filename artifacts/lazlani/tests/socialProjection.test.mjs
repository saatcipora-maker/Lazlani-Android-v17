import assert from 'node:assert/strict';
import {
  absoluteAggregateValue,
  reconcileCommentCount,
  resolveCommentParentId,
  sortPostsByCreatedAt,
} from '../services/postProjection.ts';

const posts = [
  { id: 'b', createdAt: '2025-01-01T00:00:00.000Z' },
  { id: 'a', createdAt: '2025-01-01T00:00:00.000Z' },
  { id: 'new', createdAt: '2025-01-02T00:00:00.000Z' },
];
assert.deepEqual(sortPostsByCreatedAt(posts).map(post => post.id), ['new', 'b', 'a']);
assert.equal(absoluteAggregateValue({ aggregateCount: 4 }, 1), 4);
assert.equal(absoluteAggregateValue({ absoluteCount: 0 }, 4), 0);
assert.equal(absoluteAggregateValue({ aggregateCount: 'invalid' }, 4), 4);
assert.equal(resolveCommentParentId({ parentId: 'post-parent' }, 'fallback'), 'post-parent');
assert.equal(resolveCommentParentId({ postId: 'post-id' }, 'fallback'), 'post-id');
assert.equal(resolveCommentParentId({ targetId: 'post-target' }), 'post-target');
assert.equal(resolveCommentParentId({ deleted: true }, 'fallback'), 'fallback');

// A locally removed optimistic comment must still accept the server's absolute
// count; a concurrent add must not be double-counted during tombstone replay.
assert.equal(reconcileCommentCount(5, 4, -1, true, true), 4);
assert.equal(reconcileCommentCount(4, 5, 1, true, true), 5);