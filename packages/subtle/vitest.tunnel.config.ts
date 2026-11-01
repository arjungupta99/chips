import { defineConfig } from "vitest/config";

/**
 * The tunnel's own suite, run against this package's `subtle` rather than Node's.
 *
 * Not part of `pnpm test` for this package, because the files under test belong to another; the
 * root `vitest.config.ts` names it as a project of its own, so `pnpm check` runs it. If the
 * tunnel passes here, a phone with no `crypto.subtle` can open one.
 */
export default defineConfig({
  test: {
    name: "subtle-tunnel",
    root: new URL(".", import.meta.url).pathname,
    include: ["../tunnel/src/**/*.test.ts"],
    setupFiles: ["./src/testing/install.ts"],
    environment: "node",
  },
});
