/**
 * Whether each harness can answer (ADR 0083): connected while a socket of it is open, offline
 * only after a grace with none, taken as connected while the process starts, and in trouble for
 * as long as it says so and is here to say it.
 */

import type { AgentState } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInProcessPresence } from "./in-process-presence.js";

const WS = "ws_1";
const SCOUT = "hrn_scout";
const START = Date.parse("2026-09-28T18:00:00.000Z");
const GRACE = 15_000;

let clock = START;
const now = () => clock;
const iso = (ms: number) => new Date(ms).toISOString();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  clock = START;
});
afterEach(() => {
  vi.useRealTimers();
});

/** Move the clock and the timers together. */
function pass(ms: number): void {
  clock += ms;
  vi.advanceTimersByTime(ms);
}

function watched() {
  const presence = createInProcessPresence({ now, graceMs: GRACE });
  const heard: { harnessId: string; state: AgentState }[] = [];
  presence.watch((_ws, harnessId, state) => heard.push({ harnessId, state }));
  return { presence, heard };
}

describe("presence (ADR 0083)", () => {
  it("takes every harness as connected while the process starts, then offline since the start", () => {
    const { presence, heard } = watched();
    expect(presence.stateOf(WS, SCOUT)).toEqual({ connected: true, since: iso(START) });
    pass(GRACE);
    expect(presence.stateOf(WS, SCOUT)).toEqual({ connected: false, since: iso(START) });
    // Told once, of the harness somebody asked about while it was starting.
    expect(heard).toEqual([{ harnessId: SCOUT, state: { connected: false, since: iso(START) } }]);
    // One nobody asked about until now is offline since the start, and nobody need be told.
    expect(presence.stateOf(WS, "hrn_other")).toEqual({ connected: false, since: iso(START) });
    presence.close();
  });

  it("has a harness made since the start offline from when it was made, not since the start (audit Part 2, item 9)", () => {
    const { presence } = watched();
    pass(GRACE + 60_000);
    presence.added(WS, "hrn_new");
    expect(presence.stateOf(WS, "hrn_new")).toEqual({ connected: false, since: iso(clock) });
    // Its first socket makes it connected, as any other's does.
    pass(3000);
    presence.opened(WS, "hrn_new");
    expect(presence.stateOf(WS, "hrn_new")).toEqual({ connected: true, since: iso(clock) });
    presence.close();
  });

  it("never takes a harness made while the process starts as connected: it has nothing to come back from", () => {
    const { presence, heard } = watched();
    pass(2000);
    presence.added(WS, "hrn_new");
    expect(presence.stateOf(WS, "hrn_new")).toEqual({ connected: false, since: iso(START + 2000) });
    pass(GRACE);
    expect(presence.stateOf(WS, "hrn_new")).toEqual({ connected: false, since: iso(START + 2000) });
    expect(heard).toEqual([]);
    presence.close();
  });

  it("is connected from a socket opened while starting, and says nothing of it", () => {
    const { presence, heard } = watched();
    presence.stateOf(WS, SCOUT);
    pass(2000);
    presence.opened(WS, SCOUT);
    pass(GRACE);
    expect(presence.stateOf(WS, SCOUT)).toEqual({ connected: true, since: iso(START + 2000) });
    expect(heard).toEqual([]);
    presence.close();
  });

  it("goes offline only once no socket has opened again within the grace", () => {
    const { presence, heard } = watched();
    pass(GRACE);
    presence.opened(WS, SCOUT);
    presence.opened(WS, SCOUT);
    expect(heard.map((each) => each.state.connected)).toEqual([true]);
    // One of two closes: still here.
    presence.closed(WS, SCOUT);
    pass(GRACE * 2);
    expect(presence.stateOf(WS, SCOUT).connected).toBe(true);
    // The last closes and a new one opens within the grace: a reconnect, never a flash.
    presence.closed(WS, SCOUT);
    pass(5000);
    presence.opened(WS, SCOUT);
    pass(GRACE);
    expect(heard.map((each) => each.state.connected)).toEqual([true]);
    // The last closes for good: offline since it closed, and told once.
    const closedAt = clock;
    presence.closed(WS, SCOUT);
    pass(GRACE - 1);
    expect(presence.stateOf(WS, SCOUT).connected).toBe(true);
    pass(1);
    expect(presence.stateOf(WS, SCOUT)).toEqual({ connected: false, since: iso(closedAt) });
    expect(heard.map((each) => each.state.connected)).toEqual([true, false]);
    presence.close();
  });

  it("holds the trouble a harness reports from when it first said so, until it says it is fine", () => {
    const { presence, heard } = watched();
    pass(GRACE);
    presence.opened(WS, SCOUT);
    const said = clock;
    expect(presence.report(WS, SCOUT, "Can't reach its gateway").trouble).toEqual({
      reason: "Can't reach its gateway",
      since: iso(said),
    });
    pass(60_000);
    // The same again changes nothing; other words keep when it began.
    presence.report(WS, SCOUT, "Can't reach its gateway");
    expect(presence.report(WS, SCOUT, "Its gateway refused the token").trouble).toEqual({
      reason: "Its gateway refused the token",
      since: iso(said),
    });
    expect(presence.report(WS, SCOUT, undefined).trouble).toBeUndefined();
    presence.report(WS, SCOUT, undefined);
    expect(heard.map((each) => each.state.trouble?.reason ?? null)).toEqual([
      null,
      "Can't reach its gateway",
      "Its gateway refused the token",
      null,
    ]);
    presence.close();
  });

  it("forgets the trouble when the harness goes offline: offline says more", () => {
    const { presence } = watched();
    pass(GRACE);
    presence.opened(WS, SCOUT);
    presence.report(WS, SCOUT, "Can't reach its gateway");
    presence.closed(WS, SCOUT);
    pass(GRACE);
    expect(presence.stateOf(WS, SCOUT).trouble).toBeUndefined();
    presence.opened(WS, SCOUT);
    expect(presence.stateOf(WS, SCOUT)).toEqual({ connected: true, since: iso(clock) });
    presence.close();
  });

  it("keeps workspaces apart, and stops telling anybody once closed", () => {
    const { presence, heard } = watched();
    pass(GRACE);
    presence.opened("ws_2", SCOUT);
    expect(presence.stateOf(WS, SCOUT).connected).toBe(false);
    presence.close();
    presence.opened(WS, SCOUT);
    expect(heard).toHaveLength(1);
  });
});

