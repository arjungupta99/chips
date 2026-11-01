# 0029. A lane is a run.requested appended in the specialist's own space

5 September 2026 · Status: accepted · Decision 3 amended by [0087](0087-a-harness-has-agents-and-an-agent-is-in-one-room.md), 29 September 2026: a lane's home is the specialist agent's room, or one Chips opens when it is free

Decided while building M3.1, the lane data model. The blueprint and the plan say what a lane is —
one object, two views, never a copy — but not how the two views come to exist in an
event-sourced log where a credential reads only its own spaces. This records the shape that
makes it work.

## Context

The blueprint draws a lane as a single run that lives in the specialist's chat and is linked
into the lead's. A lead posts `task`; the specialist gets `run.requested` with the trail; the
specialist posts its reply once; the lead hears `lane.updated`. Four events, three of them
already in the protocol before this milestone.

Two things about the log made the naïve reading impossible. A harness reads only the spaces it
is a member of (phase-0-review finding 6), and the lead's space is not one the specialist is in.
And `run.requested` was classed *delivery-only*, beside `message.new` — a per-recipient
transform of an event that had already appended, never a row in the log. But there is no single
appended event a delivery transform of `run.requested` could be made from that both the lead and
the specialist can see: the `task` is in the lead's space, which the specialist cannot read.

## Decision

1. **`run.requested` is appended, not transformed.** When a lead's `task` lands, Chips appends a
   `run.requested` into the specialist's home space, with the specialist's run in the envelope.
   It is reclassified from delivery-only to system-only — a client still may not send it, but
   Chips writes it to the log and projects it. It carries three new fields the lane row needs:
   `specialist_id` (whose run the envelope names), `link_to` (the lead spaces the route card
   appears in) and `origin` (the message that caused the routing).

2. **The lane row is the projection of `run.requested`; the specialist's run is seeded there
   too.** The lane is found by its id, by the run it is, or by the lead run whose cancellation
   cascades to it. The specialist's run is seeded `running`, so the specialist's first message or
   its completion lands without a `run.started` — a harness that sends one restates it, which the
   run accepts.

3. **The home is the specialist's direct space with the person, or one Chips opens.** A lane
   lives where the person already reads the harness. If the specialist has no direct space with
   the person — a Jacobian Space specialist, an ephemeral child — Chips opens one, keyed so a
   second lane reuses it. (A refinement, noted below: let an adapter name a worktree home.)

4. **Depth and loops flatten; they are not refused.** The pure `decideRoute` opens a lane at
   depth one below its parent, up to three; a fourth level, or a route back to a participant
   already in the trail, returns no lane and the router writes a step on the lead's own run
   instead. A refusal would fail a legitimate chain (blueprint: "flattened into steps, not
   rejected").

5. **Cost is carried on the lane, not rolled into the lead harness's spend.** A completed lane's
   `lane.updated` carries `cost_usd`, and the lane row holds it, so the lead's panel can total the
   chain. Rolling it into the lead's *run* through a `usage` event would grow the lead harness's
   budget spend by another harness's cost, which is wrong: cost rolls up the trail for display,
   but budget is per harness. The visible roll-up in the run panel is the lead's client summing
   its linked lanes (M3.2).

6. **The router appends its own events straight to the store**, the way the sweep and the policy
   engine do (ADR 0022's consequence): they are Chips' own, so they do not go back through the
   door. `submit-event` calls the router once after a non-duplicate append; a cascade recurses
   over the store directly and so never loops back through the door.

## Consequences

- `run.requested` and `lane.updated` now project; the projector test's delivery-only list drops
  `run.requested` and keeps the true transforms (`hello`, `message.new`, `receipt`).
- A lane's messages exist once, in the specialist's space; the lead reads them through the lane
  it is linked to, and through `lane.updated` for state and result. No copy, no double count.
- **Refinements left for M3.5 and M3.2**, recorded in `STATUS.md`: an adapter naming a worktree
  as a lane's home rather than always the canonical direct space; the lead's run panel summing
  linked-lane costs; a lane's autonomy clamped to the lead's own rather than defaulted; and
  forwarding a task's attachments through `run.requested` once they can be signed for the
  specialist's token.
- The kit restates the door (finding 11); its own not-submittable list keeps `run.requested`,
  which stays true — a harness never sends one. The Lanes conformance row is M3.5's.

## Addendum, Gate 3 (5 September 2026)

Three things the router took on a lead's word, and now checks (the Phase 3 review, findings 1
to 4): `link_to` is honoured only for a space the lead is in, and the space the task was sent
from is always linked, so a lane's news cannot be written into a room the lead cannot read;
`on_behalf_of` must be a person who exists and is either the lead's own owner or in the space
the task was sent from, so a lead cannot open a room in a stranger's sidebar or for nobody; and
a `task_id` that already names a lane another lead opened is flattened, and acknowledged with
no lane. And decision 4's cascade stops at a lane that has already ended: a completed lane is
not cancelled after the fact, and its specialist is not sent `run.cancel` for a run it finished;
the chain below it is still walked.
