export interface AggregateVersion {
  updatedAt: string;
  tieBreaker: string;
  aggregateRevision?: number;
}

function validRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Compare server-owned absolute aggregates. A revision is authoritative even
 * when events have identical timestamps or arrive in arbitrary actor order.
 * Legacy records without revisions retain the timestamp/tie-breaker behavior.
 */
export function shouldApplyAggregateVersion(
  previous: AggregateVersion | undefined,
  next: AggregateVersion,
): boolean {
  if (!previous) return true;

  const previousRevisioned = validRevision(previous.aggregateRevision);
  const nextRevisioned = validRevision(next.aggregateRevision);
  if (previousRevisioned || nextRevisioned) {
    if (previousRevisioned && nextRevisioned) {
      return next.aggregateRevision! > previous.aggregateRevision!;
    }
    // A canonical revision supersedes legacy state, but legacy state can never
    // roll a revisioned aggregate back.
    return nextRevisioned;
  }

  const previousTime = Date.parse(previous.updatedAt);
  const nextTime = Date.parse(next.updatedAt);
  if (Number.isFinite(previousTime) && Number.isFinite(nextTime) && previousTime !== nextTime) {
    return nextTime > previousTime;
  }
  if (previous.updatedAt !== next.updatedAt) {
    return next.updatedAt > previous.updatedAt;
  }
  return next.tieBreaker > previous.tieBreaker;
}
