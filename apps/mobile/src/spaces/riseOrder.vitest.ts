import { describe, expect, it } from "vitest";
import { heldOrder, RISEN_MS } from "./riseOrder";

const row = (id: string) => ({ id });
const ids = (rows: readonly { readonly id: string }[]) => rows.map((each) => each.id);

describe("the order a workspace's rows keep while they rise", () => {
  it("keeps the rows of the first draw where they rose, though the list has swapped them", () => {
    // Foodie above India trip from the cache; the catch-up put India trip on top.
    expect(ids(heldOrder([row("india"), row("foodie")], ["foodie", "india"]))).toEqual([
      "foodie",
      "india",
    ]);
  });

  it("puts a room that came after the first draw under the rows that rose", () => {
    expect(ids(heldOrder([row("late"), row("b"), row("a")], ["a", "b"]))).toEqual([
      "a",
      "b",
      "late",
    ]);
  });

  it("keeps the rooms that came after in the list's own order", () => {
    expect(ids(heldOrder([row("y"), row("a"), row("x")], ["a"]))).toEqual(["a", "y", "x"]);
  });

  it("leaves out a row of the first draw that has gone", () => {
    expect(ids(heldOrder([row("b")], ["a", "b"]))).toEqual(["b"]);
  });

  it("is the list as it is when nothing moved", () => {
    expect(ids(heldOrder([row("a"), row("b")], ["a", "b"]))).toEqual(["a", "b"]);
  });

  it("lasts past the wave's last start and its spring's settling", () => {
    // The eighth row starts 224 ms in; the spring needs about half a second more.
    expect(RISEN_MS).toBeGreaterThanOrEqual(224 + 500);
  });
});
