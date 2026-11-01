/**
 * What the films were rendered from (ADR 0217). `assets/film/films.json` lists each film with its
 * beats' times and words, for the players, and the hashes of the demo's script, of the film's
 * beats file and of what the person does (`acts.json`) at its render: a test fails when any has
 * changed and the film was not rendered again.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..", "..");
export const BEATS = join(import.meta.dirname, "beats");
export const ASSETS = join(ROOT, "assets", "film");
export const FILMS_JSON = join(ASSETS, "films.json");
export const SCRIPT = join(ROOT, "packages", "core", "src", "demo", "script.ts");
export const ACTS = join(import.meta.dirname, "acts.json");

const hashOf = (file) => `sha256:${createHash("sha256").update(readFileSync(file)).digest("hex")}`;

/** The films there are beats for, by key. */
export function beatFiles() {
  return readdirSync(BEATS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

export function beatsOf(key) {
  return JSON.parse(readFileSync(join(BEATS, `${key}.json`), "utf8"));
}

/** The hashes a film rendered now would record. */
export function sourceOf(key) {
  return {
    script: hashOf(SCRIPT),
    beats: hashOf(join(BEATS, `${key}.json`)),
    acts: hashOf(ACTS),
  };
}

export function readFilms() {
  return existsSync(FILMS_JSON) ? JSON.parse(readFileSync(FILMS_JSON, "utf8")) : { films: [] };
}

/** `films.json` with one film's entry put in, in the beats files' order. */
export function withFilm(films, entry) {
  const order = beatFiles();
  const others = films.films.filter((each) => each.key !== entry.key);
  return { films: [...others, entry].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)) };
}
