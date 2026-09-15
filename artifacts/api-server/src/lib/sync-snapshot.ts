import { desc, eq, or, sql } from "drizzle-orm";
import { db, syncEventsTable, syncRecordsTable } from "@workspace/db";

function objectPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function syncRecordForClient(record: typeof syncRecordsTable.$inferSelect) {
  return {
    id: record.id,
    entityType: record.entityType,
    payload: objectPayload(record.payload),
    version: record.version,
    updatedAt: record.updatedAt,
  };
}

/**
 * Read both the materialized records and cursor from one MVCC snapshot.
 * Repeatable-read/read-only prevents a commit between the two queries from
 * producing a cursor that does not describe the records returned.
 */
export async function readSyncSnapshot(userId: string) {
  return db.transaction(async tx => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`);
    const visibleRecords = or(
      eq(syncRecordsTable.isPublic, true),
      sql`${syncRecordsTable.audienceUserIds} @> ARRAY[${userId}]::text[]`,
    );
    const rows = await tx.select().from(syncRecordsTable)
      .where(visibleRecords)
      .orderBy(desc(syncRecordsTable.updatedAt));
    const [latest] = await tx.select({ id: syncEventsTable.id }).from(syncEventsTable)
      .where(visibleEvents(userId))
      .orderBy(desc(syncEventsTable.id)).limit(1);
    return {
      cursor: latest?.id ?? 0,
      // Tombstones are part of the snapshot so a device that was offline for
      // a delete cannot resurrect the old projection when it advances its
      // cursor past the delete event.
      records: rows.map(syncRecordForClient),
    };
  });
}

function visibleEvents(userId: string) {
  return or(
    eq(syncEventsTable.isPublic, true),
    sql`${syncEventsTable.audienceUserIds} @> ARRAY[${userId}]::text[]`,
  );
}