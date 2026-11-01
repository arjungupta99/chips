# 0026. The conformance kit is a fake Chips that speaks the wire

5 September 2026 · Status: accepted

## Context

M2.5 asks for "a fake Chips server plus a driver that walks an adapter through the golden
scenario and prints the checklist rows", with `chips conformance <adapter>` and a CI job per
adapter; the blueprint says `chips conformance` "runs your adapter against the protocol and
prints the same checklist the app shows". Both adapters already have integration tests against
the real `chipsd` in process (`createTestWorkspace`), so the first question was whether the kit
should be that — the real server, driven — or something else.

## Decision

1. **A fake, not the server.** `packages/conformance` holds an in-memory Chips that speaks the
   routes and the frames field for field — the space door, both event routes, the approval long
   poll, uploads and attachments, `GET /v1/events`, and `/v1/ws` with the handshake, the
   subscription, replay from `since`, acks, receipts and pings — and fills in, validates and
   refuses an event the way the server's door does: the envelope Chips stamps, `parseEvent` from
   the protocol, and the six rules of `authorize.ts` restated (workspace, actor and direction,
   the key, the run's life, membership, first answer wins). It depends on `@chipschat/protocol` and
   `ws` and nothing else of ours, so a third party's adapter can run it without `better-sqlite3`
   or the server, and so an adapter is checked against the protocol rather than against
   whatever the server happens to do this week.

2. **No policy engine, no pricing, no sniffing.** Every approval waits for the person; the
   fake's `hello` reports autonomy 1, which is the level where that is true. A `usage` without a
   cost is delivered without one, and noted. An upload's mime type is its filename's. Each of
   these is said in the report or the docs rather than imitated badly. What the real server's
   dial would have allowed unasked is the integration tests' business.

3. **The driver plays the person, and only the person.** It says the golden scenario's first
   line in the direct space, answers whatever the harness asks — a card approved with "Go
   ahead.", a question with its default — until the run ends or nothing more comes, then reads
   the log. It knows nothing of hooks or keyboards. An adapter is a *subject*: `start` against
   an address, `stop`, and — for a harness that cannot act in a test — `turn`, which the kit
   calls with the message so the subject can play the harness's side. Jacobian's subject answers
   for itself on its socket; Claude Code's plays the terminal by posting the hooks a real
   session fires to the bridge's door; `custom` prints the address and waits for whoever
   connects.

4. **The rows are the protocol's.** The app's checklist moved from `Harnesses.tsx` to
   `@chipschat/protocol` as `CONNECTION_CHECKLIST`, and the kit prints that list, so the report and
   the Harnesses tab cannot disagree about what a harness has earned. Passing is the plan's
   four — Messages, Approvals, Steps, Usage (the row is called Cost) — plus Runs and Finished,
   which no run is without, and nothing refused. Questions and Context are reported and not
   required. Lanes waits for M3.5, with `task`.

5. **Findings beside the rows.** A refusal is an error, with the server's own words. A run event
   sent without a run, a yes with no `approval.executed`, a step left `started`, a run left
   running are warnings. A usage without a cost and a run that failed are notes.

## Consequences

- An adapter that passes has spoken the protocol. It has not been shown to work with a
  particular server's policy, and the docs say so.
- The door rules exist twice — `server/src/domain/authorize.ts` and
  `packages/conformance/src/workspace.ts` — because the kit may not import the server's domain.
  The kit's `workspace.test.ts` is written rule for rule against the server's, so a change on
  one side shows on the other first as a test.
- The kit found two things on its first run, both fixed or tracked (Phase 2 packet, M2.5):
  Claude Code's `Stop` now posts the reply as a message before the summary, and Jacobian's
  plugin reads a cost store the runtime does not yet carry.
- `chips conformance custom` is the first thing a stranger's harness meets, and the cold-read
  test at M2.6 should include it.
