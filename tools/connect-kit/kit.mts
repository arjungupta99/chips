/**
 * The connect kit: a scratch Chips for a connector's own end-to-end test (testing/findings.md
 * ON-8). The server from this checkout on a port of its own, with its data in a folder of its own;
 * a person paired to it; a gallery card's link made as the Join page makes it (ADRs 0122, 0171);
 * and the card's command run as a person runs it, with the link in it.
 *
 * A card's command is `chips connect <id> '{link}'` (ADR 0218). The kit packs the connector's
 * checkout as npm would publish it, serves that tarball from a stand-in registry
 * (`registry.mts`), and runs the line with this checkout's `chips`, so the test goes through the
 * real download, checksum and run.
 *
 * A connector's test loads this file from a Chips checkout (`CHIPS_REPO`, `~/Work/Chips/chips-main` unless
 * set) and passes its own folder to be packed. Chips names no connector and runs none of its own
 * accord: a card is read by the id the test asks for.
 *
 * ```ts
 * const { scratchChips } = await import(`${repo}/tools/connect-kit/kit.mts`);
 * const chips = await scratchChips();
 * const card = await chips.card("hermes");
 * const run = chips.run(card.command, { folder: here, home });
 * ```
 */

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Device,
  type DeviceStorage,
  getJson,
  linkStarts,
  pairDevice,
  postJson,
} from "../../packages/core/src/index.ts";
import {
  type Connector,
  fillLink,
  type JoinRequestView,
  readConnectors,
} from "../../packages/protocol/src/index.ts";
import { type StandInRegistry, standInRegistry } from "./registry.mts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GALLERY = join(ROOT, "apps/docs/public/connectors.json");

/** A card's command: `chips connect <id> '<link>'` (ADR 0218). */
const CONNECTS = /^chips connect [a-z0-9-]+ '[^']+'$/;

export interface Said {
  readonly text: string;
  readonly actor: { readonly kind: string; readonly id: string };
}

export interface CardLink {
  readonly card: Connector;
  readonly link: string;
  readonly requestId: string;
  /** What the link grants: what the card says its connector needs, as the Join page starts it. */
  readonly capabilities: readonly string[];
  /** The card's command with the link in it, as a person copies it. */
  readonly command: string;
}

export interface Run {
  /** Everything it has written, stdout and stderr together. */
  output: () => string;
  /** When it has written a line matching `pattern`, within `ms`. */
  saw: (pattern: RegExp, ms?: number) => Promise<void>;
  /** Its exit code, once it stops by itself. */
  readonly exited: Promise<number | null>;
  /** Stopped by its PID, and waited for. */
  stop: () => Promise<void>;
}

export interface ScratchChips {
  readonly url: string;
  /** Where its database and logs are. */
  readonly folder: string;
  /** A gallery card's link, made as the Join page makes it. */
  card: (id: string) => Promise<CardLink>;
  /** A join request, as the person who made its link sees it. */
  request: (requestId: string) => Promise<JoinRequestView>;
  /** A harness's capabilities as Chips holds them. */
  capabilities: (harnessId: string) => Promise<readonly string[]>;
  /** A harness's agents in use, as Chips names them, and which is its Main (ADR 0183). */
  agents: (
    harnessId: string,
  ) => Promise<readonly { readonly name: string; readonly lead: boolean }[]>;
  /** What was said in a room, oldest first. */
  said: (spaceId: string) => Promise<readonly Said[]>;
  /** When `check` is true, within `ms`, asked every 200 ms. */
  until: <T>(what: string, check: () => Promise<T | undefined | false>, ms?: number) => Promise<T>;
  /**
   * A card's command run as a person runs it, with this checkout's `chips` and the connector in
   * `folder` packed and served from a stand-in registry, as npm would serve it once published.
   * `home` stands in for the person's home: what the command reads from `~` is there, and so is
   * the key it keeps (never the login keychain).
   */
  run: (command: string, options: { folder: string; home: string; path?: string }) => Run;
  stop: () => Promise<void>;
}

/** A page of `GET /v1/events`: each event flat, as the log holds it. */
interface EventsPage {
  readonly events: readonly { type: string; actor: Said["actor"]; text?: unknown }[];
  readonly next_cursor: number | null;
}

/** The messages on a page. */
function messagesOf(page: EventsPage): Said[] {
  return page.events.flatMap((each) =>
    each.type === "message.post" && typeof each.text === "string"
      ? [{ text: each.text, actor: each.actor }]
      : [],
  );
}

