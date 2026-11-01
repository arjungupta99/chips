/**
 * What a room's job has spent (ADR 0117), worked out from the fake's log as the server does: from
 * the last person's act or brief handed into the room, what the room's `usage` reports said since,
 * a run's own report being its total so far, against what the room allows a job.
 */

import { DEFAULT_SPEND_CEILING_USD, type JobSpend, resetsTheCount } from "@chipschat/protocol";

/** An event of the fake's log, as much of it as the job reads. */
interface StoredEvent {
  readonly seq: number;
  readonly type: string;
  readonly space_id: string | null;
  readonly run_id: string | null;
  readonly actor: { readonly kind: string };
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Where the room's job began: the last person's act, or the last brief handed in. */
function jobStart(room: readonly StoredEvent[]): number {
  return (
    room.findLast(
      (event) =>
        (event.actor.kind === "person" && resetsTheCount(event.type, event.payload)) ||
        (event.type === "run.requested" && typeof event.payload["lane_id"] === "string"),
    )?.seq ?? 0
  );
}

/** What a `usage` report said a run cost, when it said. */
function costOf(event: StoredEvent): number | undefined {
  return (event.payload["cost"] as { usd?: number } | undefined)?.usd;
}

/** What the job's reports have come to so far, run by run. */
interface Tally {
  spent: number;
  readonly totals: Map<string, number>;
  readonly costed: Set<string>;
  readonly silent: Set<string>;
}

/** Count one `usage` into its run's total, and into the job's spend when it is the job's. */
function tally(into: Tally, event: StoredEvent, job: boolean): void {
  const run = event.run_id ?? "";
  const usd = costOf(event);
  if (usd === undefined) {
    if (job) into.silent.add(run);
    return;
  }
  const was = into.totals.get(run) ?? 0;
  const now = event.payload["scope"] === "run" ? usd : was + usd;
  into.totals.set(run, now);
  if (!job) return;
  into.costed.add(run);
  into.spent += now - was;
}

export function spendInLog(log: readonly StoredEvent[], spaceId: string, upto: number): JobSpend {
  const room = log.filter((event) => event.space_id === spaceId && event.seq <= upto);
  const since = jobStart(room);
  const so: Tally = { spent: 0, totals: new Map(), costed: new Set(), silent: new Set() };
  for (const event of log) {
    if (event.type !== "usage" || event.seq > upto) continue;
    tally(so, event, event.seq > since && event.space_id === spaceId);
  }
  const ceiling = room.findLast((event) => event.type === "space.spend_ceiling_set")?.payload[
    "usd"
  ];
  return {
    ceiling_usd: typeof ceiling === "number" ? ceiling : DEFAULT_SPEND_CEILING_USD,
    spent_usd: Math.max(0, Math.round(so.spent * 1e6) / 1e6),
    since_seq: since,
    uncounted_runs: [...so.silent].filter((run) => !so.costed.has(run)).length,
  };
}
