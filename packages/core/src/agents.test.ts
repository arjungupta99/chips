/**
 * Whether an agent can answer, and a message it hasn't picked up (ADR 0083).
 */

import { describe, expect, it } from "vitest";
import {
  agentStateWords,
  agoWords,
  cantAnswer,
  cantAnswerIn,
  cantAnswerWords,
  connectedWords,
  WATCH_MS,
  waitingOn,
  waitWords,
} from "./agents.js";
import type { Directory, Participant } from "./events.js";
import type { Line, Run, Space } from "./model/types.js";

const ME = "usr_arjun";
const JAC = "hrn_jacobian";
const CLAW = "hrn_openclaw";
const SENT = "2026-09-28T18:27:07.000Z";
const AT = Date.parse(SENT);
/** A clock that says what it was given, so the words are the same wherever the test runs. */
const clock = (iso: string) => `[${iso.slice(11, 16)}]`;

const agent = (id: string, name: string, more: Partial<Participant> = {}): Participant => ({
  id,
  kind: "harness",
  displayName: name,
  lastSeenAt: "2026-09-28T18:00:00.000Z",
  state: { connected: true, since: "2026-09-28T18:20:00.000Z" },
  ...more,
});
const directory = (claw: Partial<Participant> = {}): Directory => ({
  [ME]: { id: ME, kind: "person", displayName: "Arjun" },
  [JAC]: agent(JAC, "Jacobian"),
  [CLAW]: agent(CLAW, "OpenClaw", claw),
});

let seq = 0;
const line = (authorId: string, more: Partial<Line> = {}): Line => {
  seq += 1;
  return {
    id: `line_${seq}`,
    seq,
    kind: "text",
    authorId,
    authorKind: authorId.startsWith("hrn_") ? "harness" : "person",
    text: "…",
    ts: SENT,
    ...more,
  } as Line;
};
const run = (harnessId: string, lastSeq: number): Run =>
  ({ runId: `run_${harnessId}`, spaceId: "spc_joint", harnessId, lastSeq }) as unknown as Run;
const room = (lines: Line[], runs: Run[] = []): Space =>
  ({ id: "spc_joint", members: [ME, JAC, CLAW], lines, runs }) as unknown as Space;

describe("whether an agent can answer (ADR 0083)", () => {
  it("says an offline agent, one in trouble, and one that has never connected; nothing for the rest", () => {
    expect(cantAnswer(directory(), CLAW)).toBeUndefined();
    const offline = directory({ state: { connected: false, since: "2026-09-28T18:12:00.000Z" } });
    expect(cantAnswer(offline, CLAW)).toEqual({
      kind: "offline",
      since: "2026-09-28T18:12:00.000Z",
    });
    const trouble = directory({
      state: {
        connected: true,
        since: "2026-09-28T18:00:00.000Z",
        trouble: { reason: "Can't reach its gateway", since: "2026-09-28T18:12:00.000Z" },
      },
    });
    expect(cantAnswer(trouble, CLAW)).toEqual({
      kind: "trouble",
      reason: "Can't reach its gateway",
      since: "2026-09-28T18:12:00.000Z",
    });
    // Never connected: from the token's stamp, with or without a state from the server.
    expect(cantAnswer(directory({ lastSeenAt: null, state: undefined }), CLAW)).toEqual({
      kind: "offline",
    });
    const never = directory({ lastSeenAt: null, state: { connected: false, since: SENT } });
    expect(cantAnswer(never, CLAW)).toEqual({ kind: "offline" });
    // Connected says more than a stamp from before it connected.
    expect(cantAnswer(directory({ lastSeenAt: null }), CLAW)).toBeUndefined();
    // A person, a removed harness, and a harness from an older server say nothing.
    expect(cantAnswer(directory(), ME)).toBeUndefined();
    expect(
      cantAnswer(directory({ removedAt: SENT, state: { connected: false, since: SENT } }), CLAW),
    ).toBeUndefined();
    expect(cantAnswer(directory({ state: undefined }), CLAW)).toBeUndefined();
    // The room's count, for its header.
    expect(cantAnswerIn(room([]), offline)).toEqual([CLAW]);
    expect(cantAnswerWords(1)).toBe("1 can't answer");
    expect(cantAnswerWords(0)).toBeUndefined();
  });
});

