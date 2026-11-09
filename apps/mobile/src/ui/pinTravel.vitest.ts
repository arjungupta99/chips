import { describe, expect, it } from "vitest";
import { drawOf, settle, travelOf } from "./pinTravel";

describe("the journey of a working face's pins", () => {
  it("settles from nought to one, going a little past on the way", () => {
    expect(settle(0)).toBeCloseTo(0, 6);
    expect(settle(1)).toBeCloseTo(1, 6);
    const most = Math.max(...Array.from({ length: 101 }, (_, k) => settle(k / 100)));
    expect(most).toBeGreaterThan(1.05);
    expect(most).toBeLessThan(1.2);
  });

  it("starts every pin hidden and ends it out, with a clock the native driver will take", () => {
    for (let index = 0; index < 12; index++) {
      const { inputRange, outputRange } = travelOf(index, 12, 10);
      expect(inputRange).toHaveLength(outputRange.length);
      expect(inputRange[0]).toBe(0);
      expect(inputRange.at(-1)).toBe(1);
      for (let k = 1; k < inputRange.length; k++) {
        expect(inputRange[k]).toBeGreaterThan(inputRange[k - 1] as number);
      }
      expect(outputRange[0]).toBeCloseTo(10, 6);
      expect(outputRange.at(-1)).toBeCloseTo(0, 6);
      expect(Math.min(...outputRange)).toBeLessThan(0);
    }
  });

  it("sends them out one after another", () => {
    const leaves = (index: number) => {
      const { inputRange, outputRange } = travelOf(index, 12, 10);
      return inputRange[outputRange.findIndex((value) => value < 10)] as number;
    };
    for (let index = 1; index < 12; index++) {
      expect(leaves(index)).toBeGreaterThan(leaves(index - 1));
    }
  });

  it("draws the face in from its full size to the size the pins leave it", () => {
    const { outputRange } = drawOf(0.9);
    expect(outputRange[0]).toBeCloseTo(1, 6);
    expect(outputRange.at(-1)).toBeCloseTo(0.9, 6);
  });
});
