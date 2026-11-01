/**
 * The phone app in a browser on this machine, with fast refresh and a server of its own.
 *
 * `pnpm mobile:start` is the loop for a phone: Metro, a QR, Expo Go, a tailnet address, and a
 * reload on the phone for every change. It is the only loop that proves a gesture, the Keychain
 * or a push notification, and it is the wrong loop for *does this screen say the right thing*,
 * which is most of the work. This is that other loop — the same React, the same store, the same
 * core, at iPhone size, a save away from the screen.
 *
 * Three things have to be true at once, which is why this is a file and not a line in a script:
 *
 * - **One origin.** `chipsd` sends no CORS headers, deliberately: every request it takes is
 *   same-origin and signed (`routes/web.ts`). An app served from Metro's origin calling the
 *   server's would be refused at the preflight, so `/v1` is proxied here — requests and socket
 *   both — exactly as `e2e/serve.ts` does it, and the app pairs with this address.
 * - **Fast refresh.** Unlike the e2e harness, this serves Metro rather than an export: every
 *   path that is not `/v1` goes to Metro untouched, including the upgrade that carries HMR.
 * - **A server to talk to.** Its own `chipsd`, dev mode on loopback with its own database, so
 *   `POST /v1/dev/pairing-code` is registered and pairing needs no second device. Deliberately
 *   not the `chipsd` your phone is paired with: two servers sharing one `.chips` would take
 *   turns invalidating each other's pairing code.
 *
 * The ports are its own — 5197, 8083, 4434 — so it runs beside `chips serve` on 4431, Expo Go's
 * Metro on 8081 and the web app on 5173, and shares nothing with either Playwright suite.
 *
 * What is not here is what a browser cannot answer: a swipe, the Keychain, a push, a camera.
 * Those are the phone's, and `e2e/maestro/README.md` is where they are written down.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { connect } from "node:net";
import { join } from "node:path";
import type { Duplex } from "node:stream";

const MOBILE = join(import.meta.dirname, "..");
const ROOT = join(MOBILE, "..", "..");

const PORT = Number(process.env["CHIPS_MOBILE_DEV_PORT"] ?? "5197");
const METRO_PORT = Number(process.env["CHIPS_MOBILE_DEV_METRO_PORT"] ?? "8083");
const SERVER_PORT = Number(process.env["CHIPS_MOBILE_DEV_SERVER_PORT"] ?? "4434");
const DATA_DIR = process.env["CHIPS_MOBILE_DEV_DATA_DIR"] ?? join(ROOT, ".chips", "phone-dev");

/** Which upstream a path belongs to. The app is everything the server is not. */
function upstreamFor(url: string): number {
  return url.startsWith("/v1") ? SERVER_PORT : METRO_PORT;
}

const children: ChildProcess[] = [];
let stopping = false;

/**
 * Stop what we started, by process group rather than by name: `pnpm` is a parent here, and the
 * `tsx` and `expo` underneath it are what actually hold the ports. Killing a group needs the
 * child detached, which is why it is spawned that way.
 */
function stop(code: number): void {
  stopping = true;
  for (const child of children) {
    if (child.pid === undefined) continue;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // Already gone, which is the state we wanted anyway.
    }
  }
  process.exit(code);
}

function start(name: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): void {
  const child = spawn("pnpm", [...args], {
    cwd,
    env: { ...process.env, ...env },
    // Stdin withheld: Expo would otherwise open its keypress menu and fight this process for
    // the terminal. `CI=1` would also do it, and would turn off watch mode with it.
    stdio: ["ignore", "inherit", "inherit"],
    detached: true,
  });
  child.on("exit", (code) => {
    if (stopping) return;
    process.stdout.write(`\n${name} stopped (${code ?? "signal"}); so is everything else.\n`);
    stop(1);
  });
  children.push(child);
}

