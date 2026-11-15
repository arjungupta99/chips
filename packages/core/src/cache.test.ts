import { describe, expect, it } from "vitest";
import { cacheKey, earlierCacheKeys } from "./cache.js";

describe("what a device's cache is kept under (SEC-8)", () => {
  it("is the workspace and the server's host, so a server claiming the workspace id gets nothing", () => {
    expect(cacheKey({ workspaceId: "ws_1", serverUrl: "http://192.168.1.20:4431" })).toBe(
      "ws_1@192.168.1.20:4431",
    );
    expect(cacheKey({ workspaceId: "ws_1", serverUrl: "https://Chips.Example/" })).toBe(
      "ws_1@chips.example",
    );
    expect(cacheKey({ workspaceId: "ws_1", serverUrl: "http://attacker:4431" })).not.toBe(
      cacheKey({ workspaceId: "ws_1", serverUrl: "http://192.168.1.20:4431" }),
    );
  });

  it("is kept apart by what the app understands past level 1, and the earlier ones named to forget", () => {
    const device = { workspaceId: "ws_1", serverUrl: "http://192.168.1.20:4431" };
    // Level 1, this release's, keeps the key every cache already has.
    expect(cacheKey(device)).toBe("ws_1@192.168.1.20:4431");
    expect(earlierCacheKeys(device)).toEqual([]);
    expect(cacheKey(device, 3)).toBe("ws_1@192.168.1.20:4431~L3");
    expect(earlierCacheKeys(device, 3)).toEqual([
      "ws_1@192.168.1.20:4431",
      "ws_1@192.168.1.20:4431~L2",
    ]);
  });

  it("is the workspace alone for a device with no server address, whose origin is the page's", () => {
    expect(cacheKey({ workspaceId: "ws_1" })).toBe("ws_1");
    expect(cacheKey({ workspaceId: "ws_1", serverUrl: "" })).toBe("ws_1");
  });
});
