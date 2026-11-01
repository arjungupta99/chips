/**
 * What the thinking bubble says, and when it may change (ADR 0147), from the event shapes
 * Jacobian and OpenClaw send.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  callWords,
  clockWords,
  DETAIL_HOLD_MS,
  doingSays,
  fitStrip,
  type Held,
  headline,
  holdSays,
  LABEL_HOLD_MS,
  pulse,
  READING,
  type Says,
  SETTLE_MS,
  stripOf,
  tally,
} from "./bubbleSays.js";
import type { ClientEvent } from "./events.js";
import { buildModel, type Step } from "./model.js";
import { type Doing, runDoing } from "./timeline.js";

const FIXTURES = fileURLToPath(new URL("../../protocol/fixtures/", import.meta.url));

function fixture(type: string, seq: number, overrides: Record<string, unknown> = {}): ClientEvent {
  return { ...JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")), seq, ...overrides };
}

const at = (second: number): string => `2026-10-10T16:00:${String(second).padStart(2, "0")}.000Z`;

/** A turn as a harness with no plan sends it, folded, and what it is doing at the end. */
function doingOf(events: ClientEvent[]): Doing {
  const run = buildModel([
    fixture("space.created", 1),
    fixture("run.started", 2, { plan: undefined, ts: at(0) }),
    ...events,
  ]).spaces[0]?.run;
  const doing = runDoing(run);
  if (doing === undefined) throw new Error("not doing anything");
  return doing;
}

let seq = 10;
function status(phase: string, words: string, second: number): ClientEvent {
  return fixture("run.status", seq++, { phase, verb_phrase: words, ts: at(second) });
}
/** A step's start, as Jacobian logs one: a title, and its tool under the runtime's name. */
function started(id: string, title: string | undefined, tool: string, second: number) {
  return fixture("step.log", seq++, {
    step_id: id,
    status: "started",
    title,
    tool,
    summary: undefined,
    sources: undefined,
    duration_ms: undefined,
    ts: at(second),
  });
}
function ended(id: string, second: number, summary?: string, status = "done") {
  return fixture("step.log", seq++, {
    step_id: id,
    status,
    title: undefined,
    tool: undefined,
    summary,
    sources: undefined,
    duration_ms: undefined,
    ts: at(second),
  });
}

/** A step as the fold keeps one, for reading a call alone. */
function step(tool: string | undefined, title: string): Step {
  return { stepId: "s", status: "started", title, ...(tool === undefined ? {} : { tool }) };
}

