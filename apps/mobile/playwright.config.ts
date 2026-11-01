import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * The phone app under Playwright, through its web target.
 *
 * This is not a substitute for a device — a gesture, a Keychain and a push notification are not
 * here, and the Maestro flows beside this directory say so. What it is, is the only way to run
 * the phone's screens on every commit: the same React, the same store, the same core, driven
 * end to end against a real `chipsd` and a real relay. A regression in what a card says or what
 * a button sends is caught here; a regression in what a swipe feels like is not.
 *
 * Ports are the web suite's — 4432 and 4433 — so this must never run beside it. `pnpm
 * mobile:e2e` is its own command for that reason, and the phone's own port is 5198.
 */

const DATA_DIR =
  process.env["CHIPS_E2E_DATA_DIR"] ?? mkdtempSync(join(tmpdir(), "chips-mobile-e2e-"));
process.env["CHIPS_E2E_DATA_DIR"] = DATA_DIR;

const WEB_PORT = process.env["CHIPS_MOBILE_E2E_PORT"] ?? "5198";
const SERVER_PORT = process.env["CHIPS_E2E_SERVER_PORT"] ?? "4432";
const RELAY_PORT = process.env["CHIPS_E2E_RELAY_PORT"] ?? "4433";
process.env["CHIPS_E2E_RELAY_PORT"] = RELAY_PORT;
process.env["CHIPS_MOBILE_E2E_PORT"] = WEB_PORT;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  // A flaky test is a bug (technical-plan 6.3). Retries would hide one.
  retries: 0,
  timeout: 60_000,
  reporter: process.env["CI"] === undefined ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
    // A phone-sized window, because that is what this app is: the layout has no desktop
    // breakpoint to fall back to, and a spec that passed at 1280 wide would prove nothing about
    // the thing that ships. An iPhone 15's points, under Chromium — the device descriptors
    // default to WebKit, and one browser is enough for what these specs are about.
    browserName: "chromium",
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
  },
  globalTeardown: "./e2e/teardown.ts",
  projects: [
    { name: "chromium", testIgnore: /(asleep|replay|tablet)\.spec\.ts$/ },
    // The same app in an 11-inch iPad's window, upright: the bar becomes a rail and the lists
    // open what they open beside themselves. One spec, and only the window differs.
    {
      name: "tablet",
      testMatch: /tablet\.spec\.ts$/,
      dependencies: ["chromium"],
      use: { viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2 },
    },
    // These go last. The replay spec leaves a thousand messages in the demo space, and the
    // asleep spec takes the server away from everything else; the timings the other specs would
    // record are worth more against a short log.
    { name: "scale", testMatch: /replay\.spec\.ts$/, dependencies: ["tablet"] },
    { name: "asleep", testMatch: /asleep\.spec\.ts$/, dependencies: ["scale"] },
  ],
  webServer: [
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
        CHIPS_SWEEP_SECONDS: "1",
        CHIPS_RELAY_URL: `ws://127.0.0.1:${RELAY_PORT}`,
        // Pushes go nowhere: without this, a server with no token sends through Chips's push
        // relay (ADR 0246), and a suite has no business reaching the live one.
        CHIPS_PUSH_URL: "http://127.0.0.1:9",
        // Where a spec's server has a whisper model, the voice note spec checks the words too.
        ...(process.env["CHIPS_WHISPER_MODEL"] === undefined
          ? {}
          : { CHIPS_WHISPER_MODEL: process.env["CHIPS_WHISPER_MODEL"] }),
      },
    },
    {
      // Exports the bundle and then serves it with `/v1` proxied, so the app is same-origin
      // with the server exactly as a phone is not — see `e2e/serve.ts` for why that matters.
      command: "pnpm exec tsx e2e/serve.ts",
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 180_000,
      env: {
        CHIPS_MOBILE_E2E_PORT: WEB_PORT,
        CHIPS_E2E_SERVER_PORT: SERVER_PORT,
        // Send feedback is drawn in this export before its switch is on (ADR 0237).
        EXPO_PUBLIC_CHIPS_FEEDBACK: "1",
      },
    },
  ],
});
