/**
 * The computer keeping its own bridges current (bridges-keep-current.md, A), on the server's side:
 * which release, when it is quiet, the switch, the watch, and putting it back.
 */

import { createLogger, manualClock } from "@chipschat/platform";
import type { AgentState } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import {
  type BridgeHands,
  type BridgeOutcome,
  BridgeRefusal,
  type BridgeTrying,
  type LocalBridge,
} from "../../application/ports/bridges.js";
import type { Busy } from "../store/harness-quiet.js";
import type { TurnsSince } from "../store/harness-turns.js";
import type { BridgeList, ListedPackage } from "./bridge-list.js";
import {
  bridgeUpdater,
  CONNECTED_FOR_MS,
  chooseRelease,
  EXITS_MOST,
  HARNESS_ASKED_MS,
  laterThan,
  PROVING_MS,
  QUIET_CHECK_MS,
  RELEASE_SPREAD_MS,
  RELEASE_WAIT_MS,
  RETURN_MS,
  REVIEW_MS,
  releaseOutFor,
  SETTLED_MS,
  SKIP_MS,
  spreadOf,
} from "./bridge-updater.js";

const logger = createLogger({ level: "silent" });
const DAY = 24 * 60 * 60_000;
const T0 = Date.parse("2026-11-20T10:00:00.000Z");
const SRI = (n: number) => `sha512-${"A".repeat(86)}${n}=`;

const listed = (
  releases: {
    version: string;
    daysOld: number;
    urgent?: true;
    computer?: string;
    needs?: Record<string, string>;
  }[],
  withdrawn: string[] = [],
  now = T0,
): ListedPackage => ({
  releases: releases.map((each, n) => ({
    version: each.version,
    integrity: SRI(n),
    published: new Date(now - each.daysOld * DAY).toISOString(),
    ...(each.urgent ? { urgent: true as const } : {}),
    ...(each.computer === undefined ? {} : { computer: each.computer }),
    ...(each.needs === undefined ? {} : { needs: each.needs }),
  })),
  withdrawn,
});

describe("which release", () => {
  const choose = (pkg: ListedPackage, more: Partial<Parameters<typeof chooseRelease>[0]> = {}) =>
    chooseRelease({
      listed: pkg,
      major: 1,
      running: "1.0.30",
      computer: "1.2.5",
      siteNow: T0,
      now: T0,
      waitMs: RELEASE_WAIT_MS,
      skips: {},
      ...more,
    })?.version;

  it("is the newest of its major the list allows, once it has been out two days", () => {
    const pkg = listed([
      { version: "1.0.29", daysOld: 9 },
      { version: "1.0.31", daysOld: 3 },
      { version: "1.0.32", daysOld: 1 },
      { version: "2.0.0", daysOld: 9 },
    ]);
    expect(choose(pkg)).toBe("1.0.31");
    expect(choose(pkg, { waitMs: 0 })).toBe("1.0.32");
    expect(choose(pkg, { running: "1.0.31" })).toBeUndefined();
  });

  it("takes an urgent one at once, and never one for a newer computer", () => {
    expect(choose(listed([{ version: "1.0.31", daysOld: 0, urgent: true }]))).toBe("1.0.31");
    expect(choose(listed([{ version: "1.0.31", daysOld: 9, computer: "1.3.0" }]))).toBeUndefined();
    expect(choose(listed([{ version: "1.0.31", daysOld: 9, computer: "1.2.5" }]))).toBe("1.0.31");
  });

  it("skips one put back for a week, and takes the next release when it comes", () => {
    const skips = { "1.0.31": new Date(T0 + DAY).toISOString() };
    expect(choose(listed([{ version: "1.0.31", daysOld: 9 }]), { skips })).toBeUndefined();
    expect(choose(listed([{ version: "1.0.31", daysOld: 9 }]), { skips, now: T0 + 2 * DAY })).toBe(
      "1.0.31",
    );
    const next = listed([
      { version: "1.0.31", daysOld: 9 },
      { version: "1.0.32", daysOld: 3 },
    ]);
    expect(choose(next, { skips })).toBe("1.0.32");
  });

  it("leaves a withdrawn release for the newest allowed, even an older one, at once", () => {
    const pkg = listed(
      [
        { version: "1.0.29", daysOld: 9 },
        { version: "1.0.30", daysOld: 3 },
      ],
      ["1.0.30"],
    );
    expect(choose(pkg)).toBe("1.0.29");
    // Withdrawn and not yet out two days: it isn't taken either.
    expect(choose(listed([{ version: "1.0.31", daysOld: 9 }], ["1.0.31"]))).toBeUndefined();
  });

  it("is none for a package the list doesn't name, or a bridge no card names now", () => {
    expect(
      chooseRelease({
        listed: undefined,
        major: 1,
        running: "1.0.30",
        computer: "1.2.5",
        siteNow: T0,
        now: T0,
        waitMs: 0,
        skips: {},
      }),
    ).toBeUndefined();
    expect(
      choose(listed([{ version: "1.0.31", daysOld: 9 }]), { major: undefined }),
    ).toBeUndefined();
  });

  it("leaves a bridge on a release taken back where it is when nothing else is allowed", () => {
    // Taken back, and the only other release was put back here lately: nowhere to go.
    const pkg = listed(
      [
        { version: "1.0.29", daysOld: 9 },
        { version: "1.0.30", daysOld: 3 },
      ],
      ["1.0.30"],
    );
    const later = new Date(T0 + DAY).toISOString();
    expect(choose(pkg, { skips: { "1.0.29": later } })).toBeUndefined();
    expect(choose(listed([{ version: "1.0.30", daysOld: 3 }], ["1.0.30"]))).toBeUndefined();
    // A skip that has run out holds nothing back.
    expect(choose(pkg, { skips: { "1.0.29": new Date(T0 - 1).toISOString() } })).toBe("1.0.29");
  });

  it("reads a list that names a release twice as naming it once", () => {
    const twice = listed([
      { version: "1.0.31", daysOld: 9 },
      { version: "1.0.31", daysOld: 9 },
      { version: "1.0.32", daysOld: 9 },
    ]);
    expect(choose(twice)).toBe("1.0.32");
  });

  it("compares releases by number, not as words", () => {
    expect(laterThan("2.0.0", "1.9.9")).toBe(true);
    expect(laterThan("1.9.9", "2.0.0")).toBe(false);
    expect(laterThan("1.0.9", "1.0.9")).toBe(false);
    expect(laterThan("1.0.10", "1.0.9")).toBe(true);
    expect(laterThan("1.10.0", "1.9.9")).toBe(true);
    expect(laterThan("1.0.9", "1.0.10")).toBe(false);
    expect(laterThan("x", "1.0.0")).toBe(false);
  });

  it("waits each computer a further zero to three days, the same every time", () => {
    const spreads = ["a", "b", "c", "d", "e"].map(spreadOf);
    for (const each of spreads) {
      expect(each).toBeGreaterThanOrEqual(0);
      expect(each).toBeLessThan(RELEASE_SPREAD_MS);
    }
    expect(new Set(spreads).size).toBeGreaterThan(1);
    expect(spreadOf("a")).toBe(spreads[0]);
  });
});

