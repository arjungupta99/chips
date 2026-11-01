# 0018. What the event log owns, and what it does not

2 September 2026 · Status: accepted · Amended by [0019](0019-policy-is-a-projection.md)

## Context

[ADR 0004](0004-event-sourced-core.md) says the append-only `events` table is the truth and the
read models are rebuilt from it. Building `rebuild(workspace)` in M0.3 made the edge of that
claim concrete, and a test caught it immediately: `conversations` was in the list of tables
`rebuild` drops, but nothing in Agent Connect creates a conversation, so replaying the log left
it empty. A read model that a replay cannot reconstruct is not a read model.

Two things had to be decided: which tables are projections, and where the events that build them
come from when they are not part of Agent Connect.

## Decision

**The log carries more than Agent Connect.** Decision 4 says every Agent Connect event *and
every human action* is an event. Opening a conversation and adding somebody to it are human
actions, so they are events. `packages/protocol` gains a third direction, `workspace`, holding
`conversation.created`, `membership.added` and `membership.removed`. They are validated by the
same schemas as everything else and appear in the reference under "Chips → the log". They never
travel to an agent: an agent learns it was added to a conversation from `message.new`.

**Ten tables are projections**, dropped and rebuilt by `rebuild`: `conversations`,
`memberships`, `messages`, `runs`, `steps`, `approvals`, `questions`, `attachments`, `lanes`,
`read_state`.

**Four tables are a registry**, written directly by use cases and never touched by `rebuild`:
`workspaces`, `participants`, `devices`, `agent_tokens`.

The line between them is this: a projection is a *view of what happened*, and a registry row is
*a credential or an identity*. An Ed25519 public key and a hashed agent token are not things a
replay should be able to reconstruct — a log that could rebuild them would be a log that
contains them, and the audit log is exportable. Nothing in the audit story needs it: the audit
answers "who did what, when", and the `actor` on every event answers that already.

**Delivery is not an event.** `hello`, `message.new`, `run.requested` and `receipt` are produced
at fan-out time from events that are already in the log. Appending them would record the same
fact twice and make a subscriber's own view part of the truth.

## Consequences

- `rebuild` is honest: the property test in `server/src/infrastructure/store/replay.test.ts`
  applies a random sequence, rebuilds from zero and compares every projection row.
- An event type with no projector still appends. The log is complete whether or not a screen
  cares, which is what makes a new read model a replay rather than a migration.
- Changing an agent's autonomy is an event (`policy.updated`) but `participants.autonomy` is a
  registry column. **Answered by [ADR 0019](0019-policy-is-a-projection.md):** the event is the
  truth, and the policy half of `participants` — along with `workspaces.max_autonomy` — becomes
  a projection. The identity half stays a registry row on the argument above.
- Whoever opens a conversation is its first member: `conversation.created` projects a
  `memberships` row for its actor beside the `conversations` row (3 September 2026, for the
  membership rule on writes — phase-1-interim-review finding 1). Without it the creator's own
  first message would be refused, and a `membership.added` naming themself would be the only
  way in. A later `membership.added` for the same person refines the row rather than adding one.
- Adding a workspace event later is cheap. Adding one that a replay must produce *retroactively*
  is not, so a read model introduced in a later phase has to be satisfiable from events that
  already exist, or it needs a backfill.
