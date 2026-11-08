import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatCost, formatDuration, formatTokens, receiptSummary } from "./format";

/**
 * The phone transcribes these four rather than importing them, so this is what stops the two
 * drifting: each function's body is read out of the design system's own source and compared,
 * character for character, with the body here. A duration reworded on the desktop and not on the
 * phone fails this rather than shipping as two receipts telling two stories.
 */
const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), "utf8");

const MINE = read("apps/mobile/src/ui/format.ts");
const THEIRS = {
  formatDuration: read("packages/ui/src/format.ts"),
  formatCost: read("packages/ui/src/format.ts"),
  formatTokens: read("packages/ui/src/format.ts"),
  receiptSummary: read("packages/ui/src/components/receipt/receipt.tsx"),
} as const;

/** One exported function's body, by matching braces from its signature. */
function bodyOf(source: string, name: string): string {
  const at = source.indexOf(`export function ${name}(`);
  if (at === -1) throw new Error(`no ${name} to compare against`);
  const open = source.indexOf("{", source.indexOf(")", at));
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) return source.slice(open + 1, i).trim();
  }
  throw new Error(`${name} never closes`);
}

describe("the phone's formatting", () => {
  it.each(Object.keys(THEIRS))("says what the design system says for %s", (name) => {
    expect(bodyOf(MINE, name)).toBe(bodyOf(THEIRS[name as keyof typeof THEIRS], name));
  });

  it("writes the receipt's own summary line", () => {
    const steps = [{ status: "done" }, { status: "failed" }, { status: "done" }];
    expect(receiptSummary(steps, 12_000, 0.04)).toBe("≈$0.04 · 3 steps · 1 failed · 12s");
    expect(receiptSummary([{ status: "done" }])).toBe("1 step");
    expect(receiptSummary([], 3600, 0.029)).toBe("≈$0.03 · 4s");
    expect(formatDuration(125_000)).toBe("2m 05s");
    expect(formatCost(0.004)).toBe("<$0.01");
    expect(formatTokens(30_223)).toBe("30.2k");
    expect(formatTokens(232)).toBe("232");
  });
});
