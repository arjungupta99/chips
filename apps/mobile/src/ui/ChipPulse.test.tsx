/**
 * The chip mark's light goes on round its pins, in the web's 1500 ms, with no pause as it comes
 * round to the first again. The connection's board keeps time by the same round (`Circuit.tsx`).
 */

import { connectionPaint, ROUND } from "./ChipPulse";
import { dark, light } from "./tokens";
import { roundMs } from "./turns";

describe("the chip mark", () => {
  it("goes round in the web's 1500 ms, with no pause before the first pin comes up again", () => {
    expect(roundMs(ROUND)).toBe(1500);
  });

  it("wears the gold, its light running round, while the connection is reaching", () => {
    expect(connectionPaint("reaching", light)).toEqual({
      gold: light.gold,
      ink: light.ink3,
      lit: light.ink,
      allLit: false,
    });
  });

  it("wears its own red and green, every pin lit in a shade of the chip's colour", () => {
    // 12 November 2026, 1A: the red's grey pins all but went in the dark, and the green's pins
    // were black on dark green in the light. The bodies are the same in both themes, as the gold is.
    for (const palette of [light, dark]) {
      expect(connectionPaint("failed", palette)).toEqual({
        gold: palette.markRed,
        ink: palette.markRedPin,
        lit: palette.markRedPin,
        allLit: true,
      });
      expect(connectionPaint("back", palette)).toEqual({
        gold: palette.markGreen,
        ink: palette.markGreenPin,
        lit: palette.markGreenPin,
        allLit: true,
      });
    }
    expect([dark.markRed, dark.markGreen]).toEqual([light.markRed, light.markGreen]);
    expect(light.markRed).not.toBe(light.red);
    expect(light.markGreen).not.toBe(light.green);
  });
});
