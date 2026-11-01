/**
 * Tokens in words, by the rule the run panel's follow (`formatTokens` in `@chipschat/ui`): an agent's
 * context window (ADR 0146) and the quiet line its room shows when it compacts.
 */

/** `82k`, `12.3k`, `1.2M`; small counts stay whole. */
export function tokenWords(tokens: number): string {
  const n = Math.max(0, Math.round(tokens));
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k >= 100 || Number.isInteger(k) ? Math.round(k) : k.toFixed(1)}k`;
  }
  const m = n / 1_000_000;
  return `${m >= 100 ? Math.round(m) : m.toFixed(1)}M`;
}

/** The room's quiet line, after the agent's name: "compacted its context · 214k → 21k tokens". */
export function compactedWords(from: number, to: number): string {
  return `compacted its context · ${tokenWords(from)} → ${tokenWords(to)} tokens`;
}
