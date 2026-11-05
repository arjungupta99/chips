# 0264. You is a tab on the Mac, and a room's row offers the phone's swipes

Date: 3 November 2026
Status: Accepted, 3 November 2026. What the phone and the iPad already decide, brought to the web and
the Mac; the question they leave open, how much more of the iPad's sidebar the Mac takes, is put to
Arjun in a mock (`chips-notes/mocks/mac-sidebar/`) and is not decided here.

## Context

Arjun, 2 November 2026, with Chips for Mac just installed: "why is there no You section in desktop
app?" You was there, as his face, his name and a gear at the foot of the sidebar, and nothing said it
was You. The sidebar listed Spaces, Search and Agents. The phone has You as its fourth tab, after
Spaces, Agents and Search (`apps/mobile/src/ui/tabs.ts`), and the iPad's sidebar lists the same four
in the same order, with no foot (ADR 0256).

Walking the web and the Mac beside the phone and the iPad turned up more that the phone already
decides:

- The tab in front and the open room's row stood raised on a shadow. The iPad marks both as a flat
  tile a step darker (ADR 0256, decision 7), and a control here is flat.
- A room's row on the web did one thing, open its room. The phone's row is pushed for Pin or Unpin
  and Hide or Unhide (ADRs 0240, 0205), and the other way for Archive or Unarchive and Delete (ADRs
  0066, 0067), or Locked (ADR 0156). On the web, pinning or hiding meant opening the room and its
  details first.
- A room with no title that a harness ran in was "You, Quill" in the sidebar and "Quill" over the
  conversation: the sidebar named rooms by its own rule, the room's head by core's `spaceTitle`.
- With only archived or hidden rooms the sidebar said "No spaces yet." over "Archived · 3". The
  phone says nothing there.
- New space forgot who was picked when it folded away unsent, forgot who was asked last on a
  reload, and its Send woke on the first letter with nobody picked to ask, though a send then did
  nothing. The phone keeps the pick, keeps who was asked last for the workspace, and holds Send
  until somebody, or Empty, is picked. Its lead's hint is "Hands the lead to …".
- A device that knows no relay was told "Chips keeps trying on its own" when the server could not be
  reached. The phone says it reaches the server only on its network, because the relay isn't on.
- The workspace's name at the top of the rail was the browser's own drop-down, drawn only with
  something to choose. With one workspace in a browser it was a name with nothing behind it: the
  film could not be watched again and the workspace not renamed from where its name stands. The
  phone's name always opens its Workspaces sheet: each workspace with the person's role there and
  what waits, Rename for an owner, Watch Chips work, Remove for the demo, Join another workspace.

## Decision

1. **You is the fourth tab.** The sidebar's tabs are the phone's, in its order: Spaces, Agents,
   Search, You, You wearing the phone's mark. The row at the sidebar's foot goes. You stays lit over
   the workspace's log, which opens from it (ADR 0261).
2. **Flat tiles.** The tab in front is a tile in `--surface-3` with its mark and name in the accent;
   the open room's row is a tile in `--surface-3`, a row under the pointer half as dark. Neither has
   a shadow.
3. **A row's menu.** A right-click on a room's row, or the keyboard's menu key on it, opens a menu of
   what the phone's swipes offer there, in their order: Pin or Unpin, Hide or Unhide, Archive or
   Unarchive, Delete, or "Locked, show details" in Archive's and Delete's place. Core decides which
   (`spaceRowActs`) and says them (`SPACE_ROW_ACT_WORDS`), so the two cannot drift. Pin, Hide and
   Unarchive happen at once, as a swipe's do, and the rows move as they do for any pin or hide.
   Archive and Delete ask first in the room sheet's dialog and words (`archiveAsking`,
   `eraseAsking`). A refusal is said under Recent for a few seconds, in core's words
   (`notTakenWords`). Locked opens the room, where its details say why and let the lock go, and says
   why under its name. It looks and walks as a message's menu does (`LineMenu.tsx`): ↑ and ↓, Escape,
   a click elsewhere, and the row has the focus back when it goes. While the sidebar picks rooms
   (ADR 0181) a right-click does nothing of its own.
4. **A row is called what its room is called:** core's `spaceTitle`, as the phone's list and the
   room's head call it.
5. **Nothing over put-away rooms.** With no open room but some hidden or archived, the sidebar says
   nothing above their headings. "No spaces yet." is for a workspace with no room at all, as before.
6. **New space keeps its pick and remembers.** Who was picked waits with the words when the dialog
   folds away unsent, and goes with them on a send. Who was asked for the last room made is kept in
   the browser for the workspace (`chips.newSpace.lastAsked.<device>`), and the next dialog opens on
   them after a reload too, while they are offered. Send sleeps until somebody, or Empty, is picked:
   the shared composer takes `sendable` for it. The lead's hint is the phone's.
7. **The rail scrolls only for what is in it.** Select's bar, put away, clips its buttons and drops
   its reach into the rail's padding: parked below the rail's foot they gave every rail 45 points
   to scroll into nothing, and a space typed with the focus in the rail scrolled it there.
