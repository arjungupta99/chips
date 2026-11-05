# 0215. The menu bar shows Chips while the server on this Mac answers

Date: 20 October 2026
Status: Accepted, 20 October 2026, on Arjun's "Build option 2: Chips starts at login in the menu
bar, the icon shows only while the server answers, Open Chips opens the window", after "I just
need the chips icon to be linked to the server. I want to see it when the server is running. It
may have an additional option to start the app."

## Context

The menu bar icon was the app's: it came with the window and went with it, since closing the
only window quit Chips for Mac. Nothing opened the app at login. On his Mac mini the server is a
login service (`chat.chips.serve`, ADR 0121) and comes back after a restart by itself, but the
icon did not, so the menu bar said nothing about the one thing that matters on that machine:
whether Chips is up.

Three ways were costed. The app always in the menu bar from login, saying nothing about the
server. The app in the menu bar from login, its icon there only while the server answers (this
one). And `chips serve` starting a menu bar helper of its own, so the icon went with the process:
a second signed app carried with `chips`, for little more than the second gives.

## Decision

1. **Chips for Mac opens at login, in the menu bar only.** A launch agent,
   `~/Library/LaunchAgents/chat.chips.desktop.plist`, runs `open -g -a <the app> --args
   --background` at login. Opened that way the app makes no window and has no Dock icon; the
   page is not loaded until the window is asked for. The app writes the agent itself, with the
   path it runs from, whenever it runs from a `.app` on a Mac with the server's login service and
   the person has not turned it off.
