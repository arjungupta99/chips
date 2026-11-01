/**
 * The small formatting the mockups rely on: sizes, costs, durations, what is left on a clock,
 * token counts, and the initials in an avatar. Pure functions, so a receipt reads the same in
 * a test as on a screen.
 */

/** `212 KB`, `1.2 MB`, `980 B`. Decimal units, like a file manager. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${Math.max(0, Math.round(bytes))} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const digits = value >= 100 || Number.isInteger(value) ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

/**
 * Cost is always an estimate and always labelled as one (blueprint: cost rolls up the trail;
 * protocol `cost.estimated` is always true). The tilde is the label.
 */
export function formatCost(usd: number): string {
  if (usd <= 0) return "≈$0.00";
  if (usd < 0.01) return "<$0.01";
  return `≈$${usd >= 100 ? Math.round(usd).toString() : usd.toFixed(2)}`;
}

/** `12s`, `2m 05s`, `1h 12m`. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** What is left before an expiry: `58m`, `3h`, `2d`; `expired` once it has passed. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
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
 * The letters in an avatar: `PR` for Priya Raman, `S` for Scout, `#` for a channel. Two at
 * most, from the first two words, because a 32px circle holds no more.
 */
export function initials(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith("#")) return "#";
  // A word of punctuation alone is no initial: "Shopping · fork" is SF (ADR 0087, Fork).
  const words = trimmed.split(/\s+/).filter((word) => word.length > 0 && !/^\p{P}+$/u.test(word));
  const letters = words
    .slice(0, 2)
    .map((word) => [...word][0] ?? "")
    .join("");
  return letters.toUpperCase() || "?";
}
