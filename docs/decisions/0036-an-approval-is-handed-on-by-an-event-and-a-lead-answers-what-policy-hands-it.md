# 0036. An approval is handed on by an event, a role reads both standings, and a lead answers what policy hands it

6 September 2026 · Status: accepted

Decided in Phase 5 · People, for M5.5 (approval routing): route to a role or a teammate, batch
approve, the audit recording who decided. Answers open decisions 2 and 7 of the plan (section
0.6); Gate 5 records them in the plan.

## Context

ADR 0030 settled who may answer an approval: the refs a harness or policy names (`owner`,
`any`, `role:<name>`, a person's id) are resolved to people when the request arrives, written
onto the stored event, and the door takes a decision only from one of them. Three things were
left: a person could not hand an ask to somebody else once it was on the card; a `role:` was a
standing in the *space* only, though ADR 0034 gave people a standing in the workspace; and no
harness could ever decide, so the blueprint's promise — policy hands low-risk requests inside a
lane to the lead with a one-line notice — had only its safe half (open decision 7). And the
Phase 1 review asked how far `always` reaches (open decision 2), to be settled when routing to a
role arrived.

## Decision

1. **Handing on is an event, resolved like the request.** `approval.routed` names an approval
   and `to`, the same words as `approvers` on the request. Chips resolves `to` at ingest — from
   the asking harness's owner, the room's members and the lane's lead — writes the ids onto the
   event, stamps `routed_by` and `routed_at`, and the projection replaces the approval's
   `approvers`. Nothing else about the ask changes: not its expiry, its state or its run. Rule
   14 says who may: somebody who may answer it (named, or anyone when nobody was named), or an
   owner or admin of the workspace; a person, never a harness; and never once it is decided.
   The card says who handed it on and why; the audit records it beside the decision.

2. **`role:<name>` reads both standings.** A person's standing in the space (owner, member,
   guest) and in the workspace (owner, admin, member, guest) share words, and a ref matches
   either: `role:admin` names the workspace's admins in the room, `role:owner` the room's owner
   and the workspace's. The list is still kept to the people in the room (ADR 0030, Gate 3).

3. **A lead answers what policy hands it (open decision 7: yes).** `lead` is a ref, resolved to
   the harness leading the lane the run is, when it is one. A decision is a shared event since
   M5.5, and rule 9 is what admits a harness: only when the approvers name it. Being named is
   standing enough — the lead is not in the specialist's room — so for a decision alone rules 4
   (another harness's run) and 5 (a room the sender is not in) stand aside, and visibility
   follows: an approval that names a viewer reaches them wherever it is, live and on replay. A
   person the work is for is not handed it and cannot answer it; they may take it back with
   `approval.routed` to themselves, since they run the workspace or may answer. The card
   carries the notice: *policy let Scout answer this*. Anything else a lead sends into the
   specialist's run is refused as before.

4. **`always` reaches the room, for that harness (open decision 2).** A decision with
   `scope: "always"` becomes a rule in the harness's policy for the space it was made in, as
   `ruleFromAlways` does today, and handing the approval to a role does not widen it: an admin
   who answers *always* makes the same room rule. A workspace-wide rule is a deliberate
   `policy.updated` with no space, which is an admin's to make. The safer reading, kept.

5. **Batch approval is many decisions.** Approving several items from the queue is one
   `approval.resolved` per approval, each with its own key and its own `resolved_by`, so first
   answer wins per ask and the audit records each. No batch endpoint.

## Consequences

- The door's rule 9 grows a harness clause and rule 14 joins it; `approval.resolved` is a
  shared event in the server and in the conformance kit, whose fake refuses a harness deciding
  since its one harness is the one asking. `MemberView` carries the workspace role;
  `ApproverFacts` carries `workspaceRole` per person and `lead`.
- `approverRef` allows `lead` and a harness id, since a resolved list may hold the lead's.
- The client folds `approval.routed` into the approval's `approvers`, `routedBy`, `routedAt`
  and `routedReason`, and audits it; the store sends it; the card offers *Hand to…* to whoever
  may answer or runs the workspace, and the queue offers *Approve selected* and *Deny selected*.
- Not done here: a policy rule's `approvers` naming `lead` by default at low risk (a preset
  choice, Phase 6's policy work); notifying the new approvers (M5.6).

## Addendum, Gate 5 (6 September 2026)

The gate's probes found decision 3 too wide and decision 1 too narrow, and both are changed in
the tagged commit.

- **A lead is handed an ask by a person's rule, never by the specialist's own refs, and never
  one that matters.** As written, a specialist could put `lead` — or the lead's id — in its own
  `approvers` and have the lead, another harness, approve a $5,000 external payment: two
  harnesses agreeing, no person. Now the refs a harness names for its own ask are people —
  `owner`, `any`, a role, an id — and `lead` or a harness id among them is dropped; only a
  policy rule, which a person wrote, names the lead. And whoever named it, a harness is dropped
  from the names of an ask that *matters* — money, a deletion, an external action, a hot risk
  class, `matters()` in `policy.ts` — so those always reach a person, which is the blueprint's
  sentence. `judge`, `peopleOnly` and `peopleFor` in `submit-event.ts`; the Phase 5 review,
  finding 1.
- **`any` is everyone in the room but a guest, and an ask that names nobody is anyone's but a
  guest's.** A guest is let into one room to be talked to, not to say yes for the harness's
  owner; a guest answers when named by id, and not otherwise (rule 9's guest clause). Finding 2.
- **A list that names nobody present goes to the owner when the owner is here**, before it
  becomes anyone's: a harness could name a ghost and turn its default — its owner — into anyone
  in the room. `inTheRoom`; finding 2.
- **Handing on names somebody, or is refused.** `to` resolved strictly, with no fall-back to the
  owner, and kept to the room and the lane's lead; nobody left — a ghost, a person outside the
  room, `lead` outside a lane or for an ask that matters — is `invalid`, not widened to anyone.
  `fillRouting`; finding 2.

