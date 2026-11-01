/**
 * The sums behind the room's glass. What they cannot say is what any of it looks like — that is
 * the phone's, and the walk's — but a gradient stop outside nought and one draws differently on
 * every renderer, and a colour built wrong is a capsule that is black.
 */

import { describe, expect, it } from "vitest";
import { alpha, fadeStop, GLASS, intensityFor, solidStop } from "./glassDial";

describe("where a band stops being solid", () => {
  it("gives the chrome its full blur and the ramp the fade", () => {
    // A bar of 96 points with a 16-point ramp: five sixths solid, and the rest the fade.
    expect(solidStop(96 + 16, 16)).toBeCloseTo(96 / 112, 5);
    expect(solidStop(96 + GLASS.rampTop, GLASS.rampTop)).toBeCloseTo(96 / (96 + GLASS.rampTop), 5);
  });

  it("is all fade when the ramp is the whole band", () => {
    expect(solidStop(16, 16)).toBe(0);
  });

  it("is a hard edge when there is no ramp at all", () => {
    expect(solidStop(64, 0)).toBe(1);
  });

  it("stays inside nought and one however the chrome is measured", () => {
    // A ramp longer than the band — a room whose chrome has not laid itself out yet — and a band
    // of no height at all, which is the same room one frame earlier.
    expect(solidStop(4, 40)).toBe(0);
    expect(solidStop(0, 16)).toBe(0);
    expect(solidStop(-10, 16)).toBe(0);
  });
});

describe("where each pane of a band has faded", () => {
  it("takes the bar's material part of the way down the ramp, and the thin one all of it", () => {
    // Solid to three quarters: the ramp is the last quarter, and the material is gone at 0.45 of it.
    expect(fadeStop(0.75, GLASS.thickReach)).toBeCloseTo(0.75 + 0.25 * GLASS.thickReach, 5);
    expect(fadeStop(0.75, 1)).toBe(1);
  });

  it("never fades before the solid part ends, nor past the band", () => {
    expect(fadeStop(0.9, 0)).toBe(0.9);
    expect(fadeStop(0.5, 3)).toBe(1);
    expect(fadeStop(-1, 0.5)).toBe(0.5);
  });
});

describe("the blur, as a material's intensity", () => {
  it("carries the dial's own number", () => {
    expect(intensityFor(GLASS.blur)).toBe(30);
  });

  it("stays inside what the prop takes, however far the dial is pushed", () => {
    expect(intensityFor(0)).toBe(1);
    expect(intensityFor(400)).toBe(100);
  });
});

describe("a colour at an opacity", () => {
  it("reads a palette's hex", () => {
    expect(alpha("#ffffff", GLASS.capsule)).toBe("rgba(255,255,255,0.4)");
    expect(alpha("#0f1013", GLASS.scrim)).toBe("rgba(15,16,19,0.02)");
  });

  it("does not mind whether the hash is there", () => {
    expect(alpha("191b20", 1)).toBe(alpha("#191b20", 1));
  });
});
