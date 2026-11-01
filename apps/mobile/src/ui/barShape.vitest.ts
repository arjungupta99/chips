import { describe, expect, it } from "vitest";
import {
  BAR_HEIGHT,
  BAR_ROOM,
  BAR_SHRUNK,
  BAR_SINK,
  barFoot,
  barFrame,
  barPose,
  MARK_Y,
  tabMiddle,
} from "./barShape";

/**
 * The bar this app draws on an iPhone (ADR 0233) stands where UIKit's did and shrinks as the mock
 * showed it (`docs/proposals/tab-bar-shrink-mocks.html`, B): every tab where it was, 62 points to
 * 48 and 4 lower, the names gone first, the + shrinking with it.
 */

/** An upright iPhone keeps nothing clear at its sides. */
const UPRIGHT = { left: 0, right: 0 };

describe("where the bar stands", () => {
  it("is where UIKit's stood on an iPhone 17 Pro: 288 across with the + beside it", () => {
    const frame = barFrame(402, 874, true, 4, UPRIGHT);
    expect(frame.left).toBe(21);
    expect(frame.width).toBe(288);
    expect(frame.tab).toBe(70);
    expect(frame.right).toBe(21);
  });

  it("on its side is the size it is upright, the bar at the left and the + at the right", () => {
    // An iPhone 17 Pro on its side keeps 62 points clear at either side.
    const frame = barFrame(874, 402, true, 4, { left: 62, right: 62 });
    expect(frame.width).toBe(288);
    expect(frame.tab).toBe(70);
    expect(frame.left).toBe(83);
    expect(frame.right).toBe(83);
  });

  it("runs the width of the window, less its margins, with no + beside it", () => {
    expect(barFrame(402, 874, false, 4, UPRIGHT).width).toBe(360);
  });

  it("shares its width among however many tabs there are", () => {
    expect(barFrame(402, 874, true, 5, UPRIGHT).tab).toBe(56);
  });

  it("has its foot 21 points above the window's, over the home bar", () => {
    expect(barFoot(34, false)).toBe(21);
  });

  it("on its side stands so that shrunk, its foot is on the safe area's", () => {
    const shrunk = barPose(1);
    const foot = barFoot(21, true) + BAR_HEIGHT - shrunk.lift - shrunk.glass;
    expect(foot).toBe(21);
  });

  it("on its side still clears the lists' room when shrunk", () => {
    const shrunk = barPose(1);
    const top = barFoot(21, true) + BAR_HEIGHT - shrunk.lift - 21;
    expect(top).toBeLessThanOrEqual(BAR_ROOM);
  });

  it("puts each tab's middle inside its share of the bar", () => {
    expect(tabMiddle(0, 70)).toBe(39);
    expect(tabMiddle(3, 70)).toBe(249);
  });

  it("asks a tab's list to keep clear the bar's top half and its lift", () => {
    expect(BAR_ROOM).toBe(49);
  });
});

describe("how it shrinks", () => {
  it("is itself at rest", () => {
    const rest = barPose(0);
    expect(rest.lift).toBe(0);
    expect(rest.glass).toBe(BAR_HEIGHT);
    expect(rest.mark).toBe(1);
    expect(rest.names).toBe(1);
    expect(rest.plus).toBe(1);
    expect(rest.plusY).toBe(0);
  });

  it("is 48 tall shrunk, its middle 4 points lower, and the + as tall", () => {
    const shrunk = barPose(1);
    const restMiddle = BAR_HEIGHT / 2;
    const shrunkMiddle = shrunk.lift + shrunk.glass / 2;
    expect(shrunk.glass).toBe(BAR_SHRUNK);
    expect(shrunkMiddle - restMiddle).toBe(BAR_SINK);
    expect(BAR_HEIGHT * shrunk.plus).toBeCloseTo(BAR_SHRUNK);
    expect(shrunk.plusY).toBe(BAR_SINK);
  });

  it("keeps the marks in the middle of the shrunk bar and the pill round them", () => {
    const shrunk = barPose(1);
    expect(MARK_Y + shrunk.markY).toBe(BAR_SHRUNK / 2);
    expect(BAR_HEIGHT / 2 + shrunk.pillY).toBe(BAR_SHRUNK / 2);
    expect((BAR_HEIGHT - 8) * shrunk.pill).toBeCloseTo(BAR_SHRUNK - 8);
  });

  it("lets the names go first and bring them back last", () => {
    expect(barPose(0.45).names).toBe(0);
    expect(barPose(0.2).names).toBeGreaterThan(0);
    expect(barPose(0.2).names).toBeLessThan(1);
    expect(barPose(1).names).toBe(0);
  });

  it("keeps the names whole past either end of the spring", () => {
    expect(barPose(-0.03).names).toBe(1);
    expect(barPose(1.03).names).toBe(0);
  });
});
