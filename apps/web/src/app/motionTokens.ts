/**
 * The design system's motion steps (`packages/ui`'s `tokens.css`), for what a script moves: read
 * from the page, so the stylesheet stays the one definition and a script's motion keeps step with
 * the CSS beside it.
 *
 * The page says a step in whichever unit its stylesheet does: `300ms` as `tokens.css` has it, `.3s`
 * as the built apps' minified CSS has it. Until 5 November 2026 this read the number alone, so the
 * web and Mac builds moved by these steps in a thousandth of their time: the room jumped beside a
 * run panel that slid, and a sheet's page left at once (the film's check of the Mac's shot found it).
 */

const FALLBACK = { "--motion-fast": 120, "--motion-base": 200, "--motion-slow": 300 } as const;

export type MotionStep = keyof typeof FALLBACK;

/** How long a step is, in milliseconds. */
export function motionMs(step: MotionStep): number {
  if (typeof document === "undefined") return FALLBACK[step];
  const said = getComputedStyle(document.documentElement).getPropertyValue(step).trim();
  const value = Number.parseFloat(said);
  if (!Number.isFinite(value)) return FALLBACK[step];
  return said.endsWith("ms") ? value : value * 1000;
}
