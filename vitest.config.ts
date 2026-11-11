import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["artifacts/**/tests/**/*.test.{ts,tsx}"],
    testTimeout: 20000,
    hookTimeout: 30000,
    maxWorkers: 2,
    clearMocks: true,
  },
});
