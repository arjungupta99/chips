# The media viewer — the prompt that starts each phase

*Written 13 September 2026, beside [`media-viewer.md`](media-viewer.md). One prompt per phase,
pasted into the session after the compaction that precedes it, in Arjun's words to the
implementer. Each stands alone: it says where things are, what to read, what was already
decided, what to ask before writing code, what done means, and what to hand back. The prompts
point at the proposal's sections rather than its lines, so an edit to the proposal does not
stale them. The last prompt is for picking a phase up again after a compaction in the middle
of it.*

**Which platform, when.** The iPhone and Android are one app, `apps/mobile`, and Phases 1 and 2
write the viewer once for both: nothing in them is code for iOS alone. The order is by surface,
not by phone: core first (Phase 0), then both phones (1 and 2), then what Android asks of the
viewer by itself (3), the server (4), the web and the desktop shell (5), the iPad and Android
tablets (6), and the sweep (7). Within a phone phase the iPhone simulator is where a change is
seen first, because `pnpm phone sim` and the phone e2e are the loop this app already has; the
Android emulator `chips-pixel-9` is built and recorded in the same phase, because Android was
set up beside this proposal on 13 and 14 September 2026 (the toolchain on this Mac, no Android
phone, `pnpm phone:android` on `main`). The walks on real hardware are Arjun's: his iPhone after
`pnpm phone`; there is no Android phone, so the click on Android waits for one.

The ground rules every prompt carries, so that none of them is a surprise: other projects
untouched; the live `chipsd` on 4431 is the launch agent `chat.chips.serve` — check
`lsof -nP -iTCP:4431 -sTCP:LISTEN` before believing anything about it, restart it only on
Arjun's word, and never `pkill` by pattern; the phone e2e runs on 5198 alone; every install is
said out loud before it is run, and a native dependency needs `pnpm phone pods` and a
`pnpm phone` rebuild on his word; Reanimated and gesture handler are imported only in
`apps/mobile/src/media/Stage.tsx`, mocked in `jest.setup.js` beside `Crossing`; Node 22;
`pnpm run check` green before anything is called done; small Conventional Commits with DCO
sign-off and the co-author line, no push until he says; STATUS before ending or compacting.

## Phase 0 · The deck and the arithmetic

```
Start Phase 0 of the media viewer: the deck and the arithmetic.

You are in the Chips worktree .claude/worktrees/chips-media-viewer-overhaul-a9cf34, on the branch
claude/chips-media-viewer-overhaul-a9cf34, level with main. Read, in this order: docs/STATUS.md,
under "Notes for the next session", the note "The media viewer, from 13 September 2026"; then
docs/proposals/media-viewer.md, §2 (the rules) and §4.1 (the deck and the arithmetic); then §5
Phase 0 (entry, work, done when, proof). The mocks are docs/proposals/media-viewer-mocks.html and
diagram A is this phase's picture.

Decisions already taken (§7): the deck is the media of the twenty messages around the tapped one,
which is the room's last twenty for a tap at the foot; a video plays when landed on; Save is a row
on both platforms. Nothing in this phase needs my word.

Do: packages/core/src/viewer.ts with the exports §4.1 lists (DeckItem, DeckWindow, DECK_WINDOW,
deckOf, indexOfItem, Size, Rect, fitRect, coverRect, zoomLimits, clampPan, rubberBand, snapPage,
dismissProgress, dismissDecision), pure, with no platform import, exported from
packages/core/src/index.ts beside the other projections; and viewer.test.ts with fast-check
property tests for every invariant in Phase 0's "Done when" (fast-check is already a
devDependency of packages/core). Touch no app.

Done means every sentence under Phase 0's "Done when" is true. Proof, with the output in your
report: pnpm vitest run packages/core/src/viewer.test.ts, then pnpm run check.

Ground rules: other projects untouched; the live chipsd on 4431 is the launch agent
chat.chips.serve — lsof before believing anything about it, restart only on my word, never pkill
by pattern; say any install out loud before running it; Node 22. Commit in small Conventional
Commits with DCO sign-off and the co-author line; do not push until I say.

At the end: update docs/STATUS.md first (the M4.4 line, and a dated session note: what shipped,
any departure from §4.1 and why, the commands with their output, known issues); record any
departure under Phase 0 in the proposal; commit; then report to me in a few lines, ending with
what Phase 1 needs from me, which is the word on three installs. Update STATUS before any
compaction.
```

## Phase 1 · The phone's viewer, for photos

