/** Which workspace a push's answer goes to, on a phone holding several (ADR 0197). */

import type { Snapshot, Store } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import type { PendingDecision } from "./payload.js";
import { behindOf, decisionStore } from "./route.js";

/** A store whose log shows these asks answered. */
function storeOf(answered: readonly string[] = []) {
  const snapshot = {
    model: {
      spaces: [
        {
          runs: [
            {
              approvals: answered.map((approvalId) => ({ approvalId, resolved: "approved" })),
            },
          ],
        },
      ],
    },
  } as unknown as Snapshot;
  return { getSnapshot: () => snapshot } as unknown as Store;
}

const ASK: PendingDecision = {
  approvalId: "apr_1",
  spaceId: "spc_1",
  runId: "run_1",
  decision: "denied",
  at: "2026-10-18T20:00:00.000Z",
};

describe("where a decision made on the lock screen goes", () => {
  const front = storeOf();
  const behind = storeOf();
  const workspaces = {
    deviceId: "dev_front",
    storeOf: (deviceId: string) => (deviceId === "dev_behind" ? behind : undefined),
    holds: (deviceId: string) => ["dev_front", "dev_behind", "dev_muted"].includes(deviceId),
  };
  const seen = front.getSnapshot();

  it("goes through the one in front when it names it, or names none (a push from before)", () => {
    expect(decisionStore(ASK, workspaces, front, seen)).toBe(front);
    expect(decisionStore({ ...ASK, deviceId: "dev_front" }, workspaces, front, seen)).toBe(front);
  });

  it("goes through the store of a workspace behind it, without bringing that one forward", () => {
    expect(decisionStore({ ...ASK, deviceId: "dev_behind" }, workspaces, front, seen)).toBe(behind);
  });

  it("waits for one muted here, and is let go for one the phone no longer holds", () => {
    expect(decisionStore({ ...ASK, deviceId: "dev_muted" }, workspaces, front, seen)).toBe("waits");
    expect(decisionStore({ ...ASK, deviceId: "dev_gone" }, workspaces, front, seen)).toBe("gone");
  });

  it("is let go once the log it went to shows it answered", () => {
    const answered = storeOf(["apr_1"]);
    const there = { ...workspaces, storeOf: () => answered };
    expect(decisionStore({ ...ASK, deviceId: "dev_behind" }, there, front, seen)).toBe("gone");
  });
});

describe("a push from a workspace behind the one in front", () => {
  const workspaces = { deviceId: "dev_front", holds: (id: string) => id !== "dev_gone" };

  it("names it, and nothing for the one in front, one not held, or a push from before", () => {
    expect(behindOf({ device_id: "dev_behind" }, workspaces)).toBe("dev_behind");
    expect(behindOf({ device_id: "dev_front" }, workspaces)).toBeUndefined();
    expect(behindOf({ device_id: "dev_gone" }, workspaces)).toBeUndefined();
    expect(behindOf({ space_id: "spc_1" }, workspaces)).toBeUndefined();
  });
});
