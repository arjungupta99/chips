# 0151. The desktop's room sheet is the phone's, and nothing says Done

Date: 11 October 2026
Status: Accepted, 11 October 2026, on Arjun's "go with B, build it" and "carry on with B". Replaces
the desktop's members panel. Amends ADR 0100 (the Mac's Files), ADR 0104 (the Mac's Lead picker),
ADR 0117 (the Mac's amounts), ADR 0147 point 8 (the header's and the run panel's state) and ADR
0148 point 5 (the desktop's Add after an empty room). Applies ADR 0050's no-Done to the desktop.

## Context

Arjun, 11 October 2026, with a screenshot of Chips for Mac in the Restaurant Tracking room: "We
need to polish desktop flow. First of all there are these useless "Done" labels then this members
box is hard to dismiss. Please go through the web / desktop flow and polish it. Make it parity
with Mobile flow".

The desktop said Done three times for one finished run: a green pill in the room's header, a DONE
pill at the head of the run panel, and the reply that ended the run painted done-green. A route
card said Done too. The phone has said none of it since ADR 0050: the reply is the proof.

Who was in a room lived in a panel inside the page. It pushed the messages down and went away only
when its own button was pressed again. It held a `<select>` to add from, a second dialog for a new
agent, a Rename field, a row of spend amounts, the lead picker, the room's files, and Archive and
Delete, all at once. The phone has had a sheet with pages for each since ADRs 0087, 0104, 0108,
0110 and 0117.

The header said what the phone's bar does not: "owned by Arjun · L2 …" and a context ring at 1%.
The sidebar had a Channels item that went nowhere the phone goes.

Mocks of today's room beside three options: <https://claude.ai/artifact/XxhWtjRqgJ6DsxAoJCNSrL>.
- **A**: every Done gone, and the members panel given a Done of its own and a click-outside.
- **B**: everything in A, and the members panel becomes the phone's room sheet as a dialog, with
  the phone's pages and the header read like the phone's bar.
- **C**: everything in B, and no run rail: what a run did goes under the reply's ⋯.

He picked B.

## Decision

1. **Nothing says Done.** Not the header, not the run panel, not a route card, and a reply that
   ends a run is drawn as any reply (`data-summary` stays on it for the receipt). The run panel's
   head says *Run* and no state: Working, Waiting on you, Paused and Stopped go with Done, as A's
   mock said. Pause and Resume say whether it is paused, and an ended run has no controls and
   says how long it took. The bubble says what the work is (ADR 0147). Receipts under replies
   stay.
2. **The header reads like the phone's bar.** The room's name is a button with a chevron, and
   under it core's `spaceSubtitle`: *Main agent · Jacobian* in a Main room, the harness's name in
   a one-agent room when it is not the room's name, *No agent* where one left, *N people* in a room
   of three or more. Why the room can't answer stays beside it, in its plain words. "Owned by …",
   the trust level and the context ring go. The header's face keeps a live dot while a run works,
   waits or is queued.
3. **The members panel is gone; the room sheet takes its place.** It is a modal dialog that grows
   out of what opened it, the name or *N members*, and folds back into it (`GrowingDialog`, as the
   + does). It stands under the header, over the room, its left edge at the opener as far as the
   window lets it. Escape, a click outside it and Done each put it away, and the keyboard goes back
   to the opener.
4. **Its pages are the phone's.** The first page: the name, the hint core's `whoIsHere` gives,
   who is here, Add Agents (Add a person in a Main room), then Lead, Spend per job and Files as rows
   that open pages of their own. Add: New agent, In other rooms with its Move and Fork, the free
   agents and people as ticks that stay up while several are put in (ADR 0148, point 6). Lead:
   No lead and the room's agents, a choice that puts the sheet away. Spend per job: the five
   amounts and Other, what the job has spent so far, and Save. Files: the room's files and their
   versions (ADR 0100). Each page has Back; the height glides between pages and the page fades in
   where it stands (ADR 0110). What the server would not do is said in red under the page.
5. **The name is renamed where it stands** (ADR 0112): a click makes it a field, Return saves,
   Escape puts the old name back and leaves the sheet up.
6. **An agent's row opens its page in Agents once the sheet has gone** (ADR 0111's addendum).
7. **What the desktop keeps that the phone does by swipe.** Remove stands beside a row on hover
   and to the keyboard, where the phone swipes; a person may be removed too, as ADR 0111 allowed
   the desktop. Archive (or Unarchive) and Delete space… stand quietly at the sheet's foot, since
   there is no Spaces swipe; both ask first in the phone's words. A harness in a room as itself
   (from before ADR 0087) is still listed, and a harness with no agent yet can still be added.
8. **A room made empty from the + opens its sheet on Add** (amends ADR 0148, point 5), the first
   thing to pick taking the keyboard. Done puts it away before the first message, as on the phone.
9. **Channels leaves the sidebar.** Spaces, Search, Agents and Audit remain, and You at its foot.
10. **Both clients say the same.** `spaceSubtitle` moves from the phone into core, and `whoIsHere`
    (the sheet's hint) joins it, so the phone and the desktop draw a room's bar and sheet from one
    rule.

## Consequences

- No server, protocol, Jacobian or bridge change. Web and Mac only, and the phone's two words now
  come from core.
- `Members.tsx` and `NewAgentDialog.tsx` are deleted. The sheet is `apps/web/src/app/room/`:
  `RoomSheet.tsx` (state and pages), `actions.ts` (what it asks of the store), `Who.tsx`,
  `Adding.tsx`, `Settings.tsx`, `parts.tsx`.
- While the sheet is up the room is behind a modal: a person puts it away before typing, as on the
  phone. The e2e specs drive it through `roomSheet`, `addMember`, `sheetBack` and `closeSheet` in
  `apps/web/e2e/support.ts`.
- The run rail stays (C was not chosen), and so do its timeline, cost and context ring.
- Paused and Stopped are no longer words in the run panel: Resume says a run is paused, and a
  stopped run's panel goes final as any ended run's does.
- Mocks are out of the repo, as asked on 28 September 2026.

## Addendum, 11 October 2026: Done wore a ring

Arjun, with a screenshot of the sheet open in Terra Fab Research: "done button looks off". Done
took the keyboard as the sheet opened. WebKit (his browser and the Mac app) rings a button that
script focuses whatever opened the dialog, and Done stood against the edge of the sheet's pages,
which clip what spills past them, so the gold ring was drawn and cut. Now the sheet's card holds the
keyboard as it opens (`tabIndex={-1}`, unlit), so nothing in it is lit until Tab; on Add the first
thing to pick still takes it (point 8). A ring inside the sheet is drawn inside what has the
keyboard (`outline-offset: -2px`), so the edge never cuts one. And the sheet reads its place again
as the window changes size, so it stays under what opened it.
