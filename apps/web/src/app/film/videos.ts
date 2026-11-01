/**
 * The films as videos (ADR 0217), as `pnpm film` listed them in `assets/film/films.json`, and each
 * video's address in the build Vite makes. What they say of a time, for the chapter bar and a
 * screen reader, is core's (`demo/video.ts`), as the phone's is.
 */

import { type FilmVideo, inFilmOrder, videoOf } from "@chipschat/core";
import agents from "../../../../../assets/film/agents.mp4";
import rendered from "../../../../../assets/film/films.json";
import trouble from "../../../../../assets/film/trouble.mp4";
import watch from "../../../../../assets/film/watch.mp4";

/** Every film there is a video of, Watch Chips work first. */
export const VIDEOS: readonly FilmVideo[] = inFilmOrder(rendered.films);

/** Where each video is in the build, by film: Vite emits each one named here. */
export const SOURCES: Readonly<Record<string, string>> = { watch, agents, trouble };

/** A film's video by its key; none when that film has not been rendered. */
export function videoNamed(key: string | undefined): FilmVideo | undefined {
  return videoOf(VIDEOS, key);
}
