/**
 * Previous Space and Next Space (ADR 0256): one step along the list as it is drawn, from its ends
 * when nothing in it is open, and no further than either end.
 */

import { describe, expect, it } from "vitest";
import { stepSpace } from "./step";

const ORDER = ["sp_pinned", "sp_busy", "sp_quiet"];

describe("the space before and after the one open", () => {
  it("goes one along the list either way, and stops at its ends", () => {
    expect(stepSpace(ORDER, "sp_busy", 1)).toBe("sp_quiet");
    expect(stepSpace(ORDER, "sp_busy", -1)).toBe("sp_pinned");
    expect(stepSpace(ORDER, "sp_quiet", 1)).toBeUndefined();
    expect(stepSpace(ORDER, "sp_pinned", -1)).toBeUndefined();
  });

  it("starts from the top going down and from the foot going up when none in the list is open", () => {
    expect(stepSpace(ORDER, undefined, 1)).toBe("sp_pinned");
    expect(stepSpace(ORDER, undefined, -1)).toBe("sp_quiet");
    expect(stepSpace(ORDER, "sp_hidden", 1)).toBe("sp_pinned");
    expect(stepSpace([], undefined, 1)).toBeUndefined();
  });
});
