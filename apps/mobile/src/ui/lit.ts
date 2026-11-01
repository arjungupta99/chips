/**
 * A chosen face's ground, lit: a little lighter and cooler at the top, a little deeper at the
 * foot, as a sheet of coloured paper is under a lamp above it (22 September 2026, with the
 * Folded marks). Worked out in OKLCH, where lightness is lightness and a hue held is a hue kept,
 * so every one of the twelve grounds takes the same light the same way.
 *
 * The desktop does the same sum in CSS (`oklch(from …)` in the design system's avatar), so the
 * two stay one look without a table of hand-picked stops to drift.
 */

type Oklch = readonly [lightness: number, chroma: number, hue: number];

const channel = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16) / 255;
const linear = (c: number) => (c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const encoded = (c: number) => (c <= 0.003_130_8 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function toOklch(hex: string): Oklch {
  const [r, g, b] = [1, 3, 5].map((at) => linear(channel(hex, at))) as [number, number, number];
  const l = Math.cbrt(0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b);
  const m = Math.cbrt(0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b);
  const s = Math.cbrt(0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b);
  const lightness = 0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s;
  const a = 1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s;
  const bb = 0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s;
  const hue = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return [lightness, Math.hypot(a, bb), hue];
}

/** Linear sRGB for a colour in OKLCH, which may fall outside what a screen can show. */
function rgbOf([lightness, chroma, hue]: Oklch): [number, number, number] {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const m = (lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const s = (lightness - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;
  return [
    4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s,
    -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s,
    -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s,
  ];
}

const shown = (v: number) => v >= -0.0005 && v <= 1.0005;

/**
 * Back to a hex a screen can show: the chroma comes down until the colour fits, which keeps the
 * lightness and the hue — the two things the eye reads a ground by.
 */
export function fromOklch([lightness, chroma, hue]: Oklch): string {
  let c = chroma;
  let rgb = rgbOf([lightness, c, hue]);
  while (!rgb.every(shown) && c > 0) {
    c = Math.max(0, c - 0.004);
    rgb = rgbOf([lightness, c, hue]);
  }
  const byte = (v: number) =>
    Math.round(Math.min(1, Math.max(0, encoded(Math.max(0, v)))) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${rgb.map(byte).join("")}`;
}

/**
 * How much of that light the Chips mark's gold takes (7 October 2026). The grounds are all deep
 * enough for white to read on; the gold is far lighter, and the whole light lifts its top to cream
 * and sinks its foot to olive. Half of it reads as mild on the gold as the whole does on a ground.
 * The app icons are drawn with it, and the desktop's mark does the same halved sum in CSS
 * (`packages/ui/src/components/mark/mark.css`).
 */
export const MARK_LIGHT = 0.5;

/** The top and the foot of a lit ground, for a vertical gradient; `strength` scales the light. */
export function litGround(
  hex: string,
  strength = 1,
): { readonly top: string; readonly foot: string } {
  const [lightness, chroma, hue] = toOklch(hex);
  return {
    top: fromOklch([
      lightness + 0.075 * strength,
      chroma * (1 + 0.06 * strength),
      hue - 12 * strength,
    ]),
    foot: fromOklch([
      lightness - 0.03 * strength,
      chroma * (1 + 0.02 * strength),
      hue + 8 * strength,
    ]),
  };
}

/**
 * A ground's sister in the Bright theme (ADR 0176): the same hue; its lightness folded from the
 * Soothing grounds' 0.33–0.58 into 0.62–0.72, where dark letters read on every one, and a tenth
 * higher for a yellow, which is light by nature; a quarter more chroma and never under 0.13, so
 * nothing comes out pastel. The greys stay grey. Worked out once: `ICON_GROUNDS_BRIGHT` holds the
 * answers, and `lit.vitest.ts` proves they are these.
 */
export function brightGround(hex: string): string {
  const [lightness, chroma, hue] = toOklch(hex);
  const yellow = Math.max(0, 1 - Math.abs(hue - 90) / 30);
  const grey = chroma < 0.04;
  return fromOklch([
    0.62 + (lightness - 0.33) * 0.4 + 0.1 * yellow,
    grey ? chroma * 1.4 : Math.max(chroma * 1.25, 0.13),
    hue,
  ]);
}

/** From `a` toward `b` by `amount`, in sRGB as a colour picker mixes. */
export function mixHex(a: string, b: string, amount: number): string {
  return `#${[1, 3, 5]
    .map((at) => {
      const from = channel(a, at);
      const to = channel(b, at);
      return Math.round((from + (to - from) * amount) * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}
