import { describe, expect, it } from "vitest";
import { isNoReply, NO_REPLY } from "./no-reply.js";

describe("NO_REPLY (ADR 0105)", () => {
  it("is the word alone, however a model dresses it", () => {
    for (const text of [NO_REPLY, " NO_REPLY\n", "`NO_REPLY`", "**NO_REPLY**", '"NO_REPLY".']) {
      expect(isNoReply(text), text).toBe(true);
    }
  });

  it("is never words that say something besides, or say it in passing", () => {
    for (const text of ["", "no_reply", "NO_REPLY needed here", "Done. NO_REPLY", "NO_REPLY_YET"]) {
      expect(isNoReply(text), text).toBe(false);
    }
    expect(isNoReply(undefined)).toBe(false);
  });
});