2. **The icon shows while the server on this Mac answers.** The server on this Mac is the login
   service `chips up` installs: `~/Library/LaunchAgents/chat.chips.serve.plist`, on the port its
   `CHIPS_PORT` names, else 4431 (as ADR 0173's first screen asks). Every 5 seconds the shell asks
   `http://127.0.0.1:<port>/v1/health`; an answer naming `chipsd` shows the icon at once, and
   three misses in a row (about 15 seconds) hide it, so a stall on a busy Mac does not blink it.
   On a Mac with no such service, the server is elsewhere and the icon is always shown, as before.
3. **The menu**, top to bottom: *Chips is running on this Mac* (greyed, only where there is a
   server here), *Open Chips*, *Open at Login* (a tick; turning it off removes the agent and
   leaves a note in the app's own folder, so a later launch does not put it back), and *Quit*.
   *Quit* closes the app, not the server.
4. **Closing the window hides it.** The window goes, and the Dock icon with it; the menu bar icon
   stays, and the page stays loaded, so the count and the banners carry on. *Open Chips*, a
   `chips://` link, a banner's click, or opening the app again from Finder or Spotlight shows the
   window, making it first if the app was opened at login.
5. **The shell learns no more than an address.** The health check needs no key and reads one
   field. Everything else stays in the page.

## Consequences

- After a restart on his Mac mini, once he has logged in (FileVault), the server and the icon
  come back by themselves. The icon going away means the server stopped answering.
- An app opened at login sends no banners and keeps no count until its window is opened once.
- With the server down and the window closed, nothing of Chips is on screen; opening the app
  from Finder or Spotlight brings the window back.
- *Quit* (or ⌘Q) ends the app until the next login or until it is opened again.
- A Mac whose server runs another way (`pnpm chips serve` in a terminal, a port the login service
  does not name) is treated as having no server here: the icon is always shown.

## Addendum, 20 October 2026: opening the app starts the server

On Arjun's "Yes: when Chips for Mac is opened and the server on this Mac isn't answering, start
its login service", after "if someone quits the server, what is the way to reopen it?" and "will
it open if we just open the chips app?". It did not: with the server down, the icon was gone and
the window could only say it could not connect.

1. **Opening the app asks for the server too.** When a person opens Chips for Mac (a launch of
   their own, or opening it again from Finder, Spotlight or the Dock) and the server here does
   not answer, the app starts its login service. The login's own launch (`--background`) does
   not: launchd starts the service at login unless `chips down` said not to, and that word stands
   until someone asks for Chips.
2. **It is started as `chips up` starts it, and only when it is not running.** The service is
   the one named by `chat.chips.serve.plist`'s own `Label`. `launchctl print` decides: a service
   launchd does not have (`chips down`, a `launchctl bootout`) is enabled and bootstrapped; one
   it has but is not running is kickstarted; one that is running is left alone, since it is
   starting or too busy to answer, and stopping it would cut whatever it is doing.
3. **The rest follows by itself.** The menu bar's check finds it answering within 5 seconds and
   shows the icon; the page reconnects as it always does. When `launchctl` refuses, a banner says
   "Chips could not start on this Mac" with what it said.

Consequence: opening Chips undoes `chips down` on this Mac. That is the point of opening it;
`chips down` is still the way to keep it off while the app stays closed.

## Addendum, 24 October 2026: Login Items says Chips for the app's own login

His words: "Yes, make Chips for Mac's own login item (chat.chips.desktop, now shown as "open") show
as Chips." The agent ran `/usr/bin/open -g -a Chips.app --args --background`, and Login Items names
an agent by the program it runs: Apple's `open`. The bridges the app keeps (ADR 0218) already
showed as Chips.

1. **The agent runs the app's own program.** `ProgramArguments` is
   `Chips.app/Contents/MacOS/chips-desktop --background`, the program the app's team signs, and
   `AssociatedBundleIdentifiers` names the app (`chat.chips.desktop`). Both are read from the
   app's own `Info.plist`, so another build names itself. Nothing else changes: at login the app
   starts in the menu bar with no window, no Dock icon and no page, as `--background` always said.
2. **Why not `SMAppService.mainApp`.** It makes the app a login item of its own, but macOS then
   opens it as a person would, with no `--background`, and telling a login launch from a person's
   would rest on an Apple event the app would have to catch before its first window. The agent
   keeps the one sign this ADR already reads.
3. **Opened twice.** `open` gave way when the app was running already, as macOS does for any app
   opened twice. The program run by itself does not, so a launch at login that finds a copy of the
   app running (one macOS reopened at login, or one opened by hand first) gives way to it before
   anything starts. A copy running from launchd is an app like any other to macOS: opening Chips
   again, and a `chips://` link, go to it.
4. **Installs move by themselves.** The app writes its agent at every start while it is on, so
   the first start after an update replaces the `open` agent in place, under the same label: one
   login item, now named Chips.

5. **A link to the copy started at login hung it, and no longer does.** Walked on the installed
   app with the agent loaded as login loads it: launchd ran `chips-desktop --background`, and
   macOS knew it as Chips in the menu bar (`UIElement`), with no window. Opening Chips by hand went
   to that copy and showed its window, one process throughout. But the first `chips://pair` link
   hung it: the Dock icon came, no window did, and its main thread waited on Tauri's plugin lock.
   Tauri holds that lock while the deep-link plugin hands a link over, and making the window takes
   it again. It had been so since this ADR made the window late, so the `open` agent's copy would
   have hung the same way. The link is now kept and the page told at once, and the window is made
   from a thread of its own, as a banner's click already makes it.

## Addendum, 3 November 2026: the icon greys and stays

His words: "Yes, grey it out", after he found Chips for Mac running on his Mac mini with no icon in
the menu bar. The copy opened at login drew its icon at 00:13. At 00:28, with the Mac swapping
hard, the server missed three checks and the app took the icon away. Its main thread never ran
again: Apple events to it timed out, and its last work had been that removal. So the server
answered and the app ran, but the menu bar showed nothing, until the app was quit and opened again.
Hiding the icon removed it from the menu bar, and showing it made a new one, both on the main
thread, and a Mac busy enough to miss three checks is the one where that is most likely to stall.

1. **The icon is never taken away.** Three misses in a row (about 15 seconds) grey it: the same
   mark at a third of its ink, which macOS draws grey, as a menu bar item that is turned off. An
   answer draws it at full strength at once, as before. Opened at login, the icon starts grey and
   is drawn on the server's first answer.
2. **The menu's first line says which.** *Chips is running on this Mac* while the server answers,
   *Chips is not answering on this Mac* while it does not.
3. **Open Chips asks for the server too.** From the icon, it shows the window and starts the
   server's login service when the server does not answer, as opening the app does (the addendum
   of 20 October). It used to only show the window, since there was no icon to click while the
   server was down.

Consequences: a grey icon means the server here is not answering; no icon means Chips for Mac is
not running. On a Mac with no server here the icon is drawn as before, never grey. This replaces
decision 2's "three misses hide it" and the first consequence's "the icon going away means the
server stopped answering".

## Addendum, 3 November 2026: closing the window keeps the Dock icon

His pick, "Keep it in the Dock", from the mock of ADR 0267 (Chips for Mac as a Mac app). Closing the
window took the Dock icon away with it (decision 4), so the count ADR 0267 put on the Dock icon was
seen only while the window was open, and ⌘Tab no longer listed Chips.

1. **Closing the window hides the window alone.** The Dock icon stays, with the count on it, until
   Chips is quit, as Messages' and Mail's do. Clicking it brings the window back, as it already did.
2. **Opened at login, nothing changes.** The app is the menu bar's icon and nothing more, with no
   Dock icon, until the window is opened the first time; from then on the Dock icon stays.
3. **A menu command with the window closed brings it back.** With Chips in front and its window
   closed, the menus are there, and New Space, a section or Settings shows the window doing it.

This replaces decision 4's "and the Dock icon with it" and the consequence that nothing of Chips is
on screen with the server down and the window closed: the Dock icon is, once the window has been
opened.