```
Start Phase 1 of the media viewer: the phone's viewer, for photos.

You are in the Chips worktree .claude/worktrees/chips-media-viewer-overhaul-a9cf34 on its branch.
Read, in this order: docs/STATUS.md, under "Notes for the next session", the note "The media
viewer, from 13 September 2026" and the session note Phase 0 left; docs/proposals/media-viewer.md
§2 (the rules), §4.2 (the phone) and §4.6 (the numbers); then §5 Phase 1. The mocks are
docs/proposals/media-viewer-mocks.html: figures 1 to 6, 8 and 9 and diagrams B and C are this
phase's pictures, and every "done when" sentence has one.

First confirm Phase 0's exit: git log, and its two proof commands green. If it is not done, finish
it and tell me before going on.

Phase 0 left six things for this phase (its session note, and the departures under Phase 0 in
the proposal):
- deckOf takes the directory as its fourth argument.
- The arithmetic is marked "worklet", and that is unproven. Make the first thing Stage.tsx does
  a core function called from a gesture callback on the simulator. If the worklets plugin does
  not transform packages/core, tell me what you choose instead before building on it.
- The dismiss line's 120 is private to viewer.ts. Export it from core for the tick's `at`,
  rather than writing 120 twice.
- visibleLines is in the phone's spaces.ts, and again, privately, in viewer.ts. Lift it into core
  and move the phone onto it; the web's copy waits for Phase 5.
- useDeck holds the window: it asks deckOf for at least the room's length and keeps the lines
  the deck opened with.
- A video with no durationMs is a file row in the room, not a tile. It pages in the deck but has
  no tile to return to. Decide whether it gets one, and record it.

Decisions already taken (§7): the deck is the media of the twenty messages around the tapped one;
a video plays when landed on (Phase 2's, not this phase's); Save is a row on both platforms.

Before any code: ask me for the word on the three installs into apps/mobile, pinned exactly —
expo-image@57.0.4, expo-media-library@57.0.4 for Save, expo-clipboard@57.0.1 for Copy — and wait
for it. Then install, run pnpm phone pods, and tell me the app on my phone needs pnpm phone,
which is mine to run. The emulator picks the three up at its next build: pnpm phone:android
--no-pair rebuilds and installs on chips-pixel-9, which is already paired, and is yours to run —
not beside Metro and the phone e2e, which this Mac's 16 GB will not hold together. Pairing it
again, or posting anything into the live workspace from it, is on my word.

Do: §4.2 without its Video paragraph — the seven files of apps/mobile/src/media/, with Stage.tsx
the only file in the app that imports Reanimated and gesture handler, mocked in jest.setup.js
beside Crossing with the same note about what that costs; the tiles in Attachments.tsx and
LaneChain.tsx measuring on press and registering; SpaceView mounting the provider and answering
reveal with an unanimated scrollToIndex; files.view falling back to file on a 404; Actions with
Share, Save, Copy, Go to message, Details, Open original; feel.tick at the dismiss line and the
Android branch in haptics.ts; the Android props and Material's marks, seen on the emulator in this phase and walked in Phase 3;
Jest mocks for expo-image (keeping source and placeholder as props), expo-media-library and
expo-clipboard; e2e/viewer.spec.ts on the web target; e2e/maestro/viewer.yaml; ADR 0056 from §2;
the mobile guide's "what a tap on a photo does". A video tile keeps playing as it does today.

Done means every sentence under Phase 1's "Done when" is true. Proof: pnpm --filter @chipschat/mobile
test, pnpm run check, pnpm mobile:e2e on 5198 alone, a simulator recording — pnpm phone sim,
frames from simctl video through Swift as before — of the open, the swipe and the drag, beside
figures 2, 4 and 6; and the same three on the emulator (adb shell screenrecord) beside figure 3b.
Name the frames' paths in the report. The walk on my iPhone is mine.

Ground rules: other projects untouched; nothing on the live chipsd on 4431 without my word, lsof
before believing anything about it, never pkill by pattern; the phone e2e on 5198 alone; say any
further install out loud before running it; Node 22. Commit in small Conventional Commits with DCO
sign-off and the co-author line; do not push until I say.

At the end: update docs/STATUS.md first (the M4.4 line and a dated session note: what shipped,
departures from §4.2 and why, the commands with their output, known issues); record departures
under Phase 1 in the proposal; commit; then a short report ending with what Phase 2 needs from
me: the app.json change for Picture in Picture and a rebuild. STATUS before any compaction.
```

## Phase 2 · Video in the viewer

```
Start Phase 2 of the media viewer: video in the viewer, on the download path.

You are in the Chips worktree .claude/worktrees/chips-media-viewer-overhaul-a9cf34 on its branch.
Read, in this order: docs/STATUS.md, under "Notes for the next session", the note "The media
viewer, from 13 September 2026", and the session note Phase 1 left; docs/proposals/media-viewer.md
§4.2's Video paragraph and §4.6, the departures under Phase 1, then §5 Phase 2; ADR 0057. Figure 7
and figure 9's first frame are this phase's pictures.

First confirm Phase 1's exit: git log (ac01bab or later), pnpm --filter @chipschat/mobile test and
pnpm run check green, and the frames its note names. If not, finish it and tell me.

Phase 1 left these for this phase (its session note, and the departures under Phase 1):
- A video the server never measured is not in the deck, but Phase 2's "Done when" says an
  unmeasured one opens the viewer from its row. Decide how, and record it. Recommended: the row's
  Play opens the viewer on that one video alone, with the shrink-and-fade on close, and the deck
  rule stays as it is.
- In the deck today a video is its poster with a play mark, and a tap on the stage (onTap in
  MediaViewer.tsx) opens the old spaces/Player.tsx. VideoItem replaces both. The Jest mock of
  Stage in jest.setup.js draws the current item, so keep it in step.
- Reanimated and gesture handler stay in Stage.tsx alone. §4.2 calls the scrubber "a pan on a
  track". Either put that pan in Stage, or use React Native's PanResponder in the chrome, claiming
  at touch start, as ui/Sheet.tsx's handle does inside a Modal. Say which. The stage's own pan
  must not take a drag that began on the scrubber.
- The chrome hides three seconds into a playing video (§4.6). Figure 7 wants a tap to toggle play
  while the chrome is hidden; today a tap only toggles the chrome.
- The stage already treats a video as not zoomable (zoomable in Stage.tsx), so double tap and
  pinch do nothing on it. The drag to dismiss must work while it plays, and pause it.
- onProgress over the body's reader: the phone's fetch (core's linkFor, and the relay's tunnel)
  may hand back a Response with no streaming body under React Native. Find out first. If there is
  none, tell me what the ring can honestly show before you build it.
- Every "worklet" in Stage.tsx is declared after what it calls
  (tools/guardrails/worklet-order.test.ts). On Android a pan decides its meaning only after it
  moves 10 points, and a tap fails past that distance. Keep both true.
- Walk it the way Phase 1 did. The booted simulator's Chips is paired with the live server, so
  use the "Chips viewer walk" simulator (819A2DFC-666A-4E8A-85EB-5D9D77C2E9C8) against
  pnpm mobile:dev on 4434, with its own .chips/phone-dev. Rebuild the worktree's Debug build with
  RCT_METRO_PORT=8083 after the app.json change: prebuild ios/ again, then pnpm phone pods if the
  doctor asks. Seed clips as the demo harness. simctl's video is variable frame rate, so dump
  every frame and pick by time.
- The emulator is paired with my live workspace. Opening a room there marks it read; that is
  allowed. If no room there has a clip, ask me before posting one from anywhere, or before
  pairing the emulator with a scratch server.

Decided: a video plays when landed on and pauses when left; Save is a row; the deck is the twenty
messages around the tapped one.

Before any code: ask me for the word on the app.json change — expo-video's plugin gains
supportsPictureInPicture: true, a manifest flag on both platforms — and tell me my phone needs
pnpm phone to rebuild, which is mine. pnpm phone now makes ios/ again when app.json is newer.

Do: VideoItem.tsx with expo-video's VideoView, nativeControls off, contentFit contain, Picture in
Picture allowed; the viewer's own controls (play and pause, a scrubber with the buffered range,
the time, mute, Picture in Picture) and "System player" in the menu; core's fetchAttachmentWithType
gains onProgress over the body's reader and files.play passes it on, so the poster carries a ring
while the copy comes; play on landing, pause on leaving, resume on return; the caption that says
the original is playing while the copy that plays everywhere is being made; a video tile and a
row's Play open the viewer on the video; Player goes; the two video specs in e2e/media.spec.ts and
the Jest tests in Attachments.test.tsx move to the viewer.

Done means every sentence under Phase 2's "Done when" is true. Proof: pnpm --filter @chipschat/mobile
test, pnpm run check, pnpm mobile:e2e on 5198 alone, and a recording of a clip playing in the
viewer beside figure 7, from the simulator and from the emulator. The app.json change reaches the
emulator through pnpm phone:android --no-pair, which is yours; not beside Metro and the phone e2e.
Then tell me it is ready for the walk that M4.4 still owes, a two-minute video over a flaky
connection on my phone, which is mine.

Ground rules: other projects untouched; nothing on the live chipsd on 4431 without my word, lsof
first, never pkill by pattern; the phone e2e on 5198 alone; say any install out loud first; Node
22. Small Conventional Commits with DCO sign-off and the co-author line; no push until I say.

At the end: STATUS first (the M4.4 line and a dated session note with what shipped, departures
and why, the commands and their output, the frames' paths, known issues); departures recorded
under Phase 2 in the proposal; commit; a short report ending with what Phase 3 needs from me: the
word on installing Maestro. STATUS before any compaction.
```