/** A computer with one bridge, two services on it, and everything the updater asks of it. */
function computer(
  options: {
    list?: ListedPackage;
    version?: string;
    start?: Partial<LocalBridge>;
    /** The signed list not read yet, as for the first minute after a server starts. */
    unread?: true;
  } = {},
) {
  const clock = manualClock(T0);
  const calls: string[] = [];
  let bridge: LocalBridge = {
    package: "@chipschat/acp",
    major: 1,
    inUse: "1.0.30",
    recorded: "1.0.30",
    previous: undefined,
    staged: ["1.0.30"],
    verified: {},
    kept: [
      { id: "claude", label: "chat.chips.claude", harnessId: "har_claude", startedOn: undefined },
      { id: "codex", label: "chat.chips.codex", harnessId: "har_codex", startedOn: undefined },
    ],
    skips: {},
    trying: undefined,
    proving: {},
    last: {},
    ...options.start,
  };
  let refusal: BridgeRefusal | undefined;
  let starts = true;
  /** What the service manager has counted of each service's starts; none, it doesn't say. */
  const started = new Map<string, number>();
  /** What each harness's own command says it runs, by service. */
  const harnesses = new Map<string, string>();
  const asked: string[] = [];
  const turns = new Map<string, TurnsSince>();
  /** Whether a bridge that says hello goes on to say how its harness is, as every bridge does. */
  let says = true;
  let switchFails: ((label: string, version: string) => Error | undefined) | undefined;
  let whileStaging: (() => void) | undefined;
  const hands: BridgeHands = {
    list: async () => [bridge],
    stage: async (pkg, version, integrity) => {
      calls.push(`stage ${pkg} ${version}`);
      if (refusal !== undefined) throw refusal;
      whileStaging?.();
      bridge = {
        ...bridge,
        staged: [...bridge.staged, version],
        verified: { ...bridge.verified, [version]: integrity },
      };
    },
    switchTo: async (pkg, label, version, trying: BridgeTrying | null) => {
      calls.push(`switch ${label} ${version}`);
      const failed = switchFails?.(label, version);
      if (failed !== undefined) throw failed;
      const startedOn: Record<string, string> = {};
      for (const kept of bridge.kept) startedOn[kept.label] = kept.startedOn ?? bridge.inUse ?? "";
      startedOn[label] = version;
      bridge = {
        ...bridge,
        inUse: version,
        previous: bridge.inUse,
        trying: trying ?? undefined,
        kept: bridge.kept.map((kept) => ({ ...kept, startedOn: startedOn[kept.label] })),
      };
      void pkg;
      return starts;
    },
    starts: async (label) => started.get(label),
    harnessVersion: async (_pkg, label) => {
      asked.push(label);
      return harnesses.get(label);
    },
    note: async (_pkg, change) => {
      calls.push(`note ${JSON.stringify(change)}`);
      const { [change.proving?.label ?? ""]: _was, ...others } = bridge.proving;
      bridge = {
        ...bridge,
        ...(change.trying === null ? { trying: undefined } : {}),
        ...(change.proving === undefined
          ? {}
          : {
              proving:
                change.proving.said === null
                  ? others
                  : { ...others, [change.proving.label]: change.proving.said },
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
  const states = new Map<string, AgentState>([
    ["har_claude", { connected: true, since: new Date(T0 - CONNECTED_FOR_MS).toISOString() }],
    ["har_codex", { connected: true, since: new Date(T0 - CONNECTED_FOR_MS).toISOString() }],
  ]);
  const busy = new Map<string, Busy>();
  const off = new Set<string>();
  const closed: string[] = [];
  let list: BridgeList | undefined = {
    packages: { "@chipschat/acp": options.list ?? listed([{ version: "1.0.31", daysOld: 9 }]) },
    at: new Date(T0).toISOString(),
    heardAt: T0,
  };
  const read = list;
  if (options.unread === true) list = undefined;
  const updater = bridgeUpdater({
    hands,
    list: () => list,
    computer: options.version ?? "1.2.5",
    wait: "spread",
    seed: async () => "ws_1",
    workspaceOf: async () => "ws_1",
    stateOf: (_workspace, harnessId) =>
      states.get(harnessId) ?? { connected: false, since: new Date(T0).toISOString() },
    busy: async (_workspace, harnessId) => busy.get(harnessId),
    turns: async (_workspace, harnessId) =>
      turns.get(harnessId) ?? { ended: 0, failed: 0, failedBefore: false },
    closeHarness: (_workspace, harnessId) => {
      closed.push(harnessId);
      return 1;
    },
    switchedOff: async () => off,
    clock,
    logger,
  });
  // A bridge that says hello says how its harness is right after, unless a test holds its word.
  const made = updater;
  const heard: typeof made.heard = (harnessId, version) => {
    made.heard(harnessId, version);
    if (says) made.said(harnessId);
  };
  const tick = async (ms = 0) => {
    clock.advance(ms);
    updater.tick();
    await updater.settled();
  };
  /** `ms` gone by with the sweep looking as it does, every thirty seconds. */
  const through = async (ms: number) => {
    for (let waited = 0; waited < ms; waited += QUIET_CHECK_MS) await tick(QUIET_CHECK_MS);
  };
  return {
    clock,
    calls,
    closed,
    states,
    busy,
    off,
    updater: { ...made, heard },
    started,
    harnesses,
    asked,
    turns,
    /** A bridge that connects and says nothing of its harness until told to. */
    holdItsWord: () => {
      says = false;
    },
    tick,
    through,
    bridge: () => bridge,
    keep: (kept: LocalBridge["kept"]) => {
      bridge = { ...bridge, kept };
    },
    refuse: (value: BridgeRefusal | undefined) => {
      refusal = value;
    },
    failToStart: () => {
      starts = false;
    },
    /** The list read from the site, as a minute after the server starts. */
    listRead: () => {
      list = read;
    },
    failSwitch: (fails: typeof switchFails) => {
      switchFails = fails;
    },
    whileStaging: (does: () => void) => {
      whileStaging = does;
    },
    codex: () => updater.states().get("har_codex"),
    claude: () => updater.states().get("har_claude"),
  };
}

describe("a bridge kept elsewhere", () => {
  const list = (packages: Record<string, ListedPackage>): BridgeList => ({
    packages,
    at: new Date(T0).toISOString(),
    heardAt: T0,
  });
  const out = (hello: string, running: string, packages: Record<string, ListedPackage>) =>
    releaseOutFor({ list: list(packages), hello, running, computer: "1.2.5", now: T0 });

  it("is told the release out for it by the name it says in its hello, once out two days", () => {
    const hermes = listed([
      { version: "1.0.32", daysOld: 1 },
      { version: "1.0.31", daysOld: 5 },
    ]);
    expect(out("chips-hermes", "1.0.29", { "@chipschat/hermes": hermes })).toBe("1.0.31");
    expect(out("chips-hermes", "1.0.31", { "@chipschat/hermes": hermes })).toBeUndefined();
  });

  it("is told nothing for a name the list doesn't have, or no list", () => {
    const hermes = listed([{ version: "1.0.31", daysOld: 5 }]);
    expect(out("chips-harness", "0.0.0", { "@chipschat/hermes": hermes })).toBeUndefined();
    expect(out("hermes", "1.0.29", { "@chipschat/hermes": hermes })).toBeUndefined();
    expect(
      releaseOutFor({
        list: undefined,
        hello: "chips-hermes",
        running: "1.0.29",
        computer: "1.2.5",
        now: T0,
      }),
    ).toBeUndefined();
  });
});

describe("keeping a bridge here current", () => {
  it("leaves a bridge whose owner turned updates off on its release, and says what is out", async () => {
    const it = computer();
    it.off.add("har_claude");
    it.busy.set("har_codex", "run");
    await it.tick();
    expect(it.claude()).toMatchObject({ phase: "off", running: "1.0.30", target: "1.0.31" });
    await it.tick(QUIET_CHECK_MS);
    expect(it.calls.filter((call) => call.startsWith("switch"))).toEqual([]);

    // Turned on again, it takes the release at its next quiet moment.
    it.off.delete("har_claude");
    await it.tick(QUIET_CHECK_MS);
    expect(it.calls.at(-1)).toBe("switch chat.chips.claude 1.0.31");
  });

  it("stages, waits for a quiet moment, switches one service, and is done once it's back", async () => {
    const it = computer();
    it.busy.set("har_claude", "run");
    it.busy.set("har_codex", "message");
    await it.tick();
    expect(it.calls).toEqual(["stage @chipschat/acp 1.0.31"]);
    expect(it.claude()).toMatchObject({ phase: "waiting", running: "1.0.30", target: "1.0.31" });
    expect(it.closed).toEqual([]);

    // Claude Code goes quiet; Codex is still busy.
    it.busy.delete("har_claude");
    await it.tick(QUIET_CHECK_MS);
    expect(it.closed).toEqual(["har_claude"]);
    expect(it.calls.at(-1)).toBe("switch chat.chips.claude 1.0.31");
    expect(it.bridge().trying).toMatchObject({
      label: "chat.chips.claude",
      from: "1.0.30",
      to: "1.0.31",
    });
    expect(it.claude()).toMatchObject({ phase: "watching", target: "1.0.31" });

    // It comes back as the new release and stays a minute.
    it.updater.heard("har_claude", "1.0.31");
    await it.tick(QUIET_CHECK_MS);
    expect(it.claude()?.phase).toBe("watching");
    await it.tick(SETTLED_MS);
    expect(it.claude()).toMatchObject({ phase: "current", running: "1.0.31" });
    expect(it.claude()?.last).toMatchObject({ outcome: "updated", from: "1.0.30", to: "1.0.31" });
    expect(it.bridge().trying).toBeUndefined();

    // Codex, on the same package, takes it at its own quiet moment: no second download.
    it.busy.delete("har_codex");
    await it.tick(QUIET_CHECK_MS);
    expect(it.calls.filter((call) => call.startsWith("stage"))).toHaveLength(1);
    expect(it.calls.at(-1)).toBe("switch chat.chips.codex 1.0.31");
    expect(it.closed).toEqual(["har_claude", "har_codex"]);
  });

  it("puts the release before back, and skips the new one a week, when it doesn't come back", async () => {
    const it = computer();
    it.busy.set("har_codex", "run");
    await it.tick();
    expect(it.calls.at(-1)).toBe("switch chat.chips.claude 1.0.31");
    // It says hello as the old release (its service started the wrong one), then nothing.
    it.updater.heard("har_claude", "1.0.30");
    await it.through(RETURN_MS);
    expect(it.calls).toContain("switch chat.chips.claude 1.0.30");
    expect(it.bridge().inUse).toBe("1.0.30");
    expect(it.bridge().trying).toBeUndefined();
    expect(Date.parse(it.bridge().skips["1.0.31"] ?? "")).toBe(it.clock.nowMs() + SKIP_MS);
    expect(it.claude()).toMatchObject({ phase: "current", running: "1.0.30" });
    expect(it.claude()?.last).toMatchObject({ outcome: "put-back", reason: "no-return" });
    // And it isn't tried again while skipped.
    const before = it.calls.length;
    await it.tick(REVIEW_MS);
    expect(it.calls.slice(before).filter((call) => call.includes("claude"))).toEqual([]);
  });

  it("puts it back when it comes back troubled, but not for trouble it had before", async () => {
    const it = computer();
    it.busy.set("har_codex", "run");
    it.states.set("har_claude", {
      connected: true,
      since: new Date(T0 - CONNECTED_FOR_MS).toISOString(),
      trouble: { reason: "Claude Code isn't signed in.", since: new Date(T0 - DAY).toISOString() },
    });
    await it.tick();
    it.updater.heard("har_claude", "1.0.31");
    await it.tick(QUIET_CHECK_MS);
    await it.tick(SETTLED_MS);
    expect(it.claude()?.last?.outcome).toBe("updated");

    const again = computer({
      list: listed([{ version: "1.0.31", daysOld: 9 }]),
    });
    again.busy.set("har_codex", "run");
    await again.tick();
    again.updater.heard("har_claude", "1.0.31");
    again.states.set("har_claude", {
      connected: true,
      since: new Date(T0).toISOString(),
      trouble: { reason: "Can't find claude-agent-acp.", since: new Date(T0).toISOString() },
    });
    for (let waited = 0; waited <= RETURN_MS; waited += QUIET_CHECK_MS) {
      await again.tick(QUIET_CHECK_MS);
    }
    expect(again.claude()?.last).toMatchObject({ outcome: "put-back" });
  });

  it("puts it back at once when its service doesn't start", async () => {
    const it = computer();
    it.busy.set("har_codex", "run");
    it.failToStart();
    await it.tick();
    expect(it.calls.filter((call) => call.startsWith("switch"))).toEqual([
      "switch chat.chips.claude 1.0.31",
      "switch chat.chips.claude 1.0.30",
    ]);
    expect(it.claude()?.last?.outcome).toBe("put-back");
  });

  it("never switches a harness that hasn't been connected ten minutes, or isn't connected", async () => {
    const it = computer();
    it.states.set("har_claude", { connected: true, since: new Date(T0 - 60_000).toISOString() });
    it.states.set("har_codex", { connected: false, since: new Date(T0 - DAY).toISOString() });
    await it.tick();
    expect(it.calls.filter((call) => call.startsWith("switch"))).toEqual([]);
    expect(it.claude()?.phase).toBe("waiting");
  });

  it("says why it couldn't take a release, and tries again a day later", async () => {
    const it = computer();
    it.refuse(new BridgeRefusal("room", "The disk is too full."));
    await it.tick();
    expect(it.claude()).toMatchObject({ phase: "refused", target: "1.0.31", reason: "room" });
    expect(it.bridge().last["chat.chips.claude"]).toMatchObject({
      outcome: "refused",
      reason: "room",
    });
    await it.tick(REVIEW_MS);
    expect(it.calls.filter((call) => call.startsWith("stage"))).toHaveLength(1);
    it.refuse(undefined);
    await it.tick(DAY);
    expect(it.calls.filter((call) => call.startsWith("stage"))).toHaveLength(2);
  });

  it("finishes a watch the journal says a stopped server left halfway, giving it its full time", async () => {
    // A new server, started long after the switch: it knows only the journal.
    const trying = {
      label: "chat.chips.claude",
      harnessId: "har_claude",
      from: "1.0.30",
      to: "1.0.31",
      at: new Date(T0 - 2 * RETURN_MS).toISOString(),
    };
    const it = computer({ start: { inUse: "1.0.31", staged: ["1.0.30", "1.0.31"], trying } });
    it.busy.set("har_codex", "run");
    await it.tick();
    expect(it.calls.filter((call) => call.startsWith("switch"))).toEqual([]);
    expect(it.claude()).toMatchObject({ phase: "watching", target: "1.0.31" });
    it.updater.heard("har_claude", "1.0.31");
    await it.tick(QUIET_CHECK_MS);
    await it.tick(SETTLED_MS);
    expect(it.claude()?.last?.outcome).toBe("updated");

    // One that never comes back is put back once its full time has passed since the server started.
    const gone = computer({ start: { inUse: "1.0.31", staged: ["1.0.30", "1.0.31"], trying } });
    gone.busy.set("har_codex", "run");
    await gone.tick();
    await gone.through(RETURN_MS);
    expect(gone.calls).toContain("switch chat.chips.claude 1.0.30");
  });

  it("watches the second service on a package when it is the one switched first", async () => {
    const it = computer();
    const codex = () => it.updater.states().get("har_codex");
    // Claude Code, listed first, is busy; Codex is quiet and goes first.
    it.busy.set("har_claude", "run");
    await it.tick();
    expect(it.calls.at(-1)).toBe("switch chat.chips.codex 1.0.31");
    expect(codex()).toMatchObject({ phase: "watching", target: "1.0.31" });
    it.updater.heard("har_codex", "1.0.31");
    await it.tick(QUIET_CHECK_MS);
    await it.tick(SETTLED_MS);
    expect(codex()).toMatchObject({ phase: "current", running: "1.0.31" });
    expect(codex()?.last).toMatchObject({ outcome: "updated" });
    expect(it.bridge().trying).toBeUndefined();
    // And Claude Code is never switched while Codex is being watched.
    expect(it.closed).toEqual(["har_codex"]);
  });

  it("puts back the second service on a package when it never returns", async () => {
    const it = computer();
    it.busy.set("har_claude", "run");
    await it.tick();
    expect(it.calls.at(-1)).toBe("switch chat.chips.codex 1.0.31");
    for (let waited = 0; waited <= RETURN_MS; waited += QUIET_CHECK_MS) {
      await it.tick(QUIET_CHECK_MS);
    }
    expect(it.calls).toContain("switch chat.chips.codex 1.0.30");
    expect(it.updater.states().get("har_codex")?.last).toMatchObject({ outcome: "put-back" });
  });

  it("keeps a release that came back late and well, though its minute ends past the five", async () => {
    const it = computer();
    it.busy.set("har_codex", "run");
    await it.tick();
    // Back half a minute before the five are up.
    await it.tick(RETURN_MS - QUIET_CHECK_MS);
    it.updater.heard("har_claude", "1.0.31");
    await it.tick(QUIET_CHECK_MS);
    expect(it.calls.filter((call) => call.startsWith("switch"))).toEqual([
      "switch chat.chips.claude 1.0.31",
    ]);
    expect(it.claude()?.phase).toBe("watching");
    await it.tick(SETTLED_MS);
    expect(it.claude()?.last).toMatchObject({ outcome: "updated" });

    // One that came back and dropped again before its minute was up is put back.
    const dropped = computer();
    dropped.busy.set("har_codex", "run");
    await dropped.tick();
    await dropped.tick(RETURN_MS - QUIET_CHECK_MS);
    dropped.updater.heard("har_claude", "1.0.31");
    await dropped.tick(QUIET_CHECK_MS);
    dropped.states.set("har_claude", { connected: false, since: new Date(T0).toISOString() });
    await dropped.tick(QUIET_CHECK_MS);
    expect(dropped.claude()?.last).toMatchObject({ outcome: "put-back" });
  });

  it("says nothing more of a harness whose service is no longer kept here", async () => {
    const it = computer({ list: listed([{ version: "1.0.30", daysOld: 9 }]) });
    await it.tick();
    expect(it.claude()).toMatchObject({ phase: "current", running: "1.0.30" });
    // Codex was disconnected here (`chips connect codex --remove`), and may run elsewhere now.
    it.keep(it.bridge().kept.filter((kept) => kept.id !== "codex"));
    await it.tick(REVIEW_MS);
    expect(it.updater.states().has("har_codex")).toBe(false);
    expect(it.claude()?.phase).toBe("current");
  });

  const TRYING = {
    label: "chat.chips.claude",
    harnessId: "har_claude",
    from: "1.0.30",
    to: "1.0.31",
    at: new Date(T0 - 60_000).toISOString(),
  };
  // As the journal has it after a switch: the link moved, and what each service was started on.
  const HALFWAY = {
    inUse: "1.0.31",
    staged: ["1.0.30", "1.0.31"],
    trying: TRYING,
    kept: [
      { id: "claude", label: "chat.chips.claude", harnessId: "har_claude", startedOn: "1.0.31" },
      { id: "codex", label: "chat.chips.codex", harnessId: "har_codex", startedOn: "1.0.30" },
    ],
  };
  const switches = (it: ReturnType<typeof computer>) =>
    it.calls.filter((call) => call.startsWith("switch"));

  it("goes on watching a switch a restart cut, before the list has been read again", async () => {
    const it = computer({ start: HALFWAY, unread: true });
    it.busy.set("har_codex", "run");
    // The sweep's first looks, fifteen seconds apart; the list comes a minute after the start.
    await it.tick(15_000);
    expect(it.claude()).toMatchObject({ phase: "watching", target: "1.0.31" });
    // Codex is said as it is, so its page knows this computer keeps it.
    expect(it.codex()).toMatchObject({ phase: "current", running: "1.0.30" });
    it.updater.heard("har_claude", "1.0.31");
    await it.tick(15_000);
    await it.tick(30_000);
    it.listRead();
    await it.tick(30_000);
    await it.tick(30_000);
    expect(it.claude()?.last).toMatchObject({ outcome: "updated", from: "1.0.30", to: "1.0.31" });
    expect(switches(it)).toEqual([]);
  });

  it("puts back a switch a restart cut when it never comes back, list or no list", async () => {
    const it = computer({ start: HALFWAY, unread: true });
    it.busy.set("har_codex", "run");
    await it.tick(15_000);
    await it.through(RETURN_MS);
    expect(switches(it)).toEqual(["switch chat.chips.claude 1.0.30"]);
    expect(it.bridge().trying).toBeUndefined();
  });

  it("holds no trouble against a switch a restart cut: nobody saw what it had before", async () => {
    const it = computer({ start: HALFWAY });
    it.busy.set("har_codex", "run");
    it.states.set("har_claude", {
      connected: true,
      since: new Date(T0).toISOString(),
      trouble: { reason: "Claude Code isn't signed in.", since: new Date(T0 - DAY).toISOString() },
    });
    await it.tick();
    it.updater.heard("har_claude", "1.0.31");
    await it.through(SETTLED_MS + QUIET_CHECK_MS);
    expect(it.claude()?.last).toMatchObject({ outcome: "updated" });
  });

  it("looks at the list the moment it is first read, not ten minutes on", async () => {
    const it = computer({ unread: true });
    it.busy.set("har_claude", "run");
    it.busy.set("har_codex", "run");
    await it.tick();
    expect(it.calls).toEqual([]);
    expect(it.claude()).toMatchObject({ phase: "current", running: "1.0.30" });
    it.listRead();
    await it.tick(60_000);
    expect(it.calls).toEqual(["stage @chipschat/acp 1.0.31"]);
    expect(it.claude()).toMatchObject({ phase: "waiting", target: "1.0.31" });
  });

  it("puts back a bridge that keeps dying and saying hello again: it never has its minute", async () => {
    const it = computer();
    it.busy.set("har_codex", "run");
    await it.tick();
    // Its service starts, says hello, dies and is started again, every ten seconds. The server
    // still counts it connected between two lives.
    for (let waited = 0; waited < RETURN_MS + 3 * SETTLED_MS; waited += 10_000) {
      it.updater.heard("har_claude", "1.0.31");
      await it.tick(10_000);
    }
    expect(it.claude()?.last).toMatchObject({ outcome: "put-back", reason: "no-return" });
    expect(switches(it)).toEqual([
      "switch chat.chips.claude 1.0.31",
      "switch chat.chips.claude 1.0.30",
    ]);
  });

  it("waits to put a troubled release back while it is in the middle of something", async () => {
    const it = computer();
    it.busy.set("har_codex", "run");
    await it.tick();
    // Back, and working, but with a trouble it didn't have before.
    it.updater.heard("har_claude", "1.0.31");
    it.states.set("har_claude", {
      connected: true,
      since: new Date(T0).toISOString(),
      trouble: { reason: "Can't find claude-agent-acp.", since: new Date(T0).toISOString() },
    });
    it.busy.set("har_claude", "run");
    await it.through(RETURN_MS + QUIET_CHECK_MS);
    expect(switches(it)).toEqual(["switch chat.chips.claude 1.0.31"]);
    expect(it.claude()?.phase).toBe("watching");
    // Its run ends: now it goes back, its sockets closed first.
    it.busy.delete("har_claude");
    const closedBefore = it.closed.length;
    await it.tick(QUIET_CHECK_MS);
    expect(switches(it).at(-1)).toBe("switch chat.chips.claude 1.0.30");
    expect(it.closed.slice(closedBefore)).toEqual(["har_claude"]);
  });

  it("tries a put-back that can't be done again, then leaves the release on and says so", async () => {
    const it = computer();
    it.busy.set("har_codex", "run");
    await it.tick();
    it.failSwitch((_label, version) =>
      version === "1.0.30" ? new Error("1.0.30 isn't unpacked here.") : undefined,
    );
    await it.through(RETURN_MS);
    // Tried, and it stays as the journal says: being tried, nothing skipped, nothing called put back.
    expect(switches(it).filter((call) => call.endsWith("1.0.30"))).toHaveLength(1);
    expect(it.bridge().trying).toBeDefined();
    expect(it.bridge().skips).toEqual({});
    expect(it.claude()?.phase).toBe("watching");
    await it.through(2 * QUIET_CHECK_MS);
    expect(switches(it).filter((call) => call.endsWith("1.0.30"))).toHaveLength(3);
    // Three tries: it stays on the release it was switched to, which isn't taken again.
    expect(it.bridge().trying).toBeUndefined();
    expect(Object.keys(it.bridge().skips)).toEqual(["1.0.31"]);
    expect(it.claude()).toMatchObject({ phase: "current", running: "1.0.31" });
    expect(it.claude()?.last?.outcome).not.toBe("put-back");
    await it.through(2 * QUIET_CHECK_MS);
    expect(switches(it).filter((call) => call.endsWith("1.0.30"))).toHaveLength(3);
  });

  it("doesn't count someone else holding the bridge as a try at putting it back", async () => {
    const it = computer();
    it.busy.set("har_codex", "run");
    await it.tick();
    it.failSwitch((_label, version) =>
      version === "1.0.30"
        ? new BridgeRefusal("busy", "Chips is changing this bridge.")
        : undefined,
    );
    await it.through(RETURN_MS + 5 * QUIET_CHECK_MS);
    expect(it.bridge().trying).toBeDefined();
    it.failSwitch(undefined);
    await it.tick(QUIET_CHECK_MS);
    expect(it.claude()?.last).toMatchObject({ outcome: "put-back" });
  });

  it("lets a watched switch go when its service is disconnected, and takes up the other one", async () => {
    const it = computer();
    it.busy.set("har_claude", "run");
    await it.tick();
    expect(switches(it)).toEqual(["switch chat.chips.codex 1.0.31"]);
    // `chips disconnect codex`, with the journal still saying Codex is being tried.
    it.keep(it.bridge().kept.filter((kept) => kept.id !== "codex"));
    it.busy.delete("har_claude");
    await it.tick(QUIET_CHECK_MS);
    expect(it.bridge().trying).toBeUndefined();
    expect(it.bridge().skips).toEqual({});
    await it.tick(QUIET_CHECK_MS);
    expect(switches(it).at(-1)).toBe("switch chat.chips.claude 1.0.31");
  });

  it("lets a watched switch go when its key can no longer be read", async () => {
    const it = computer({ start: HALFWAY });
    it.keep(
      it
        .bridge()
        .kept.map((kept) => (kept.id === "claude" ? { ...kept, harnessId: undefined } : kept)),
    );
    it.busy.set("har_codex", "run");
    await it.tick();
    expect(it.bridge().trying).toBeUndefined();
    expect(switches(it)).toEqual([]);
  });

  it("lets a watched switch go, putting nothing back, when someone moved the link by hand", async () => {
    const it = computer({
      // `chips connect --update` took it to 1.0.32 while 1.0.31 was being watched.
      start: { inUse: "1.0.32", staged: ["1.0.30", "1.0.31", "1.0.32"], trying: TRYING },
    });
    it.busy.set("har_codex", "run");
    await it.tick();
    it.updater.heard("har_claude", "1.0.32");
    await it.through(RETURN_MS + QUIET_CHECK_MS);
    expect(switches(it)).toEqual([]);
    expect(it.bridge().trying).toBeUndefined();
    expect(it.bridge().skips).toEqual({});
    expect(it.claude()).toMatchObject({ phase: "current", running: "1.0.32" });
  });

  it("closes a harness's sockets once, not at every look, when its switch is refused", async () => {
    const it = computer();
    it.busy.set("har_codex", "run");
    it.failSwitch(() => new BridgeRefusal("busy", "Chips is changing this bridge."));
    await it.tick();
    expect(it.closed).toEqual(["har_claude"]);
    await it.through(CONNECTED_FOR_MS - QUIET_CHECK_MS);
    expect(it.closed).toEqual(["har_claude"]);
    expect(it.bridge().trying).toBeUndefined();
    // Ten minutes on it is tried again.
    it.failSwitch(undefined);
    await it.through(2 * QUIET_CHECK_MS);
    expect(switches(it).at(-1)).toBe("switch chat.chips.claude 1.0.31");
    expect(it.claude()?.phase).toBe("watching");
  });

  it("doesn't count the time a Mac slept through against a bridge that hadn't said hello yet", async () => {
    const it = computer();
    it.busy.set("har_codex", "run");
    await it.tick();
    await it.tick(QUIET_CHECK_MS);
    // The lid closes for an hour, a look after the switch.
    await it.tick(60 * 60_000);
    expect(switches(it)).toEqual(["switch chat.chips.claude 1.0.31"]);
    expect(it.claude()?.phase).toBe("watching");
    // Awake again, it has what was left of its five minutes, and comes back in them.
    it.updater.heard("har_claude", "1.0.31");
    await it.through(SETTLED_MS + QUIET_CHECK_MS);
    expect(it.claude()?.last).toMatchObject({ outcome: "updated" });
  });

  it("starts a bridge's five minutes at the switch, not before a download that took two", async () => {
    const it = computer();
    it.busy.set("har_codex", "run");
    it.whileStaging(() => it.clock.advance(2 * 60_000));
    await it.tick();
    expect(Date.parse(it.bridge().trying?.at ?? "")).toBe(T0 + 2 * 60_000);
    expect(it.claude()?.since).toBe(new Date(T0 + 2 * 60_000).toISOString());
  });

  it("takes what a bridge says it runs in its hello over what the journal says it was started on", async () => {
    // The journal says Claude Code was started on 1.0.31, but the link was put back since and
    // its service started again on 1.0.30, which is what it says.
    const it = computer({
      start: {
        kept: [
          {
            id: "claude",
            label: "chat.chips.claude",
            harnessId: "har_claude",
            startedOn: "1.0.31",
          },
        ],
      },
    });
    await it.tick();
    expect(it.claude()).toMatchObject({ phase: "current", running: "1.0.31" });
    expect(it.calls).toEqual([]);
    it.updater.heard("har_claude", "1.0.30");
    it.busy.set("har_claude", "run");
    await it.tick(REVIEW_MS);
    expect(it.claude()).toMatchObject({ phase: "waiting", running: "1.0.30", target: "1.0.31" });
    // A hello that isn't a release's number is no word on what runs.
    const odd = computer();
    odd.updater.heard("har_claude", "0.0.0-dev");
    odd.busy.set("har_claude", "run");
    odd.busy.set("har_codex", "run");
    await odd.tick();
    expect(odd.claude()).toMatchObject({ running: "1.0.30", target: "1.0.31" });
  });

  it("fetches and checks a release again when the folder here was never checked against the signed checksum", async () => {
    const it = computer({ start: { staged: ["1.0.30", "1.0.31"], verified: {} } });
    it.busy.set("har_claude", "run");
    it.busy.set("har_codex", "run");
    await it.tick();
    expect(it.calls).toEqual(["stage @chipschat/acp 1.0.31"]);
    // Checked against another checksum than the signed one: the same.
    const other = computer({
      start: { staged: ["1.0.30", "1.0.31"], verified: { "1.0.31": "sha512-other" } },
    });
    other.busy.set("har_claude", "run");
    other.busy.set("har_codex", "run");
    await other.tick();
    expect(other.calls).toEqual(["stage @chipschat/acp 1.0.31"]);
  });

  it("updates nothing on a computer run from a checkout", async () => {
    const it = computer({ version: "0.0.0" });
    await it.tick();
    expect(it.calls).toEqual([]);
  });

  it("waits the two days and this computer's spread past them", async () => {
    const it = computer({ list: listed([{ version: "1.0.31", daysOld: 2 }]) });
    const spread = spreadOf("ws_1");
    await it.tick();
    // Two days old exactly: still inside this computer's spread, unless its spread is nothing.
    expect(it.calls.length > 0).toBe(spread === 0);
  });
});

describe("its first probe", () => {
  /** Claude Code's service switched to 1.0.31, Codex busy throughout. */
  async function switched(options: Parameters<typeof computer>[0] = {}) {
    const it = computer(options);
    it.busy.set("har_codex", "run");
    it.holdItsWord();
    await it.tick();
    expect(it.claude()?.phase).toBe("watching");
    return it;
  }

  it("isn't back until it has said how its harness is, however long it stays connected", async () => {
    const it = await switched();
    it.updater.heard("har_claude", "1.0.31");
    await it.through(3 * SETTLED_MS);
    expect(it.claude()?.phase).toBe("watching");
    // It says so: back from the look that first sees it, and done a minute on.
    it.updater.said("har_claude");
    await it.tick(QUIET_CHECK_MS);
    expect(it.claude()?.phase).toBe("watching");
    await it.tick(SETTLED_MS);
    expect(it.claude()).toMatchObject({ phase: "current", running: "1.0.31" });
    expect(it.claude()?.last?.outcome).toBe("updated");
  });

  it("is put back when it connects and never says how its harness is", async () => {
    const it = await switched();
    it.updater.heard("har_claude", "1.0.31");
    await it.through(RETURN_MS);
    expect(it.calls).toContain("switch chat.chips.claude 1.0.30");
    expect(it.claude()?.last).toMatchObject({ outcome: "put-back", reason: "no-return" });
  });

  it("takes no word from the release before for the new one's", async () => {
    const it = await switched();
    // The old process connects again as it is being stopped, and says how it is.
    it.updater.heard("har_claude", "1.0.30");
    it.updater.said("har_claude");
    // The new one says hello and nothing more.
    it.updater.heard("har_claude", "1.0.31");
    await it.through(3 * SETTLED_MS);
    expect(it.claude()?.phase).toBe("watching");
    it.updater.said("har_claude");
    await it.tick(QUIET_CHECK_MS);
    await it.tick(SETTLED_MS);
    expect(it.claude()?.last?.outcome).toBe("updated");
  });

  it("takes no word said before any hello", async () => {
    const it = await switched();
    it.updater.said("har_claude");
    it.updater.heard("har_claude", "1.0.31");
    await it.through(3 * SETTLED_MS);
    expect(it.claude()?.phase).toBe("watching");
  });

  it("takes no word from an earlier try at the same release", async () => {
    const it = computer();
    it.busy.set("har_codex", "run");
    it.started.set("chat.chips.claude", 5);
    await it.tick();
    it.updater.heard("har_claude", "1.0.31");
    await it.tick(QUIET_CHECK_MS);
    await it.tick(SETTLED_MS);
    expect(it.claude()?.last?.outcome).toBe("updated");
    // It kept stopping in its first day, and was put back.
    it.started.set("chat.chips.claude", 20);
    await it.tick(REVIEW_MS);
    expect(it.claude()?.last).toMatchObject({ outcome: "put-back", reason: "exits" });
    // A week on the release is tried again. This time it connects and says nothing of its
    // harness: what it said the first time is not its word now.
    it.holdItsWord();
    await it.tick(SKIP_MS);
    expect(it.claude()).toMatchObject({ phase: "watching", target: "1.0.31" });
    it.updater.heard("har_claude", "1.0.31");
    await it.through(3 * SETTLED_MS);
    expect(it.claude()?.phase).toBe("watching");
  });

  it("counts its minute from its first word, though it says it again every half minute", async () => {
    const it = await switched();
    it.updater.heard("har_claude", "1.0.31");
    it.updater.said("har_claude");
    await it.tick(QUIET_CHECK_MS);
    it.updater.said("har_claude");
    await it.tick(QUIET_CHECK_MS);
    it.updater.said("har_claude");
    await it.tick(QUIET_CHECK_MS);
    expect(it.claude()).toMatchObject({ phase: "current", running: "1.0.31" });
  });

  it("is not waited for by a server that started after the switch, which may have missed it", async () => {
    const trying = {
      label: "chat.chips.claude",
      harnessId: "har_claude",
      from: "1.0.30",
      to: "1.0.31",
      at: new Date(T0 - 60_000).toISOString(),
    };
    const it = computer({ start: { inUse: "1.0.31", staged: ["1.0.30", "1.0.31"], trying } });
    it.busy.set("har_codex", "run");
    it.holdItsWord();
    await it.tick();
    // Connected again to the new server, it says hello and no more: it said how it is before.
    it.updater.heard("har_claude", "1.0.31");
    await it.tick(QUIET_CHECK_MS);
    await it.tick(SETTLED_MS);
    expect(it.claude()?.last?.outcome).toBe("updated");
  });
});

describe("its first day on a release", () => {
  const CLAUDE = "chat.chips.claude";
  const switchesOf = (it: ReturnType<typeof computer>) =>
    it.calls.filter((call) => call.startsWith("switch"));

  /** Claude Code's service back on 1.0.31 and done, Codex busy throughout. */
  async function done(starts?: number) {
    const it = computer();
    it.busy.set("har_codex", "run");
    if (starts !== undefined) it.started.set(CLAUDE, starts);
    await it.tick();
    it.updater.heard("har_claude", "1.0.31");
    await it.tick(QUIET_CHECK_MS);
    await it.tick(SETTLED_MS);
    expect(it.claude()?.last?.outcome).toBe("updated");
    return it;
  }

  it("begins when it is back, kept in the journal with the release to go back to, and ends a day on", async () => {
    const it = await done(5);
    expect(it.bridge().proving).toEqual({
      [CLAUDE]: {
        harnessId: "har_claude",
        from: "1.0.30",
        to: "1.0.31",
        since: new Date(T0).toISOString(),
      },
    });
    await it.tick(PROVING_MS - 2 * REVIEW_MS);
    expect(it.bridge().proving[CLAUDE]).toBeDefined();
    await it.tick(2 * REVIEW_MS);
    expect(it.bridge().proving).toEqual({});
    // A service that stops often after its first day is nobody's to put back.
    it.started.set(CLAUDE, 50);
    await it.tick(REVIEW_MS);
    expect(switchesOf(it)).toEqual([`switch ${CLAUDE} 1.0.31`]);
  });

  it("puts it back when its service has stopped more than three times, and skips the release", async () => {
    const it = await done(5);
    // Three times is not more than three.
    it.started.set(CLAUDE, 5 + EXITS_MOST);
    await it.tick(REVIEW_MS);
    expect(switchesOf(it)).toHaveLength(1);
    it.started.set(CLAUDE, 5 + EXITS_MOST + 1);
    await it.tick(REVIEW_MS);
    expect(switchesOf(it).at(-1)).toBe(`switch ${CLAUDE} 1.0.30`);
    expect(it.closed).toEqual(["har_claude", "har_claude"]);
    expect(it.claude()).toMatchObject({ phase: "current", running: "1.0.30" });
    expect(it.claude()?.last).toMatchObject({
      outcome: "put-back",
      from: "1.0.30",
      to: "1.0.31",
      reason: "exits",
    });
    expect(it.bridge().proving).toEqual({});
    expect(Date.parse(it.bridge().skips["1.0.31"] ?? "")).toBe(it.clock.nowMs() + SKIP_MS);
    // Back on the release before, it isn't taken again for the week.
    it.updater.heard("har_claude", "1.0.30");
    await it.tick(REVIEW_MS);
    expect(switchesOf(it)).toHaveLength(2);
    expect(it.claude()?.phase).toBe("current");
  });

  it("waits for a quiet moment to put it back, looking as often as a switch waits", async () => {
    const it = await done(5);
    it.started.set(CLAUDE, 20);
    it.busy.set("har_claude", "run");
    await it.tick(REVIEW_MS);
    expect(switchesOf(it)).toHaveLength(1);
    expect(it.claude()).toMatchObject({ phase: "current", running: "1.0.31" });
    it.busy.delete("har_claude");
    // The next look is half a minute on, not ten.
    await it.tick(QUIET_CHECK_MS);
    expect(switchesOf(it).at(-1)).toBe(`switch ${CLAUDE} 1.0.30`);
  });

  it("counts no stop from before this server started, or from before a count that began again", async () => {
    // A new server, with a first day in the journal and a service started fifty times so far.
    const proving = {
      [CLAUDE]: {
        harnessId: "har_claude",
        from: "1.0.30",
        to: "1.0.31",
        since: new Date(T0 - 60 * 60_000).toISOString(),
      },
    };
    const it = computer({
      list: listed([{ version: "1.0.31", daysOld: 9 }]),
      start: { inUse: "1.0.31", staged: ["1.0.30", "1.0.31"], proving },
    });
    it.busy.set("har_codex", "run");
    it.started.set(CLAUDE, 50);
    it.updater.heard("har_claude", "1.0.31");
    await it.tick();
    it.started.set(CLAUDE, 50 + EXITS_MOST);
    await it.tick(REVIEW_MS);
    expect(switchesOf(it)).toEqual([]);
    // A new login: launchd counts from nothing again, and so does this.
    it.started.set(CLAUDE, 1);
    await it.tick(REVIEW_MS);
    it.started.set(CLAUDE, 1 + EXITS_MOST);
    await it.tick(REVIEW_MS);
    expect(switchesOf(it)).toEqual([]);
    it.started.set(CLAUDE, 2 + EXITS_MOST);
    await it.tick(REVIEW_MS);
    expect(switchesOf(it)).toEqual([`switch ${CLAUDE} 1.0.30`]);
  });

  it("puts it back when its first three turns all failed, where the turn before hadn't", async () => {
    const it = await done();
    it.turns.set("har_claude", { ended: 2, failed: 2, failedBefore: false });
    await it.tick(REVIEW_MS);
    expect(switchesOf(it)).toHaveLength(1);
    it.turns.set("har_claude", { ended: 3, failed: 3, failedBefore: false });
    await it.tick(REVIEW_MS);
    expect(switchesOf(it).at(-1)).toBe(`switch ${CLAUDE} 1.0.30`);
    expect(it.claude()?.last).toMatchObject({ outcome: "put-back", reason: "turns" });
  });

  it("holds failed turns against no release when one worked, or it was failing already", async () => {
    const worked = await done();
    worked.turns.set("har_claude", { ended: 9, failed: 8, failedBefore: false });
    await worked.tick(REVIEW_MS);
    expect(switchesOf(worked)).toHaveLength(1);

    const already = await done();
    already.turns.set("har_claude", { ended: 9, failed: 9, failedBefore: true });
    await already.tick(REVIEW_MS);
    expect(switchesOf(already)).toHaveLength(1);
  });

  it("judges only its turns where the service manager says nothing of its starts", async () => {
    const it = await done();
    await it.tick(REVIEW_MS);
    expect(switchesOf(it)).toHaveLength(1);
    it.turns.set("har_claude", { ended: 3, failed: 3, failedBefore: false });
    await it.tick(REVIEW_MS);
    expect(switchesOf(it)).toHaveLength(2);
  });

  it("ends without putting anything back when the service was started on another release by hand", async () => {
    const it = await done(5);
    it.started.set(CLAUDE, 30);
    it.updater.heard("har_claude", "1.0.33");
    await it.tick(REVIEW_MS);
    expect(it.bridge().proving).toEqual({});
    expect(switchesOf(it)).toHaveLength(1);
  });

  it("waits for another switch on the package to be over before putting it back", async () => {
    const it = await done(5);
    // Codex goes quiet and is switched: its switch is being watched.
    it.busy.delete("har_codex");
    await it.tick(REVIEW_MS);
    expect(it.bridge().trying?.label).toBe("chat.chips.codex");
    it.started.set(CLAUDE, 30);
    await it.tick(QUIET_CHECK_MS);
    expect(switchesOf(it).filter((call) => call.endsWith("1.0.30"))).toEqual([]);
    // Codex is back and done: now Claude Code's goes back.
    it.updater.heard("har_codex", "1.0.31");
    await it.tick(QUIET_CHECK_MS);
    await it.tick(SETTLED_MS);
    await it.tick(QUIET_CHECK_MS);
    expect(switchesOf(it).at(-1)).toBe(`switch ${CLAUDE} 1.0.30`);
  });

  it("tries a put-back that can't be made three times, then leaves the release on", async () => {
    const it = await done(5);
    it.started.set(CLAUDE, 30);
    it.failSwitch((_label, version) =>
      version === "1.0.30" ? new Error("1.0.30 isn't unpacked here.") : undefined,
    );
    await it.tick(REVIEW_MS);
    await it.through(4 * QUIET_CHECK_MS);
    expect(switchesOf(it).filter((call) => call.endsWith("1.0.30"))).toHaveLength(3);
    expect(it.bridge().proving).toEqual({});
    expect(it.claude()).toMatchObject({ phase: "current", running: "1.0.31" });
    expect(it.claude()?.last?.outcome).toBe("updated");
  });

  it("doesn't count someone else holding the bridge as a try", async () => {
    const it = await done(5);
    it.started.set(CLAUDE, 30);
    it.failSwitch((_label, version) =>
      version === "1.0.30"
        ? new BridgeRefusal("busy", "Chips is changing this bridge.")
        : undefined,
    );
    await it.tick(REVIEW_MS);
    await it.through(6 * QUIET_CHECK_MS);
    expect(it.bridge().proving[CLAUDE]).toBeDefined();
    it.failSwitch(undefined);
    await it.tick(QUIET_CHECK_MS);
    expect(it.claude()?.last).toMatchObject({ outcome: "put-back", reason: "exits" });
  });

  it("takes the next release in its first day, and starts a first day on that", async () => {
    // 1.0.32 has been out long enough for this computer twelve hours from now.
    const HALF_DAY = DAY / 2;
    const daysOld = (RELEASE_WAIT_MS + spreadOf("ws_1") - HALF_DAY) / DAY;
    const it = computer({
      list: listed([
        { version: "1.0.32", daysOld },
        { version: "1.0.31", daysOld: 9 },
      ]),
    });
    it.busy.set("har_codex", "run");
    await it.tick();
    it.updater.heard("har_claude", "1.0.31");
    await it.tick(QUIET_CHECK_MS);
    await it.tick(SETTLED_MS);
    expect(it.bridge().proving[CLAUDE]).toMatchObject({ from: "1.0.30", to: "1.0.31" });
    await it.tick(HALF_DAY);
    expect(switchesOf(it).at(-1)).toBe(`switch ${CLAUDE} 1.0.32`);
    // While that switch is watched, the first day in the journal is still the one before's.
    expect(it.bridge().proving[CLAUDE]).toMatchObject({ from: "1.0.30", to: "1.0.31" });
    it.updater.heard("har_claude", "1.0.32");
    await it.tick(QUIET_CHECK_MS);
    await it.tick(SETTLED_MS);
    expect(it.bridge().proving[CLAUDE]).toMatchObject({ from: "1.0.31", to: "1.0.32" });
  });
});

describe("the harness behind it", () => {
  const CLAUDE = "chat.chips.claude";
  const CODEX = "chat.chips.codex";
  const out = () =>
    listed([
      { version: "1.0.32", daysOld: 9, needs: { claude: "3.0.0" } },
      { version: "1.0.31", daysOld: 9 },
    ]);

  it("fits a release that names nothing, or a floor it meets, and not one above it", () => {
    const choose = (have: string | undefined) =>
      chooseRelease({
        listed: out(),
        major: 1,
        running: "1.0.30",
        computer: "1.2.5",
        siteNow: T0,
        now: T0,
        waitMs: RELEASE_WAIT_MS,
        skips: {},
        fits: (release) =>
          release.needs?.["claude"] === undefined ||
          have === undefined ||
          !laterThan(release.needs["claude"], have),
      })?.version;
    expect(choose("2.9.9")).toBe("1.0.31");
    expect(choose("3.0.0")).toBe("1.0.32");
    expect(choose("3.1.0")).toBe("1.0.32");
    expect(choose(undefined)).toBe("1.0.32");
  });

  it("takes the newest release its harness is new enough for, and says what the next needs", async () => {
    const it = computer({ list: out() });
    it.harnesses.set(CLAUDE, "2.1.0");
    it.busy.set("har_codex", "run");
    await it.tick();
    // Claude Code is too old for 1.0.32: its service takes 1.0.31.
    expect(it.calls).toContain("stage @chipschat/acp 1.0.31");
    expect(it.calls.at(-1)).toBe(`switch ${CLAUDE} 1.0.31`);
    it.updater.heard("har_claude", "1.0.31");
    await it.tick(QUIET_CHECK_MS);
    await it.tick(SETTLED_MS);
    await it.tick(REVIEW_MS);
    expect(it.claude()).toMatchObject({
      phase: "refused",
      running: "1.0.31",
      target: "1.0.32",
      reason: "harness",
      needs: "3.0.0",
    });
    // Codex's service is kept for another card, which the release names nothing for.
    expect(it.codex()).toMatchObject({ phase: "waiting", target: "1.0.32" });
    expect(it.asked).not.toContain(CODEX);

    // Claude Code is updated: asked again within the hour, and the release is taken.
    it.harnesses.set(CLAUDE, "3.0.2");
    await it.tick(HARNESS_ASKED_MS);
    expect(it.calls.filter((call) => call.startsWith("switch")).at(-1)).toBe(
      `switch ${CLAUDE} 1.0.32`,
    );
  });

  it("says a release is out that its harness is too old for, when nothing else is", async () => {
    const it = computer({
      list: listed([{ version: "1.0.31", daysOld: 9, needs: { claude: "3.0.0" } }]),
    });
    it.harnesses.set(CLAUDE, "2.1.0");
    it.busy.set("har_codex", "run");
    await it.tick();
    expect(it.claude()).toMatchObject({
      phase: "refused",
      running: "1.0.30",
      target: "1.0.31",
      reason: "harness",
      needs: "3.0.0",
    });
    expect(it.calls.filter((call) => call.startsWith("stage"))).toEqual([
      "stage @chipschat/acp 1.0.31",
    ]);
    expect(it.calls.filter((call) => call.startsWith("switch"))).toEqual([]);
  });

  it("takes the release when the harness can't be told: the bridge checks itself at its start", async () => {
    const it = computer({
      list: listed([{ version: "1.0.31", daysOld: 9, needs: { claude: "3.0.0" } }]),
    });
    it.busy.set("har_codex", "run");
    await it.tick();
    expect(it.asked).toContain(CLAUDE);
    expect(it.calls.at(-1)).toBe(`switch ${CLAUDE} 1.0.31`);
  });

  it("asks nothing of the harness when no release names what it needs, and once an hour when one does", async () => {
    const plain = computer();
    plain.busy.set("har_claude", "run");
    plain.busy.set("har_codex", "run");
    await plain.tick();
    await plain.through(3 * REVIEW_MS);
    expect(plain.asked).toEqual([]);

    const it = computer({
      list: listed([{ version: "1.0.31", daysOld: 9, needs: { claude: "3.0.0" } }]),
    });
    it.harnesses.set(CLAUDE, "2.1.0");
    it.busy.set("har_codex", "run");
    await it.tick();
    await it.through(HARNESS_ASKED_MS - REVIEW_MS);
    expect(it.asked).toEqual([CLAUDE]);
    await it.through(2 * REVIEW_MS);
    expect(it.asked).toEqual([CLAUDE, CLAUDE]);
  });
});

describe("a look that goes wrong", () => {
  const BRIDGE: LocalBridge = {
    package: "@chipschat/acp",
    major: 1,
    inUse: "1.0.30",
    recorded: "1.0.30",
    previous: undefined,
    staged: ["1.0.30"],
    verified: {},
    kept: [
      { id: "claude", label: "chat.chips.claude", harnessId: "har_claude", startedOn: "1.0.30" },
    ],
    skips: {},
    trying: undefined,
    proving: {},
    last: {},
  };
  const HERMES: LocalBridge = {
    ...BRIDGE,
    package: "@chipschat/hermes",
    kept: [
      { id: "hermes", label: "chat.chips.hermes", harnessId: "har_hermes", startedOn: "1.0.30" },
    ],
  };

  /** An updater over hands a test writes, with what it logged as going wrong. */
  function watched(
    hands: Partial<BridgeHands>,
    more: { busy?: (harnessId: string) => never } = {},
  ) {
    const clock = manualClock(T0);
    const wrong: { said: string; package: unknown }[] = [];
    const logging = {
      ...logger,
      error: (fields: { package?: unknown }, said: string) => {
        wrong.push({ said, package: fields.package });
      },
    } as unknown as typeof logger;
    const updater = bridgeUpdater({
      hands: {
        list: async () => [BRIDGE],
        stage: async () => undefined,
        switchTo: async () => true,
        note: async () => undefined,
        starts: async () => undefined,
        harnessVersion: async () => undefined,
        ...hands,
      },
      list: () => ({
        packages: {
          "@chipschat/acp": listed([{ version: "1.0.31", daysOld: 9 }]),
          "@chipschat/hermes": listed([{ version: "1.0.31", daysOld: 9 }]),
        },
        at: new Date(T0).toISOString(),
        heardAt: T0,
      }),
      computer: "1.2.5",
      wait: "now",
      seed: async () => "ws_1",
      workspaceOf: async () => "ws_1",
      stateOf: () => ({ connected: true, since: new Date(T0 - CONNECTED_FOR_MS).toISOString() }),
      busy: async (_workspace, harnessId) => more.busy?.(harnessId),
      turns: async () => ({ ended: 0, failed: 0, failedBefore: false }),
      closeHarness: () => 1,
      clock,
      logger: logging,
    });
    const tick = async (ms = 0) => {
      clock.advance(ms);
      updater.tick();
      await updater.settled();
    };
    return { updater, tick, wrong };
  }

  it("is written in the log, and the next look goes on as if it hadn't", async () => {
    let looks = 0;
    const it = watched({
      list: async () => {
        looks += 1;
        if (looks === 1) throw new Error("the folder can't be read");
        return [BRIDGE];
      },
    });
    await it.tick();
    expect(it.wrong).toEqual([{ said: "bridge review failed", package: undefined }]);
    expect(it.updater.states().size).toBe(0);
    // Ten minutes on it looks again, and the bridge is said as it is.
    await it.tick(REVIEW_MS);
    expect(looks).toBe(2);
    expect(it.updater.states().get("har_claude")).toMatchObject({ running: "1.0.30" });
    expect(it.wrong).toHaveLength(1);
  });

  it("with one bridge leaves the bridges after it looked at all the same", async () => {
    const it = watched(
      { list: async () => [BRIDGE, HERMES] },
      {
        busy: (harnessId) => {
          if (harnessId === "har_claude") throw new Error("the database is locked");
          return undefined as never;
        },
      },
    );
    await it.tick();
    expect(it.wrong).toEqual([{ said: "bridge update failed", package: "@chipschat/acp" }]);
    // Hermes's bridge, after it in the list, was staged and switched all the same.
    expect(it.updater.states().get("har_hermes")).toMatchObject({
      package: "@chipschat/hermes",
      phase: "watching",
      target: "1.0.31",
    });
  });

  it("says so when a switch nobody can watch can't be let go either", async () => {
    // The journal names a service that is kept no more, and the folder won't take the note.
    const it = watched({
      list: async () => [
        {
          ...BRIDGE,
          trying: {
            label: "chat.chips.gone",
            harnessId: "har_gone",
            from: "1.0.30",
            to: "1.0.31",
            at: new Date(T0).toISOString(),
          },
        },
      ],
      note: async () => {
        throw new Error("the disk is full");
      },
    });
    await it.tick();
    expect(it.wrong).toEqual([{ said: "bridge update failed", package: "@chipschat/acp" }]);
    // The service that is kept is still said as it is.
    expect(it.updater.states().get("har_claude")).toMatchObject({ running: "1.0.30" });
  });
});
