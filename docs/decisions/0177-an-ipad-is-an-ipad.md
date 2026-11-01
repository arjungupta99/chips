# 0177. An iPad is an iPad

Date: 16 October 2026
Status: Accepted, 16 October 2026, on Arjun's ask. Builds on the tablet layout (`useLayout`,
`Split`, the 760-point column) and keeps the phone's room, sheets and + as they are on a phone.

## Context

Arjun, 15 October 2026: "how does chips look on ipad ?" The iPad simulator (iPad Pro 13-inch,
iPadOS 26) showed the phone app stretched rather than an iPad app:

- iPadOS stands the tab bar at the top of the window over a regular width, a pill of glass in the
  middle, and the tabs' names stood under it. The phone's gold + floated over the room's composer.
- The room beside the Spaces list was a page with its name in a plain bar: no room sheet, no who
  is here, no way to an agent's card.
- A room open beside the list was gone once another tab had been looked at.
- The app said "this phone" in forty places, the iPad's own device row among them.
- The first run's title stood at the window's edge while its column stood in the middle.

He then asked: "fix them all. After that please test ipad thoroughly and make sure it looks very
polished". The walk that followed (16 October: the 13-inch upright and on its side, light and
dark, the 11-inch upright, the iPad mini upright) found more. The conversation beside the list
washed pale under the tab bar. A search result opened its room somewhere off the screen. The setup
card stood edge to edge in the list. The empty pane repeated "Spaces" in a bar. A room's name was
cut at a phone's 260 points. A bubble passing under the name stopped in a hard line under the tab
bar. On the iPad mini every sheet ran across the bottom like a phone's.

## Decision

1. **The tab bar is iPadOS's**, and the app stands below it. A tab's own safe area on an iPad
   includes the bar at the top, and the window's does not (about 96 points against 24). So a
   tab's name, its band of blur and what stands under them take the larger of the two
   (`useTabTop`, `ui/windowInsets.tsx`).
2. **The + is the bar's own on an iPad**. The gold + over the tab bar is an iPhone's
   (`GOLD_PLUS`, `app/(tabs)/_layout.tsx`). The new-space window grows from the top middle, where
   the bar's + is. It is a card 560 points wide in the middle, not one across the screen
   (`cardAcross`). A send fills the half beside the list, square-cornered, where the new room
   opens (`fillRect`).
3. **A screen's name stands over its column**. On a wide screen a name and what stands under it
   are in the page's column, and in a split's list they stand at the list's own edge
   (`useHeadColumn`, `ui/Screen.tsx`). This covers You and the first run's Welcome.
4. **An iPad says iPad**. `thisDevice()` and `deviceWord()` (`src/device/word.ts`) give "this
   iPad" and "iPad" on one. Core's devices gain a `tablet` kind, which You and the web draw with a
   tablet mark. The setup card's step is "This iPad", and the web's first run counts a tablet as a
   device in the hand. Core's join sentence takes the device word.
5. **The room beside the list is the phone's room**. `RoomPane` and the pushed room share
   `useRoom` and `RoomName` (`spaces/RoomHead.tsx`):
   - The name floats on a glass capsule with who is here under it, and opens the room sheet.
   - A room made from the + opens on its Add, and a locked room's Locked opens its sheet.
   - An agent's row opens the agent's card over the room in the same pane (`AgentPane`), with a
     round glass back to the room. A card's history comes back to the card the same way.
   - The room starts below the tab bar: a list that runs under the system's bar gets iOS's edge
     effect, and on a room's upside-down list that washed the whole conversation pale. Its band
     of blur still reaches up to the window's top (`bandReach`), so what passes under the name
     fades into the page.
6. **What is open beside a tab's list is kept by the tabs** (`OpenedProvider`, `useOpened`,
   `ui/opened.tsx`), not by the tab's route. React Navigation gives a tab that is jumped to its
   first params again. A param from a link, a push or a search result still asks for a room. It
   is kept first and taken off the route only once kept, so a found line lands in the room it
   was found in.
7. **A pane reads as the platform's**. The name stands in the middle at 17 points, and the way
   back is a round glass button (`PaneBar`, `PaneButton`). A pane with nothing open shows a
   centred mark and line, with no bar naming the list beside it (`PaneEmpty`).
8. **Wider than a phone is not wide**. `roomy` (700 points across, 600 down) is a window wider
   than any phone. There a sheet is a card, the + window a card's width, and a room's name runs to
   440 points. `wide` (768) stays where a list stands beside its room. An iPad mini upright is 744
   points: UIKit counts that a regular width, but a room beside the list would get 384 points, so
   the mini keeps the phone's single column with cards for sheets.
9. **The setup card stands in from the list's sides**, as Agents' cards do, on a phone too.

## Consequences

- Seen on the simulators, 16 October 2026:
  - The 13-inch, upright and on its side, light and dark: names below the pill, the room with its
    capsule, sheet and band, and the agent card and history with the back.
  - Search: a result landed on its line in the middle of its room.
  - A room still open after Agents → Spaces.
  - Swipe actions and the face picker in the 360-point list.
  - The composer above the on-screen keyboard, and a send moving the room to the top, still
    chosen.
  - The 11-inch upright: a 474-point room beside the list.
  - The iPad mini: a phone's list and room, with card sheets, the + card, and the full name.
- A sheet on an iPad stands as a card on the bottom of the window, as it has since the tablet
  layout. iPadOS centres its own form sheets. That is left as it is: a centred card would need
  the sheet's slide to start from below the window rather than from its own height.
- What is open beside a tab is held in memory. A relaunch opens on an empty pane, as a phone opens
  on the list.
- Not seen: an iPad in Split View or Stage Manager at a narrow width, and keyboard shortcuts. The
  layout decides by the window (`useLayout`, tested at a third of a split), and no command has a
  shortcut yet.
- The web target at an iPad's size keeps its rail. `e2e/tablet.spec.ts` drives that one.
- A phone sees two changes: the setup card's margins, and Sheet's tests pin an iPhone's window,
  since Jest's own window is 750 points across, which is roomy.