## Phase 3 · Android: what it asks of the viewer by itself

```
Start Phase 3 of the media viewer: what Android asks of the viewer by itself.

You are in the Chips worktree .claude/worktrees/chips-media-viewer-overhaul-a9cf34 on its branch.
Read: docs/STATUS.md's note "The media viewer, from 13 September 2026", the session notes Phases 1
and 2 left, and the two Android session notes of 14 September 2026 (the app walked on the
emulator; chips build mobile a); apps/mobile/README.md's Android section; then
docs/proposals/media-viewer.md §1's "On Android", §4.2's "On Android", the departures under
Phases 1 and 2, and §5 Phase 3. Figure 3b is this phase's picture, and figure 9's first frame for
the ring.

Already true, and not this phase's to redo: decision 11 is answered — the toolchain is on this
Mac (Temurin JDK 17, the SDK in ~/Library/Android/sdk, the emulator chips-pixel-9 on Android 16),
and there is no Android phone; pnpm phone:android checks, builds, installs and pairs; the
cleartext flag is in; the README has an Android section; expo-media-library's permission strings
went into app.json in Phase 1, and expo-video's supportsPictureInPicture in Phase 2 (the manifest
carries android:supportsPictureInPicture="true"). Phases 1 and 2 built and recorded the viewer on
the emulator as they went: it opens and returns, pages, drags away, saves to the gallery, plays a
video with the viewer's controls, shows the ring (98 %, 8.7 MB of 8.9 MB), enters Picture in
Picture, and opens System player with ExoPlayer's controls.

First confirm Phase 2's exit: git log (b9b4a5a or later), pnpm --filter @chipschat/mobile test and
pnpm run check green, and the android-* frames its session note names. Then ask me for the word on
installing Maestro — a JVM tool, not a dependency of the repo — and wait for it.

Phase 2 left these for this phase (its session note's known issues, and the departures under
Phase 2):
- Picture in Picture on Android shrinks the whole activity into the pinned window, the viewer's
  bars and counter included, not the video alone. Make the pinned window show the video: hide the
  bars while in it (VideoView's onPictureInPictureStart and Stop), and see what else the activity
  draws there. Say what the window shows when you are done.
- A video whose view mounts again at its end (after System player's Done) is a black stage with
  the play mark until it plays: the view covers the poster. Keep the poster, or the last frame,
  showing (useExoShutter, onFirstFrameRender, or the poster above the view until the first frame).
- The menu's hints say "The share sheet: AirDrop, and every app" and "Full screen, with AirPlay and
  captions" on Android too. Give Android its own words.
- §4.2's "On Android" says an iPhone's HEVC original may not decode on a given Android phone before
  its copy exists, and that the poster shows with a sentence. Today such a video says "Could not
  play the video." with the player's error. Walk an HEVC original whose copy is still being made
  (the server makes copies one at a time: queue two long clips ahead of a short one, and take the
  screenshot in the same adb command as the tap), and decide the words.

How the emulator is set up now: it is paired with the worktree's scratch server, not the live
workspace — at my word in Phase 2 its app data was cleared and it paired with pnpm mobile:dev at
10.0.2.2:5197. .chips/phone-dev holds the seeded room (PO-4471, spc_01M2FDPRCMTY9BQK6KSGXH2C55)
with photos, HEVC and H.264 clips and an unmeasured row. pnpm mobile:dev starts Metro on 8083 as
well: start it for a walk, and stop it before a rebuild or the phone e2e. adb input swipe is one
continuous gesture, and chained motionevent steps are about 0.4 s apart. Open the room with
adb shell am start -a android.intent.action.VIEW -d chips://spaces/<id> chat.chips.app. Pairing it
back with the live workspace, or posting into the live workspace from it, is on my word.

Do: walk every sentence of Phase 3's "Done when" on the emulator; fix what differs from §4.2's
"On Android", and the four things above, and record each difference as a departure under Phase 3;
extend e2e/maestro/viewer.yaml with a video (open its tile, see it play, drag it away) and run it
on the emulator — the first Maestro flow ever run here — keeping its output. Decision 12 stands
unless the hand says otherwise: a page swipe from the system's edge is a back, and the viewer
closes with its return. Rebuild with pnpm phone:android --no-pair, not beside Metro and the phone
e2e. Every "worklet" in Stage.tsx stays declared after what it calls; Reanimated and gesture handler
stay in Stage.tsx alone.

Done means every sentence under Phase 3's "Done when" is true. The click is a phone's alone and
there is none: say it is unanswered, and leave haptics.ts's note saying so. Proof: pnpm
phone:android's checks green, the emulator recording beside figure 3b (and a video in Picture in
Picture), the Maestro run's output, pnpm --filter @chipschat/mobile test, pnpm run check, and
pnpm mobile:e2e on 5198 alone if the phone's code changed.

Ground rules: other projects untouched; nothing on the live chipsd on 4431 without my word, lsof
first, never pkill by pattern; the phone e2e on 5198 alone; every install said out loud first;
Node 22. Small Conventional Commits with DCO sign-off and the co-author line; no push until I say.

At the end: STATUS first (the M4.4 line, and a dated session note with what shipped, what differed
on Android and why, the commands and their output, the frames' paths, known issues); the README's
Android section says what the viewer does there; commit; a short report ending with what Phase 4
needs from me: migration 0021 on the live chipsd and its restart, the grant's trade as ADR 0057
states it, and the desktop shell's CSP change. STATUS before any compaction.
```

