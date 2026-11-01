import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  agentHeartbeatPut,
  agentHeartbeatView,
  HEARTBEAT_CHOICES_MAX,
  HEARTBEAT_EVERY_MAX,
  heartbeatChangeAsk,
  heartbeatChangeFrame,
} from "./agent-heartbeats.js";
import { parseEvent } from "./events/catalogue.js";

/** A copy as an adapter sends one: off, every half hour. */
const copy = (extra: Record<string, unknown> = {}) => ({
  on: false,
  every: 30,
  choices: [15, 30, 60, 120, 240, 720, 1440],
  editable: true,
  ...extra,
});

describe("an agent's heartbeat, as its harness sends it (ADR 0143)", () => {
  it("takes the copy an adapter sends", () => {
    expect(agentHeartbeatPut.safeParse(copy()).success).toBe(true);
    expect(agentHeartbeatPut.safeParse(copy({ on: true, every: 1440 })).success).toBe(true);
  });

  it("refuses an interval not among its choices", () => {
    const put = agentHeartbeatPut.safeParse(copy({ every: 45 }));
    expect(put.success).toBe(false);
    expect(put.error?.issues[0]?.path).toEqual(["every"]);
  });

  it("refuses choices out of order, named twice, or none at all", () => {
    expect(agentHeartbeatPut.safeParse(copy({ choices: [60, 30] })).success).toBe(false);
    expect(agentHeartbeatPut.safeParse(copy({ choices: [30, 30, 60] })).success).toBe(false);
    expect(agentHeartbeatPut.safeParse(copy({ choices: [] })).success).toBe(false);
  });

  it("takes a minute to a week, and twelve intervals at most", () => {
    const many = (count: number) => Array.from({ length: count }, (_, at) => (at + 1) * 10);
    expect(agentHeartbeatPut.safeParse(copy({ every: 10, choices: many(12) })).success).toBe(true);
    const thirteen = copy({ every: 10, choices: many(HEARTBEAT_CHOICES_MAX + 1) });
    expect(agentHeartbeatPut.safeParse(thirteen).success).toBe(false);
    const week = copy({ every: HEARTBEAT_EVERY_MAX, choices: [1, HEARTBEAT_EVERY_MAX] });
    expect(agentHeartbeatPut.safeParse(week).success).toBe(true);
    const longer = copy({ every: 30, choices: [30, HEARTBEAT_EVERY_MAX + 1] });
    expect(agentHeartbeatPut.safeParse(longer).success).toBe(false);
    expect(agentHeartbeatPut.safeParse(copy({ every: 0, choices: [0, 30] })).success).toBe(false);
    expect(agentHeartbeatPut.safeParse(copy({ every: 7.5, choices: [7.5] })).success).toBe(false);
  });

  it("says why only when it can't be changed", () => {
    const why = "Lathe keeps this one's heartbeat.";
    const readOnly = copy({ editable: false, why_read_only: why });
    expect(agentHeartbeatPut.safeParse(readOnly).success).toBe(true);
    const stray = agentHeartbeatPut.safeParse(copy({ why_read_only: why }));
    expect(stray.success).toBe(false);
    expect(stray.error?.issues[0]?.path).toEqual(["why_read_only"]);
  });

  it("carries an answer, or a refusal with the harness's words", () => {
    const id = "chg_01JB0000000000000000000000";
    expect(agentHeartbeatPut.safeParse(copy({ answers: id })).success).toBe(true);
    const refusal = copy({ refuses: { change_id: id, message: "Lathe can't beat that often." } });
    expect(agentHeartbeatPut.safeParse(refusal).success).toBe(true);
    expect(
      agentHeartbeatPut.safeParse(copy({ answers: "edt_01JB0000000000000000000000" })).success,
    ).toBe(false);
  });
});

describe("a person's change", () => {
  it("says on or off, and how often or nothing for the copy's own", () => {
    expect(heartbeatChangeAsk.safeParse({ on: true, every: 60 }).success).toBe(true);
    expect(heartbeatChangeAsk.safeParse({ on: false }).success).toBe(true);
    expect(heartbeatChangeAsk.safeParse({ every: 60 }).success).toBe(false);
    expect(heartbeatChangeAsk.safeParse({ on: true, every: 0 }).success).toBe(false);
  });

  it("goes down as a frame naming the agent, both on and how often", () => {
    const frame = JSON.parse(
      readFileSync(new URL("../fixtures/frames/heartbeat.change.json", import.meta.url), "utf8"),
    );
    expect(heartbeatChangeFrame.safeParse(frame).success).toBe(true);
    const { every: _every, ...half } = frame;
    expect(heartbeatChangeFrame.safeParse(half).success).toBe(false);
  });
});

describe("what a person reads", () => {
  it("is the copy, with whether the harness is away and the last change asked", () => {
    const view = {
      ...copy(),
      agent_id: "agt_01JB0000000000000000000000",
      harness_id: "hrn_01JB0000000000000000000000",
      read_at: "2026-10-09T09:09:00.000Z",
      away: false,
      change: {
        change_id: "chg_01JB0000000000000000000000",
        state: "missed",
        on: true,
        every: 60,
        asked_at: "2026-10-09T09:10:00.000Z",
      },
    };
    expect(agentHeartbeatView.safeParse(view).success).toBe(true);
  });
});

describe("a check-in", () => {
  const post = (extra: Record<string, unknown>) =>
    parseEvent({
      v: 1,
      type: "message.post",
      id: "evt_01K4ZQPX000000000000000067",
      ts: "2026-10-09T09:30:00.000Z",
      workspace_id: "ws_01K4ZQPX000000000000000001",
      space_id: "spc_01K4ZQPX000000000000000002",
      actor: { kind: "agent", id: "agt_01K4ZQPX000000000000000004" },
      text: "It reaches 94°F by 3 PM, the hour you said you'd run.",
      ...extra,
    });

  it("is an ordinary message, marked as the heartbeat's", () => {
    const marked = post({ heartbeat: true });
    expect(marked.ok && marked.value["heartbeat"]).toBe(true);
    const plain = post({});
    expect(plain.ok && plain.value["heartbeat"]).toBeUndefined();
  });

  it("is marked true or not at all", () => {
    expect(post({ heartbeat: false }).ok).toBe(false);
  });
});
