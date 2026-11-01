import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  capsule,
  columnsInView,
  dotShown,
  dotsWidth,
  edgeStrength,
  TABLE_DOT,
} from "./tableDots.js";

// The LEGO table of Riaan's development (9 October 2026) as the phone lays it out, in a 340-wide bubble.
const LEGO = [234, 50, 230, 179];
const ROOM = 340;
const MAX = 693 - ROOM;

describe("edgeStrength", () => {
  it("has no fade at an end, and all of it a little way in", () => {
    expect(edgeStrength(0)).toBe(0);
    expect(edgeStrength(14)).toBe(0.5);
    expect(edgeStrength(28)).toBe(1);
    expect(edgeStrength(400)).toBe(1);
  });

  it("takes a bounce past the end as the end", () => {
    expect(edgeStrength(-20)).toBe(0);
  });
});

describe("columnsInView", () => {
  it("shows the first two columns and a little of the third before it moves", () => {
    const { from, to } = columnsInView(LEGO, 0, ROOM);
    expect(from).toBe(0);
    expect(to).toBeCloseTo(2 + 56 / 230);
  });

  it("ends on the last column at the far end", () => {
    const { from, to } = columnsInView(LEGO, MAX, ROOM);
    expect(from).toBeCloseTo(2 + (MAX - 234 - 50) / 230);
    expect(to).toBe(4);
  });

  it("holds a bounce past either end to that end", () => {
    expect(columnsInView(LEGO, -40, ROOM)).toEqual(columnsInView(LEGO, 0, ROOM));
    expect(columnsInView(LEGO, MAX + 40, ROOM)).toEqual(columnsInView(LEGO, MAX, ROOM));
  });

  it("is the whole table when it fits", () => {
    expect(columnsInView([100, 100], 0, 300)).toEqual({ from: 0, to: 2 });
  });
});

describe("capsule", () => {
  const step = TABLE_DOT.size + TABLE_DOT.gap;

  it("covers the dots of the columns in view, edge to edge", () => {
    expect(capsule(0, 2)).toEqual({ left: 0, width: step + TABLE_DOT.size });
    expect(capsule(1, 4)).toEqual({ left: step, width: 2 * step + TABLE_DOT.size });
  });

  it("ends at the last dot's far edge with the whole table in view", () => {
    const { left, width } = capsule(0, 4);
    expect(left + width).toBe(dotsWidth(4));
  });

  it("is never less than one dot", () => {
    expect(capsule(2.4, 2.5).width).toBe(TABLE_DOT.size);
  });
});

describe("dotShown", () => {
  it("shows a dot the capsule is clear of, and none of one it covers", () => {
    const { left, width } = capsule(0, 2);
    expect(dotShown(0, left, width)).toBe(0);
    expect(dotShown(1, left, width)).toBe(0);
    expect(dotShown(2, left, width)).toBe(1);
  });

  it("fades a dot as the capsule's end comes over it, gone a third of the way across", () => {
    const step = TABLE_DOT.size + TABLE_DOT.gap;
    // The capsule's near end a ninth of the way across the third dot, then a third.
    expect(dotShown(2, 2 * step + TABLE_DOT.size * (8 / 9), 30)).toBeCloseTo(2 / 3);
    expect(dotShown(2, 2 * step + TABLE_DOT.size * (2 / 3), 30)).toBe(0);
  });
});

describe("the worklets", () => {
  it("are each declared after what they call, which is all the UI thread can see", () => {
    const source = readFileSync(new URL("./tableDots.ts", import.meta.url), "utf8");
    const at = (name: string) => source.indexOf(`function ${name}(`);
    expect(at("columnAt")).toBeLessThan(at("columnsInView"));
    expect(source.indexOf("TABLE_FADE =")).toBeLessThan(at("edgeStrength"));
    expect(source.indexOf("TABLE_DOT =")).toBeLessThan(at("capsule"));
    expect(source.indexOf("TABLE_DOT =")).toBeLessThan(at("dotShown"));
  });
});
