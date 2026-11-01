import type { AgentContextWindowView } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import {
  compactNow,
  compactSheet,
  compactWords,
  limitWhenOn,
  saveWindowLimit,
  shownLimit,
  snapLimit,
  WINDOW_BARS,
  type WindowReads,
  windowFoot,
  windowGauge,
  windowPercent,
  windowRows,
  windowSaveWords,
  windowTone,
} from "./agentWindow.js";
import { compactedWords, tokenWords } from "./tokens.js";
import { ServerRefused } from "./transport.js";

const NOW = Date.parse("2026-10-09T18:30:00.000Z");
const today = (iso: string) => iso; // the copy's own times, read against NOW

/** J's window as Jacobian sends it: 172k of 272k, compacting itself at 80%. */
const view = (extra: Partial<AgentContextWindowView> = {}): AgentContextWindowView => ({
  agent_id: "agt_01JB0000000000000000000000" as AgentContextWindowView["agent_id"],
  harness_id: "hrn_01JB0000000000000000000000" as AgentContextWindowView["harness_id"],
  used: 172_000,
  window: 272_000,
  model: "gpt-6.1-sol",
  as_of: "2026-10-09T18:20:00.000Z",
  last: { at: today("2026-10-09T16:14:00.000Z"), from: 221_000, to: 24_000, by: "itself" },
  compacts: true,
  limit: { at: 80, choices: [50, 60, 70, 80, 90], default: 80, may_turn_off: false },
  editable: true,
  read_at: "2026-10-09T18:20:00.000Z",
  away: false,
  ...extra,
});

const waiting = (at: number | null) =>
  ({
    change_id: "chg_01JB0000000000000000000001",
    state: "waiting",
    at,
    asked_at: "2026-10-09T18:29:50.000Z",
  }) as AgentContextWindowView["change"];

describe("tokens in words, as the run panel says them", () => {
  it("keeps small counts whole, then thousands and millions", () => {
    expect(tokenWords(812)).toBe("812");
    expect(tokenWords(8400)).toBe("8.4k");
    expect(tokenWords(24_000)).toBe("24k");
    expect(tokenWords(172_400)).toBe("172k");
    expect(tokenWords(1_200_000)).toBe("1.2M");
  });

  it("puts the room's line into words", () => {
    expect(compactedWords(214_000, 21_000)).toBe("compacted its context · 214k → 21k tokens");
  });
});

