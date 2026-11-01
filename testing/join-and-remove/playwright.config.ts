/**
 * A person joins, and is removed: the web suite's servers (a relay, a dev-mode `chipsd` on a
 * throwaway database, the web app under Vite), on this folder's ports, running this folder's specs.
 *
 *   pnpm e2e:people
 *
 * Two projects. In both the owner is at a desk; in `phone` everybody who joins does so at an
 * iPhone's width, as a second person does today: in Safari, since the phone app is only on
 * Arjun's iPhone. Removing somebody is the owner's, at a desk, in both; who is removed is wherever
 * they joined from.
 */

import "./ports.ts";
import { join } from "node:path";
import { devices, type PlaywrightTestConfig } from "../../apps/web/e2e/playwright.ts";
import web from "../../apps/web/playwright.config.ts";

const APP = join(import.meta.dirname, "../../apps/web");

const PUSH = `http://127.0.0.1:${process.env["CHIPS_E2E_PUSH_PORT"]}`;

/**
 * The web suite's servers, started where it starts them; not the build it measures speed on. The
 * server pushes to this folder's sink (`push-sink.mjs`) in Expo's place, which runs beside them.
 */
const servers = [
  ...(Array.isArray(web.webServer) ? web.webServer : [])
    .filter((server) => !server.command.includes("vite build"))
    .map((server) =>
      server.command.includes("chipsd")
        ? { ...server, cwd: APP, env: { ...server.env, CHIPS_PUSH_URL: `${PUSH}/send` } }
        : { ...server, cwd: APP },
    ),
  {
    command: `node ${join(import.meta.dirname, "push-sink.mjs")}`,
    url: `${PUSH}/health`,
    reuseExistingServer: false,
  },
];

const config: PlaywrightTestConfig = {
  ...web,
  testDir: ".",
  testIgnore: /phone\//,
  globalTeardown: join(APP, "e2e/teardown.ts"),
  webServer: servers,
  projects: [
    { name: "desk", use: { ...devices["Desktop Chrome"] }, metadata: { joiner: "desk" } },
    // The wire's specs (`*.wire.spec.ts`) have no screen to be at a phone's width: once, at the desk.
    {
      name: "phone",
      testIgnore: [/phone\//, /\.wire\.spec\.ts$/],
      use: { ...devices["Desktop Chrome"] },
      metadata: { joiner: "phone" },
    },
  ],
};

export default config;
