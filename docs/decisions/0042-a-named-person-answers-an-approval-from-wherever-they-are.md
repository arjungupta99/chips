# 0042. A named person answers an approval from wherever they are

7 September 2026 · Status: accepted

Decided in Phase 4 · Mobile and the relay, before M4.2. Answers open decision 9 of the plan
(section 0.6), which Arjun answered *yes* on 7 September 2026; Gate 4 records it in the plan.

## Context

ADR 0030 settled who may answer an approval: the refs a harness or policy names — `owner`,
`any`, `role:<name>`, a person's id — are resolved to people when the request arrives, written
onto the stored event, and the door takes a decision only from one of them. Gate 3 added that
the resolved list is kept to the people **in the room**, because the card reaches the room's
members and rule 5 would refuse anybody else's decision anyway; a name outside it could only
ever be a dead letter. ADR 0036 made one exception: the lane's lead, whom policy may hand a
low-risk ask, answers from outside the specialist's room, because being named is standing
enough.

Two things made the room too small a place to ask in.

The first is the blueprint's own sentence — *the owner receives escalations by default* — which
is false whenever the harness's owner is not in the room its work is happening in. A specialist
working somebody else's room asks, its owner is elsewhere, and the ask quietly becomes anyone's
in the room, or nobody's.

The second is the phone. Phase 4's card is a push notification with Approve and Deny on the
lock screen: *a decision is waiting*. What makes that worth building is that it finds you
wherever you are — and if being named only counts inside a room you happen to be in, the person
most likely to be reached on a phone is exactly the person the ask cannot name.

Open decision 9 asked whether a person named from outside the room may answer. Arjun: yes.

## Decision

1. **Being named is standing enough, for a person as it already was for the lead.** Rule 5 —
   an event into a space comes from a member of it — stands aside for `approval.resolved` and
   `approval.routed`, and rule 9 judges them instead. Rule 9 therefore now carries the room
   itself: an ask that names *nobody* is still answered only from inside the room, since "anyone"
   has always meant anyone here.

2. **A person named by their own id is kept wherever they are in the workspace**, at ingest,
   where the resolved list used to be cut to the room. `owner` likewise resolves to the
   harness's owner wherever they are. `any` and `role:<name>` are unchanged: they name the room,
   and produce nobody outside it.

3. **A guest is named only inside the one room they are in.** ADR 0034 gives a guest one space;
   being named does not take them out of it, at ingest or at the door. (Sub-choice, decided
   here: the alternative — a guest answering from outside their room — would make the one-room
   rule a fiction.)

4. **`role:<name>` stays the room's** (sub-choice, decided here). A role is a description of who
   is here, not a choice of person, and `role:admin` reaching every admin in the workspace would
   turn one room's ask into a workspace-wide broadcast. Somebody who wants an absent admin names
   them.

5. **A lane's own person still comes first when they are here.** With `owner` now reaching
   outside the room, the specialist-in-somebody-else's-room case of Gate 3 would otherwise
   reverse: Ledger, working a lane for Arjun in Arjun's room, would ask Dana, who owns Ledger and
   is not there. The order when nobody named is in the room is: the harness's owner when they are
   here, then the person the lane is for when they are here, and only then the owner elsewhere.
   `owner` is a role, not a choice of person; a person named by id outranks all of it.

6. **A decision names who could have answered it.** `approval.resolved` and `approval.executed`
   gain an optional `approvers`, written by Chips from the approval — on the wire, in policy's
   own answer, and in the sweep's expiry — and `canSee` admits both to a named viewer as it
   admits the ask. Without this, somebody outside the room would be sent the question and never
   the answer, and the card on their phone would never cool.

7. **A hand-on carries what the ask is.** Somebody handed an approval in a room they are not in
   was never sent the `approval.request` that raised it — their name was not on it — so
   `approval.routed` gains an optional `ask` (the harness, the action, the risk classes, the
   expiry), written by Chips from the approval. The client builds the card from that when it has
   not seen the request. No preview and no sources travel with it: those are the room's.

8. **The room stays the room.** A space the reader knows only through an ask that named them is
   a `glimpse`: it is not listed in the sidebar, and the card in Needs you says *in a room you're
   not in* and offers no Open. All that ever reaches them of that room is the ask, its hand-on,
   its decision and what came of it.

## Consequences

- **An ask now reaches somebody who is not in the room, which the room's members cannot see.**
  The card says who may answer, so the room is not left guessing; the audit records the hand-on
  as it did before.
- **An ask whose harness's owner is elsewhere is now theirs, not the room's.** Before, such a
  list resolved to nobody and became "anyone in the room but a guest"; now it names the owner.
  That is the blueprint's sentence, and it is a real change in who may press the button: the
  people in the room can no longer answer for an absent owner unless the ask says `any`. It is
  the same direction Gate 5 took when it stopped a list that named nobody present from becoming
  anyone's.
- The conformance kit's fake mirrors rules 5 and 9, so a harness that meets one meets the other.
- `Space.glimpse` and `NeedsYouItem.outside` are new on the client; the sidebar filters glimpses
  and *Hand to…* offers the workspace's people who are not in the room, marked *not in this room*.
- The replay predicate needed no change: it reads `$.approvers` from whatever `APPROVER_EVENTS`
  names, and the two decisions joined that set.
- Not done here: telling the named person by push, which is M4.3's and ADR 0037's ledger; a
  read-only view of the one approval in its room, which the card's absent Open would open.

## Alternatives considered

- **Add the outsider to the room.** Honest, and wrong: an approval is not a reason to see a
  room's history, and removing them afterwards is a second decision nobody would remember to make.
- **Leave the room as the boundary and rely on the lead exception.** It works for lanes and for
  nothing else; it does not reach a person, which is what money and deletions must do.
- **Widen `any` and `role:` too.** Simpler to explain, much wider in effect: one room's ask
  becomes every admin's notification. Rejected as point 4.
