/**
 * The films the app plays were rendered from what is here now (ADR 0217): each film with beats has
 * its video, rendered from the demo's script, its beats file and what the person does
 * (`acts.json`) as they stand. A change to any fails here until `pnpm film` renders it again.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ASSETS, beatFiles, beatsOf, readFilms, sourceOf } from "./films.mjs";

interface Film {
  readonly key: string;
  readonly file: string;
  readonly seconds: number;
  readonly beats: readonly { readonly key: string; readonly start: number; readonly end: number }[];
  readonly rendered: { readonly script: string; readonly beats: string; readonly acts: string };
}

const films = readFilms().films as readonly Film[];

describe.each(beatFiles())("the film %s", (key) => {
  const film = films.find((each) => each.key === key);

  it("is rendered, and its video is here", () => {
    expect(film, `no ${key} in assets/film/films.json: run pnpm film ${key}`).toBeDefined();
    expect(existsSync(join(ASSETS, film?.file ?? ""))).toBe(true);
  });

  it("was rendered from the demo's script, its beats and its acts as they are now", () => {
    const { script, beats, acts } = film?.rendered ?? {};
    expect(
      { script, beats, acts },
      `the script, tools/film/beats/${key}.json or tools/film/acts.json changed: run pnpm film ${key}`,
    ).toEqual(sourceOf(key));
  });

  it("lists its beats end to end, as its beats file has them", () => {
    const beats = film?.beats ?? [];
    expect(beats.map((beat) => beat.key)).toEqual(
      beatsOf(key).beats.map((beat: { key: string }) => beat.key),
    );
    expect(beats[0]?.start).toBe(0);
    for (let i = 1; i < beats.length; i += 1) expect(beats[i]?.start).toBe(beats[i - 1]?.end);
    expect(beats.at(-1)?.end).toBeCloseTo(film?.seconds ?? 0, 6);
  });
});
