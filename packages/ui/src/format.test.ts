import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatCost,
  formatDuration,
  formatRemaining,
  formatTokens,
  initials,
} from "./format.js";

describe("formatting", () => {
  it("sizes a file the way a file manager does", () => {
    expect(formatBytes(980)).toBe("980 B");
    expect(formatBytes(212_000)).toBe("212 KB");
    expect(formatBytes(1_234_567)).toBe("1.2 MB");
    expect(formatBytes(20_000_000)).toBe("20 MB");
    expect(formatBytes(0)).toBe("0 B");
  });

  it("labels every cost as an estimate", () => {
    expect(formatCost(0.04)).toBe("≈$0.04");
    expect(formatCost(1.47)).toBe("≈$1.47");
    expect(formatCost(120.4)).toBe("≈$120");
    expect(formatCost(0.001)).toBe("<$0.01");
    expect(formatCost(0)).toBe("≈$0.00");
  });

  it("writes a duration in the units a person reads", () => {
    expect(formatDuration(12_000)).toBe("12s");
    expect(formatDuration(125_000)).toBe("2m 05s");
    expect(formatDuration(4_320_000)).toBe("1h 12m");
    expect(formatDuration(-5)).toBe("0s");
  });

  it("counts down an expiry, rounding up so 59.5 minutes is still an hour away", () => {
    expect(formatRemaining(58 * 60_000)).toBe("58m");
    expect(formatRemaining(59.5 * 60_000)).toBe("1h");
    expect(formatRemaining(3 * 3_600_000)).toBe("3h");
    expect(formatRemaining(49 * 3_600_000)).toBe("2d");
    expect(formatRemaining(0)).toBe("expired");
    expect(formatRemaining(-1)).toBe("expired");
  });

  it("shortens token counts", () => {
    expect(formatTokens(820)).toBe("820");
    expect(formatTokens(12_340)).toBe("12.3k");
    expect(formatTokens(82_000)).toBe("82k");
    expect(formatTokens(200_000)).toBe("200k");
    expect(formatTokens(1_200_000)).toBe("1.2M");
  });

  it("takes two initials at most, and a hash for a channel", () => {
    expect(initials("Priya Raman")).toBe("PR");
    expect(initials("Scout")).toBe("S");
    expect(initials("Arjun Gupta Kumar")).toBe("AG");
    expect(initials("Shopping · fork")).toBe("SF");
    expect(initials("#procurement")).toBe("#");
    expect(initials("  ")).toBe("?");
    expect(initials("émile zola")).toBe("ÉZ");
  });
});
