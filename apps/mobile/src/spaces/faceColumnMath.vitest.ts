import { describe, expect, it } from "vitest";
import {
  CROWN,
  EDGE,
  FOOT,
  faceAt,
  GAP,
  GROWTH,
  grownBy,
  liftedBy,
  middleOf,
  PAD,
  REACH_LEFT,
  SLOT,
  SPEED,
  scrollSpeed,
  shapeOf,
  WIDTH,
} from "./faceColumnMath";

// Kitchen remodel: Milo (the lead), Iris, Rook, Echo and Dana, then Everyone.
const five = shapeOf(5, undefined);

describe("shapeOf", () => {
  it("shows every face where there is no measure or room enough", () => {
    expect(five).toEqual({ faces: 5, view: 5 * SLOT, height: 5 * SLOT + FOOT + 2 * PAD, most: 0 });
    expect(shapeOf(5, 1000)).toEqual(five);
  });

  it("stops short of the room over the field, and says how far the rest can come down", () => {
    // Half of an iPhone 17's window less the field's row, as the list is held (ADR 0113).
    const crowded = shapeOf(13, 387);
    expect(crowded.height).toBe(387 - GAP - CROWN);
    expect(crowded.view).toBe(387 - GAP - FOOT - 2 * PAD - CROWN);
    expect(crowded.most).toBe(13 * SLOT - crowded.view);
  });

  it("leaves room over its top for the name, so the name stays under the room's bar", () => {
    const room = 387;
    const crowded = shapeOf(13, room);
    expect(GAP + crowded.height + CROWN).toBe(room);
    // Room for every face and the name over them: nothing is taken from the faces.
    const fits = shapeOf(5, GAP + five.height + CROWN);
    expect(fits).toEqual(five);
    expect(shapeOf(5, GAP + five.height + CROWN - 1).most).toBe(1);
  });

  it("keeps one face's room at the least", () => {
    expect(shapeOf(13, 20).view).toBe(SLOT);
  });
});

describe("faceAt", () => {
  const middle = (index: number) => middleOf(index, five, 0);

  it("finds each face at its middle, the lead at the top and Everyone at the foot", () => {
    expect([0, 1, 2, 3, 4, 5].map((index) => faceAt(middle(index), 0, five, 0))).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it("finds none under the column, over its top, or too far beside it", () => {
    expect(faceAt(PAD - 1, 0, five, 0)).toBe(-1);
    expect(faceAt(-GAP, 0, five, 0)).toBe(-1);
    expect(faceAt(five.height, 0, five, 0)).toBe(-1);
    expect(faceAt(middle(1), -(WIDTH / 2 + REACH_LEFT + 1), five, 0)).toBe(-1);
  });

  it("goes by height alone anywhere right of the column, out to the screen's edge", () => {
    expect(faceAt(middle(1), WIDTH / 2 + 90, five, 0)).toBe(1);
    // From the first face to the right edge of an iPad held sideways.
    expect(faceAt(middle(1), 1300, five, 0)).toBe(1);
    expect(faceAt(middle(4), 1300, five, 0)).toBe(4);
  });

  it("finds the faces brought down into the window", () => {
    const crowded = shapeOf(13, 387);
    const topOfView = PAD + FOOT + crowded.view - 1;
    expect(faceAt(topOfView, 0, crowded, 0)).toBeGreaterThan(0);
    expect(faceAt(topOfView, 0, crowded, crowded.most)).toBe(0);
    expect(middleOf(0, crowded, crowded.most)).toBeCloseTo(topOfView + 1 - SLOT / 2);
  });
});

describe("grownBy", () => {
  it("grows the face under the finger most, its neighbours less, and the rest not at all", () => {
    const under = grownBy(middleOf(2, five, 0), middleOf(2, five, 0), 0, five);
    const next = grownBy(middleOf(1, five, 0), middleOf(2, five, 0), 0, five);
    const far = grownBy(middleOf(0, five, 0), middleOf(4, five, 0), 0, five);
    expect(under).toBeCloseTo(1 + GROWTH);
    expect(next).toBeGreaterThan(1);
    expect(next).toBeLessThan(under);
    expect(far).toBeCloseTo(1, 2);
  });

  it("draws every face as it is once the finger has left the column", () => {
    const at = middleOf(2, five, 0);
    expect(grownBy(at, at, -(WIDTH + REACH_LEFT), five)).toBe(1);
    expect(grownBy(at, five.height + 100, 0, five)).toBe(1);
  });
});

describe("scrollSpeed", () => {
  const crowded = shapeOf(13, 387);
  const top = PAD + FOOT + crowded.view;

  it("brings the faces down under a finger held at the top, faster further in", () => {
    expect(scrollSpeed(top - EDGE, 0, crowded, 0)).toBe(0);
    expect(scrollSpeed(top - EDGE / 2, 0, crowded, 0)).toBeCloseTo(SPEED / 2);
    expect(scrollSpeed(top + 20, 0, crowded, 0)).toBe(SPEED);
  });

  it("stops once the top face is in sight, and in a room whose faces all fit", () => {
    expect(scrollSpeed(top, 0, crowded, crowded.most)).toBe(0);
    expect(scrollSpeed(PAD + FOOT + five.view, 0, five, 0)).toBe(0);
  });

  it("never brings them past the top face", () => {
    expect(liftedBy(crowded.most - 3, SPEED, 1, crowded)).toBe(crowded.most);
    expect(liftedBy(0, -SPEED, 1, crowded)).toBe(0);
  });
});
