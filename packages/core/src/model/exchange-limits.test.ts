/**
 * The words and the rules every client's "Messages between agents" settings share (ADR 0187):
 * the row's words, the ladder, and the draft the sheet picks in, whose stop never crosses its hold.
 */

import { DEFAULT_EXCHANGE_LIMITS, type ExchangeLimits } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import {
  limitsDraft,
  limitsFoot,
  limitsFromDraft,
  limitsLadder,
  limitsSentence,
  limitsWords,
  pickLimit,
  sameLimits,
  stopFits,
} from "./exchange-limits.js";

const limits = (over: Partial<ExchangeLimits>): ExchangeLimits => ({
  ...DEFAULT_EXCHANGE_LIMITS,
  ...over,
});

describe("the row's words", () => {
  it("say the stop and the hold, and circles only when they are off", () => {
    expect(limitsWords(DEFAULT_EXCHANGE_LIMITS)).toBe("Stop after 16 · hold after 48");
    expect(limitsWords(limits({ stop: 32, hold: 100, circles: false }))).toBe(
      "Stop after 32 · hold after 100 · circles off",
    );
    expect(limitsWords(limits({ stop: null }))).toBe("Stop on repeats only · hold after 48");
    expect(limitsWords(limits({ stop: null, circles: false, hold: null }))).toBe(
      "Never told to stop · never held",
    );
  });

  it("say it all in a sentence where there is room", () => {
    expect(limitsSentence(DEFAULT_EXCHANGE_LIMITS)).toBe(
      "Chips tells agents the count from 8 messages to each other with nobody acting, tells them to stop after 16, or sooner in circles, and holds them after 48.",
    );
    expect(limitsSentence(limits({ stop: null, hold: null }))).toBe(
      "Chips tells agents the count from 8 messages to each other with nobody acting, tells them to stop only when they go in circles, and never holds them.",
    );
    expect(limitsSentence(limits({ stop: 32, circles: false }))).toContain(
      "tells them to stop after 32, and holds",
    );
  });
});

describe("the ladder", () => {
  it("is the count at half the stop, the stop, and the hold", () => {
    expect(limitsLadder(limits({ stop: 32, hold: 100 })).map((step) => step.mark)).toEqual([
      "16",
      "32",
      "100",
    ]);
  });

  it("marks a stop that comes only in circles, and what never comes", () => {
    const [count, stop, hold] = limitsLadder(limits({ stop: null, hold: null }));
    expect(count?.mark).toBe("8");
    expect(stop).toMatchObject({ mark: "↻", never: false });
    expect(stop?.words).toContain("Only when they go in circles");
    expect(hold).toMatchObject({ mark: "–", never: true });
    expect(hold?.words).toBe("Their messages to each other are never held.");
    const [, none] = limitsLadder(limits({ stop: null, circles: false }));
    expect(none).toMatchObject({ mark: "–", never: true, words: "Never told to stop." });
  });
});

describe("the draft", () => {
  it("opens on the saved numbers, an off-choice number as Other", () => {
    expect(limitsDraft(DEFAULT_EXCHANGE_LIMITS)).toEqual({
      stop: "16",
      hold: "48",
      circles: true,
      typed: { stop: "", hold: "" },
    });
    expect(limitsDraft(limits({ stop: 24, hold: null }))).toEqual({
      stop: "other",
      hold: "never",
      circles: true,
      typed: { stop: "24", hold: "" },
    });
  });

  it("reads back what it opened on", () => {
    for (const each of [
      DEFAULT_EXCHANGE_LIMITS,
      limits({ stop: 24, hold: 150, circles: false }),
      limits({ stop: null, hold: null }),
    ]) {
      const read = limitsFromDraft(limitsDraft(each));
      expect("limits" in read && sameLimits(read.limits, each)).toBe(true);
    }
  });

  it("takes the stop down under a hold picked at or below it, and says it moved", () => {
    const start = limitsDraft(limits({ stop: 64, hold: 200 }));
    const down = pickLimit(start, "hold", "48");
    expect(down).toMatchObject({ moved: true, draft: { stop: "32", hold: "48" } });
    const lowest = pickLimit(start, "hold", "24");
    expect(lowest.draft.stop).toBe("16");
    // Under a hold of 10 typed in, the smallest choice there is.
    const typed = pickLimit(
      { ...start, hold: "other", typed: { stop: "", hold: "10" } },
      "hold",
      "other",
    );
    expect(typed.draft.stop).toBe("8");
    // A stop typed over the hold stays as typed, and says why it can't be saved.
    const over = pickLimit(
      { ...start, stop: "other", typed: { stop: "300", hold: "" } },
      "stop",
      "other",
    );
    expect(over).toMatchObject({ moved: false, draft: { stop: "other" } });
    expect(limitsFromDraft(over.draft)).toHaveProperty("error");
    // A hold above the stop, or Never, moves nothing.
    expect(pickLimit(start, "hold", "100").moved).toBe(false);
    expect(pickLimit(start, "hold", "never").moved).toBe(false);
  });

  it("greys a stop at or over the hold", () => {
    const draft = limitsDraft(limits({ stop: 16, hold: 24 }));
    expect([8, 16, 32, 64].map((value) => stopFits(draft, value))).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(stopFits(limitsDraft(limits({ hold: null })), 64)).toBe(true);
  });

  it("is not whole while Other holds no number in its range, and says why", () => {
    const other = (stop: string) =>
      limitsFromDraft({
        ...limitsDraft(DEFAULT_EXCHANGE_LIMITS),
        stop: "other",
        typed: { stop, hold: "" },
      });
    expect(other("")).toEqual({ error: "Tell them to stop after a whole number from 4 to 500." });
    expect(other("3")).toHaveProperty("error");
    expect(other("501")).toHaveProperty("error");
    expect(other("12.5")).toHaveProperty("error");
    expect(other("24")).toEqual({ limits: { stop: 24, hold: 48, circles: true } });
    expect(other("48")).toEqual({
      error: "Chips would hold them before telling them to stop. Pick a stop under the hold.",
    });
    const hold = limitsFromDraft({
      ...limitsDraft(DEFAULT_EXCHANGE_LIMITS),
      hold: "other",
      typed: { stop: "", hold: "1001" },
    });
    expect(hold).toEqual({ error: "Hold them after a whole number from 10 to 1,000." });
  });

  it("ends on whose numbers they are, or what a hold of Never leaves", () => {
    expect(limitsFoot(limitsDraft(DEFAULT_EXCHANGE_LIMITS))).toEqual({
      text: "Chips's own numbers.",
      warn: false,
    });
    expect(limitsFoot(limitsDraft(limits({ stop: 32 }))).text).toBe(
      "For every space in the workspace.",
    );
    const never = limitsFoot(limitsDraft(limits({ hold: null })));
    expect(never.warn).toBe(true);
    expect(never.text).toContain("Spend per job still pauses them");
  });
});
