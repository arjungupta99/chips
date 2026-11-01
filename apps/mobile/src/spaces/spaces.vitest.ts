/**
 * The rules a space list and a message list follow. Pure, and checked here rather than through a
 * screen, because they are the same rules the desktop follows and a difference between them
 * would be a bug in whichever was written second.
 */

import type { Directory, Lane, Line, NeedsYouItem, Space } from "@chipschat/core";
import { spaceSubtitle, spaceTitle } from "@chipschat/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  answersInTheRoom,
  type Drawn,
  foldRuns,
  GROUP_WITHIN_MS,
  groupLines,
  laneLive,
  openAsks,
  type Place,
  parseTarget,
  saidBy,
  targetIndex,
  targetOf,
} from "./spaces";

const DIRECTORY: Directory = {
  per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
  per_dana: { id: "per_dana", kind: "person", displayName: "Dana Ruiz" },
  har_scout: { id: "har_scout", kind: "harness", displayName: "Scout", ownerId: "per_arjun" },
  har_stray: { id: "har_stray", kind: "harness", displayName: "Stray" },
};

/** Enough people to outgrow a name made of names. */
const OTHERS: Directory = {
  per_sam: { id: "per_sam", kind: "person", displayName: "Sam" },
  per_ali: { id: "per_ali", kind: "person", displayName: "Ali" },
};

function space(over: Partial<Space> = {}): Space {
  return {
    id: "sp_1",
    kind: "room",
    members: [],
    roles: {},
    state: "open",
    lastEventSeq: 1,
    lines: [],
    runs: [],
    sessions: [],
    pins: [],
    glimpse: false,
    ...over,
  };
}

function line(over: Partial<Line> = {}): Line {
  return {
    id: "ln_1",
    seq: 1,
    kind: "text",
    authorId: "per_dana",
    authorKind: "person",
    text: "hello",
    ts: "2026-09-07T10:00:00.000Z",
    ...over,
  };
}

describe("the line under a room's name", () => {
  it("is the harness in the room, where the name is the work rather than the worker", () => {
    const titled = space({ title: "Supplier email", members: ["per_arjun", "har_scout"] });
    expect(spaceSubtitle(titled, DIRECTORY)).toBe("Scout");
  });

  it("is the harness of a run, where the room has no members to read", () => {
    const running = space({ title: "PO-4471", run: { harnessId: "har_scout" } as Space["run"] });
    expect(spaceSubtitle(running, DIRECTORY)).toBe("Scout");
  });

  it("is nothing where the name is already the harness", () => {
    const named = space({
      members: ["har_scout"],
      run: { harnessId: "har_scout" } as Space["run"],
    });
    expect(spaceTitle(named, DIRECTORY)).toBe("Scout");
    expect(spaceSubtitle(named, DIRECTORY)).toBeUndefined();
  });

  it("is nothing for a room of two, whose name is both of them", () => {
    expect(spaceSubtitle(space({ members: ["per_arjun", "per_dana"] }), DIRECTORY)).toBeUndefined();
  });

  it("is how many people, where there are more of them than a name holds", () => {
    const crowd = space({
      title: "Santa Barbara 2026 trip",
      members: ["per_arjun", "per_dana", "per_sam", "per_ali"],
    });
    expect(spaceSubtitle(crowd, { ...DIRECTORY, ...OTHERS })).toBe("4 people");
  });
});

describe("who said a line", () => {
  it("is its author, ordinarily", () => {
    expect(saidBy(line(), DIRECTORY)).toEqual({ id: "per_dana", kind: "person" });
    expect(saidBy(line({ authorId: "har_scout", authorKind: "harness" }), DIRECTORY)).toEqual({
      id: "har_scout",
      kind: "harness",
    });
  });

  it("is the harness's owner when a harness relayed it", () => {
    // A prompt typed at a terminal reaches Chips as the harness's own event. Drawing it under
    // the harness's name makes a space of two people look like one talking to itself.
    expect(saidBy(line({ via: "har_scout" }), DIRECTORY)).toEqual({
      id: "per_arjun",
      kind: "person",
    });
  });

  it("falls back to the harness when Chips does not know whose it is", () => {
    expect(saidBy(line({ via: "har_stray" }), DIRECTORY)).toEqual({
      id: "har_stray",
      kind: "harness",
    });
  });
});

