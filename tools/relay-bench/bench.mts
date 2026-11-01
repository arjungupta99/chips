/**
 * The relay bench (`pnpm relay:bench`, testing/relay.md): what a large file costs through the
 * relay, and what everything else on the same tunnel waits while it comes.
 *
 * It stands up its own small world on loopback and takes it down again: a relay, a scratch
 * `chipsd` in dev mode on a temporary data directory, and two slow links (`slow-link.mjs`) — one
 * the server dials the relay through, which is a home's uplink, and one the "phone" reaches the
 * relay through, which is a cellular downlink. The phone is Node, speaking through core's own
 * `relayLink` and signing as a paired device for that link's tunnel (ADR 0191, decision 6), so what
 * crosses is what a phone's requests cross.
 *
 * Then, for each run: a few small requests on an idle tunnel, for the baseline; one large file
 * fetched through the tunnel, timed to its headers, its first byte and its last; small requests
 * sent at fixed moments while it comes, each timed to its answer (a chat frame waits where they
 * wait); and the server's resident memory, sampled throughout.
 *
 * What it cannot measure is the phone's own cost of opening each frame: Node's cipher is not
 * Hermes's. The Runtime screen on a phone or simulator measures that (ADR 0152).
 *
 * It never touches 4431 or `.chips`: the ports are its own (4494–4497 unless told otherwise) and
 * it refuses to start if any of them is taken.
 */

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  type Device,
  type DeviceStorage,
  PIECE_BYTES,
  pairDevice,
  relayLink,
  signRequest,
  uploadFile,
} from "../../packages/core/src/index.ts";
import { slowLink } from "./slow-link.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const TSX = join(REPO, "node_modules/.bin/tsx");

const { values: flags } = parseArgs({
  options: {
    /** The file's size, in megabytes. */
    mb: { type: "string", default: "40" },
    /** The upload's size, in megabytes, sent in the phone's 4 MB pieces through the relay. */
    "up-mb": { type: "string", default: "16" },
    /** The server's side: a home uplink, megabytes a second. */
    uplink: { type: "string", default: "3" },
    /** The phone's side: a cellular downlink, megabytes a second. */
    downlink: { type: "string", default: "10" },
    /** Each link's one-way delay, in milliseconds: 75 is the US to Nuremberg. */
    delay: { type: "string", default: "75" },
    runs: { type: "string", default: "1" },
    /** The first of four ports: phone link, server link, relay, server. */
    "base-port": { type: "string", default: "4494" },
    /** Leave the world up afterwards, and say where it is. */
    keep: { type: "boolean", default: false },
    /**
     * A file to post into the demo room as its harness, for a walk: a clip to open on a phone
     * paired through this relay. Best with `--keep`.
     */
    post: { type: "string" },
  },
});

const MB = Number(flags.mb);
const BASE = Number(flags["base-port"]);
const PORTS = { phoneLink: BASE, serverLink: BASE + 1, relay: BASE + 2, server: BASE + 3 };
const SERVER = `http://127.0.0.1:${PORTS.server}`;
/** When the small requests go out, from the large one's start. */
const DURING_MS = [500, 1500, 3000, 6000, 10_000, 15_000, 25_000];

const children: ChildProcess[] = [];
const links: net.Server[] = [];
const dataDir = mkdtempSync(join(tmpdir(), "chips-relay-bench-"));

/** Everything this started, by its own process group: never by a pattern. */
function stop(): void {
  for (const child of children) {
    if (child.pid !== undefined && child.exitCode === null) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // Gone already.
      }
    }
  }
  for (const link of links) link.close();
  rmSync(dataDir, { recursive: true, force: true });
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stop();
    process.exit(130);
  });
}

async function free(port: number): Promise<boolean> {
  return await new Promise((done) => {
    const probe = net.createServer();
    probe.once("error", () => done(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => done(true)));
  });
}

function start(name: string, cwd: string, args: string[], env: Record<string, string>): void {
  const log = openSync(join(dataDir, `${name}.log`), "a");
  const child = spawn(TSX, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", log, log],
    detached: true,
  });
  closeSync(log);
  children.push(child);
}

