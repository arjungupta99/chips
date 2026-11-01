/**
 * The render mode (ADR 0217): the web build made with `VITE_FILM_SOURCE=1`, which only `pnpm film`
 * makes. The films are rendered from it: a chapter plays at the window's full size, and the page
 * says which chapter plays, so the render knows where to cut.
 *
 * The page's address names what to play: `?film=watch&chapter=0`. Without the flag none of this
 * is in the build.
 */

import { type DemoState, FILMS } from "@chipschat/core";

export const FILM_SOURCE = import.meta.env["VITE_FILM_SOURCE"] === "1";

/** What the address asks the render mode to play: a chapter of a film. */
export interface FilmStart {
  readonly film: string;
  readonly from: number;
}

/** What the page's address asks for, in the render mode; nothing outside it. */
export function filmSourceStart(search: string = location.search): FilmStart | undefined {
  if (!FILM_SOURCE) return undefined;
  return startOf(search);
}

/** The address's words, read: a film by its key, and a chapter of it. */
export function startOf(search: string): FilmStart | undefined {
  const words = new URLSearchParams(search);
  if (!words.has("film")) return undefined;
  const film = FILMS.find((each) => each.key === words.get("film")) ?? FILMS[0];
  if (film === undefined) return undefined;
  const chapter = Number(words.get("chapter") ?? "0");
  const last = film.chapters.length - 1;
  const from = Number.isInteger(chapter) ? Math.min(Math.max(chapter, 0), last) : 0;
  return { film: film.key, from };
}

/**
 * The page's marks for the render: the chapter playing, or the film's end, its screen, and the act
 * of it nobody did by its moment, which fails the shot.
 */
export function markFilm(state: DemoState): void {
  if (!FILM_SOURCE) return;
  const marks = document.body.dataset;
  marks["filmChapter"] = chapterMark(state);
  marks["filmScreen"] = state.screen;
  marks["filmMissed"] = state.missed ?? "";
}

/**
 * Where the film stands, as the render reads it: `watch:5`, or `watch:end` once its last chapter
 * has played, so a shot of that chapter ends there too.
 */
export function chapterMark(state: Pick<DemoState, "film" | "chapter" | "ended">): string {
  return `${state.film}:${state.ended ? "end" : state.chapter}`;
}