## Phase 4 · The bytes: a view copy, byte ranges, and a grant

```
Start Phase 4 of the media viewer: the bytes — a view copy, byte ranges, and a grant.

You are in the Chips worktree .claude/worktrees/chips-media-viewer-overhaul-a9cf34 on its branch.
Read: docs/STATUS.md's note "The media viewer, from 13 September 2026" and the session notes
Phases 1, 2 and 3 left; docs/proposals/media-viewer.md §1 items 9 and 10, §4.5 (the server), §4.3
(the desktop's in-row player), the departures under Phases 1, 2 and 3, then §5 Phase 4. Diagram D
is this phase's picture. Read ADR 0052, ADR 0053 and ADR 0057 too, and the grant that already
exists for a harness in server/src/interfaces/http/routes/uploads.ts (admitReader, verifyGrant).

The numbers moved before this phase began, and the proposal says so: migration 0021 is the voice
notes' search, which the live database already has, so the view copy's is 0022; ADR 0057 is the
viewer, so the grant's is 0058.

Already true, and not this phase's to redo:
- Phase 2: the phone plays a video from files.play's download. The tunnel streams it, so the ring
  is true through the relay too. ?variant=play says x-chips-playable (pending, done, skipped,
  failed), and VideoItem holds the viewer's one expo-video player.
- Phase 3: a pending play answer is cache-control: no-store. Try again, for an original the phone
  cannot play, asks for the copy alone (core's copyOnly, files.play's forCopy). On Android the
  viewer's own window is apps/mobile/modules/viewer-window: the status bar, and Picture in Picture
  stepping aside and taking the video's shape. Maestro is in ~/.maestro, and e2e/maestro/viewer.yaml
  passes on the emulator.
- The live chipsd on 4431 is the launch agent chat.chips.serve, run from the main checkout
  ~/Work/Chips, which was clean at 03348c4, behind main by Phases 2 and 3. A restart alone brings
  it nothing new.

First confirm Phase 3's exit: git log (0c00e93 or later), pnpm --filter @chipschat/mobile test and
pnpm run check green, and Phase 3's frames and Maestro run on disk.

Phases 2 and 3 left these for this phase to decide, each recorded in ADR 0058 or as a departure:
- A grant for ?variant=play while the copy is being made names bytes that change mid-playback,
  when the copy lands, and a range of the copy is not a range of the original. Either a grant
  serves the bytes it resolved to (by digest) for its life, or play grants wait for the copy.
  Either way, Try again for an original the phone cannot play asks for a fresh grant.
- What a cache may keep: a grant URL is a bearer, so private and never past its exp; a pending
  answer stays no-store.
- What the poster shows while a stream starts, now that the ring is only the download path's.
  Through the relay, streamUrl is nothing and the viewer downloads as in Phase 2, ring and all.
- The players:
  - AVPlayer on iOS wants Accept-Ranges and a true content-type.
  - ExoPlayer on Android plays the grant URL over plain http on the tailnet; the cleartext flag is
    in.
  - The web's <video> behaves as AVPlayer does.
- Save's and Share's file names carry the attachment id (att_…-receipt.jpg), from files.file's
  naming. Fix it if FileService is open anyway; otherwise it stays a known issue.

Do: migration 0022 with view_sha256 and view_mime_type. images.thumbnail at a viewEdge of 2,048
at upload for a raster photo and for a video's poster, and on the first GET ?variant=view for an
older row, recorded once. BlobStore.size and BlobStore.read with a range in the port and the disk
adapter, streaming, never the whole blob for a megabyte of it. Range in the route with 206, 416
and Accept-Ranges. POST /v1/attachments/:id/grant with verifyDeviceGrant beside verifyGrant: the
grant is admitted as its device, so admitReader and the audit run as that person; ten minutes for
a photo, and a video's length plus ten for play, at most an hour. Its row in the authorization
matrix, and the logger dropping sig. Then:
- FileService.streamUrl on both clients, nothing when the link is the relay; VideoItem and the
  desktop's player preferring it.
- The phone's files.view no longer needing its fallback against this server.
- The desktop shell's CSP admitting http: and https: for img-src and media-src.
- ADR 0058 with the trade stated plainly, the protocol reference regenerated, and the conformance
  kit's restatement if it covers attachments.

Walk it on the iPhone simulator ("Chips viewer walk", 819A2DFC…) and on the emulator
(chips-pixel-9). Both pair with the worktree's scratch pnpm mobile:dev: on the network, a clip
starting from its grant within a second and scrubbing; through a relay pairing, the download path
as before.
- The emulator is paired with that scratch server already, and a rebuild is pnpm phone:android
  --no-pair, not beside Metro and the phone e2e. mobile:dev starts Metro on 8083; stop it before a
  rebuild or an e2e run.
- Put adb captures in /data/local/tmp, not /sdcard, which the gallery indexes.
- Record every "worklet" in Stage.tsx declared after what it calls; Reanimated and gesture handler
  stay in Stage.tsx alone.

The live server: do not touch the chipsd on 4431 or the main checkout at ~/Work/Chips. When the
phase's tests are green, ask me for the word to bring the main checkout to main (git pull
--ff-only, after checking it is clean), back up .chips/chips.db, and restart the launch agent
(launchctl kickstart -k gui/$(id -u)/chat.chips.serve) so 0022 applies. Before believing it is
back, check lsof, its log and _chips_migrations. The desktop app's rebuild for the CSP is mine, on
the laptop.

Done means every sentence under Phase 4's "Done when" is true. Proof:
- pnpm test, pnpm run check, and the server's integration tests.
- A curl against the dev server with Range: headers showing 206 for a first, a middle and an
  open-ended range, and 416 past the end; and a grant refused for another device, after its
  expiry, and for another variant.
- pnpm mobile:e2e on 5198 alone, and the web e2e with CHIPS_E2E_WEB_PORT=5199 alone, never beside
  each other or pnpm check.
- Recordings of a clip starting from its grant on the simulator and on the emulator.
- After the restart, on my word, a recording of a clip starting on the tailnet on my iPhone after
  pnpm phone. That one is mine.

Ground rules: other projects untouched; the live chipsd and the main checkout only as above; never
pkill by pattern; the phone e2e on 5198 alone; every install said out loud first; Node 22. Small
Conventional Commits with DCO sign-off and the co-author line; no push until I say.

At the end: STATUS first. The M4.4 line, and a dated session note: what shipped, departures from
§4.5 and why, the commands and their output, known issues, whether the live server has 0022, and
where the main checkout stands. Then the departures under Phase 4 in the proposal; commit; a short
report ending with what Phase 5 needs from me, which is a look at the visual snapshots before they
land. STATUS before any compaction.
```