async function until<T>(what: string, ms: number, ask: () => Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    try {
      const answer = await ask();
      if (answer !== undefined) return answer;
    } catch {
      // Not yet.
    }
    if (Date.now() > deadline)
      throw new Error(`${what}: not after ${ms / 1000} s (logs in ${dataDir})`);
    await new Promise((wake) => setTimeout(wake, 250));
  }
}

/** The server's resident memory in megabytes, by the PID listening on its port. */
function serverMegabytes(): number | undefined {
  try {
    const pid = execFileSync("lsof", ["-ti", `tcp:${PORTS.server}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")[0];
    const kb = Number(execFileSync("ps", ["-o", "rss=", "-p", pid ?? ""], { encoding: "utf8" }));
    return Number.isFinite(kb) ? Math.round(kb / 1024) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The file posted into the demo room by its harness, as the phone's media specs do: uploaded with
 * the harness's token, then a `message.post` over its socket (the web suite's `Harness`).
 */
async function postAsHarness(path: string): Promise<string> {
  process.env["CHIPS_E2E_DATA_DIR"] = dataDir;
  process.env["CHIPS_E2E_SERVER_PORT"] = String(PORTS.server);
  const { Harness, demo, newRunId } = await import("../../apps/web/e2e/support.ts");
  const { token } = demo().harness;
  const bytes = new Uint8Array(readFileSync(path));
  const slot = await fetch(`${SERVER}/v1/uploads`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ filename: basename(path), byte_size: bytes.byteLength }),
  });
  const { attachment_id, upload_url } = (await slot.json()) as {
    attachment_id: string;
    upload_url: string;
  };
  const put = await fetch(`${SERVER}${upload_url}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream" },
    body: bytes,
  });
  if (put.status !== 201) throw new Error(`the upload answered ${put.status}`);
  const harness = await Harness.connect(newRunId());
  try {
    await harness.send("run.started", { goal: `Post ${basename(path)}.`, plan: [] });
    await harness.send("message.post", { text: basename(path), upload_ids: [attachment_id] });
  } finally {
    harness.close();
  }
  return demo().space_id;
}

type Link = Awaited<ReturnType<typeof relayLink>>;
type Moment = { readonly at: number; readonly ms: number };

/** `work`, with a small request sent at each of `DURING_MS` while it runs; each one's answer time. */
async function whileItRuns(
  work: () => Promise<void>,
  small: () => Promise<number>,
): Promise<{ allMs: number; during: Moment[] }> {
  const began = performance.now();
  let done = false;
  const during: Moment[] = [];
  const asked: Promise<void>[] = [];
  const timers = DURING_MS.map((at) =>
    setTimeout(() => {
      if (!done) asked.push(small().then((ms) => void during.push({ at, ms })));
    }, at),
  );
  await work();
  const allMs = Math.round(performance.now() - began);
  done = true;
  for (const timer of timers) clearTimeout(timer);
  await Promise.all(asked);
  return { allMs, during: during.sort((a, b) => a.at - b.at) };
}

/** An upload through the tunnel as the phone sends one: a slot, then 4 MB pieces, each awaited. */
async function uploadThrough(link: Link, device: Device, megabytes: number): Promise<void> {
  const size = megabytes * 1_048_576;
  const asked = JSON.stringify({ filename: "up.bin", byte_size: size, keep_metadata: false });
  const slot = await link.fetch(`${SERVER}/v1/uploads`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(await signRequest(device, "POST", "/v1/uploads", asked, link)),
    },
    body: asked,
  });
  const { upload_url, pieces } = (await slot.json()) as { upload_url: string; pieces?: boolean };
  const piece = pieces === true ? PIECE_BYTES : size;
  for (let offset = 0; offset < size; offset += piece) {
    const bytes = new Uint8Array(randomBytes(Math.min(piece, size - offset)));
    const at = pieces === true ? `${upload_url}?offset=${offset}` : upload_url;
    const answer = await link.fetch(`${SERVER}${at}`, {
      method: "PUT",
      headers: {
        "content-type": "application/octet-stream",
        ...(await signRequest(device, "PUT", at, bytes, link)),
      },
      body: bytes,
    });
    await answer.arrayBuffer();
    if (!answer.ok) throw new Error(`a piece of the upload answered ${answer.status}`);
  }
}

