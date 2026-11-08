/**
 * Where the new-space window is on each frame (`geometry.ts`), as arithmetic: the rect between the
 * + and the card on two springs, on to the screen, and the four clips that cut the window to it;
 * and the watch kept on the room's first bubble while the words fly to it.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CARD_MOST,
  cardAcross,
  cardTop,
  cardUnder,
  clamp01,
  clipsFor,
  fillRect,
  HANG,
  pour,
  type Rect,
  SETTLE_MS,
  STILL_FRAMES,
  same,
  topMiddle,
  UNWATCHED,
  type Watch,
  watch,
  windowRect,
} from "./geometry";

const SCREEN = { width: 402, height: 874 };
const WHOLE: Rect = { x: 0, y: 0, ...SCREEN };
const PLUS: Rect = { x: 319, y: 791, width: 62, height: 62 };
const CARD: Rect = { x: 10, y: 380, width: 382, height: 150 };

/** What the four nested clips let through, worked out the long way from their moves. */
function cut(rect: Rect): Rect {
  const { corners, inside } = clipsFor(rect, SCREEN);
  let x = 0;
  let y = 0;
  let left = Number.NEGATIVE_INFINITY;
  let top = Number.NEGATIVE_INFINITY;
  let right = Number.POSITIVE_INFINITY;
  let bottom = Number.POSITIVE_INFINITY;
  for (const move of corners) {
    x += move.x;
    y += move.y;
    left = Math.max(left, x);
    top = Math.max(top, y);
    right = Math.min(right, x + SCREEN.width);
    bottom = Math.min(bottom, y + SCREEN.height);
  }
  // What is inside is put back where it was laid out, at the screen's own origin.
  expect(x + inside.x).toBeCloseTo(0);
  expect(y + inside.y).toBeCloseTo(0);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

describe("the new-space window's geometry", () => {
  it("is the + at nought, the card at one and the whole screen at two", () => {
    expect(windowRect(PLUS, CARD, WHOLE, 0, 0)).toEqual(PLUS);
    expect(windowRect(PLUS, CARD, WHOLE, 1, 1)).toEqual(CARD);
    expect(windowRect(PLUS, CARD, WHOLE, 2, 2)).toEqual(WHOLE);
  });

  it("takes the sides on one spring and the top and bottom on the other", () => {
    const across = windowRect(PLUS, CARD, WHOLE, 1, 0);
    expect(across).toEqual({ x: CARD.x, width: CARD.width, y: PLUS.y, height: PLUS.height });
    expect(pour(PLUS, CARD, 0, 1)).toEqual({
      x: PLUS.x,
      width: PLUS.width,
      y: CARD.y,
      height: CARD.height,
    });
  });

  it("carries an overshoot on towards the screen, and holds an undershoot at no size", () => {
    const over = windowRect(PLUS, CARD, WHOLE, 1.05, 1.05);
    expect(over.width).toBeGreaterThan(CARD.width);
    expect(over.height).toBeGreaterThan(CARD.height);
    const under = windowRect(PLUS, CARD, WHOLE, -2, -2);
    expect(under.width).toBe(0);
    expect(under.height).toBe(0);
  });

  it("is cut by the four clips to exactly the rect it is at, anywhere on the screen", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 402 }),
        fc.integer({ min: 0, max: 874 }),
        fc.integer({ min: 0, max: 402 }),
        fc.integer({ min: 0, max: 874 }),
        (x, y, width, height) => {
          const rect = {
            x: Math.min(x, SCREEN.width - width),
            y: Math.min(y, SCREEN.height - height),
            width: Math.min(width, SCREEN.width),
            height: Math.min(height, SCREEN.height),
          };
          const seen = cut(rect);
          expect(seen.x).toBeCloseTo(rect.x);
          expect(seen.y).toBeCloseTo(rect.y);
          expect(seen.width).toBeCloseTo(rect.width);
          expect(seen.height).toBeCloseTo(rect.height);
        },
      ),
    );
  });

  it("holds a share between nought and one", () => {
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(1.3)).toBe(1);
  });
});

