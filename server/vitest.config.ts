import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "server",
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Integration tests open a real SQLite file in a temporary directory.
    testTimeout: 30_000,
  },
});