describe("a call, read", () => {
  it("says what kind of work it is, and what it was given", () => {
    expect(callWords(step("jacobian.web_search", "web_search · LEGO 60220"))).toEqual({
      label: "Searching the web",
      kind: "search",
      noun: ["search", "searches"],
      detail: "“LEGO 60220”",
    });
    expect(callWords(step("jacobian.browser", "browser · https://www.lego.com/en-us/"))).toEqual(
      expect.objectContaining({ label: "Reading a page", kind: "web", detail: "lego.com/en-us" }),
    );
    expect(callWords(step("exec", "exec · ls -la\nrm -rf nothing"))).toEqual(
      expect.objectContaining({ label: "Running a command", detail: "ls -la", code: true }),
    );
  });

  it("knows every tool Jacobian and OpenClaw called in two weeks, by nine kinds", () => {
    const kinds: Record<string, string> = {
      browser: "web",
      web_fetch: "web",
      sources_opened: "web",
      web_search: "search",
      tool_search: "search",
      knowledge_query: "search",
      evidence_search_facts: "search",
      space_records: "file",
      space_boundary: "file",
      read: "file",
      artifact_list: "file",
      read_document: "file",
      artifact_read: "file",
      read_file: "file",
      list_files: "file",
      deliver: "file",
      exec: "shell",
      shell: "shell",
      memory_recall: "memory",
      memory_save: "memory",
      memory_delete: "memory",
      knowledge_explore: "memory",
      memory_update: "memory",
      memory_search: "memory",
      memory_list: "memory",
      view_image: "image",
      image_download: "image",
      artifact_edit: "edit",
      artifact_write: "edit",
      edit: "edit",
      write: "edit",
      extend: "other",
      hand_back: "handoff",
      hand_down: "handoff",
      gmail_read: "mail",
      gmail_search: "mail",
      gmail_draft: "mail",
      progress_card: "other",
      session_status: "other",
      connector_catalog: "other",
    };
    for (const [tool, kind] of Object.entries(kinds)) {
      const words = callWords(step(`jacobian.${tool}`, tool));
      expect([tool, words.kind]).toEqual([tool, kind]);
      expect(words.label).not.toBe("");
    }
  });

  it("names a file the room sent for what it is, never for Chips' id for it", () => {
    expect(callWords(step("jacobian.view_image", "view_image · att_01M4ABC")).detail).toBe(
      "a photo from the space",
    );
    expect(
      callWords(step("jacobian.read_document", "read_document · /chips/media/x/report.pdf")).detail,
    ).toBe("a file from the space");
    expect(callWords(step("read", "read · ~/notes/plan.md")).detail).toBe("plan.md");
  });

  it("says a tool nobody named by its name, and guesses its glyph from it", () => {
    expect(callWords(step(undefined, "local-dev__coding_job_status"))).toEqual(
      expect.objectContaining({ label: "Using coding job status", kind: "other" }),
    );
    expect(callWords(step("mcp.fetch_url_contents", "fetch_url_contents")).kind).toBe("web");
  });

  it("draws a tool it does not know by the kind its harness says, counted with that kind", () => {
    const read: Step = {
      ...step("read_text_file", "read_text_file · src/plan.md"),
      callKind: "file",
    };
    expect(callWords(read)).toEqual({
      label: "Reading a file",
      kind: "file",
      noun: ["file", "files"],
      detail: "src/plan.md",
    });
    const run: Step = { ...step("execute", "execute · pnpm test\npnpm lint"), callKind: "shell" };
    expect(callWords(run)).toEqual(
      expect.objectContaining({
        label: "Running a command",
        kind: "shell",
        detail: "pnpm test",
        code: true,
      }),
    );
    expect(tally([read, step("read_file", "read_file · notes.md"), run])).toBe(
      "2 files · 1 command so far",
    );
  });

  it("takes the harness's kind over a name read the other way, and its word that a tool is none", () => {
    expect(callWords({ ...step("find", "find · LEGO trucks"), callKind: "web" })).toEqual(
      expect.objectContaining({ label: "Reading a page", kind: "web", detail: "LEGO trucks" }),
    );
    expect(callWords({ ...step("web_search", "web_search · x"), callKind: "search" }).label).toBe(
      "Searching the web",
    );
    expect(callWords({ ...step("fetch_notes", "fetch_notes"), callKind: "other" })).toEqual(
      expect.objectContaining({ label: "Using fetch notes", kind: "other" }),
    );
    expect(callWords({ ...step("browser", "browser"), callKind: "other" }).kind).toBe("other");
  });

  it("keeps a step a harness wrote as a sentence, with no tool, as it wrote it", () => {
    expect(callWords(step(undefined, "Counting the organisms still alive")).label).toBe(
      "Counting the organisms still alive",
    );
  });

  it("hands on to the room it names", () => {
    expect(callWords(step("jacobian.hand_down", "hand_down · Engineer")).label).toBe(
      "Handing to Engineer",
    );
    expect(callWords(step("jacobian.hand_back", "hand_back")).label).toBe("Handing back");
  });

  it("says Jacobian making a Space is getting set up, never by the name it gives the Space", () => {
    const words = callWords(step("jacobian.extend", "extend · Nearby Trails"));
    expect(words).toEqual(
      expect.objectContaining({ label: "Getting set up", kind: "other", untallied: true }),
    );
    expect(JSON.stringify(words)).not.toContain("Nearby Trails");
  });
});

