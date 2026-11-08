/**
 * A motion step read from the page is its milliseconds, in the unit the stylesheet wrote it in:
 * `tokens.css` as written, or the built apps' minified CSS, which writes `300ms` as `.3s`.
 */

import { afterEach, describe, expect, it } from "vitest";
import { motionMs } from "./motionTokens.ts";

afterEach(() => {
  document.documentElement.style.removeProperty("--motion-slow");
});

describe("motionMs", () => {
  it("reads a step written in milliseconds", () => {
    document.documentElement.style.setProperty("--motion-slow", "300ms");
    expect(motionMs("--motion-slow")).toBe(300);
  });

  it("reads a step the minifier wrote in seconds as its milliseconds", () => {
    document.documentElement.style.setProperty("--motion-slow", ".3s");
    expect(motionMs("--motion-slow")).toBe(300);
  });

  it("falls back to the design system's step when the page says none", () => {
    expect(motionMs("--motion-slow")).toBe(300);
    expect(motionMs("--motion-fast")).toBe(120);
  });
});
