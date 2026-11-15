/**
 * Everything in step, with the server put together as `chips serve` puts it: a real socket, the
 * real database, and the sweep. A harness says hello as a bridge here, and the computer keeps it
 * current (bridges-keep-current.md, A); a computer from the install line updates at night (phase
 * 6); one Chips for Mac carries starts again on the app's release (ADR 0298). Each part's rules
 * are tested beside it; this is that they are wired to each other.
 *
 * Only the date is faked, so the ten minutes a harness must have been connected pass at once;
 * the sweep's own timer, the socket and the database are the real ones.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import type {
  BridgeHands,
  BridgeOutcome,
  BridgeTrying,
  LocalBridge,
} from "./application/ports/bridges.js";
import type { SelfUpdateOutcome } from "./application/ports/self-update.js";
import type { BridgeList } from "./infrastructure/updates/bridge-list.js";
import {
  CONNECTED_FOR_MS,
  QUIET_CHECK_MS,
  RETURN_MS,
  REVIEW_MS,
  SETTLED_MS,
} from "./infrastructure/updates/bridge-updater.js";
import { NIGHT_CHECK_MS, NIGHT_STILL_MS } from "./infrastructure/updates/night-update.js";
import { UPDATES_FIRST_MS } from "./infrastructure/updates/releases.js";
import { RESTART_CHECK_MS, RESTART_STILL_MS } from "./infrastructure/updates/restart-onto.js";
import { CLOSE_SERVICE_RESTART } from "./interfaces/ws/session.js";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
  type TestWorkspaceOptions,
} from "./testing/workspace.js";

const BASE = "http://chips.local";
const T0 = Date.parse("2026-11-20T10:00:00.000Z");
const LABEL = "chat.chips.claude";
/** The sweep, fifty times a second: the date is what the tests move. */
const SWEEP = { realtime: { sweepSeconds: 0.02 } };
const configured = (server: Record<string, string> = {}) => ({ ...SWEEP, server }) as never;

let ws: TestWorkspace;
let port: number;
const sockets: WebSocket[] = [];

async function start(options: TestWorkspaceOptions): Promise<void> {
  ws = await createTestWorkspace(options);
  ({ port } = await ws.gateway.listen());
}

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  await ws.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const at = (ms: number) => vi.setSystemTime(ms);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** A few sweeps: long enough for the one after a change to have run. */
const sweeps = () => sleep(150);

async function until(what: string, done: () => boolean | Promise<boolean>): Promise<void> {
  for (let tries = 0; tries < 300; tries += 1) {
    if (await done()) return;
    await sleep(10);
  }
  throw new Error(`never: ${what}`);
}

