/**
 * The films as videos on the phone (ADR 0217): the list Metro bundles from `films.json`, each with
 * its video beside it, found by the demo's own key. What a time says of a film is core's, tested
 * there (`demo/video.test.ts`).
 */

import { existsSync } from "node:fs";
import { chaptersOf } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import rendered from "../../../../assets/film/films.json";
import { VIDEOS, videoNamed } from "./videos";

describe("the films rendered", () => {
  it("have their videos beside the list", () => {
    for (const film of rendered.films) {
      expect(existsSync(new URL(`../../../../assets/film/${film.file}`, import.meta.url))).toBe(
        true,
      );
    }
  });

  it("name a film by the demo's own key, and none it has not rendered", () => {
    expect(videoNamed("watch")?.title).toBe("Watch Chips work");
    expect(videoNamed("nothing")).toBeUndefined();
    expect(VIDEOS.map((each) => each.key)).toContain("watch");
  });

  it("give the first film a segment for each of its eight beats", () => {
    const watch = videoNamed("watch");
    if (watch === undefined) throw new Error("Watch Chips work has no video.");
    expect(chaptersOf(watch)).toHaveLength(8);
  });
});
