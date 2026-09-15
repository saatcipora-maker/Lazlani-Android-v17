import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch as expoFetch } from 'expo/fetch';
import { randomUUID } from 'expo-crypto';
import {
  getSyncSnapshot,
  submitSyncOperation,
  type SyncEvent,
  type SyncOperationInput,
  type SyncOperationType,
  type SyncRecord,
} from '@workspace/api-client-react';
import { commitSyncEvent } from '@/services/syncEventCommit';
import {
  mergeProjectionRecords,
  projectionEntityKey,
} from '@/services/syncProjectionJournal';
export type { SyncEventCommitOptions } from '@/services/syncEventCommit';

const QUEUE_KEY = 'lazlani_sync_queue';
const CURSOR_KEY = 'lazlani_sync_cursor';
/** Durable, account-scoped canonical records used to recover a projection. */
export const PROJECTION_JOURNAL_KEY = 'lazlani_sync_projection';
/** Kept as an alias for callers that used the original projection key. */
export const PROJECTION_KEY = PROJECTION_JOURNAL_KEY;

export function scopedSyncKey(baseKey: string, userId: string): string {
  return `${baseKey}:${encodeURIComponent(userId)}`;
}

export function syncEntityId(kind: string, userId: string): string {
  return `${encodeURIComponent(kind)}-${encodeURIComponent(userId)}-${randomUUID()}`;
}

export function isSyncEntityId(value: string, kind: string, userId: string): boolean {
  const prefix = `${encodeURIComponent(kind)}-${encodeURIComponent(userId)}-`;
  return value.startsWith(prefix) && value.length > prefix.length;
}

export interface QueuedSyncOperation extends SyncOperationInput {
  queuedAt: string;
  ownerUserId?: string;
}

export type PermanentFailureHandler = (operation: QueuedSyncOperation) => void;
export type PreparedSyncOperation = Pick<QueuedSyncOperation, 'clientOperationId' | 'operationType' | 'payload'>;

export interface ParsedSseResult {
  events: SyncEvent[];
  remainder: string;
}

export { commitSyncEvent } from '@/services/syncEventCommit';

export type SyncFailureDisposition = 'drop' | 'retry';

/**
 * A malformed/unauthorized operation cannot become valid by retrying and
 * must not poison the FIFO. Timeouts, rate limits, transport failures and
 * server failures remain queued for an ordered retry.
 */
export function classifySyncFailure(error: unknown): SyncFailureDisposition {
  const status = error && typeof error === 'object'
    ? (error as { status?: unknown }).status
    : undefined;
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429
    ? 'drop'
    : 'retry';
}

/**
 * Parse a complete or partial SSE buffer. Keeping this pure makes the parser
 * usable in tests and, more importantly, means reconnects never lose a
 * partially received event.
 */
export function parseSseBuffer(input: string): ParsedSseResult {
  const events: SyncEvent[] = [];
  const blocks = input.split(/\r?\n\r?\n/);
  const remainder = blocks.pop() ?? '';
  for (const block of blocks) {
    let id: number | undefined;
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('id:')) {
        const value = Number(line.slice(3).trim());
        if (Number.isInteger(value)) id = value;
      } else if (line.startsWith('data:')) {
        data.push(line.slice(5).trimStart());
      }
    }
    if (!data.length) continue;
    try {
      const event = JSON.parse(data.join('\n')) as SyncEvent;
      if (id !== undefined && event.id === undefined) event.id = id;
      if (typeof event.id === 'number' && event.payload) events.push(event);
    } catch {
      // A malformed event must not terminate the stream. The server sends
      // JSON, while heartbeat/comment frames intentionally have no data.
    }
  }
  return { events, remainder };
}

function operationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function apiOrigin(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : '';
}

type ApplyRecord = (record: SyncRecord, own: boolean) => void;

export class SyncService {
  private queue: QueuedSyncOperation[] = [];
  private queueLoaded: Promise<void>;
  private cursorLoaded: Promise<void>;
  private projectionLoaded: Promise<void>;
  private queueWrite: Promise<void> = Promise.resolve();
  private projectionWrite: Promise<void> = Promise.resolve();
  private projection = new Map<string, SyncRecord>();
  private userId: string | null = null;
  private token: string | null = null;
  private cursor = 0;
  private running = false;
  private processing = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private queueRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private queueRetryAttempts = 0;
  private reconnectAttempts = 0;
  private abortController: AbortController | null = null;
  private applyRecord: ApplyRecord;
  private onPermanentFailure?: PermanentFailureHandler;
  private sessionGeneration = 0;

