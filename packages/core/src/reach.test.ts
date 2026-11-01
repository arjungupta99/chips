import { describe, expect, it } from "vitest";
import { lostWords, serverHost } from "./reach.js";

describe("the words for where the server is and since when", () => {
  it("says a server as a person would know it", () => {
    expect(serverHost("http://100.64.0.7:4431")).toBe("100.64.0.7:4431");
    expect(serverHost("https://chips.example.com")).toBe("chips.example.com");
    expect(serverHost("")).toBeUndefined();
    expect(serverHost(undefined)).toBeUndefined();
    expect(serverHost("not a url")).toBeUndefined();
  });

  it("says how long ago in words", () => {
    const now = Date.parse("2026-10-06T20:00:00Z");
    expect(lostWords("2026-10-06T19:59:40Z", now)).toBe("just now");
    expect(lostWords("2026-10-06T19:56:00Z", now)).toBe("4 min ago");
    expect(lostWords("2026-10-06T17:00:00Z", now)).toBe("3 h ago");
    expect(lostWords("2026-10-04T18:00:00Z", now)).toBe("2 d ago");
    expect(lostWords("not a time", now)).toBe("");
  });
});
