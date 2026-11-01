# 0169. Every sheet closes from an X at its top right

Date: 15 October 2026
Status: Accepted, 15 October 2026, on Arjun's ask and his "proceed with your recommendations" on
the mock. Takes the place of Cancel and Done where they only closed a sheet, and of Handoff
details' own X; ADR 0085's Done at the top right of a You sheet goes with them.

## Context

Arjun, 14 October 2026: "All bottom sheets in Chips need to show a beautiful X button on the top
right, for closing the bottom sheet. show me mocks first."

Every sheet on the phone is `ui/Sheet.tsx`. It closed on a tap on the dimmed room, a pull on the
handle, the Android back button and a screen reader's escape, and showed none of those. What a
sheet showed was its own: Cancel at the foot of a menu, Done at the foot of the room sheet and
the route sheet, Done at the top right of the You sheets and the space icon sheet, Close beside
Try again on the connection sheet, and a 44-point X on Handoff details alone. The Mac and web
dialogs already wear an X at their top right (`.new-space-close`, a 28-pixel circle).

The mock (<https://claude.ai/artifact/7ZFrhX5Uhxghtj9u7sp3se>) offered three looks (A a quiet
circle, B the system's glass, C the bare mark), three moves (arriving, pressed, pulled), and two
ways with Cancel and Done (1 keep them, 2 the X takes over). He took the recommendations: B, all
three moves, and 2.

## Decision

1. **`Sheet` draws the X, so every sheet has one** (`ui/SheetClose.tsx`). It stands at the top
   right of the sheet's content, its middle on the line the sheet's title starts on, under the
   handle. A sheet's first line leaves `CLOSE_ROOM` (the X and a row's gap) at its right:
   `SheetTitle`, `SheetHead`, the room sheet's name and the first line of each of its pages, and
   the card a confirming sheet opens with.
2. **On iOS 26 and later it is a 34-point drop of the system's interactive glass** with the mark
   in ink, which swells under a thumb as iOS's own glass buttons do. Anywhere without the system's
   glass (Android, an older iOS, Reduce Transparency, the web target) it is the same circle, flat,
   in the quiet surface with the mark in the second ink: the Mac and web dialogs' X.
3. **It moves on the sheet's own values, and starts no clock.** It grows in over the last half of
   the panel's rise, a little past its size and back, the mark turning the last 24 degrees into
   place; a sheet leaving takes it back the same way. Pulled by the handle, a ring draws round it
   from the top, in step with the finger, and closes at the line past which letting go puts the
   sheet away (a third of its height); there the X fills with ink and the phone ticks
   (`haptics.tick`), and above the line again it empties. The ring is two half rings turned inside
   two windows, so the native driver turns it rather than redrawing a dash. Reduce Motion keeps the
   ring and the fill and leaves out the growing and the turn. Nothing fades the glass: a material
   asked to animate its opacity is drawn broken until it is whole again.
4. **The X is the way out, so a button that only closed a sheet goes**: Cancel on the line's
   menu, the attach sheet, the voice note and a picture's or file's actions; Done on the room
   sheet's first page and its Add page, the route sheet, the role sheet, the agents' join request
   once it is decided, and at the top right of Pair a computer, Decisions, Quiet hours, Agents
   and the space icon sheet; Close on the connection sheet; Cancel on Fork. Where Done saved as it
   closed (Quiet hours, the space icon sheet), the X saves.
5. **What stays:** a sheet that asks before something that can't be taken back keeps Cancel under
   its coloured button (`ConfirmSheet`: archiving or deleting a space or an agent, removing a
   harness or a person; a role change; taking a person out of a room; Move; the invite that would
   sign this phone out of its workspace, whose Cancel is "Stay in …"). Buttons that do something
   stay: Save on Attachment limits, which now stands just left of the X; Try again and Pair this
   phone again on the connection sheet; OK and "Open …" on an invite's sheet. Back on a sheet's
   inner pages stays, at the left.
6. **While a sheet may not be put away** (a delete or a join under way), the X's mark greys and it
   does nothing, as the scrim already did (`closable`).
7. **A sheet showing a reader** (the message menu's Select text, Handoff details' full reply)
   still goes back to its menu on a drag or the back button; its X puts the whole sheet away
   (`onCloseButton`). The reader's Back is the X's size and stands level with it.

## Consequences

- One place draws the way out of every sheet, and none can be made without it.
- Sheets are shorter by the button they lost, about 60 points for most.
- The X's test id is the sheet's with `-close` (`sheet-close` for a sheet with none); tests, the
  phone's web-target specs and the Maestro receipt flow press it where they pressed Cancel or Done.
- A sheet whose first line is new must leave `CLOSE_ROOM` at its right, or its words run under the
  X.
- Two Close buttons are on a sheet's screen for a finger, the X and the dimmed room; a screen
  reader is offered the X alone, the panel being modal to it.
- The Mac and web dialogs are unchanged: they had their X already.
