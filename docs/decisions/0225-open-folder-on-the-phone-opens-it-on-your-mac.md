# 0225. Open folder on the phone opens it in Finder on your Mac

Date: 23 October 2026
Status: Accepted, 23 October 2026: Arjun's option A on the mock, "Build A: Open folder on Mac on
the phone and the web, always there, saying whether your Mac heard it", after his "I want to see
open folder option when I open project section, tapping that button on iphone should trigger mac
Chips to trigger open the folder in finder". It builds on Your folder, [ADR 0224](0224-your-folder-is-a-copy-of-the-rooms-project-on-your-mac.md),
and on the frames the server sends only to the sockets that ask for them
([ADR 0094](0094-a-person-restarts-a-harness-through-its-own-connection.md)'s `restart`, the `accepts` of
[ADR 0211](0211-the-way-to-the-server-is-seen-and-goes-direct.md)).

## Context

ADR 0224 put Open folder in Chips for Mac only, because only the Mac can keep a folder. The phone's
Project page has Download as zip, which hands the files to the share sheet. Arjun opens a room on
his iPhone, wants its folder open on his Mac, and has to walk to the Mac and find the room there.

While Chips for Mac is running it holds a socket to the server, as the same person as the phone.
The server already sends a frame to just the sockets that said, in their hello, that they take it:
`restart` goes only to the harness asked to restart, `join` only to owners and admins.

## Decision (option A)

1. **Open folder on Mac, on the phone.** The phone's Project page, Files, starts with **Open folder
   on Mac**, above Download as zip: "Opens the project's folder in Finder on your Mac. Chips for
   Mac has to be open." A browser's Project page gets the same button.
2. **The phone asks the server.** A press signs `POST /v1/spaces/:id/project/folder/open`. The
   server lets through whoever may ask for the room's project token, and sends
   `folder.open { space_id, asked_at, from }` (`from` is the asking device's name) to that person's
   own sockets that accept `folders`. It answers `{ macs: n }`: how many it sent it to.
3. **Only the Mac accepts `folders`:** the Mac app's store says it in its hello, and its folder
   keeper hears each ask. A Mac app that can't keep a folder (one carrying no `chips`, ADR 0173)
   is counted as having heard, and opens nothing; every Mac app built since ADR 0224 carries it.
4. **The Mac does what its own Open folder does.** It makes the folder the first time, brings it up
   to `main` while untouched, and opens it in Finder. The frame names only the room: the Mac finds
   the folder itself, so nothing that came over the wire is ever a path. A room the Mac's own store
   doesn't have is ignored. The Mac's card then says "Opened from your iPhone just now."
5. **The phone says what happened.** With `macs` 1 or more: "Sent to your Mac. Finder opens the
   folder there." With none: "Chips for Mac isn't open, so nothing opened. Open Chips on your Mac
   and press again." Download as zip stays below, for when the Mac is off or elsewhere.

## Options

Cheapest first.

- **A. Always there, says what happened (recommended).** As above. One route, one frame, the Mac
  listening for it, the button on the phone and the web. About half a day with a walk on his
  iPhone and Mac.
- **B. Only while the Mac is open.** A, but the button shows only while a Mac is listening, and
  the page is as it is now otherwise. The server says whether one is when the page opens. About two
  hours more, and the button comes and goes as the Mac opens and closes, which reads as broken.
- **C. The Mac answers back.** A, and the Mac reports what it did; the phone waits a few seconds
  for it: "Opened in Finder on Arjun's Mac mini", or why not ("git isn't on your Mac", "your folder
  has a clash"). A route back from the Mac and a wait on the phone. About half a day more.

## Consequences

- A phone can make its own person's Mac open a Finder window, for a room they're in, under
  `~/Chips/Projects`, and nothing else. No one else's device can: the frame goes only to the
  asker's own sockets.
- With the Mac asleep or locked, Finder opens there unseen, and the phone still says Sent.
- Two Macs open it on both.
- Send my changes and the clash stay on the Mac. The phone only opens the folder.
- Built: `folder.open` and `folders` in the protocol (`frames.ts`), `projectFolderOpenAnswer`
  (`project.ts`); the route in `server/src/interfaces/http/routes/project.ts` and
  `Sessions.folderOpen`; the store's `openFolderOnMac` and `onFolderOpen`, made with `folders` in
  the Mac app (`apps/web/src/app/demo/store.ts`); the keeper's `heard` in
  `apps/web/src/app/folders.ts`; the browser's `OnMac` card; the phone's `Whole` card in
  `apps/mobile/src/spaces/RoomProject.tsx`.