describe("the words under the label", () => {
  it("count the calls by what they were, two kinds at most", () => {
    const made = [
      step("web_search", "web_search"),
      step("web_search", "web_search"),
      step("browser", "browser"),
      step("memory_save", "memory_save"),
    ];
    expect(tally(made)).toBe("2 searches · 1 page so far");
    expect(tally(made, true)).toBe("after 2 searches · 1 page");
    expect(tally([])).toBeUndefined();
  });

  it("leave out Jacobian finding its own way about, which it nearly always does first", () => {
    const made = [
      step("jacobian.tool_search", "tool_search · shell read_file"),
      step("jacobian.space_boundary", "space_boundary"),
      step("jacobian.shell", "shell · ls"),
      step("jacobian.shell", "shell · cat notes.md"),
      step("jacobian.view_image", "view_image · desktop.png"),
    ];
    expect(tally(made, true)).toBe("after 2 commands · 1 image");
    expect(tally(made.slice(0, 2))).toBeUndefined();
  });

  it("take a thought's first sentence, without its Markdown", () => {
    expect(headline("I **need** to check   prices. Then pick four.")).toBe(
      "I need to check prices.",
    );
    expect(headline("I should recommend four or more tru…")).toBe(
      "I should recommend four or more tru",
    );
  });

  it("say Jacobian's still-going words as a person would, keeping its ⏳", () => {
    expect(pulse("⏳ round 15 of 30")).toBe("⏳ Round 15 of 30");
    // Said once, a line's age stands still beside the ticking clock, so it goes.
    expect(pulse("⏳ still on your message, 5m — waiting on the model")).toBe(
      "⏳ Waiting on the model",
    );
    expect(pulse("⏳ still on your message, 2h 10m — running web_search")).toBe(
      "⏳ Running web_search",
    );
    expect(pulse("⏳ waiting on the model, 2m")).toBe("⏳ Waiting on the model");
    expect(pulse("⏳ waiting on the model, 45s")).toBe("⏳ Waiting on the model");
    expect(pulse("⏳")).toBe("");
    // Words without a mark gain none, and a lead that is only punctuation goes.
    expect(pulse("— holding the job, $1.20 so far")).toBe("Holding the job, $1.20 so far");
  });
});

describe("what the bubble would say", () => {
  it("is Thinking and Reading the message before the harness says anything", () => {
    expect(doingSays(doingOf([]))).toEqual({ label: "Thinking", detail: READING, calls: 0 });
  });

  it("does not read Jacobian's Writing… before a call as anything", () => {
    const doing = doingOf([
      status("thinking", "I need to find the set numbers. Then the prices.", 1),
      status("writing", "Writing…", 2),
    ]);
    expect(doing.verb).toBe("Writing…");
    expect(doingSays(doing)).toEqual({
      label: "Thinking",
      detail: "I need to find the set numbers.",
      calls: 0,
    });
  });

  it("never previews the reply: writing says how much work it took", () => {
    const doing = doingOf([
      started("s1", "web_search · LEGO trucks", "jacobian.web_search", 1),
      ended("s1", 2),
      started("s2", "browser · lego.com", "jacobian.browser", 3),
      ended("s2", 4),
      status("writing", "Here are four trucks a four-year-old", 5),
    ]);
    expect(doingSays(doing)).toEqual({
      label: "Writing",
      detail: "after 1 search · 1 page",
      calls: 2,
    });
  });

  it("is the call underway, with what it was given beside its glyph", () => {
    const doing = doingOf([
      status("thinking", "Looking for the set.", 1),
      started("s1", "web_search · LEGO 60220", "jacobian.web_search", 2),
    ]);
    expect(doingSays(doing)).toEqual({
      label: "Searching the web",
      detail: "“LEGO 60220”",
      kind: "search",
      calls: 1,
    });
  });

  it("tallies a call with nothing to say for itself", () => {
    const doing = doingOf([
      started("s1", "web_search · trucks", "jacobian.web_search", 1),
      ended("s1", 2),
      started("s2", "memory_save", "jacobian.memory_save", 3),
    ]);
    expect(doingSays(doing)).toEqual({
      label: "Saving a note",
      detail: "1 search · 1 note so far",
      calls: 2,
    });
  });

  it("reads OpenClaw, which names no step and says what each was for as it ends", () => {
    const begun = doingOf([started("c1", undefined, "exec", 1)]);
    expect(doingSays(begun)).toEqual({
      label: "Running a command",
      detail: "1 command so far",
      calls: 1,
    });
    const done = doingOf([
      started("c1", undefined, "exec", 1),
      ended("c1", 2, "Research Terafab supply-chain evidence"),
    ]);
    expect(doingSays(done)).toEqual({
      label: "Running a command",
      detail: "Research Terafab supply-chain evidence",
      calls: 1,
      settled: true,
    });
  });

  it("keeps what OpenClaw last said it was at while its next call begins, not a tally", () => {
    const next = doingOf([
      started("c1", undefined, "exec", 1),
      ended("c1", 2, "Research Terafab supply-chain evidence"),
      started("c2", undefined, "exec", 3),
    ]);
    expect(doingSays(next)).toEqual({
      label: "Running a command",
      detail: "Research Terafab supply-chain evidence",
      calls: 2,
    });
  });

  it("reads OpenClaw's word that it read a page as the page, beside its globe", () => {
    const read = doingOf([
      started("c1", undefined, "exec", 1),
      ended("c1", 2, "Find accessible Terafab references"),
      started("c2", undefined, "exec", 3),
      started("w1", undefined, "web_fetch", 4),
      ended("w1", 5, "from https://www.teslarati.com/terafab-partner/ (max 12000 chars)"),
    ]);
    expect(doingSays(read)).toEqual({
      label: "Reading a page",
      detail: "teslarati.com/terafab-partner",
      kind: "web",
      calls: 3,
    });
    // A page it read is not what it was at: the step it is in keeps the last aim.
    const after = doingOf([
      started("c1", undefined, "exec", 1),
      ended("c1", 2, "Find accessible Terafab references"),
      started("w1", undefined, "web_fetch", 3),
      ended("w1", 4, "from terra-fab-report.html"),
      started("c2", undefined, "exec", 5),
    ]);
    expect(doingSays(after).detail).toBe("Find accessible Terafab references");
  });

  it("is still going while an outer call is, after an inner one ended", () => {
    const doing = doingOf([
      started("c1", undefined, "exec", 1),
      started("c2", undefined, "web_fetch", 2),
      ended("c2", 3, "from reuters.com"),
    ]);
    expect(doingSays(doing)).toEqual({
      label: "Reading a page",
      detail: "reuters.com",
      kind: "web",
      calls: 2,
    });
  });

  it("says Still working while the harness waits", () => {
    const doing = doingOf([status("waiting", "⏳ round 15 of 30", 1)]);
    expect(doingSays(doing)).toEqual({
      label: "Still working",
      detail: "⏳ Round 15 of 30",
      calls: 0,
    });
  });
});

