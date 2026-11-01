import { describe, expect, it } from "vitest";
import { readTaskBubble } from "./taskWords.js";

/**
 * The strings here are the ones Jacobian sends — its own tests assert them
 * (`tests/unit/channels/chips/task-bubble.test.ts`) — and the ones a room is full of otherwise.
 */
describe("a queued turn's message", () => {
  it("reads what it is thinking and what it has called", () => {
    expect(
      readTaskBubble("💭 Preparing tool call for app start\n▸ local-dev__serve · stop"),
    ).toEqual({
      headline: undefined,
      thought: "Preparing tool call for app start",
      steps: ["local-dev__serve · stop"],
      stuck: undefined,
      worked: undefined,
    });
  });

  it("reads the receipt the turn ends as, and holds no thought in it", () => {
    const read = readTaskBubble("💭 Worked 25s · 2 steps");
    expect(read?.worked).toBe("Worked 25s · 2 steps");
    expect(read?.thought).toBeUndefined();
    expect(read?.steps).toEqual([]);
  });

  it("keeps the question above the work, in the bubble and in the receipt", () => {
    const asked = "❓ Engineer asks: Deny and reopen?";
    expect(readTaskBubble(`${asked}\n💭 Worked 40s · 1 step`)?.headline).toBe(asked);
    expect(readTaskBubble(`${asked}\n💭 Working…\n▸ read_file`)?.headline).toBe(asked);
  });

  it("keeps every call in the order they were made, and the pulse on its own", () => {
    const read = readTaskBubble("💭 Working…\n▸ one\n▸ two\n▸ three\n⏳ waiting on the build");
    expect(read?.steps).toEqual(["one", "two", "three"]);
    expect(read?.stuck).toBe("waiting on the build");
  });

  it("is nothing for a message that is not one", () => {
    expect(
      readTaskBubble("Restarted successfully. The latest landed build is open."),
    ).toBeUndefined();
    expect(readTaskBubble("")).toBeUndefined();
    // A thought with nothing after it says nothing, and an empty bubble is worse than the text.
    expect(readTaskBubble("💭")).toBeUndefined();
    expect(readTaskBubble("💭   ")).toBeUndefined();
  });

  it("gives up on a message that only looks like one", () => {
    // A line that is neither a call nor a pulse means this is prose that opened with an emoji.
    expect(readTaskBubble("💭 Working…\n▸ serve\nand then I stopped")).toBeUndefined();
    expect(readTaskBubble("▸ serve\n💭 Working…")).toBeUndefined();
  });

  it("reads a turn that has thought and not yet called anything", () => {
    expect(readTaskBubble("💭 Working…")?.steps).toEqual([]);
  });
});
