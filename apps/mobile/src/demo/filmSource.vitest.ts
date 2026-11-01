/**
 * The render mode's address (ADR 0217): what `pnpm film` asks the phone's web export to play, read
 * from the page's address.
 */

import { FILMS } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import { chapterMark, filmSourceStart, startOf } from "./filmSource";

const WHOLE = FILMS[0]?.chapters.length ?? 1;
const LAST = WHOLE - 1;

describe("the render mode's address", () => {
  it("names a chapter of a film", () => {
    expect(startOf("?film=agents&chapter=3")).toEqual({ film: "agents", from: 3, look: false });
  });

  it("names Look around: the first film played whole", () => {
    expect(startOf("?look=1")).toEqual({ film: "watch", from: WHOLE, look: true });
  });

  it("keeps a chapter inside its film, and the first film for one it has never heard of", () => {
    expect(startOf("?film=watch&chapter=99")?.from).toBe(LAST);
    expect(startOf("?film=watch&chapter=-2")?.from).toBe(0);
    expect(startOf("?film=nothing")?.film).toBe("watch");
  });

  it("asks nothing of an address that names no film", () => {
    expect(startOf("")).toBeUndefined();
    expect(startOf("?ways=1")).toBeUndefined();
  });

  it("asks nothing at all outside the render mode", () => {
    expect(filmSourceStart("?film=watch&chapter=5")).toBeUndefined();
  });

  it("marks the chapter playing, and the film's end once its last chapter has played", () => {
    expect(chapterMark({ film: "agents", chapter: 5, ended: false })).toBe("agents:5");
    expect(chapterMark({ film: "agents", chapter: 5, ended: true })).toBe("agents:end");
  });
});