describe("restarting (ADR 0094)", () => {
  const ARJUN = "usr_arjun";
  const WAIT = 180_000;
  function restartable() {
    const presence = createInProcessPresence({ now, graceMs: GRACE, restartWaitMs: WAIT });
    const heard: AgentState[] = [];
    presence.watch((_ws, _harnessId, state) => heard.push(state));
    presence.opened(WS, SCOUT);
    pass(GRACE);
    return { presence, heard };
  }

  it("is restarting from the ask, and asked again changes nothing", () => {
    const { presence, heard } = restartable();
    pass(1000);
    const asked = START + GRACE + 1000;
    const state = presence.restarting(WS, SCOUT, ARJUN);
    expect(state.restarting).toEqual({ since: iso(asked), by: ARJUN });
    expect(heard.at(-1)?.restarting).toEqual({ since: iso(asked), by: ARJUN });
    pass(5000);
    expect(presence.restarting(WS, SCOUT, "usr_priya").restarting).toEqual({
      since: iso(asked),
      by: ARJUN,
    });
    expect(heard).toHaveLength(1);
    presence.close();
  });

  it("ends when a harness restarting its own process comes back, through offline", () => {
    const { presence, heard } = restartable();
    presence.restarting(WS, SCOUT, ARJUN);
    presence.closed(WS, SCOUT);
    pass(GRACE);
    // Offline on the way, and still restarting: that is what a restart looks like from here.
    expect(presence.stateOf(WS, SCOUT)).toMatchObject({ connected: false, restarting: {} });
    pass(20_000);
    presence.opened(WS, SCOUT);
    const back = presence.stateOf(WS, SCOUT);
    expect(back.connected).toBe(true);
    expect(back.restarting).toBeUndefined();
    expect(heard.at(-1)).toEqual(back);
    presence.close();
  });

  it("ends when a harness restarting what is behind it reports, fine or not", () => {
    const { presence, heard } = restartable();
    presence.restarting(WS, SCOUT, ARJUN);
    pass(30_000);
    // Fine, having said nothing wrong before: still a word, and everybody is told.
    expect(presence.report(WS, SCOUT, undefined).restarting).toBeUndefined();
    expect(heard.at(-1)?.restarting).toBeUndefined();

    presence.restarting(WS, SCOUT, ARJUN);
    const failed = presence.report(WS, SCOUT, "Colima would not start");
    expect(failed.restarting).toBeUndefined();
    expect(failed.trouble?.reason).toBe("Colima would not start");
    presence.close();
  });

  it("ends a socket opening alongside one that stays: a word all the same", () => {
    const { presence, heard } = restartable();
    presence.restarting(WS, SCOUT, ARJUN);
    presence.opened(WS, SCOUT);
    expect(presence.stateOf(WS, SCOUT).restarting).toBeUndefined();
    expect(heard.at(-1)?.restarting).toBeUndefined();
    presence.close();
  });

  it("gives up after the wait and says again whatever is true then", () => {
    const { presence, heard } = restartable();
    presence.restarting(WS, SCOUT, ARJUN);
    presence.closed(WS, SCOUT);
    pass(WAIT - 1);
    expect(presence.stateOf(WS, SCOUT).restarting).toBeDefined();
    pass(1);
    expect(presence.stateOf(WS, SCOUT)).toEqual({
      connected: false,
      since: iso(START + GRACE),
    });
    expect(heard.at(-1)).toEqual(presence.stateOf(WS, SCOUT));
    // Asked again after giving up, it is a new restart.
    pass(1000);
    expect(presence.restarting(WS, SCOUT, ARJUN).restarting?.since).toBe(
      iso(START + GRACE + WAIT + 1000),
    );
    presence.close();
  });
});
