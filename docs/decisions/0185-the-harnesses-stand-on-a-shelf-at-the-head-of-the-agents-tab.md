# 0185. The harnesses stand on a shelf at the head of the Agents tab

Date: 17 October 2026
Status: Accepted, 17 October 2026, on Arjun's word ("Let's do B shelf of harness. I also want a mini
view all option under it, that will open them in a new view with vertical scrolling list"), picked
from five mocked places. Changes the Agents tab on the phone (`agents/Agents.tsx`) and the Agents
page on the desktop (`Harnesses.tsx`); the cards themselves (ADR 0087, Phase 5) are unchanged.

## Context

The Agents tab listed every agent first and the harnesses' cards at its foot (ADR 0087, Phase 5).
Arjun, 16 October 2026: "The list of harnesses is hiding below the list of Agents. We need a better
place / way to show them." On his server that foot was under four Main agents, twenty-five agents
and Archived · 56: about 2,500 points down, three screens of scrolling on an iPhone. Claude Code and
Codex, connected with no agents yet, showed nowhere else.

Five places were mocked at phone width against today's tab, each with its cost: a Harnesses row
under the Main agents (A), a shelf of tiles under the title (B), an Agents | Harnesses switch (C),
the agents grouped under their harness (D), and Harnesses moved to You (E). He picked B, with a
small View all under it.

## Decision

1. **A shelf heads the tab.** A tile for each harness, in a row pushed sideways: its face wearing
   its ring, its name, and one line. Three and a half fill a phone, so the fourth shows there are
   more. A tile opens its harness's page, pushed on a phone and beside the list on a wide screen.
2. **The line says one thing.** Why it can't answer, in a word and in amber (Offline, Restarting,
   Can't answer; its page says the rest, ADR 0083); else what it is doing, in the status's own word
   and tone, the verb held as the bubble holds it (ADR 0147), as its card's pill says it; else how
   many agents it has ("21 agents", "No agents yet").
3. **The order is the rows'.** Tiles run in the order their agents' rooms last spoke, so the harness
   at work is the one in reach; a harness none of whose rooms has spoken comes after, by name.
   Which harnesses, the order, the trouble word and the count are core's (`harnessShelf`), so the
   phone and the desktop shelve them alike.
4. **View all, small, under it.** A capsule at the shelf's margin that opens every harness's card,
   in the shelf's order, in a vertical list of its own: pushed on a phone (`/harnesses`, which only
   led to the tab before), beside the list on a wide screen, over the page on the desktop with
   "‹ Agents". A card there opens its harness's page; beside the list, that page goes back to the
   list it was opened from.
5. **Add an agent moves with them.** On the phone it is the shelf's last tile, dashed, for whoever
   may make links (ADR 0122), and the foot of the list View all opens. The desktop keeps its button
   by the page's name.
6. **Nothing at the foot.** The Harnesses heading and the cards under the agents are gone. While the
   tab picks agents (ADR 0182) the shelf steps back with the Archived row. Before the first list,
   blank tiles stand where the shelf will be (`Arriving`).

## Consequences

- No server or protocol change.
- The desktop's sidebar already lists the harnesses with their state; the shelf gives the Agents
  page the same at its head, and its cards (tokens, checklist, owner, restart, remove) are one click
  further, under View all. Tests that reached a card from the Agents page go through it now.
- The phone's `HarnessCard` tests render the list View all opens; the shelf has its own
  (`Shelf.test.tsx`), core's order and words theirs (`harnessShelf.test.ts`), and the web target an
  end-to-end walk on a phone's and an iPad's window (`harnessShelf.spec.ts`, `tablet.spec.ts`).

## Addendum, 17 October 2026: Connect a harness, last on the shelf and on You

Arjun: "we have a 'add an agent' button in the Agents tab → top tray, which seems lost". Measured on
the phone's web target at an iPhone's 393 points with six harnesses, the tile was the seventh in
the row, 600 points in, found only by pushing the shelf 359 points; it was the only empty tile,
dashed with no ground; and its words sat where a harness's name and line go, so it read as a
harness called Add. It also brings in a harness, not an agent. Three places were mocked (first on
the shelf, a capsule beside View all, a capsule in the title row). He picked none of them: "I do
not expect connect a harness to be use a whole lot, so let's keep it as the last tile. Also show it
as an option in the You section."

1. **It is called Connect a harness everywhere.** The shelf's last tile reads "Connect / a harness",
   the foot of the list View all opens says "Connect a harness", and so do the desktop's button by
   the page's name and the gallery's title (ADR 0122). The empty tab says "Connect a harness from
   the shelf, or allow one that asks." What it does is unchanged.
2. **It stays the shelf's last tile.** Point 5 holds: dashed, for whoever may make links.
3. **You has it too, under the workspace's name** (ADR 0085), for the owners and admins who see
   that group, after Invite someone. On the phone it is a row that does what the tile does: a link,
   sent with the share sheet, the row saying "Making a link…" meanwhile. On the desktop it is a
   Harnesses card saying how many are connected, whose button opens the Agents page with Connect a
   harness's dialog already up, where the harness lands once it says hello. Reaching the page any
   other way opens it without the dialog.

What comes after the tap (the gallery, the waiting and the arrival) is the "Add agent experience"
mocks' to decide; they build on this.
