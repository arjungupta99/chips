/**
 * A bundle's public values are part of every key in Metro's cache (`apps/mobile/metro.config.js`,
 * ADR 0085's addendum of 2 November 2026). Without them, a module's transform made with one
 * build's values was taken by another's: two archives made at once from two checkouts left a
 * TestFlight build of main saying release-1.0's commit on You → Version.
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CONFIG = fileURLToPath(new URL("../../apps/mobile/metro.config.js", import.meta.url));
const load = createRequire(CONFIG);

/** The config's `cacheVersion`, loaded afresh with these variables set and then put back. */
function cacheVersionWith(env: Readonly<Record<string, string>>): string {
  const before = new Map(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  try {
    delete load.cache[CONFIG];
    return (load(CONFIG) as { readonly cacheVersion: string }).cacheVersion;
  } finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("Metro's cache key", () => {
  it("differs for two builds stamped with two commits", () => {
    expect(cacheVersionWith({ EXPO_PUBLIC_CHIPS_COMMIT: "05dcb639" })).not.toBe(
      cacheVersionWith({ EXPO_PUBLIC_CHIPS_COMMIT: "98777fde" }),
    );
  });

  it("differs when a switch the bundle reads is on", () => {
    expect(cacheVersionWith({ EXPO_PUBLIC_CHIPS_FEEDBACK: "1" })).not.toBe(cacheVersionWith({}));
    expect(cacheVersionWith({ EXPO_PUBLIC_FILM_SOURCE: "1" })).not.toBe(cacheVersionWith({}));
  });

  it("stays the same for the same values, so a build of one commit still uses the cache", () => {
    const stamp = { EXPO_PUBLIC_CHIPS_COMMIT: "05dcb639", EXPO_PUBLIC_CHIPS_FEEDBACK: "1" };
    expect(cacheVersionWith(stamp)).toBe(cacheVersionWith({ ...stamp }));
  });

  it("leaves out what the bundle never sees", () => {
    expect(cacheVersionWith({ CHIPS_NOT_PUBLIC: "x" })).toBe(cacheVersionWith({}));
  });
});
