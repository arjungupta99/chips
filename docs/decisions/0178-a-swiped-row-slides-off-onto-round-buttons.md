# 0178. A swiped row slides off onto round buttons

Date: 16 October 2026
Status: Accepted, 16 October 2026, on Arjun's pick from the mock ("B with graphite, build it").
Changes how every swiping row on the phone draws its buttons (`spaces/SwipeRow.tsx`, ADR 0066)
and takes Locked off Archive's violet (ADR 0156).

## Context

Arjun, 16 October 2026: "can you make these Swipe row to delete / archive / lock more cooler and
polished? and the purple lock color needs to change and we have purple for archive as well. Show
mocks first".

Every swiping row on the phone is one component, `SwipeRow`: the Spaces list (Archive, Delete,
Unarchive, Locked), an agent's row (Archive, Delete), a room sheet's member rows (Remove) and an
invite's row (Withdraw). It drew a flat block of colour per act, 78 points wide, standing still
under the row while the row uncovered it. The row moved one point for every 1.4 the thumb did,
nothing said when letting go would open it, and it settled on the swipe library's own spring,
which Reanimated runs critically damped, so it stopped dead. Locked (ADR 0156) wore Archive's
violet because it stands where Archive would.

The mock (a private artifact, 16 October 2026) put that beside three ways: A, Mail's blocks
widening with the row; B, round flat buttons on a tray the row slides off; C, rounded tiles that
grow and stretch. It offered Locked in graphite, amber, teal or gold. He picked B and graphite.

## Decision

1. **The row slides off like a card.** It follows the thumb point for point. Its trailing corners
   round as it goes (to 18 points), over a quiet tray: `surface2` behind a row on the page's colour
   or a white group, `surface3` behind a row that wears a card's grey (a room sheet's, `onCard`).
   Pulled past open, it gives one point for five and springs back; it never acts on its own.
2. **Each act is a flat round button with its word under it**, a disc of the act's colour with
   the act's mark in white, 70 points to each. The discs come out from under the row's edge as
   their places are uncovered, the rightmost first, and pop to their size on a spring once half
   of a place is clear; a word waits for its disc. A row shorter than 72 points (the room sheet's)
   wears 36-point discs and smaller words.
3. **Each mark makes one move once its disc is wholly clear**: the bin's lid hops on its hinge, the
   box's lid lands, the lid of the box a room comes back out of lifts, and the padlock's shackle
   clicks shut, the disc swelling a little as it lands. The bin's lid is a path of its own for it
   (`ui/icons.ts`); the drawing is unchanged.
4. **Letting go opens past half a button**, as before (`rightThreshold`), and **the row crossing
   that line is felt** as a selection click, outward only, once per crossing, as a decision card's
   swipe is. The press keeps its light tap.
5. **Open or home, the row settles on a spring with a little give** (stiffness 430, damping 29)
   instead of the library's critically damped one.
6. **Locked is graphite**: `#494d54` in light (the icon grounds' Graphite) and `#60646e` in dark,
   where the first sinks into the tray. White clears 8.5:1 and 6:1. Locked is the one button that
   does nothing to the room, so it wears no hue. Archive keeps its violet, Unarchive its blue,
   Delete, Remove and Withdraw their red; the asking sheet's button still wears the swipe's colour
   (`actTone`).
7. **Reduce Motion** lets every spring and beat jump to its end, which Reanimated does itself: the
   discs fade in as the row uncovers them, without the pop, and the marks stand still.

## Consequences

- The motion lives in `spaces/SwipeDiscs.tsx`, the one file of the swipe that imports Reanimated;
  `jest.setup.js` mocks it as it mocks the swipeable, and the tests still reach the acts through
  the rows' accessibility actions. `SwipeRow`'s props are unchanged but for `onCard`.
- Walked on a simulator (16 October 2026; a Release build with this JavaScript, against a scratch
  copy of the live data): a Spaces row opened on Archive and Delete with the tray, the rounded
  edge and the discs; frames from a recording showed the discs popping past their size and
  settling, the bin's lid hopping, the box's lid landing, and a row pulled past open springing back
  with no tray edge showing. A locked row slid on graphite Locked and its tap opened the room with
  its sheet up; an archived row slid on Unarchive and Delete; the room sheet's Remove wore the small
  disc over the deeper tray; Delete's asking sheet came up red; dark mode too. Not walked: an
  agent's row and an invite's row, which are the same component. The click cannot be felt on a
  simulator.
- Web and the Mac have no swipe; nothing changes there.
