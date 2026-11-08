import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * The end-to-end test starts the whole demo: `chipsd` in dev mode, and the web app pointed at
 * it, in a throwaway data directory. That is deliberate — the thing being tested is the demo
 * script from the technical plan, so the test runs the demo script.
 */

/**
 * A fresh directory for every run. The demo bootstrap is idempotent and reuses a workspace it
 * finds, so a second run against the same directory would open on the previous run's
 * space rather than the empty one the script starts from. Playwright evaluates this file
 * in the runner and again in each worker; the workers inherit the environment, so they see the
 * directory the runner made rather than making their own. The spec reads the same variable.
 */
const DATA_DIR = process.env["CHIPS_E2E_DATA_DIR"] ?? mkdtempSync(join(tmpdir(), "chips-e2e-"));
process.env["CHIPS_E2E_DATA_DIR"] = DATA_DIR;

/** Both ports are yours to choose, so a laptop that has something else on 5174 can still run this. */
const WEB_PORT = process.env["CHIPS_E2E_WEB_PORT"] ?? "5174";
const SERVER_PORT = process.env["CHIPS_E2E_SERVER_PORT"] ?? "4432";
/** The relay the server dials out to (M4.1), so `relay.spec.ts` can reach it from "away". */
const RELAY_PORT = process.env["CHIPS_E2E_RELAY_PORT"] ?? "4433";
process.env["CHIPS_E2E_RELAY_PORT"] = RELAY_PORT;
/** The production build, for the one spec that measures speed (`windowing.spec.ts`). */
const BUILD_PORT = process.env["CHIPS_E2E_BUILD_PORT"] ?? "5175";
process.env["CHIPS_E2E_BUILD_PORT"] = BUILD_PORT;

/**
 * A window the three columns all fit (ADR 0284): at Desktop Chrome's own 1280 a run's panel has no
 * column to stand in, and a page beside the list crowds the list out.
 */
const THREE_COLUMNS = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  // A flaky test is a bug (technical-plan 6.3). Retries would hide one.
  retries: 0,
  timeout: 60_000,
  reporter: process.env["CI"] === undefined ? "list" : [["list"], ["html", { open: "never" }]],
  globalTeardown: "./e2e/teardown.ts",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /(scale|windowing|restart|page)\.spec\.ts$/,
      use: THREE_COLUMNS,
    },
    // The app as the server itself serves it, from the build the `scale` project makes: the one
    // place a browser is on the plain link and reaches the page door (ADR 0201), since a device
    // holding the server's key goes through a tunnel (ADR 0191), as the Vite-served app does.
    {
      name: "served",
      testMatch: /page\.spec\.ts$/,
      dependencies: ["chromium"],
      use: { ...THREE_COLUMNS, baseURL: `http://127.0.0.1:${SERVER_PORT}` },
    },
    // A touch window, for the media viewer's touch path: the swipe, the drag to dismiss and the
    // pinch all arrive as pointer events, and a viewport this narrow is where the filmstrip goes
    // (§4.3). Only the viewer's spec runs here; everything else is proven once, on the desktop.
    // The `tablet` project is the phone app's web target's, in `apps/mobile`.
    {
      name: "pixel",
      testMatch: /viewer\.spec\.ts$/,
      dependencies: ["chromium"],
      use: { ...devices["Pixel 7"], hasTouch: true },
    },
    // These go last: between them the scale runs leave eleven thousand messages and twenty
    // harnesses in the demo workspace, and the restart spec takes the server away from everything
    // else. The timings the other specs record are worth more against a small log.
    {
      name: "scale",
      testMatch: /(scale|windowing|restart)\.spec\.ts$/,
      dependencies: ["chromium"],
      use: THREE_COLUMNS,
    },
  ],
  webServer: [
    // The relay first, so the server finds it on its first dial; it would find it on a later
    // one anyway, with backoff.
    {
      command: "pnpm --filter @chipschat/relay exec tsx bin/chips-relay.ts",
      url: `http://127.0.0.1:${RELAY_PORT}/health`,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        CHIPS_RELAY_HOST: "127.0.0.1",
        CHIPS_RELAY_PORT: RELAY_PORT,
        CHIPS_LOG_LEVEL: "info",
      },
    },
    {
      command: "pnpm --filter @chipschat/server exec tsx bin/chipsd.ts serve",
      url: `http://127.0.0.1:${SERVER_PORT}/v1/health`,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        CHIPS_DEV_MODE: "true",
        CHIPS_PORT: SERVER_PORT,
        CHIPS_LOG_LEVEL: "info",
        CHIPS_DATABASE_URL: `sqlite:${DATA_DIR}/chips.db`,
        // An approval that expires in a second is resolved within another (M1.4's expiry test).
        CHIPS_SWEEP_SECONDS: "1",
        // The gallery's cards, as a release carries them (HS-1): `join.spec.ts` opens a bridge's.
        CHIPS_CONNECTORS: join(import.meta.dirname, "..", "docs", "public", "connectors.json"),
        // The server dials out to the relay beside it (M4.1): a browser "away" from the network
        // reaches it through the relay in `relay.spec.ts`.
        CHIPS_RELAY_URL: `ws://127.0.0.1:${RELAY_PORT}`,
        // Pushes go nowhere: without this, a server with no token sends through Chips's push
        // relay (ADR 0246), and a suite has no business reaching the live one.
        CHIPS_PUSH_URL: "http://127.0.0.1:9",
        // Whisper and a model, where this machine has them: `voice.spec.ts` checks the words then.
        ...(process.env["CHIPS_WHISPER_MODEL"] === undefined
          ? {}
          : { CHIPS_WHISPER_MODEL: process.env["CHIPS_WHISPER_MODEL"] }),
      },
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      // Send feedback is drawn here before its switch is on (ADR 0237), for `send-feedback.spec.ts`.
      env: { CHIPS_TARGET: `http://127.0.0.1:${SERVER_PORT}`, CHIPS_FEEDBACK: "1" },
    },
    // The same app built as it ships, for the frame budget: the budget is the product's, and
    // development React's checks as it renders put the dev server over it on CI's runner
    // (13 September 2026). Built on each run, which takes under a second, so what is measured is
    // never a stale build.
    {
      command: `pnpm exec vite build --logLevel warn && pnpm exec vite preview --port ${BUILD_PORT} --strictPort`,
      url: `http://127.0.0.1:${BUILD_PORT}`,
      reuseExistingServer: false,
      env: { CHIPS_TARGET: `http://127.0.0.1:${SERVER_PORT}` },
    },
  ],
});