/** A port nothing is listening on, from the system. */
async function freePort(): Promise<number> {
  return await new Promise((done, failed) => {
    const server = createServer();
    server.once("error", failed);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => done(typeof address === "object" && address !== null ? address.port : 0));
    });
  });
}

/** The scratch server's environment: this one, with nothing of a Chips it might reach. */
function plainEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !entry[0].startsWith("CHIPS_"),
    ),
  );
}

/**
 * What a fresh shell has, and nothing else. A connector reads its other side from the environment
 * before its files, so what this one was started with (`OPENCLAW_URL`, a key) could point the
 * command at something real.
 */
function freshShell(): Record<string, string> {
  const kept = ["TMPDIR", "LANG", "LC_ALL", "USER", "LOGNAME", "SHELL", "TERM"];
  return Object.fromEntries(
    kept.flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
}

function watch(child: ChildProcess): Run {
  let output = "";
  const waiting = new Set<() => void>();
  const heard = (chunk: Buffer) => {
    output += chunk.toString();
    for (const check of waiting) check();
  };
  child.stdout?.on("data", heard);
  child.stderr?.on("data", heard);
  const exited = new Promise<number | null>((done) => child.once("exit", (code) => done(code)));
  return {
    output: () => output,
    saw: (pattern, ms = 30_000) =>
      new Promise((done, failed) => {
        const timer = setTimeout(() => {
          waiting.delete(check);
          failed(new Error(`Not seen in ${ms} ms: ${pattern}\n--- its output ---\n${output}`));
        }, ms);
        const check = () => {
          if (!pattern.test(output)) return;
          clearTimeout(timer);
          waiting.delete(check);
          done();
        };
        waiting.add(check);
        check();
      }),
    exited,
    stop: async () => {
      if (child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
        process.kill(child.pid, "SIGTERM");
      }
      await exited;
    },
  };
}

/** Its own process group, so a command's `npm` and the node under it stop together. */
function stopGroup(child: ChildProcess, exited: Promise<unknown>): () => Promise<void> {
  return async () => {
    if (child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // Already gone.
      }
    }
    await exited;
  };
}

/** This checkout's `chips`, as a command on a PATH: the CLI's source run on this Node. */
function chipsCommand(bin: string): void {
  mkdirSync(bin, { recursive: true });
  const tsx = import.meta.resolve("tsx");
  writeFileSync(
    join(bin, "chips"),
    `#!/bin/sh\nexec "${process.execPath}" --import "${tsx}" "${join(ROOT, "cli", "bin", "chips.ts")}" "$@"\n`,
  );
  chmodSync(join(bin, "chips"), 0o755);
}

/** A connector's checkout as npm would publish it: its own `npm pack`, which builds it first. */
function packed(folder: string, into: string): string {
  const out = mkdtempSync(join(into, "pack-"));
  execFileSync("npm", ["pack", "--pack-destination", out, "--silent"], {
    cwd: folder,
    stdio: ["ignore", "ignore", "inherit"],
  });
  const [tarball] = readdirSync(out).filter((file) => file.endsWith(".tgz"));
  if (tarball === undefined) throw new Error(`npm pack in ${folder} made no tarball`);
  return join(out, tarball);
}

