/**
 * The context ring: how full a harness's context window is. Neutral to 70 percent, amber to
 * 90, red past that (blueprint, Look; technical-plan M1.3). If the harness never reports it,
 * the ring is not drawn — the caller decides that; this module only says what a number means.
 */

export const CONTEXT_WARN_PERCENT = 70;
export const CONTEXT_HOT_PERCENT = 90;

export type ContextTone = "neutral" | "warn" | "hot";

/** A whole percentage, clamped to 0..100, from what `context.usage` reports. */
export function contextPercent(usedTokens: number, limitTokens: number): number {
  if (limitTokens <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((usedTokens / limitTokens) * 100)));
}

export function contextTone(percent: number): ContextTone {
  if (percent >= CONTEXT_HOT_PERCENT) return "hot";
  if (percent >= CONTEXT_WARN_PERCENT) return "warn";
  return "neutral";
}

/** What a screen reader hears for the ring. */
export function contextLabel(percent: number): string {
  return `Context ${percent}% full`;
}
