import type { Post } from '@/data/types';

export function sortPostsByCreatedAt(posts: Post[]): Post[] {
  return [...posts].sort((left, right) => {
    const rightTime = new Date(right.createdAt).getTime();
    const leftTime = new Date(left.createdAt).getTime();
    const time = (Number.isFinite(rightTime) ? rightTime : 0)
      - (Number.isFinite(leftTime) ? leftTime : 0);
    return time || right.id.localeCompare(left.id);
  });
}

export function absoluteAggregateValue(payload: Record<string, unknown>, fallback: number): number {
  const value = payload.absoluteCount ?? payload.aggregateCount ?? payload.readCount;
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

export function reconcileCommentCount(
  current: number,
  serverValue: unknown,
  delta: 1 | -1,
  alreadyProjected: boolean,
  absoluteRevisionAccepted: boolean,
): number {
  const absolute = Number(serverValue);
  if (absoluteRevisionAccepted && Number.isFinite(absolute)) return Math.max(0, absolute);
  return Math.max(0, current + (alreadyProjected ? 0 : delta));
}

export function resolveCommentParentId(
  payload: Record<string, unknown>,
  fallback?: string,
): string | undefined {
  const parentId = [payload.parentId, payload.postId, payload.targetId]
    .find(value => typeof value === 'string' && value.length > 0);
  return typeof parentId === 'string' ? parentId : fallback;
}