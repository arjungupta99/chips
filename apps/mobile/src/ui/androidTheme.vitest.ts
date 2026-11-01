/**
 * Android's theme (`plugins/with-android-theme.js`) is in the palette's colours. The plugin runs at
 * prebuild, as plain Node, so it carries them itself; this is what keeps them the palette's when
 * the palette moves. Read as text: the plugin needs Expo's config tools, which nothing here may
 * load.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dark, light } from "./tokens";

const plugin = readFileSync(
  new URL("../../plugins/with-android-theme.js", import.meta.url),
  "utf8",
);

function colour(name: string): { light: string | undefined; dark: string | undefined } {
  const found = plugin.match(
    new RegExp(`${name}: \\{ light: "(#[0-9a-f]{6})", dark: "(#[0-9a-f]{6})" \\}`),
  );
  return { light: found?.[1], dark: found?.[2] };
}

describe("Android's theme", () => {
  it("accents in the palette's amber, light and dark", () => {
    expect(colour("colorAccent")).toEqual({ light: light.amber, dark: dark.amber });
  });

  it("grounds its window in the page's colour, light and dark", () => {
    expect(colour("pageBackground")).toEqual({ light: light.bg, dark: dark.bg });
  });

  it("is applied at prebuild", () => {
    const app = JSON.parse(readFileSync(new URL("../../app.json", import.meta.url), "utf8")) as {
      expo: { plugins: unknown[] };
    };
    expect(app.expo.plugins).toContain("./plugins/with-android-theme.js");
  });
});
