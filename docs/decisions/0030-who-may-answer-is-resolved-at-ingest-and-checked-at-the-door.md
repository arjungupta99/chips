# 0030. Who may answer is resolved at ingest and checked at the door

5 September 2026 · Status: accepted

Decided in M3.3, whose acceptance is a space with two harnesses and two people where an approval
from one harness is answered by the right person per policy.

## Context

Since Phase 1 the policy engine has answered `evaluate(action, harnessPolicy, workspacePolicy)`
with `{ decision, approvers?, reason }` (ADR 0008), and `approval.request` has carried
`approvers` as refs — `owner`, `any`, `role:<name>`, a person id — with the note "Chips resolves
roles". Nothing did. The door dropped the engine's list, stored whatever refs the harness wrote,
and accepted `approval.resolved` from anyone in the space; first answer won (ADR 0022, rule 6),
but nobody asked whose answer it should have been. In a direct space with one person that could
not show. In a room with two people and two harnesses it is the whole question: Ledger is Dana's,
and Arjun is in the room.

Two places could settle it. Delivery could compute who may answer when a card is sent to each
person, and the door could recompute at decision time. Or the door could settle it once, as the
request arrives, and write the answer onto the event.

## Decision

1. **The door resolves.** As an `approval.request` arrives, the engine runs (as it did) and the
   refs to resolve are: the rule's own `approvers` when the rule that decided names any; else
   the harness's `approvers`; else `owner`. Chips resolves them against the harness's owner and
   the room's members — `owner` is the harness's owner, `any` is every person in the space,
   `role:<name>` is the people with that standing there, a person id is itself — to a list of
   person ids, each once, in the refs' order. A list that resolves to nobody falls back to the
   owner; with no owner either, it is empty, which means anyone in the room.
2. **The stored event carries the people, not the refs.** `approvers` on the event and on the
   `approvals` projection is the resolved list. The audit says who could have answered, the
   client draws the card from it without a lookup, and a replay reproduces it because the event
   holds it.
3. **The door checks.** `approval.resolved` from a person not on a non-empty list is refused,
   `not_an_approver`, after first-answer-wins (rule 6) and before anything is appended (ADR
   0022, rule 9). A harness cannot decide at all, as before. An expiry is `system`'s and is not
   checked.
4. **Screens follow the event.** Needs-you lists an approval only to who may answer it; the card
   in the room says *Waiting on Dana* to everyone else and offers no buttons. `mayAnswer` in the
   client core is the same test the door makes.
5. **Resolution happens whatever the verdict.** An ask policy allows or denies on the spot still
   carries who could have answered, so an auto-decided request reads the same as a pending one.

## Consequences

- `approvers` on `approval.request` is documented as resolved by Chips; a harness's refs are its
  request, and the log holds the answer. The golden fixture carries a person id.
- The refs resolve against the space's members, so a role named in a rule is a standing in that
  room (owner, member, guest). Phase 5's workspace roles are a later refinement, and the same
  resolution point is where they will be read.
- A lead answering a specialist's approval — the blueprint's "low-risk only, when policy allows"
  — is not decided here: a lead is a harness, and a harness cannot decide. It is Gate 3's question
  (approval routing inside lanes), and when it is answered it will be one more ref this
  resolution knows.
- The membership rules that arrived beside this — a harness retitles or closes only a space it
  opened, a guest changes nothing, somebody else is removed only by the owner — are rules 7 and 8
  of the same door, recorded in `authorize.ts` rather than here; they are what "several harnesses
  and people in one space" needs the door to say, not a decision of their own.

## Addendum, Gate 3 (5 September 2026)

Decision 1 resolved the refs against the harness's owner and the room, and could name somebody
who is not in the room: a specialist's owner, when the specialist works a lane (M3.1) in the
direct space Chips opened between it and the person the work is for. That person could not
answer (rule 9), the owner could not see the card or send into the room (rule 5), and the ask
sat until its fallback. So the resolved list is now kept to the people in the room; when that
leaves nobody, the person the lane is for answers, when the run is a lane's and they are here,
and otherwise the list is empty, which means anyone in the room. A room the event cannot name is
left as policy named it. `nameApprovers` and `inTheRoom` in `submit-event.ts`; the Phase 3
review, finding 5.
