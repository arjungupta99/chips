import { describe, expect, it } from "vitest";
import { DUST_MS, makeSpecks, SPECKS, speckAt, WIPE_MS, wipedAt } from "./dust.js";

/** A seeded random, so a speck is the same speck every run. */
function seeded(seed = 7): () => number {
  let state = seed;
  return () => {
    state = (state * 16_807) % 2_147_483_647;
    return (state - 1) / 2_147_483_646;
  };
}

const BOX = { x: 100, y: 400, width: 240, height: 40 };

describe("a message breaking into dust (ADR 0167)", () => {
  it("covers the bubble evenly with about as many specks as it asks for", () => {
    const specks = makeSpecks(BOX, seeded());
    expect(specks).toHaveLength(SPECKS);
    expect(makeSpecks({ width: 60, height: 120 }, seeded(3), 50)).toHaveLength(50);
    const left = specks.filter((speck) => speck.u < 0.5).length;
    expect(left / specks.length).toBeGreaterThan(0.4);
    expect(left / specks.length).toBeLessThan(0.6);
    // No two start in one place, which is how the phone tells them apart.
    expect(new Set(specks.map((speck) => `${speck.u}:${speck.v}`)).size).toBe(SPECKS);
  });

  it("lets a speck go as the wipe passes it, left edge first", () => {
    const specks = makeSpecks(BOX, seeded());
    for (const speck of specks) expect(speck.at).toBeGreaterThanOrEqual(speck.u * WIPE_MS);
    const first = specks.reduce((a, b) => (a.at < b.at ? a : b));
    expect(first.u).toBeLessThan(0.2);
  });

  it("draws a speck only between letting go and fading, up and to the right of where it was", () => {
    const [speck] = makeSpecks(BOX, seeded());
    if (speck === undefined) throw new Error("no speck");
    expect(speckAt(speck, speck.at - 1, BOX)).toBeUndefined();
    const later = speckAt(speck, speck.at + speck.life / 2, BOX);
    expect(later?.x).toBeGreaterThan(BOX.x + speck.u * BOX.width - 2);
    expect(later?.y).toBeLessThan(BOX.y + speck.v * BOX.height);
    expect(later?.opacity).toBeGreaterThan(0);
    expect(later?.opacity).toBeLessThan(1);
    expect(speckAt(speck, speck.at + speck.life, BOX)).toBeUndefined();
  });

  it("is all gone by the end, and the wipe has crossed by its own end", () => {
    const specks = makeSpecks(BOX, seeded());
    expect(specks.every((speck) => speckAt(speck, DUST_MS, BOX) === undefined)).toBe(true);
    expect(wipedAt(0)).toBe(0);
    expect(wipedAt(WIPE_MS / 2)).toBeCloseTo(0.5);
    expect(wipedAt(WIPE_MS)).toBe(1);
    expect(wipedAt(DUST_MS)).toBe(1);
  });
});
