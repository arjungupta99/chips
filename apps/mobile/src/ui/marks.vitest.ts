import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LIBRARY_FAMILIES, LIBRARY_MARKS, MARK_BOX, type Paint } from "./marks";

/**
 * The phone transcribes the design system's library rather than importing it (the phone may not
 * reach into `@chipschat/ui`), so this is what keeps them one library: the design system's file is
 * read as text, its two tables are taken out as the literals they are, and every mark here is
 * checked against the one there.
 */
const theirSource = readFileSync(
  fileURLToPath(new URL("../../../../packages/ui/src/components/face/library.ts", import.meta.url)),
  "utf8",
);

/** A literal in the design system's file, from its opening bracket to the line that closes it. */
function literal(opening: string, closing: string): unknown {
  const at = theirSource.indexOf(opening);
  if (at === -1) throw new Error(`no "${opening}" in the design system's library`);
  const from = at + opening.length - 1;
  const to = theirSource.indexOf(closing, from);
  // Plain data in our own repository — brackets, strings and numbers — so it evaluates as is.
  return new Function(`return (${theirSource.slice(from, to + 2)});`)();
}

/** The 84 names the library had before it was redrawn (21 September 2026). */
const BEFORE =
  `chip crisp cup bowl cookie donut pizza cone bottle wafer circuit antenna signal radar
  terminal cloud bolt plug battery cube rocket target flask wrench gear compass clipboard ruler
  briefcase ladder leaf tree mountain wave sun moon star flame snow drop sprout plane boat car tent
  pin globe key house door coin bank chart pie tag cart receipt palette brush music film book
  scissors sparkle frame shield lock eye flag bell bookmark heart check question alert infinity
  anchor crown bug dice hourglass magnet gem waveform`
    .split(/\s+/)
    .filter((name) => name.length > 0);

const PAINTS: readonly Paint[] = ["face", "shade", "deep", "far", "air", "cut"];

describe("the library a space picks its mark from", () => {
  it("is the design system's table, literal for literal, so the desktop wears the same face", () => {
    expect(literal("export const LIBRARY_MARKS = {", "\n} as const")).toEqual(LIBRARY_MARKS);
  });

  it("groups the marks into the design system's families, in the same order", () => {
    const opening = theirSource.indexOf("export const LIBRARY_FAMILIES");
    const bracket = theirSource.indexOf("= [", opening);
    const families = new Function(
      `return (${theirSource.slice(bracket + 2, theirSource.indexOf("\n];", bracket) + 2)});`,
    )();
    expect(families).toEqual(LIBRARY_FAMILIES);
  });

  it("keeps every name it had before, so no saved face loses its mark", () => {
    expect(BEFORE).toHaveLength(84);
    expect(BEFORE.filter((name) => !(name in LIBRARY_MARKS))).toEqual([]);
  });

  it("is twice that and a family of people: 189 marks, nine families of 21, each shown once", () => {
    const shown = LIBRARY_FAMILIES.flatMap((family) => family.marks);
    expect(Object.keys(LIBRARY_MARKS)).toHaveLength(189);
    expect(LIBRARY_FAMILIES.map((family) => family.marks.length)).toEqual(Array(9).fill(21));
    expect(new Set(shown).size).toBe(189);
    expect(Object.keys(LIBRARY_MARKS).filter((name) => !shown.includes(name as never))).toEqual([]);
  });

  it("names every mark as the wire will take it: letters only", () => {
    // `/v1/me/space-icons` stores the name, and its schema takes letters and nothing else.
    for (const name of Object.keys(LIBRARY_MARKS)) expect(name).toMatch(/^[a-zA-Z]+$/);
  });

  it("paints every layer with one of the six paints, in the 24-point box", () => {
    for (const [name, layers] of Object.entries(LIBRARY_MARKS)) {
      expect(layers.length, name).toBeGreaterThan(0);
      for (const [paint, d] of layers) {
        expect(PAINTS, name).toContain(paint);
        expect(d, name).toMatch(/^[Mm]/);
        // Coordinates far outside the box are how a transcribed mark usually goes wrong.
        for (const [, n] of d.matchAll(/(-?\d*\.?\d+)/g))
          expect(Math.abs(Number(n)), `${name}: ${d}`).toBeLessThanOrEqual(MARK_BOX * 2);
      }
    }
  });

  it("gives every mark something lit, so none is only shadow", () => {
    for (const [name, layers] of Object.entries(LIBRARY_MARKS))
      expect(
        layers.some(([paint]) => paint === "face" || paint === "shade"),
        name,
      ).toBe(true);
  });
});
