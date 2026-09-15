import { cleanupPasswordResetTokens } from "./password-reset-cleanup";
import { logger } from "./logger";

export const PASSWORD_RESET_CLEANUP_INTERVAL_MS = 60 * 60 * 1_000;

export function startPasswordResetTokenCleanup(): NodeJS.Timeout {
  const run = async () => {
    try {
      const deletedCount = await cleanupPasswordResetTokens();
      if (deletedCount > 0) {
        logger.info({ deletedCount }, "Cleaned up password reset tokens");
      }
    } catch (error) {
      logger.error({ err: error }, "Password reset token cleanup failed");
    }
  };

  void run();
  const timer = setInterval(() => {
    void run();
  }, PASSWORD_RESET_CLEANUP_INTERVAL_MS);
  timer.unref();
  return timer;
}