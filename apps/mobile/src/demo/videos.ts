/**
 * The films as videos (ADR 0217), as `pnpm film` listed them in `assets/film/films.json`. What they
 * say of a time, for the chapter bar and VoiceOver, is core's (`demo/video.ts`), as the web's is.
 */

import { type FilmVideo, inFilmOrder, videoOf } from "@chipschat/core";
import rendered from "../../../../assets/film/films.json";

/** Every film there is a video of, Watch Chips work first. */
export const VIDEOS: readonly FilmVideo[] = inFilmOrder(rendered.films);

/** A film's video by its key; none when that film has not been rendered. */
export function videoNamed(key: string | undefined): FilmVideo | undefined {
  return videoOf(VIDEOS, key);
}
