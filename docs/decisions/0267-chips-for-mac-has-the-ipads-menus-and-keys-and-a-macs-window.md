# 0267. Chips for Mac has the iPad's menus and keys, and a Mac app's window

Date: 3 November 2026
Status: Accepted, 3 November 2026, for what the iPad (ADR 0256) and the Mac's own conventions
already decide, and on Arjun's "Keep it in the Dock" for the window closed (ADR 0215's addendum of 3
November). The mock's one open question, whether New Space sits under File or in the Space menu as
on the iPad, he answered the same day with "Go with your recommendations": the Space menu.
Mock: Chips for Mac as a Mac app (sent in the session, not published).

## Context

Arjun, 2 November 2026, with Chips for Mac just installed: "I think the desktop app and web are
super behind ... thoroughly walk through each and make sure they are parity with phone, highly
polished". Each screen went to a session of its own; this one is what the app does as a Mac app,
beyond the page it shows.

The installed app (built from 81e5628b) was walked by its menu bar, its window and its code:

- **The menus were Tauri's stock ones.** Chips had About, Services, Hide, Hide Others and Quit; File
  had Close Window and Close All; Edit the usual; View only Toggle Full Screen; Window the usual; Help
  nothing. No New Space, no Search, no way to a section by its keys, no next or previous space, no
  Settings on ⌘,. The iPad has had a menu bar since ADR 0256's sixth part: the four tabs on ⌘1 to ⌘4,
  New Space ⌘N, Search Everything ⇧⌘F, Show Details ⌥⌘I, Hide List ⌃⌘S, and the space before and
  after on ⌥↑ and ⌥↓.
- **The traffic lights sat in a grey strip of their own** (`titleBarStyle: Transparent`), across the
  top of the window and apart from the sidebar, where a Mac app's stand over its sidebar.
- **The window forgot its size and place.** It is made late (ADR 0215) from `tauri.conf.json`, at
  1180 × 780 wherever macOS put it, every launch.
- **A file dropped onto a space did nothing.** Tauri answers every file dragged over its window for
  its own drop event and returns that it took it (`tauri-runtime-wry`, `with_drag_drop_handler(...
  true)`), so WebKit never gave the page the drop the room listens for (`SpaceView.tsx`).
- **A click on an approval's banner only showed the window.** The shell said `opened`, and the page
  took only `approved` and `denied`. A tap on the iPhone's notification opens its space.
- **The count was only in the menu bar.** The iPhone puts it on its icon (`showBadge`).
- **Nothing drew the page larger or smaller.** WebKit in Tauri has no ⌘+ of its own.
- The menu bar icon removed itself when the server stopped; another session made it grey instead
  on Arjun's word the same morning (ADR 0215's addendum of 3 November).

## Decision

1. **The menus.** Chips: About Chips, Settings… (⌘,, which opens You), Services, Hide Chips, Hide
   Others, Show All, Quit Chips. File: Close Window (⌘W). Edit: the standard rows.
   View: Spaces, Agents, Search and You on ⌘1 to ⌘4, in the order of the phone's tabs and the
   sidebar's (ADR 0264); Actual Size (⌘0), Zoom In (⌘=), Zoom Out (⌘−); Enter Full Screen. Space:
   New Space (⌘N), Search Everything (⇧⌘F), Previous Space (⌥↑), Next Space (⌥↓), every command for
   spaces in one menu, in the iPad's order. Window: Minimize, Zoom, Bring All to Front, and the
   window's name, macOS's own list. Help: macOS's search field, and Send Feedback….
2. **The page decides; the shell draws.** The rows and keys are the shell's (`menu.rs`), each of
   Chips' commands by an id; a row chosen, or its keys, goes to the page as that id (`chips://menu`).
   The page holds commands as the iPad does (`menuBar.ts`, `useMenuCommand`): a screen that can do
   one holds it while it is mounted and able, the newest holder runs it, and what is held, and under
   what name, is handed to the shell whole once a frame's changes are in (`set_menu`). A command
   nobody holds is dim. The shell knows ids and names, never a space or a person.