describe("the gauge (ADR 0146)", () => {
  it("says how full, of what, lit to the fill, with the marker at the limit", () => {
    expect(windowGauge(view())).toEqual({
      percent: 63,
      big: "63%",
      tokens: "172k of 272k tokens",
      tone: "neutral",
      lit: 25,
      marker: 80,
      end: "272k",
      ghost: undefined,
      label: "Context 63% full, 172k of 272k tokens",
    });
  });

  it("draws its last long turn as faint bars past the fill, in that turn's tone", () => {
    // J between turns: 11.6k. Its last long turn reached 218k, 80% of the window.
    const long_turn = { at: "2026-10-09T16:16:00.000Z", peak: 218_000, folds: 1 };
    const gauge = windowGauge(view({ used: 11_600, long_turn }));
    expect(gauge.lit).toBe(2);
    expect(gauge.ghost).toEqual({ bars: 32, percent: 80, tone: "warn", words: "Last long turn" });
    expect(gauge.label).toBe(
      "Context 4% full, 11.6k of 272k tokens. Its last long turn reached 80%",
    );
    const hot = windowGauge(view({ used: 11_600, long_turn: { ...long_turn, peak: 250_000 } }));
    expect(hot.ghost?.tone).toBe("hot");
  });

  it("draws no faint bars without a long turn, or for one no fuller than it is now", () => {
    expect(windowGauge(view({ used: 11_600 })).ghost).toBeUndefined();
    const below = { at: "2026-10-09T16:16:00.000Z", peak: 150_000, folds: 0 };
    expect(windowGauge(view({ used: 172_000, long_turn: below })).ghost).toBeUndefined();
  });

  it("takes the context ring's tones: amber from 70%, red from 90%", () => {
    expect(windowTone(69)).toBe("neutral");
    expect(windowTone(70)).toBe("warn");
    expect(windowTone(89)).toBe("warn");
    expect(windowTone(90)).toBe("hot");
    expect(windowGauge(view({ used: 250_000 })).tone).toBe("hot");
  });

  it("clamps a fill past the window, and lights every bar", () => {
    expect(windowPercent(300_000, 272_000)).toBe(100);
    expect(windowGauge(view({ used: 300_000 })).lit).toBe(WINDOW_BARS);
    expect(windowPercent(5, 0)).toBe(0);
  });

  it("stands the marker where a waiting change asks, and nowhere when there is no limit to show", () => {
    expect(windowGauge(view({ change: waiting(70) })).marker).toBe(70);
    expect(shownLimit(view({ change: waiting(70) }))).toBe(70);
    const off = view({ limit: { at: null, choices: [50, 90], default: null, may_turn_off: true } });
    expect(windowGauge(off).marker).toBeUndefined();
    expect(shownLimit(off)).toBeNull();
    expect(shownLimit(view({ limit: undefined }))).toBeUndefined();
  });

  it("snaps a let-go marker to the nearest of the harness's limits", () => {
    const choices = [50, 60, 70, 80, 90];
    expect(snapLimit(choices, 73)).toBe(70);
    expect(snapLimit(choices, 76)).toBe(80);
    expect(snapLimit(choices, 12)).toBe(50);
    expect(snapLimit(choices, 99)).toBe(90);
  });

  it("turns on at the harness's own limit, else the one nearest 80%", () => {
    expect(limitWhenOn(view())).toBe(80);
    const own = view({
      limit: { at: null, choices: [60, 75, 95], default: null, may_turn_off: true },
    });
    expect(limitWhenOn(own)).toBe(75);
  });
});

