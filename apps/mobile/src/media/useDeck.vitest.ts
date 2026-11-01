/**
 * Where the viewer stands when its deck changes under it: a message taken back while the viewer
 * is up (the media viewer proposal, §4.1).
 */

import type { DeckItem } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import { standing } from "./useDeck";

const item = (id: string) => ({ attachment: { id } }) as unknown as DeckItem;

describe("where the viewer stands in a deck that changed", () => {
  it("stays on its item wherever the item has moved to", () => {
    expect(standing([item("a"), item("b"), item("c")], "c", 0)).toBe(2);
  });

  it("steps to the item that took its place when its own was taken back, or the last", () => {
    expect(standing([item("a"), item("c")], "b", 1)).toBe(1);
    expect(standing([item("a")], "c", 2)).toBe(0);
  });

  it("has nowhere to stand in an empty deck, which closes the viewer", () => {
    expect(standing([], "a", 0)).toBeUndefined();
  });
});
