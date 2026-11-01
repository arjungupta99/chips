/**
 * Cost from tokens. A harness may send `usage` with a cost of its own; when it does not, Chips
 * estimates one from the workspace's price table, at ingest, so the log carries the number
 * the meter shows and "why $1.47?" has an answer in the audit. Cost is always an estimate and
 * is labelled as one (protocol `cost.estimated`).
 *
 * Prices are US dollars per million tokens. The default table is a starting point, not a
 * quote: a workspace overrides it row by row, and a model the table does not name gets no
 * cost, which the meter shows as tokens alone rather than as a made-up number.
 *
 * A token read from the prompt cache, or written to it, is one of the tokens in; a row that
 * names a cache price charges those at it, and a row that does not charges them as fresh ones.
 */

export interface ModelPrice {
  readonly input_usd_per_million: number;
  readonly output_usd_per_million: number;
  readonly cache_read_usd_per_million?: number | undefined;
  readonly cache_write_usd_per_million?: number | undefined;
}

/** Keyed by a model name, or a fragment of one: `opus-5` prices `claude-opus-5-20260601` too. */
export type PriceTable = Readonly<Record<string, ModelPrice>>;

/** Claude's cache, read at a tenth of the fresh price and written at a quarter more. */
function claude(input: number, output: number): ModelPrice {
  return {
    input_usd_per_million: input,
    output_usd_per_million: output,
    cache_read_usd_per_million: input / 10,
    cache_write_usd_per_million: input * 1.25,
  };
}

export const DEFAULT_PRICE_TABLE: PriceTable = {
  "opus-5": claude(15, 75),
  "sonnet-5": claude(3, 15),
  "haiku-4.5": claude(1, 5),
};

export interface TokenUsage {
  readonly model: string;
  /** Absent when the harness could not say (finding 11 of the OpenClaw test). */
  readonly input_tokens?: number | undefined;
  /** Of the tokens in, those read from the prompt cache and those written to it. */
  readonly cache_read_tokens?: number | undefined;
  readonly cache_write_tokens?: number | undefined;
  /** Absent too, when the harness sent its cost alone (ADR 0162). */
  readonly output_tokens?: number | undefined;
}

/** The price for a model: its own row, or the row for the longest fragment its name contains. */
export function priceFor(model: string, table: PriceTable): ModelPrice | undefined {
  const name = model.toLowerCase();
  const exact = table[name];
  if (exact !== undefined) return exact;
  const fragments = Object.keys(table)
    .filter((key) => name.includes(key.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  const best = fragments[0];
  return best === undefined ? undefined : table[best];
}

/**
 * An estimated cost, to the hundredth of a cent, or nothing when the model is not priced or
 * either count is not known: one count alone would be a price too low to be worth showing.
 */
export function estimateCost(
  usage: TokenUsage,
  table: PriceTable,
): { readonly usd: number; readonly estimated: true } | undefined {
  const price = priceFor(usage.model, table);
  const { input_tokens: input, output_tokens: output } = usage;
  if (price === undefined || input === undefined || output === undefined) return undefined;
  // A harness that says more came from the cache than went in at all is held to what went in.
  const read = Math.min(usage.cache_read_tokens ?? 0, input);
  const written = Math.min(usage.cache_write_tokens ?? 0, input - read);
  const fresh = input - read - written;
  const usd =
    (fresh * price.input_usd_per_million +
      read * (price.cache_read_usd_per_million ?? price.input_usd_per_million) +
      written * (price.cache_write_usd_per_million ?? price.input_usd_per_million) +
      output * price.output_usd_per_million) /
    1_000_000;
  return { usd: Math.round(usd * 10_000) / 10_000, estimated: true };
}

function isPrice(value: unknown): value is ModelPrice {
  if (typeof value !== "object" || value === null) return false;
  const price = value as Record<string, unknown>;
  return (
    isRate(price["input_usd_per_million"]) &&
    isRate(price["output_usd_per_million"]) &&
    (price["cache_read_usd_per_million"] === undefined ||
      isRate(price["cache_read_usd_per_million"])) &&
    (price["cache_write_usd_per_million"] === undefined ||
      isRate(price["cache_write_usd_per_million"]))
  );
}

function isRate(value: unknown): value is number {
  return typeof value === "number" && value >= 0;
}

/**
 * A workspace's table as stored: JSON, or nothing for the default. A row that is not a price
 * is skipped rather than failing every `usage` event in the workspace; a workspace's rows sit
 * on top of the defaults, so naming one model does not un-price the rest.
 */
export function parsePriceTable(stored: string | null | undefined): PriceTable {
  if (stored === null || stored === undefined || stored === "") return DEFAULT_PRICE_TABLE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return DEFAULT_PRICE_TABLE;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return DEFAULT_PRICE_TABLE;
  }
  const rows = Object.entries(parsed as Record<string, unknown>)
    .filter((entry): entry is [string, ModelPrice] => isPrice(entry[1]))
    .map(([model, price]) => [model.toLowerCase(), price] as const);
  return { ...DEFAULT_PRICE_TABLE, ...Object.fromEntries(rows) };
}
