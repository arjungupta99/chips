/**
 * The referee at the workspace's own numbers (ADR 0187): a stop, a hold, either of them never,
 * and the circles switch, in place of the fixed 16 and 48. The count follows the stop: told from
 * half of it, from 8 when there is no stop.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXCHANGE_LIMITS,
  type ExchangeLimits,
  type ExchangeMessage,
  type ExchangeStretch,
  exchangeFactsOf,
  exchangeLimitsOf,
  holds,
  limitsProblem,
  nudgeAt,
  renderExchangeNote,
  stageOf,
} from "./exchange.js";

const agent = (n: number) => `agt_01K4ZQPX${String(n).padStart(18, "0")}`;
const AA = agent(1);
const OC2 = agent(2);
const ARJUN = "usr_arjun";
const NAMES: Record<string, string> = { [AA]: "ASCII Art", [OC2]: "Oc2", [ARJUN]: "Arjun" };
const nameOf = (id: string) => NAMES[id] ?? id;
const NOW = Date.parse("2026-10-02T18:52:00Z");

const limits = (over: Partial<ExchangeLimits>): ExchangeLimits => ({
  ...DEFAULT_EXCHANGE_LIMITS,
  ...over,
});

const said = (by: string, text: string): ExchangeMessage => ({
  message_id: `msg_${Math.random().toString(36).slice(2, 10)}`,
  by,
  text,
  filesSeen: [],
});

function stretch(
  messages: ExchangeMessage[],
  extra: Partial<ExchangeStretch> = {},
): ExchangeStretch {
  return {
    count: messages.length,
    since: { kind: "person", seq: 100, at: "2026-10-02T18:31:00Z", by: ARJUN },
    messages,
    paused: false,
    personLooking: false,
    person: ARJUN,
    ...extra,
  };
}

/** Two agents taking turns, the second saying the same again: a circle at the fourth. */
const circling = () => [
  said(AA, "@Oc2 please check that letters F to J render in the file"),
  said(OC2, "@ASCIIArt they look right to me, nothing to change there"),
  said(AA, "@Oc2 could you look at F to J once more in the file"),
  said(OC2, "@ASCIIArt they look right to me, nothing to change there"),
];

describe("the workspace's limits", () => {
  it("are Chips's own until set: stop 16, hold 48, circles on", () => {
    expect(DEFAULT_EXCHANGE_LIMITS).toEqual({ stop: 16, hold: 48, circles: true });
    expect(exchangeLimitsOf({})).toEqual(DEFAULT_EXCHANGE_LIMITS);
  });

  it("keep a Never as none, and take what an event left out from the defaults", () => {
    expect(exchangeLimitsOf({ stop: null, hold: 100, circles: false })).toEqual({
      stop: null,
      hold: 100,
      circles: false,
    });
    expect(exchangeLimitsOf({ hold: null })).toEqual({ stop: 16, hold: null, circles: true });
  });

  it("count from half the stop, and from 8 with no stop", () => {
    expect(nudgeAt(DEFAULT_EXCHANGE_LIMITS)).toBe(8);
    expect(nudgeAt(limits({ stop: 32 }))).toBe(16);
    expect(nudgeAt(limits({ stop: 5 }))).toBe(3);
    expect(nudgeAt(limits({ stop: 4 }))).toBe(2);
    expect(nudgeAt(limits({ stop: null }))).toBe(8);
  });

  it("refuse a number out of range, or a stop at or over the hold", () => {
    expect(limitsProblem(DEFAULT_EXCHANGE_LIMITS)).toBeUndefined();
    expect(limitsProblem(limits({ stop: null, hold: null, circles: false }))).toBeUndefined();
    expect(limitsProblem(limits({ stop: 4, hold: 10 }))).toBeUndefined();
    expect(limitsProblem(limits({ stop: 500, hold: 1000 }))).toBeUndefined();
    expect(limitsProblem(limits({ stop: 3 }))).toContain("from 4 to 500");
    expect(limitsProblem(limits({ stop: 16.5 }))).toContain("from 4 to 500");
    expect(limitsProblem(limits({ stop: 501, hold: null }))).toContain("from 4 to 500");
    expect(limitsProblem(limits({ hold: 9 }))).toContain("from 10 to 1,000");
    expect(limitsProblem(limits({ hold: 1001 }))).toContain("from 10 to 1,000");
    expect(limitsProblem(limits({ stop: 48, hold: 48 }))).toContain("Make the stop smaller");
    expect(limitsProblem(limits({ stop: 64, hold: 48 }))).toContain("Make the stop smaller");
    // A stop with no hold, or a hold with no stop, has nothing to cross.
    expect(limitsProblem(limits({ stop: 400, hold: null }))).toBeUndefined();
    expect(limitsProblem(limits({ stop: null, hold: 10 }))).toBeUndefined();
  });
});

