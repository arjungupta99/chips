import { describe, expect, it } from "vitest";
import { emptyWords } from "./Sidebar.tsx";

describe("what the rail says with no open room (ADR 0131)", () => {
  it("says there are none only when the server has", () => {
    expect(emptyWords("none")).toBe("No spaces yet.");
    expect(emptyWords(undefined)).toBe("No spaces yet.");
  });

  it("says nothing while the cache is read, and what is happening until the server says", () => {
    expect(emptyWords("reading")).toBe("");
    expect(emptyWords("connecting")).toBe("Reaching your server…");
    // Rooms on their way get places held for them in the rail instead of words.
    expect(emptyWords("fetching")).toBe("");
    expect(emptyWords("closed")).toBe("Can't reach your server.");
    expect(emptyWords("asleep")).toBe("Can't reach your server.");
    expect(emptyWords("rejected")).toBe("This device isn't paired anymore.");
  });
});
