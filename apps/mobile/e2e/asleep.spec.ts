/**
 * M4.2's scope change, proved end to end: the relay answers, the server is not there, and the
 * phone says so rather than spinning.
 *
 * This is the whole argument for the state. A dropped network is worth waiting two seconds for;
 * a laptop that shut its lid is worth going home and opening, and no amount of reconnecting
 * will help because there is nothing awake on the far side to reach. Only the relay can tell
 * the two apart, so the phone here is paired through the relay before the server is stopped.
 *
 * It runs last and on its own, because it takes the server away from everything else. The
 * server it leaves behind is Playwright's to stop; the one this spec starts is the teardown's.
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { allowAsIssuer, payload, relayStats, SERVER, SERVER_PORT } from "./support.ts";

const DATA_DIR = process.env["CHIPS_E2E_DATA_DIR"] as string;
const RELAY_PORT = process.env["CHIPS_E2E_RELAY_PORT"] ?? "4433";
const NOWHERE = "http://127.0.0.1:1";

/** Whatever is listening on the port, gone. `-sTCP:LISTEN`: never what is merely talking to it. */
async function stopServer(): Promise<void> {
  const killed = spawn(
    "sh",
    ["-c", `pids=$(lsof -ti tcp:${SERVER_PORT} -sTCP:LISTEN); [ -n "$pids" ] && kill $pids`],
    { stdio: "ignore" },
  );
  await new Promise((done) => killed.on("close", done));
  await expect
    .poll(
      async () => {
        try {
          await fetch(`${SERVER}/v1/health`);
          return true;
        } catch {
          return false;
        }
      },
      { timeout: 20_000 },
    )
    .toBe(false);
}

/** A new one, on the same port and the same database. Left running; see the teardown. */
async function startServer(repo: string): Promise<void> {
  const child = spawn(
    "pnpm",
    ["--filter", "@chipschat/server", "exec", "tsx", "bin/chipsd.ts", "serve"],
    {
      cwd: repo,
      stdio: "ignore",
      env: {
        ...process.env,
        CHIPS_DEV_MODE: "true",
        CHIPS_PORT: SERVER_PORT,
        CHIPS_LOG_LEVEL: "warn",
        CHIPS_DATABASE_URL: `sqlite:${DATA_DIR}/chips.db`,
        CHIPS_SWEEP_SECONDS: "1",
        CHIPS_RELAY_URL: `ws://127.0.0.1:${RELAY_PORT}`,
      },
    },
  );
  child.unref();
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${SERVER}/v1/health`)).ok;
        } catch {
          return false;
        }
      },
      { timeout: 60_000 },
    )
    .toBe(true);
}

test("a server that is not there is asleep, not reconnecting — and comes back on its own", async ({
  page,
}) => {
  test.setTimeout(180_000);
  // The repo, from the suite's own directory. `import.meta` is not available here: this package
  // is CommonJS, which is what Metro wants of it.
  const repo = resolve(test.info().project.testDir, "../../..");
  const offer = await payload(NOWHERE);
  await page.goto("/pair?code=1");
  await page.getByLabel("Pairing code", { exact: true }).fill(offer);
  await page.getByRole("button", { name: "Pair", exact: true }).click();
  // The code asks, since it went out with the relay: its maker allows it (ADR 0232).
  await allowAsIssuer(page);
  // Inside Spaces, where the app opens: a tab visited stays mounted under the one in front, and
  // the reader meets one mark, in the bar of the screen in front (`ui/Connection.tsx`). Through
  // the relay is connected, and connected wears no mark at all.
  const spaces = page.getByTestId("spaces");
  const mark = spaces.getByTestId("connection-mark");
  await expect(page.getByTestId("workspace-title")).toBeVisible({ timeout: 40_000 });
  await expect
    .poll(async () => (await relayStats()).sessions, { timeout: 30_000 })
    .toBeGreaterThan(0);
  await expect(mark).toHaveCount(0, { timeout: 30_000 });

  await stopServer();
  // The relay drops a server that has gone, and then tells the phone there is none of that key.
  await expect.poll(async () => (await relayStats()).servers, { timeout: 30_000 }).toBe(0);
  // The mark turns red, and behind it the sheet says asleep, not reconnecting.
  const down = spaces.getByRole("button", { name: "Not connected" });
  await expect(down).toBeVisible({ timeout: 60_000 });
  await down.click();
  const sheet = page.getByTestId("connection-sheet-panel");
  await expect(sheet.getByText("Your server is not reachable", { exact: true })).toBeVisible();
  await expect(sheet).toContainText("asleep");
  // Away by the scrim above it, where a thumb would tap: the panel covers the rest of it.
  await page
    .getByRole("button", { name: "Close" })
    .first()
    .click({ position: { x: 20, y: 20 } });
  await expect(sheet).toHaveCount(0);

  // Up again, on the board under its red mark (ADR 0251), and left up while the server comes back.
  await down.click();
  await expect(sheet.getByText("Your server is not reachable", { exact: true })).toBeVisible();
  await expect(sheet.getByTestId("connection-board")).toBeVisible();
  // Red: no sparks, no green. Both are there all along, faded out, so a change of look mounts
  // nothing (31 October 2026).
  const sparks = sheet.getByTestId("connection-board-sparks");
  const flood = sheet.getByTestId("connection-board-flood");
  await expect(sparks).toHaveCSS("opacity", "0");
  await expect(flood).toHaveCSS("opacity", "0");
  await expect(sheet.getByRole("button", { name: "Try again" })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath("asleep-board.png") });

  await startServer(repo);
  // No reload, no tap: the loop kept trying, because lids open again. Back, the sheet says so,
  // every trace green, and stays up until it is closed, the mark green in the bar under it.
  await expect(sheet.getByText(/^Connected/)).toBeVisible({ timeout: 90_000 });
  await expect(flood).toHaveCSS("opacity", "1");
  await page.screenshot({ path: test.info().outputPath("asleep-board-back.png") });
  await page.waitForTimeout(3000);
  await expect(sheet.getByText(/^Connected/)).toBeVisible();
  await expect(spaces.getByRole("button", { name: "Connected again" })).toBeVisible();
  await page
    .getByRole("button", { name: "Close" })
    .first()
    .click({ position: { x: 20, y: 20 } });
  await expect(sheet).toHaveCount(0);
  // Closed, the mark has its beat and goes.
  await expect(mark).toHaveCount(0, { timeout: 10_000 });
  await expect(down).toHaveCount(0);
});
