import { CONTEXT_GROUND_INDEX } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import { ICON_GROUND_NAMES } from "../ui/tokens";

/**
 * Core says each context tile's ground as the index a face's ground is sent as (ADR 0135), and the
 * web turns the same index into its colour: this keeps the index on the ground it is named for.
 */
describe("a context file's tile", () => {
  it("stands on the ground core names for it", () => {
    const named = Object.fromEntries(
      Object.entries(CONTEXT_GROUND_INDEX).map(([ground, index]) => [
        ground,
        ICON_GROUND_NAMES[index],
      ]),
    );
    expect(named).toEqual({
      blue: "Blue",
      violet: "Violet",
      green: "Green",
      sea: "Sea",
      slate: "Slate",
    });
  });
});
