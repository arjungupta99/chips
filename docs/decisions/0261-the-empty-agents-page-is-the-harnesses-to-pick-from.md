# 0261. The empty Agents page is the harnesses to pick from, and the log moves to You

Date: 3 November 2026
Status: Accepted, 3 November 2026, on Arjun's "Build B" and "and take Audit out of side bar".
Mock: the empty Agents page, today's beside A, B and C (sent in the session, not published).

## Context

Arjun, 2 November 2026, with screenshots of Chips for Mac just installed: "Desktop app new install,
Agents page, looks very unpolished" and "what is this Audits section ?"

The Agents page of a workspace with no harness said "No harnesses yet." under its name, "Agents · 0"
over "No agents yet. A harness's agents come when it connects." in its body, and "No harnesses yet."
again under Harnesses in the sidebar. The only way on was a small outlined Connect a harness at the
top right, and nothing said what a harness is. The phone's tab ends its shelf with a Connect tile
(ADR 0185's addendum, his words of 17 October 2026: "let's keep it as the last tile"); the web's
shelf drew nothing at all with no harness, so its tile was never there to draw.

Audit was in the sidebar from the web app's first build (3 September 2026): the event log read as a
table (ADR 0004), for every role, guests too. The phone never had it. On a new install it lists the
setup itself: the owner joining, their rename, the relay switched on and off.

The mock drew today's page beside A, the phone's tile on the web's shelf with the phone's words;
C, a centred page with one gold button; and B, the gallery the dialog opens, on the page itself. He
chose B.

## Decision

1. **The gallery on the page.** While the workspace has no harness and no agent, archived or not,
   an owner's or admin's Agents page (whoever's Connect a harness opens on the gallery, with links
   to make) is **Connect a harness to bring in your agents**: a sentence on what a harness is, then
   the docs' cards, each with its line and what you need first (the card's `needs`, after "You
   need"). A card opens the dialog grown out of it, already at that card's link; going back from
   there closes the dialog, since the page is the gallery. Your own harness and Anything with HTTP
   stand in a line under the cards, for whoever writes their own; with no docs to read, they are
   the cards. The header has the page's name and nothing else (`PageGallery`, `bareTab`).
2. **Connect is the shelf's last tile.** Wherever the shelf is drawn, it ends with Connect a
   harness, an outlined tile as on the phone, and the header's button goes; the header keeps it
   only on the page of harness cards without the agents, and the demo keeps its own line. View all
   shows only when there is a harness to view. A member's empty page is the shelf with its tile.
3. **Said once.** With no harness, nothing is said under the page's name; the sidebar draws no
   Harnesses heading; and an owner's or admin's empty Agents section says the phone's words, "No
   agents yet. Connect a harness from the shelf, or allow one that asks."
4. **The workspace's log is on You.** Audit leaves the sidebar. An owner or admin finds a
   **Workspace log** card last under the workspace's heading on You, whose Open shows the same
   table, now titled Workspace log, with **‹ You** to go back; You stays lit in the sidebar over
   it. Members and guests no longer see it.

## Consequences

- A new install's Agents page is a choice to make rather than an empty page with three notices.
- The phone's empty tab is unchanged: its shelf already ends with the tile. Whether it gets the
  gallery too is a separate call.
- The log is one more step away for the people who run the workspace, and gone for everybody else.
  It is still the event log itself: nothing about what is recorded changes.
- Tests that pressed the header's Connect a harness press the shelf's tile, which has the same
  name. Those that pressed Audit open the log from You (`openLog`).

## Addendum, 3 November 2026: the sidebar lists no harnesses

Point 3 dropped the sidebar's Harnesses heading while there were none. It is now gone altogether,
with the list under it: Arjun took B on the Mac sidebar mock ("Go with your recommendations",
relayed by the Agents session), the sidebar the iPad has, and the phone and the iPad show
harnesses only on Agents. Agents keeps its count in the sidebar (ADR 0264's second addendum).

What a harness's row said is still said, on Agents:

- why it can't answer, in amber, and what it is doing, in its run's tone, on its tile on the shelf;
- who a specialist is working for, its context and its live sessions on its card under View all.

A harness with a terminal open and no run said Idle on its row. Its tile says how many agents it
has, as the phone's does, and its card says "1 live session".
