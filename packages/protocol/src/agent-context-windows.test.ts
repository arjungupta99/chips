import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  agentContextWindowPut,
  agentContextWindowView,
  WINDOW_LIMIT_CHOICES_MAX,
  windowChangeFrame,
  windowCompactFrame,
  windowLimitAsk,
} from "./agent-context-windows.js";
import { parseEvent } from "./events/catalogue.js";

const limit = (extra: Record<string, unknown> = {}) => ({
  at: 80,
  choices: [50, 60, 70, 80, 90],
  default: 80,
  may_turn_off: false,
  ...extra,
});

/** A copy as an adapter sends one: 172K of a 272K window, compacting itself at 80%. */
const copy = (extra: Record<string, unknown> = {}) => ({
  used: 172_000,
  window: 272_000,
  model: "gpt-6.1-sol",
  as_of: "2026-10-09T18:20:00.000Z",
  last: { at: "2026-10-09T16:14:00.000Z", from: 221_000, to: 24_000, by: "itself" },
  compacts: true,
  limit: limit(),
  editable: true,
  ...extra,
});

describe("an agent's context window, as its harness sends it (ADR 0146)", () => {
  it("takes the copy an adapter sends", () => {
    expect(agentContextWindowPut.safeParse(copy()).success).toBe(true);
    expect(agentContextWindowPut.safeParse(copy({ compacting: "running" })).success).toBe(true);
    const bare = copy({ last: undefined, limit: undefined, model: undefined });
    expect(agentContextWindowPut.safeParse(bare).success).toBe(true);
  });

  it("carries its last long turn, how full it got while working and how often it compacted itself", () => {
    const turn = { at: "2026-10-09T16:16:00.000Z", peak: 218_000, folds: 1 };
    const put = agentContextWindowPut.parse(copy({ long_turn: turn }));
    expect(put.long_turn).toEqual(turn);
    expect(
      agentContextWindowPut.safeParse(copy({ long_turn: { ...turn, peak: -1 } })).success,
    ).toBe(false);
    expect(
      agentContextWindowPut.safeParse(copy({ long_turn: { ...turn, folds: 1.5 } })).success,
    ).toBe(false);
    expect(
      agentContextWindowPut.safeParse(copy({ long_turn: { peak: 218_000, folds: 0 } })).success,
    ).toBe(false);
  });

  it("refuses a window of nothing, a count below it, and an unknown compacting", () => {
    expect(agentContextWindowPut.safeParse(copy({ window: 0 })).success).toBe(false);
    expect(agentContextWindowPut.safeParse(copy({ used: -1 })).success).toBe(false);
    expect(agentContextWindowPut.safeParse(copy({ used: 1.5 })).success).toBe(false);
    expect(agentContextWindowPut.safeParse(copy({ compacting: "soon" })).success).toBe(false);
  });

  it("refuses a limit not among its choices", () => {
    const put = agentContextWindowPut.safeParse(copy({ limit: limit({ at: 75 }) }));
    expect(put.success).toBe(false);
    expect(put.error?.issues[0]?.path).toEqual(["limit", "at"]);
    expect(agentContextWindowPut.safeParse(copy({ limit: limit({ default: 75 }) })).success).toBe(
      false,
    );
  });

  it("takes only when asked only from a limit that may be turned off", () => {
    const off = copy({ limit: limit({ at: null, default: null, may_turn_off: true }) });
    expect(agentContextWindowPut.safeParse(off).success).toBe(true);
    expect(agentContextWindowPut.safeParse(copy({ limit: limit({ at: null }) })).success).toBe(
      false,
    );
  });

  it("refuses limits out of order, named twice, none, too many, or past the window", () => {
    const choices = (list: number[]) =>
      copy({ limit: limit({ at: list[0], default: list[0], choices: list }) });
    expect(agentContextWindowPut.safeParse(choices([90, 80])).success).toBe(false);
    expect(agentContextWindowPut.safeParse(choices([80, 80])).success).toBe(false);
    expect(agentContextWindowPut.safeParse(choices([])).success).toBe(false);
    expect(agentContextWindowPut.safeParse(choices([80, 100])).success).toBe(false);
    const many = Array.from({ length: WINDOW_LIMIT_CHOICES_MAX + 1 }, (_, at) => at + 1);
    expect(agentContextWindowPut.safeParse(choices(many)).success).toBe(false);
    expect(agentContextWindowPut.safeParse(choices(many.slice(1))).success).toBe(true);
  });

  it("says why only when it takes no Compact now, or can't be changed", () => {
    const busy = "Its harness compacts it only from its own app.";
    expect(agentContextWindowPut.safeParse(copy({ compacts: false, why_not: busy })).success).toBe(
      true,
    );
    const strayNot = agentContextWindowPut.safeParse(copy({ why_not: busy }));
    expect(strayNot.error?.issues[0]?.path).toEqual(["why_not"]);
    const why = "Lathe keeps this one's limit.";
    expect(
      agentContextWindowPut.safeParse(copy({ editable: false, why_read_only: why })).success,
    ).toBe(true);
    const stray = agentContextWindowPut.safeParse(copy({ why_read_only: why }));
    expect(stray.error?.issues[0]?.path).toEqual(["why_read_only"]);
  });

  it("carries an answer, or a refusal with the harness's words", () => {
    const id = "chg_01JB0000000000000000000000";
    expect(
      agentContextWindowPut.safeParse(copy({ answers: id, compacting: "queued" })).success,
    ).toBe(true);
    const refusal = copy({ refuses: { change_id: id, message: "Nothing to compact yet." } });
    expect(agentContextWindowPut.safeParse(refusal).success).toBe(true);
    expect(
      agentContextWindowPut.safeParse(copy({ answers: "edt_01JB0000000000000000000000" })).success,
    ).toBe(false);
  });
});

