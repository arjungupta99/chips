import { describe, expect, it } from "vitest";
import { NOT_RIGHT_REASONS, notRight, notRightWords } from "./notRight.js";

describe("notRight", () => {
  it("has nothing to send until a reason is picked or words are written", () => {
    expect(notRight([], "")).toBeUndefined();
    expect(notRight([], "   \n ")).toBeUndefined();
  });

  it("puts the reasons in front of the words, as a sentence", () => {
    expect(notRight(["Missed what I asked"], " Sunday is our flight home. ")).toBe(
      "Missed what I asked. Sunday is our flight home.",
    );
    expect(notRight(["Wrong facts", "Too long"], "")).toBe("Wrong facts, Too long.");
    expect(notRight([], "It's closed on Mondays")).toBe("It's closed on Mondays");
  });

  it("offers four reasons, each short enough for a chip", () => {
    expect(NOT_RIGHT_REASONS).toHaveLength(4);
    for (const reason of NOT_RIGHT_REASONS) expect(reason.length).toBeLessThanOrEqual(20);
  });

  it("names the agent it goes to", () => {
    const words = notRightWords("Jacobian");
    expect(words.label).toBe("Not right?");
    expect(words.send).toBe("Send to Jacobian");
    expect(words.hint).toBe("Tell Jacobian, and it tries again");
  });
});