## Phase 5 · The web's lightbox

```
Start Phase 5 of the media viewer: the web's lightbox.

You are in the Chips worktree .claude/worktrees/chips-media-viewer-overhaul-a9cf34 on its branch.
Read: docs/STATUS.md's note "The media viewer, from 13 September 2026" and the session notes of
Phases 1 to 4; docs/proposals/media-viewer.md §1 items 6 to 8, §2, §4.3 (the web), §4.6, §4.8, the
departures under Phases 1 to 4, then §5 Phase 5. Read ADR 0057 (the viewer's rules) and ADR 0058
(the view copy, the ranges, the grant). Figures 11, 12 and 13 are this phase's pictures (the
lightbox, a video on the desktop, zoom at the pointer); figure 10 is the wide window, and the
phone's figures say what the web copies.

No migration this phase, and no ADR is expected: ADR 0057 is the web's too. If one turns out to be
needed it is 0060, since another worktree took 0059.

Already true, and not this phase's to redo:
- Phase 0: packages/core/src/viewer.ts holds the deck and the arithmetic: deckOf (DECK_WINDOW, the
  twenty messages around the tapped one), deckOfOne, indexOfItem, fitRect, coverRect, zoomLimits,
  clampPan, rubberBand, snapPage, dismissProgress, DISMISS_DISTANCE and dismissDecision.
  visibleLines is core's (model/readers.ts); apps/web/src/app/SpaceView.tsx still has its own copy,
  which this phase replaces with core's (Phase 1's departure).
- Phases 1 and 2: the deck takes a video by hasPoster; a video the server never measured is a row,
  opened as a deck of one. ?variant=play says x-chips-playable (pending, done, skipped, failed).
- Phase 4:
  - ?variant=view is a 2,048-pixel WebP, and says x-chips-view: copy, or original for a GIF or a
    photo sharp could not read, which is served as itself.
  - GET /v1/attachments/:id serves Range with 206, 416 and Accept-Ranges.
  - POST /v1/attachments/:id/grant hands back a path a player fetches with nothing else: ten minutes
    for a photo, a video's length and ten more to play it, an hour at most. A play while the copy is
    being made names the file.
  - The web's FileService.streamUrl(id, variant) gives that URL, and nothing through the relay or
    from a server from before grants. VideoCard plays in its row from it.
  - The page chipsd serves reaches the URL as its own origin. The desktop shell's content policy
    admits http: and https: for img-src and media-src; the app carries it at its next build, which
    is mine.
- The live chipsd on 4431 has migration 0022 since 15 September 2026, 14:58 UTC. The main checkout
  ~/Work/Chips was at main (dc1eafb), and the page the live server serves is that checkout's
  apps/web/dist.

First confirm Phase 4's exit: git log (dc1eafb or later), pnpm run check green. Then verify §1.6
before writing anything: what a photo's click does today (Attachments.tsx calls window.open on an
object URL) in a browser against a scratch server, and in the desktop shell with pnpm desktop:dev
if it builds here (the Rust toolchain is on this Mac; the first build is long). Record what you saw
in the session note.

Decided: the deck is the media of the twenty messages around the tapped one; a video plays when
landed on; Save on the desktop is Download, the original as sent. Ask me decisions 8 (the filmstrip
on where there is room, off while zoomed) and 10 (touch through pointer events in this phase) before
writing the filmstrip and the touch path, with the proposal's recommendations.

Phases 1 to 4 left these for this phase to decide, each recorded as a departure:
- A picture: <img src> from files.streamUrl(id, "view") where there is a grant, so the browser's own
  loader draws it progressively, and an object URL of ?variant=view where there is none; the
  thumbnail's object URL underneath until it loads. Give the web's FileService a view that reads
  x-chips-view the way the phone's does. A view that is the photo itself has no Open original, and
  one the browser cannot draw (a HEIC) says so, with Download.
- A video: VideoStage.tsx plays streamUrl(id, "play") where there is a grant and the blob
  otherwise. A pending copy says the original is playing. A browser that cannot play the original
  (HEVC in Chrome) says so in the phone's words, and Try again asks for a fresh grant, which names
  the copy once it is made.
- A lightbox left open past a grant's expiry: a picture or a video that fails is asked for again
  with a fresh grant, once, before it says it could not.
- §4.3 says a video's poster opens the viewer rather than playing in its row. VideoCard's in-row
  player moves into VideoStage; the row keeps Download. Phase 4's web spec "a clip plays in its row
  from a grant" moves to viewer.spec.ts with it.

Do: apps/web/src/app/viewer/:
- Lightbox.tsx as a <dialog> in document.body opened with showModal().
- Stage.tsx with wheel and pointer events, and the touch path through pointer events, on core's
  arithmetic.
- Filmstrip.tsx and VideoStage.tsx.
- open.ts as a FLIP with the Web Animations API on the design system's --ease. Not
  startViewTransition: the shell's WKWebView on macOS 13 has none.
- useViewer.ts with the ViewerHost a room or a thread mounts.

Then:
- Attachments.tsx loses window.open and opens the viewer for photos and for a video's poster.
- SpaceView.tsx and Thread.tsx mount a ViewerHost each.
- The styles go under a viewer block in styles.css, on the design system's tokens, with the stage
  black. The keys are §4.3's.
- A Media viewer section in kitchen-sink/gallery.tsx.
- apps/web/e2e/viewer.spec.ts, and a second project in apps/web/playwright.config.ts at a Pixel's
  viewport with hasTouch, beside chromium. apps/web has no tablet project: the tablet one is
  apps/mobile's.
- The desktop guide's keys table.

The live server: do not touch the chipsd on 4431 or the main checkout. When the phase's tests are
green, ask me for the word to bring the main checkout to this work and build its page (git pull
--ff-only after checking it is clean, then pnpm web:build there). Another worktree may have moved
main or restarted the server meanwhile: look at git -C ~/Work/Chips log and lsof first, and rebase
onto what is there. The desktop app's rebuild is mine, on the laptop.

Done means every sentence under Phase 5's "Done when" is true. Proof:
- pnpm --filter @chipschat/web test and pnpm run check.
- The web e2e with CHIPS_E2E_WEB_PORT=5199 (5174 is another project's), both projects. It runs
  alone, never beside the phone e2e or pnpm check.
- Screenshots or a recording beside figures 11, 12 and 13, from Chrome and, if it builds, from the
  desktop shell.
- pnpm visual:update in the container: it needs Docker, and the daemon was not running here on 15
  September, so starting Docker Desktop is mine — say when it is needed. Show me the new snapshots,
  in both themes, before they are committed.

Ground rules: other projects untouched; nothing on the live chipsd on 4431 without my word, lsof
first, never pkill by pattern; another worktree may hold a port (5197, 8083, 4434, 4432, 4433 or
5199), so look before starting a server, and pick your own rather than stop anything; every
install said out loud first; Node 22. Watch the disk: on 15 September it filled to 125 MB free
mid-session. Say what is using it before deleting anything that is not yours. Small Conventional
Commits with DCO sign-off and the co-author line; no push until I say.

At the end: STATUS first. The M4.4 line, and a dated session note: what shipped, what §1.6 turned
out to be, departures from §4.3 and why, the commands and their output, known issues, and where the
main checkout and the live page stand. Then the departures under Phase 5 in the proposal; commit; a
short report ending with what Phase 6 needs from me: whether to install an Android tablet emulator
image for its recording. STATUS before any compaction.
```