describe("the group's controls", () => {
  it("offers Compact now beside what it last did, and a limit to drag", () => {
    const rows = windowRows(view(), "J", "Jacobian", NOW);
    expect(rows.compact).toEqual({ label: "Compact now", busy: false, quiet: false });
    expect(rows.note).toMatch(/^Compacted itself at \d{1,2}:14 [AP]M, 221k to 24k\.$/);
    expect(rows.auto).toEqual({
      on: true,
      switch: false,
      sub: "At 80%. Drag the marker to change it.",
      saving: false,
    });
    expect(rows.drags).toBe(true);
    expect(rows.quiet).toBe(false);
  });

  it("says what its last long turn reached, when that came after its last compaction", () => {
    const long_turn = { at: "2026-10-09T16:16:00.000Z", peak: 218_000, folds: 1 };
    // The turn compacted itself at 4:14 and ended at 4:16: one sentence says both.
    expect(windowRows(view({ long_turn }), "J", "Jacobian", NOW).note).toMatch(
      /^Its last long turn reached 218k and compacted itself once, at \d{1,2}:16 [AP]M\.$/,
    );
    const quiet = { ...long_turn, folds: 0 };
    expect(windowRows(view({ long_turn: quiet }), "J", "Jacobian", NOW).note).toMatch(
      /^Its last long turn reached 218k, at \d{1,2}:16 [AP]M\.$/,
    );
    // A Compact now after it is the newer news.
    const asked = {
      at: "2026-10-09T17:00:00.000Z",
      from: 60_000,
      to: 12_000,
      by: "asked" as const,
    };
    expect(windowRows(view({ long_turn, last: asked }), "J", "Jacobian", NOW).note).toMatch(
      /^Compacted when asked at \d{1,2}:00 [AP]M, 60k to 12k\.$/,
    );
  });

  it("says it hasn't compacted, or when it did on another day", () => {
    expect(windowRows(view({ last: undefined }), "J", "Jacobian", NOW).note).toBe(
      "It hasn't compacted yet.",
    );
    const older = view({
      last: { at: "2026-09-27T16:14:00.000Z", from: 200_000, to: 30_000, by: "asked" },
    });
    expect(windowRows(older, "J", "Jacobian", NOW).note).toBe(
      "Compacted when asked on Sep 27, 200k to 30k.",
    );
  });

  it("is busy from the ask to the end, saying what it is doing", () => {
    const asked = view({
      compaction: {
        change_id: "chg_01JB0000000000000000000002",
        state: "waiting",
        asked_at: "2026-10-09T18:29:58.000Z",
      } as AgentContextWindowView["compaction"],
    });
    const note = (each: AgentContextWindowView) => windowRows(each, "J", "Jacobian", NOW).note;
    expect(windowRows(asked, "J", "Jacobian", NOW).compact).toEqual({
      label: "Compacting",
      busy: true,
      quiet: false,
    });
    expect(note(asked)).toBe("Asking J to compact.");
    expect(note(view({ compacting: "queued" }))).toBe("J compacts when this turn ends.");
    expect(note(view({ compacting: "running" }))).toBe("J is summing up its conversation.");
  });

  it("shows a limit on its way as saving, and lets nothing be dragged meanwhile", () => {
    const rows = windowRows(view({ change: waiting(70) }), "J", "Jacobian", NOW);
    expect(rows.auto).toMatchObject({ on: true, sub: "Saving to Jacobian", saving: true });
    expect(rows.drags).toBe(false);
  });

  it("has a switch only where the limit may be turned off, and says what off means", () => {
    const off = view({ limit: { at: null, choices: [50, 90], default: null, may_turn_off: true } });
    const rows = windowRows(off, "Main", "OpenClaw", NOW);
    expect(rows.auto).toEqual({
      on: false,
      switch: true,
      sub: "Only when you ask, or when it is full.",
      saving: false,
    });
    expect(rows.drags).toBe(false);
  });

  it("has no Compacts itself row when the harness keeps its own limit", () => {
    expect(windowRows(view({ limit: undefined }), "J", "Jacobian", NOW).auto).toBeUndefined();
  });

  it("goes quiet while the harness is away, or for an agent read only, with the reason", () => {
    const away = windowRows(view({ away: true }), "Main", "OpenClaw", NOW);
    expect(away).toMatchObject({ quiet: true, drags: false, hint: "OpenClaw is away" });
    expect(away.compact.quiet).toBe(true);
    expect(away.auto?.sub).toBe("At 80%.");
    const kept = view({ editable: false, why_read_only: "OpenClaw keeps this one's limit." });
    expect(windowRows(kept, "Main", "OpenClaw", NOW).hint).toBe("OpenClaw keeps this one's limit.");
    const noCompact = view({ compacts: false, why_not: "Only from its own app." });
    expect(windowRows(noCompact, "Main", "OpenClaw", NOW).compact.quiet).toBe(true);
  });
});

describe("the foot and the sheet", () => {
  it("says what compacting does, and why nothing can be asked now", () => {
    const what =
      "Compacting sums up J's conversation so far, and it carries on from the summary. Details from early on may be lost.";
    expect(windowFoot(view(), "J", "Jacobian")).toBe(what);
    expect(windowFoot(view({ away: true }), "J", "Jacobian")).toBe(
      `${what} Jacobian is away, so nothing can be asked of it now.`,
    );
    expect(windowFoot(view({ compacts: false, why_not: "Not here." }), "J", "Jacobian")).toBe(
      `${what} Not here.`,
    );
    // Compacting, the note beside the button says so, and the foot doesn't again.
    const running = view({
      compacts: false,
      why_not: "It is compacting now.",
      compacting: "running",
    });
    expect(windowFoot(running, "J", "Jacobian")).toBe(what);
  });

  it("asks before it compacts, says what happened last time, and when it will while working", () => {
    expect(compactSheet(view(), "J", false)).toEqual({
      title: "Compact J's context?",
      sub: "172k of 272k tokens",
      body: "J sums up its conversation so far and carries on from the summary. Details from early on may be lost. Last time it went from 221k to 24k.",
      after: undefined,
    });
    expect(compactSheet(view({ last: undefined }), "J", true).after).toBe(
      "J is working, so it compacts when this turn ends.",
    );
  });

  it("puts a save's and a compaction's end into words", () => {
    expect(windowSaveWords("saving", "Jacobian")).toBe("Saving to Jacobian");
    expect(windowSaveWords("missed", "Jacobian")).toBe(
      "Jacobian hasn't answered. It may still change it.",
    );
    const done = view({
      last: { at: "2026-10-09T18:29:00.000Z", from: 206_000, to: 21_000, by: "asked" },
    });
    expect(compactWords("done", "Jacobian", done)).toBe("Compacted, 206k to 21k.");
    expect(compactWords("failed", "Jacobian", undefined, "Nothing to compact yet.")).toBe(
      "Nothing to compact yet.",
    );
    expect(compactWords("gone", "Jacobian")).toBe(
      "Still compacting. It shows here when it is done.",
    );
  });
});

