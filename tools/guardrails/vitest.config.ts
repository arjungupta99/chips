import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "guardrails",
    include: ["*.test.ts"],
    environment: "node",
    // Each case shells out to dependency-cruiser over a fixture tree.
    testTimeout: 60_000,
  },
});
