/** Which of Search's rows arrive after a change, and in what order (ADR 0189). */

import { describe, expect, it } from "vitest";
import { arrivalDelay, SEARCH_ARRIVAL, searchArrivals } from "./searchArrival.js";
import type { SearchItem } from "./searchResults.js";
import { springCurve } from "./viewer.js";

const heading = (title: string): SearchItem => ({
  kind: "heading",
  key: `heading:${title.toLowerCase()}`,
  title,
});
const recent = (text: string, first = false): SearchItem => ({
  kind: "recent",
  key: `recent:${text}`,
  text,
  first,
});
const ghost = (n: number): SearchItem => ({
  kind: "placeholder",
  key: `placeholder:${n}`,
  first: n === 1,
});
const keyed = (key: string): SearchItem => ({ kind: "fetching", key });

describe("searchArrivals", () => {
  it("lets nothing arrive on the first draw", () => {
    expect(searchArrivals(undefined, [heading("Spaces"), keyed("space:a")]).size).toBe(0);
  });

  it("lets nothing arrive when the same rows are listed again", () => {
    const rows = [heading("Spaces"), keyed("space:a"), keyed("space:b")];
    expect(searchArrivals(rows, [...rows]).size).toBe(0);
  });

  it("numbers the rows that arrive down the list, past the rows that stay", () => {
    const before = [heading("Spaces"), keyed("space:a"), heading("Messages"), ghost(1), ghost(2)];
    const after = [
      heading("Spaces"),
      keyed("space:a"),
      keyed("space:b"),
      heading("Messages"),
      keyed("message:line:1"),
      keyed("message:line:2"),
    ];
    expect([...searchArrivals(before, after)]).toEqual([
      ["space:b", 0],
      ["message:line:1", 1],
      ["message:line:2", 2],
    ]);
  });

  it("lets every row arrive when the recent searches give way to results", () => {
    const before = [{ kind: "recents", key: "recents" } as const, recent("garage", true)];
    const after = [heading("Spaces"), keyed("space:a")];
    expect([...searchArrivals(before, after).keys()]).toEqual(["heading:spaces", "space:a"]);
  });

  it("gives the rows past the wave's length the last place in it", () => {
    const after = Array.from({ length: 12 }, (_, at) => keyed(`message:line:${at}`));
    const orders = [...searchArrivals([], after).values()];
    const last = SEARCH_ARRIVAL.staggered - 1;
    expect(orders.slice(0, SEARCH_ARRIVAL.staggered)).toEqual(
      Array.from({ length: SEARCH_ARRIVAL.staggered }, (_, at) => at),
    );
    expect(orders.slice(SEARCH_ARRIVAL.staggered)).toEqual([last, last, last, last]);
  });

  it("starts each place in the wave a beat after the one above it", () => {
    expect(arrivalDelay(0)).toBe(0);
    expect(arrivalDelay(3)).toBe(3 * SEARCH_ARRIVAL.staggerMs);
  });

  it("has the whole wave up before half a second is out, and landed by three quarters", () => {
    const { staggered, fadeMs, spring } = SEARCH_ARRIVAL;
    const last = arrivalDelay(staggered - 1);
    expect(last + fadeMs).toBeLessThan(500);
    expect(last + springCurve(spring).ms).toBeLessThan(750);
  });
});