describe("what a person asks", () => {
  it("names a limit, or only when asked", () => {
    expect(windowLimitAsk.safeParse({ at: 70 }).success).toBe(true);
    expect(windowLimitAsk.safeParse({ at: null }).success).toBe(true);
    expect(windowLimitAsk.safeParse({}).success).toBe(false);
    expect(windowLimitAsk.safeParse({ at: 0 }).success).toBe(false);
    expect(windowLimitAsk.safeParse({ at: 100 }).success).toBe(false);
  });

  it("goes down as frames naming the agent", () => {
    const read = (name: string) =>
      JSON.parse(readFileSync(new URL(`../fixtures/frames/${name}.json`, import.meta.url), "utf8"));
    expect(windowCompactFrame.safeParse(read("context_window.compact")).success).toBe(true);
    const change = read("context_window.change");
    expect(windowChangeFrame.safeParse(change).success).toBe(true);
    expect(windowChangeFrame.safeParse({ ...change, at: null }).success).toBe(true);
    const { at: _at, ...half } = change;
    expect(windowChangeFrame.safeParse(half).success).toBe(false);
  });
});

describe("what a person reads", () => {
  it("is the copy, with whether the harness is away and the last of each ask", () => {
    const view = {
      ...copy({ compacting: "running" }),
      agent_id: "agt_01JB0000000000000000000000",
      harness_id: "hrn_01JB0000000000000000000000",
      read_at: "2026-10-09T18:20:00.000Z",
      away: false,
      change: {
        change_id: "chg_01JB0000000000000000000000",
        state: "saved",
        at: 70,
        asked_at: "2026-10-09T18:10:00.000Z",
        answered_at: "2026-10-09T18:10:01.000Z",
      },
      compaction: {
        change_id: "chg_01JB0000000000000000000001",
        state: "taken",
        asked_at: "2026-10-09T18:19:00.000Z",
        answered_at: "2026-10-09T18:19:01.000Z",
      },
    };
    expect(agentContextWindowView.safeParse(view).success).toBe(true);
  });
});

describe("the line in the room", () => {
  const line = (extra: Record<string, unknown>) =>
    parseEvent({
      v: 1,
      type: "context.compacted",
      id: "evt_01K4ZQPX000000000000000067",
      ts: "2026-10-09T18:30:00.000Z",
      workspace_id: "ws_01K4ZQPX000000000000000001",
      space_id: "spc_01K4ZQPX000000000000000002",
      actor: { kind: "agent", id: "agt_01K4ZQPX000000000000000004" },
      from: 214_000,
      to: 21_000,
      window: 272_000,
      by: "itself",
      ...extra,
    });

  it("says from how much to how much, of what window, and who asked", () => {
    expect(line({}).ok).toBe(true);
    expect(line({ by: "asked" }).ok).toBe(true);
    expect(line({ by: "J" }).ok).toBe(false);
    expect(line({ window: 0 }).ok).toBe(false);
  });
});
