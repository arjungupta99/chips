# 0032. A lane between two spaces of one harness is a task the lead routes to itself

5 September 2026 · Status: accepted

Decided while building M3.5, the adapters and the SDK. The plan says a lane between two spaces
of one harness — Jacobian's `hand_down`, a Claude Code subagent — is the same object as a lane
between two harnesses, keyed by the harness's own trail. ADR 0029 built lanes between harnesses
and left, as a refinement for M3.5, "an adapter naming a worktree as a lane's home". This
records how the one-harness case is the same object.

## Context

Three things about the one-harness case did not fit ADR 0029's shape as it stood.

- **The specialist is the lead.** A Space Jacobian hands down to is not a participant; a
  subagent is not one either. ADR 0029's ephemeral children (`task.child`) mint a participant
  per lane, which would put a harness in the fleet for every subagent Claude Code runs and give
  each a direct space of its own, and would need the lead's token to speak for the child at the
  door. The blueprint's addendum to ADR 0024 already said where these lanes live: a worker
  under a task Space shows in that Space's room, and "the worker level is what lanes carry".
- **The home is a room the lead already has.** Jacobian's Spaces are spaces the plugin opened;
  a subagent works in the worktree its session is in. ADR 0029 always put a lane in the
  specialist's direct space with the person, or opened one.
- **A route back to a participant already in the trail flattens** (ADR 0029, decision 4), and a
  lead routing to itself is in its own trail by construction.

## Decision

1. **`task.to` may name the lead itself.** The lane's run is then the lead's own, seeded in the
   home, so the lead's token drives it at the door with no new rule. Routing to oneself is not a
   loop; the depth limit bounds the chain as it bounds any other.

2. **`task.home` names the room, when the lead has one.** One of the lead's own spaces — a
   Jacobian Space's room, the worktree — which both the lead and the specialist must be in; a
   room the lead is not in flattens the task with a note, rather than landing somewhere the
   lead did not say. Absent, ADR 0029's home stands: the specialist's direct space with the
   person, opened if it has none.

3. **`task.label` says what to call the work.** A Space's name, a subagent's type. It travels on
   `run.requested` and the cards call the specialist by it, which is what tells "J → Shopping"
   from a monologue. An ordinary lane has none and the cards use the specialist's name.

4. **The acknowledgement of a `task` carries the lane** — its id, its run, its home — on both
   transports, and again on a retry. An adapter that drives the lane itself from hooks or a
   bubble needs to know where to post before the next hook fires, and `run.requested` arrives
   on the socket later, or not at all for a bridge that has none.

5. **One room, one card.** A lane whose home is the room it is linked into — a subagent working
   in its lead's worktree — draws the route card only; the task card would be the same lane
   under the same message. The route card carries the reply, the cost and, while the lane
   goes, a way to cancel it.

## Consequences

- Jacobian's placement — the walk's receipt, `🤖 → Shopping → Amazon` — opens a lane in the room
  the message went to, and the turn's answer lands there; J's room reads it through the route
  card. A `hand_down` in the bubble opens a lane to the Space handed down to, closed when the
  parent moves on, with the model calls made meanwhile as its cost. Neither needs a seam on
  Jacobian's side; both are done from what the channel can see. What the channel cannot see —
  the child's own tool calls, and what it handed back — stays inside the engine, so a
  delegation lane's summary says only that the work came back.
- A Claude Code subagent is a lane at home in the worktree, called by its type; the hooks that
  fire inside it land on the lane's run, and its stop completes the lane. Without an owner to
  route on behalf of, or when Chips flattened the task, it stays a step, as it was.
- The SDK's `run.task()` sends the task and resolves with a `Lane` once Chips has said where it
  is; `lane.work()` is the run for a lane the lead works itself; `chips.runs.accept()` takes up
  a routed run on the specialist's side. The conformance kit's fake opens a self-routed lane and
  flattens any other target, since it has one harness, and its Lanes row is lit by `task`.
- Ephemeral children stay as ADR 0029 left them: a participant of their own, for a lead that
  really spins up a new agent. The two shapes coexist; neither replaces the other.
- Open decision 6 (merge or link two harnesses in one worktree) is untouched: a self-lane's home
  is a room the one harness already has, and nothing here changes how a worktree is keyed.

## Addendum, 12 September 2026: Jacobian's delegation lane is closed by the engine, not by the next tool call

The first consequence above said a `hand_down` lane closes "when the parent moves on", with the
model calls made meanwhile as its cost, and that neither of Jacobian's shapes needed a seam on
Jacobian's side. The first live delegation seen through Chips showed what "the parent moves
on" meant on the wire: a `hand_down` runs its child on the parent's own session, so the next
tool call the bubble saw was the child's first, and the lane completed "Handed back." two
minutes before the child had done anything, with the child's steps landing on J's run and its
cost counted nowhere (Jacobian's debug-jacobian #95).

Jacobian grew the seam. `TurnSession.onTurnEntered` and `onTurnEnded` now bracket every turn
on a live session, the bubble contract forwards them, and the adapter opens the lane when the
child's turn begins, carries the child's status and steps on the lane's run while it is open,
and completes the lane when the child's turn ends with what the child said — or fails it with
why — billed with the rounds the child made under its own id. A hand_down the engine refuses
never enters and stays a step; a lane the engine never closes comes back as before at the
turn's end. Nothing here touches the protocol: decision 4 is what made it possible, since the
acknowledgement already carries the lane, and the adapter merely learned when to close it.

## Addendum, 13 September 2026: the lead is named by the room it routed from

Decision 3 gave the specialist a name and left the lead with its participant's. From J's room
that reads true, "J → Shopping", and it is the case the decision was written from. From a
Space's own room it does not: asked in Jacobian's Chess Game room for a screenshot, the Chess
Game Space handed down to its Engineer and the route card read "J → Engineer", as if the work had
come from J. The walk had started at Chess Game and J was never asked. On a lane between two
spaces of one harness both ends are the one participant, so its name tells the reader nothing
about where the work came from.

The client names it by the room. A hop of such a lane, the lead's included, is called by the
title of the room its run was in, or for the lead the room the task was sent from, when that room
is one of the harness's own: opened by the harness and titled after the part of it that works
there, as the rooms an adapter opens with `POST /v1/harnesses/:id/spaces` are. The model carries
it as `Lane.leadLabel` and `LaneHop.label`, and a Needs-you item raised inside a lane carries the
lane's `label` as `laneLabel`, so its chain reads "Arjun → Chess Game → Engineer" rather than
ending on the harness it began with. A room somebody else opened keeps the participant's name: a
group room, or the direct space Chips opened with the person when the harness was added, which is
J's room, so a hand-down from there still reads J. So does a lane between two participants, where
the names are the answer. Nothing changes on the wire: the trail already carries each hop's run,
and the fold already knows each room's opener and title.
