import { defineConfig } from "vitest/config";
import { buildDefines } from "./vite.config.ts";

export default defineConfig({
  // The build's version and commit, which You's foot names, as the app is built with them.
  define: buildDefines(),
  test: {
    name: "web",
    include: ["src/**/*.test.{ts,tsx}"],
    // The shell is tested in a DOM, one behaviour per test, against a fake store: a message
    // renders on the right when it is mine, Approve calls the store, Edit is disabled. What a
    // browser paints, and the real socket and cache, are the Playwright suite's (`e2e/`).
    environment: "jsdom",
    setupFiles: ["./src/testing/setup.ts"],
  },
});
