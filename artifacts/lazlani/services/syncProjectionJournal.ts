import type { SyncRecord } from '@workspace/api-client-react';

const INTERACTION_ENTITY_TYPES = new Set(['like', 'reaction', 'vote']);

export function canonicalProjectionId(record: SyncRecord): string {
  if (INTERACTION_ENTITY_TYPES.has(record.entityType)) {
    const payload = record.payload && typeof record.payload === 'object'
      ? record.payload as Record<string, unknown>
      : {};
    const actor = typeof payload.actorUserId === 'string' ? payload.actorUserId : '';
    const target = typeof payload.targetId === 'string' ? payload.targetId : '';
    const targetType = typeof payload.targetType === 'string' ? payload.targetType : '';
    if (actor && target) {
      return `interaction:${record.entityType}:${actor}:${targetType || 'content'}:${target}`;
    }
  }
  return record.id;
}

export function projectionEntityKey(record: SyncRecord): string {
  return `${record.entityType}:${canonicalProjectionId(record)}`;
}

function canonicalProjectionRecord(record: SyncRecord): SyncRecord {
  const id = canonicalProjectionId(record);
  return id === record.id ? record : { ...record, id };
}

export function mergeProjectionRecords(
  existing: SyncRecord[],
  incoming: SyncRecord[],
): SyncRecord[] {
  const byKey = new Map(existing.map(record => {
    const canonical = canonicalProjectionRecord(record);
    return [projectionEntityKey(canonical), canonical];
  }));
  for (const record of incoming) {
    const canonical = canonicalProjectionRecord(record);
    const key = projectionEntityKey(canonical);
    const previous = byKey.get(key);
    if (!previous
      || canonical.version > previous.version
      || (canonical.version === previous.version && canonical.updatedAt >= previous.updatedAt)) {
      byKey.set(key, canonical);
    }
  }
  return [...byKey.values()].sort((left, right) => {
    if (left.version !== right.version) return right.version - left.version;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}