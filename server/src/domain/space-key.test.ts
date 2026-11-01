import { describe, expect, it } from "vitest";
import { scopedKey, unscopedKey } from "./space-key.js";

const SCOUT = "hrn_01K4ZQPX00000000000000000S";

describe("the key a harness names a space by", () => {
  it("is stored under the harness's id, and read back as the harness gave it", () => {
    const stored = scopedKey(SCOUT, "e0d0f115", false);
    expect(stored).toBe(`${SCOUT}:e0d0f115`);
    expect(unscopedKey(SCOUT, stored)).toEqual({ key: "e0d0f115", shared: false });
  });

  it("is stored under a namespace of its own when the place is shared (ADR 0033)", () => {
    const stored = scopedKey(SCOUT, "/Users/arjun/Work/Chips", true);
    expect(stored).toBe("shared:/Users/arjun/Work/Chips");
    expect(unscopedKey(SCOUT, stored)).toEqual({ key: "/Users/arjun/Work/Chips", shared: true });
  });

  it("keeps a key whole when it carries colons of its own, or no prefix at all", () => {
    expect(unscopedKey(SCOUT, scopedKey(SCOUT, "board:42", false)).key).toBe("board:42");
    expect(unscopedKey(SCOUT, "from-before")).toEqual({ key: "from-before", shared: false });
  });
});
