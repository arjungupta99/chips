# 0263. Search on the Mac and the web is worked from the keys, and wears the phone's marks

Date: 3 November 2026
Status: Accepted, 3 November 2026. The Mac and the web. Adds to ADR 0132 (its addendum for the Mac
and the web, which left out "arrow keys through the results"), ADR 0189 and ADR 0136.

## Context

On 2 November 2026 Arjun installed Chips for Mac and found it behind the iPhone app: "thoroughly
walk through each and make sure they are parity with phone, highly polished". Search on the Mac and
the web was walked on 3 November in the Demo (Look around) and on a scratch server, at the Mac
window's size (1100×720), narrow (720×640) and wide (1440×900), dark and light, and with the server
stopped. It finds what the phone's tab finds and opens each where the phone does; what differed:

- **The keys.** ↓ in the field did nothing; Enter only kept the search among the recent ones. A
  row reached by Tab drew no ring: each row is laid out on its own (`content-visibility: auto`),
  which clips the ring drawn outside it. The four chips were four stops for Tab, each a `tab` with
  no arrows between them.
- **The marks.** A recent search wore the search glass where the phone's wears a clock; the two
  notices (the server out of reach, a search that didn't go through) carried none of the phone's
  marks (a cloud struck through, an alert).
- **Clear and See all** were `--amber-ink` where the phone draws them in its accent.
- **The Demo's search** found the letters anywhere: "mi" lit "fa**mi**ly". The server finds the
  start of a word, and the earlier words whole (FTS5's prefix on the last term).

Left for Arjun, in a mock: where a result opens on a wide window (the iPad keeps the results and
opens a result beside them, ADR 0256; the Mac swaps the page for it).

## Decision

1. **The field keeps the keys while ↓ and ↑ light a result.** A recent search, a space, an agent,
   See all and a message are each a stop; the headings, the notices and the ghost rows are not. ↓
   from the field lights the first, ↓ again the next, and stops at the last; ↑ lights the one
   before, and from the first gives the keys back to the words. The lit row is drawn as the
   pointer's (`--surface-2`) and scrolled into the window if it isn't, and the field names it
   (`aria-activedescendant`, `aria-controls` the list), so a screen reader reads the row lit.
2. **Enter opens the row lit**, as a press on it does, the search kept among the recent ones; a
   recent search lit runs again. With nothing lit, Enter keeps the search, as before.
3. **Esc empties the field**, as a Mac's own search field does, and the keys stay in it. With the
   field already empty, Esc puts out a lit recent search, and otherwise passes on to the window.
4. **Nothing stays lit when the list changes under it**: a key typed, a chip chosen or the pointer
   moved over the list puts the light out (one row lit at a time, the pointer's or the keys'), and a
   row the messages arriving take away is lit no more.
5. **A row reached by Tab is ringed inside its own box** (the focus ring at `-2px`).
6. **The chips are one stop for Tab**, the chosen one; ← and → choose the one beside it and go
   round, as tabs do.
7. **The phone's marks**: the clock on a recent search, the cloud struck through on "Can't reach
   your server.", the alert on "The search didn't go through.". Clear and See all in `--accent`.
8. **The Demo's search finds what the server would** (core's new `holdsTerms`, beside `wordMarks`,
   which marks the words the same way): the earlier words whole, the last a word's start, folded.

## What is left out, and why

- **Enter opening the first result with nothing lit.** Enter has kept a search since ADR 0132,
  as the phone's Search key does; ↓ first, then Enter, is one key more and never a surprise.
- **A key to Search from anywhere.** The iPad has Search Everything on ⇧⌘F (`ui/menuBar.ts`).
  On the Mac it belongs with the menu bar and its shortcuts, which another session is bringing
  level; the field already takes the keys whenever the page opens.
- **The marks in the design system.** The phone keeps clock, offline and alert as its own
  (`apps/mobile/src/ui/icons.ts`), and its test fails while `@chipschat/ui` holds a mark of the
  same name. Search draws the phone's paths itself (`Mark` in `Search.tsx`) until the phone's file
  moves them among the marks it checks against the design system's.
- **The time on a row.** The phone says a clock or a day ("8:02 PM"), the Mac and the web how long
  ago ("2m"), as their own lists do. It follows the lists, and changes with them if they change.
- **Faces a size larger, and hairlines between rows.** The Mac and the web draw everything a size
  smaller (ADR 0137), and their lists light a row on a rounded ground rather than ruling them.

## Consequences

- No server change, no protocol change, no migration, nothing on the phone. Going live is
  `pnpm web:build` (4431 serves `apps/web/dist`) and `pnpm desktop`.
- A row that fades where it stood (ADR 0189) is a copy; it is drawn with no ids now, so the arrows
  never find the copy for the row.
- `Search.test.tsx` holds the keys; `search.test.ts` and the demo's `serve.test.ts` hold the rule.