describe("the watch (ADR 0083)", () => {
  it("waits on each agent a person's newest message went to, until anything of the agent's follows it", () => {
    const asked = line(ME, { addressedTo: [JAC, CLAW] });
    // Jacobian's run moved after the message; OpenClaw has said nothing.
    expect(waitingOn(room([asked], [run(JAC, asked.seq + 1)]), directory())).toEqual([
      { lineId: asked.id, harnessId: CLAW, since: SENT },
    ]);
    // A line of OpenClaw's after it ends the wait; one before it does not.
    const before = line(CLAW);
    const again = line(ME, { addressedTo: [CLAW] });
    expect(waitingOn(room([before, again]), directory()).map((each) => each.lineId)).toEqual([
      again.id,
    ]);
    expect(waitingOn(room([before, again, line(CLAW)]), directory())).toEqual([]);
    // A run of OpenClaw's that last moved before the message is no answer to it.
    expect(waitingOn(room([again], [run(CLAW, again.seq - 1)]), directory())).toHaveLength(1);
  });

  it("stops waiting on an agent that passed its turn with NO_REPLY after the message (ADR 0105)", () => {
    const asked = line(ME, { addressedTo: [JAC, CLAW] });
    const passed = (by: string, at: number): Space =>
      ({ ...room([asked]), passed: { [by]: at } }) as Space;
    // OpenClaw had nothing to say, with no run: it heard, so only Jacobian is waited on.
    expect(
      waitingOn(passed(CLAW, asked.seq + 1), directory()).map((each) => each.harnessId),
    ).toEqual([JAC]);
    // A pass from before the message is no answer to it.
    expect(waitingOn(passed(CLAW, asked.seq - 1), directory())).toHaveLength(2);
  });

  it("waits only on the newest message, on one the server has, and on one that named the agent", () => {
    const first = line(ME, { addressedTo: [CLAW] });
    const newest = line(ME, { addressedTo: [CLAW] });
    expect(waitingOn(room([first, newest]), directory()).map((each) => each.lineId)).toEqual([
      newest.id,
    ]);
    // Still on its way: the wait starts when the server has it.
    expect(
      waitingOn(room([line(ME, { addressedTo: [CLAW], pending: true })]), directory()),
    ).toEqual([]);
    // For Jacobian only; from before Chips said who a message is for; an agent's own words.
    expect(
      waitingOn(room([line(ME, { addressedTo: [JAC] })], [run(JAC, 999)]), directory()),
    ).toEqual([]);
    expect(waitingOn(room([line(ME)]), directory())).toEqual([]);
    expect(waitingOn(room([line(JAC, { addressedTo: [CLAW] })]), directory())).toEqual([]);
  });

  it("says a wait nobody explained once it is thirty seconds old, and one it can explain at once", () => {
    const wait = { lineId: "line_x", harnessId: CLAW, since: SENT };
    expect(waitWords(wait, directory(), AT + WATCH_MS - 1, clock)).toBeUndefined();
    expect(waitWords(wait, directory(), AT + 42_000, clock)).toEqual({
      title: "OpenClaw hasn't picked this up",
      waited: "40s",
      known: false,
    });
    const trouble = directory({
      state: {
        connected: true,
        since: "2026-09-28T18:00:00.000Z",
        trouble: { reason: "Can't reach its gateway", since: "2026-09-28T18:12:00.000Z" },
      },
    });
    expect(waitWords(wait, trouble, AT, clock)).toEqual({
      title: "OpenClaw can't answer yet",
      why: "Can't reach its gateway · since [18:12]",
      known: true,
    });
    const offline = directory({ state: { connected: false, since: "2026-09-28T18:11:00.000Z" } });
    expect(waitWords(wait, offline, AT, clock)?.why).toBe("Offline · since [18:11]");
    expect(waitWords(wait, directory({ lastSeenAt: null, state: undefined }), AT, clock)?.why).toBe(
      "Never connected",
    );
  });

  it("says an agent's state on its row: the trouble and how long, offline since when, or connected since when", () => {
    const now = Date.parse("2026-09-28T18:35:00.000Z");
    const trouble = directory({
      state: {
        connected: true,
        since: "2026-09-28T18:00:00.000Z",
        trouble: { reason: "Can't reach its gateway", since: "2026-09-28T18:12:00.000Z" },
      },
    });
    expect(agentStateWords(trouble, CLAW, now, clock)).toBe("Can't reach its gateway · 23 min");
    const offline = directory({ state: { connected: false, since: "2026-09-28T18:12:00.000Z" } });
    expect(agentStateWords(offline, CLAW, now, clock)).toBe("Offline · since [18:12]");
    expect(agentStateWords(directory(), CLAW, now, clock)).toBeUndefined();
    expect(connectedWords(directory(), CLAW, now, clock)).toBe("Connected · since [18:20]");
    expect(connectedWords(trouble, CLAW, now, clock)).toBeUndefined();
    expect(connectedWords(offline, CLAW, now, clock)).toBeUndefined();
    expect(connectedWords(directory({ state: undefined }), CLAW, now, clock)).toBeUndefined();
    const restarting = directory({
      state: {
        connected: true,
        since: "2026-09-28T18:00:00.000Z",
        restarting: { since: "2026-09-28T18:30:00.000Z", by: ME },
      },
    });
    expect(connectedWords(restarting, CLAW, now, clock)).toBeUndefined();
    expect([0, 9999, 42_000, 60_000, 3_600_000, 90_000_000].map(agoWords)).toEqual([
      "0s",
      "0s",
      "40s",
      "1 min",
      "1 h",
      "1 d",
    ]);
  });
});

describe("an agent that can't answer (ADR 0087)", () => {
  it("can't when its harness can't, and never connected when its harness never did", () => {
    const since = "2026-09-30T08:00:00.000Z";
    const directory: Directory = {
      hrn_jacobian: {
        id: "hrn_jacobian",
        kind: "harness",
        displayName: "Jacobian",
        lastSeenAt: null,
      },
      agt_chess: {
        id: "agt_chess",
        kind: "agent",
        displayName: "Chess Game",
        harnessId: "hrn_jacobian",
      },
    };
    expect(cantAnswer(directory, "agt_chess")).toEqual({ kind: "offline" });
    const troubled: Directory = {
      ...directory,
      hrn_jacobian: { ...(directory["hrn_jacobian"] as Participant), lastSeenAt: since },
      agt_chess: {
        ...(directory["agt_chess"] as Participant),
        state: { connected: true, since, trouble: { reason: "The model is down.", since } },
      },
    };
    expect(cantAnswer(troubled, "agt_chess")).toEqual({
      kind: "trouble",
      reason: "The model is down.",
      since,
    });
  });
});
