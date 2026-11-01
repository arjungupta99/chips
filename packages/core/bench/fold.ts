/**
 * The client fold's benchmark (technical-plan 6.2: "`server/bench` holds reproducible
 * benchmarks. Optimizations cite a benchmark in the commit.").
 *
 *   pnpm bench:fold [count]
 *
 * It folds `count` message events into one space the way the store does — in flushes of
 * fifty, freezing after each one — and reports the total. Before the Phase 1 review's finding 1
 * the fold was rebuilt from every event on every flush, which is quadratic: ten thousand
 * messages in two hundred flushes folded a million events. The budget here is the whole thing
 * in under a second, which a linear fold clears by an order of magnitude and a quadratic one
 * cannot.
 */

import type { ClientEvent } from "../src/events.js";
import { createFold } from "../src/model.js";

const WS = "ws_01K4ZQPX000000000000000001";
const CONV = "spc_01K4ZQPX000000000000000002";
const SCOUT = "hrn_01K4ZQPX000000000000000004";

const count = Number.parseInt(process.argv[2] ?? "10000", 10);
const FLUSH = 50;
/** A second for ten thousand, scaled to whatever `count` is asked for. */
const budgetMs = (1000 * count) / 10_000;

function message(seq: number): ClientEvent {
  return {
    v: 1,
    type: "message.post",
    id: `evt_${seq}`,
    seq,
    ts: new Date(1_756_800_000_000 + seq).toISOString(),
    workspace_id: WS,
    space_id: CONV,
    actor: { kind: "harness", id: SCOUT },
    idempotency_key: `key-${seq}`,
    text: `Message ${seq} of ${count}`,
  } as unknown as ClientEvent;
}

const events = Array.from({ length: count }, (_, index) => message(index + 1));

const started = performance.now();
const fold = createFold();
let lines = 0;
for (let from = 0; from < events.length; from += FLUSH) {
  fold.push(events.slice(from, from + FLUSH));
  lines = fold.model().spaces[0]?.lines.length ?? 0;
}
const took = performance.now() - started;

const flushes = Math.ceil(count / FLUSH);
process.stdout.write(
  `fold: ${count} events in ${flushes} flushes, ${lines} lines, ${took.toFixed(0)} ms (budget ${budgetMs.toFixed(0)} ms)\n`,
);
if (lines !== count) {
  process.stdout.write(`fold: expected ${count} lines, got ${lines}\n`);
  process.exit(1);
}
if (took > budgetMs) {
  process.stdout.write("fold: over budget\n");
  process.exit(1);
}
