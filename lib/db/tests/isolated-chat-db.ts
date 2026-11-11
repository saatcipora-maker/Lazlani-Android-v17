import { randomUUID } from "node:crypto";
import pg from "pg";
import { is, SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgDialect, PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../src/schema";

// Never use public tables, migrations, seeds or live app fixtures.
const schemaName = `chat_regression_${randomUUID().replaceAll("-", "")}`;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Chat regressions require TEST_DATABASE_URL or the development DATABASE_URL.");
if (process.env.NODE_ENV === "production") throw new Error("Never run chat regressions in production.");
const pool = new pg.Pool({ connectionString, options: `-c search_path=${schemaName}`, max: 16 });
export const db = drizzle(pool);
export const contentLifecyclePool = new pg.Pool({ connectionString, options: `-c search_path=${schemaName}`, max: 2 });
const tables = Object.values(schema).filter((value) => is(value, PgTable));

export async function setupDatabase() {
  await pool.query(`CREATE SCHEMA ${quote(schemaName)}`);
  const dialect = new PgDialect();
  for (const table of tables) {
    const config = getTableConfig(table);
    const columns = config.columns.map((column) => {
      const defaultValue = column.default === undefined ? "" : ` DEFAULT ${
        column.default instanceof SQL
          ? dialect.sqlToQuery(column.default).sql
          : typeof column.default === "string" ? `'${column.default.replaceAll("'", "''")}'` : String(column.default)
      }`;
      return `${quote(column.name)} ${column.getSQLType()}${column.notNull ? " NOT NULL" : ""}${defaultValue}${column.primary ? " PRIMARY KEY" : ""}`;
    });
    for (const key of config.primaryKeys) {
      columns.push(`PRIMARY KEY (${key.columns.map((column) => quote(column.name)).join(", ")})`);
    }
    await pool.query(`CREATE TABLE ${quote(schemaName)}.${quote(config.name)} (${columns.join(", ")})`);
  }
}

export async function resetDatabase() {
  await pool.query(`DROP TRIGGER IF EXISTS regression_insert_delay ON ${quote(schemaName)}.favori_room_messages`);
  await pool.query(`DROP TRIGGER IF EXISTS regression_insert_failure ON ${quote(schemaName)}.favori_room_messages`);
  await pool.query(`TRUNCATE ${tables.map((table) => `${quote(schemaName)}.${quote(getTableConfig(table).name)}`).join(", ")}`);
}

export async function failRoomInserts() {
  await pool.query(`CREATE OR REPLACE FUNCTION ${quote(schemaName)}.fail_insert()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Simulated message insert failure'; END $$`);
  await pool.query(`CREATE TRIGGER regression_insert_failure BEFORE INSERT
    ON ${quote(schemaName)}.favori_room_messages FOR EACH ROW
    EXECUTE FUNCTION ${quote(schemaName)}.fail_insert()`);
}

export async function delayRoomInserts() {
  // Make count-then-insert races observable, rather than depending on machine speed.
  // The production profile row lock must serialize requests even during this delay.
  await pool.query(`CREATE OR REPLACE FUNCTION ${quote(schemaName)}.delay_insert()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.04); RETURN NEW; END $$`);
  await pool.query(`CREATE TRIGGER regression_insert_delay BEFORE INSERT
    ON ${quote(schemaName)}.favori_room_messages FOR EACH ROW
    EXECUTE FUNCTION ${quote(schemaName)}.delay_insert()`);
}

export async function closeDatabase() {
  try {
    await pool.query(`DROP SCHEMA IF EXISTS ${quote(schemaName)} CASCADE`);
  } finally {
    await pool.end();
    await contentLifecyclePool.end();
  }
}
