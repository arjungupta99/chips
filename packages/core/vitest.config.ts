import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "core",
    include: ["src/**/*.test.ts"],
    // Most of core is pure and runs under Node. The pieces that touch a real socket, IndexedDB
    // or WebCrypto are covered by the Playwright suite instead (see vitest.config.ts at the
    // root), because faking them here would test the fakes.
    environment: "node",
  },
});
