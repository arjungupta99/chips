import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UNDER_A_BAR } from "./bars";

/**
 * A pushed screen's bar is declared with the stack, never turned on by the screen after it has
 * been pushed (`bars.ts`): turned on late, it was drawn over the top of an agent's card some of
 * the times the card opened (2 October 2026). So every route that names itself in a bar is on the
 * list, and none turns its own bar on, but the room, whose bar floats.
 */

const APP = fileURLToPath(new URL("../../app", import.meta.url));
const FLOATS = new Set(["spaces/[id]"]);

/** The root stack's routes, by the names the router gives them: their paths under `app/`. */
function routes(dir = APP): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name.startsWith("(") ? [] : routes(path);
    if (!entry.name.endsWith(".tsx") || entry.name.startsWith("_")) return [];
    return [relative(APP, path).replace(/\.tsx$/, "")];
  });
}

const source = (route: string) => readFileSync(join(APP, `${route}.tsx`), "utf8");

describe("which pushed screens stand under a bar", () => {
  it("lists every route that names itself in a bar", () => {
    const named = routes().filter((route) => /<Stack\.Screen\b/.test(source(route)));
    expect(named.filter((route) => !UNDER_A_BAR.has(route) && !FLOATS.has(route))).toEqual([]);
  });

  it("lets no screen but the room turn its bar on after it has been pushed", () => {
    const late = routes().filter((route) => /headerShown:\s*true/.test(source(route)));
    expect(late.filter((route) => !FLOATS.has(route))).toEqual([]);
  });

  it("names only routes there are", () => {
    expect([...UNDER_A_BAR].filter((route) => !routes().includes(route))).toEqual([]);
  });
});
