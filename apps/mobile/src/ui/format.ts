/**
 * Durations, costs, token counts and a receipt's one-line summary, transcribed from `packages/ui/src/format.ts`
 * and `packages/ui/src/components/receipt/receipt.tsx`.
 *
 * The phone may not import `@chipschat/ui` — that package is the web's components and its entry
 * point drags stylesheets Metro cannot read (the dependency rule says so). A receipt that says
 * `7 steps · 38s · ≈$0.04` in the browser and something else on the phone is the same receipt
 * telling two stories, so the words are copied here and `format.vitest.ts` reads the originals
 * and fails when they stop matching. The same bargain the tokens and the marks made.
 */

/** `12s`, `2m 05s`, `1h 12m`. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** Cost is always an estimate and always labelled as one. The tilde is the label. */
export function formatCost(usd: number): string {
  if (usd <= 0) return "≈$0.00";
  if (usd < 0.01) return "<$0.01";
  return `≈$${usd >= 100 ? Math.round(usd).toString() : usd.toFixed(2)}`;
}

/** `82k`, `12.3k`, `1.2M`; small counts stay whole. */
export function formatTokens(tokens: number): string {
  const n = Math.max(0, Math.round(tokens));
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k >= 100 || Number.isInteger(k) ? Math.round(k) : k.toFixed(1)}k`;
  }
  const m = n / 1_000_000;
  return `${m >= 100 ? Math.round(m) : m.toFixed(1)}M`;
}

/**
 * `≈$0.04 · 3 steps · 12s`, with `1 failed` when something did: the cost first, since it is what a
 * reader opens a receipt for (ADR 0282). A run that only answered says `≈$0.03 · 3s`: no `0 steps`
 * in a receipt with nothing under it.
 */
export function receiptSummary(
  steps: readonly { readonly status: string }[],
  durationMs?: number,
  costUsd?: number,
): string {
  const parts: string[] = [];
  if (costUsd !== undefined) parts.push(formatCost(costUsd));
  if (steps.length > 0) parts.push(`${steps.length} ${steps.length === 1 ? "step" : "steps"}`);
  const failed = steps.filter((step) => step.status === "failed").length;
  if (failed > 0) parts.push(`${failed} failed`);
  if (durationMs !== undefined) parts.push(formatDuration(durationMs));
  return parts.join(" · ");
}