describe("holding the words", () => {
  const says = (label: string, detail: string, calls = 0, settled = false): Says => ({
    label,
    detail,
    calls,
    ...(settled ? { settled: true } : {}),
  });

  /** Read `says` at each moment in turn, as a screen would, and what is on screen after each. */
  function play(steps: readonly (readonly [number, Says])[]): { shown: string[]; held: Held } {
    let held: Held | undefined;
    const shown: string[] = [];
    for (const [now, wanted] of steps) {
      held = holdSays(held, wanted, now).held;
      shown.push(`${held.shown.label} · ${held.shown.detail}`);
    }
    if (held === undefined) throw new Error("nothing held");
    return { shown, held };
  }

  it("puts the first words up at once", () => {
    const { held, wake } = holdSays(undefined, says("Thinking", READING), 1000);
    expect(held.shown.label).toBe("Thinking");
    expect(wake).toBeUndefined();
  });

  it("lets a new label wait until the one shown has stood its time, and asks again then", () => {
    const first = holdSays(undefined, says("Thinking", READING), 0).held;
    const early = holdSays(first, says("Searching the web", "“trucks”", 1), 400);
    expect(early.held.shown.label).toBe("Thinking");
    expect(early.wake).toBe(LABEL_HOLD_MS);
    const due = holdSays(early.held, says("Searching the web", "“trucks”", 1), LABEL_HOLD_MS);
    expect(due.held.shown.label).toBe("Searching the web");
    expect(due.held.at).toBe(LABEL_HOLD_MS);
  });

  it("changes a detail under the same label sooner than a label", () => {
    const first = holdSays(undefined, says("Searching the web", "“a”", 1), 0).held;
    const next = holdSays(first, says("Searching the web", "“b”", 2), 10);
    expect(next.wake).toBe(DETAIL_HOLD_MS);
  });

  it("reads a burst of calls as the last of them", () => {
    const { shown } = play([
      [0, says("Thinking", READING)],
      [100, says("Searching the web", "“a”", 1)],
      [130, says("Reading a page", "lego.com", 2)],
      [160, says("Saving a note", "1 search · 1 page · 1 note so far", 3)],
      [LABEL_HOLD_MS, says("Saving a note", "1 search · 1 page · 1 note so far", 3)],
    ]);
    expect(shown).toEqual([
      "Thinking · Reading the message",
      "Thinking · Reading the message",
      "Thinking · Reading the message",
      "Thinking · Reading the message",
      "Saving a note · 1 search · 1 page · 1 note so far",
    ]);
  });

  it("drops the words waiting when the run comes back to what is shown", () => {
    const first = holdSays(undefined, says("Thinking", "A plan."), 0).held;
    const waiting = holdSays(first, says("Writing", "the answer"), 200).held;
    expect(waiting.next?.label).toBe("Writing");
    const back = holdSays(waiting, says("Thinking", "A plan."), 300);
    expect(back.held.next).toBeUndefined();
    expect(back.wake).toBeUndefined();
  });

  it("opens the strip's row with words, not on its own, and only once", () => {
    const first = holdSays(undefined, says("Thinking", READING), 0).held;
    const same = holdSays(first, says("Thinking", READING, 1), 300);
    // The words are the same, but the first call is news: it waits its turn like a new detail.
    expect(same.held.shown.calls).toBe(0);
    expect(same.wake).toBe(DETAIL_HOLD_MS);
    const opened = holdSays(same.held, says("Thinking", READING, 1), DETAIL_HOLD_MS).held;
    expect(opened.shown.calls).toBe(1);
    // More calls under the same words change nothing on screen.
    const more = holdSays(opened, says("Thinking", READING, 4), DETAIL_HOLD_MS + 50);
    expect(more.held.shown).toBe(opened.shown);
  });

  it("brings a finished call back to Thinking, keeping its detail, once it has settled", () => {
    const done = says("Searching the web", "“trucks”", 1, true);
    const first = holdSays(undefined, done, 0);
    expect(first.wake).toBe(SETTLE_MS);
    const later = holdSays(first.held, done, SETTLE_MS);
    expect(later.held.shown).toEqual({ label: "Thinking", detail: "“trucks”", calls: 1 });
  });

  it("counts the settling from when this screen saw the call end", () => {
    const first = holdSays(undefined, says("Searching the web", "“a”", 1), 0).held;
    const ended = holdSays(first, says("Searching the web", "“a”", 1, true), 5000);
    expect(ended.wake).toBe(5000 + SETTLE_MS);
  });

  it("gives back the same holding when nothing has changed", () => {
    const first = holdSays(undefined, says("Thinking", READING), 0).held;
    expect(holdSays(first, says("Thinking", READING), 500).held).toBe(first);
    const waiting = holdSays(first, says("Writing", "the answer"), 100).held;
    expect(holdSays(waiting, says("Writing", "the answer"), 200).held).toBe(waiting);
  });
});