## Phase 6 · The tablets, and the wide window

```
Start Phase 6 of the media viewer: the tablets, and the wide window.

You are in a Chips worktree on its own branch. main carries Phases 0 to 5 and is pushed; the live
page on 4431 was built from it on 16 September 2026.
Read: docs/STATUS.md's note "The media viewer, from 13 September 2026" and the session notes of
Phases 1 to 5; docs/proposals/media-viewer.md §2 rule 10, §4.2, §4.4, §4.6's last rows, and the
departures under Phases 1 to 5; then §5 Phase 6. Read ADR 0057. Figure 10 is this phase's picture
— the viewer over the whole window, with room for a filmstrip; figures 4, 5 and 7 say what the
narrow window still does.

No migration, no server change, and no ADR is expected: ADR 0057 is the tablet's too.

Already true, and not this phase's to redo:
- useLayout (apps/mobile/src/ui/layout.ts) is the one rule that decides wide, and it reads the
  window and never the device: 768 points across AND 600 down, so a phone on its side is not wide.
  It is already what the rail and the split read.
- The phone's viewer is whole (Phases 1 to 3): the deck, the pager, zoom, the drag to dismiss, a
  video on the stage with its own controls, Picture in Picture and the status bar through
  modules/viewer-window, and Maestro's e2e/maestro/viewer.yaml.
- Chrome.tsx already draws 44-point arrows at the sides, but only where POINTER — which is
  Platform.OS === "web" (MediaViewer.tsx, arrowsFor). A native tablet gets none today. That gate
  is what this phase replaces.
- There is no filmstrip in the phone app at all. The web has one (Phase 5, apps/web/src/app/
  viewer/Filmstrip.tsx): 56-pixel thumbs, the current one ringed in gold, hidden under 900 pixels
  of width and while zoomed. Read it before writing this one — the words, the sizes and the
  behaviour should agree — but it is React DOM and this one is React Native.
- The web's wide window is done. This phase is the phone app's: the iPad, and an Android tablet.
- apps/mobile/e2e/tablet.spec.ts exists, and playwright.config.ts's tablet project runs it in an
  11-inch iPad's window upright (834 × 1194, deviceScaleFactor 2). One spec, and only the window
  differs from chromium's.
- The Android tablet emulator is installed and verified (16 September 2026): the AVD
  chips-pixel-tablet, on the Pixel Tablet profile, Android 16 at 2560 × 1600 and 320 dpi — which
  is 1280 × 800 dp in landscape, well clear of useLayout's 768. It reuses the same system image
  as chips-pixel-9, so nothing was downloaded for it. Start it with
  ~/Library/Android/sdk/emulator/emulator -avd chips-pixel-tablet. Like the phone AVD it came out
  PlayStore.enabled=no, so it is a Google APIs device in practice.

Decided already: the filmstrip is on where there is room and off while zoomed (decision 8, 16
September 2026). Nothing in this phase needs a new decision from me.

Do: §4.4.
- Chrome.tsx draws the filmstrip under the caption when useLayout().wide, and the arrows the same
  way — on Pressable's onHoverIn for a pointer, which a mouse on Android raises too, and staying
  for a finger's tap. The POINTER gate goes.
- Rotation re-runs fitRect and keeps the zoom's centre, rather than resetting to fitted.
- A narrow window is the phone's viewer, unchanged: no strip, no arrows.
- e2e/tablet.spec.ts gains a viewer test: it opens over the split, the filmstrip is there, an
  arrow pages, and a narrow window has neither.

Then: the words the strip's thumbs are announced with, as the web's are; the tokens it is drawn
on; and whatever the phone's tests need to keep saying the truth.

Done means every sentence under Phase 6's "Done when" is true. Proof:
- pnpm run check, and pnpm --filter @chipschat/mobile test.
- pnpm mobile:e2e for the tablet project. It runs alone, never beside the web e2e or pnpm check;
  the phone e2e is on 5198, and another worktree may hold a port.
- A recording or frames beside figure 10 from an iPad simulator (pnpm phone sim with an iPad
  device name), and one from chips-pixel-tablet. Frames come out of simctl video through ffmpeg
  on iOS; put adb captures in /data/local/tmp, never /sdcard.
- Walk a fresh simulator or the emulator against a scratch server, not the booted one paired with
  the live workspace; pairing either with the live workspace is mine.

The live server: do not touch the chipsd on 4431 or the main checkout. This phase changes no
server and no page, so it needs no live step at all — say so rather than asking for one. If that
turns out to be wrong, ask.

Worth knowing, from Phase 5, because both cost an hour there:
- The kitchen sink's visual suite keeps a COMPONENTS list that mirrors the gallery's sections and
  asserts the count. Add a section without adding it to that list and CI's visual job fails.
- pnpm visual and pnpm visual:update need Docker. It is colima here, not Docker Desktop, and it
  wanted a restart rather than a start. Say when you need it.

Ground rules: other projects untouched; nothing on the live chipsd on 4431 without my word, lsof
first, never pkill by pattern; another worktree may hold a port, so look before starting a server
and pick your own rather than stop anything; every install said out loud first; Node 22. Watch the
disk. Small Conventional Commits with DCO sign-off and the co-author line; no push until I say.

At the end: STATUS first — the M4.4 line, and a dated session note: what shipped, departures from
§4.4 and why, the commands and their output, known issues, and what the two tablets showed that
the phone did not. Then the departures under Phase 6 in the proposal; commit; a short report
ending with what Phase 7 needs from me, which is nothing. STATUS before any compaction.
```