describe("the stages at the workspace's numbers", () => {
  it("move with the stop and the hold", () => {
    const at = limits({ stop: 32, hold: 100 });
    expect(stageOf(15, false, false, at)).toBe("quiet");
    expect(stageOf(16, false, false, at)).toBe("nudge");
    expect(stageOf(31, false, false, at)).toBe("nudge");
    expect(stageOf(32, false, false, at)).toBe("warning");
    expect(stageOf(99, false, false, at)).toBe("warning");
    expect(stageOf(100, false, false, at)).toBe("held");
  });

  it("never warn on a count with no stop, but still on a circle", () => {
    const at = limits({ stop: null });
    expect(stageOf(8, false, false, at)).toBe("nudge");
    expect(stageOf(47, false, false, at)).toBe("nudge");
    expect(stageOf(6, true, false, at)).toBe("warning");
    expect(stageOf(48, false, false, at)).toBe("held");
  });

  it("never hold on a count with no hold, however long they go, but still on a pause", () => {
    const at = limits({ hold: null });
    expect(stageOf(1000, false, false, at)).toBe("warning");
    expect(stageOf(5000, false, false, at)).toBe("warning");
    expect(stageOf(0, false, true, at)).toBe("held");
    expect(holds({ count: 5000, paused: false, limits: at })).toBe(false);
    expect(holds({ count: 0, paused: true, limits: at })).toBe(true);
  });

  it("hold at the workspace's hold, and at 48 for a stretch that brings none", () => {
    expect(holds({ count: 99, paused: false, limits: limits({ hold: 100 }) })).toBe(false);
    expect(holds({ count: 100, paused: false, limits: limits({ hold: 100 }) })).toBe(true);
    expect(holds({ count: 24, paused: false, limits: limits({ stop: 8, hold: 24 }) })).toBe(true);
    expect(holds({ count: 48, paused: false })).toBe(true);
  });

  it("with no stop, no hold and circles off, are never more than a count", () => {
    const at = limits({ stop: null, hold: null, circles: false });
    expect(stageOf(10_000, false, false, at)).toBe("nudge");
    expect(stageOf(3, false, false, at)).toBe("quiet");
  });
});

describe("the facts at the workspace's numbers", () => {
  it("warn at a stop of 32, and say a hold of 100", () => {
    const messages = Array.from({ length: 4 }, (_, i) =>
      said(i % 2 === 0 ? AA : OC2, `Letter ${String.fromCharCode(75 + i)} is in the file now`),
    );
    const facts = exchangeFactsOf(
      stretch(messages, { count: 32, limits: limits({ stop: 32, hold: 100 }) }),
      { nowMs: NOW },
    );
    expect(facts.stage).toBe("warning");
    expect(facts.allowance).toBe(100);
    expect(renderExchangeNote(facts, nameOf)).toBe(
      "The agents in this space have sent each other 32 messages since Arjun last acted here, 21 minutes ago. No person has this space open now. Stop, and tell Arjun what is done and what is blocked. Messages between the agents are held after 100.",
    );
  });

  it("at 16 under a stop of 32 are a count, not a warning", () => {
    const facts = exchangeFactsOf(
      stretch([said(AA, "Letter K is in the file now, on to L")], {
        count: 16,
        limits: limits({ stop: 32, hold: 100 }),
      }),
      { nowMs: NOW },
    );
    expect(facts.stage).toBe("nudge");
    expect(renderExchangeNote(facts, nameOf)).not.toContain("Stop");
  });

  it("with no hold carry no allowance, and the note leaves the hold out", () => {
    const facts = exchangeFactsOf(
      stretch([said(AA, "Letter K is in the file now, on to L")], {
        count: 16,
        limits: limits({ hold: null }),
      }),
      { nowMs: NOW },
    );
    expect(facts.stage).toBe("warning");
    expect(facts.allowance).toBeUndefined();
    const note = renderExchangeNote(facts, nameOf);
    expect(note).toContain("Stop, and tell Arjun what is done and what is blocked.");
    expect(note).not.toContain("held");
  });

  it("see a circle while circles count, and none with the switch off", () => {
    const on = exchangeFactsOf(stretch(circling()), { nowMs: NOW });
    expect(on.circling).toBe(true);
    expect(on.stage).toBe("warning");
    const off = exchangeFactsOf(stretch(circling(), { limits: limits({ circles: false }) }), {
      nowMs: NOW,
    });
    expect(off.circling).toBe(false);
    expect(off.stage).toBe("quiet");
    expect(renderExchangeNote(off, nameOf)).not.toContain("circle");
    // The repeat is still a fact: the agents are told it, only not stopped for it.
    expect(off.repeats.length).toBeGreaterThan(0);
  });

  it("with no stop warn only on a circle", () => {
    const quiet = exchangeFactsOf(
      stretch([said(AA, "Letter K is in the file now, on to L")], {
        count: 40,
        limits: limits({ stop: null }),
      }),
      { nowMs: NOW },
    );
    expect(quiet.stage).toBe("nudge");
    const round = exchangeFactsOf(stretch(circling(), { limits: limits({ stop: null }) }), {
      nowMs: NOW,
    });
    expect(round.stage).toBe("warning");
    expect(renderExchangeNote(round, nameOf)).toContain("This looks like a circle");
  });

  it("while held by a pause say so, with a hold or without", () => {
    for (const hold of [48, null]) {
      const facts = exchangeFactsOf(
        stretch([said(OC2, "Done?")], { count: 3, paused: true, limits: limits({ hold }) }),
        { nowMs: NOW },
      );
      expect(facts.stage).toBe("held");
      expect(renderExchangeNote(facts, nameOf)).toContain(
        "Messages between the agents are held until a person acts.",
      );
    }
  });
});
