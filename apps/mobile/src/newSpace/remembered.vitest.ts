/**
 * Who took new spaces last time, kept on the phone so the + is drawn from a launch's first frame.
 * What is worth proving without a phone: that it is written down and read back, that it is one
 * workspace's and nobody else's, that it is written only when it changes, and that nonsense in the
 * row, or a row that cannot be read or written, is nothing rather than a failure.
 */

import type { Participant } from "@chipschat/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const held = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  writes: 0,
  failing: false,
}));

vi.mock("../prefs", () => ({
  SETTINGS: { appearance: "appearance", newSpace: "new-space" },
  readSetting: async (name: string) => {
    if (held.failing) throw new Error("no database");
    return held.settings.get(name);
  },
  writeSetting: async (name: string, value: string) => {
    held.writes += 1;
    if (held.failing) throw new Error("no database");
    held.settings.set(name, value);
  },
}));

const { lastAsked, loadRemembered, remember, rememberAsked, remembered } = await import(
  "./remembered.js"
);

const SCOUT: Participant = {
  id: "har_scout",
  kind: "harness",
  displayName: "Scout",
  capabilities: ["new_spaces"],
};

beforeEach(async () => {
  held.settings.clear();
  held.writes = 0;
  held.failing = false;
  await loadRemembered();
});

describe("who took new spaces last time", () => {
  it("is nobody on a phone that has never read a directory", () => {
    expect(remembered("ws_1")).toEqual([]);
  });

  it("is written down and read back at the next launch, by name only", async () => {
    remember("ws_1", [SCOUT]);
    expect(JSON.parse(held.settings.get("new-space") ?? "null")).toEqual({
      workspaceId: "ws_1",
      harnesses: [{ id: "har_scout", displayName: "Scout" }],
    });
    await loadRemembered();
    expect(remembered("ws_1")).toEqual([
      { id: "har_scout", kind: "harness", displayName: "Scout" },
    ]);
  });

  it("is one workspace's, and nothing to another", async () => {
    remember("ws_1", [SCOUT]);
    await loadRemembered();
    expect(remembered("ws_2")).toEqual([]);
  });

  it("is written only when it changes", () => {
    remember("ws_1", [SCOUT]);
    remember("ws_1", [{ ...SCOUT }]);
    expect(held.writes).toBe(1);
    remember("ws_1", []);
    expect(held.writes).toBe(2);
    expect(remembered("ws_1")).toEqual([]);
  });

  it("is nothing when the row is nonsense", async () => {
    for (const row of [
      "{not json",
      "7",
      "null",
      JSON.stringify({ workspaceId: 1, harnesses: [] }),
      JSON.stringify({ workspaceId: "ws_1", harnesses: "Scout" }),
      JSON.stringify({ workspaceId: "ws_1", harnesses: [null] }),
      JSON.stringify({ workspaceId: "ws_1", harnesses: [{ id: "har_scout" }] }),
      JSON.stringify({ workspaceId: "ws_1", harnesses: [{ displayName: "Scout" }] }),
    ]) {
      held.settings.set("new-space", row);
      await loadRemembered();
      expect(remembered("ws_1")).toEqual([]);
    }
  });

  it("is nothing when the row cannot be read, and a write that fails is shrugged off", async () => {
    remember("ws_1", [SCOUT]);
    held.failing = true;
    await loadRemembered();
    expect(remembered("ws_1")).toEqual([]);
    remember("ws_1", [SCOUT]);
    await Promise.resolve();
    expect(remembered("ws_1")).toHaveLength(1);
  });

  it("keeps who was asked last beside them, through a launch and a directory's change (ADR 0084)", async () => {
    remember("ws_1", [SCOUT]);
    expect(lastAsked("ws_1")).toBeUndefined();
    rememberAsked("ws_1", "har_scout");
    await loadRemembered();
    expect(lastAsked("ws_1")).toBe("har_scout");
    expect(remembered("ws_1")).toHaveLength(1);
    // The directory says something new; who was asked last stays.
    remember("ws_1", []);
    expect(lastAsked("ws_1")).toBe("har_scout");
    // Another workspace's is not this one's.
    expect(lastAsked("ws_2")).toBeUndefined();
    held.settings.set(
      "new-space",
      JSON.stringify({ workspaceId: "ws_1", harnesses: [], lastAsked: 7 }),
    );
    await loadRemembered();
    expect(lastAsked("ws_1")).toBeUndefined();
  });
});