describe("the new-space window on a wide screen", () => {
  const IPAD = { width: 1032, height: 1376 };

  it("is the screen less its gaps on a phone, and a card in the middle on an iPad", () => {
    expect(cardAcross(SCREEN.width, 10, false)).toEqual({ x: 10, width: 382 });
    expect(cardAcross(IPAD.width, 10, true)).toEqual({
      x: (IPAD.width - CARD_MOST) / 2,
      width: CARD_MOST,
    });
    // A wide window narrow enough that the card fits it keeps the phone's.
    expect(cardAcross(560, 10, true)).toEqual({ x: 10, width: 540 });
  });

  it("fills the whole screen on a phone, and the half beside the list on an iPad", () => {
    expect(fillRect(SCREEN, undefined)).toEqual(WHOLE);
    expect(fillRect(IPAD, 360)).toEqual({ x: 360, y: 0, width: 672, height: 1376 });
    // The iPhone Duo open, beside its column on the right, and on the left.
    expect(fillRect({ width: 867, height: 669 }, 476)).toEqual({
      x: 476,
      y: 0,
      width: 391,
      height: 669,
    });
    expect(fillRect({ x: 84, width: 867, height: 669 }, undefined)).toEqual({
      x: 84,
      y: 0,
      width: 867,
      height: 669,
    });
    const half = fillRect(IPAD, 360);
    expect(windowRect(PLUS, CARD, half, 2, 2)).toEqual(half);
  });

  it("hangs under the gold + on an iPad, across from its middle until the edge stops it", () => {
    // Beside the pill, upright: the + 44 across, 176 past the window's middle.
    const plus = { x: 692, y: 24, width: 44, height: 44 };
    expect(cardUnder(IPAD.width, 16, plus)).toEqual({
      x: 714 - CARD_MOST / 2,
      width: CARD_MOST,
      top: 68 + HANG,
    });
    // Nearer the right edge, it stops short of it.
    const right = cardUnder(IPAD.width, 16, { ...plus, x: 800 });
    expect(right.x).toBe(IPAD.width - 16 - CARD_MOST);
    // At the window's left, it stops short of that edge.
    expect(cardUnder(1376, 16, { x: 240, y: 32, width: 44, height: 44 }).x).toBe(16);
    // A window narrower than a card and its edges narrows it.
    expect(cardUnder(500, 16, plus)).toMatchObject({ x: 16, width: 468 });
  });

  it("stands on the keys on a phone, and on an iPad hangs where it hangs unless they would cover it", () => {
    expect(cardTop(844, 336, 10, 180, undefined)).toBe(844 - 336 - 10 - 180);
    expect(cardTop(1376, 400, 10, 180, 84)).toBe(84);
    // An iPad mini on its side, with keys most of its height.
    expect(cardTop(744, 480, 10, 230, 84)).toBe(744 - 480 - 10 - 230);
  });

  it("grows out of a point at the top in the middle when there is no + to measure", () => {
    const from = topMiddle(IPAD.width, 24);
    expect(from).toEqual({ x: 516, y: 24, width: 0, height: 0 });
    expect(windowRect(from, CARD, WHOLE, 0, 0)).toEqual(from);
  });
});

describe("the watch on the room's first bubble", () => {
  const BUBBLE: Rect = { x: 158, y: 606, width: 228, height: 54 };
  const FRAME = 1000 / 60;

  /** The watch after a bubble has been measured at each of `places`, a frame apart. */
  function seenAt(places: readonly Rect[]): Watch {
    let seen = UNWATCHED;
    places.forEach((place, frame) => {
      seen = watch(seen, place, 5000 + frame * FRAME);
    });
    return seen;
  }

  it("takes less than half a point as no move at all", () => {
    expect(same(BUBBLE, { ...BUBBLE, y: BUBBLE.y + 0.4 })).toBe(true);
    expect(same(BUBBLE, { ...BUBBLE, y: BUBBLE.y + 0.6 })).toBe(false);
    expect(same(BUBBLE, { ...BUBBLE, height: BUBBLE.height + 20 })).toBe(false);
  });

  it("has a bubble settled once it has stood still for a few frames, and the words go for it", () => {
    const standing = Array.from({ length: STILL_FRAMES }, () => BUBBLE);
    expect(seenAt(standing)).toMatchObject({ settled: false, aiming: false });
    expect(seenAt([...standing, BUBBLE])).toMatchObject({ settled: true, aiming: true });
  });

  it("has it unsettled again the moment it moves, and the words still going for it", () => {
    const standing = Array.from({ length: STILL_FRAMES + 1 }, () => BUBBLE);
    const moved = seenAt([...standing, { ...BUBBLE, y: 560 }]);
    expect(moved).toMatchObject({ settled: false, aiming: true, still: 0 });
    expect(moved.last?.y).toBe(560);
  });

  it("sends the words for a bubble still moving once the room has had its time to settle", () => {
    const moving = (frames: number) =>
      Array.from({ length: frames }, (_, frame) => ({ ...BUBBLE, y: 700 - frame * 2 }));
    const early = Math.floor(SETTLE_MS / FRAME);
    expect(seenAt(moving(early))).toMatchObject({ settled: false, aiming: false });
    expect(seenAt(moving(early + 2))).toMatchObject({ settled: false, aiming: true });
  });
});
