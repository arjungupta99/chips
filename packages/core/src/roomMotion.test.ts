import { describe, expect, it } from "vitest";
import {
  ROOM_CLOCK,
  ROOM_SPRING,
  roomMoveAt,
  roomMoved,
  roomStarted,
  roomTicked,
  STEADY_FRAME_MS,
} from "./roomMotion.js";
import { springAt } from "./viewer.js";

describe("the room's clock", () => {
  it("does not move for a start, only for frames", () => {
    const started = roomStarted({ last: 1000, at: 250 }, 1005);
    expect(started).toEqual({ last: 1005, at: 250 });
    // Two moves of one change started a few milliseconds apart start at the same moment of it.
    expect(roomStarted(started, 1009)).toEqual({ last: 1009, at: 250 });
    expect(roomTicked(started, 1021)).toEqual({ last: 1021, at: 266 });
  });

  it("moves a frame that came late by a frame and a fifth, and never backwards", () => {
    const late = roomTicked({ last: 1000, at: 0 }, 1250);
    expect(late).toEqual({ last: 1250, at: STEADY_FRAME_MS });
    expect(roomTicked(late, 1240)).toBe(late);
    expect(roomStarted(late, 1200)).toBe(late);
    expect(roomTicked(ROOM_CLOCK, 16).at).toBe(16);
  });
});

describe("a move on the room's spring", () => {
  it("is the room's spring from where it was drawn", () => {
    const move = { offset: 64, velocity: 0, since: 100 };
    for (let at = 100; at <= 800; at += 25) {
      expect(roomMoveAt(move, at)).toEqual(springAt(ROOM_SPRING, 64, 0, at - 100));
    }
    expect(roomMoveAt(move, 2000)).toEqual({ offset: 0, velocity: 0, settled: true });
  });

  it("sent on while it goes, keeps its speed: two moves added up", () => {
    // A row drawn 60 pixels low, 150 ms into its rise, is sent on by 40 more: a second line lands.
    const first = { offset: 60, velocity: 0, since: 0 };
    const sent = roomMoved(first, 40, 150);
    const was = roomMoveAt(first, 150);
    expect(sent).toEqual({ offset: was.offset + 40, velocity: was.velocity, since: 150 });
    for (let at = 150; at <= 1200; at += 15) {
      const both = roomMoveAt(first, at).offset + springAt(ROOM_SPRING, 40, 0, at - 150).offset;
      expect(Math.abs(roomMoveAt(sent ?? first, at).offset - both)).toBeLessThan(0.45);
    }
  });

  it("starts from rest, and nothing to go is no move", () => {
    expect(roomMoved(undefined, -52, 10)).toEqual({ offset: -52, velocity: 0, since: 10 });
    expect(roomMoved(undefined, 0, 10)).toBeUndefined();
    expect(roomMoved({ offset: 30, velocity: 0, since: 0 }, 0, 5000)).toBeUndefined();
  });

  it("never jumps: no frame of a rise goes much more than a tenth of it", () => {
    const move = { offset: 80, velocity: 0, since: 0 };
    let last = 80;
    let fastest = 0;
    for (let at = 16; at <= 900; at += 16) {
      const now = roomMoveAt(move, at).offset;
      const step = last - now;
      fastest = Math.max(fastest, step);
      // An 80-pixel rise goes no more than about a tenth of its way in any one frame.
      expect(step).toBeLessThan(9);
      last = now;
    }
    expect(fastest).toBeGreaterThan(4);
    expect(last).toBe(0);
  });
});
