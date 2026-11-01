import { describe, expect, it } from "vitest";
import { dispositionOf } from "./receipt.js";

describe("what happens to a message sent mid-run", () => {
  it("queues a plain message for the harness's next look", () => {
    expect(dispositionOf({ type: "message.post" })).toBe("queued");
  });

  it("steers with a steer or an interrupt, and queues a follow-up", () => {
    expect(dispositionOf({ type: "run.steer", mode: "steer" })).toBe("steered");
    expect(dispositionOf({ type: "run.steer", mode: "interrupt" })).toBe("steered");
    expect(dispositionOf({ type: "run.steer", mode: "followup" })).toBe("queued");
  });

  it("has nothing to say about anything else", () => {
    expect(dispositionOf({ type: "run.pause" })).toBeUndefined();
    expect(dispositionOf({ type: "approval.resolved" })).toBeUndefined();
  });
});
