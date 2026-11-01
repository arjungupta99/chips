import { DUST_MS, makeSpecks, speckAt } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import { groundAt, shaded, speckAtNow } from "./dustMath";

/** A seeded random, so a speck is the same speck every run. */
function seeded(seed = 11): () => number {
  let state = seed;
  return () => {
    state = (state * 16_807) % 2_147_483_647;
    return (state - 1) / 2_147_483_646;
  };
}

const BOX = { x: 180, y: 520, width: 230, height: 38 };

describe("the phone's dust (ADR 0167)", () => {
  it("puts every speck where core's dust does, at every moment", () => {
    const specks = makeSpecks(BOX, seeded());
    for (const t of [0, 120, 400, 700, 1100, DUST_MS]) {
      for (const speck of specks) expect(speckAtNow(speck, t, BOX)).toEqual(speckAt(speck, t, BOX));
    }
  });

  it("paints your own bubble's dust in the room's field: violet up the glass, teal at its foot", () => {
    const glass = { viewportTop: 100, viewportHeight: 700, height: 0 };
    expect(groundAt("field", { ...glass, y: 100 }, 0)).toBe("#6651a8");
    expect(groundAt("field", { ...glass, y: 450 }, 0)).toBe("#34669e");
    expect(groundAt("field", { ...glass, y: 800 }, 0)).toBe("#0b737d");
    // Past the glass, the field's ends are flat, as the field is.
    expect(groundAt("field", { ...glass, y: 2000 }, 0)).toBe("#0b737d");
    expect(groundAt("#ecece5", { ...glass, y: 450 }, 0)).toBe("#ecece5");
  });

  it("shades a ground a little either way, and leaves a colour it cannot read alone", () => {
    expect(shaded("#808080", 16)).toBe("#909090");
    expect(shaded("#ffffff", 20)).toBe("#ffffff");
    expect(shaded("rgba(0,0,0,0.5)", 10)).toBe("rgba(0,0,0,0.5)");
  });
});
