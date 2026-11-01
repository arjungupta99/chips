import { describe, expect, it } from "vitest";
import { LIFT_GAP, LIFT_LEAST, LIFT_SIDE, placeLift, shownOf } from "./lift";

// An iPhone 16's glass, its status bar and home indicator kept clear.
const screen = { width: 393, height: 852 };
const top = 59 + 8;
const bottom = 34 + 12;
const capsule = { width: 290, height: 62 };
const card = { width: 250, height: 240 };

describe("placeLift", () => {
  it("leaves a bubble with room around it where it is", () => {
    const bubble = { x: 52, y: 300, width: 280, height: 80 };
    const place = placeLift({ bubble, screen, top, bottom, capsule, card, side: "left" });
    expect(place.dy).toBe(0);
    expect(place.skip).toBe(0);
    expect(place.height).toBe(80);
    expect(place.capsule).toEqual({ x: 52, y: 300 - LIFT_GAP - 62 });
    expect(place.card).toEqual({ x: 52, y: 380 + LIFT_GAP });
  });

  it("moves a bubble at the foot up as far as the card needs, and no further", () => {
    const bubble = { x: 52, y: 640, width: 280, height: 90 };
    const place = placeLift({ bubble, screen, top, bottom, capsule, card, side: "left" });
    expect(place.card.y + card.height).toBe(screen.height - bottom);
    expect(place.dy).toBeLessThan(0);
    expect(place.card.y).toBe(640 + place.dy + 90 + LIFT_GAP);
  });

  it("moves a bubble under the bar down far enough for its capsule", () => {
    const bubble = { x: 52, y: 90, width: 280, height: 60 };
    const place = placeLift({ bubble, screen, top, bottom, capsule, card, side: "left" });
    expect(place.capsule?.y).toBe(top);
    expect(place.dy).toBe(top + 62 + LIFT_GAP - 90);
  });

  it("stands the capsule and the card on your bubble's trailing edge", () => {
    const bubble = { x: 150, y: 300, width: 231, height: 60 };
    const place = placeLift({ bubble, screen, top, bottom, capsule, card, side: "right" });
    expect(place.card.x + card.width).toBe(381);
    expect(place.capsule?.x).toBe(screen.width - LIFT_SIDE - capsule.width);
  });

  it("shows as much of a long reply as fits, from the part on the screen", () => {
    const bubble = { x: 52, y: -400, width: 330, height: 1100 };
    const place = placeLift({ bubble, screen, top, bottom, capsule, card, side: "left" });
    expect(place.skip).toBe(top + 400);
    const room = screen.height - top - bottom - (62 + LIFT_GAP) - (240 + LIFT_GAP);
    expect(place.height).toBe(room);
    expect(place.capsule?.y).toBe(top);
    expect(place.card.y + card.height).toBe(screen.height - bottom);
  });

  it("lifts a reply that ran up under the bar from where it was seen", () => {
    // The bar, the pinned strip and the band's ramp end at 152; the composer starts at 760.
    const seen = { top: 152, bottom: 760 };
    const bubble = { x: 52, y: -400, width: 330, height: 1100 };
    const place = placeLift({ bubble, screen, top, bottom, capsule, card, side: "left", seen });
    expect(place.skip).toBe(152 + 400);
    expect(place.capsule?.y).toBe(top);
  });

  it("keeps a little of a long reply when the menu takes nearly everything", () => {
    const bubble = { x: 52, y: 100, width: 330, height: 900 };
    const tall = { width: 250, height: 640 };
    const place = placeLift({ bubble, screen, top, bottom, capsule, card: tall, side: "left" });
    expect(place.height).toBe(LIFT_LEAST);
  });

  it("goes without a capsule for a line with no words to act on", () => {
    const bubble = { x: 52, y: 300, width: 200, height: 40 };
    const place = placeLift({
      bubble,
      screen,
      top,
      bottom,
      capsule: undefined,
      card,
      side: "left",
    });
    expect(place.capsule).toBeUndefined();
    expect(place.dy).toBe(0);
  });
});

describe("shownOf", () => {
  const seen = { top: 152, bottom: 760 };

  it("is the whole of a bubble the chrome covers none of", () => {
    expect(shownOf({ x: 52, y: 300, width: 280, height: 80 }, seen)).toEqual({
      top: 300,
      bottom: 380,
    });
  });

  it("is cut where the bar's band and the composer cover a reply that runs under both", () => {
    expect(shownOf({ x: 52, y: -400, width: 330, height: 1500 }, seen)).toEqual(seen);
  });

  it("is a line at the edge of a bubble the chrome covers whole", () => {
    expect(shownOf({ x: 52, y: 60, width: 280, height: 40 }, seen)).toEqual({
      top: 100,
      bottom: 100,
    });
    expect(shownOf({ x: 52, y: 790, width: 280, height: 40 }, seen)).toEqual({
      top: 790,
      bottom: 790,
    });
  });
});
