# 0019. An agent's policy is a projection; its identity is a registry row

3 September 2026 · Status: accepted · Amends [0018](0018-event-sourced-and-registry.md)

## Context

[ADR 0018](0018-event-sourced-and-registry.md) put `participants` in the registry: written
directly by a use case, never dropped or rebuilt. It also left a question open, because M0.3 did
not need to answer it — an agent's autonomy level lives in the `participants.autonomy` column
*and* is implied by the history of `policy.updated` events. Nothing read the column except the
`hello` handshake, so nothing could disagree yet.

M1.4 makes them able to disagree. The policy engine reads an autonomy level on every action, and
the question it exists to answer after the fact is *"why was this allowed?"* — which needs the
level **as it was at that moment**, not as it is now.

Two ways to settle it:

- **The column is authoritative.** Changing the dial writes the column and also appends a
  `policy.updated` event for the record. One lookup, and fast. But the log becomes a
  *description* of the change rather than the change itself, and the first write path that
  updates the column without appending will make the audit log quietly wrong with nothing to
  catch it. That is precisely the drift [ADR 0004](0004-event-sourced-core.md) exists to prevent.
- **The event is authoritative.** Changing the dial *means* appending `policy.updated`. The
  stored level is a read model derived from the log.

## Decision

**The event is the truth. An agent's policy is a projection.**

`participants` splits along the line ADR 0018 already drew, rather than sitting on both sides
of it:

| Stays a registry row | Becomes a projection |
|---|---|
| `id`, `workspace_id`, `kind`, `display_name`, `owner_id`, `parent_id`, `ephemeral`, `capabilities`, `created_at` | `autonomy`, `budget_usd`, `spent_usd`, and policy rules |

The projected fields move to their own read model — an `agent_policy` table keyed by
`(workspace_id, agent_id)` — built from `policy.updated`, with `spent_usd` accumulated from
`usage`. It is dropped and replayed by `rebuild(workspace)` like every other read model.

`workspaces.max_autonomy` moves the same way and for the same reason: a workspace cap is a policy
decision somebody made, it already travels on `policy.updated` as `workspace_max_autonomy`, and
"what was the cap when this ran?" is the same question in a different scope.

**There is no other way to change a policy.** No use case writes `agent_policy` directly. An
agent created with an autonomy level appends an initial `policy.updated` as part of creating it,
so a newly minted agent has a policy row for the same reason it has any other read model. That
also means the dev-mode bootstrap stops setting `participants.autonomy` and appends an event
instead.

The identity half stays a registry row because ADR 0018's argument still holds for it: a display
name and an owner are not things a replay should have to reconstruct, and nothing in the audit
story needs them to be.

## Consequences

- **"Why was this allowed at 3pm?" becomes answerable.** Replay to that sequence number and the
  policy the engine saw is the policy the log produces. Today it would not be.
- **The audit cannot disagree with the engine**, because the engine reads what the audit builds.
  There is no second copy to drift.
- **A policy read is still one indexed lookup.** `agent_policy` is a table like any other read
  model; being derived does not mean being computed at request time.
- **Creating an agent becomes two writes in one transaction** — the registry row and the initial
  `policy.updated`. If the second is forgotten the agent has no policy, which fails loudly on its
  first action rather than silently defaulting to something permissive.
- **`spent_usd` was already a projection in all but name**, accumulated from `usage` events. This
  makes that honest and removes the question of who decrements it.
- **The seam is exactly one table wide.** `participants` keeps its primary key; nothing that
  references an agent by id changes.
- **`hello` reports the projection.** It already reports `autonomy` and `policy`; it now reads
  them from the read model rather than the registry row.
- **This amends ADR 0018, it does not supersede it.** The ten projection tables, the four
  registry tables and the treatment of delivery-only events all stand; `participants` and
  `workspaces` now each have a foot in both camps, which is what the table above records.
- **Migration is M1.4's**, not a Phase 0 fix. Nothing today reads `participants.autonomy` except
  `hello`, and no `policy.updated` events have ever been appended, so there is no divergence to
  repair — only a column to stop writing and a read model to start building.
