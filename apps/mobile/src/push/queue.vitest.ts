/**
 * The pending-decisions queue, over the `localStorage` shape the web target uses. The SQLite
 * one beside it is the same three operations against `expo-sqlite`, and is exercised on the
 * phone; what is worth testing without one is the promise the queue makes.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { PendingDecision } from "./payload.js";
import { forget, pending, remember } from "./queue.web.js";

function decision(over: Partial<PendingDecision> = {}): PendingDecision {
  return {
    approvalId: "apr_01K4ZQPX000000000000000001",
    spaceId: "spc_01K4ZQPX000000000000000002",
    runId: "run_01K4ZQPX000000000000000003",
    decision: "denied",
    at: "2026-09-08T12:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  const held = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => held.set(key, value),
      removeItem: (key: string) => held.delete(key),
    },
  });
});

describe("what is still owed to the server", () => {
  it("is nothing, until a decision is made without the app open", async () => {
    expect(await pending()).toEqual([]);
  });

  it("is what was written down, oldest first", async () => {
    const later = decision({ approvalId: "apr_2", at: "2026-09-08T13:00:00.000Z" });
    const earlier = decision({ approvalId: "apr_1", at: "2026-09-08T11:00:00.000Z" });
    await remember(later);
    await remember(earlier);
    expect((await pending()).map((one) => one.approvalId)).toEqual(["apr_1", "apr_2"]);
  });

  it("keeps the first answer to an ask, not the last", async () => {
    await remember(decision({ decision: "denied" }));
    await remember(decision({ decision: "approved" }));
    const held = await pending();
    expect(held).toHaveLength(1);
    expect(held[0]?.decision).toBe("denied");
  });

  it("loses one only when it is forgotten, and leaves the rest", async () => {
    await remember(decision({ approvalId: "apr_1" }));
    await remember(decision({ approvalId: "apr_2" }));
    await forget("apr_1");
    expect((await pending()).map((one) => one.approvalId)).toEqual(["apr_2"]);
    // Forgetting one that was never there is not an error: a drain may race a foreground.
    await forget("apr_1");
    expect(await pending()).toHaveLength(1);
  });

  it("survives what it cannot read rather than throwing at a person's decision", async () => {
    globalThis.localStorage.setItem("chips.pending-decisions", "{not json");
    expect(await pending()).toEqual([]);
    await remember(decision());
    expect(await pending()).toHaveLength(1);
  });
});

describe("a phone holding several workspaces (ADR 0197)", () => {
  it("keeps which workspace's server is owed each decision", async () => {
    await remember(decision({ deviceId: "dev_behind" }));
    expect((await pending())[0]?.deviceId).toBe("dev_behind");
  });
});