8. **The name opens the Workspaces menu.** The workspace's name is a button with a chevron, and
   opens a menu hanging under it with the phone's sheet in it: each workspace with its mark, its
   role there (or "Notifications off here" for one muted), a tick on the one in front and how many
   things wait in another; then Rename for the owner of the one in front, which turns the menu into
   the name in a field with Save and Back, and a refusal under it in the phone's words; Watch Chips
   work; Remove for the demo, which says it goes from this browser or this Mac; and Join another
   workspace where the Mac app pairs with another server, or Set up my own Chips from the demo. On an
   iPad the sheet is a card in the middle; on a Mac a menu under the name is where a switcher is.
9. **No relay, said so.** The space pane's "Can't reach your server" on a device with no relay says
   what the phone's says: Chips reaches it only on the server's own network, and where to turn the
   relay on.

## Consequences

- The face and name at the foot are gone; nothing else in the sidebar shows the reader's face. The
  iPad's sidebar has none either.
- `packages/core` holds a row's acts, their words and why a pin or a hide did not hold. The phone
  still says them from its own copy (`List.tsx`'s `ACT_LABEL`, `notTaken`) until it switches to
  core's; the words are the same.
- Change icon, the phone's long press on a row, is not in the menu: the web has no face picker yet.
  When one is built (the You session's note, 3 November 2026), it joins the menu.
- `data-testid="you"` moved with You to its tab, so specs and tests that open You are unchanged.

## Not decided here

How much of the iPad's sidebar the Mac takes beyond its tabs and the Workspaces menu: the gold + at
the top and no Harnesses list in the sidebar, or the iPad's three columns. The mock puts today
beside each, with what each costs.

## Addendum, 3 November 2026: Change icon is a page of the room's sheet

The face picker came to the Mac and the web as a page (ADR 0272), and Arjun asked, with that pick,
for as few popups on the iPad, the Mac and the web as can be. So the phone's long press on a row,
Change icon, is now the first item of the row's menu, and it does not open a picker of its own.
It opens the room, with the room's sheet already up on an Icon page: the picker under a way back,
the room's name and who is here at its head, as the phone's room sheet has it (ADR 0174). The
face at the top of the sheet's first page now opens the same page, and wears the phone's pen at
its lower right to say so.

- A pick saves at once. One the server turns away puts the old face back (core's store does that)
  and says why at the top of the picker, in core's `whyFaceNotSaved` words.
- The face is the reader's own, so Change icon is anybody's, a guest's too: a row whose other acts
  are all withheld still has its menu, with Change icon alone.
- How the shell asks a room for its sheet on a page is one prop now, `sheetFor` ({ room, page }),
  where it was `membersFor` (Add alone, ADR 0148).
- The sheet needs `SpaceActions.icon` for the page; without it, the face opens nothing, as before.

## Addendum, 3 November 2026: the + at the top, as on the iPad

What was not decided above is decided: Arjun took B ("Go with your recommendations", relayed by
the Agents session). The gold + moves from the end of the Recent heading to the end of the
sidebar's top row, beside the workspace's name and its Demo tag, where the iPad stands it, so it is
in the same place whichever page is open. The sidebar's list of harnesses goes (ADR 0261's
addendum). The iPad's three columns, C, are not taken.

- Recent keeps Select at its end. While the sidebar picks rooms, the + no longer steps aside: it is
  not in the heading that says how many are picked.
- The + keeps `data-testid="new-space"`, and the tabs keep their order, so the Mac's ⌘N and ⌘1 to
  ⌘4 (ADR 0267) are unchanged.
- The top row's gap is 6 px, so "Chips demo" fits whole beside its tag and the + in the 260 px
  sidebar. A longer name ends in an ellipsis, as it did.

## Addendum, 3 November 2026: how the sidebar moves

Arjun asked for smooth transitions on the web and the Mac, and for everything to look polished.
In the sidebar, nothing now comes, goes or moves in a single frame, and every duration comes from
one set of numbers. Those are the tokens' `--motion-fast`, `--motion-base`, `--motion-slow` and
`--ease`, plus the phone's own numbers where the sidebar moves the same thing the phone's Spaces
list moves. The phone's numbers are named once at the top of the sidebar's styles (`--fold-ms`,
`--land-ms`, `--turn-ms` and the rest), and every rule uses those names.

- Hover and press on a tab, a row, the workspace's name and the + fade on `--motion-fast`. A
  pressed tab or row goes a step darker, and a pressed + scales down slightly.
- The Workspaces menu and a row's menu fade in, and fade out again when they close. The menu
  closes as you press Escape or click away; the fade-out takes a moment more. Rename slides in like
  a turned page, and Back slides the list back in.
- Hidden's and Archived's rooms open under their heading and fold back into it as the chevron
  turns. The phone shows and hides them at once; here they fold, on the phone's fold timing.
- A room that arrives after the sidebar is drawn opens into its place. This uses the same fold as
  a heading that arrives with its first room. It used to appear in one frame and push the rows
  below it down.
- After the cache has been read, the rooms rise into place one after another, as the phone's do
  when you switch to a workspace (core's `SEARCH_ARRIVAL`). After placeholders, they fade in, as
  before.
- An unread count pops in when it first appears or goes up. A refusal's note under Recent unfolds
  and folds away. The setup card's × folds the card away, as finishing does. The setup bar's
  pieces fill from the left.
- The pinned room's lift during a pin glide now fades the shadow's opacity, not the shadow itself.
  So the glide animates only transform and opacity. A fold in place still changes a height, as the
  phone's does.
- With Reduce Motion, every change happens at once. A read count is gone at once too. Before this,
  the count stayed on the row with Reduce Motion on, because its fade-out never finished.
