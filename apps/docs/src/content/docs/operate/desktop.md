---
title: Chips for Mac
description: The desktop app — finding a server, pairing, notifications you can answer, and the menu bar.
sidebar:
  order: 4
---

The desktop app is the web app in a native window, and that is deliberate: the socket, the
device key, the fold and what an approval means are all the page's, in a browser tab and in the
app alike, so the two cannot drift apart. What the window adds is the short list of things a tab
cannot do.

## Finding your server

A browser is served by the server, so it knows where it is. The app is not, so the first screen
asks which one — and usually already knows, because `chips serve` advertises itself as
`_chips._tcp` on the local network.

With nothing answering on this Mac or on the network, the first screen asks **Run Chips on this
Mac?** instead (ADR 0173). The app carries a release of `chips`, and **Run Chips here** runs its
`chips up`: the workspace made, Chips started as a login service your phone on the same Wi-Fi can
reach (this Mac alone, where it has no home network), and the app paired with it by itself. Where
there is a server on the network, the same is a quieter **Run Chips on this Mac instead** under
the list; where Chips already answers on this Mac, it is not offered. Open the app from
Applications first: one opened where it was downloaded runs from a copy macOS throws away.

If your server is somewhere else — another network, or through a tunnel — type its address
instead. Either way the next screen is the pairing code, which is the same short-lived,
single-use code a browser uses: the one `chips serve` printed, or one from `chips pair --issue`
on any machine that is already paired ([A Mac mini](/operate/mac-mini/#pair-the-laptop-and-the-phone)).

## The columns

The window stands in the iPad's columns
([ADR 0284](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0284-the-web-and-the-mac-stand-in-the-ipads-columns.md)).
At the top left are the workspace's name, the gold **+** for a new space and the four tabs:
**Spaces**, **Agents**, **Search** and **You**. Under them is the first column, the tab's list. The
second column is what a row in it opens, and the third, when there is one, is one level deeper: a
space's details, an agent's Model or Message history, a harness's Recent runs, a card picked in
**Connect a harness**, and the run panel beside a space where all three columns fit.

In a space, the round button at the top left puts the list away and brings it back, and the name
in the middle and the round **Details** button at the top right open the space's details. In a
window under 1260 wide, opening a third column folds the list to a rail of icons, and closing the
column brings the list back. At 640 wide or less there is one column, with the tabs as a menu over
the page.

## Notifications you can answer

When a harness asks for something, the notification carries **Approve** and **Deny**. Pressing
either one sends the same decision a click on the card in the app would: by the time it reaches
the server there is no difference between the two, and the audit log records who decided and
when, not which surface they were looking at.

Ignoring the banner denies nothing. The approval stays at the foot of its space until somebody
answers it or it reaches its expiry, which is what the harness asked for when it raised it.
Clicking the banner itself, rather than a button, opens the space it is waiting in.

:::note[The app has to be a real app for this]
macOS attributes a notification to an application bundle. A development build run outside a
bundle has nothing to attribute it to, so the banner does not appear and the app says so rather
than failing quietly. Use the built app.
:::

## The menu bar

The icon carries how many things are waiting on you — everything to decide, and what you have
not yet read of the rest — and nothing when nothing is waiting. The Dock icon carries the same
count. Its menu opens the window, turns **Open at Login** on or off, and quits. Closing the window
keeps the app in the Dock and the menu bar, so the count and the banners carry on, and clicking the
Dock icon brings the window back; **Quit** ends it.

On a Mac that runs the server itself (the login service `chips up` installs), the icon is that
server's: it is drawn while the server answers and greys about 15 seconds after it stops, and the
menu says *Chips is running on this Mac* or *Chips is not answering on this Mac*. The app opens at
login there, with the icon and no window; **Open Chips**, or opening the app from Finder or
Spotlight, brings the window. Until the window has been opened once, an app opened at login sends
no banners and keeps no count. On a Mac whose server is somewhere else, the icon is always drawn.

If that server has stopped, **Open Chips** or opening Chips for Mac starts it again: the app starts
its login service the way `chips up` does, and the icon is drawn again once it answers. This undoes
`chips down` on that Mac. A server that is running but slow to answer is left alone.

## Menus and keys

The menus hold what the iPad's do, with the same keys, and dim what the screen in front can't do:

| Keys | What they do |
| --- | --- |
| ⌘1, ⌘2, ⌘3, ⌘4 | Spaces, Agents, Search, You |
| ⌘, | Settings, which is You |
| ⌘N | A new space, from the gold + at the top left |
| ⇧⌘F | Search, with the caret in its field |
| ⌥↑, ⌥↓ | The space above or below the one open, as the Spaces list has them, while Spaces is in front |
| ⌘=, ⌘−, ⌘0 | The page larger, smaller, or back to its actual size, kept between launches |

⌥↑ and ⌥↓ work with the caret in a space's message field too. **Help › Send Feedback…** opens the
feedback form on GitHub with this build filled in.

The window comes back where you left it, as large as it was, and opens once Chips is drawn in
it. Its traffic lights stand over the first column; drag the strip along the top of the window to
move it, and double-click it to zoom.

A file dragged onto a space is added to its message, ready to send, as **Photo or file** adds one
from the round + beside the message field. A file let go anywhere else in the window is refused.

## Several workspaces

A person can belong to a home server and a company server at the same time. Each is an account
on that server — its own key, made when you paired — and the app keeps them all: the name at the
top left is a picker when there is more than one, and *Pair another server…* is the last entry. The workspaces you are not looking at stay connected in the background, so the
picker says what each is waiting on and the menu bar counts them all; a banner from any of them
answers in that workspace.

A workspace can be muted on this device, from **You**: nothing from it reaches a banner or the
menu bar here, and it is not connected in the background at all until you switch to it. The
setting is the device's own; the server is not told, and your other devices are not changed.
Identity across servers is a later problem, the way it is for chat servers today: two workspaces
are two accounts, and a passkey is per server.

## Search

**Search**, one of the four tabs, finds a space, an agent or something said, as the phone's does.
Spaces are found by their names and by who is in them, agents by their names and by their
harness's, both as you type; messages, voice notes' words and the steps of runs come from the
server once you have typed two letters and paused, and more come as you scroll. What matched is
marked in gold. All shows three spaces and three agents, then the messages; the chips under the
field show one kind at a time. A space opens, an agent opens its page, and a message opens its space at
that message, with the words you searched for marked in it for a moment. Back on Search, what you
typed and found is as you left it. With the server out of reach, spaces and agents are still found,
and the messages say why they aren't. What you searched for is kept on this computer under Recent.
See [ADR 0132](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0132-search-is-a-tab-and-finds-spaces-agents-and-messages.md).
With nothing typed, the faces of your spaces and your agents drift slowly up behind the recent searches and the
empty page, each in a softly breathing glow of its own colour, and go when you type; with reduced motion asked for
in macOS, they stand still. See
[ADR 0136](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0136-searchs-empty-space-drifts-with-your-spaces-faces.md)
and [ADR 0138](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0138-agents-drift-in-searchs-backdrop-each-face-in-a-breathing-glow.md).
Before you have searched for anything, Search says **Find** and a word that rolls over from spaces to
agents to anything said, with the whole sentence under it; with reduced motion it stays on spaces. See
[ADR 0137](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0137-searchs-hint-rolls-through-what-it-finds.md).

## Voice notes

**Voice note**, under the round + beside the message field, records one. Choose it and the app asks
for the microphone, the first time, and starts: a strip above the composer counts the time, **Stop and add** keeps the
note, and **Cancel** or Escape throws it away. A note stops by itself at five minutes. Kept, it is
a chip like any file, *uploading and transcribing…* while the server writes down what was said,
and Send waits for the words as it waits for any upload. The space shows the words under a round
**Play**, and search finds the note by them. See [ADR 0055](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0055-the-desktop-records-a-voice-note-in-the-page-on-a-secure-page.md).

The app asks macOS for the microphone the first time; to change your answer later, go to **System
Settings → Privacy & Security → Microphone**. In a browser, the page records only at a secure
address: `https://`, or `localhost` on the server's own Mac. At a plain `http://` address
**Voice note** says so when chosen. [Tailscale](/operate/tailscale/) gives the server an `https://`
name on your tailnet.

The words come from whisper on the server. A server without it keeps the note, with its length and
no words. See [a Mac mini](/operate/mac-mini/).

## Looking at photos and videos

A message's photos, and the videos the server measured, are one grid under it in the order they
were sent: one alone, two side by side, one tall beside two, or two by two with **+2** on the fourth
for the ones past it. A video's tile is its poster, a play mark and how long it runs. A video the
server could not measure is a card under the grid with **Play** and **Download**.

A click on any tile opens the media viewer over the space. It grows out of the tile it came from, pages through the photos and videos of the twenty messages around it, and
shrinks back into the tile of whatever you are looking at when you close it — which may be another
message's, after paging. Under it are **Download** (the file as it was sent), **Copy image**,
**Open message**, **Details**, **Fullscreen**, and **Open original** where what is on screen is the
copy made for a viewer rather than the photo itself.

| Key | What it does |
|---|---|
| `Esc` | Close, back to the tile |
| `←` `→` | Older, newer |
| `Home` `End` | The first, the last |
| `Space` | Play and pause a video |
| `+` `−` `0` | Zoom in, out, and back to fitted |
| `F` | Fullscreen |
| `I` | Details |
| `D` | Download the file as it was sent |
| `?` | This list, in the viewer |

With a pointer: arrows appear at the sides on hover, a click on the backdrop closes, a double
click zooms to the point and back, and `⌘` with the wheel — or a trackpad pinch — zooms where the
pointer is. On a touch screen it takes the phone's gestures: a swipe pages, a drag downward
closes, and two fingers pinch. A filmstrip of the deck sits under the picture where the window is
at least 900 pixels wide, and goes while the picture is zoomed.

Where the app reaches the server directly, a picture and a video are fetched by the page itself
from a signed URL good for a few minutes, so a clip starts in about a second and seeks anywhere
without being downloaded whole first ([ADR 0058](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0058-a-viewers-copy-a-byte-range-and-a-grant-a-device-may-hand-to-a-player.md)).
Through the relay the bytes come the long way, as they did before. See
[ADR 0057](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0057-one-media-viewer-opens-from-the-tile-and-pages-the-messages-around-it.md).

## Links

`chips://` links open the app and take it somewhere:

```
chips://space/spc_01H…
chips://approval/apr_01H…
chips://join?invite=…&lan=…&relay=…&key=…
```

An approval link opens the space it is waiting in, which is where the card is. A join link is an
invite handed to the app (ADR 0164): the join card on the server it names, or, once the app is in a
workspace, "Join Studio too?" — the browser's join page offers it as **Open in Chips**. A link to a
space (ADR 0168) opens that space once joined; in a workspace the app is in already, it asks "Join
Bakery?" first, and opens the space.

## What the app is allowed to do

The shell knows an id and two sentences. It never sees a token, a workspace, a run or the device
key — the page holds all of those, as it does in a browser. The window's own permissions are the
Tauri defaults plus deep links, and nothing that touches the file system or the shell. The one
program it runs is its own copy of `chips`, `chips up`, when **Run Chips here** is clicked.

The microphone is the page's to ask for, and macOS's to allow: the app's `Info.plist` carries
the sentence macOS shows, and a signed build claims audio input, which the hardened runtime
requires. The page has the microphone only while a note is recording.

Its content policy allows connections to any `http`, `https`, `ws` or `wss` address, because the
whole point is to reach a server you name. What it actually connects to is the one recorded on
the device when you paired. Sound and video play from `blob:` addresses the page makes from
bytes it fetched through the device's signature, and the policy allows those too.

## Removing Chips for Mac

Before the app goes to the Trash, run `chips uninstall` in Terminal. It stops the login service
the app started (`~/Library/LaunchAgents/chat.chips.serve.plist`) and the bridges of harnesses
connected on this Mac, and removes the `chips` command the app linked at `~/.local/bin/chips`. It
leaves the app itself alone, and asks before it removes your workspace. Turn off **Open at Login**
in the app's menu as well, then quit the app and drag it from Applications to the Trash.

If the app went to the Trash first, `chips` no longer runs, and the rest comes off by hand:

```sh
launchctl bootout gui/$(id -u)/chat.chips.serve
rm ~/Library/LaunchAgents/chat.chips.serve.plist ~/Library/LaunchAgents/chat.chips.desktop.plist
rm ~/.local/bin/chips
```

Each harness connected on this Mac has a launch agent of its own in the same folder, named after it
(`chat.chips.hermes`, `chat.chips.acp.codex`), which comes off the same way.

Your workspace stays until you remove it: every message, file and key is in
`~/Library/Application Support/Chips`, the logs are in `~/Library/Logs/Chips`, and the `chips`
command's own key is in `~/.config/chips`. Your agents' folders and what the bridges keep are in
`~/Chips`, and `chips uninstall` leaves that folder alone, even when it removes the workspace.

## Building it

```sh
pnpm run desktop:build
```

The build is **unsigned** unless four environment variables are set:
`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID`. An unsigned build
runs on the machine that made it and Gatekeeper refuses it anywhere else; the script says which
of the two it produced rather than leaving you to find out.

CI builds it on every push that changes the shell, under `apps/desktop/`, or the workflow, and
on a run started by hand. It keeps the `.dmg` as an artifact, unsigned until those secrets exist.