  constructor(applyRecord: ApplyRecord, onPermanentFailure?: PermanentFailureHandler) {
    this.applyRecord = applyRecord;
    this.onPermanentFailure = onPermanentFailure;
    this.queueLoaded = Promise.resolve();
    this.cursorLoaded = Promise.resolve();
    this.projectionLoaded = Promise.resolve();
  }

  async enqueue(
    operationType: SyncOperationType,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const generation = this.sessionGeneration;
    const userId = this.userId;
    const token = this.token;
    await this.queueLoaded;
    if (generation !== this.sessionGeneration || userId !== this.userId || token !== this.token) {
      throw new Error('Stale sync session');
    }
    await this.cursorLoaded;
    if (generation !== this.sessionGeneration || userId !== this.userId || token !== this.token) {
      throw new Error('Stale sync session');
    }
    const operation: QueuedSyncOperation = {
      clientOperationId: operationId(),
      operationType,
      payload,
      queuedAt: new Date().toISOString(),
      ownerUserId: this.userId ?? undefined,
    };
    this.queue.push(operation);
    await this.persistQueue(userId, generation);
    if (generation !== this.sessionGeneration || userId !== this.userId || token !== this.token) {
      throw new Error('Stale sync session');
    }
    void this.processQueue();
    return operation.clientOperationId;
  }

  async enqueuePrepared(operations: PreparedSyncOperation[]): Promise<void> {
    const generation = this.sessionGeneration;
    const userId = this.userId;
    await this.queueLoaded;
    if (generation !== this.sessionGeneration || userId !== this.userId) {
      throw new Error('Stale sync session');
    }
    await this.cursorLoaded;
    if (generation !== this.sessionGeneration || userId !== this.userId || !userId) {
      throw new Error('Cannot enqueue prepared operations without a user session');
    }
    for (const operation of operations) {
      if (this.queue.some(item => item.clientOperationId === operation.clientOperationId)) continue;
      this.queue.push({
        ...operation,
        queuedAt: new Date().toISOString(),
        ownerUserId: userId,
      });
    }
    await this.persistQueue(userId, generation);
    if (generation !== this.sessionGeneration || userId !== this.userId) {
      throw new Error('Stale sync session');
    }
  }

  setSession(userId: string | null, token: string | null): void {
    if (this.userId === userId && this.token === token) return;
    const sameUser = this.userId === userId;
    this.stop();
    this.sessionGeneration += 1;
    this.userId = userId;
    this.token = token;
    if (!sameUser) {
      this.queue = [];
      this.cursor = 0;
      this.projection.clear();
      this.projectionWrite = Promise.resolve();
    }
    if (userId && token) {
      if (!sameUser) {
        this.queueLoaded = this.loadQueue(userId);
        this.cursorLoaded = this.loadCursor(userId);
        this.projectionLoaded = this.loadProjection(userId);
      }
      this.running = true;
      void this.start();
    }
  }

  /** Select a user's durable queue without opening network activity yet. */
  prepareSession(userId: string): void {
    if (this.userId === userId && !this.token) return;
    this.stop();
    this.sessionGeneration += 1;
    this.userId = userId;
    this.token = null;
    this.queue = [];
    this.cursor = 0;
    this.projection.clear();
    this.projectionWrite = Promise.resolve();
    this.queueLoaded = this.loadQueue(userId);
    this.cursorLoaded = this.loadCursor(userId);
    this.projectionLoaded = this.loadProjection(userId);
  }