export async function scratchChips(): Promise<ScratchChips> {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const folder = mkdtempSync(join(tmpdir(), "chips-connect-kit-"));
  // The scratch recipe (testing/scratch-server.md): dev mode on loopback, its own database, and
  // pushes sent nowhere.
  const server = spawn(process.execPath, ["--import", "tsx", "bin/chipsd.ts", "serve"], {
    cwd: join(ROOT, "server"),
    env: {
      ...plainEnv(),
      CHIPS_HOST: "127.0.0.1",
      CHIPS_PORT: String(port),
      CHIPS_DEV_MODE: "true",
      CHIPS_DATA_DIR: folder,
      CHIPS_DATABASE_URL: `sqlite:${join(folder, "chips.db")}`,
      CHIPS_PUSH_URL: "http://127.0.0.1:9",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const served = watch(server);
  // A test that dies before it stops the server takes the server and its folder with it.
  const orphaned = () => {
    server.kill();
    rmSync(folder, { recursive: true, force: true });
  };
  process.once("exit", orphaned);

  const until: ScratchChips["until"] = async (what, check, ms = 20_000) => {
    const end = Date.now() + ms;
    for (;;) {
      const found = await check().catch(() => undefined);
      if (found !== undefined && found !== false) return found;
      if (Date.now() > end) throw new Error(`${what}: not within ${ms} ms`);
      await new Promise((done) => setTimeout(done, 200));
    }
  };

  try {
    await until(
      "the scratch Chips answering",
      async () => (await fetch(`${url}/v1/health`)).ok,
      60_000,
    );
  } catch (error) {
    await served.stop();
    throw new Error(`${String(error)}\n--- its log ---\n${served.output()}`);
  }

  // The person the dev bootstrap made, paired as a browser is, its key held in memory.
  const held = new Map<string, unknown>();
  const storage: DeviceStorage = {
    entries: async () => [...held.entries()],
    put: async (key, value) => void held.set(key, value),
    remove: async (key) => void held.delete(key),
  };
  const issued = await fetch(`${url}/v1/dev/pairing-code`, { method: "POST" });
  const { code } = (await issued.json()) as { code: string };
  const device: Device = await pairDevice(code, "connect kit", url, undefined, storage);

  const cards = readConnectors(JSON.parse(readFileSync(GALLERY, "utf8")));
  // The bridges a card fetches come from here, each checkout packed the first time it is run.
  const registry: StandInRegistry = await standInRegistry();
  const packs = new Map<string, string>();
  const bin = join(folder, "bin");
  chipsCommand(bin);

  return {
    url,
    folder,

    async card(id) {
      const card = cards.find((each) => each.id === id);
      if (card?.command === undefined)
        throw new Error(`The gallery has no card "${id}" with a command.`);
      const capabilities = linkStarts(card);
      const made = await postJson<{ request: JoinRequestView; link: string }>(
        device,
        "/v1/join/links",
        { capabilities: [...capabilities] },
      );
      return {
        card,
        link: made.link,
        requestId: made.request.request_id,
        capabilities,
        command: fillLink(card.command, made.link),
      };
    },

    async request(requestId) {
      return (await getJson<{ request: JoinRequestView }>(device, `/v1/join/${requestId}`)).request;
    },

    async capabilities(harnessId) {
      const { participants } = await getJson<{
        participants: { id: string; capabilities?: string[] | null }[];
      }>(device, "/v1/participants");
      return participants.find((each) => each.id === harnessId)?.capabilities ?? [];
    },

    async agents(harnessId) {
      const { participants } = await getJson<{
        participants: {
          display_name: string;
          harness_id?: string | null;
          lead?: boolean;
          agent_state?: string | null;
          removed_at?: string | null;
        }[];
      }>(device, "/v1/participants");
      return participants
        .filter(
          (each) =>
            each.harness_id === harnessId &&
            each.agent_state !== "archived" &&
            (each.removed_at ?? null) === null,
        )
        .map((each) => ({ name: each.display_name, lead: each.lead === true }));
    },

    async said(spaceId) {
      const said: Said[] = [];
      let since = 0;
      for (;;) {
        const page = await getJson<EventsPage>(
          device,
          `/v1/events?since=${since}&space_id=${spaceId}`,
        );
        said.push(...messagesOf(page));
        if (page.next_cursor === null || page.next_cursor <= since || page.events.length === 0)
          break;
        since = page.next_cursor;
      }
      return said;
    },

    until,

    run(command, options) {
      if (!CONNECTS.test(command))
        throw new Error(`A card's command is \`chips connect <id> '<link>'\`: ${command}`);
      if (!packs.has(options.folder)) {
        const tarball = packed(options.folder, folder);
        registry.add(tarball);
        packs.set(options.folder, tarball);
      }
      const child = spawn("/bin/sh", ["-c", command], {
        cwd: options.folder,
        env: {
          ...freshShell(),
          HOME: options.home,
          PATH: [bin, options.path ?? process.env["PATH"] ?? ""].join(delimiter),
          // A file only its user reads, under the stand-in home: never the login keychain.
          CHIPS_NO_KEYCHAIN: "true",
          CHIPS_CONFIG_HOME: join(options.home, ".config", "chips"),
          // A card's line keeps its bridge running: never a real launch agent from a test, which
          // launchd would run with the real home's configs and state.
          CHIPS_KEEP: "off",
          // The cards, the registry and the place `chips connect` keeps bridges: this kit's.
          CHIPS_CONNECTORS: GALLERY,
          CHIPS_NPM_REGISTRY: registry.url,
          CHIPS_DATA_DIR: join(folder, "connected"),
        },
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const watched = watch(child);
      return { ...watched, stop: stopGroup(child, watched.exited) };
    },

    async stop() {
      process.off("exit", orphaned);
      await Promise.all([served.stop(), registry.stop()]);
      rmSync(folder, { recursive: true, force: true });
    },
  };
}