describe("where something waiting on a person points", () => {
  const item = (over: Partial<NeedsYouItem>): NeedsYouItem =>
    ({
      kind: "approval",
      tier: "decide",
      id: "apr_1",
      spaceId: "sp_1",
      runId: "run_1",
      harnessId: "hrn_1",
      title: "email.send",
      seq: 1,
      ...over,
    }) as NeedsYouItem;

  it("names the line, the run or the asks, and reads the same words back", () => {
    expect(targetOf(item({ kind: "checkpoint", id: "ln_9" }))).toBe("line:ln_9");
    expect(targetOf(item({ kind: "summary", id: "run_1" }))).toBe("run:run_1");
    expect(targetOf(item({ kind: "failure", id: "run_1" }))).toBe("run:run_1");
    expect(targetOf(item({ kind: "approval" }))).toBe("asks");
    expect(targetOf(item({ kind: "question", id: "ask_1" }))).toBe("asks");
    expect(parseTarget("line:ln_9")).toEqual({ kind: "line", id: "ln_9" });
    expect(parseTarget("run:run_1")).toEqual({ kind: "run", runId: "run_1" });
    expect(parseTarget("asks")).toEqual({ kind: "asks" });
    expect(parseTarget(undefined)).toBeUndefined();
    expect(parseTarget("")).toBeUndefined();
    expect(parseTarget("elsewhere:x")).toBeUndefined();
    expect(parseTarget(":x")).toBeUndefined();
  });

  it("answers a question in its room, and on the ask's own screen only from outside it", () => {
    expect(answersInTheRoom(item({ kind: "question", id: "qst_1" }))).toBe(true);
    expect(answersInTheRoom(item({ kind: "question", id: "qst_2", outside: true }))).toBe(false);
    expect(answersInTheRoom(item({ kind: "approval" }))).toBe(false);
  });

  it("finds the line as drawn, newest first, and a run by the line that closed it", () => {
    const line = (id: string, over: Partial<Line> = {}): Line =>
      ({
        id,
        seq: 1,
        kind: "text",
        authorId: "usr_1",
        authorKind: "person",
        text: id,
        ts: "2026-09-09T10:00:00.000Z",
        ...over,
      }) as Line;
    const drawn = [
      line("ln_3", { kind: "summary", runId: "run_1" }),
      line("ln_2", { runId: "run_1" }),
      line("ln_1", { kind: "status", runId: "run_0" }),
    ];
    expect(targetIndex(drawn, { kind: "line", id: "ln_2" })).toBe(1);
    expect(targetIndex(drawn, { kind: "run", runId: "run_1" })).toBe(0);
    expect(targetIndex(drawn, { kind: "run", runId: "run_0" })).toBe(2);
    // Not here yet — a replay still on its way — and nowhere in particular.
    expect(targetIndex(drawn, { kind: "line", id: "ln_7" })).toBe(-1);
    expect(targetIndex(drawn, { kind: "asks" })).toBe(-1);
  });
});

describe("the asks a space is holding", () => {
  it("is every run's unanswered approvals and questions, as the room's cards", () => {
    const space = {
      id: "sp_1",
      lastEventSeq: 40,
      runs: [
        {
          runId: "run_1",
          harnessId: "hrn_1",
          approvals: [
            { approvalId: "apr_1", actionKind: "email.send", to: "dana@northwind.com" },
            { approvalId: "apr_0", actionKind: "file.write", resolved: { decision: "approved" } },
          ],
          questions: [
            {
              askId: "ask_1",
              questions: [{ questionId: "q1", prompt: "Which supplier?" }],
              timeoutAt: "2026-09-09T11:00:00.000Z",
            },
            {
              askId: "ask_2",
              questions: [{ questionId: "q2", prompt: "Colour?", defaultValue: "blue" }],
            },
            { askId: "ask_9", questions: [{ questionId: "q9", prompt: "Done?" }], answered: {} },
          ],
        },
      ],
    } as unknown as Space;
    expect(openAsks(space)).toEqual([
      {
        kind: "approval",
        tier: "decide",
        id: "apr_1",
        spaceId: "sp_1",
        runId: "run_1",
        harnessId: "hrn_1",
        title: "email.send to dana@northwind.com",
        seq: 40,
        expiresAt: undefined,
      },
      {
        kind: "question",
        tier: "decide",
        id: "ask_1",
        spaceId: "sp_1",
        runId: "run_1",
        harnessId: "hrn_1",
        title: "Which supplier?",
        seq: 40,
        expiresAt: "2026-09-09T11:00:00.000Z",
      },
      {
        kind: "question",
        tier: "review",
        id: "ask_2",
        spaceId: "sp_1",
        runId: "run_1",
        harnessId: "hrn_1",
        title: "Colour?",
        seq: 40,
        expiresAt: undefined,
      },
    ]);
  });
});

