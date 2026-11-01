/**
 * The numbers the room's glass is dialled to, and the two sums that use them — as arithmetic
 * alone, so they can be checked under Node (`glassDial.vitest.ts`). What draws with them is
 * `Glass.tsx`, and why the room has glass at all is [ADR 0063](../../../../docs/decisions/0063-the-rooms-chrome-floats-on-glass.md).
 *
 * Every one of these was dialled by Arjun on the mock rather than chosen here
 * (`docs/proposals/chat-glass-ramp-mocks.html`, 21 September 2026), which is why they are
 * constants in one object and not numbers spread over three files: the difference between this
 * looking like an iPhone and looking like a web page is a few points and a few per cent, and the
 * next round of it should be a few numbers to change. There were five until 23 September 2026,
 * when the band above the field went and its four-point ramp with it (`Glass.tsx`).
 *
 * What he landed on is much lighter than what I would have set — a short ramp, a soft blur, thin
 * capsules and a scrim that is nearly nothing. The glass is *barely there*, on purpose.
 */

export const GLASS = {
  /**
   * Points below the bar over which the blur fades to nothing. His dial said 16 on 21 September;
   * on 23 September, with the name in the system's glass, sixteen read as a hard line under the
   * bar ("the nav bar blur needs to fade at bottom"), and it became this.
   */
  rampTop: 40,
  /**
   * How far down the ramp the bar's own material reaches before it has gone, as a share of the
   * ramp. A thinner material carries the fade the rest of the way (`Glass.tsx`, two panes).
   */
  thickReach: 0.45,
  /**
   * The blur, as the mock's CSS pixels. Since 6 October 2026 (ADR 0129) the band blurs with no
   * material over it, and this is the radius of its thick pane in points, as the mock's was. A
   * material from `expo-blur` takes an intensity from 1 to 100 rather than a radius, so where a
   * capsule or an older build still uses one, what it is handed is `intensityFor` below — a
   * translation, and not an honest one.
   */
  blur: 12,
  /** The radius of the band's thin pane, the one that carries the fade to its end. */
  thinBlur: 4,
  /** How solid a capsule is over what passes under it. His dial: 40%. */
  capsule: 0.4,
  /** The page's colour laid over the band. His dial: 2% — near enough to nothing, on purpose. */
  scrim: 0.02,
} as const;

/**
 * A blur radius in the mock's pixels, as near as a material's intensity gets to one. There is no
 * conversion between the two — one is a Gaussian radius, the other is how far UIKit has animated
 * into a material — so this is a straight line through the pair of points that looked alike side
 * by side, clamped to what the prop takes.
 */
export function intensityFor(blur: number): number {
  return Math.max(1, Math.min(100, Math.round(blur * 2.5)));
}

/**
 * Where a band stops being solid, as a fraction of its own height: the chrome's share is full
 * blur, and the last `ramp` points of it are the fade.
 *
 * A ramp longer than the band is a band that is all fade, which is what a nought-height chrome
 * asks for and is drawn without complaint; a ramp of nothing is a hard edge, which is what the
 * dial's own zero means. Neither is a bug, so neither is an error — but both have to land inside
 * nought and one, because a gradient stop outside that is undefined and draws differently on
 * every renderer.
 */
export function solidStop(height: number, ramp: number): number {
  if (height <= 0) return 0;
  return Math.max(0, Math.min(1, (height - ramp) / height));
}

/** `#rrggbb` at an opacity, because a palette holds colours and a capsule needs a wash. */
/**
 * Where one pane of a band has faded out, as a fraction of the band: `reach` of the way from the
 * solid part's end to the band's.
 */
export function fadeStop(solidTo: number, reach: number): number {
  const from = Math.max(0, Math.min(1, solidTo));
  return Math.max(from, Math.min(1, from + (1 - from) * reach));
}

export function alpha(hex: string, opacity: number): string {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}
