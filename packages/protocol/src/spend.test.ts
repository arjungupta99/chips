import { describe, expect, it } from "vitest";
import { eventSchema } from "./envelope.js";
import { budgetWarning } from "./events/chips-to-harness.js";
import { exchangeSet, spaceSpendCeilingLifted, spaceSpendCeilingSet } from "./events/workspace.js";
import {
  cappedSpend,
  DEFAULT_SPEND_CEILING_USD,
  dollars,
  isSpendCeiling,
  jobSpend,
  SPEND_CEILING_MAX,
  SPEND_CEILING_MIN,
  SPEND_WARN_AT,
  spendStage,
  spendWords,
} from "./spend.js";

describe("what a room may allow a job (ADR 0117)", () => {
  it("is $3 by default, from $0.25 to $1,000 in steps of $0.25 (ADR 0292)", () => {
    expect(DEFAULT_SPEND_CEILING_USD).toBe(3);
    expect(SPEND_CEILING_MAX).toBe(1000);
    for (const usd of [
      SPEND_CEILING_MIN,
      0.5,
      1,
      2.75,
      3,
      7.5,
      10,
      100.25,
      999.75,
      SPEND_CEILING_MAX,
    ]) {
      expect(isSpendCeiling(usd), String(usd)).toBe(true);
    }
    for (const usd of [0, 0.1, 0.3, 2.6, 1000.25, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isSpendCeiling(usd), String(usd)).toBe(false);
    }
  });

  it("is set by an event that carries an amount or null for the default", () => {
    const base = {
      v: 1,
      type: "space.spend_ceiling_set",
      id: "evt_01J0000000000000000000000A",
      ts: "2026-10-04T12:00:00.000Z",
      workspace_id: "ws_01J0000000000000000000000A",
      space_id: "spc_01J0000000000000000000000A",
      actor: { kind: "person", id: "usr_01J0000000000000000000000A" },
    };
    const schema = eventSchema(spaceSpendCeilingSet);
    expect(schema.safeParse({ ...base, usd: 10 }).success).toBe(true);
    expect(schema.safeParse({ ...base, usd: null }).success).toBe(true);
    expect(schema.safeParse({ ...base, usd: 0.1 }).success).toBe(false);
    expect(schema.safeParse({ ...base, usd: 1000 }).success).toBe(true);
    expect(schema.safeParse({ ...base, usd: 1001 }).success).toBe(false);
    expect(schema.safeParse({ ...base, usd: "none" }).success).toBe(false);
  });

  it("has its cap taken off by an event of its own, which a device from before skips (ADR 0292)", () => {
    const lifted = {
      v: 1,
      type: "space.spend_ceiling_lifted",
      id: "evt_01J0000000000000000000000B",
      ts: "2026-11-10T12:00:00.000Z",
      workspace_id: "ws_01J0000000000000000000000A",
      space_id: "spc_01J0000000000000000000000A",
      actor: { kind: "person", id: "usr_01J0000000000000000000000A" },
    };
    expect(eventSchema(spaceSpendCeilingLifted).safeParse(lifted).success).toBe(true);
  });

  it("hands a harness the job only while the room has a cap", () => {
    const job = { spent_usd: 12.5, since_seq: 7, uncounted_runs: 1 };
    expect(cappedSpend({ ...job, ceiling_usd: 25 })).toEqual({ ...job, ceiling_usd: 25 });
    expect(cappedSpend({ ...job, ceiling_usd: null })).toBeUndefined();
  });
});

describe("an amount in words", () => {
  it("is in dollars to the cent, with a comma from a thousand", () => {
    expect(dollars(0.25)).toBe("$0.25");
    expect(dollars(3)).toBe("$3.00");
    expect(dollars(999.994)).toBe("$999.99");
    expect(dollars(1000)).toBe("$1,000.00");
    expect(dollars(35.23)).toBe("$35.23");
    expect(dollars(1_234_567.891)).toBe("$1,234,567.89");
  });
});