describe("how the room groups what was said", () => {
  const at = (seconds: number) => new Date(Date.UTC(2026, 8, 7, 10, 0, seconds)).toISOString();
  const speaker = (line: Line) => saidBy(line, DIRECTORY).id;
  const places = (drawn: readonly Drawn[]) => drawn.map((each) => each.place);

  it("closes up one author's bubbles said close together, and marks the last", () => {
    const drawn = groupLines(
      [line({ id: "a", ts: at(0) }), line({ id: "b", ts: at(30) }), line({ id: "c", ts: at(70) })],
      speaker,
    );
    expect(places(drawn)).toEqual(["first", "middle", "last"]);
    expect(drawn.map((each) => each.separator)).toEqual([true, false, false]);
  });

  it("starts a new group when the author changes, and when three minutes have passed", () => {
    const drawn = groupLines(
      [
        line({ id: "a", ts: at(0) }),
        line({ id: "b", ts: at(10), authorId: "per_arjun" }),
        line({ id: "c", ts: at(20), authorId: "per_arjun" }),
        line({ id: "d", ts: at(20 + GROUP_WITHIN_MS / 1000), authorId: "per_arjun" }),
      ],
      speaker,
    );
    expect(places(drawn)).toEqual(["only", "first", "last", "only"]);
  });

  it("says the time over the first line, and again after fifteen minutes of silence", () => {
    const drawn = groupLines(
      [
        line({ id: "a", ts: at(0) }),
        line({ id: "b", ts: at(14 * 60) }),
        line({ id: "c", ts: at(29 * 60) }),
      ],
      speaker,
    );
    expect(drawn.map((each) => each.separator)).toEqual([true, false, true]);
    // The separator is a break: the line under it begins a group of its own.
    expect(places(drawn)).toEqual(["only", "only", "only"]);
  });

  it("lets a card, a margin line or a tombstone stand alone, and end the run before it", () => {
    const drawn = groupLines(
      [
        line({ id: "a", ts: at(0) }),
        line({ id: "r", ts: at(1), kind: "route", laneId: "lane_1" }),
        line({ id: "b", ts: at(2) }),
        line({ id: "gone", ts: at(3), deleted: true, text: "" }),
        line({ id: "c", ts: at(4) }),
        line({ id: "s", ts: at(5), kind: "summary", authorId: "har_scout", authorKind: "harness" }),
        line({ id: "d", ts: at(6), authorId: "har_scout", authorKind: "harness" }),
      ],
      speaker,
    );
    expect(places(drawn)).toEqual(["only", "only", "only", "only", "only", "first", "last"]);
  });

  it("starts a turn where a line says it does: over a route, either side of a fold (ADR 0081)", () => {
    const drawn = groupLines(
      [
        line({ id: "a", ts: at(0) }),
        line({ id: "b", ts: at(5) }),
        line({ id: "c", ts: at(10) }),
        line({ id: "d", ts: at(15) }),
      ],
      speaker,
      (each) => each.id === "c",
    );
    expect(places(drawn)).toEqual(["first", "last", "first", "last"]);
  });

  it("groups a line a harness relayed with the ones its person typed here", () => {
    const drawn = groupLines(
      [
        line({ id: "a", ts: at(0), authorId: "per_arjun" }),
        line({
          id: "b",
          ts: at(5),
          authorId: "har_scout",
          authorKind: "harness",
          via: "har_scout",
        }),
      ],
      speaker,
    );
    expect(places(drawn)).toEqual(["first", "last"]);
  });

  interface Sketch {
    readonly who: string;
    readonly kind: Line["kind"];
    readonly gap: number;
    readonly deleted: boolean;
  }

  /** A room's worth of lines from a sketch of who said what how long after the last. */
  function linesOf(sketch: readonly Sketch[]): Line[] {
    let seconds = 0;
    return sketch.map((each, index) => {
      seconds += each.gap;
      return line({
        id: `ln_${index}`,
        ts: at(seconds),
        authorId: each.who,
        authorKind: each.who.startsWith("har") ? "harness" : "person",
        kind: each.kind,
        ...(each.deleted ? { deleted: true, text: "" } : {}),
      });
    });
  }

  /**
   * A group is a first, some middles and a last, in that order and nothing else; an only stands
   * alone. So a place opens a group exactly when nothing before it is still open, and continues
   * one exactly when what follows carries on.
   */
  function wellFormed(before: Place | undefined, place: Place, next: Place | undefined): boolean {
    const opens = before === undefined || before === "only" || before === "last";
    const continues = next === "middle" || next === "last";
    return (
      (place === "first" || place === "only") === opens &&
      (place === "first" || place === "middle") === continues
    );
  }

  it("keeps every line in its order, and every group well formed, whatever was said", () => {
    const arbitraryLine = fc.record<Sketch>({
      who: fc.constantFrom("per_arjun", "per_dana", "har_scout"),
      kind: fc.constantFrom("text", "text", "text", "summary", "route", "system"),
      gap: fc.integer({ min: 0, max: 20 * 60 }),
      deleted: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(arbitraryLine, { maxLength: 24 }), (sketch) => {
        const lines = linesOf(sketch);
        const drawn = groupLines(lines, speaker);
        expect(drawn.map((each) => each.line)).toEqual(lines);
        for (const [index, each] of drawn.entries()) {
          expect(wellFormed(drawn[index - 1]?.place, each.place, drawn[index + 1]?.place)).toBe(
            true,
          );
          // A separator stands only over the start of a group.
          if (each.separator) expect(each.place === "only" || each.place === "first").toBe(true);
        }
      }),
    );
  });
});