## Phase 7 · The sweep

```
Start Phase 7 of the media viewer: the sweep.

You are in a Chips worktree on its own branch. main carries Phases 0 to 6 and is pushed (3b77bf7,
16 September 2026); the live page on 4431 was built from Phase 5's main, and Phase 6 changed no
page.
Read: docs/STATUS.md's note "The media viewer, from 13 September 2026" and the session notes of
Phases 1 to 6 — Phase 6's above all, for what the tablets found and how the devices were walked;
docs/proposals/media-viewer.md §2 rules 2 and 3, §3's figure 1, §5 Phase 7 and "Not in this pass,
recorded", the departures under Phases 1 to 6, and §7 decision 7. Figure 1 in
media-viewer-mocks.html is this phase's picture: the room on a phone, an album of six (four shown,
+2), a receipt alone, a clip as its poster.

No migration, no server change and no ADR is expected.

Already true, and not this phase's to redo:
- STATUS's M4.4 line already names the viewer, a sentence per phase. What is left is to make it
  one line that says what the viewer is, not a seventh sentence.
- apps/mobile/src/spaces/Attachments.tsx draws the room's files. Photos are a Grid of up to four
  (GRID_MAX), each tile 48 % wide with React Native's own Image, +N on the fourth; a photo alone is
  the whole width at its own shape, clamped between 0.6 and 1.8 wide over tall, with no cap on
  its height. A video the server measured is a VideoTile below the grid, full width up to 280
  points, never in it. Every tile joins the viewer's registry through useViewerTile.
- The desktop's grid (apps/web/src/app/Attachments.tsx, .photo-grid in apps/web/src/styles.css)
  is the shapes this phase wants: data-count 1, one column, no crop, at most 360 px tall; 2, two
  side by side; 3, 2fr 1fr with the first spanning two rows; 4, two by two; tiles 4:3. It keeps
  videos out of its grid too: a VideoCard below it.
- The composer's staged chip (Composer.tsx, Chip) opens nothing. It is a thumb, a name, a line
  and a ×. The viewer opens only on a line's attachment (Opening: lineId and attachmentId, the
  deck from useDeck), so a picked file that is not a message yet has no way in. That way in is
  this phase's to add: a deck of one from the picked file's local URI.
- There are no screenshots in apps/docs at all. operate/mobile.md has "What a tap on a photo or a
  video does", written for a phone, and nothing about the tablets from Phase 6: the filmstrip, the
  arrows, and the turn that keeps the zoom's centre. docs/chips-blueprint.html's Photos row still
  says "tap for full screen, pinch to zoom".
- The devices. The booted iPhone 17 Pro simulator is paired with the live workspace: never walk
  it. The "Chips viewer walk" iPhone simulator was deleted in Phase 1's cleanup, so the phone walk
  needs a fresh iPhone simulator made from the installed iOS 26.5 runtime (xcrun simctl create;
  nothing is downloaded), as Phase 6 made "Chips iPad walk". chips-pixel-9 and chips-pixel-tablet
  are the emulators. A Release build for the simulator and the Android release build are in this
  worktree's gitignored apps/mobile/ios and apps/mobile/android, so the next builds are minutes.

Ask before writing code: decision 7, mixed albums. The proposal recommends yes and it was never
answered. Say in the question that the desktop's grid keeps videos out too, so a yes for the phone
alone leaves the two grids different, and ask whether the desktop follows in this phase. That
answer decides whether this phase touches the page at all.

Do: §5 Phase 7.
- The phone's tiles take expo-image, so the viewer's placeholder is the tile's own bitmap.
- The phone's grid takes the desktop's shapes instead of 48 % tiles.
- A photo alone keeps its shape and stops at 200 points tall (figure 1).
- If decision 7 is yes, a measured video is a tile of the grid with its play mark and length, so a
  message with photos and a clip is one album, and the clip's tile opens the viewer on the clip.
- A staged photo's chip opens the viewer over the picked file, with Send where it was.
- The blueprint's Photos row gains the swipe and the drag. operate/mobile.md gains the tablets.
  operate/desktop.md changes only if the desktop's grid does.
- "Not in this pass, recorded" is carried into STATUS as what is left, with what Phase 6
  recorded: wide to narrow takes the room and the viewer with it; the strip hugs the left when the
  deck is short.

Worth knowing, from Phase 6, because each cost an hour there:
- Neither tablet opens the viewer from the tile, though both close into it. On the iPad the first
  flight frame is about 430 points left of and 400 up from the tile; on Android nothing is drawn in
  flight. The expo-image tiles are the likeliest place it changes, so walk the open on a phone and
  on a tablet after them and say what each shows. If it is still wrong, it stays the session
  Arjun was offered for it, not this phase's.
- pnpm phone sim cannot walk a scratch server: it refuses a chipsd bound to loopback, and dev
  mode's pairing route is only there on loopback. Its one server mend reinstalls the
  chat.chips.serve launch agent, which is the live server, and it fires whenever nothing listens
  on the port it was given. Build by hand, with the commands in Phase 6's session note: expo
  prebuild, pod install, xcodebuild, simctl install, then a chips://pair link from
  `CHIPS_PORT=4534 CHIPS_DATA_DIR=$PWD/.chips/phone-dev pnpm chips pair --issue`.
- Start the Android emulator in a session of its own (Python's start_new_session, for one). Started
  from a shell that then ends, it shuts down with it. Rotate it with adb emu rotate; rotate the
  simulator with Simulator's Device menu, raising its window by name first. adb captures go to
  /data/local/tmp, never /sdcard; simctl video is variable-rate, so read its frames through ffmpeg.
- A value a gesture moves is read on the UI thread, never from JavaScript: JavaScript's copy of a
  shared value is whatever JavaScript last wrote. Phase 6's turn was wrong on a device for exactly
  that, and no test could see it.
- On the web target, state a spec reads goes in the aria- spelling (aria-selected, not
  accessibilityState), which React Native Web keeps.
- Two tests fail on timing when the machine is loaded: e2e/voice.spec.ts in the phone e2e
  (1,743 ms against 2,000) and replay.test.ts's ceiling in pnpm run check. Both passed on a
  quiet machine and are offered as sessions of their own. Run the proofs with nothing else of
  yours running, and if either fails, say so with its numbers rather than call the run green.
- If the page changes: the kitchen sink's visual suite keeps a COMPONENTS list that must match
  the gallery's sections, and pnpm visual:update needs colima, which wanted a restart last time.
  Say when you need it, and show me the new snapshots in both themes before they are committed.

Done means every sentence under Phase 7's "Done when" is true. Proof:
- pnpm run check, and pnpm --filter @chipschat/mobile test.
- pnpm mobile:e2e, the whole of it, on 5198 alone, never beside the web e2e or pnpm check. If the
  page changed, pnpm e2e as well, on its own.
- A last recording of the room and the viewer together from a fresh iPhone simulator, and the
  same room on chips-pixel-9, against the scratch server on 4534 over .chips/phone-dev, beside
  figure 1: the grid's shapes, a photo alone, a mixed album opening on its clip if decision 7 is
  yes, and a staged photo opening.

The live server: do not touch the chipsd on 4431 or the main checkout. If the page changes, the
live page is rebuilt only at my word; if it does not, this phase has no live step, and say so.

Ground rules: other projects untouched; nothing on the live chipsd on 4431 without my word, lsof
first, never pkill by pattern; another worktree may hold a port, so look before starting a server
and pick your own rather than stop anything; every install said out loud first; Node 22 is the
target (Homebrew's node@22 on this Mac is broken, and development runs on 26, as STATUS says).
Watch the disk: 26 GB free after Phase 6's builds. Small Conventional Commits with DCO sign-off
and the co-author line; no push until I say.

At the end: STATUS first. The M4.4 line, and a dated session note that closes the proposal: what
shipped across the eight phases, every departure with its reason, the commands and their output,
and what is left. Then the departures under Phase 7 in the proposal; commit; a short report with
what a real phone and a real iPad still have to answer, and what I should walk first. STATUS
before any compaction.
```

