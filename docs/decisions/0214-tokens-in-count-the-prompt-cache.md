# 0214. Tokens in count the prompt cache, and say how much came from it

Date: 20 October 2026
Status: Accepted, 20 October 2026, on Arjun's "fix both" (both options of the note below).
Extends `usage`; amends ADR 0021's price at ingest.

## Context

Jacobian's runs in India trip 2026 said "4 in · 191 out" on the phone's receipt, for a
19,790-token prompt. Jacobian's cost store keeps a model call's prompt in three columns: the part
the provider had not cached, the part it read from its cache, and the part it wrote to it. Every
Jacobian provider stores the uncached part as `input`, and the Chips channel's `usageOf` added up
that column alone. On ChatGPT that had made the count short since 4 October (on 10 October it was
about a quarter of the real one). On the Claude API, where nearly the whole prompt is a cache hit,
it was almost nothing. The cost was right, because Jacobian prices all three columns itself, and
so was the context ring (ADR 0146), which Jacobian's runtime fills with all three.

The protocol said only "Tokens in." The OpenClaw and OpenCode bridges already sent fresh, cache
read and cache write added together. Jacobian was the only harness that didn't.

## Decision

1. **`usage.input_tokens` is every token the model read:** fresh, read from its prompt cache and
   written to it. Jacobian adds its three columns together.
2. **`usage.cache_read_tokens` and `usage.cache_write_tokens`, optional:** of the tokens in, how
   many the model read from its cache and how many it wrote to it. A harness leaves them out when
   it cannot say or the model keeps no cache. They fold like the other counts: a run's report
   replaces them, a step's or a lane's adds to them, and a report that leaves them out keeps the
   run's as they were (ADR 0162).
3. **The receipt says how much was cached:** "19.8k in (15.4k cached) · 185 out" on the phone,
   "≈$0.03 · 20k tokens (15.4k cached)" in the web's Run panel. Only reads from the cache are
   counted there: those are the tokens that cost a tenth.
4. **Chips' own price charges the cache at its rates.** When a harness sends no cost, a price-table
   row that names `cache_read_usd_per_million` or `cache_write_usd_per_million` charges those
   tokens at it, and a row that names neither charges them as fresh ones, as before. The default
   rows (Claude's) read at a tenth of the input price and write at a quarter more. A cache count
   larger than the tokens in is held to the tokens in.
5. **The server's `runs` table keeps no cache columns.** Nothing reads them there: the apps fold
   the counts from the `usage` events, which carry them.

## Consequences

- A harness that sends a cost (Jacobian, OpenClaw, OpenCode) is priced as before; only the counts
  change.
- Runs already recorded keep their short counts. A backfill was not worth its migration.
- The OpenClaw and OpenCode bridges send the two cache counts too. Hermes's bridge followed the
  same evening (addendum below).

## Addendum, Hermes's bridge sends them too (20 October 2026)

Hermes's Runs API already counted every token in. Its `usage.input_tokens` is the run's prompt
tokens, each model call's fresh, cache read and cache write added together (Hermes 0.22.0,
`CanonicalUsage.prompt_tokens`), and its own log says so: `in=20248 … cache=15616/20248`. So the
bridge keeps that count as it was, and now passes Hermes's `cache_read_tokens` and
`cache_write_tokens` beside it, leaving out one Hermes doesn't send (chips-hermes `66b953a`,
running from 23:32 PDT). Re-vendoring the SDK for these fields also brought SEC-15's
"Arjun (owner): " into the OpenCode and Hermes bridges' Not right? tests, which expect it now
(chips-opencode `fb06c03`, and the same Hermes commit).
