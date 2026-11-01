import { describe, expect, it } from "vitest";
import { avatarHue, hueColours, sourceColours } from "./sourceColours";
import { AVATAR_HUES, ICON_GROUNDS } from "./tokens";

function luminance(hex: string) {
  const values = [1, 3, 5].map((at) => {
    const c = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return (values[0] ?? 0) * 0.2126 + (values[1] ?? 0) * 0.7152 + (values[2] ?? 0) * 0.0722;
}

describe("source colours", () => {
  it("clears normal-text contrast for every avatar hue in both themes", () => {
    const names = new Map<string, string>();
    for (let i = 0; names.size < AVATAR_HUES.length && i < 1000; i++)
      names.set(avatarHue(`Source ${i}`), `Source ${i}`);
    expect(names.size).toBe(AVATAR_HUES.length);
    for (const name of names.values())
      for (const scheme of ["light", "dark"] as const) {
        const colours = sourceColours(name, scheme);
        const a = luminance(colours.ground),
          b = luminance(colours.ink);
        expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
      }
  });

  it("clears it for every ground a room's face may be chosen on, too", () => {
    // A lane's row names the room in its chosen ground, and four of the twelve are nobody's hue.
    for (const ground of ICON_GROUNDS)
      for (const scheme of ["light", "dark"] as const) {
        const colours = hueColours(ground, scheme);
        const a = luminance(colours.ground),
          b = luminance(colours.ink);
        expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
      }
  });

  it("preserves Designer's existing violet identity", () => {
    // The hue moved with the palette's lift (21 September 2026); the slot did not, which is the
    // thing this test is really about — a name must keep the face it had.
    expect(avatarHue("Designer")).toBe("#6e48c1");
  });
});
