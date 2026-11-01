# 0197. The phone holds several workspaces

Date: 18 October 2026
Status: Accepted, 18 October 2026, on Arjun's "iPhone switcher: A, from the top of Spaces. Pip:
A, keep them apart." Built as Phase 4 of [the invited-people plan](../proposals/invited-people-plan.md).
It is the people review's Phase 7, his earlier "2B".

## Context

The own-Chips walk (https://claude.ai/artifact/8A7BgAn36pv6gBCs7XGMX3) followed Meera. She runs her
own Chips on her own Mac mini and is invited to one of Arjun's spaces. Her phone held one workspace
at a time, so joining Arjun's signed it out of her own:

- It withdrew her key there and forgot it.
- The join sheet told her, an owner, that she would "need a new invite" to come back.
- A signed-in phone had no place to paste a link at all. Paste was on Welcome only.

Pairing by a link that names another server had a worse version of the same thing. The new device
came in front, and the old one's row, key and push token stayed behind on its server. Its pushes
still arrived, and a tap opened "Not here".

The Mac and a browser already hold several workspaces (M5.3). The core device layer holds several
on the phone too: `loadDevices`, `switchDevice`, `forgetDevice` and `setDeviceMuted` work over the
phone's SQLite-and-Keychain storage unchanged. What held one was the phone's provider, which loaded
`devices[0]`, and a handful of phone-wide things.

## Decision

1. **The provider holds every device.**
   - `useChips()` has `devices` (the one in front first), `switchTo(id)`, `mute(id, muted)`,
     and `others`.
   - `began(device)` brings one to the front and records it as in front for the next launch.
   - `ended(next)` drops the one in front after `forgetHere`, and `next` comes forward. Welcome
     comes only when none is left.
2. **The workspaces behind keep a store each** while the app is open (`useWorkspaces`, ported from
   the web's). A store there reads no cache. It gives:
   - what waits in each (`needs`), and the decisions among them (`decides`);
   - the store a lock-screen decision for that workspace is sent through.

   A workspace muted on this phone gets no store.
3. **Switching rebuilds the tabs.** The tabs are keyed by the device in front, so a switch draws
   them afresh on its store, at Spaces. Something asked for in a workspace behind (a push tapped,
   a banner pressed) brings it forward over Spaces with nothing pushed on top, then does the thing
   there (`useBringForward`). The provider holds that thing until the store is in front
   (`switchTo(id, then)`). A switch draws everything under the providers that need a store
   afresh, so a ref kept anywhere below lost it (the simulator walk, 18 October 2026).
4. **The switcher is at the top of Spaces** (his A).
   - Once the phone holds two, the workspace's name stands over "Spaces" with a ▾, and a red dot
     when something waits in another.
   - It opens Workspaces: each one with the person's role there ("Owner", or "Guest in Japan trip ·
     invited by Arjun"), a count where something waits, and a tick on the one in front. A row
     switches once the sheet has gone.
   - Join with a link is under them, with iOS's own Paste button (Phase 3). The signed-in phone has
     a place to paste a link at last.
5. **Joining another workspace keeps this one.**
   - The join sheet asks "Join Arjun's workspace too?": "Meera's workspace stays on this phone.
     Switch between them from the top of Spaces." The button is gold, since nothing is signed out,
     and the other choice is "Not now". Core's `joinAlongsideAsking` takes the phone's words.
     `joinInsteadAsking` is gone.
   - A link to a workspace the phone holds behind the one in front says so, and switches to it.
   - A pairing link for another server pairs alongside, and SEC-8's question says the workspace
     it is in stays. One for a server the phone holds behind the one in front switches to it, and
     makes no second key.
6. **Pushes name their workspace.**
   - Every push the server sends carries `data.device_id`, the phone's device in that workspace.
     That covers a decision, an agent's @, a join request, and the agents held.
   - A decision made on the lock screen is kept with its device (the queue's new `device_id`
     column) and sent through that workspace's store, in front or behind, without bringing it
     forward.
   - A tap on a push from a workspace behind brings it forward, then opens the room or the
     request.
   - The badge counts decisions in every workspace.
   - Every unmuted workspace is told where the phone is at launch (`usePushRefresh`), with the same
     token and seal key.
7. **A banner says when something new waits behind.** A capsule of glass drops from the top for
   six seconds. It names the workspace and the newest thing waiting there, and a tap brings that
   workspace forward and opens the room. What was already waiting is not news. A store behind reads
   no cache, so it starts empty and what waits rises while its rooms come in. Its first reading is
   taken once every room its hello listed is in, and for three seconds after that, while older
   pages land (`workspaces/news.ts`). It is drawn after the screens, over them.
8. **You has a Workspaces group.**
   - It lists each workspace (a tap switches) and Join with a link. It shows even with one
     workspace, since that is a signed-in phone's place to paste a link.
   - Once there are two, Notifications has a switch for each. A workspace switched off here has its
     token withdrawn at its server, is muted on the device, and keeps no store.
   - The phone-wide switch registers or withdraws every unmuted workspace.
   - Sign out names the workspace: "Sign out of Arjun's workspace", and "Only Arjun's workspace
     leaves this phone." Signing out, or being removed (ADR 0160), forgets only that workspace's key,
     cache, drafts and picks. Kept files go only with the last.
9. **Pip stays home** (his A). No agent from one workspace comes into another. Each workspace keeps
   its own spaces, people and agents.

## Consequences

- Nothing changes for a phone that holds one workspace, except You's new group with Join with a
  link.
- A phone in two workspaces keeps two sockets open while the app is in front, as the Mac does.
- A push from a server older than this one names no device. Its decision goes through the one in
  front, as before.
- A browser still holds the workspaces it has paired with and nothing else. A browser reaching a
  server from outside its network is the people review's Phase 5, not this.

## Addendum, 18 October 2026: a name taken there is asked for again

Joining alongside goes under the name you go by in the workspace in front. When somebody in the
other workspace goes by it already (two people with one first name, as the simulator walk found
with Meera), the server refused the join and the sheet said so in red, with no way on: its line
"You can change your name there in You" could not be acted on before joining.

Now the refusal is named on the wire (`refusal: "name_taken"`, beside `invalid_event`), and the
phone's sheet and the browser's and the Mac's dialog answer it with a field holding the name
tried, under why: "The name Meera is taken in Arjun's workspace. Join under another one." Join
sends what is typed, on the same link, since nothing about a refused answer spends one (Gate 5). A
blank field sends nothing. Any other refusal asks for no name. The card a phone in no workspace
sees asked for a name already, and keeps it, with the server's words, where it was typed (JR-1).

The server does not suggest a free name. The person knows what they are called there (a surname,
an initial), and a number after a person's name ("Meera 2") is how agents are named (ADR 0091),
not people. Each taken name is still counted at the door as a wrong answer (SEC-24), five a minute.

## Addendum, 19 October 2026: Spaces is named for the workspace, and renames it

Arjun, 18 October 2026: "I think we need the workspace name instead of the "Spaces" title, tapping
that title should bring up the workspace selector", and "also need the ability to rename from the
same bottom sheet as well".

- **The title.** Spaces' large title is the name of the workspace in front, followed by a ▾. It is
  there with one workspace held as well as with several, so the switcher is always the title, and
  the small line that stood over "Spaces" once a second workspace was held is gone. The dot when
  something waits in another follows the ▾. The tab is still called Spaces. A name too long for
  the line is drawn a little smaller, down to 70%, before it is cut short, since a new workspace
  is called "Meera's workspace" (ADR 0194). While spaces are being picked the title still says
  how many.
- **The sheet.** Pressing the title opens Workspaces as before. For an owner of the workspace in
  front it has a row "Rename Arjun's workspace" (that workspace's name) under the list. It turns
  to a page with that name in a field and Save, the same rename as You's Name row (ADR 0194). Once
  the server has taken it the sheet turns back to the list, which shows the new name, as does the
  title behind. A refusal stays on the page, in red. An admin, a member or a guest is not offered
  it, as on You. A workspace held behind is renamed by switching to it first.

## Addendum, 19 October 2026: what waits behind is what this phone has not read, and each is called what its server last said

Arjun, 18 October 2026, switching Primal → Demo → Primal: "sometimes it calls it primal, sometimes
primal space, also [shows] some numbers in a red label".

- **The red numbers.** A store behind read no cache (point 2), and so no read state either, which
  lives only in a device's cache. Every run that had ended in that workspace was counted as
  waiting, read or not: 33 for the walk's Japan trip, read to its end on the phone. A store behind
  now reads one thing of the phone's cache, where each room was last read, the read state the
  store in front kept. It still reads no history and writes nothing, so the cache stays the one
  in front's. The web never had this: its stores behind open the same IndexedDB as the one in
  front.
- **The name.** A store kept a renamed workspace's name with its device only when the name differed
  from the one the device came with, not the one it last kept. Primal was renamed Primal Space and
  back to Primal within a minute (18 October, 10:48), so the phone kept "Primal Space", and the
  switcher called a workspace behind by the name kept. Now the store holds what it last kept, and
  a workspace behind is called what its own store's hello said, as the one in front is, on the
  phone and in the web's and the Mac's switcher, with the kept name only until a hello has come.

## Addendum, 19 October 2026: a switch hands the screen over, and the rows rise

Arjun, 19 October 2026, on build 202610190630: "when I go from Primal --> Demo --> Primal … the last
switch to primal, the screen goes blank. Please polish the experience with some transitions. Make
it look cool and polished". Three ways were mocked (<https://claude.ai/artifact/Js3KZL2dSTM1ZbDqPQoVyr>:
A hold, then the rows rise; B the workspaces as cards; C a flight from the sheet). His word: "Build
A: hold the screen, then the rows rise."

- **Why it went blank.** The phone dropped the store in front as soon as another workspace was
  picked, and drew nothing until the next one's store had read its cache: up to a second and a half
  on the way back to a workspace with a long history. With no store, New space's and Connect's
  providers drew a bare fragment, so the whole stack under them was made again on every switch.
- **The hand-over.** The workspace drawn stays drawn, its store open, until the next one's store
  has read its cache (`usePairedFor` in `apps/mobile/src/store/provider.tsx`, at most
  `CACHE_WAIT_MS`), and is closed in the commit that draws its successor, before a store behind is
  kept for it, so one device never has two stores open. The providers under it are keyed by the
  device in front instead of going blank. A switch given up before the next was ready keeps the
  one drawn; a workspace forgotten (`ended`) goes at once.
- **While it waits.** Spaces' title is already the next workspace's name. It rolls up into place
  (`Swap`'s `roll`), without the dot, and a gold bar sweeps a faint line under it. The rooms below
  it dim to 30% and take no taps (`Settling`, `Sweep` in `apps/mobile/src/ui/SwitchMotion.tsx`).
- **When it arrives.** The setup card and the rows of the open group rise 18 pt into place and fade
  up, a beat apart, on the wave Search's results arrive on (ADR 0189's `SEARCH_ARRIVAL`; `RiseIn`).
  A workspace that only just took the front rises; a list drawn any other time does not. The card
  is decided by what the server and the phone say (facts, devices, push, hidden). Those answers are
  now kept for the app's life per workspace, so a second visit draws the card in its first frame.
  On a first visit the card and rows are not drawn until then, at most 600 ms, rather than rising
  and being pushed down by a card that came 0.25 s later (seen on the simulator).
- **What rests is drawn.** The rise is an entering animation: the card and each row are mounted
  where they rest and rise from under it as they are. It was an animated style first, whose first
  value, nothing and 18 pt down, was what React held for the row. Anything that drew a row again
  from React's props left it there, though its rise had ended, and the switcher opened over a
  workspace just switched to did, row by row: Arjun, the same morning, "I did a few back and forth
  switching, space tab is rendering blank", Primal's title over an empty list. On the simulator,
  against copies of his Primal and Demo, the rows' values stood at the end of their rise while the
  rows were drawn at none of it. Held for its card, the list now draws nothing rather than rows
  waiting unseen, and nothing a row rests at is out of sight. Why React was left holding the
  start was found that afternoon: Reanimated 4.5.1 dropped an animation's resting values without
  reporting them to React when the JS thread was blocked for over two seconds, as a switch's
  remount blocks it. `patches/react-native-reanimated@4.5.1.patch` reports them first (ADR 0181's
  addendum of the same day).
- **Reduce Motion.** Nothing travels or sweeps. The rows fade up where they stand, and the line
  under the name is still.

This is the phone's. The web and the Mac switch as they did.

## Addendum, 19 October 2026: one store a workspace, kept while the app is open

Arjun, 19 October 2026, on build 202610191639: "Something goes off with the app performance when I
switch the workspace back and forth. Space details works slow. The space tab —> select button
operation works slow". Measured on the simulator against copies of his Primal and Demo, a switch
blocked the JS thread for seconds, more with each one. Two fixes were put to him, a store kept for
each workspace or less made by the list as it is drawn; his word: "Store per workspace".

- **What a switch cost.** The store in front was made afresh at every switch. It read the whole
  cache of the workspace coming forward and folded it into a model. The store it replaced was
  closed and made again behind, and a store behind read nothing of the cache but where each room
  was last read (point 2 and the third addendum), so its socket asked for the whole log from the
  start and it folded all of that too. A round trip between Primal and Demo built Primal's model
  twice, once from the cache and once from the server, and threw both away, and the collector ran
  hundreds of times for each switch.
- **Now.** Each workspace has one store while the app is open, in front or behind, made the first
  time it is asked for (`useStores` in `apps/mobile/src/store/workspaces.ts`). It reads and writes
  its own cache, as the one in front always did; a cache is kept per workspace and server, so no
  two stores share one. A switch hands the front to the store kept (`usePairedFor`), which has read
  its cache and is up to date with its server, and the one it replaces stays open behind it. The
  stores behind are made once the one in front is drawn, so a launch draws its workspace before
  reading another's. One muted is closed, and one forgotten is closed at once (`ended`). The
  providers under the store are still keyed by the workspace in front, so a switch still draws the
  tabs afresh.
- **The hold.** With nothing left to read, the next workspace was ready as soon as it was picked,
  and the screen stood still under the old name at full strength while the next was drawn: up to a
  second on the simulator, as if the tap had not been heard. A switch now holds the workspace it
  replaces for at least `HOLD_MS` (250 ms): long enough for the dim to land and the gold line to
  start sweeping. Both run on the UI thread and carry on while the next workspace is drawn.
- **The banner.** A workspace's reading for the banner (point 7) is dropped when it comes forward
  and taken afresh once it is behind again (`news.ts`). Its store stays loaded all along, so
  nothing else starts the reading again, and what came and was read while it was in front would
  have been said as news.
- **What it costs.** Every workspace held keeps its whole model while the app is open. The one
  behind did already, once its replay had come in, so the heap is the same: 140 to 204 MB with
  Primal and Demo, before and after. A launch with several workspaces reads each one's cache once
  the one in front is drawn.
- **Measured** on an iPhone 17 Pro simulator (Release) against copies of his Primal and Demo, with
  a probe posting JS stalls and Hermes collections to a local sink. Two passes each, of seven
  switches 8 s apart and then six Select toggles, the old build and the new on the same data:
  - The JS thread stalled 4.3 s a switch (median of 14), up to 7.4 s, and more with each switch.
    Now 1.6 s, up to 3.0 s, and no more by the seventh than the first.
  - The longest single stall in a switch was 2.6 s (median), up to 4.5 s; now 1.1 s, up to 3.0 s.
  - The collector ran about 250 times a switch; now about 90.
  - A Select toggle after the switches took 0.31 s at its worst (median), up to 1.5 s; now 0.19 s,
    up to 0.41 s.
  - A cold launch stalled 1.5 s; now 0.9 s, since the store behind no longer replays its log.
- **Still slow.** What a switch costs now is drawing the tabs afresh: Spaces, Agents and You mount
  again for the workspace in front, and Primal's views take the UI thread too, so the gold line
  stops at its end for about 0.4 s before the rows come. The list's own allocations, about 20 MB a
  Select toggle, are not changed here.

This replaces point 2's "a store there reads no cache", the third addendum's store behind that
reads only where each room was last read, and the fourth's store closed in the commit that draws
its successor. The web and the Mac are as they were.

## Addendum, 26 October 2026: Join another workspace scans a code too

Status: Accepted, 26 October 2026. Arjun, tapping the workspace's name at the top of Spaces: "I see
this 'join with a link' option there. Should we also have QR code option button there?" A mock put
today's sheet beside three ways to add one (`docs/proposals/scan-in-workspaces-mocks.html`), and his
word was "Build B: Scan beside Paste, with the heading Join another workspace."

- **Why.** Invite someone shows the new link with its QR code, for somebody beside you. A phone
  with no workspace scans it from the first screen (ADR 0217's addendum of 26 October), but a
  phone already in one had only Paste here, and so no way in Chips to read the code on a screen
  next to it.
- **The section.** Its heading is Join another workspace, since it is no longer only about a link,
  and its line says both ways: scan the code on the other person's screen, or paste the link from
  the message it came in. Under it, one row: Scan a QR code, a white button with the QR mark in the
  accent colour, and iOS's own Paste, gold, half the row each and 48 points tall (`PasteAction`'s
  `beside`). Paste works as it did, so nothing asks to read the clipboard.
- **The camera.** Scan a QR code closes the sheet and, once it has gone, opens the camera the first
  screen uses (`ScanSheet`). From here it is for an invite alone: the line under the viewfinder
  names only An invite, there is no Type a pairing code instead, and any other code says "That code
  isn't a Chips invite. Ask them for the one in Invite someone." An invite closes the camera and
  opens the join sheet a pasted link opens (point 6 and the first addendum), unchanged. The camera
  is made afresh each time it opens, so an invite scanned, backed out of and scanned again opens
  again.
- **Where.** The same sheet opens from You's Workspace row, so Scan is there too. The web and the Mac
  are as they were: a computer has no camera to point at a phone.
