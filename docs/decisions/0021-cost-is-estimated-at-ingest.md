# 0021. Cost is estimated at ingest, from a per-workspace price table, and recorded on the event

3 September 2026 · Status: accepted

## Context

M1.3 asks for a cost meter "from `usage` with a per-workspace price table". `usage` carries
tokens and, optionally, a cost the agent computed. Most harnesses know their tokens and not
their prices; the ones that know both may disagree with the workspace's own view of what a
token costs. Somebody has to turn tokens into dollars, and the question is where, so that the
meter, the receipt and the audit agree.

Three places were possible: the client, at render time; the projector, when it writes the run's
`cost_usd`; or the door, when the event is accepted.

## Decision

**At the door.** A `usage` that carries no `cost` gets one in `submitEvent`, from the
workspace's price table, and the event is appended with it. A cost the agent computed is kept.
A model the table cannot price gets no cost at all, and the meter shows tokens alone.

The price table is a column on the workspace row — JSON, null for the default — and a registry
column rather than a projection (ADR 0018): what a token costs here is a setting somebody made,
not a view of what happened. The default table in `domain/pricing.ts` is a starting point; a
workspace's rows sit on top of it. Prices are dollars per million tokens and match a model by
the longest fragment of its name the table knows, so one row prices every dated variant.

Scopes add up the way the blueprint says cost rolls up: a run-scoped `usage` is the run's total
so far and replaces it; a step's or a lane's adds to it, in the projector (`increment`) and in
the client's fold alike.

## Consequences

- "Why $1.47?" has an answer in the log: the event carries the number, computed once, with the
  table as it stood. Changing the table later changes nothing already recorded, which is what an
  estimate that was shown to a person should do.
- The projector stays pure: it reads `cost.usd` off the event and never sees a price.
- The client's fold and the server's read model agree, because both read the same field.
- Cost is always labelled an estimate (`estimated: true`, the tilde in `formatCost`), and the
  table is a guess until a workspace sets its own. Editing it is a later milestone's; M1.3 reads
  it.
- One more lookup on the write path, for `usage` events only, before the transaction.
