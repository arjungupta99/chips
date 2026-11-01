import { defineConfig, devices } from "@playwright/test";

/**
 * The journeys (ADR 0121): a built release, installed by `packaging/install.sh` into a home of its
 * own, started by `chips up`, and walked in a real browser. Nothing here starts a dev server or a
 * dev-mode chipsd; the release does all of it, as it would on a machine that has never had Chips.
 *
 *   node tools/release/build.mjs && pnpm journeys
 *
 * Ports 4450–4459, apart from the web suite's (4432, 4433, 5199) and the phone's (5198).
 */
export default defineConfig({
  testDir: "./journeys",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"]],
  use: { ...devices["Desktop Chrome"], trace: "retain-on-failure" },
});
