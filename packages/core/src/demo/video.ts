/**
 * The films as videos (ADR 0217): what `pnpm film` rendered, as `assets/film/films.json` lists it,
 * each film with its beats, their times and their words. Each client imports the list through its
 * own bundler and reads it here. The chapter bar has a segment for each beat but the film's closing
 * card, its last seconds; a time says which beat plays, how far into it, and what a screen reader
 * says of the picture.
 */

import { FILMS } from "./script.js";

/** A beat of a film: its words, and where it starts and ends in the video, in seconds. */
export interface FilmBeat {
  readonly key: string;
  readonly eyebrow?: string;
  readonly line: string;
  readonly sentence?: string;
  readonly start: number;
  readonly end: number;
}

/** A film rendered to a video: its key, as the demo's films are keyed, and its beats. */
export interface FilmVideo {
  readonly key: string;
  readonly title: string;
  readonly seconds: number;
  readonly beats: readonly FilmBeat[];
}

/** The beat that closes a film: the mark and its line, after the last chapter. */
const CLOSING = "end";

/**
 * The videos in the order the demo has its films, Watch Chips work first: the list `pnpm film`
 * writes is in its beats files' order, and the players' first film and More walkthroughs follow this.
 */
export function inFilmOrder(videos: readonly FilmVideo[]): readonly FilmVideo[] {
  const at = (key: string) => {
    const index = FILMS.findIndex((film) => film.key === key);
    return index < 0 ? FILMS.length : index;
  };
  return [...videos].sort((one, other) => at(one.key) - at(other.key));
}

/** A film's video by its key; none when that film has not been rendered. */
export function videoOf(
  videos: readonly FilmVideo[],
  key: string | undefined,
): FilmVideo | undefined {
  return videos.find((each) => each.key === key);
}

/** The beats the chapter bar has a segment for: all but the closing card. */
export function chaptersOf(video: FilmVideo): readonly FilmBeat[] {
  return video.beats.filter((beat) => beat.key !== CLOSING);
}

/** The chapter playing at `time`: the last begun, or the count of them once the closing card is. */
export function chapterAt(video: FilmVideo, time: number): number {
  const chapters = chaptersOf(video);
  const last = chapters.at(-1);
  if (last !== undefined && time >= last.end) return chapters.length;
  return Math.max(
    0,
    chapters.findLastIndex((beat) => beat.start <= time),
  );
}

/** How much of a beat has played at `time`, from 0 to 1. */
export function fillOf(beat: FilmBeat, time: number): number {
  const length = beat.end - beat.start;
  if (length <= 0) return 1;
  return Math.min(1, Math.max(0, (time - beat.start) / length));
}

/** A film's length as a video player shows it, for the row that offers it: "0:47", "1:14". */
export function lengthWords(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * How far across the film, from its left, a tap goes back rather than on: a third, as a story's
 * does, since most taps are for going on (ADR 0217's addendum of 26 October).
 */
export const BACK_SIDE = 1 / 3;

/** How soon after a part begins a tap back goes to the part before it, in seconds. */
export const BACK_AGAIN = 2;

/** Where a tap on the film's right goes from `time`: the next part's start, or none on the last. */
export function nextPartAt(video: FilmVideo, time: number): number | undefined {
  return chaptersOf(video)[chapterAt(video, time) + 1]?.start;
}

/**
 * Where a tap on the film's left goes from `time`: the part playing, from its start, or the part
 * before when this one began less than `BACK_AGAIN` ago, so that a second tap goes back one. On
 * the closing card, the last part.
 */
export function backPartAt(video: FilmVideo, time: number): number {
  const chapters = chaptersOf(video);
  const at = chapterAt(video, time);
  const part = chapters[Math.min(at, chapters.length - 1)];
  if (part === undefined) return 0;
  const before = chapters[at - 1];
  if (at < chapters.length && before !== undefined && time - part.start < BACK_AGAIN) {
    return before.start;
  }
  return part.start;
}

/** What a screen reader says of the film at a beat: the words the picture shows. */
export function spokenOf(beat: FilmBeat | undefined): string {
  if (beat === undefined) return "";
  return [beat.eyebrow, beat.line, beat.sentence].filter(Boolean).join(". ");
}
