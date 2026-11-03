/**
 * A move on the room's transition names every value of the frame, changed or not (`wholeFrame`):
 * Reanimated merges a move into one still on its way, so a value left out went on to where the
 * earlier move sent it, and on the iPhone Duo a bubble of yours went past the right of its row
 * after Chips came back from the background. How the room moves is the simulator's to prove.
 */

import type { LayoutAnimationsValues } from "react-native-reanimated";
import { describe, expect, it } from "vitest";
import { wholeFrame } from "./roomFrame";

describe("a move on the room's transition", () => {
  it("names all four values of the frame, even when nothing changed", () => {
    const values = {
      currentOriginX: 77,
      currentOriginY: 0,
      currentWidth: 273,
      currentHeight: 76,
      targetOriginX: 77,
      targetOriginY: 0,
      targetWidth: 273,
      targetHeight: 76,
    } as LayoutAnimationsValues;
    expect(wholeFrame(values, (value, which) => [which, value])).toEqual({
      originX: ["originX", 77],
      originY: ["originY", 0],
      width: ["width", 273],
      height: ["height", 76],
    });
  });
});
