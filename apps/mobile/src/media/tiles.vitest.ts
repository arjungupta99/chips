/**
 * The tile registry the media viewer flies from and back to, without a screen: a tile that joins
 * and leaves, one that cannot say where it is, one scrolled off the glass, and the one tile hidden
 * under the stage at a time.
 */

import type { Rect } from "@chipschat/core";
import { describe, expect, it, vi } from "vitest";
import { cornersOf, createTiles, measureView, onGlass, uncovered } from "./tiles";

const WINDOW = { width: 402, height: 874 };

function tile(rect: Rect | undefined) {
  const hidden: boolean[] = [];
  return {
    hidden,
    measure: async () => rect,
    hide: (away: boolean) => void hidden.push(away),
  };
}

describe("the tiles a viewer flies back to", () => {
  it("says where a mounted tile is, under its line and attachment, until it leaves", async () => {
    const tiles = createTiles();
    const leave = tiles.register("ln_1", "att_1", tile({ x: 16, y: 300, width: 180, height: 180 }));
    expect(await tiles.measure("ln_1", "att_1", WINDOW)).toEqual({
      x: 16,
      y: 300,
      width: 180,
      height: 180,
    });
    // The same file carried by another line is another tile.
    expect(await tiles.measure("ln_2", "att_1", WINDOW)).toBeUndefined();
    leave();
    expect(await tiles.measure("ln_1", "att_1", WINDOW)).toBeUndefined();
  });

  it("gives nothing for a tile off the glass or without a size, which is the shrink-and-fade", async () => {
    const tiles = createTiles();
    tiles.register("ln_up", "att_1", tile({ x: 16, y: -400, width: 180, height: 180 }));
    tiles.register("ln_flat", "att_2", tile({ x: 16, y: 300, width: 0, height: 0 }));
    tiles.register("ln_mute", "att_3", tile(undefined));
    expect(await tiles.measure("ln_up", "att_1", WINDOW)).toBeUndefined();
    expect(await tiles.measure("ln_flat", "att_2", WINDOW)).toBeUndefined();
    expect(await tiles.measure("ln_mute", "att_3", WINDOW)).toBeUndefined();
    expect(onGlass({ x: 390, y: 860, width: 100, height: 100 }, WINDOW)).toBe(true);
    expect(onGlass({ x: 402, y: 300, width: 100, height: 100 }, WINDOW)).toBe(false);
  });

  it("says a tile's corners as they are when asked, and nothing for a room tile's (ADR 0161)", () => {
    const tiles = createTiles();
    let corners = cornersOf(0);
    tiles.register("ln_1", "att_1", { ...tile(undefined), corners: () => corners });
    tiles.register("ln_1", "att_2", tile(undefined));
    expect(tiles.corners("ln_1", "att_1")).toEqual(cornersOf(0));
    // A delete reflows the list, and the tile is a section's corner now.
    corners = { ...cornersOf(0), topLeft: 12 };
    expect(tiles.corners("ln_1", "att_1")).toEqual({ ...cornersOf(0), topLeft: 12 });
    expect(tiles.corners("ln_1", "att_2")).toBeUndefined();
    expect(tiles.corners("ln_9", "att_9")).toBeUndefined();
  });

  it("hides one tile at a time, and shows it again when the stage moves on or closes", () => {
    const tiles = createTiles();
    const first = tile(undefined);
    const second = tile(undefined);
    tiles.register("ln_1", "att_1", first);
    tiles.register("ln_1", "att_2", second);
    tiles.hide({ lineId: "ln_1", attachmentId: "att_1" });
    tiles.hide({ lineId: "ln_1", attachmentId: "att_2" });
    tiles.hide(undefined);
    expect(first.hidden).toEqual([true, false]);
    expect(second.hidden).toEqual([true, false]);
  });

  it("hides a tile that mounts while its picture is already up, as a list scrolls it in", () => {
    const tiles = createTiles();
    tiles.hide({ lineId: "ln_far", attachmentId: "att_9" });
    const late = tile(undefined);
    tiles.register("ln_far", "att_9", late);
    expect(late.hidden).toEqual([true]);
  });

  it("takes a view that never answers, or has no size, as nowhere", async () => {
    vi.useFakeTimers();
    try {
      const silent = measureView({ measureInWindow: () => undefined });
      vi.advanceTimersByTime(200);
      expect(await silent).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
    expect(await measureView(null)).toBeUndefined();
    expect(
      await measureView({ measureInWindow: (answer) => answer(10, 20, 0, 50) }),
    ).toBeUndefined();
    expect(await measureView({ measureInWindow: (answer) => answer(10, 20, 30, 40) })).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    });
  });
});

describe("where a tile is seen, under the room's floating chrome", () => {
  const glass = { x: 0, y: 0, width: 402, height: 874 };

  it("is the glass less the bar at its head and the composer at its foot", () => {
    expect(uncovered(glass, { top: 103, bottom: 96 })).toEqual({
      x: 0,
      y: 103,
      width: 402,
      height: 675,
    });
    // A pane beside the list, with its bar above it and nothing floating: the glass itself.
    expect(uncovered({ x: 320, y: 0, width: 600, height: 800 }, { top: 0, bottom: 0 })).toEqual({
      x: 320,
      y: 0,
      width: 600,
      height: 800,
    });
  });

  it("is nothing when the chrome covers the whole of it, and never grows for a negative cover", () => {
    expect(uncovered(glass, { top: 500, bottom: 400 })).toBeUndefined();
    expect(uncovered({ x: 0, y: 0, width: 0, height: 874 }, { top: 0, bottom: 0 })).toBeUndefined();
    expect(uncovered(glass, { top: -20, bottom: Number.NaN })).toEqual(glass);
  });
});
