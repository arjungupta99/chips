# 0192. Light mode reads in steps, and a tap has its own colour

Date: 17 October 2026
Status: Accepted, 17 October 2026, on Arjun's "Build steps 1 to 4 from the light mode mock".
Adds to ADR 0009 (the design tokens) and its 21 September addendum (the palette's lift).

## Context

On 17 October 2026 Arjun wrote: "The Chips light mode colors do not look great. The contrast is
poor, the icon colors look off. Please evaluate all the layout and colors in the light mode and
suggest updates. Show mocks first".

Spaces, a room, the room sheet, Agents, Search and You were walked in light mode on the simulator
and every weak pair measured. The palette had been tuned in dark, and these were the faults in
light:

- **The tap colour was the status amber.** The chosen tab, Cancel, Clear, See all, the ticks and a
  sheet's action wore `amber` (#d76c00): 3.36:1 on the page where words need 4.5, and its hue (54°)
  is 34° from the gold (88°), so the chosen tab and the gold + were two different yellows side by
  side. In dark the amber is #f38b00 at 7.7:1 and close to the gold, which is why dark looked right.
  The amber also means "needs you", so a tap and a warning wore one colour.
- **Words in ink-4.** The times on Spaces and Agents, every placeholder but the composer's,
  "Archived" in Search, the scale under a gauge and the thinking bubble's clock were ink-4
  (#a9abb3, 2.21:1). `tokens.css` says ink-4 is never a word; the web enforces it in
  `tokens.test.ts` and the phone had no such check.
- **Every surface was one white.** Page #fbfbf8, cards #ffffff, sheet cards #f2f2ec and everyone
  else's bubble #ecece5 sat within 1.04 to 1.14:1 of each other; the hairline was 1.23:1.
- **The gold + was washed out.** On an iPhone the + is gold glass at 70% (`PLUS_TINT`), which over
  the light page paints #f8d56d: a pale sticker at 1.38:1 against the paper.
- Two more, not decided here: the sheets group grey cards on a white ground (the reverse of iOS)
  while You draws white cards on the page, and the agent faces' pins rest at 45 to 55% of the
  face's colour, a faded pastel on paper.

The mock put each screen as it is beside the proposal, with seven steps priced smallest first
(private artifact `LhQXfz61QVd93PZGcurFaq`). Arjun took the first four.

## Decision

1. **Three light values deepen a step.** `--them` #ecece5 → #e5e5de (1.22:1 on the page, the step
   iMessage's grey bubble has on white), `--line` #e4e4dc → #dfdfd7, and `--ink-3` #666973 →
   #626670 so the time inside the deeper bubble still clears 4.5:1 (4.54). Dark does not move.
2. **A tap has its own colour, `--accent`.** Honey #a06306 in light (4.73:1 on the page, 4.90 on
   white glass, its hue between the amber and the gold), and in dark the #f38b00 the taps wore
   before, so dark looks as it did. The chosen tab (NativeTabs' tint, Android's bar, the iPad
   web target's rail), Cancel, Clear, See all, "Try again" on a quiet notice, the ticks in a
   picker, a sheet's action, a quiet-time card that is on, the "accent" row tone and the web's
   chosen sidebar icon take it. Everything that means "needs you" keeps `--amber`: the ask card's
   border, a ring, a gauge's warning fill, an editor's unsaved dot.
3. **Status words are amber-ink.** The exchange-limit sheet's warning foot was the one place amber
   was a word; it is now amber-ink, as every other status word already was. (The mock named the
   room's "1 can't answer" too; that was amber-ink already, misread from the screenshot.)
4. **No word is ink-4 on the phone.** The times, the clock, "Archived", the gauges' scale, a face
   group's heading and a stuck task's line take ink-3, and so do the placeholders, as the
   composer's hint (`Composer.tsx`) and the web's composer (`composer.css`) already were. The
   mock said grey for placeholders; ink-3 is what the app's own composer says, and grey is a
   status. Ink-4 keeps the marks (chevrons, the pen, an arrow, an empty circle) and a disabled
   button's word, which WCAG leaves out and which must look off.
5. **The + is glass in dark only.** In light it is the painted gold, with its shadow, that it
   already is on iPad, Android and without the glass. `usePlusGlass()` says which, and the window
   the + grows into asks the same, so it starts as whatever the + was.

## Consequences

- Light mode passes where it failed: the chosen tab and the taps 3.36 → 4.73:1, the times 2.21 →
  5.54:1, the placeholders 2.29 → 5.5:1 on white. Nothing changes on the server or the wire.
- The web and the Mac get the three values and the accent through `tokens.css` on their next
  build; only the sidebar's chosen icon was a tap colour there.
- Honey at a tab's size reads bronze rather than gold. It is the lightest honey that carries a
  word; anything closer to the gold falls under 4.5:1.
- Not built, waiting on Arjun's pick from the mock: grouping the iOS way round (sheets and You on
  surface-2 with white cards), the pins in light (metal or solid), and Bright faces in light.
- The web's visual baselines that draw a bubble, a hairline or a placeholder are stale until
  `tools/visual/run.sh` runs.

## Addendum, 18 October 2026: grouped the iOS way, and pins on metal

Arjun took two more steps from the mock: "Build step 5 (group the iOS way: sheets and You on
surface-2 with white cards) and step 6 with Metal pins."

1. **A grouped ground, and white cards on it.** Every sheet, and every screen made of inset groups
   (You, an agent's page, a person's page, People, Invite), stands on `--grouped`: #f2f2ec in light,
   the page in dark. What stands up off it is `--raised`: white in light, `--surface-2` in dark, so
   dark did not move. The sheets had drawn grey cards on a white sheet (1.08:1) and You white cards
   on the paper (1.04:1); now the cards are 1.12:1 off the ground, as iOS's Settings has them, and
   there is one card style. `--raised-press` is a raised thing under a thumb, and `--sunk` a track
   set into the grouped ground (a segmented control's): #e7e7df in light, `--surface-2` in dark.
2. **What a thing stands on is said once** (`apps/mobile/src/ui/ground.tsx`). `Sheet` and a `Screen`
   that is `grouped` say "grouped", `Group` says "card" for what is inside it, and anything else is
   on the page. `useGround()` answers with the ground's colour and the fill, press and track for
   what stands on it, so a shared field, a quiet round button, the face picker's tiles, a segmented
   track, the rename field and the sheet's X fill themselves right wherever they are drawn. The
   glass band under a screen's name fades to the ground, and the cut round a face's amber dot is
   drawn in it. A sheet's own cards, fields and buttons take the fill; a pressed row inside a card
   keeps `--surface-2`.
3. **The web's room sheet is the phone's** (ADR 0151): its dialog stands on `--grouped`, its groups,
   fields and flat buttons are `--raised`. In dark that moves the web sheet's ground from
   `--surface` to the page, the phone's own, and its cards stand 1.21:1 off it where they stood
   1.07:1. The web's You keeps its bordered white cards on the page: a line draws their edge there.
4. **Pins on metal in light.** An agent's pins rest on `--pin-metal`, a neutral grey (#bbbcb4), with
   none of the face's colour; the running light lights each in the face's colour as before.
   `--pin-dim` (0 in light, 1 in dark) takes the colour out between flashes on the web. In dark
   there is no metal (`transparent`) and the pins rest in the face's colour at `PIN_REST`, as they
   did. Each pin on the phone is one view, its metal, holding its colour; on the web the colour is
   the pin's `::after`. The brand mark's pins (`ChipPulse`, `mark.tsx`) are not a face's and did not
   change.
