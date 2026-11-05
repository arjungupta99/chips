/**
 * Where a popover stands beside its button on an iPad (ADR 0256). What is worth proving: it takes
 * the side with the more room, its edge on that side a gap and an arrow off the button; it is
 * across from the button's middle until a window's edge stops it, and the arrow stays on the
 * button then, clear of the panel's corner; a window narrower than a popover narrows it.
 */

import { describe, expect, it } from "vitest";
import { ARROW, POPOVER_WIDTH, placeBeside } from "./beside";
import { SHEET } from "./tokens";

const IPAD = { width: 1032, height: 1376 };
const INSETS = { top: 24, bottom: 20, left: 0, right: 0 };
/** The gap and the arrow, between the button and the panel. */
const OFF = 4 + ARROW;

describe("a popover beside its button", () => {
  it("stands below a button high on the window, across from its middle, its arrow on it", () => {
    const placed = placeBeside({ x: 600, y: 120, width: 44, height: 44 }, IPAD, INSETS);
    expect(placed).toMatchObject({ above: false, edge: 164 + OFF, width: POPOVER_WIDTH });
    expect(placed.left + placed.arrow).toBe(622);
    expect(placed.left).toBe(622 - POPOVER_WIDTH / 2);
    // As tall as what is left under it, short of the window's foot.
    expect(placed.room).toBe(1376 - 20 - 12 - (164 + OFF));
  });

  it("stands above a button low on the window, its foot off the button's top", () => {
    const placed = placeBeside({ x: 360, y: 1290, width: 50, height: 50 }, IPAD, INSETS);
    expect(placed).toMatchObject({ above: true, edge: 1376 - 1290 + OFF });
    expect(placed.room).toBe(1290 - OFF - 24 - 12);
  });

  it("stops at the window's edge, and keeps its arrow on the button, clear of its corner", () => {
    const right = placeBeside({ x: 940, y: 40, width: 40, height: 40 }, IPAD, INSETS);
    expect(right.left).toBe(1032 - 12 - POPOVER_WIDTH);
    expect(right.left + right.arrow).toBe(960);
    const corner = placeBeside({ x: 0, y: 40, width: 20, height: 20 }, IPAD, INSETS);
    expect(corner.left).toBe(12);
    expect(corner.arrow).toBe(SHEET.radius + ARROW);
  });

  it("narrows to a window narrower than itself, an edge's way off each side", () => {
    const placed = placeBeside(
      { x: 150, y: 300, width: 0, height: 0 },
      { width: 320, height: 700 },
      INSETS,
    );
    expect(placed).toMatchObject({ left: 12, width: 320 - 24 });
  });
});
