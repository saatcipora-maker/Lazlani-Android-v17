import type { SyncEvent, SyncRecord } from '@workspace/api-client-react';

export interface SyncEventCommitOptions {
  event: SyncEvent;
  currentCursor: number;
  isActive: () => boolean;
  /**
   * Optional for backwards-compatible callers. SyncService always supplies
   * this and therefore gets journal-before-cursor durability.
   */
  persistRecord?: (record: SyncRecord) => Promise<void>;
  persistCursor: () => Promise<void>;
  setCursor: (cursor: number) => void;
  applyRecord: (record: SyncRecord, own: boolean) => void;
  userId: string;
}

export async function commitSyncEvent(options: SyncEventCommitOptions): Promise<boolean> {
  const { event, currentCursor, isActive } = options;
  if (!isActive() || event.id <= currentCursor) return false;
  const record: SyncRecord = {
    id: event.entityId,
    entityType: event.entityType,
    payload: event.payload,
    version: typeof event.payload.recordVersion === 'number'
      && Number.isInteger(event.payload.recordVersion)
      && event.payload.recordVersion >= 0
      ? event.payload.recordVersion
      : 0,
    updatedAt: event.createdAt,
  };
  if (options.persistRecord) await options.persistRecord(record);
  if (!isActive()) return false;
  await options.persistCursor();
  if (!isActive()) return false;
  options.setCursor(event.id);
  if (!isActive()) return false;
  options.applyRecord(record, event.payload.actorUserId === options.userId);
  return true;
}