/** A store that answers from a list of copies, one per read. */
function storeOf(
  reads: AgentContextWindowView[],
  refuse?: Error,
): WindowReads & { asked: unknown[] } {
  const asked: unknown[] = [];
  let at = 0;
  const next = async () => reads[Math.min(at++, reads.length - 1)] as AgentContextWindowView;
  return {
    asked,
    readAgentContextWindow: next,
    async changeAgentContextWindow(_agent, ask) {
      asked.push(ask);
      if (refuse) throw refuse;
      return { change_id: "chg_01JB0000000000000000000001" } as never;
    },
    async compactAgent() {
      asked.push("compact");
      if (refuse) throw refuse;
      return { change_id: "chg_01JB0000000000000000000002" } as never;
    },
  };
}

const quick = { alive: () => true, sleep: async () => undefined };

describe("saving a limit", () => {
  it("reads until the harness answers it", async () => {
    const saved = view({
      limit: { at: 70, choices: [50, 60, 70, 80, 90], default: 80, may_turn_off: false },
      change: { ...waiting(70), state: "saved" } as AgentContextWindowView["change"],
    });
    const store = storeOf([view({ change: waiting(70) }), saved]);
    const outcome = await saveWindowLimit(store, "agt_1", { at: 70 }, quick);
    expect(store.asked).toEqual([{ at: 70 }]);
    expect(outcome).toMatchObject({ state: "saved", view: saved });
  });

  it("is away at once when the server says so", async () => {
    const away = new ServerRefused("Jacobian is away.", 422, {
      error: { refusal: "harness_away" },
    });
    expect(await saveWindowLimit(storeOf([view()], away), "agt_1", { at: 70 }, quick)).toEqual({
      state: "away",
    });
  });
});

describe("Compact now", () => {
  const compaction = (state: string) =>
    ({
      change_id: "chg_01JB0000000000000000000002",
      state,
      asked_at: "2026-10-09T18:29:58.000Z",
    }) as AgentContextWindowView["compaction"];

  it("follows the copy through taken to done, handing each on", async () => {
    const seen: string[] = [];
    const done = view({ used: 21_000, compaction: compaction("done") });
    const store = storeOf([
      view({ compaction: compaction("waiting") }),
      view({ compacting: "running", compaction: compaction("taken") }),
      done,
    ]);
    const outcome = await compactNow(store, "agt_1", {
      ...quick,
      onView: (each) => seen.push(each.compaction?.state ?? "none"),
    });
    expect(seen).toEqual(["waiting", "taken", "done"]);
    expect(outcome).toMatchObject({ state: "done", view: done });
  });

  it("ends refused with the harness's words, or away", async () => {
    const failed = { ...compaction("failed"), message: "Nothing to compact yet." };
    const store = storeOf([view({ compaction: failed as AgentContextWindowView["compaction"] })]);
    expect(await compactNow(store, "agt_1", quick)).toMatchObject({
      state: "failed",
      message: "Nothing to compact yet.",
    });
    const away = new ServerRefused("Jacobian is away.", 422, {
      error: { refusal: "harness_away" },
    });
    expect(await compactNow(storeOf([view()], away), "agt_1", quick)).toEqual({ state: "away" });
  });

  it("stops following once the page is gone", async () => {
    const store = storeOf([view({ compacting: "running", compaction: compaction("taken") })]);
    expect(await compactNow(store, "agt_1", { ...quick, alive: () => false })).toEqual({
      state: "gone",
    });
  });
});