## Picking Phase 7 up again, after a compaction in the middle of it

```
Continue Phase 7 of the media viewer, the sweep, after the compaction.

You are in a Chips worktree on its own branch. main carried Phases 0 to 6 and the Phase 7 prompt
when this phase began (d905d0d, 16 September 2026); the branch was deleted from GitHub then, so
nothing of this phase is pushed unless I said so since.

Read first, in this order:
- docs/STATUS.md's session note for Phase 7. It says what is done, what is half done and where,
  what is blocked, and what I answered to decision 7 (mixed albums), including whether the
  desktop's grid follows. If the answer is not written there, it was not asked or not kept: ask
  again rather than guess from the code.
- docs/proposals/media-viewer.md §5 Phase 7, its "Done when", and whatever departures are already
  written under it.
- The Phase 7 prompt in docs/proposals/media-viewer-prompts.md, for the full list of work, the
  proof, and "Worth knowing, from Phase 6". Do not act on its "Already true" list without
  checking it against the branch: this phase has been changing exactly those files.

Then look before touching anything:
- git status, git log --oneline main..HEAD, and git diff. Work that is not committed is this
  phase's, half done: finish it or commit it as a WIP. Never a bare git stash; the stash stack
  is shared with every worktree.
- git fetch, then git log --oneline HEAD..origin/main. Other sessions may have landed on main
  since this phase began, among them the two offered in Phase 6: the open flight that misses the
  tile on the tablets, and the voice-note e2e that fails on timing. If main moved, read what
  changed in apps/mobile/src/spaces/Attachments.tsx, Composer.tsx and apps/mobile/src/media/
  before rebasing onto it, and prove again after.
- What is still running from before the compaction. lsof for 4431 (the live chipsd: look, never
  touch), 4534 (the scratch chipsd over .chips/phone-dev), 5198, 4432 and 4433 (the phone e2e),
  and 5197, 8083 and 4434. Check ps for each listener's command line before believing it is this
  worktree's. Run xcrun simctl list devices booted and adb devices. Stop only what is this
  phase's, by PID, never by pattern. The booted iPhone 17 Pro is paired with the live workspace:
  never walk it, never shut it down.
- df -h for the disk. It was 26 GB free when this phase began, and the native builds live in this
  worktree.

Then run the phase's proof commands to see what is already green, and pick up from the half-done
item. Do not redo what is green. Do not widen the phase: the open flight on the tablets is its own
session unless the expo-image tiles turned out to be its fix, and the timing failures are their
own. If either fails in a proof, say so with its numbers.

The same things hold as at the start:
- A value a gesture moves is read on the UI thread.
- State a web spec reads uses the aria- spelling.
- pnpm phone sim cannot walk the scratch server, and its server mend is the live launch agent's:
  build by hand, as Phase 6's note says.
- Start the Android emulator in a session of its own.
- If the page changed: the kitchen sink's COMPONENTS list must match the gallery, pnpm visual
  needs colima (say when), and I see new snapshots in both themes before they are committed. The
  live page is rebuilt only at my word.

Ground rules: other projects untouched; nothing on the live chipsd on 4431 without my word, lsof
first, never pkill by pattern; another worktree may hold a port, so pick your own rather than stop
anything; the phone e2e on 5198 alone, never beside the web e2e or pnpm check; every install said
out loud first; Reanimated only in apps/mobile/src/media/Stage.tsx; Node 22 the target, 26 what
runs here. Small Conventional Commits with DCO sign-off and the co-author line; no push until I
say. STATUS before any compaction, again.

Report when every sentence under Phase 7's "Done when" is true, with the closing STATUS note
written, or the moment you are blocked on something that needs me.
```

## Picking a phase up again, after a compaction in the middle of it

```
Continue Phase N of the media viewer after the compaction.

You are in the Chips worktree .claude/worktrees/chips-media-viewer-overhaul-a9cf34 on its branch.
Read first: docs/STATUS.md's session note for this phase — it says what is done, what is half
done and where, and what is blocked — then docs/proposals/media-viewer.md §5 Phase N. Check git
status and git log for what is committed and what is not; run the phase's proof commands to see
what is already green. Pick up from the half-done item; do not redo what is green; do not widen
the phase.

The same ground rules: other projects untouched; nothing on the live chipsd on 4431 without my
word, lsof first, never pkill by pattern; the phone e2e on 5198 alone; every install said out
loud first; Reanimated only in apps/mobile/src/media/Stage.tsx; Node 22; small Conventional
Commits with DCO sign-off and the co-author line; no push until I say; STATUS before any
compaction.

Report when every sentence under the phase's "Done when" is true, or the moment you are blocked
on something that needs me.
```
