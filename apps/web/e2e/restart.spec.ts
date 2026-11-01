/**
 * M2.2's second acceptance criterion: the app reconnects after the server restarts, without
 * anybody doing anything.
 *
 * This is a real restart rather than a dropped connection: the process is killed and a new one
 * is started against the same data directory and port. That is the harder case, because
 * everything the old process held in memory is gone — the socket tickets, the pairing codes,
 * the attachment signing secret — so a client that had quietly depended on any of them would
 * fail here and nowhere else. A device key and the event log are on disk, which is why this
 * works at all.
 *
 * It runs in the scale project, where the specs that disturb the workspace live. The server it
 * starts is left running on purpose: the specs after it need one, and Playwright only knows how
 * to stop the process it started itself, so the global teardown is what stops this one.
 */

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { demo, pair, SERVER, SERVER_PORT } from "./support.ts";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DATA_DIR = process.env["CHIPS_E2E_DATA_DIR"] as string;

/**
 * Whatever is *listening* on the port, gone. `-sTCP:LISTEN` is not a detail: without it `lsof`
 * lists everything with a connection on that port, which includes the browser talking to the
 * server and the process running this test.
 */
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

/** A new one, on the same port, against the same database. Left running; see the teardown. */
async function startServer(): Promise<void> {
  const child = spawn(
    "pnpm",
    ["--filter", "@chipschat/server", "exec", "tsx", "bin/chipsd.ts", "serve"],
    {
      cwd: REPO,
      stdio: "ignore",
      env: {
        ...process.env,
        CHIPS_DEV_MODE: "true",
        CHIPS_PORT: SERVER_PORT,
        CHIPS_LOG_LEVEL: "warn",
        CHIPS_DATABASE_URL: `sqlite:${DATA_DIR}/chips.db`,
        CHIPS_SWEEP_SECONDS: "1",
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

test("the app reconnects after the server restarts, and nobody had to do anything", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await pair(page);
  const messages = page.getByTestId("messages");
  const demoBefore = demo();
  const before = demoBefore.harness.token;

  await stopServer();
  // The header says what is happening rather than the app looking frozen.
  // The socket closes with the process, so this is prompt rather than a wait for a timeout.
  // The timeout exists for the case a socket stays open with nothing behind it, which is
  // `packages/core/src/transport.test.ts`'s.
  await expect(page.getByTestId("connection")).toBeVisible({ timeout: 30_000 });

  await startServer();

  // No reload, no click: the transport keeps trying and the pill goes on its own.
  await expect(page.getByTestId("connection")).toHaveCount(0, { timeout: 60_000 });

  // And the socket is live rather than merely open. The demo bootstrap mints a fresh token on
  // every start and revokes the old one — the restart doing its job — and it does that after
  // the port is answering, so the details are read once they are the new ones.
  await expect.poll(() => demo().harness.token, { timeout: 30_000 }).not.toBe(before);
  const after = demo();
  // The same room it was before: a restart must not re-point the demo at somewhere else
  // (`server/src/infrastructure/demo/bootstrap.test.ts`, found here).
  expect(after.space_id).toBe(demoBefore.space_id);
  const said = `after the restart ${Date.now()}`;
  const posted = await fetch(`${SERVER}/v1/harnesses/${after.harness.id}/events`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${after.harness.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "message.post",
      space_id: after.space_id,
      text: said,
      idempotency_key: `restart-${Date.now()}`,
    }),
  });
  expect(posted.status).toBe(201);
  await expect(messages.getByText(said, { exact: true })).toBeVisible({ timeout: 30_000 });
});
