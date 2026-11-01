import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ICON_BOX, PHONE_ICONS, SYSTEM_ICONS } from "./icons";

/**
 * The phone transcribes the design system's marks rather than importing them, so this is what
 * stops the two drifting: the web's icon module is read, its `PATHS` table is parsed, and every
 * path here is checked against the one there. A mark redrawn on the desktop and not on the
 * phone fails this rather than shipping as two different icons for one idea.
 */
const source = readFileSync(
  fileURLToPath(new URL("../../../../packages/ui/src/components/icon/icon.tsx", import.meta.url)),
  "utf8",
);

/** The `PATHS` object, as data: every `name: [...]` entry with the strings inside it. */
function theirs(): Readonly<Record<string, readonly string[]>> {
  const at = source.indexOf("const PATHS = {");
  if (at === -1) throw new Error("no PATHS table in the design system's icon module");
  const body = source.slice(at, source.indexOf("\n} as const;", at));
  const found: Record<string, string[]> = {};
  for (const [, name, entry] of body.matchAll(/(\w+): \[([^\]]*)\]/g)) {
    if (name === undefined || entry === undefined) continue;
    found[name] = [...entry.matchAll(/"([^"]+)"/g)].map(([, d]) => d ?? "");
  }
  return found;
}

describe("the phone's icons", () => {
  it("draws each mark with the design system's own path", () => {
    const table = theirs();
    for (const [name, paths] of Object.entries(SYSTEM_ICONS)) {
      expect(`${name}: ${paths.join(" ")}`).toBe(`${name}: ${(table[name] ?? []).join(" ")}`);
    }
  });

  it("keeps the phone's own marks to what the design system does not have", () => {
    // A mark the web has taken in belongs with the others above, where drift is checked.
    const table = theirs();
    expect(Object.keys(PHONE_ICONS).filter((name) => name in table)).toEqual([]);
  });

  it("is drawn in the same box", () => {
    expect(source).toContain(`viewBox="0 0 ${ICON_BOX} ${ICON_BOX}"`);
  });
});
