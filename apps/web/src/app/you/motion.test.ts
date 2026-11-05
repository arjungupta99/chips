/**
 * Which way You's views move (ADR 0265's addendum on motion): deeper slides in, back slides out,
 * across crossfades, read off the views' paths.
 */

import { describe, expect, it } from "vitest";
import { moveOf, pathUnder } from "./motion.ts";

describe("which way a view moves", () => {
  it("goes deeper from the list to any page, and from a page to what it opens", () => {
    expect(moveOf("", "people")).toBe("deeper");
    expect(moveOf("", "attachment-caps")).toBe("deeper");
    expect(moveOf("people", "people/per_dana")).toBe("deeper");
    expect(moveOf("connection", pathUnder("connection", "go-direct-page"))).toBe("deeper");
  });

  it("goes back the same ways", () => {
    expect(moveOf("people", "")).toBe("back");
    expect(moveOf("people/per_dana", "people")).toBe("back");
    expect(moveOf("relay/relay-off-page", "relay")).toBe("back");
  });

  it("crosses between pages beside the list, and to and from Nothing open", () => {
    expect(moveOf("people", "relay")).toBe("across");
    expect(moveOf("~", "attachment-caps")).toBe("across");
    expect(moveOf("attachment-caps", "~")).toBe("across");
    // A name that only starts the same is not under it.
    expect(moveOf("people", "peoples")).toBe("across");
    expect(moveOf(undefined, "people")).toBe("across");
  });

  it("puts a form under the list's empty path by its name alone", () => {
    expect(pathUnder("", "decide-form")).toBe("decide-form");
    expect(pathUnder("relay", "relay-off-page")).toBe("relay/relay-off-page");
  });
});
