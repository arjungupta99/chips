/**
 * The chip mark's light goes on round its pins, in the web's 1500 ms, with no pause as it comes
 * round to the first again. The connection's board keeps time by the same round (`Circuit.tsx`).
 */

import { ROUND } from "./ChipPulse";
import { roundMs } from "./turns";

describe("the chip mark", () => {
  it("goes round in the web's 1500 ms, with no pause before the first pin comes up again", () => {
    expect(roundMs(ROUND)).toBe(1500);
  });
});
