/**
 * The dependency advisories the security review named stay closed (SEC-18): the versions the
 * lockfile resolves for the packages concerned are at or past the fixed ones. `pnpm audit` says so
 * on the day it is run; this says so on every run, and names the package and the version when a
 * bump, or an override dropped from the root manifest, lets a vulnerable version back in.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const LOCK = readFileSync(join(REPO, "pnpm-lock.yaml"), "utf8");

/** Every version of `name` the lockfile resolves, from the keys under `packages:`. */
function resolved(name: string): string[] {
  const pattern = new RegExp(`^  ${name.replace(/[/@.]/g, (c) => `\\${c}`)}@([^:(]+)`, "gm");
  return [...LOCK.matchAll(pattern)].map((match) => match[1] as string);
}

/** Whether `version` is at or past `floor`, numerically, part by part. */
function atLeast(version: string, floor: string): boolean {
  const a = version.split(/[.-]/).map(Number);
  const b = floor.split(/[.-]/).map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const [x, y] = [a[i] ?? 0, b[i] ?? 0];
    if (x !== y) return x > y;
  }
  return true;
}

/** An advisory: the versions from `from` up to, not including, `fixed` are the vulnerable ones. */
const ADVISORIES: readonly { name: string; from: string; fixed: string; why: string }[] = [
  { name: "sharp", from: "0.0.0", fixed: "0.35.5", why: "librsvg, in the server" },
  { name: "hono", from: "0.0.0", fixed: "4.13.7", why: "hono/jsx XSS, in the server" },
  { name: "undici", from: "8.0.0", fixed: "8.10.2", why: "TLS bypass and cache poisoning" },
  { name: "devalue", from: "0.0.0", fixed: "5.9.3", why: "quadratic uneval, shared memory" },
  { name: "brace-expansion", from: "0.0.0", fixed: "1.1.20", why: "stack exhaustion" },
  { name: "brace-expansion", from: "4.0.0", fixed: "5.0.11", why: "stack exhaustion" },
  { name: "decode-uri-component", from: "0.0.0", fixed: "0.5.0", why: "DoS, in the phone bundle" },
  // The second review (25 October 2026): pages drawn on every client, and every event checked.
  { name: "markdown-it", from: "0.0.0", fixed: "15.0.3", why: "quadratic link reference (SEC-44)" },
  { name: "zod", from: "4.0.0", fixed: "4.6.6", why: "an issue per bad element (SEC-45)" },
];

describe("the advisories the review named (SEC-18)", () => {
  it("are closed in the lockfile: no version at or past the first vulnerable one and short of the fix", () => {
    for (const { name, from, fixed, why } of ADVISORIES) {
      const versions = resolved(name);
      expect(versions.length, `${name} is in the lockfile`).toBeGreaterThan(0);
      const vulnerable = versions.filter((v) => atLeast(v, from) && !atLeast(v, fixed));
      expect(vulnerable, `${name} (${why}): fixed in ${fixed}`).toEqual([]);
    }
  });

  it("compares versions by their parts, not their letters", () => {
    expect(atLeast("4.13.13", "4.13.7")).toBe(true);
    expect(atLeast("0.35.4", "0.35.5")).toBe(false);
    expect(atLeast("8.10.2", "8.10.2")).toBe(true);
  });
});
