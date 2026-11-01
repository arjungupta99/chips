/**
 * The dust's arithmetic on the phone (ADR 0167), apart from the views that draw it (`Dust.tsx`), so
 * it can be held to core's under Node: where a speck is on the UI thread, and what colour it wears.
 */

import type { Speck } from "@chipschat/core";
import { FIELD_STOPS } from "./scrollField";

/** What `groundAt` needs of where the bubble was. */
interface Where {
  readonly y: number;
  readonly height: number;
  readonly viewportTop: number;
  readonly viewportHeight: number;
}

/**
 * Core's `speckAt` on the UI thread, where core's own cannot run: the same arithmetic, which
 * `Dust.test.tsx` holds to core's.
 */
export function speckAtNow(
  speck: Speck,
  t: number,
  box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): { x: number; y: number; size: number; opacity: number } | undefined {
  "worklet";
  const tau = t - speck.at;
  if (tau <= 0 || tau >= speck.life) return undefined;
  const k = tau / 1000;
  const p = tau / speck.life;
  return {
    x:
      box.x +
      speck.u * box.width +
      speck.vx * k +
      0.5 * speck.ax * k * k +
      Math.sin(speck.wobble + tau / 90) * 1.2,
    y: box.y + speck.v * box.height + speck.vy * k + 0.5 * speck.ay * k * k,
    size: speck.size * (1 - 0.45 * p),
    opacity: 1 - p ** 1.6,
  };
}

/**
 * The bubble's ground where a speck was: its colour, or for your own the room's field at that
 * height on the glass — violet at the top, blue in the middle, teal at the foot (`scrollField.ts`).
 */
export function groundAt(ground: string | "field", placed: Where, v: number): string {
  if (ground !== "field") return ground;
  const y = placed.y + v * placed.height;
  const along = (y - placed.viewportTop) / Math.max(placed.viewportHeight, 1);
  const [, top] = FIELD_STOPS[1];
  const [, middle] = FIELD_STOPS[2];
  const [, foot] = FIELD_STOPS[3];
  if (along <= 0.5) return mixed(top, middle, Math.max(0, along) * 2);
  return mixed(middle, foot, Math.min(1, (along - 0.5) * 2));
}

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function painted([r, g, b]: readonly [number, number, number]): string {
  const two = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${two(r)}${two(g)}${two(b)}`;
}

function mixed(from: string, to: string, by: number): string {
  const a = channels(from);
  const b = channels(to);
  return painted([a[0] + (b[0] - a[0]) * by, a[1] + (b[1] - a[1]) * by, a[2] + (b[2] - a[2]) * by]);
}

/** A ground a little lighter or darker, so the dust is not one flat colour. */
export function shaded(colour: string, by: number): string {
  if (!/^#[0-9a-f]{6}/i.test(colour)) return colour;
  const [r, g, b] = channels(colour);
  return painted([r + by, g + by, b + by]);
}
