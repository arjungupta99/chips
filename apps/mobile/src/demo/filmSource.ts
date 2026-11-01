/**
 * The render mode (ADR 0217): the phone's web export built with `EXPO_PUBLIC_FILM_SOURCE=1`, which
 * only `pnpm film` makes. The films are rendered from it: a chapter plays full size, and the page
 * says which chapter plays, so the render knows where to cut.
 *
 * The page's address names what to play: `?film=watch&chapter=5` a chapter of a film, `?look=1` the
 * demo looked around, played whole. Without the flag none of this is in the build.
 */

import type { DemoState } from "@chipschat/core";
import { FILMS } from "@chipschat/core";
import { FILM_SOURCE_BUILD } from "../build";

/** Only the web export is ever built so, and only a page has a document to mark. */
export const FILM_SOURCE = FILM_SOURCE_BUILD && typeof document !== "undefined";

/** What the address asks the render mode to play. */
export interface FilmStart {
  readonly film: string;
  readonly from: number;
  /** Look around: the film played whole, then the demo kept and the stage gone. */
  readonly look: boolean;
}

// Read as the page loads, before the app's first route replaces the address.
const asked = FILM_SOURCE && typeof window !== "undefined" ? window.location.search : "";

/** What the page's address asks for, in the render mode; nothing outside it. */
export function filmSourceStart(search: string = asked): FilmStart | undefined {
  if (!FILM_SOURCE) return undefined;
  return startOf(search);
}

/** The address's words, read: a film by its key, a chapter of it, or Look around. */
export function startOf(search: string): FilmStart | undefined {
  const words = new URLSearchParams(search);
  if (!words.has("film") && !words.has("look")) return undefined;
  const film = FILMS.find((each) => each.key === words.get("film")) ?? FILMS[0];
  if (film === undefined) return undefined;
  const look = words.get("look") === "1";
  if (look) return { film: film.key, from: film.chapters.length, look };
  const chapter = Number(words.get("chapter") ?? "0");
  const last = film.chapters.length - 1;
  const from = Number.isInteger(chapter) ? Math.min(Math.max(chapter, 0), last) : 0;
  return { film: film.key, from, look };
}

/**
 * The page's marks for the render: the chapter playing, or the film's end, its screen, and the act
 * of it nobody did by its moment, which fails the shot.
 */
export function markFilm(state: DemoState | undefined): void {
  if (!FILM_SOURCE || typeof document === "undefined") return;
  const marks = document.body.dataset;
  marks["filmChapter"] = state === undefined ? "" : chapterMark(state);
  marks["filmScreen"] = state?.screen ?? "";
  marks["filmMissed"] = state?.missed ?? "";
}

/**
 * Where the film stands, as the render reads it: `watch:5`, or `watch:end` once its last chapter
 * has played, so a shot of that chapter ends there too.
 */
export function chapterMark(state: Pick<DemoState, "film" | "chapter" | "ended">): string {
  return `${state.film}:${state.ended ? "end" : state.chapter}`;
}
