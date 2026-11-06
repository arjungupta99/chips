import { describe, expect, it } from "vitest";
import { DEFAULT_PRICE_TABLE, estimateCost, parsePriceTable, priceFor } from "./pricing.js";

/** The golden scenario's usage: 82,140 tokens in, 3,402 out, on opus-5. */
const USAGE = { model: "opus-5", input_tokens: 82_140, output_tokens: 3402 };

describe("estimating cost from tokens", () => {
  it("prices the golden scenario's run at Opus 5's list price", () => {
    // 82,140 in at $5 and 3,402 out at $25.
    const cost = estimateCost(USAGE, DEFAULT_PRICE_TABLE);
    expect(cost).toEqual({ usd: 0.4958, estimated: true });
  });

  it("prices each 5.x model by its own row, not by an older one its name holds", () => {
    expect(priceFor("claude-opus-5-5", DEFAULT_PRICE_TABLE)).toBe(DEFAULT_PRICE_TABLE["opus-5-5"]);
    expect(priceFor("anthropic/claude-sonnet-5-5", DEFAULT_PRICE_TABLE)).toBe(
      DEFAULT_PRICE_TABLE["sonnet-5-5"],
    );
    expect(priceFor("claude-fable-5-1", DEFAULT_PRICE_TABLE)).toBe(
      DEFAULT_PRICE_TABLE["fable-5-1"],
    );
    expect(priceFor("claude-haiku-4-5", DEFAULT_PRICE_TABLE)).toBe(
      DEFAULT_PRICE_TABLE["haiku-4-5"],
    );
    // Vik's first turn in Bruh chat (Hermes, 5 November 2026): 4 fresh at $4, 19,065 written to
    // the cache at $5, 760 out at $20. Opus 4's prices made it $0.4145; Hermes said $0.1105.
    const vik = {
      model: "claude-opus-5-5",
      input_tokens: 19_069,
      cache_read_tokens: 0,
      cache_write_tokens: 19_065,
      output_tokens: 760,
    };
    expect(estimateCost(vik, DEFAULT_PRICE_TABLE)).toEqual({ usd: 0.1105, estimated: true });
    // Read from the cache at $0.20, a twentieth of the fresh price.
    const read = {
      model: "claude-opus-5-5",
      input_tokens: 1_000_000,
      cache_read_tokens: 1_000_000,
    };
    expect(estimateCost({ ...read, output_tokens: 0 }, DEFAULT_PRICE_TABLE)).toEqual({
      usd: 0.2,
      estimated: true,
    });
  });

  it("finds a model by the fragment of its name the table knows", () => {
    expect(priceFor("claude-opus-5-20260601", DEFAULT_PRICE_TABLE)).toBe(
      DEFAULT_PRICE_TABLE["opus-5"],
    );
    expect(priceFor("Sonnet-5", DEFAULT_PRICE_TABLE)).toBe(DEFAULT_PRICE_TABLE["sonnet-5"]);
  });

  it("prefers the longest fragment, so a more specific row wins", () => {
    const table = {
      ...DEFAULT_PRICE_TABLE,
      "opus-5-fast": { input_usd_per_million: 30, output_usd_per_million: 150 },
    };
    expect(priceFor("claude-opus-5-fast", table)).toBe(table["opus-5-fast"]);
  });

  it("gives no cost for a model it cannot price, rather than a made-up one", () => {
    expect(estimateCost({ ...USAGE, model: "abacus-1" }, DEFAULT_PRICE_TABLE)).toBeUndefined();
  });

  it("gives no cost when the tokens in are not known, rather than half of one (finding 11)", () => {
    expect(
      estimateCost({ model: "opus-5", output_tokens: 3402 }, DEFAULT_PRICE_TABLE),
    ).toBeUndefined();
  });

  it("gives no cost when the tokens out are not known either (ADR 0162)", () => {
    expect(
      estimateCost({ model: "opus-5", input_tokens: 82_140 }, DEFAULT_PRICE_TABLE),
    ).toBeUndefined();
  });

  it("charges the tokens read from the cache and written to it at the cache's prices", () => {
    const cached = {
      model: "claude-opus-5",
      input_tokens: 19_790,
      cache_read_tokens: 15_351,
      cache_write_tokens: 4435,
      output_tokens: 185,
    };
    // 4 fresh at $5, 15,351 read at $0.50, 4,435 written at $6.25, 185 out at $25.
    expect(estimateCost(cached, DEFAULT_PRICE_TABLE)).toEqual({ usd: 0.04, estimated: true });
    const plain = { "opus-5": { input_usd_per_million: 15, output_usd_per_million: 75 } };
    expect(estimateCost(cached, plain)).toEqual({ usd: 0.3107, estimated: true });
  });

  it("holds a cache count larger than the tokens in to the tokens in", () => {
    const over = { model: "opus-5", input_tokens: 19_790, cache_read_tokens: 30_000 };
    expect(estimateCost({ ...over, output_tokens: 185 }, DEFAULT_PRICE_TABLE)).toEqual({
      usd: 0.0145,
      estimated: true,
    });
  });

  it("is zero for nothing", () => {
    expect(
      estimateCost({ model: "opus-5", input_tokens: 0, output_tokens: 0 }, DEFAULT_PRICE_TABLE),
    ).toEqual({ usd: 0, estimated: true });
  });
});

describe("a workspace's price table", () => {
  it("is the default when nothing is stored", () => {
    expect(parsePriceTable(null)).toBe(DEFAULT_PRICE_TABLE);
    expect(parsePriceTable(undefined)).toBe(DEFAULT_PRICE_TABLE);
    expect(parsePriceTable("")).toBe(DEFAULT_PRICE_TABLE);
  });

  it("sits on top of the defaults, row by row", () => {
    const table = parsePriceTable(
      JSON.stringify({ "opus-5": { input_usd_per_million: 10, output_usd_per_million: 50 } }),
    );
    expect(table["opus-5"]).toEqual({ input_usd_per_million: 10, output_usd_per_million: 50 });
    expect(table["sonnet-5"]).toBe(DEFAULT_PRICE_TABLE["sonnet-5"]);
  });

  it("skips a row that is not a price, and shrugs at JSON that is not a table", () => {
    const table = parsePriceTable(
      JSON.stringify({
        "opus-5": { input_usd_per_million: "lots" },
        "abacus-1": { input_usd_per_million: 1, output_usd_per_million: -2 },
        "pocket-2": { input_usd_per_million: 0.5, output_usd_per_million: 2 },
      }),
    );
    expect(table["opus-5"]).toBe(DEFAULT_PRICE_TABLE["opus-5"]);
    expect(table["abacus-1"]).toBeUndefined();
    expect(table["pocket-2"]).toEqual({ input_usd_per_million: 0.5, output_usd_per_million: 2 });
    const cache = parsePriceTable(
      JSON.stringify({
        "pocket-2": {
          input_usd_per_million: 0.5,
          output_usd_per_million: 2,
          cache_read_usd_per_million: 0.05,
        },
        "abacus-1": {
          input_usd_per_million: 1,
          output_usd_per_million: 2,
          cache_write_usd_per_million: "cheap",
        },
      }),
    );
    expect(cache["pocket-2"]?.cache_read_usd_per_million).toBe(0.05);
    expect(cache["abacus-1"]).toBeUndefined();
    expect(parsePriceTable("[1, 2]")).toBe(DEFAULT_PRICE_TABLE);
    expect(parsePriceTable("{not json")).toBe(DEFAULT_PRICE_TABLE);
  });
});
