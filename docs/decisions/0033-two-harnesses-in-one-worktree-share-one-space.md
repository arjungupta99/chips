# 0033. Two harnesses in one worktree share one space

5 September 2026 · Status: accepted · Narrowed by [0041](0041-chips-integrates-harnesses-that-run-themselves-not-the-cli-you-sit-at.md)
· Decisions 1 and 2 amended by [0087](0087-a-harness-has-agents-and-an-agent-is-in-one-room.md), 29 September 2026: shared keys and joining by them go with room keys

Open decision 6 of the plan, raised at the Phase 2 review and answered by Arjun after M3.5:
**merge**, and use separate worktrees to keep two harnesses from conflicting on disk. This
records what the answer means in the code, and what it does not.

## Context

ADR 0024, decision 3, keyed a harness's space by its durable unit of work — for Claude Code the
git worktree — and stored the key prefixed with the harness's own id, so no adapter could name
another's space and two harnesses in one worktree were two spaces side by side, each with its own
history. It left merging or linking them to Phase 3. M3.3 built rooms that hold several
harnesses and people; M3.5 built lanes between two spaces of one harness. Neither forced the
choice, and STATUS carried a recommendation to merge: a worktree is one place, the blueprint
draws it as one row with the harness as a tag, and mentions now address a harness inside a room.

The question underneath, which Arjun asked plainly, is what a room is and what happens to the
code. A space is the chat thread — one history, one set of members, one run panel. Chips never
touches the files. Two harnesses working in one checkout can trample each other on disk exactly
as two people sharing a checkout would, whichever way the spaces go.

## Decision

1. **A worktree's key is shared.** An adapter that opens a space for a place other harnesses
   may work in too says so — `shared: true` on `POST /v1/harnesses/:id/spaces` — and the key is
   stored under a namespace of its own, `shared:<key>`, rather than prefixed with the harness's
   id. The Claude Code bridge marks every worktree key shared; a session with no directory stays
   the harness's own. A JSpace's key stays Jacobian's own: a Jacobian Space is not a place
   another harness works in.

2. **The second harness joins the space the first opened.** Found by the shared key, the space
   gains the second harness as a member, and its owner as a member when that is somebody not
   already in the room; the first harness stays the one that opened it, and the first owner
   stays the owner. The answer says `joined: true` once; after that the space is simply found.
   A race between two harnesses opening the same worktree at once resolves the same way: the
   loser of the append finds the winner's space and joins it.

3. **Separate worktrees are the rule against conflicts.** Merging changes only what a person
   sees — one thread instead of two — and nothing about what two harnesses do to the same
   files. Arjun's rule: give each harness its own git worktree, which keeps them apart on disk
   and gives each its own space without any decision. A shared space is for the case where two
   harnesses really do work in one place, and its value is that both streams are read together,
   so a person notices when one steps on the other.

4. **Chips calls Jacobian's node a JSpace.** Arjun's suggestion, to keep Chips' space and
   Jacobian's Space from colliding in prose. Jacobian's own code keeps its word; Chips' docs and
   comments say JSpace when they mean Jacobian's tree node, and space when they mean the chat.

## Consequences

- `open-space` takes `shared`, stores the key accordingly, and joins a harness to a shared space
  it did not open; the HTTP answer carries `joined`. The conformance kit's fake stores a shared
  key under the same namespace and, having one harness, never joins.
- A lane whose specialist is a harness in a shared space still finds a direct space between
  that harness and the person through the shared room, since both are members of it; a lane
  keyed to a worktree names it as `home` (ADR 0032) either way.
- ADR 0024's decision 3 is superseded for worktrees by this one; its addendum says so.
- Nothing serialises two harnesses in one folder. A rule that lets one run at a time in a
  worktree would be a policy feature, later, and is not part of this decision.

## Addendum, 7 September 2026: the spaces that existed before this

Decision 1 changed where a worktree's key is stored — `shared:<path>` instead of
`<harnessId>:<path>` — and **nothing rewrote the rows that already had one**. This ADR did not
say what should happen to them, and the answer turned out to matter within two days.

Arjun's own database is the case. The Claude Code bridge opened `Chips · main` on 5 September at
03:59 under `hrn_01M1QSR396CZEH2QEBQDCDQTJJ:/Users/ada/Work/Chips`. The commit that made
worktree keys shared landed at 21:20 the same day. On 7 September the bridge asked for
`shared:/Users/ada/Work/Chips`, `openSpace` did its one exact lookup, found nothing, and
opened a second `Chips · main` beside the first — one worktree, one harness, one machine, two
rooms, and all the history in the one nothing was writing to any more.

**A shared key that finds nothing falls back to the asking harness's own key for the same
path**, and the space it finds is the space it gets. Only that harness's own legacy key, and
only for a key it marks shared: a lookup that reached across the namespace would undo the reason
the namespace exists — no adapter may name another's space (ADR 0024, decision 3) — in order to
fix a transitional problem. It costs one indexed lookup, and only on a miss.

A migration would have been the other way to do it, and it is the wrong one twice over. The
server cannot tell a worktree key from a JSpace key by looking, because only the adapter knows
which of its keys are shared; and `spaces` is a projection (ADR 0004), so a row rewritten by a
migration would go back to what the `space.created` event says the moment anything replays.

**What this does not fix.** The legacy space keeps its old key, so it is still stored as that
harness's own. A *second* harness working in the same worktree will miss both keys and open a
room of its own — the split this ADR exists to prevent, for spaces that predate it. Rewriting
the key to heal that needs an event of its own, and it is not worth a permanent addition to the
wire for a transitional case with no second harness in it yet. M7.3 brings the first one; it can
decide then, with a real case in front of it.

