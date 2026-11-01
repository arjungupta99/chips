import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Every CLI test runs against a throwaway config directory.
 *
 * This is a guard, not a convenience. `chips connect` writes to the config directory of whoever
 * is running it, and a test that forgets to say where that is would edit the developer's own —
 * which is exactly what happened once, on 4 September 2026, before this existed. Pointing the
 * environment somewhere harmless by default means forgetting is no longer enough to do damage.
 */
const sandbox = mkdtempSync(join(tmpdir(), "chips-cli-tests-"));

export default defineConfig({
  test: {
    name: "cli",
    include: ["src/**/*.test.ts"],
    environment: "node",
    env: {
      CHIPS_CONFIG_HOME: join(sandbox, "config"),
      // The login keychain is the developer's too. A test that wants one injects a fake.
      CHIPS_NO_KEYCHAIN: "true",
    },
    // `doctor` and the export round trip open real SQLite files in a temporary directory.
    testTimeout: 30_000,
  },
});