3. **What each does** (`menuCommands.ts`, held by the shell's page): the sections and Settings go
   where the sidebar's tabs go. New Space opens the dialog out of the sidebar's +, for an owner or
   an admin only (ADR 0196). Search Everything opens Search, whose field takes the caret as it opens,
   or puts the caret back in the field when Search is open. Previous Space and Next Space step down
   the rooms the sidebar draws first, pinned then the rest, a hidden room left out, while Spaces is
   in front; with none open, the first or the last; none past either end (the iPad's `stepSpace`).
   The keys reach the menu before the page, so ⌥↑ and ⌥↓ step with the caret in the composer, as on
   the iPad. Send Feedback… opens GitHub's form with this build filled in, through the shell
   (`open_link`), as You's Feedback card does when there is no Main agent: a menu's row is not a
   click on the page, and WebKit opens no window for one.
4. **The window's title bar is the page's top.** `titleBarStyle: Overlay`: the traffic lights stand
   over the page. The page says it is in the Mac's window (`data-shell="mac"`, `MacWindow.tsx`) and
   the sidebar, the middle and the run panel each begin 28 points lower behind a transparent top
   border, so each pane's own colour runs up under the lights and nothing scrolls under them. The
   lines between the panes are drawn as backgrounds, so they run to the top as one line. A strip
   over those 28 points moves the window and zooms it on a double click
   (`data-tauri-drag-region`). In full screen, where macOS hides the title bar, the panes go back
   up. The strip stays the lights' height at any zoom (`--mac-zoom`, from `page_zoom` and
   `chips://zoom`).
5. **The window comes back where it was.** AppKit keeps the frame under the name "Chips"
   (`setFrameAutosaveName`) and sets it again on a screen it fits. The window is made hidden and
   shown once it stands there, so it doesn't jump.
6. **The page is drawn at the size it was last**: ⌘= and ⌘− step through Safari's sizes from 75%
   to 250%, ⌘0 is actual size, kept in a file in the app's folder.
7. **A drop reaches the page** (`dragDropEnabled: false`), where the room stages it in its composer,
   as the + and a paste do. A file let go where nothing takes it is refused (`refuseStrayDrops`):
   WebKit would otherwise open it in the window, in Chips' place, with no way back. Words dragged
   inside the page go where they go.
8. **A click on an approval's banner opens its space**, as a `chips://approval/…` link does, and as
   the iPhone's notification does. Approve and Deny still answer from the banner. A digest's banner
   still only brings the window forward: it names several things.
9. **The Dock icon carries the count** the menu bar does, as the iPhone's icon does
   (`set_badge_count`), and stays when the window is closed, until Chips is quit (ADR 0215's
   addendum of 3 November). A menu command chosen with the window closed brings it back. macOS
   forgets a badge given before the app is in the Dock, and putting it there takes a moment after
   the window is first shown, just when the page loads and gives the count; a badge given again
   unchanged is not drawn. So the shell keeps the last count and, a second and a half after the
   app first joins the Dock, takes the badge away and gives it again. It asks to join the Dock once,
   not at every showing of the window.

## What is left out, and why

- **Show Details (⌥⌘I) and Hide List (⌃⌘S).** The web has no details column beside the room and no
  list to put away; the room's session is drawing the first. The commands are a row each in
  `menu.rs` and an id in `menuBar.ts` when they come, held where the room is.
- **Find in Space (⌘F), Mark as Read (⇧⌘U)**, a right-click menu on a message: none of it is on the
  iPad either (ADR 0256's addendum, "Not in this part").
- **A Dock menu** (right-click on the Dock icon). Nothing on the phone or the iPad asks for one.
- **A banner from a workspace behind the one in front** opens nothing yet: the link is looked up in
  the one in front. The iPhone brings that workspace forward first (ADR 0197).

## Consequences

- Chips for Mac reaches the page through three more commands (`set_menu`, `open_link`,
  `page_zoom`) and two events (`chips://menu`, `chips://zoom`), allowed in the main window only
  (ADR 0231), and the window may be moved from the page (`core:window:allow-start-dragging`).
- In a browser nothing changes: no shell, no menus, no strip; the commands are held and never asked.
- The menus and the page name the same commands, and a test reads `menuBar.ts` from the shell's
  tests to keep it so.
- Walked in a copy of the app built from this branch under its own name and bundle id, with a
  scratch home (Look around, dark): the menus and which rows are lit; View › Agents, Settings…, File
  › New Space, as it was then (its window out of the +), Esc, View › Zoom In, View › Spaces; ⌘2; ⌥↓
  with the caret in the composer, to the next space; ⇧⌘F and typing straight into Search's field;
  the title bar over the panes. New Space moved to the Space menu after, with its id and keys as
  they were.
- Walked again in the installed app, built from 2c42059d and paired to Arjun's workspace: the menus
  and the title bar; the window closed by its button, and Chips stayed in the Dock (a foreground
  app, listed in the Dock) with its menu bar count; opening Chips again brought the window back
  where it was; the window moved, Chips quit and opened again, and the window came back where it
  was moved to. The Dock icon had no count while the menu bar said 36. Decision 9's race was
  found chasing it (tried on a test app: a badge given before it joined the Dock was gone, and one
  taken away and given again after was drawn), and is real for an app opened at login. But it was
  not this: rebuilt with the fix (6b0388e0), the count was still missing. Chips' notifications are
  turned off in System Settings (Notifications › Chips › Allow notifications), and macOS draws a
  Dock count only for an app allowed to notify ("Badge application icon"). The same setting stops
  Chips for Mac's banners. It is the person's to turn on; the app does not yet say it is off.
- Walked again on 6b0388e0: the window closed, Chips stayed in the Dock with the menu bar's count,
  and opening Chips brought the window back.
- Not walked: dragging the window by the strip and a double click (a background drag doesn't
  reach Tauri's `startDragging`, and the screen wasn't free to drive), a file dropped from Finder
  (the same), an approval's banner (none was raised), the Dock's count after the fix, full screen,
  light mode, a zoom below 100%, the Dock's count with notifications allowed.
