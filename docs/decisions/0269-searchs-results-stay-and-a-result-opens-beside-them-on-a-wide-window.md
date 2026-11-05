# 0269. Search's results stay, and a result opens beside them, on a wide window

Date: 3 November 2026
Status: Accepted, 3 November 2026, on Arjun's pick of option 2 in the mock (`search-mac-choices.html`,
the side sessions' notes, kept out of the repo). The Mac and the web. Brings ADR 0256's Search on an
iPad to them; adds to ADR 0132's addendum for the Mac and the web and to ADR 0263.

## Context

On the Mac and the web a result took the page: the room opened at its line and the rail moved from
Search to Spaces, and the way back to the results was Search in the rail. On a wide window the field
and the rows also ran the whole middle of it, 1,180 pixels at 1440. On an iPad the results keep a
column and what a result finds opens in the pane beside them (ADR 0256, `search/Found.tsx`). The
mock, shot in WebKit at the Mac window's size on the Demo, showed today, 1 (the iPhone's way: the
room says ‹ Search, and the results stand in a 760 column) and 2 (the iPad's way). Arjun: "Option 2,
the iPad's".

## Decision

1. **From a window over 1,000 pixels wide, Search is two columns**: the results in 360 pixels, and
   beside them what a result opened. It is the width from which the shell stands a run panel beside
   a room (`.shell`); Chips for Mac opens at 1180 and goes down to 880. The room beside the results
   is 381 pixels at the narrowest, about a phone's width, and 560 at the window's first size.
   Narrower, Search is one column and a result takes the page, as before.
2. **A press opens a result beside the results**: a message its room at the line with the words
   marked (ADR 0133), a space its room, an agent its page. Its row is drawn open, in the iPad's tile
   colour (`--surface-3`), and named as current. The search is kept among the recent ones, as an
   opened result's always was.
3. **The room beside the results is the room**: it is the open room, chosen with the Search tab
   kept, so it is read, answered, steered and acted on as on Spaces. Its head ends in **Open in
   Spaces**, which takes it to Spaces, run panel and all. An agent's page beside the results goes
   back to the Agents list with its own ‹ Agents; a room or an agent it names opens beside the
   results in its place.
4. **The keys** (ADR 0263): ↓ and ↑ open each result beside the results as they light it, the field
   keeping the keys, the way Mail shows the message under its selection; Enter takes the lit result
   to its own page (a room in Spaces, an agent on Agents). A double click does the same.
5. **Before anything is opened** the faces of your spaces and agents drift in the pane (ADR 0136,
   ADR 0138), not under the field; once something is typed it says "Nothing open" and "Choose a
   result on the left.", the iPad's words, which move into core (`SEARCH_NOTHING_OPEN`).
6. **What was open stays** while Search is away, as the search does: back on Search, it is open
   again beside the results, and is the open room again.

## How

- `Search.tsx` takes `beside` (what is open, opening another, and the pane as the shell draws it)
  and splits on the media query; in the split the results column is a `section` and the room
  beside it the page's one `main`.
- `Shell.tsx` keeps what is open (`useSearchBeside`): a room is chosen without changing the tab
  (`keepTab`) and landed on through the same `open` a hit always used, and the room is drawn by the
  same `roomView` Spaces uses, with Open in Spaces at its head. `SpaceView` takes `headEnd` for it,
  drawn last at the right of its header; nothing else about the room changes.

## What is left out, and why

- **Keeping what Spaces had open.** On the iPad, Search's pane and Spaces' each keep their own room.
  Here the room beside the results is the shell's open room, so going to Spaces after looking at a
  result shows that result's room. One room open at a time keeps one composer, one run panel and
  one notice; two would need the shell to carry each twice.
- **A column for the results on a narrow window.** Under 1,001 pixels the rail narrows to 220 and
  the room beside 360 pixels of results would be narrower than a phone.

## Consequences

- No server change, no protocol change, no migration. Going live is `pnpm web:build` and
  `pnpm desktop`.
- The Mac shell's Search Everything (⇧⌘F, ADR 0267) finds the field as `.search input[type="search"]`
  in either layout; the results column is a `section` in the split.
- `Search.test.tsx` holds the split with a stubbed media query; `Shell.test.tsx` holds a hit opened
  beside the results at its line, Open in Spaces, and coming back to it.
- Walked in WebKit on the Demo at 1180×780 and 900×720, dark and light: the faces before typing,
  Nothing open, ↓ opening the room at the line with the word marked while the field keeps the
  keys, an agent's page and a space beside the results, Open in Spaces, Enter, and coming back.

## Addendum, 3 November 2026: what opens beside the results arrives

Arjun asked for smooth transitions everywhere on the web and Chips for Mac. The page beside the
results swapped in a frame. Now it arrives as You's pages do beside their list (`you-page-in`): it
fades up from nothing and starts 8 points in from the right, on `--motion-base` and `--ease`. It
uses the Web Animations API on the pane, which stays mounted. With less motion asked for, it only
fades up. A page is a room or an agent. Another line of the same room is not a new page: the room
goes to the line and rings it (the room's own scroll). Nothing moves when Search opens on a page
already open. "Nothing open" fades up with the first letter typed.

- **A crossfade of the old page with the new**, rejected: it means keeping two rooms mounted, or
  cloning a room whose rows are laid out only near the window, which clones at the wrong scroll.
- **The browser's view transition**, rejected for the pane: in WebKit every click during one goes
  to `<html>` (measured), so the second click of a double click would be lost, and macOS 13's
  WebKit has none. A change of section is the shell's (ADR 0274), so Open in Spaces gets the shell's
  crossfade, and Search adds no motion of its own to it.