describe("what a job has spent, in words", () => {
  const spend = { ceiling_usd: 3, spent_usd: 1.234, since_seq: 14_049, uncounted_runs: 0 };

  it("parses, and says the spend against the ceiling to the cent", () => {
    expect(jobSpend.safeParse(spend).success).toBe(true);
    expect(dollars(0.25)).toBe("$0.25");
    expect(spendWords(spend)).toBe(
      "This job has spent $1.23 of the $3.00 this space allows a job; at $3.00 Chips holds the agents until a person acts.",
    );
  });

  it("says how many runs were not counted", () => {
    expect(spendWords({ ...spend, uncounted_runs: 3 })).toBe(
      "This job has spent $1.23 of the $3.00 this space allows a job; at $3.00 Chips holds the agents until a person acts. 3 runs here reported no cost and are not counted.",
    );
  });

  it("says what to do once most of it is spent, and that the agents are held at the ceiling (ADR 0118)", () => {
    expect(spendWords({ ...spend, spent_usd: 2.45 })).toBe(
      "This job has spent $2.45 of the $3.00 this space allows a job; at $3.00 Chips holds the agents until a person acts. Most of it is spent: finish the step you are on, and say what is left.",
    );
    expect(spendWords({ ...spend, spent_usd: 3.02, uncounted_runs: 1 })).toBe(
      "This job has spent $3.02 of the $3.00 this space allows a job, so Chips holds the agents until a person acts: start nothing new, and say what is done and what is left. 1 run here reported no cost and is not counted.",
    );
  });
});

describe("the room at its ceiling, on the wire (ADR 0118)", () => {
  const base = {
    v: 1,
    id: "evt_01J0000000000000000000000A",
    ts: "2026-10-04T12:00:00.000Z",
    workspace_id: "ws_01J0000000000000000000000A",
    space_id: "spc_01J0000000000000000000000A",
    actor: { kind: "system", id: "system" },
  };
  const spend = { ceiling_usd: 3, spent_usd: 3.02, since_seq: 40, uncounted_runs: 0 };

  it("is a pause by Chips that says why and how far the job got", () => {
    const schema = eventSchema(exchangeSet);
    const paused = { ...base, type: "exchange.set", state: "paused" };
    expect(schema.safeParse({ ...paused, why: "spend", spend }).success).toBe(true);
    expect(schema.safeParse(paused).success, "a person's, as before").toBe(true);
    expect(schema.safeParse({ ...paused, why: "boredom" }).success).toBe(false);
  });

  it("is a budget warning for the room's job, which a harness's own budget warning still is not", () => {
    const schema = eventSchema(budgetWarning);
    const warning = {
      ...base,
      type: "budget.warning",
      budget: { limit_usd: 3, spent_usd: 3.02 },
      threshold: 100,
      action: "pause",
    };
    expect(schema.safeParse({ ...warning, scope: "job", since_seq: 40 }).success).toBe(true);
    expect(schema.safeParse(warning).success).toBe(true);
    expect(schema.safeParse({ ...warning, scope: "room" }).success).toBe(false);
  });
});

describe("where a job stands against its ceiling (ADR 0118)", () => {
  it("is most spent from 80%, and at the ceiling from 100%, to the cent", () => {
    expect(SPEND_WARN_AT).toBe(0.8);
    const at = (spent_usd: number, ceiling_usd = 3) => spendStage({ spent_usd, ceiling_usd });
    expect(at(0)).toBe("within");
    expect(at(2.39)).toBe("within");
    expect(at(2.4)).toBe("most");
    expect(at(2.999)).toBe("ceiling");
    expect(at(3)).toBe("ceiling");
    expect(at(3.02)).toBe("ceiling");
    expect(at(0.4, 0.5)).toBe("most");
    expect(at(0.39, 0.5)).toBe("within");
  });
});
