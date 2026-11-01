/**
 * The app icons are the mark, and since ADR 0096 the mark is the outline an agent wears: one set
 * of numbers in `packages/ui/src/components/face/outline.ts` (the phone's copy is held to it by
 * `outline.vitest.ts`). An icon is a file of literal numbers, rendered to a PNG once, so nothing
 * would notice it drawing last month's chip. This reads every icon's SVG and fails where its body
 * or its pins are not that outline's `bittenPath` and `pinsOf` for the square it names, or where its
 * body is not lit from above as the mark is (`litGround` at `MARK_LIGHT`), down that square.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { litGround, MARK_LIGHT } from "../../apps/mobile/src/ui/lit.ts";
import { bittenPath, PIN_REST, pinsOf } from "../../packages/ui/src/components/face/outline.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const ICONS = [
  "apps/mobile/assets/icon.svg",
  "apps/mobile/assets/adaptive-icon.svg",
  "apps/mobile/assets/splash-icon.svg",
  "apps/desktop/src-tauri/icons/icon.svg",
  "apps/desktop/src-tauri/icons/tray.svg",
];

/** The icons' gold, a shade warmer than the app's `--gold`, which the icons have worn since ADR 0096. */
const GOLD = "#f5c542";

const round = (value: number) => Math.round(value * 100) / 100;
const square = (named: string) => named.split(" ").map(Number) as [number, number, number];

describe("the app icons", () => {
  for (const path of ICONS) {
    const svg = readFileSync(`${ROOT}${path}`, "utf8");

    it(`${path} draws the outline's body`, () => {
      const bodies = [...svg.matchAll(/data-outline="([^"]+)" d="([^"]+)"/g)];
      expect(bodies).toHaveLength(1);
      const [, named = "", d] = bodies[0] ?? [];
      expect(d).toBe(bittenPath(...square(named)));
    });

    it(`${path} draws the outline's pins, behind the body`, () => {
      const group = svg.match(/data-pins="([^"]+)">([\s\S]*?)<\/g>/);
      expect(group).not.toBeNull();
      const [x, y, side] = square(group?.[1] ?? "");
      const drawn = [...(group?.[2] ?? "").matchAll(/<rect ([^/]+)\/>/g)].map((rect) =>
        Object.fromEntries(
          [...(rect[1] ?? "").matchAll(/(\w+)="([^"]+)"/g)].map(([, key, value]) => [
            key,
            Number(value),
          ]),
        ),
      );
      expect(drawn).toEqual(
        pinsOf(side).map((pin) => ({
          x: round(x + pin.x),
          y: round(y + pin.y),
          width: round(pin.w),
          height: round(pin.h),
          rx: round(Math.min(pin.w, pin.h) / 2),
        })),
      );
      expect(svg.indexOf("data-pins=")).toBeLessThan(svg.indexOf("data-outline="));
    });

    // The menu bar's is a template macOS paints in one colour, so its pins stay solid and its
    // body flat.
    if (path.endsWith("tray.svg")) continue;

    it(`${path} rests its pins as the mark's rest, a little dim`, () => {
      const opacity = svg.match(/fill-opacity="([^"]+)" data-pins=/)?.[1];
      expect(Number(opacity)).toBe(PIN_REST.mark);
    });

    it(`${path} lights its body from above, as the mark is lit`, () => {
      const [, y, side] = square(svg.match(/data-outline="([^"]+)"/)?.[1] ?? "");
      expect(svg).toMatch(/<path fill="url\(#lit\)" data-outline=/);
      const gradient = svg.match(/<linearGradient id="lit" ([^>]+)>([\s\S]*?)<\/linearGradient>/);
      expect(gradient?.[1]).toBe(
        `x1="0" y1="${y}" x2="0" y2="${y + side}" gradientUnits="userSpaceOnUse"`,
      );
      const stops = [...(gradient?.[2] ?? "").matchAll(/stop-color="([^"]+)"/g)].map((m) => m[1]);
      const { top, foot } = litGround(GOLD, MARK_LIGHT);
      expect(stops).toEqual([top, foot]);
    });
  }
});
