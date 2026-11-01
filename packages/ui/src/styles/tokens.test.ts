// @vitest-environment node
/**
 * `tokens.css` is the only definition of the palette (ADR 0009), and it says the same thing
 * twice on purpose: once for the system's preference and once for an explicit `data-theme`.
 * These tests keep the copies honest, and keep a colour that cannot carry text off text. They
 * read files, so they run under Node rather than the package's jsdom.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const STYLES = fileURLToPath(new URL("./", import.meta.url));
const SRC = fileURLToPath(new URL("../", import.meta.url));
const tokens = readFileSync(join(STYLES, "tokens.css"), "utf8");

/** The custom properties declared inside the block that begins with `selector`. */
function declarations(selector: string): Map<string, string> {
  const start = tokens.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no block for ${selector}`);
  const body = tokens.slice(start, tokens.indexOf("\n}", start));
  const found = new Map<string, string>();
  for (const match of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    found.set(match[1] as string, (match[2] as string).replace(/\s+/g, " ").trim());
  }
  return found;
}

/** Every stylesheet in the package, so a rule about colour applies to a card too. */
function stylesheets(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return stylesheets(path);
    return entry.endsWith(".css") ? [path] : [];
  });
}

describe("the palette", () => {
  const light = declarations(":root");
  const explicitLight = declarations('[data-theme="light"]');
  const systemDark = declarations(':root:not([data-theme="light"])');
  const explicitDark = declarations('[data-theme="dark"]');

  it("says dark the same way for the system and for an explicit choice", () => {
    expect([...explicitDark.entries()]).toEqual([...systemDark.entries()]);
  });

  it("redefines every themed token, and only themed tokens, when dark", () => {
    // What dark redefines is exactly what an explicit light redefines: the colours and the
    // shadows. Type, radii, spacing and motion are the same in both, so neither names them.
    expect([...explicitDark.keys()].sort()).toEqual([...explicitLight.keys()].sort());
    for (const name of explicitLight.keys()) expect(light.has(name), name).toBe(true);
  });

  it("gives an explicit light the same values the root has", () => {
    for (const [name, value] of explicitLight) expect(light.get(name), name).toBe(value);
  });

  it("changes every colour between light and dark, but not the gold", () => {
    for (const [name, value] of explicitLight) {
      if (name === "gold") expect(explicitDark.get(name)).toBe(value);
      else expect(explicitDark.get(name), name).not.toBe(value);
    }
  });
});

describe("what the stylesheets may do with the tokens", () => {
  it("never puts ink-4 on text: at 2.3:1 it is a rail, a chevron or a placeholder, not a word", () => {
    for (const path of stylesheets(SRC)) {
      const css = readFileSync(path, "utf8");
      for (const match of css.matchAll(/(?<![a-z-])color:\s*var\(--ink-4\)/g)) {
        expect.fail(`${path.slice(SRC.length)} uses --ink-4 as a text colour: ${match[0]}`);
      }
    }
  });

  it("names no colour that is not a token", () => {
    // A hex colour belongs in tokens.css and nowhere else; `#fff` on a dark avatar included.
    for (const path of stylesheets(SRC)) {
      if (path.endsWith("tokens.css")) continue;
      const css = readFileSync(path, "utf8");
      expect(css.match(/#[0-9a-f]{3,8}\b/gi) ?? [], path.slice(SRC.length)).toEqual([]);
      expect(css.match(/\brgba?\(/g) ?? [], path.slice(SRC.length)).toEqual([]);
    }
  });
});