async function call(as: TestPerson, method: string, path: string, body?: unknown) {
  const text = body === undefined ? "" : JSON.stringify(body);
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers: { ...as.sign(method, path, text), "content-type": "application/json" },
      ...(body === undefined ? {} : { body: text }),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** The harness's socket, saying hello as this release of its bridge; resolves with how it closed. */
async function hello(version: string): Promise<{ closed: Promise<number> }> {
  const ticket = await ws.gateway.app.fetch(
    new Request(`${BASE}/v1/socket-tickets`, { method: "POST", headers: ws.scout.headers }),
  );
  const { ticket: value } = (await ticket.json()) as { ticket: string };
  const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/ws?ticket=${value}`);
  sockets.push(socket);
  const answered = new Promise<void>((resolve) => socket.once("message", () => resolve()));
  const closed = new Promise<number>((resolve) => socket.once("close", (code) => resolve(code)));
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  socket.send(
    JSON.stringify({
      frame: "hello",
      protocol: { min: 1, max: 1 },
      client: { name: "chips-acp", version },
    }),
  );
  await answered;
  return { closed };
}

/** The bridge says how the harness behind it is, as every bridge does once it has started. */
async function saysItIsFine(): Promise<void> {
  const answer = await ws.gateway.app.fetch(
    new Request(`${BASE}/v1/harnesses/${ws.scout.participantId}/status`, {
      method: "PUT",
      headers: { ...ws.scout.headers, "content-type": "application/json" },
      body: JSON.stringify({ state: "ok" }),
    }),
  );
  expect(answer.status).toBe(200);
}

/** How the owner's About and the harness page read the bridge: `GET /v1/software`. */
async function bridgeUpdate(): Promise<Record<string, unknown> | undefined> {
  const read = await call(ws.arjun, "GET", "/v1/software");
  const harnesses = read.body["harnesses"] as { bridge_update?: Record<string, unknown> }[];
  return harnesses[0]?.bridge_update;
}

const phaseIs = (phase: string) => async () => (await bridgeUpdate())?.["phase"] === phase;

/** The CLI's hands, over one bridge with one service kept for the test's harness. */
function handsOver(harnessId: () => string) {
  const calls: string[] = [];
  let starts = true;
  let bridge: Omit<LocalBridge, "kept"> & { startedOn: string | undefined } = {
    package: "@chipschat/acp",
    major: 1,
    inUse: "1.0.30",
    recorded: "1.0.30",
    previous: undefined,
    staged: ["1.0.30"],
    verified: {},
    skips: {},
    trying: undefined,
    proving: {},
    last: {},
    startedOn: undefined,
  };
  const hands: BridgeHands = {
    list: async () => [
      {
        ...bridge,
        kept: [{ id: "claude", label: LABEL, harnessId: harnessId(), startedOn: bridge.startedOn }],
      },
    ],
    stage: async (pkg, version, integrity) => {
      calls.push(`stage ${pkg} ${version}`);
      bridge = {
        ...bridge,
        staged: [...bridge.staged, version],
        verified: { ...bridge.verified, [version]: integrity },
      };
    },
    switchTo: async (_pkg, label, version, trying: BridgeTrying | null) => {
      calls.push(`switch ${label} ${version}`);
      bridge = {
        ...bridge,
        inUse: version,
        previous: bridge.inUse,
        startedOn: version,
        trying: trying ?? undefined,
      };
      return starts;
    },
    starts: async () => undefined,
    harnessVersion: async () => undefined,
    note: async (_pkg, change) => {
      calls.push(`note ${change.outcome?.said.outcome ?? "-"}`);
      bridge = {
        ...bridge,
        ...(change.trying === null ? { trying: undefined } : {}),
        ...(change.proving === undefined
          ? {}
          : {
              proving:
                change.proving.said === null ? {} : { [change.proving.label]: change.proving.said },
            }),
        ...(change.skip === undefined
          ? {}
          : { skips: { ...bridge.skips, [change.skip.version]: change.skip.until } }),
        ...(change.outcome === undefined
          ? {}
          : {
              last: {
                ...bridge.last,
                [change.outcome.label]: change.outcome.said as BridgeOutcome,
              },
            }),
      };
    },
  };
  return {
    hands,
    calls,
    bridge: () => bridge,
    failToStart: () => {
      starts = false;
    },
  };
}

/** The signed list, as read a moment ago: 1.0.31 is out for the bridge. */
const listed = (): BridgeList => ({
  packages: {
    "@chipschat/acp": {
      releases: [
        {
          version: "1.0.31",
          integrity: `sha512-${"A".repeat(86)}==`,
          published: new Date(T0 - 9 * 24 * 60 * 60_000).toISOString(),
        },
      ],
      withdrawn: [],
    },
  },
  at: new Date(T0).toISOString(),
  heardAt: T0,
});

async function run(id: string, state: string): Promise<void> {
  await ws.db
    .insertInto("runs")
    .values({
      id,
      workspace_id: ws.workspaceId,
      space_id: ws.spaceId,
      harness_id: ws.scout.participantId,
      goal: "g",
      state,
      started_at: new Date().toISOString(),
    } as never)
    .execute();
}

async function message(id: string): Promise<void> {
  await ws.db
    .insertInto("messages")
    .values({
      id,
      workspace_id: ws.workspaceId,
      space_id: ws.spaceId,
      type: "text",
      author_kind: "person",
      author_id: ws.arjun.participantId,
      text: "hi",
      created_at: new Date().toISOString(),
    } as never)
    .execute();
}

describe("a bridge in this computer's data folder, kept current by the server as it runs", () => {
  async function computer() {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(T0);
    const it = handsOver(() => ws.scout.participantId);
    await start({
      version: "1.2.5",
      bridges: it.hands,
      bridgeList: { read: listed, tick: () => undefined },
      config: configured({ bridgesWait: "now" }),
    });
    return it;
  }

  it("stages the release, waits out a run, closes the harness's socket, switches, and sees it back", async () => {
    const it = await computer();
    const first = await hello("1.0.30");
    await until("staged and waiting", phaseIs("waiting"));
    expect(it.calls).toEqual(["stage @chipschat/acp 1.0.31"]);
    expect(await bridgeUpdate()).toMatchObject({
      package: "@chipschat/acp",
      running: "1.0.30",
      target: "1.0.31",
    });

    // Connected ten minutes now, but a run of it is going: nothing is switched.
    await run("run_going", "working");
    at(T0 + CONNECTED_FOR_MS + 1000);
    await sweeps();
    expect(it.calls).toHaveLength(1);

    // The run ends. At the next look its socket is closed as a service restarting, and only then
    // is its service switched.
    await ws.db.updateTable("runs").set({ state: "done" }).execute();
    at(T0 + CONNECTED_FOR_MS + 1000 + QUIET_CHECK_MS);
    expect(await first.closed).toBe(CLOSE_SERVICE_RESTART);
    await until("switched", phaseIs("watching"));
    expect(it.calls.at(-1)).toBe(`switch ${LABEL} 1.0.31`);
    expect(it.bridge().trying).toMatchObject({
      label: LABEL,
      harnessId: ws.scout.participantId,
      from: "1.0.30",
      to: "1.0.31",
    });

    // It comes back saying it is the new release. Connected a minute is not back: it has yet to
    // say how the harness behind it is (rule 3's first probe).
    await hello("1.0.31");
    const back = T0 + CONNECTED_FOR_MS + 1000 + 2 * QUIET_CHECK_MS;
    at(back);
    await sweeps();
    expect((await bridgeUpdate())?.["phase"]).toBe("watching");
    at(back + SETTLED_MS);
    await sweeps();
    expect((await bridgeUpdate())?.["phase"]).toBe("watching");
    // It says so, and stays a minute from the look that first sees it back.
    await saysItIsFine();
    at(back + SETTLED_MS + QUIET_CHECK_MS);
    await sweeps();
    expect((await bridgeUpdate())?.["phase"]).toBe("watching");
    at(back + 2 * SETTLED_MS + QUIET_CHECK_MS);
    await until("done", phaseIs("current"));
    expect(await bridgeUpdate()).toMatchObject({
      running: "1.0.31",
      last: { outcome: "updated", from: "1.0.30", to: "1.0.31" },
    });
    expect(it.bridge().trying).toBeUndefined();
    expect(it.calls.filter((each) => each.startsWith("switch"))).toHaveLength(1);
  });

  it("puts the release before back when the bridge never says hello as the new one", async () => {
    const it = await computer();
    const first = await hello("1.0.30");
    await until("staged and waiting", phaseIs("waiting"));
    const switchedAt = T0 + CONNECTED_FOR_MS + 1000;
    at(switchedAt);
    await first.closed;
    await until("switched", phaseIs("watching"));
    // Its service started the old release again: it says hello, but as 1.0.30.
    await hello("1.0.30");
    at(switchedAt + RETURN_MS);
    await until("put back", async () => it.calls.includes(`switch ${LABEL} 1.0.30`));
    await until("said", phaseIs("current"));
    expect(await bridgeUpdate()).toMatchObject({
      running: "1.0.30",
      last: { outcome: "put-back", from: "1.0.30", to: "1.0.31", reason: "no-return" },
    });
    expect(Object.keys(it.bridge().skips)).toEqual(["1.0.31"]);
    // Skipped for a week: the next review leaves it alone.
    at(switchedAt + RETURN_MS + REVIEW_MS);
    await sweeps();
    expect(it.calls.filter((each) => each.startsWith("switch"))).toHaveLength(2);
  });

  it("puts it back at once when its service doesn't start", async () => {
    const it = await computer();
    it.failToStart();
    await hello("1.0.30");
    await until("staged and waiting", phaseIs("waiting"));
    at(T0 + CONNECTED_FOR_MS + 1000);
    await until("put back", async () => it.calls.includes(`switch ${LABEL} 1.0.30`));
    expect(it.bridge()).toMatchObject({ inUse: "1.0.30", trying: undefined });
  });

  it("leaves a bridge where it is once its owner turns the switch off, and takes it up when on again", async () => {
    const it = await computer();
    const path = `/v1/harnesses/${ws.scout.participantId}/bridge-updates`;
    expect((await call(ws.arjun, "PUT", path, { keep_current: false })).status).toBe(200);
    await hello("1.0.30");
    await until("said off", phaseIs("off"));
    expect(await bridgeUpdate()).toMatchObject({ running: "1.0.30", target: "1.0.31" });
    at(T0 + CONNECTED_FOR_MS + REVIEW_MS);
    await sweeps();
    expect(it.calls).toEqual([]);

    expect((await call(ws.arjun, "PUT", path, { keep_current: true })).status).toBe(200);
    at(T0 + CONNECTED_FOR_MS + 2 * REVIEW_MS);
    await until("switched", phaseIs("watching"));
    expect(it.calls).toEqual(["stage @chipschat/acp 1.0.31", `switch ${LABEL} 1.0.31`]);
  });

  it("holds off while someone is talking in a room the harness is in", async () => {
    const it = await computer();
    await hello("1.0.30");
    await until("staged and waiting", phaseIs("waiting"));
    at(T0 + CONNECTED_FOR_MS + 1000);
    // A harness is in the rooms its agents are in; the test workspace's harness is in its space.
    await message("msg_now");
    await sweeps();
    const switches = () => it.calls.filter((each) => each.startsWith("switch")).length;
    expect(switches()).toBe(0);
    at(T0 + CONNECTED_FOR_MS + 1000 + 5 * 60_000);
    await until("switched once the room is still", async () => switches() === 1);
  });
});

describe("a computer from the install line, updating itself at night as the server runs", () => {
  const FEED = "https://feed.test/releases.json";
  const noon = new Date(2026, 10, 20, 12, 0).getTime();
  const threeAtNight = new Date(2026, 10, 21, 3, 0).getTime();

  async function computer(last?: () => SelfUpdateOutcome | undefined) {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(noon);
    vi.stubGlobal("fetch", async (input: string | URL) =>
      String(input) === FEED
        ? Response.json({
            releases: [{ version: "1.2.6", date: "2026-11-19", line: "Newer.", dot: true }],
          })
        : new Response("no", { status: 404 }),
    );
    let started = 0;
    await start({
      version: "1.2.5",
      selfUpdate: {
        start: () => {
          started += 1;
        },
        last: last ?? (() => undefined),
      },
      config: configured({ updates: FEED }),
    });
    // The feed is first read a minute after the server starts.
    at(noon + UPDATES_FIRST_MS + 1000);
    await until("the feed read", async () => {
      const facts = await call(ws.arjun, "GET", "/v1/server");
      const updates = facts.body["updates"] as { releases?: { version: string }[] } | undefined;
      return updates?.releases?.[0]?.version === "1.2.6";
    });
    return { started: () => started };
  }

  it("tells everyone paired which releases are out, and only its owner how it updates", async () => {
    await computer();
    const member = await call(ws.dana, "GET", "/v1/server");
    // The App Store's lookup couldn't be read here: its version is unknown, the releases known.
    expect(member.body["updates"]).toEqual({
      releases: [{ version: "1.2.6", date: "2026-11-19", line: "Newer.", dot: true }],
      app_store: null,
      checked_at: new Date(noon + UPDATES_FIRST_MS + 1000).toISOString(),
    });
    expect(member.body).not.toHaveProperty("self_update");
    const owner = await call(ws.arjun, "GET", "/v1/server");
    expect(owner.body["updates"]).toEqual(member.body["updates"]);
    expect(owner.body["self_update"]).toEqual({ available: true, automatic: false });
  });

  it("starts chips update between two and five once the owner turned it on, and once a night", async () => {
    const it = await computer();
    // Off until an owner says so: three in the morning comes and nothing starts.
    at(threeAtNight);
    await sweeps();
    expect(it.started()).toBe(0);
    expect((await call(ws.dana, "PUT", "/v1/server/self-update", { automatic: true })).status).toBe(
      403,
    );
    const turned = await call(ws.arjun, "PUT", "/v1/server/self-update", { automatic: true });
    expect(turned.body).toMatchObject({ available: true, automatic: true });
    at(threeAtNight + NIGHT_CHECK_MS);
    await until("started", async () => it.started() === 1);
    at(threeAtNight + 3 * NIGHT_CHECK_MS);
    await sweeps();
    expect(it.started()).toBe(1);
  });

  it("waits for the computer to be still, and never starts by day", async () => {
    const it = await computer();
    await call(ws.arjun, "PUT", "/v1/server/self-update", { automatic: true });
    at(noon + 2 * NIGHT_CHECK_MS);
    await sweeps();
    expect(it.started()).toBe(0);
    at(threeAtNight);
    await message("msg_at_night");
    await sweeps();
    expect(it.started()).toBe(0);
    at(threeAtNight + NIGHT_STILL_MS + 1000);
    await until("started", async () => it.started() === 1);
  });

  it("waits on an update that says it is under way", async () => {
    let last: SelfUpdateOutcome | undefined = {
      state: "updating",
      from: "1.2.5",
      at: new Date(threeAtNight).toISOString(),
    };
    const it = await computer(() => last);
    await call(ws.arjun, "PUT", "/v1/server/self-update", { automatic: true });
    at(threeAtNight);
    await sweeps();
    expect(it.started()).toBe(0);
    const facts = await call(ws.arjun, "GET", "/v1/server");
    expect(facts.body["self_update"]).toMatchObject({ last: { state: "updating", from: "1.2.5" } });
    last = { state: "failed", from: "1.2.5", at: last.at, why: "No network." };
    at(threeAtNight + NIGHT_CHECK_MS);
    await until("started", async () => it.started() === 1);
  });
});

describe("a computer Chips for Mac carries, starting again on the app's release as it runs", () => {
  it("restarts once, when the app holds a newer release and nothing is going on", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(T0);
    let onDisk = "1.2.5";
    let restarted = 0;
    await start({
      version: "1.2.5",
      restartOnto: {
        onDisk: () => onDisk,
        restart: () => {
          restarted += 1;
        },
      },
      config: configured(),
    });
    await sweeps();
    expect(restarted).toBe(0);

    // The app swapped its bundle: the release under the computer is 1.2.6 now. A run is going.
    onDisk = "1.2.6";
    await run("run_going", "working");
    at(T0 + RESTART_CHECK_MS);
    await sweeps();
    expect(restarted).toBe(0);
    const facts = await call(ws.arjun, "GET", "/v1/server");
    expect(facts.body["self_update"]).toMatchObject({ restarts_onto: "1.2.6" });

    await ws.db.updateTable("runs").set({ state: "done" }).execute();
    at(T0 + 2 * RESTART_CHECK_MS + RESTART_STILL_MS);
    await until("restarted", async () => restarted === 1);
    at(T0 + 4 * RESTART_CHECK_MS + RESTART_STILL_MS);
    await sweeps();
    expect(restarted).toBe(1);
  });
});
