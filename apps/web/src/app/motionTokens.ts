/**
 * The design system's motion steps (`packages/ui`'s `tokens.css`), for what a script moves: read
 * from the page, so the stylesheet stays the one definition and a script's motion keeps step with
 * the CSS beside it.
 */

const FALLBACK = { "--motion-fast": 120, "--motion-base": 200, "--motion-slow": 300 } as const;

export type MotionStep = keyof typeof FALLBACK;

/** How long a step is, in milliseconds. */
export function motionMs(step: MotionStep): number {
  if (typeof document === "undefined") return FALLBACK[step];
  const token = getComputedStyle(document.documentElement).getPropertyValue(step);
  const ms = Number.parseFloat(token);
  return Number.isFinite(ms) ? ms : FALLBACK[step];
}
