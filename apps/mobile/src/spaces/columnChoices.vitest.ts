import { describe, expect, it } from "vitest";
import type { Choice } from "./choice";
import { columnOf, footOf, MORE_WORDS } from "./columnChoices";
import { CROWN, FOOT, GAP, PAD, SLOT } from "./faceColumnMath";

const face = (id: string, extra: Partial<Choice> = {}): Choice => ({
  ids: [id],
  pick: [id],
  name: id,
  ...extra,
});
const people = (ids: string[]): Choice => ({ ids, pick: "people", name: "People" });
const everyone = (ids: string[]): Choice => ({ ids, pick: "all", name: "Everyone" });

/** A room's choices: its agents (the first the lead), its people, then People and Everyone. */
function room(agents: number, folks: number): Choice[] {
  const a = Array.from({ length: agents }, (_, i) => face(`a${i}`, { agent: true, lead: i === 0 }));
  const p = Array.from({ length: folks }, (_, i) => face(`p${i}`));
  const ids = [...a, ...p].flatMap((choice) => choice.ids);
  return [...a, ...p, people(p.flatMap((c) => c.ids)), everyone(ids)];
}

/** The room over the field for `slots` faces over People and Everyone. */
const roomFor = (slots: number) => GAP + FOOT + SLOT + 2 * PAD + CROWN + slots * SLOT;

describe("footOf", () => {
  it("counts the groups at the end", () => {
    expect(footOf(room(2, 3))).toBe(2);
    expect(footOf([face("a"), everyone(["a"])])).toBe(1);
    expect(footOf([face("a")])).toBe(0);
  });
});

describe("columnOf (ADR 0229's addendum of 18 November 2026)", () => {
  it("is the whole room where every face fits, or before the field is measured", () => {
    const dinner = room(2, 3);
    expect(columnOf(dinner, [], undefined)).toBe(dinner);
    expect(columnOf(dinner, [], roomFor(5))).toBe(dinner);
  });

  it("is All, the lead, the latest talked with in the list's order, and the groups, where they don't", () => {
    const street = room(6, 44);
    const column = columnOf(street, ["p7", "a3", "p30", "p2", "a5"], roomFor(6));
    expect(column.map((choice) => choice.name)).toEqual([
      "All 50",
      "a0",
      "a3",
      "p2",
      "p7",
      "p30",
      "People",
      "Everyone",
    ]);
    const [all] = column;
    expect(all?.more).toBe(true);
    expect(all?.under).toBe(MORE_WORDS);
    expect(all?.ids).toHaveLength(50);
  });

  it("fills with the room's own order where few have talked", () => {
    const column = columnOf(room(6, 44), [], roomFor(4));
    expect(column.map((choice) => choice.name)).toEqual([
      "All 50",
      "a0",
      "a1",
      "a2",
      "People",
      "Everyone",
    ]);
  });

  it("keeps All and one face however little room there is", () => {
    const column = columnOf(room(6, 44), ["p9"], 10);
    expect(column.map((choice) => choice.name)).toEqual(["All 50", "a0", "People", "Everyone"]);
  });
});