describe("the strip", () => {
  const made = (...tools: string[]): Step[] =>
    tools.map((tool, index) => ({ stepId: `s${index}`, status: "done", title: tool, tool }));

  it("folds a run of one kind into a glyph and its count, the newest lit", () => {
    expect(stripOf(made("web_search", "web_search", "browser", "web_search"))).toEqual([
      { key: "c0", kind: "search", count: 2, lit: false },
      { key: "c2", kind: "web", count: 1, lit: false },
      { key: "c3", kind: "search", count: 1, lit: true },
    ]);
    expect(stripOf([])).toEqual([]);
  });

  it("keeps a glyph's key while its run grows", () => {
    const before = stripOf(made("browser", "web_search"));
    const after = stripOf(made("browser", "web_search", "web_search", "web_search"));
    expect(after.map((chip) => chip.key)).toEqual(before.map((chip) => chip.key));
    expect(after[1]?.count).toBe(3);
  });

  const sizes = {
    chip: (count: number) => (count > 1 ? 16 + 3 + 6 * String(count).length : 16),
    more: (hidden: number) => 13 + 6 * String(hidden).length,
    gap: 3,
  };

  it("lays the glyphs end to end while they fit", () => {
    const placed = fitStrip(stripOf(made("web_search", "browser", "exec")), 200, sizes);
    expect(placed.more).toBe(0);
    expect(placed.chips.map((chip) => chip.x)).toEqual([0, 19, 38]);
  });

  it("folds the oldest into a +N once they outgrow the strip, keeping the newest", () => {
    const alternating = made(...Array.from({ length: 20 }, (_, i) => (i % 2 ? "exec" : "browser")));
    const placed = fitStrip(stripOf(alternating), 100, sizes);
    const last = placed.chips.at(-1);
    expect(last?.lit).toBe(true);
    expect(placed.more + placed.chips.length).toBe(20);
    expect((last?.x ?? 0) + (last?.width ?? 0)).toBeLessThanOrEqual(100);
    expect(placed.chips[0]?.x).toBe(sizes.more(placed.more) + sizes.gap);
  });
});

describe("the clock", () => {
  it("reads minutes and seconds since the run began, never less than nothing", () => {
    const began = Date.parse(at(0));
    expect(clockWords(at(0), began + 42_900)).toBe("0:42");
    expect(clockWords(at(0), began + 725_000)).toBe("12:05");
    expect(clockWords(at(0), began - 2000)).toBe("0:00");
    expect(clockWords(undefined, began)).toBe("0:00");
  });
});
