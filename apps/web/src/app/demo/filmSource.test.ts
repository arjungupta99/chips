/**
 * The render mode's address (ADR 0217): what `pnpm film` asks the web build to play, read from the
 * page's address.
 */

import { FILMS } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import { chapterMark, filmSourceStart, startOf } from "./filmSource.ts";

const LAST = (FILMS[0]?.chapters.length ?? 1) - 1;

describe("the render mode's address", () => {
  it("names a chapter of a film", () => {
    expect(startOf("?film=agents&chapter=3")).toEqual({ film: "agents", from: 3 });
  });

  it("keeps a chapter inside its film, and the first film for one it has never heard of", () => {
    expect(startOf("?film=watch&chapter=99")?.from).toBe(LAST);
    expect(startOf("?film=watch&chapter=-2")?.from).toBe(0);
    expect(startOf("?film=nothing")?.film).toBe("watch");
  });

  it("asks nothing of an address that names no film", () => {
    expect(startOf("")).toBeUndefined();
  });

  it("asks nothing at all outside the render mode", () => {
    expect(filmSourceStart("?film=watch&chapter=0")).toBeUndefined();
  });

  it("marks the chapter playing, and the film's end once its last chapter has played", () => {
    expect(chapterMark({ film: "agents", chapter: 5, ended: false })).toBe("agents:5");
    expect(chapterMark({ film: "agents", chapter: 5, ended: true })).toBe("agents:end");
  });
});
