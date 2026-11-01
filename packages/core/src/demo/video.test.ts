/**
 * The films as videos (ADR 0217), read for the players' chapter bar: a segment a beat but for the
 * closing card, which beat a time is in and how far, and the words a screen reader says. The list
 * itself, `assets/film/films.json`, is held to the beats files by `tools/film/films.test.ts`.
 */

import { describe, expect, it } from "vitest";
import {
  BACK_AGAIN,
  backPartAt,
  chapterAt,
  chaptersOf,
  type FilmVideo,
  fillOf,
  inFilmOrder,
  lengthWords,
  nextPartAt,
  spokenOf,
  videoOf,
} from "./video.js";

const FILM: FilmVideo = {
  key: "watch",
  title: "Watch Chips work",
  seconds: 20,
  beats: [
    { key: "computer", eyebrow: "Your computer", line: "On your computer", start: 0, end: 5 },
    {
      key: "spaces",
      eyebrow: "Spaces",
      line: "Every job gets its own space",
      sentence: "Each conversation keeps to its own room.",
      start: 5,
      end: 12,
    },
    { key: "search", eyebrow: "Search", line: "Find what was said", start: 12, end: 17 },
    { key: "end", line: "Chat with your AI agents", start: 17, end: 20 },
  ],
};

describe("a film's video", () => {
  it("is found by the demo's own key, and none it has not rendered", () => {
    expect(videoOf([FILM], "watch")).toBe(FILM);
    expect(videoOf([FILM], "agents")).toBeUndefined();
    expect(videoOf([FILM], undefined)).toBeUndefined();
  });

  it("comes in the order the demo has its films, Watch Chips work first", () => {
    const named = (key: string) => ({ ...FILM, key });
    const listed = [named("agents"), named("trouble"), named("watch"), named("later")];
    expect(inFilmOrder(listed).map((each) => each.key)).toEqual([
      "watch",
      "agents",
      "trouble",
      "later",
    ]);
  });

  it("has a segment a beat, and none for the closing card", () => {
    expect(chaptersOf(FILM).map((beat) => beat.key)).toEqual(["computer", "spaces", "search"]);
  });

  it("says which beat plays at a time, and past them all once the closing card is up", () => {
    expect(chapterAt(FILM, 0)).toBe(0);
    expect(chapterAt(FILM, 4.96)).toBe(0);
    expect(chapterAt(FILM, 5)).toBe(1);
    // A jump to a part can land a frame short of its start, and that is the part.
    expect(chapterAt(FILM, 5 - 1 / 60)).toBe(1);
    expect(chapterAt(FILM, 12)).toBe(2);
    expect(chapterAt(FILM, 17)).toBe(3);
    expect(chapterAt(FILM, 20)).toBe(3);
  });

  it("fills a beat's segment from its start to its end", () => {
    const [, spaces] = chaptersOf(FILM);
    if (spaces === undefined) throw new Error("No second beat.");
    expect(fillOf(spaces, 4)).toBe(0);
    expect(fillOf(spaces, 5)).toBe(0);
    expect(fillOf(spaces, 8.5)).toBe(0.5);
    expect(fillOf(spaces, 12)).toBe(1);
    expect(fillOf(spaces, 30)).toBe(1);
    expect(fillOf({ key: "still", line: "", start: 3, end: 3 }, 0)).toBe(1);
  });

  it("is offered by its length, as a video player shows one", () => {
    expect(lengthWords(FILM.seconds)).toBe("0:20");
    expect(lengthWords(47.48)).toBe("0:47");
    expect(lengthWords(73.73)).toBe("1:14");
    expect(lengthWords(119.6)).toBe("2:00");
    expect(lengthWords(0)).toBe("0:00");
  });

  it("goes on a part from a tap on its right, and has nowhere to go from the last", () => {
    expect(nextPartAt(FILM, 0)).toBe(5);
    expect(nextPartAt(FILM, 7)).toBe(12);
    expect(nextPartAt(FILM, 12.5)).toBeUndefined();
    // Just after a jump to the last part, said a frame short: still the last, nowhere to go.
    expect(nextPartAt(FILM, 12 - 1 / 60)).toBeUndefined();
    // The closing card is past every part.
    expect(nextPartAt(FILM, 18)).toBeUndefined();
  });

  it("goes back to a part's start from a tap on its left, and to the part before soon after", () => {
    // Well into Spaces: Spaces again, from its start.
    expect(backPartAt(FILM, 9)).toBe(5);
    // Just begun, as after that first tap: the part before.
    expect(backPartAt(FILM, 5)).toBe(0);
    expect(backPartAt(FILM, 5 + BACK_AGAIN - 0.01)).toBe(0);
    expect(backPartAt(FILM, 5 + BACK_AGAIN)).toBe(5);
    // The first part has none before it.
    expect(backPartAt(FILM, 0.5)).toBe(0);
    // The closing card: the last part, from its start.
    expect(backPartAt(FILM, 18)).toBe(12);
  });

  it("is spoken at a beat as its picture's words", () => {
    expect(spokenOf(chaptersOf(FILM)[1])).toBe(
      "Spaces. Every job gets its own space. Each conversation keeps to its own room.",
    );
    expect(spokenOf(FILM.beats[3])).toBe("Chat with your AI agents");
    expect(spokenOf(undefined)).toBe("");
  });
});
