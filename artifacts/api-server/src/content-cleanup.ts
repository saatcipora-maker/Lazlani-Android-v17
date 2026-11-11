import { pool, contentLifecyclePool } from "@workspace/db";
import { cleanupContent } from "./lib/contentCleanup";
import { logger } from "./lib/logger";

try {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply")) throw new Error("Only --apply is accepted; no arguments means read-only preview.");
  const report = await cleanupContent({ apply: args.includes("--apply") });
  logger.info({ contentCleanup: report }, "Content cleanup finished");
  if (report.failures) process.exitCode = 1;
} catch (error) {
  logger.error({ err: error }, "Content cleanup failed");
  process.exitCode = 1;
} finally {
  await Promise.all([pool.end(), contentLifecyclePool.end()]);
}
