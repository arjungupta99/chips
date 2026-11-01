import { describe, expect, it } from "vitest";
import {
  FIELD_BAND,
  FIELD_HEIGHT,
  FIELD_STOPS,
  FIELD_STRETCH,
  FIELD_WIDTH,
  NEAR_GLASS,
  nearGlass,
  placeField,
} from "./scrollField";

/** Where the scaled gradient band's top and bottom land, relative to the bubble's top. */
function band(viewportTop: number, viewportHeight: number, bubbleTop: number) {
  const { translateY, scaleY } = placeField(viewportTop, viewportHeight, bubbleTop);
  const middle = FIELD_HEIGHT / 2 + translateY;
  const half = (FIELD_BAND * scaleY) / 2;
  return { top: middle - half, bottom: middle + half };
}

/** Where the whole picture's top and bottom land, band and flat margins together. */
function picture(viewportTop: number, viewportHeight: number, bubbleTop: number) {
  const { translateY, scaleY } = placeField(viewportTop, viewportHeight, bubbleTop);
  const middle = FIELD_HEIGHT / 2 + translateY;
  const half = (FIELD_HEIGHT * scaleY) / 2;
  return { top: middle - half, bottom: middle + half };
}

describe("the outgoing colour field", () => {
  it("spans exactly the viewport, from its top to its bottom, whatever the bubble's place", () => {
    for (const bubbleTop of [100, 460, 812.5, 1400]) {
      const { top, bottom } = band(140, 620, bubbleTop);
      expect(top).toBeCloseTo(140 - bubbleTop, 6);
      expect(bottom).toBeCloseTo(140 + 620 - bubbleTop, 6);
    }
  });

  it("puts the violet end at the top of the glass and the teal end at its foot", () => {
    // A bubble at the very top of the viewport shows the start of the gradient at its own top.
    expect(band(140, 620, 140).top).toBeCloseTo(0, 6);
    // A bubble whose top is a viewport's height down shows the field's end at its own top.
    expect(band(140, 620, 760).top).toBeCloseTo(-620, 6);
  });

  it("hangs the flat ends well past the glass, so a placement a frame behind shows no edge", () => {
    // A bubble whose top is the glass's top: the band covers 0 to 620, the picture more.
    const { top, bottom } = picture(140, 620, 140);
    // The overrun is the same at each end, and is a good part of a screen: more than any one
    // frame of a scroll moves the bubble the glass cuts.
    expect(-top).toBeCloseTo(bottom - 620, 6);
    expect(-top).toBeGreaterThan(150);
  });

  it("scales rather than resizes: the picture keeps its drawn height and only the transform moves", () => {
    const placed = placeField(0, 500, 0);
    expect(placed.scaleY).toBeCloseTo(500 / FIELD_BAND, 6);
    expect(placed.translateY).toBeCloseTo(-250, 6);
  });

  it("is drawn a point wide and stretched past both sides of the widest bubble (18 October 2026)", () => {
    // The widest sample: a bubble at its widest (78% of the row) on a 13-inch iPad on its side,
    // 1376 points across, with the 64 points the sample runs past the bubble.
    const widest = 1376 * 0.78 + 64;
    // Scaled about its own middle, half a point in from the sample's left edge.
    const reach = (FIELD_WIDTH * FIELD_STRETCH) / 2;
    expect(FIELD_WIDTH / 2 - reach).toBeLessThan(0);
    expect(FIELD_WIDTH / 2 + reach).toBeGreaterThan(widest);
  });

  it("never scales to nothing while the viewport is unmeasured", () => {
    expect(placeField(0, 0, 0).scaleY).toBeGreaterThan(0);
  });

  it("draws the flat ends in the colours the gradient begins and ends with", () => {
    // The stops run from the picture's top to its foot, with the band's ends where the margins
    // say, and the ends given twice so what hangs past the glass is flat colour.
    expect(FIELD_STOPS.map(([offset]) => offset)).toEqual([0, 0.2, 0.5, 0.8, 1]);
    expect(FIELD_STOPS[0][1]).toBe(FIELD_STOPS[1][1]);
    expect(FIELD_STOPS[4][1]).toBe(FIELD_STOPS[3][1]);
  });

  describe("placed only near the glass (24 September 2026)", () => {
    // A glass 620 points tall, its top 140 down the page: half a glass of reach is 310 points.
    const [top, height] = [140, 620];

    it("places a bubble on the glass, and one a part of it is on", () => {
      expect(nearGlass(top, height, 400, 60)).toBe(true);
      expect(nearGlass(top, height, 100, 60)).toBe(true);
      expect(nearGlass(top, height, 740, 60)).toBe(true);
    });

    it("places a bubble up to half a glass beyond either edge, and none further", () => {
      const reach = height * NEAR_GLASS;
      // Above: the bubble's foot is what reaches towards the glass.
      expect(nearGlass(top, height, top - reach - 60, 60)).toBe(true);
      expect(nearGlass(top, height, top - reach - 61, 60)).toBe(false);
      // Below: its top.
      expect(nearGlass(top, height, top + height + reach, 60)).toBe(true);
      expect(nearGlass(top, height, top + height + reach + 1, 60)).toBe(false);
    });

    it("leaves the rest of what the list keeps mounted, screens away, where it was", () => {
      expect(nearGlass(top, height, top - 4 * height, 80)).toBe(false);
      expect(nearGlass(top, height, top + 4 * height, 80)).toBe(false);
    });

    it("reaches further than the fastest fling moves a bubble in a frame", () => {
      // Twelve thousand points a second at sixty frames is two hundred a frame.
      expect(height * NEAR_GLASS).toBeGreaterThan(12_000 / 60);
    });
  });
});