describe("the word on a lane's row", () => {
  const lane = (state: Lane["state"]): Lane =>
    ({
      laneId: "lane_1",
      state,
      trail: [],
      linkedSpaceIds: [],
      constraints: [],
    }) as unknown as Lane;

  it("is working while the lane is live, failed when it ended badly, and nothing otherwise", () => {
    expect(laneLive(lane("queued"))).toBe("working");
    expect(laneLive(lane("running"))).toBe("working");
    expect(laneLive(lane("failed"))).toBe("failed");
    expect(laneLive(lane("cancelled"))).toBe("failed");
    expect(laneLive(lane("completed"))).toBeUndefined();
    expect(laneLive(lane("waiting"))).toBeUndefined();
  });
});

describe("harnesses talking to each other, folded (ADR 0081)", () => {
  const drawn = (id: string, separator = false): Drawn => ({
    line: line({ id }),
    place: "only",
    separator,
  });
  const between = (each: Line) => each.id.startsWith("h");

  it("folds each run into one row, a run of one too, oldest first inside", () => {
    // Newest first, as the room draws them.
    const rows = foldRuns(
      [drawn("p3"), drawn("h3"), drawn("h2"), drawn("p2"), drawn("h1", true), drawn("p1")],
      between,
      () => undefined,
    );
    expect(
      rows.map((row) => ("fold" in row ? row.lines.map((each) => each.id) : row.line.id)),
    ).toEqual(["p3", ["h2", "h3"], "p2", ["h1"], "p1"]);
    // The time said over a run's first line is said over its fold.
    expect(rows[3]).toMatchObject({ fold: true, separator: true });
  });

  it("carries the referee's line as of the fold's newest line, so it grows as they go on (ADR 0097)", () => {
    const line6 = { stage: "warning" as const, text: "6 messages" };
    const line7 = { stage: "warning" as const, text: "7 messages" };
    const [fold] = foldRuns([drawn("h2"), drawn("h1")], between, (each) =>
      each.id === "h2" ? line7 : line6,
    );
    expect(fold).toMatchObject({ fold: true, guard: line7 });
    // A newest line with nothing to say leaves the fold the line as of the newest that had one.
    const [quieter] = foldRuns([drawn("h2"), drawn("h1")], between, (each) =>
      each.id === "h1" ? line6 : undefined,
    );
    expect(quieter).toMatchObject({ guard: line6 });
  });
});
