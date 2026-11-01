import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BITE, BITE_DOT, bittenPath, PIN_STEP_MS, PINS, pinsOf } from "./outline";

/**
 * The phone keeps its own copy of the agent's outline (it may not reach into `@chipschat/ui`), so
 * this is what keeps the two one drawing: both files are read as text and must be the same below
 * the line that marks where the outline starts.
 */
const MARKER = "// --- the outline ---";
const below = (path: string) => {
  const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
  const at = source.indexOf(MARKER);
  if (at === -1) throw new Error(`no "${MARKER}" in ${path}`);
  return source.slice(at);
};

describe("an agent's outline", () => {
  it("is the design system's, line for line, so the desktop draws the same face", () => {
    expect(below("./outline.ts")).toBe(
      below("../../../../packages/ui/src/components/face/outline.ts"),
    );
  });

  it("is a closed path that starts and ends on the top edge, with one bite out of the top right", () => {
    const path = bittenPath(0, 0, 100);
    expect(path.startsWith("M25 0H")).toBe(true);
    expect(path.endsWith("A25 25 0 0 1 25 0Z")).toBe(true);
    // One arc curves the other way: the bite. The three corners it leaves turn in, and nothing
    // else does: the bite's points are sharp.
    expect(path.match(/ 0 0 0 /g)).toHaveLength(1);
    expect(path.match(/ 0 0 1 /g)).toHaveLength(3);
  });

  it("cuts the bite the same on both sides of the corner", () => {
    const numbers =
      bittenPath(0, 0, 100)
        .match(/-?\d+(\.\d+)?/g)
        ?.map(Number) ?? [];
    // Where the top edge stops, and where the right edge starts again: as far from the corner.
    const topStops = numbers[2] ?? 0;
    const rightStarts = bittenPath(0, 0, 100).match(/ 100 (\d+(\.\d+)?)V/)?.[1];
    expect(100 - topStops).toBeCloseTo(Number(rightStarts), 1);
    expect(100 - topStops).toBeGreaterThan(BITE.radius * 100);
  });

  it("scales and moves with its box", () => {
    expect(bittenPath(10, 20, 50).startsWith("M22.5 20H")).toBe(true);
  });

  it("has ten pins, clockwise from the top, none where the bite is", () => {
    const pins = pinsOf(100);
    expect(pins.map((pin) => pin.key)).toEqual([
      "top-left",
      "top-middle",
      "right-middle",
      "right-lower",
      "foot-right",
      "foot-middle",
      "foot-left",
      "left-lower",
      "left-middle",
      "left-upper",
    ]);
    // Out of the body by thirteen hundredths of its side, and no further.
    expect(Math.min(...pins.map((pin) => pin.x))).toBeCloseTo(-PINS.over * 100);
    expect(Math.max(...pins.map((pin) => pin.x + pin.w))).toBeCloseTo(100 + PINS.over * 100);
    expect(Math.min(...pins.map((pin) => pin.y))).toBeCloseTo(-PINS.over * 100);
    expect(Math.max(...pins.map((pin) => pin.y + pin.h))).toBeCloseTo(100 + PINS.over * 100);
    // No pin under the dot that sits in the bite: the top's are left of it, the right's below it.
    const dotLeft = (BITE_DOT.cx - BITE_DOT.r) * 100;
    const dotFoot = (BITE_DOT.cy + BITE_DOT.r) * 100;
    expect(pins.filter((pin) => pin.y < 0).every((pin) => pin.x + pin.w < dotLeft)).toBe(true);
    expect(pins.filter((pin) => pin.x > 100 - 10).every((pin) => pin.y > dotFoot)).toBe(true);
  });

  it("mirrors the top and the right, and the foot and the left, across the bite's diagonal", () => {
    const along = new Map<string, number>(PINS.at.map(([key, , at]) => [key, at]));
    const mirrors = (one: string, other: string) =>
      expect(along.get(one)).toBeCloseTo(1 - (along.get(other) ?? 0));
    mirrors("right-middle", "top-middle");
    mirrors("right-lower", "top-left");
    mirrors("left-upper", "foot-right");
    mirrors("left-middle", "foot-middle");
    mirrors("left-lower", "foot-left");
  });

  it("runs the light round the pins in a second and a half, however many there are", () => {
    expect(PIN_STEP_MS * PINS.at.length).toBe(1500);
  });
});