  private async loadQueue(userId: string): Promise<void> {
    const value = await AsyncStorage.getItem(scopedSyncKey(QUEUE_KEY, userId));
    if (this.userId !== userId) return;
    if (!value) return;
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && this.userId === userId) this.queue = parsed;
    } catch {
      this.queue = [];
    }
  }

  private async loadCursor(userId: string): Promise<void> {
    const value = await AsyncStorage.getItem(scopedSyncKey(CURSOR_KEY, userId));
    if (this.userId !== userId) return;
    const parsed = Number(value ?? 0);
    if (this.userId === userId && Number.isInteger(parsed) && parsed >= 0) this.cursor = parsed;
  }

  private async loadProjection(userId: string): Promise<void> {
    const value = await AsyncStorage.getItem(scopedSyncKey(PROJECTION_KEY, userId));
    if (this.userId !== userId) return;
    if (!value) return;
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed) || this.userId !== userId) return;
      this.projection = new Map(mergeProjectionRecords([], parsed as SyncRecord[])
        .map(record => [projectionEntityKey(record), record]));
    } catch {
      this.projection.clear();
    }
  }

  private async persistProjection(
    records: SyncRecord[],
    generation: number,
    userId: string,
    token: string,
  ): Promise<void> {
    await this.projectionLoaded;
    if (!this.isCurrentSession(generation, userId, token)) throw new Error('Stale sync projection');
    const write = this.projectionWrite.catch(() => undefined).then(async () => {
      if (!this.isCurrentSession(generation, userId, token)) throw new Error('Stale sync projection');
      const merged = mergeProjectionRecords([...this.projection.values()], records);
      const serialized = JSON.stringify(merged);
      await AsyncStorage.setItem(scopedSyncKey(PROJECTION_KEY, userId), serialized);
      if (!this.isCurrentSession(generation, userId, token)) throw new Error('Stale sync projection');
      this.projection = new Map(merged.map(record => [projectionEntityKey(record), record]));
    });
    this.projectionWrite = write;
    await write;
    if (!this.isCurrentSession(generation, userId, token)) throw new Error('Stale sync projection');
  }

  private async persistQueue(
    userId = this.userId,
    generation = this.sessionGeneration,
  ): Promise<void> {
    if (!userId) return;
    const serialized = JSON.stringify(this.queue);
    const write = this.queueWrite.catch(() => undefined).then(async () => {
      if (this.userId !== userId || this.sessionGeneration !== generation) return;
      await AsyncStorage.setItem(scopedSyncKey(QUEUE_KEY, userId), serialized);
      if (this.userId !== userId || this.sessionGeneration !== generation) return;
    });
    this.queueWrite = write;
    await write;
  }

  private async persistCursor(
    cursor: number,
    generation: number,
    userId: string,
    token: string,
  ): Promise<void> {
    if (!this.isCurrentSession(generation, userId, token)) return;
    await AsyncStorage.setItem(scopedSyncKey(CURSOR_KEY, userId), String(cursor));
    if (!this.isCurrentSession(generation, userId, token)) return;
  }

  private async start(): Promise<void> {
    const generation = this.sessionGeneration;
    const userId = this.userId;
    const token = this.token;
    await this.queueLoaded;
    if (!this.isCurrentSession(generation, userId, token)) return;
    await this.cursorLoaded;
    if (!this.isCurrentSession(generation, userId, token)) return;
    await this.projectionLoaded;
    if (!this.isCurrentSession(generation, userId, token) || !userId || !token) return;
    try {
      // Restore durable canonical state before asking the server for a
      // cursor-based delta. A crash can therefore only replay records.
      for (const record of this.projection.values()) {
        if (!this.isCurrentSession(generation, userId, token)) return;
        this.applyRecord(record, record.payload.actorUserId === userId);
      }
      const snapshot = await getSyncSnapshot(
        this.cursor ? { cursor: this.cursor } : undefined,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!this.isCurrentSession(generation, userId, token)) return;
      await this.persistProjection(snapshot.records, generation, userId, token);
      if (!this.isCurrentSession(generation, userId, token)) return;
      for (const record of snapshot.records) {
        this.applyRecord(record, record.payload.actorUserId === userId);
      }
      const nextCursor = Math.max(this.cursor, snapshot.cursor);
      if (nextCursor > this.cursor) {
        await this.persistCursor(nextCursor, generation, userId, token);
        if (!this.isCurrentSession(generation, userId, token)) return;
        this.cursor = nextCursor;
      }
      // Open the stream only after the authoritative snapshot has merged.
      void this.readEvents(generation, userId, token);
      void this.processQueue(generation, userId);
    } catch {
      this.scheduleReconnect();
    }
  }

  private async processQueue(
    generation = this.sessionGeneration,
    userId = this.userId ?? '',
    token = this.token ?? '',
  ): Promise<void> {
    await this.queueLoaded;
    if (this.processing || !this.isCurrentSession(generation, userId, token)) return;
    this.processing = true;
    try {
      while (this.isCurrentSession(generation, userId, token) && this.queue.length) {
        const operationIndex = this.queue.findIndex(item =>
          !item.ownerUserId || item.ownerUserId === this.userId);
        if (operationIndex < 0) break;
        const operation = this.queue[operationIndex];
        try {
          const { ownerUserId: _ownerUserId, queuedAt: _queuedAt, ...input } = operation;
          const result = await submitSyncOperation(input, {
            headers: { Authorization: `Bearer ${token}` },
          });
           if (!this.isCurrentSession(generation, userId, token)
             || operation.ownerUserId && operation.ownerUserId !== this.userId) break;
           await this.persistProjection([result.record], generation, userId, token);
           if (!this.isCurrentSession(generation, userId, token)) break;
          this.applyRecord(result.record, true);
           if (!this.isCurrentSession(generation, userId, token)) break;
          this.queue.splice(operationIndex, 1);
           await this.persistQueue(userId, generation);
           if (!this.isCurrentSession(generation, userId, token)) break;
          this.queueRetryAttempts = 0;
          if (this.queueRetryTimer) clearTimeout(this.queueRetryTimer);
          this.queueRetryTimer = null;
        } catch (error) {
           if (!this.isCurrentSession(generation, userId, token)) break;
          if (classifySyncFailure(error) === 'drop') {
            // The operation is permanently invalid for this server contract.
            // Keep no sensitive payload in diagnostics; later operations can
            // continue in FIFO order after this one is discarded.
            this.onPermanentFailure?.(operation);
            this.queue.splice(operationIndex, 1);
             await this.persistQueue(userId, generation);
             if (!this.isCurrentSession(generation, userId, token)) break;
            continue;
          }
          // Preserve order: a transient failure must not let later writes pass
          // the failed operation. SSE/snapshot reconnect retries it.
           if (this.isCurrentSession(generation, userId, token) && !this.queueRetryTimer) {
            const delay = Math.min(30_000, 1_000 * Math.pow(2, Math.min(5, this.queueRetryAttempts++)));
            this.queueRetryTimer = setTimeout(() => {
              this.queueRetryTimer = null;
              void this.processQueue();
            }, delay);
          }
          break;
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async readEvents(
    generation = this.sessionGeneration,
    userId = this.userId ?? '',
    token = this.token ?? '',
  ): Promise<void> {
    if (!this.isCurrentSession(generation, userId, token)) return;
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;
    try {
      const query = this.cursor ? `?cursor=${encodeURIComponent(this.cursor)}` : '';
      const response = await expoFetch(`${apiOrigin()}/api/sync/events${query}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
          ...(this.cursor ? { 'Last-Event-ID': String(this.cursor) } : {}),
        },
        signal: controller.signal,
      });
      if (!this.isCurrentSession(generation, userId, token)) return;
      if (!response.ok || !response.body) throw new Error(`Sync stream failed (${response.status})`);
      this.reconnectAttempts = 0;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (this.isCurrentSession(generation, userId, token)) {
        const next = await reader.read();
        if (!this.isCurrentSession(generation, userId, token)) return;
        if (next.done) break;
        buffer += decoder.decode(next.value, { stream: true });
        const parsed = parseSseBuffer(buffer);
        buffer = parsed.remainder;
        for (const event of parsed.events) {
           const committed = await commitSyncEvent({
             event,
             currentCursor: this.cursor,
             userId,
             isActive: () => this.isCurrentSession(generation, userId, token),
             persistRecord: record => this.persistProjection([record], generation, userId, token),
             persistCursor: () => this.persistCursor(event.id, generation, userId, token),
             setCursor: cursor => { this.cursor = cursor; },
             applyRecord: this.applyRecord,
           });
            if (!this.isCurrentSession(generation, userId, token)) return;
            if (!committed) break;
        }
      }
      if (this.isCurrentSession(generation, userId, token)) this.scheduleReconnect();
    } catch {
      if (this.isCurrentSession(generation, userId, token)) this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer) return;
    const delay = Math.min(30_000, 1_000 * Math.pow(2, Math.min(5, this.reconnectAttempts++)));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.start();
    }, delay);
  }

  private isCurrentSession(
    generation: number,
    userId: string | null,
    token: string | null,
  ): boolean {
    return this.sessionGeneration === generation
      && this.running
      && this.userId === userId
      && this.token === token;
  }

  private stop(): void {
    this.running = false;
    this.abortController?.abort();
    this.abortController = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.queueRetryTimer) clearTimeout(this.queueRetryTimer);
    this.queueRetryTimer = null;
  }
}

export { CURSOR_KEY, QUEUE_KEY };