/** Poll until it answers, because "started" and "listening" are not the same moment. */
async function waitFor(what: string, url: string, seconds = 180): Promise<void> {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not up yet; that is what the loop is for.
    }
    if (Date.now() > until) throw new Error(`${what} never answered on ${url}`);
    await new Promise((resume) => setTimeout(resume, 250));
  }
}

/** Requests, headers and body untouched. */
function proxy(incoming: IncomingMessage, respond: ServerResponse, port: number): void {
  const upstream = httpRequest(
    {
      host: "127.0.0.1",
      port,
      method: incoming.method ?? "GET",
      path: incoming.url ?? "/",
      headers: { ...incoming.headers, host: `127.0.0.1:${port}` },
    },
    (answer) => {
      respond.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(respond);
    },
  );
  upstream.on("error", () => {
    respond.writeHead(502).end("nothing is answering there");
  });
  incoming.pipe(upstream);
}

/** The socket, raw: an upgrade is bytes both ways once the handshake is through. */
function tunnel(incoming: IncomingMessage, socket: Duplex, head: Buffer, port: number): void {
  const upstream = connect(port, "127.0.0.1", () => {
    const lines = Object.entries(incoming.headers).map(([name, value]) => `${name}: ${value}`);
    upstream.write(`GET ${incoming.url ?? "/"} HTTP/1.1\r\n${lines.join("\r\n")}\r\n\r\n`);
    if (head.length > 0) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  const drop = () => {
    socket.destroy();
    upstream.destroy();
  };
  upstream.on("error", drop);
  socket.on("error", drop);
}

const server = createServer((incoming, respond) => {
  proxy(incoming, respond, upstreamFor(incoming.url ?? "/"));
});
server.on("upgrade", (incoming: IncomingMessage, socket: Duplex, head: Buffer) => {
  tunnel(incoming, socket, head, upstreamFor(incoming.url ?? "/"));
});

/** A code the app can pair with. Dev mode on loopback is what makes this route exist. */
async function pairingCode(): Promise<string> {
  const answer = await fetch(`http://127.0.0.1:${SERVER_PORT}/v1/dev/pairing-code`, {
    method: "POST",
  });
  if (!answer.ok) throw new Error(`the dev pairing-code route answered ${answer.status}`);
  return ((await answer.json()) as { code: string }).code;
}

function banner(code: string): void {
  const here = `http://127.0.0.1:${PORT}`;
  process.stdout.write(
    [
      "",
      `  The phone app is on ${here}`,
      "",
      `    code      ${code}`,
      `    server    ${here}`,
      "    good for  15 minutes, once",
      "",
      '  Open it, tap "Type a pairing code instead", and give it both.',
      `  Another code: curl -sX POST ${here}/v1/dev/pairing-code`,
      "",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });
  start(
    "chipsd",
    ["--filter", "@chipschat/server", "exec", "tsx", "bin/chipsd.ts", "serve"],
    ROOT,
    {
      CHIPS_HOST: "127.0.0.1",
      CHIPS_PORT: String(SERVER_PORT),
      CHIPS_DEV_MODE: "true",
      CHIPS_DATABASE_URL: `sqlite:${join(DATA_DIR, "chips.db")}`,
      // What the app is told to reach the server at, and so what a QR from this server carries:
      // this proxy, which is the only address where the two are one origin.
      CHIPS_PUBLIC_URL: `http://127.0.0.1:${PORT}`,
      CHIPS_LOG_PRETTY: "true",
    },
  );
  start("metro", ["exec", "expo", "start", "--port", String(METRO_PORT)], MOBILE, {});
  await waitFor("chipsd", `http://127.0.0.1:${SERVER_PORT}/v1/health`);
  await waitFor("metro", `http://127.0.0.1:${METRO_PORT}/status`);
  await new Promise<void>((resume) => {
    server.listen(PORT, "127.0.0.1", resume);
  });
  banner(await pairingCode());
}

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => stop(0));

main().catch((reason: unknown) => {
  process.stderr.write(`${String(reason)}\n`);
  stop(1);
});
