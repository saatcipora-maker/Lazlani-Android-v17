import { sql } from "drizzle-orm";
import { syncEventsTable } from "@workspace/db";

/**
 * PostgreSQL sequences allocate values before a transaction commits. Keep the
 * allocation and insertion behind one transaction-scoped lock so an event
 * with a higher id cannot commit before an event with a lower id.
 */
const SYNC_EVENT_SEQUENCE_LOCK = "sync-events-sequence";

type SyncTransaction = Parameters<Parameters<typeof import("@workspace/db").db.transaction>[0]>[0];

export async function reserveSyncEventId(tx: SyncTransaction): Promise<number> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${SYNC_EVENT_SEQUENCE_LOCK}))`);
  const result = await tx.execute(sql`
    SELECT nextval(pg_get_serial_sequence('sync_events', 'id')) AS id
  `);
  const row = (result as unknown as { rows?: Array<{ id: number | string }> }).rows?.[0];
  const id = row ? Number(row.id) : Number.NaN;
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error("Sync event sequence did not return a valid id");
  }
  return id;
}

export async function insertSyncEvent(
  tx: SyncTransaction,
  id: number,
  values: Omit<typeof syncEventsTable.$inferInsert, "id">,
) {
  // Re-acquiring a transaction-scoped advisory lock is safe and makes this
  // helper correct when called independently of reserveSyncEventId.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${SYNC_EVENT_SEQUENCE_LOCK}))`);
  const [event] = await tx.insert(syncEventsTable).values({ id, ...values }).returning();
  if (!event) throw new Error("Sync event could not be saved");
  return event;
}