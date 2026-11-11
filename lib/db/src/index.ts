import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Separate from query connections: waiting for lifecycle locks must not exhaust
// the pool needed by the operation holding the lock.
export const contentLifecyclePool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
export const db = drizzle(pool, { schema });

export * from "./schema/index.js";