/**
 * A download read for a second and let go of, as a viewer closed early does; then, a second
 * later, a small request. A server that stopped sending answers it as on an idle tunnel; one
 * still sending the rest makes it wait behind what it sends.
 */
async function letGoOf(
  link: Link,
  device: Device,
  path: string,
  small: () => Promise<number>,
): Promise<{ readMb: number; afterMs: number }> {
  const answer = await link.fetch(`${SERVER}${path}`, {
    headers: await signRequest(device, "GET", path, "", link),
  });
  const reader = (answer.body as ReadableStream<Uint8Array>).getReader();
  const began = performance.now();
  let got = 0;
  while (performance.now() - began < 1000) {
    const read = await reader.read();
    if (read.done) break;
    got += read.value.length;
  }
  await reader.cancel();
  await new Promise((wake) => setTimeout(wake, 1000));
  return { readMb: Math.round((got / 1_048_576) * 10) / 10, afterMs: await small() };
}

const median = (numbers: readonly number[]) =>
  [...numbers].sort((a, b) => a - b)[Math.floor(numbers.length / 2)] ?? Number.NaN;

try {
  for (const port of Object.values(PORTS)) {
    if (!(await free(port))) throw new Error(`port ${port} is taken; pass --base-port`);
  }

  start("relay", join(REPO, "relay"), ["bin/chips-relay.ts"], {
    CHIPS_RELAY_HOST: "127.0.0.1",
    CHIPS_RELAY_PORT: String(PORTS.relay),
    CHIPS_LOG_LEVEL: "info",
  });
  const delayMs = Number(flags.delay);
  links.push(
    await slowLink({
      port: PORTS.serverLink,
      target: PORTS.relay,
      mbPerSecond: Number(flags.uplink),
      delayMs,
    }),
    await slowLink({
      port: PORTS.phoneLink,
      target: PORTS.relay,
      mbPerSecond: Number(flags.downlink),
      delayMs,
    }),
  );
  start("chipsd", join(REPO, "server"), ["bin/chipsd.ts", "serve"], {
    CHIPS_DEV_MODE: "true",
    CHIPS_HOST: "127.0.0.1",
    CHIPS_PORT: String(PORTS.server),
    CHIPS_LOG_LEVEL: "info",
    CHIPS_DATA_DIR: dataDir,
    CHIPS_DATABASE_URL: `sqlite:${join(dataDir, "chips.db")}`,
    CHIPS_RELAY_URL: `ws://127.0.0.1:${PORTS.serverLink}`,
  });

  const health = await until("the server dialled in to the relay", 90_000, async () => {
    const said = (await (await fetch(`${SERVER}/v1/health`)).json()) as {
      relay?: { status: string; key: string; url: string };
    };
    return said.relay?.status === "connected" ? said.relay : undefined;
  });

  if (flags.post !== undefined) {
    const space = await postAsHarness(flags.post);
    console.log(`\nPosted ${basename(flags.post)} into the demo room: chips://spaces/${space}`);
  }

  const held = new Map<string, unknown>();
  const storage: DeviceStorage = {
    entries: async () => [...held.entries()],
    put: async (key, value) => void held.set(key, value),
    remove: async (key) => void held.delete(key),
  };
  // The code from the operator's door (ADR 0048): a server that dials out to a relay has no dev
  // routes (SEC-4), and the token it left beside its database is this machine's credential.
  const operatorToken = readFileSync(join(dataDir, `operator.${PORTS.server}.token`), "utf8");
  const issued = await fetch(`${SERVER}/v1/operator/pairing-code`, {
    method: "POST",
    headers: { "x-chips-operator": operatorToken.trim() },
  });
  const { code } = (await issued.json()) as { code: string };
  const device = await pairDevice(code, "relay bench", SERVER, undefined, storage);
  // Uploaded straight to the server, not through the relay: the bench is about the way back.
  const runs = Number(flags.runs);
  const attachment =
    runs > 0
      ? await uploadFile(device, {
          name: "large.bin",
          bytes: new Uint8Array(randomBytes(MB * 1024 * 1024)),
        })
      : undefined;

  if (runs > 0) {
    console.log(
      `\nRelay bench: ${MB} MB through a ${flags.uplink} MB/s uplink and a ${flags.downlink} MB/s downlink, ${delayMs} ms each way\n`,
    );
  }
  const results = [];
  for (let run = 1; run <= runs; run++) {
    const link = await relayLink({
      url: `ws://127.0.0.1:${PORTS.phoneLink}`,
      serverKey: health.key,
    });
    const small = async () => {
      const headers = await signRequest(device, "GET", "/v1/health", "", link);
      const began = performance.now();
      const answer = await link.fetch(`${SERVER}/v1/health`, { headers });
      await answer.arrayBuffer();
      return Math.round(performance.now() - began);
    };
    const idle: number[] = [];
    for (let i = 0; i < 5; i++) idle.push(await small());

    const memoryBefore = serverMegabytes() ?? 0;
    let memoryPeak = memoryBefore;
    const sampler = setInterval(() => {
      memoryPeak = Math.max(memoryPeak, serverMegabytes() ?? 0);
    }, 250);

    const path = `/v1/attachments/${attachment?.id}`;
    const headers = await signRequest(device, "GET", path, "", link);
    const began = performance.now();
    let done = false;
    const during: { at: number; ms: number }[] = [];
    const asked: Promise<void>[] = [];
    const timers = DURING_MS.map((at) =>
      setTimeout(() => {
        if (!done) asked.push(small().then((ms) => void during.push({ at, ms })));
      }, at),
    );
    const answer = await link.fetch(`${SERVER}${path}`, { headers });
    const headersMs = performance.now() - began;
    const reader = (answer.body as ReadableStream<Uint8Array>).getReader();
    let got = 0;
    let firstMs = -1;
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      if (firstMs < 0) firstMs = performance.now() - began;
      got += read.value.length;
    }
    const allMs = performance.now() - began;
    done = true;
    for (const timer of timers) clearTimeout(timer);
    await Promise.all(asked);
    clearInterval(sampler);

    const upMb = Number(flags["up-mb"]);
    const upload = await whileItRuns(() => uploadThrough(link, device, upMb), small);
    const letGo = await letGoOf(link, device, path, small);
    link.close();

    const result = {
      run,
      megabytes: Math.round((got / 1_048_576) * 10) / 10,
      headersMs: Math.round(headersMs),
      firstByteMs: Math.round(firstMs),
      allMs: Math.round(allMs),
      megabytesPerSecond: Math.round((got / 1_048_576 / (allMs / 1000)) * 100) / 100,
      idleSmallMs: median(idle),
      duringSmallMs: during.sort((a, b) => a.at - b.at),
      serverMemoryGrowthMb: memoryPeak - memoryBefore,
      upload: { megabytes: upMb, ...upload },
      letGo,
    };
    results.push(result);
    console.log(`Run ${run}`);
    console.log(
      `  large file   ${result.megabytes} MB: headers ${result.headersMs} ms, first byte ${result.firstByteMs} ms, all ${result.allMs} ms (${result.megabytesPerSecond} MB/s)`,
    );
    console.log(`  small, idle  ${result.idleSmallMs} ms (median of ${idle.length})`);
    for (const { at, ms } of result.duringSmallMs) {
      console.log(`  small, sent ${String(at).padStart(5)} ms in: answered in ${ms} ms`);
    }
    console.log(`  server memory grew ${result.serverMemoryGrowthMb} MB at its peak`);
    console.log(
      `  upload       ${upMb} MB in 4 MB pieces: all ${upload.allMs} ms (${Math.round((upMb / (upload.allMs / 1000)) * 100) / 100} MB/s)`,
    );
    for (const { at, ms } of upload.during) {
      console.log(`  small, sent ${String(at).padStart(5)} ms into it: answered in ${ms} ms`);
    }
    console.log(
      `  let go       after 1 s (${letGo.readMb} MB read); a small request 1 s later: ${letGo.afterMs} ms\n`,
    );
  }
  if (runs > 0) console.log(JSON.stringify({ flags, results }));
  if (flags.keep) {
    // The slow links live in this process, so it stays up with them until it is stopped.
    console.log(
      `\nUp: server ${SERVER} (relay ${health.url}), phone link ws://127.0.0.1:${PORTS.phoneLink}`,
    );
    console.log(`Logs in ${dataDir}. Stop with Ctrl-C, or: kill -TERM ${process.pid}`);
    await new Promise(() => undefined);
  }
} finally {
  stop();
}
process.exit(0);
