import { describe, expect, it } from "vitest";
import { ownsHarness } from "./ownership.js";

const arjun = { kind: "person" as const, participantId: "usr_1", workspaceId: "ws_1" };
const scout = { kind: "harness" as const, owner_id: "usr_1" };

describe("who holds a harness's tokens", () => {
  it("is the person who owns it", () => {
    expect(ownsHarness(arjun, scout)).toBe(true);
  });

  it("is not another person in the workspace, unless they run it as its owner or an admin (M5.2)", () => {
    expect(ownsHarness({ ...arjun, participantId: "usr_2" }, scout)).toBe(false);
    expect(ownsHarness({ ...arjun, participantId: "usr_2", role: "member" }, scout)).toBe(false);
    expect(ownsHarness({ ...arjun, participantId: "usr_2", role: "guest" }, scout)).toBe(false);
    expect(ownsHarness({ ...arjun, participantId: "usr_2", role: "owner" }, scout)).toBe(true);
    expect(ownsHarness({ ...arjun, participantId: "usr_2", role: "admin" }, scout)).toBe(true);
  });

  it("is never a harness, not even of itself", () => {
    const itself = { kind: "harness" as const, participantId: "hrn_1", workspaceId: "ws_1" };
    expect(ownsHarness(itself, scout)).toBe(false);
  });

  it("is nobody, for a harness that is not there or is not a harness", () => {
    expect(ownsHarness(arjun, undefined)).toBe(false);
    expect(ownsHarness(arjun, { kind: "person", owner_id: "usr_1" })).toBe(false);
  });

  it("is nobody, for a harness with no owner", () => {
    expect(ownsHarness(arjun, { kind: "harness", owner_id: null })).toBe(false);
  });
});
