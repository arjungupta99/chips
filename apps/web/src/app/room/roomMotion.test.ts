/**
 * The room's motion on the web and the Mac (ADR 0242), as arithmetic: where the scroll and each row
 * are drawn for a change, from where they were. The motion itself, frame by frame in a browser, is
 * `e2e/the-room-moves.spec.ts`; jsdom lays nothing out.
 */

import { ROOM_SPRING, roomMoveAt, springAt } from "@chipschat/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { carried, type Laid, scrollOf, wayOf } from "./roomMotion.ts";

const still = (top: number): Laid => ({ top, move: undefined });
const never = () => false;

describe("the scroll for a change", () => {
  it("stays where it was drawn and goes to the end, when the list grew under the reader", () => {
    expect(scrollOf("moving", { was: 400, stands: 400, end: 460 }, undefined, 1000)).toEqual({
      top: 400,
      scroll: { offset: -60, velocity: 0, since: 1000 },
    });
  });

  it("keeps the speed it had when the end moves on while it goes", () => {
    const going = { offset: -60, velocity: 0, since: 1000 };
    const now = roomMoveAt(going, 1120);
    const drawn = 460 + now.offset;
    const next = scrollOf("moving", { was: drawn, stands: drawn, end: 520 }, going, 1120);
    expect(next.top).toBe(drawn);
    expect(next.scroll?.velocity).toBe(now.velocity);
    expect(next.scroll?.offset).toBeCloseTo(drawn - 520, 9);
  });

  it("is at the end at once when the list is shorter than where it was drawn", () => {
    expect(scrollOf("moving", { was: 400, stands: 340, end: 340 }, undefined, 0)).toEqual({
      top: 340,
      scroll: undefined,
    });
  });

  it("goes at once with Reduce Motion, and is the reader's up the space", () => {
    const going = { offset: -30, velocity: -200, since: 0 };
    expect(scrollOf("atOnce", { was: 400, stands: 400, end: 460 }, going, 10)).toEqual({
      top: 460,
      scroll: undefined,
    });
    expect(scrollOf("away", { was: 400, stands: 120, end: 460 }, going, 10)).toEqual({
      top: 120,
      scroll: undefined,
    });
  });
});

describe("how a change is laid out", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("on the spring at the end, at once from where no row is drawn: a room catching up on its history", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
    expect(wayOf(true, true, { was: 9000, undrawn: 8000 })).toBe("moving");
    expect(wayOf(true, true, { was: 9000, undrawn: 60_000 })).toBe("atOnce");
    expect(wayOf(true, false, { was: 9000, undrawn: 0 })).toBe("atOnce");
    expect(wayOf(false, true, { was: 9000, undrawn: 60_000 })).toBe("away");
  });
});

describe("the rows for a change", () => {
  it("a hand-off over the thinking rows: the rows over it ride the scroll, the rows under it hold still, and it comes in with the row above", () => {
    const before = new Map([
      ["reply", still(100)],
      ["working", still(300)],
      ["thinking", still(380)],
    ]);
    // The hand-off lands under the reply: 60 high and a 12-pixel gap, so the thinking rows are
    // laid out 72 lower, and the scroll stays where it was drawn.
    const places = new Map([
      ["reply", 100],
      ["handoff", 300],
      ["working", 372],
      ["thinking", 452],
    ]);
    const next = carried("moving", (row) => before.get(row), places, {
      scrolled: 0,
      at: 500,
      old: never,
    });
    expect(next.get("reply")).toEqual({ top: 100, move: undefined, arrives: false });
    expect(next.get("handoff")).toEqual({ top: 300, move: undefined, arrives: true });
    // Drawn where they were, 72 above their new places, on the spring from there.
    expect(next.get("working")).toEqual({
      top: 372,
      move: { offset: -72, velocity: 0, since: 500 },
      arrives: false,
    });
    expect(next.get("thinking")?.move).toEqual({ offset: -72, velocity: 0, since: 500 });
  });

  it("a row that goes: the rows over it close over its place, and the rows under it stay", () => {
    const before = new Map([
      ["above", still(100)],
      ["gone", still(200)],
      ["under", still(262)],
    ]);
    // The list was drawn at its end, 62 further down than the end is now.
    const next = carried(
      "moving",
      (row) => before.get(row),
      new Map([
        ["above", 100],
        ["under", 200],
      ]),
      {
        scrolled: -62,
        at: 0,
        old: never,
      },
    );
    expect(next.get("above")?.move).toEqual({ offset: -62, velocity: 0, since: 0 });
    expect(next.get("under")?.move).toBeUndefined();
  });

  it("a row landing under a row on its way comes in with it, at its speed", () => {
    const going = { offset: 80, velocity: 0, since: 0 };
    const before = new Map([["rising", { top: 100, move: going }]]);
    const next = carried(
      "moving",
      (row) => before.get(row),
      new Map([
        ["rising", 100],
        ["landed", 180],
      ]),
      { scrolled: 0, at: 150, old: never },
    );
    const rising = next.get("rising")?.move;
    const now = roomMoveAt(going, 150);
    expect(rising).toEqual({ offset: now.offset, velocity: now.velocity, since: 150 });
    expect(next.get("landed")).toEqual({ top: 180, move: rising, arrives: true });
  });

  it("a move sent on while it goes keeps its speed: the rows stay together as two moves added up", () => {
    const first = { offset: 60, velocity: 0, since: 0 };
    const before = new Map([["row", { top: 100, move: first }]]);
    const next = carried("moving", (row) => before.get(row), new Map([["row", 60]]), {
      scrolled: 0,
      at: 120,
      old: never,
    }).get("row")?.move;
    for (let at = 120; at < 1200; at += 30) {
      const sum = roomMoveAt(first, at).offset + springAt(ROOM_SPRING, 40, 0, at - 120).offset;
      expect(Math.abs((next === undefined ? 0 : roomMoveAt(next, at).offset) - sum)).toBeLessThan(
        0.45,
      );
    }
  });

  it("a line drawn again as it nears the window does not arrive", () => {
    const next = carried("moving", () => undefined, new Map([["earlier", 0]]), {
      scrolled: 0,
      at: 0,
      old: () => true,
    });
    expect(next.get("earlier")).toEqual({ top: 0, move: undefined, arrives: false });
  });

  it("at once, nothing is off its place; up the space, nothing new is, and what was going goes on", () => {
    const going = { offset: -40, velocity: 0, since: 0 };
    const before = new Map([["row", { top: 100, move: going }]]);
    const places = new Map([
      ["row", 160],
      ["new", 260],
    ]);
    const options = { scrolled: 0, at: 10, old: never };
    const atOnce = carried("atOnce", (row) => before.get(row), places, options);
    expect([...atOnce.values()]).toEqual([
      { top: 160, move: undefined, arrives: false },
      { top: 260, move: undefined, arrives: false },
    ]);
    const away = carried("away", (row) => before.get(row), places, options);
    expect(away.get("row")?.move).toBe(going);
    expect(away.get("new")).toEqual({ top: 260, move: undefined, arrives: false });
  });
});
