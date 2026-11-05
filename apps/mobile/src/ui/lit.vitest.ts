import { describe, expect, it } from "vitest";
import { brightGround, fromOklch, litGround, MARK_LIGHT, mixHex, toOklch } from "./lit";
import { dark, FACE_INK, ICON_GROUNDS, ICON_GROUNDS_BRIGHT, light } from "./tokens";

describe("a lit ground", () => {
  it("goes there and back without moving", () => {
    for (const ground of ICON_GROUNDS) expect(fromOklch(toOklch(ground))).toBe(ground);
  });

  it("is lighter at the top and deeper at the foot on every ground, and keeps its hue", () => {
    for (const ground of ICON_GROUNDS) {
      const [lightness, , hue] = toOklch(ground);
      const { top, foot } = litGround(ground);
      expect(toOklch(top)[0], ground).toBeGreaterThan(lightness);
      expect(toOklch(foot)[0], ground).toBeLessThan(lightness);
      // Cooler at the top, warmer at the foot, but the same colour to the eye: within 20°.
      const turn = (a: number) => Math.abs(((a - hue + 540) % 360) - 180);
      expect(turn(toOklch(top)[2]), ground).toBeLessThan(20);
      expect(turn(toOklch(foot)[2]), ground).toBeLessThan(20);
    }
  });

  it("lights the mark's gold at half strength, which leaves it gold at both ends", () => {
    expect(litGround(light.gold, MARK_LIGHT)).toEqual({ top: "#fed07a", foot: "#edc225" });
    expect(litGround("#abcdef", 1)).toEqual(litGround("#abcdef"));
    expect(litGround("#abcdef", 0)).toEqual({ top: "#abcdef", foot: "#abcdef" });
  });

  it("stays on the screen: a colour past what sRGB shows loses chroma, not lightness", () => {
    const vivid = fromOklch([0.7, 0.4, 145]);
    expect(vivid).toMatch(/^#[0-9a-f]{6}$/);
    expect(toOklch(vivid)[0]).toBeCloseTo(0.7, 2);
  });

  it("mixes as a colour picker does", () => {
    expect(mixHex("#ffffff", "#000000", 0.5)).toBe("#808080");
    expect(mixHex("#ffffff", "#b84d86", 0)).toBe("#ffffff");
    expect(mixHex("#ffffff", "#b84d86", 1)).toBe("#b84d86");
  });
});

/** WCAG's contrast between two colours, for the letters a face wears. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((at) => {
      const c = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
      return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

describe("the chosen tab's ink", () => {
  it("reads at 4.5:1 on its ground, surface3, in both themes", () => {
    for (const palette of [light, dark]) {
      expect(contrast(palette.accentInk, palette.surface3)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("the Bright grounds (ADR 0176)", () => {
  it("are each Soothing ground's sister, worked out by the one sum, index for index", () => {
    expect(ICON_GROUNDS_BRIGHT).toHaveLength(ICON_GROUNDS.length);
    expect([...ICON_GROUNDS_BRIGHT]).toEqual(ICON_GROUNDS.map(brightGround));
  });

  it("keep each ground's hue, and are lighter than it", () => {
    const turn = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
    ICON_GROUNDS.forEach((ground, at) => {
      const [lightness, chroma, hue] = toOklch(ground);
      const sister = toOklch(ICON_GROUNDS_BRIGHT[at] ?? "");
      expect(sister[0], ground).toBeGreaterThan(lightness);
      // A grey's hue is noise; a colour's is what it is.
      if (chroma >= 0.04) expect(turn(sister[2], hue), ground).toBeLessThan(3);
    });
  });

  it("carry dark letters at 4.5:1 or better, where white would not", () => {
    for (const ground of ICON_GROUNDS_BRIGHT) {
      expect(contrast(ground, FACE_INK.bright), ground).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ground, FACE_INK.bright), ground).toBeGreaterThan(
        contrast(ground, "#ffffff"),
      );
    }
  });

  it("share no colour with the Soothing ones, so a ground is never painted twice over", () => {
    const soothing = new Set<string>(ICON_GROUNDS);
    for (const ground of ICON_GROUNDS_BRIGHT) expect(soothing.has(ground), ground).toBe(false);
    expect(new Set(ICON_GROUNDS_BRIGHT).size).toBe(ICON_GROUNDS_BRIGHT.length);
  });
});
