# The media viewer, on every surface — a proposal for `apps/mobile`, `apps/web` and the server

*Proposal, 13 September 2026, for Arjun's review. The plan is edited only at a gate, so this
stands beside it as [`phone-polish.md`](phone-polish.md) does, and STATUS records the work under
Scope changes once it starts. The mocks are [`media-viewer-mocks.html`](media-viewer-mocks.html);
the figure numbers below point into it. Work begins after the compaction that follows this draft: §5 is the phase plan, §6 the order and the ritual, and [`media-viewer-prompts.md`](media-viewer-prompts.md) holds the prompt that starts each phase.*

Arjun's words, 13 September 2026: an overhaul of the media viewer — highly polished, performant
and feature rich; swipeable media and albums, videos, gestures, a gesture to dismiss, and more.
Opening it in a thread should have a zoom-open animation, and swiping back and forward should go
to the previous and the next media of the thread. For mobile, web, and the iPad layout when that
becomes available. And, later the same day: it needs to work on Android as well.

## 1. What the viewer does today, and why

Read from the code on 13 September 2026 (`fa18652`).

**On the phone** (`apps/mobile/src/spaces/Attachments.tsx`):

1. **One photo at a time, from a fade.** `Viewer` is a `Modal` with `animationType="fade"` over a
   black view: a bar with Close, the filename and Share, and a `ScrollView` with
   `maximumZoomScale={4}` for the pinch. It knows one attachment. There is no way from it to the
   photo beside it in the grid, let alone to the next message's — the grid's `open` state is the
   grid's own (`Grid`), so nothing above a message can move the viewer.
2. **It fetches the original and draws nothing until it has it.** `files.file(attachment)` brings
   the whole file into JavaScript memory, writes it under the cache, and hands React Native's
   `Image` the URI. A 3 MB PNG from a phone camera is twelve megapixels, and `Image` decodes it at
   full size — some 48 MB of pixels — to fit it to a 393-point screen. The thumbnail the grid
   already has on disk is not shown while that happens, so the viewer is black until the bytes
   come.
3. **No gesture but the pinch.** No swipe between items, no drag to dismiss, no double tap, no tap
   to hide the bar. Close is a button. The bar sits at `paddingTop: 54`, a guess at the inset that
   a Dynamic Island phone reports as 59.
4. **A video is a second modal that downloads first.** `Player` fetches `files.play(attachment)` —
   the whole playable copy, or the whole original until there is one — and then hands `expo-video`
   a local file with the platform's controls. The screen says *Fetching…* with no progress for as
   long as that takes; a 100 MB clip on Wi-Fi is half a minute of one word.
5. **Nothing moves from the tile.** The modal fades in over the room; the tile that was tapped has
   nothing to do with where the photo appears, and nothing to do with where it goes when Close is
   pressed.

**On the web** (`apps/web/src/app/Attachments.tsx`):

6. **There is no viewer.** A photo's click is `window.open(objectURL, "_blank", "noopener")`: the
   browser opens the blob in a new tab, at its own zoom, in its own chrome. **In the desktop shell
   this very likely does nothing.** The page runs in a WKWebView, `window.open` needs the shell to
   provide a window, and the capability file grants nothing of the kind
   (`apps/desktop/src-tauri/capabilities/default.json`). To be verified at the start of Phase 5; the
   fix is the same either way.
7. **A video plays in place, from a blob.** `VideoCard` swaps the poster for
   `<video controls autoPlay>` on an object URL, the whole file fetched into memory first
   (`fetchAttachment` → `Blob`). Fine at 40 MB; not at the 500 MB the blueprint's cloud profile
   allows a video.
8. **No keys, no zoom, no next.** A room with twelve photos is twelve tabs.

**On an iPad** — the phone's viewer, unchanged: no thumbnail is involved, so a photo the width
of a 1,194-point window is black until the original arrives, and Close is a small button in the
far corner of a large screen. The split (`ui/Split.tsx`, `spaces/RoomPane.tsx`) has no say in it,
which is right: the viewer should cover the window.

**On Android** — declared and, when this was written, never built. (Android was set up beside
this proposal on 13 and 14 September 2026: the toolchain on this Mac, the emulator
`chips-pixel-9`, `pnpm phone:android`, and a first walk of the app; §5 reads it in. The viewer's
faults below are unchanged by it.) `app.json` names the package (`chat.chips.app`), turns
edge-to-edge on and asks for the camera and the microphone, so the app is an Android app on
paper; but no Android build has been made, `pnpm phone` is Xcode and `devicectl` end to end,
Jest renders on `jest-expo`'s iOS preset alone, and `ui/haptics.ts` says in its own words that
the Android branch waits for the day Android is a target this app really ships to. The viewer
as it stands would run there — a `Modal`, a `ScrollView`, `expo-video` — with the same faults as
on the iPhone and three of its own: a status bar drawn dark over a black stage, the system's own
share sheet offering no *Save Image*, and a back gesture that closes the modal with no return.

**On the server** (`server/src/interfaces/http/routes/uploads.ts`):

9. **Three variants, and no size between the thumbnail and the original.** `thumb` is a 512-pixel
   WebP (`thumbnailEdge`), `play` is a video's copy that plays everywhere (ADR 0053), and
   everything else is the file as sent. A viewer wants a size in between: enough for a phone's
   screen at three times and a laptop's, small enough to arrive in a moment.
10. **A GET is signed in headers, and a byte range is not served.** `signRequest` signs the
    method, the target, a timestamp and a body digest into headers, which an `<img src>`, a
    `<video src>` or `AVPlayer` cannot send, and `serve()` answers the whole body with no
    `Accept-Ranges`. So neither client can stream a video or let the platform's own image loader
    fetch a photo progressively; both fetch bytes and make a local file or a blob. The grant that
    exists (`?sig&tok&exp`, `admitReader`) is a harness's, bound to its bearer token.

**In the model.** A message's files are `Line.attachments`; a lane's are `Lane.attachments`,
drawn under the route row (`spaces/LaneChain.tsx`); a thread is a space with a `parentSpaceId`
(ADR 0035), so *the thread* Arjun swipes through is a space, and the room is one too.
`visibleLines(space, lanes)` in `spaces/spaces.ts` already says which lines a room draws.

**What the tooling allows.** Reanimated cannot be imported under Jest, so the app keeps its one
Reanimated import in `needs/Crossing.tsx` and mocks it (`jest.setup.js`); the viewer's gestures
need the same discipline, in one file. Gestures are proven on a device or a simulator
(`pnpm phone sim`) and by Maestro flows that are written and not run. A native dependency is not
in the build until `pnpm phone pods` and a rebuild, both on Arjun's word. The web target of the
mobile app is what Playwright drives, so whatever the viewer does on the phone must at least
work well enough there for a spec to open it, page it with a button and close it.

## 2. The rules the viewer follows (the ADR 0056 candidate)

1. **One viewer, on every surface.** The iPhone, the Android phone, the iPad, an Android tablet
   and the web share the words, the deck, the arithmetic and the rules below. What differs is
   the hand — a finger, or a pointer and keys — how much room there is, and what the platform
   owns: its back gesture, its share sheet, its bars. The stage is black whatever the theme: a
   photo is looked at against nothing.
2. **The deck is the media of the twenty messages around the one that was tapped, in the order
   it was said** (Arjun, 13 September 2026: not the whole room — the last twenty messages). At
   the foot of the room that is the room's last twenty; further up, the window holds the tapped
   message with what was said either side of it, so a swipe reaches both ways and a photo tapped
   an hour up the history still opens with its neighbours. The messages are the lines the room
   draws, whatever their kind, in the space being read — the room, or a thread; each is a space —
   and the media is every photo and video they carry, from `visibleLines` and from the files a
   route row carries, oldest first. A message's several photos stand together in it. The window
   is fixed when the viewer opens, so nothing moves under a finger: a message taken back leaves
   it, and a line that lands after is seen at the next opening. Opening lands on what was
   tapped; back is older, forward is newer; the ends resist and nothing wraps. Voice notes and
   files are not in the deck: they are read and opened in the room as they are today.
3. **It opens from where it was tapped, and goes back there.** The tile grows into its place on
   the stage from the frame it had in the room, drawn with the thumbnail it already shows, while
   the stage darkens under it; the chrome arrives last. Closing runs it backwards, to the tile of
   the item that is *now* current — the room scrolls under the opaque stage to have it on
   screen — or, when that tile cannot be found, shrinks and fades where it is. Reduce Motion
   takes the travel out and leaves a crossfade.
4. **The first movement decides the gesture.** At the fitted size, a horizontal pan pages, a
   vertical pan dismisses, a pinch zooms, a double tap zooms to two and a half times at the point
   and back again, and a tap hides and shows the chrome. Zoomed, a pan moves the picture within
   its bounds, a double tap fits it again, and a pinch let go under three quarters closes the
   viewer. The numbers are in §4.6.
5. **Dragging to dismiss shows the room.** The picture follows the finger and shrinks a little,
   and the stage clears with the distance so the room is visible behind. Past the line, or
   flicked, it goes back to its tile; short of it, it springs back. The line is felt as a
   selection click, as a decision swipe's is (`Crossing.tsx`).
6. **Bytes come in three sizes, and the viewer climbs.** The thumbnail is on the device already
   and is what the open animation draws; the *view* copy — no longer than 2,048 pixels on its
   longer side — replaces it as soon as it arrives; the original is fetched on request (*Open
   original*), or when there is no view copy to be had. Neighbours are fetched ahead of the
   swipe; the rest, never.
7. **A video plays in the viewer, not in another modal.** It streams from the server where the
   phone is on the server's own network and downloads with a visible progress where it is not.
   It plays when landed on and pauses when swiped away. The controls are the viewer's own, and
   Picture in Picture is a button. What plays is the copy that plays everywhere once it exists
   (ADR 0053), and the viewer says when that copy is still being made.
8. **What can be done with a picture is one press away.** Share (the platform's sheet), Save (to
   Photos, or to the gallery — Android's sheet has no *Save Image*, so the row exists on both),
   Copy, Go to the message (the viewer closes and the room lands on the line, with the flash it
   already has), Details (name, size, dimensions, length, who, when), and Open original. On the
   desktop: Download, Copy image, Open message, Details, Fullscreen, and a key for each.
9. **A screen reader gets the same viewer.** The stage is modal; each item is announced with its
   place, its name, who sent it and when; every action is a button; paging is the reader's swipe
   or the arrow keys; the room behind is hidden from it.
10. **An iPad is the same viewer at the window's size — and so is an Android tablet.** The viewer
    covers the window, never the pane. Where the window is wide (`useLayout`, which reads the
    window and never the device), a filmstrip of the deck sits under the picture and arrows appear
    for a pointer; a narrow window — a split, Stage Manager, a ChromeOS window shrunk — is a phone.
11. **The platform's back closes it, with the return.** The iPhone's edge swipe, Android's back
    gesture or button, the Android navigation bar's back, the Escape key: every one is
    `onRequestClose`, and every one plays the return animation to the tile rather than cutting to
    the room.

## 3. How it looks

The mocks page draws each of these; the notes under each figure are the specification of that
state.

| Figure | What it shows |
|---|---|
| 1 | The room on a phone: an album of six (four shown, `+2`), a receipt alone, a clip as its poster. The tiles are where the viewer opens from. |
| 2 | The zoom-open, in three frames: the tile's measured frame; the picture mid-flight with the stage half dark and no chrome; at rest at 350 ms. |
| 3 | The viewer at rest: Close, the counter, Share and the menu in the top bar; who, when and what in the caption; the picture fitted to the stage. |
| 3b | The same viewer on an Android phone: the status bar's icons light over the stage, Material's share and overflow marks, the gesture pill the stage paints under, and where the system's back swipe begins. |
| 4 | Mid-swipe between two items, with the 20-point gutter between pages and the counter following. |
| 5 | Zoomed to two and a half times on a receipt — the case a zoom exists for — with the chrome gone. |
| 6 | Dragging to dismiss: the finger 180 points down, the picture at 92.5 %, the stage cleared to 58 %, the room visible behind, the 120-point line drawn. |
| 7 | A video: its poster in the deck, then playing with the viewer's own controls, a scrubber, the time, mute and Picture in Picture. |
| 8 | The menu: the app's own sheet with Share, Copy, Go to message, Details and Open original. |
| 9 | Fetching and failure: the thumbnail standing in with a progress ring for a video; a photo that would not come, with Try again. |
| 10 | The iPad: the split behind, the viewer over the whole window, a filmstrip with the current item ringed in gold, arrows for a pointer. |
| 11 | The desktop lightbox over the web shell: the counter, a toolbar, arrows on hover, the filmstrip, and the keys. |
| 12 | A video on the desktop, with the same controls and a Picture in Picture button. |
| 13 | Zoom on the desktop: at the pointer, with a percentage that fades. |
| A–E | The deck, the gesture machine, the open timeline, the two byte paths, and the pieces per surface. |

## 4. How it works

### 4.1 The deck and the arithmetic, in core

`packages/core/src/viewer.ts`, pure, tested under Vitest with `fast-check`, exported from
`index.ts` beside the other projections. It is what the model offers a viewer, and the arithmetic
every viewer shares, so the phone and the web cannot disagree on either.

```ts
export interface DeckItem {
  readonly attachment: Attachment;
  readonly lineId: string;            // the message, or the route line, it hangs under
  readonly saidBy: string;            // who, resolved the way the room resolves it
  readonly ts: string;
  readonly kind: "photo" | "video";
  readonly inMessage: { readonly index: number; readonly of: number }; // 1 of 4, in an album
}
/** The tapped line, and how many of the room's lines around it make the deck: twenty. */
export interface DeckWindow { readonly around: string; readonly messages: number }
export const DECK_WINDOW = 20;
export function deckOf(space: Space, lanes: readonly Lane[], window: DeckWindow): readonly DeckItem[];
export function indexOfItem(deck: readonly DeckItem[], attachmentId: string): number;

export interface Size { readonly width: number; readonly height: number }
export interface Rect extends Size { readonly x: number; readonly y: number }
export function fitRect(content: Size, stage: Size): Rect;        // contain, centred
export function coverRect(content: Size, frame: Rect): Rect;      // what a tile crops
export function zoomLimits(content: Size, stage: Size, pixelRatio: number): { min: 1; max: number };
export function clampPan(scale: number, fitted: Rect, stage: Size, translate: Point): Point;
export function rubberBand(overshoot: number, extent: number): number; // Apple's 0.55
export function snapPage(offset: number, velocity: number, width: number, count: number, from: number): number;
export function dismissProgress(dy: number): { backdrop: number; scale: number };
export function dismissDecision(dy: number, vy: number): "close" | "stay";
```

- **Order.** `deckOf` takes `visibleLines(space, lanes)` in time order, cuts the window of
  `DECK_WINDOW` lines around the line `around` names — ten either side, moved as a block at the
  room's ends so it is always twenty when the room has twenty, and the room's last twenty when
  the tapped line is among them — and takes each line's `attachments`, plus a `route` line's `lane.attachments` where the row draws them, keeping the
  ones `hasThumbnail` calls a photo or `kindOf` calls a video, in the order the message listed
  them. Duplicates by attachment id are kept once, the first time. A deleted line contributes
  nothing. A window with two photos in it is a deck of two.
- **The current item is an id, not an index, and the window is a set of line ids** chosen when
  the viewer opens and held while it is up. A line landing meanwhile is not in it — it is seen at
  the next opening — so nothing moves under a finger; a message taken back removes its items, and
  a viewer standing on one of them steps to the nearest neighbour, or closes when there is none.
- **`zoomLimits.max`** is the larger of 3 and the scale at which one image pixel is one device
  pixel, so a 12-megapixel photo can be read at full resolution on a phone and a small one is
  not blown up past sense.
- **`snapPage`** decides by distance (past 40 % of the width) or by velocity (500 pt/s), one
  page at a time, and never past the ends. **`dismissDecision`** is 120 points or 900 pt/s.
  **`dismissProgress`** takes the backdrop from 1 to 0.3 over 300 points and the scale from 1 to
  0.75 over 600, both clamped. **`rubberBand`** is the platform's own curve, `0.55`, so an
  over-scroll at the deck's end feels like a list's.

### 4.2 The phone

`apps/mobile/src/media/`, one folder, because the viewer is one thing:

| File | What it is |
|---|---|
| `MediaViewer.tsx` | The host: a transparent `Modal` (`animationType="none"`, `statusBarTranslucent`, both orientations), a `GestureHandlerRootView` inside it — gesture handler needs its own root inside a modal — the deck, the current id, and the provider the room mounts once (`MediaProvider`, `useMediaViewer`). |
| `Stage.tsx` | **The one file that imports Reanimated and gesture handler.** The backdrop, the three-slot pager, and a `Zoomable` per slot: pinch, pan, double tap and tap composed, the dismiss drag, the open and return animations. Mocked under Jest to a view that draws the current item and exposes `onNext`, `onPrevious` and `onDismiss` as props. |
| `Chrome.tsx` | The bars: Close, the counter, Share and the menu above; the caption below; the video controls. One opacity, hidden by a tap, while zoomed, while dragging, and three seconds into a video. Insets from `useSafeAreaInsets`, not a number. |
| `VideoItem.tsx` | `expo-video`'s `VideoView` with `nativeControls={false}`, `contentFit="contain"` and `allowsPictureInPicture`; the player's time and status through `useEvent`; our scrubber is a pan on a track. Plays when the slot becomes current, pauses when it leaves. |
| `Actions.tsx` | The long press and the `⋯`: the app's own `Sheet` with `SheetRow`s — Share, Copy, Go to message, Details, Open original. |
| `useDeck.ts` | `deckOf` over the room's snapshot, memoised on the space and its lanes. |
| `tiles.ts` | The registry a tile joins on mount: `register(attachmentId, measure)` where `measure` is the tile's `measureInWindow`, so the return animation can ask where a tile is at the moment of release. |

**Opening.** A tile's press calls `measureInWindow`, then `viewer.open({ attachmentId, from })`.
The viewer mounts with the *same thumbnail URI* the tile draws, in a clip the size of the tile's
frame with the tile's corner (`RADIUS.md`), the picture covering it as the tile does. On the UI
thread the clip animates to `fitRect` and the corner to 0 while the picture inside goes from
`coverRect` to fitted — one spring, Reanimated's `withSpring` with the same numbers as
`IOS_SPRING` (stiffness 320, damping 32, mass 1), so it settles the way everything else in the
app settles. The backdrop goes 0 → 1 on the same spring; the chrome fades in from 120 ms. The
status bar hides with the chrome. Reduce Motion: a 160 ms crossfade at the fitted frame, as the
sheet does.

**The pager.** Three slots — the previous, the current and the next — laid side by side with a
20-point gutter (iOS Photos's), moved by one `translateX`. A page settles, the slots re-centre
and swap contents; only three items are ever mounted. Items beyond the ends are a rubber band on
the same value.

**One pan, three meanings.** Each slot's `Zoomable` composes `Gesture.Pinch`, one `Gesture.Pan`,
`Gesture.Tap().numberOfTaps(2)` and a single tap made exclusive to the double. The pan reads the
scale at its first movement: at 1, its axis is locked to whichever of `dx` and `dy` is larger —
horizontal drives the pager, vertical drives the dismiss; above 1, it pans the picture inside
`clampPan` with a `withDecay` on release and a rubber band at the bounds. Every value it touches
is a shared value; JavaScript hears from it only at settle — `runOnJS` to change the current id,
to fire `feel.tick()` when the dismiss line is crossed, and to ask the room to reveal a tile.

**Dragging to dismiss.** `translateY` follows the finger; `dismissProgress` sets the scale and the
backdrop; the chrome is already gone. On release, `dismissDecision`: *close* measures the current
item's tile through the registry and runs the open animation backwards to it — the clip to the
tile's frame and corner, the picture to its cover rect, the backdrop to 0 — then `onRequestClose`;
*stay* springs everything home. A tile that is not mounted (the FlatList is windowed) or is off
the screen gets the fallback: the picture shrinks to 60 % where it is and fades with the backdrop.

**The room follows the viewer.** When the current item changes, the provider tells the room the
line it hangs under; `SpaceView` scrolls to that line without animation (`scrollToIndex`, the
existing `onScrollToIndexFailed` fallback) under the opaque stage, so the tile is on screen and
measured by the time a dismiss asks for it. It is the same move iOS Photos makes under its
viewer, and it costs nothing visible.

**Pictures.** `expo-image`'s `Image`, added in Phase 1 (§6), because the viewer needs what React
Native's `Image` does not do: a `placeholder` (the thumbnail, already on disk) under the picture
with a `transition`, decoding that does not hold a 48 MB bitmap for a 393-point screen, a
memory-and-disk cache keyed by URI, and `recyclingKey` for slots that change contents. The view
copy is drawn with `allowDownscaling={false}` so a zoom to three times is sharp — 2,048 pixels
is about 16 MB decoded, and three slots is under 50 — and an original, when one is shown, with
downscaling on, so a 40-megapixel file cannot take the app down; it is soft when zoomed, and
*Open original* says so in Details. The grid's tiles move to the same component in Phase 7, so the
thumbnail the open animation borrows is the very bitmap the tile shows.

**Video.** Phase 2 plays what `files.play` gives — the whole copy downloaded to the cache, as today —
but shows the poster with a progress ring while it comes, from `fetchAttachmentWithType` gaining
an `onProgress` over the response body's reader. Phase 4 (§4.5) gives the phone a URL the player can
stream from; `VideoItem` prefers it whenever `linkFor(device)` is direct and falls back to the
download when the link is the relay. The controls are ours: play and pause, a scrubber with the
buffered range, the time, mute, Picture in Picture (`startPictureInPicture` on the view's ref),
and *System player* in the menu, which turns `nativeControls` on for AirPlay and captions, since
`expo-video` has no route picker of its own. A video with `durationMs` and no playable copy yet
plays the original and the caption says *the copy that plays everywhere is being made*.

**On Android.** The same files, with the platform's own answers where it has them:

- *The bars.* The `Modal` takes `statusBarTranslucent` and `navigationBarTranslucent`, so the
  stage paints under both bars as edge-to-edge intends, and the chrome keeps clear of them by the
  insets `react-native-safe-area-context` reports. An `expo-status-bar` `StatusBar` mounted
  inside the viewer sets the icons light for its life and hides them with the chrome, which on
  Android is immersive mode; the navigation bar's pill stays, drawn over the stage, and a drag
  begins above it.
- *Back.* The back gesture and the back button arrive as `onRequestClose`, which plays the return
  (rule 11). Predictive back stays off, as Expo leaves it, so the system does not preview the
  room behind while our own return is the animation. With gesture navigation the first 20-odd
  points at each side edge are the system's: a page swipe that starts there is a back, and the
  viewer closes. That is what Google Photos does too, and the pager does not fight it.
- *Video.* `expo-video` is ExoPlayer there, which streams and seeks from the same grant URL with
  the same ranges (Phase 4), and plays H.264 in an MP4 everywhere — the copy ADR 0053 makes. An
  iPhone's HEVC original may not decode on a given Android phone before the copy exists; the
  poster shows and the caption says so, as the browser's does. Picture in Picture on Android is
  the whole activity's, and needs `supportsPictureInPicture` on the `expo-video` plugin in
  `app.json` (a manifest flag, so a rebuild on both platforms).
- *Feel.* The dismiss line's `tick` goes through `haptics.ts`, whose Android branch is the one
  the file already names: `performAndroidHapticsAsync(AndroidHaptics.Clock_Tick)`, no permission.
- *The sheet's rows.* Share is `expo-sharing`, which hands a cache file through a content URI.
  Save is `expo-media-library`'s `saveToLibraryAsync` on both platforms (decision 5 changes for
  this: Android's sheet has no *Save Image*). Copy is `expo-clipboard`'s `setImageAsync`. The
  marks follow the platform: iOS's square-and-arrow and `⋯` here, Material's share and `⋮` there,
  two more entries in `icons.ts`.
- *Pictures.* `expo-image` is Glide there; the same `placeholder`, `recyclingKey` and downscaling
  rules hold, and 2,048 pixels is under every device's texture limit.
- *Gesture handler in a modal* is the Android case the wrapper in `MediaViewer.tsx` exists for.

**Tests.** `media/*.test.tsx` under Jest, with `Stage` mocked: the deck's order and words from a
fixture room; opening on the tapped item and the counter; the caption; each action reaching the
file service (Share → `open`, Copy → the clipboard, Go to message → the room's `at`); the video
slot asking `play` for its source, playing when current, pausing when not; the fetching and
failure words; Reduce Motion picking the crossfade path. `viewer.test.ts` in core under Vitest
with `fast-check`: `fitRect` never exceeds the stage and preserves the ratio; `clampPan` keeps
the picture over the stage at every scale; `snapPage` never leaves the deck; `deckOf` keeps
albums contiguous and time order. `e2e/viewer.spec.ts` on the web target: open a photo, the
counter reads *1 of 2*, the next arrow (drawn on the web target, where there is a pointer), the
Escape key, and a video that plays. Maestro `viewer.yaml`: the swipe, the pinch and the drag
down, written for the device.

### 4.3 The web

`apps/web/src/app/viewer/`:

| File | What it is |
|---|---|
| `Lightbox.tsx` | A `<dialog>` portalled into `document.body` and opened with `showModal()` — the top layer, the focus trap and Escape come from the platform. Focus goes to Close on open and back to the tile on close. |
| `Stage.tsx` | The picture or the video, fitted with `fitRect`; wheel and pointer events for zoom, pan and paging; the touch path (below). |
| `Filmstrip.tsx` | 56-pixel thumbnails of the deck under the picture, the current one ringed in gold — the brand's selection colour, as `Flash` uses it — scrolled to stay centred, hidden under 900 pixels of width and while zoomed. |
| `VideoStage.tsx` | `<video playsinline>` with our controls; `requestPictureInPicture`; the existing failure sentence when the browser cannot play it. |
| `open.ts` | The zoom-open and its return as a FLIP with the Web Animations API: the tile's `getBoundingClientRect`, a clone at that rect, `element.animate` to the fitted rect on the design system's `--ease` over 350 ms, the backdrop and chrome behind it. `document.startViewTransition` would be shorter, but the desktop shell's WKWebView on macOS 13 has no view transitions; WAAPI is everywhere. `prefers-reduced-motion` → crossfade. |
| `useViewer.ts` | The context a room or a thread mounts (`ViewerHost`), the deck from core, the current id, `open(attachmentId, tile)`. |

**Keys.** `Esc` closes; `←` `→` page; `Home` `End` go to the ends; `Space` plays and pauses;
`+` `−` `0` zoom; `F` fullscreen (the Fullscreen API); `I` details; `D` download; `?` the list of
keys. **Pointer.** A click on the backdrop closes; arrows appear on hover at the sides; a drag
pans when zoomed; `⌘`/`Ctrl` with the wheel, and a trackpad pinch (which arrives as the same
event), zooms at the pointer; a double click zooms to two times at the point and back. **Touch**
(an iPad in Safari, Chrome on an Android phone, the tablet window Playwright drives) gets the
phone's rules through pointer events: one pointer's first movement pages or dismisses, two
pointers pinch, one pointer pans when zoomed — the same `clampPan`, `snapPage` and
`dismissDecision` from core. The dialog is `100dvh` with `touch-action: none` on the stage and
`overscroll-behavior: none`, so a mobile browser's own pull-to-refresh and edge swipes do not
take the gesture, and its URL bar does not move the picture.

**Pictures.** An `<img decoding="async">` sized to `fitRect`, the thumbnail's object URL
underneath until `load`; the view copy through `files.view(id)`; the neighbours prefetched with
`new Image()`. Zoom is a CSS transform, and the browser samples the full bitmap, so a zoomed
photo is sharp without a second decode. `Attachments.tsx` loses `window.open`: a photo's click
calls `viewer.open` with the tile's element, and a video's poster opens the viewer on the video
rather than playing in the row — the row keeps its Download.

**Where it mounts.** `SpaceView` and `Thread` each mount a `ViewerHost` with their own space, so
a thread's viewer swipes through the thread and a room's through the room, as the rule says.
The desktop shell needs nothing for this package; Phase 4's grant URLs need its CSP to admit the
server's origin (§4.5).

**Tests.** Vitest under jsdom for the deck, the keys, the focus trap's return, and each action;
Playwright `viewer.spec.ts` against a real `chipsd`: a photo opens a dialog with *1 of 2*, `→`
moves, `Esc` closes and focus is back on the tile, a video plays, axe reads the open dialog. The
kitchen sink gains a *Media viewer* section — at rest, zoomed, a video, the filmstrip, both
themes — and the visual suite photographs it.

### 4.4 The iPad, and an Android tablet

The same `MediaViewer`, covering the window from its `Modal`. `useLayout().wide` turns on the
filmstrip (the phone's `Chrome` draws it under the caption when there is room) and 44-point
arrows at the sides that appear on a pointer's hover (`Pressable`'s `onHoverIn`, which a mouse
on Android raises too) and stay for a finger's tap. Rotation re-runs `fitRect` and keeps the
zoom's centre. A hardware keyboard is not reachable from React Native without a native module,
so the arrows are the tablet's paging by pointer for now, and the swipe is the rest. Because
`useLayout` reads the window, an Android tablet, a foldable open, and a ChromeOS window get this
layout with nothing written for them; a foldable closed is a phone. The wide layout is walked on
the web target today (`e2e/tablet.spec.ts` gains a viewer test) and on a simulator with
`pnpm phone sim` on an iPad device, or an Android tablet emulator once there is an Android build
(Phase 3); a paired build on a real iPad is the walk that waits, which is what *when that becomes
available* means here.

### 4.5 The server

Three additions, one migration, one ADR (0058, *a viewer's copy, a byte range, and a grant a
device may hand to a player*). Nothing here knows which phone is asking: the same variants, the
same ranges and the same grant serve an iPhone, an Android phone and a browser.

1. **`?variant=view`.** A copy of a photo no longer than 2,048 pixels on its longer side, WebP,
   made by the same `images.thumbnail(bytes, edge)` the 512-pixel one is, at upload for every
   raster photo and for a video's poster, and recorded in `view_sha256` / `view_mime_type`
   (migration 0022). For a photo stored before the migration, the first `GET ?variant=view`
   makes it from the original, records it, and serves it — a couple of hundred milliseconds,
   once, and no worker. A photo `sharp` cannot read (a HEIC on this Mac) has no view copy, as it
   has no thumbnail; the phone gets the original, which `expo-image` decodes natively, and the
   web says it cannot draw it and offers Download, as it does today.
2. **Byte ranges.** `GET /v1/attachments/:id` honours `Range: bytes=…` with `206`,
   `Content-Range` and `Accept-Ranges: bytes`, and `416` when the range is not satisfiable. The
   `BlobStore` port gains `size(sha256)` and `read(sha256, { start, end })` as a stream, and the
   disk adapter answers from `fs.createReadStream` with a start and an end, so a 500 MB video is
   never read whole to serve a megabyte of it. Without this a player cannot seek, and AVPlayer
   will not start on a plain progressive body.
3. **A grant a device may hand to a player.** `POST /v1/attachments/:id/grant` with
   `{ variant }`, signed like any device request, answers `{ url, expires_at }` where the URL is
   `/v1/attachments/:id?variant=…&dev=<deviceId>&exp=<unix>&sig=<hmac>`, the HMAC over the
   attachment, the variant, the device and the expiry with the `grants.secret` the harness grant
   already uses. A GET carrying `dev`, `exp` and `sig` is admitted as that device — the server
   loads the device, so `admitReader`'s membership check and the audit run as that person — with
   no other credential, which is what an `<img src>`, a `<video src>` and `AVPlayer` can present.
   Ten minutes for a photo; a video's length plus ten minutes, at most an hour, because a player
   asks for ranges for as long as it plays. The logger drops `sig` from any line it writes. It is
   a bearer for one file and one window, the same trade the harness grant and decision 10's
   signed URLs make, and the ADR says so plainly. It only helps where the client reaches the
   server directly: through the relay, requests cross the tunnel as messages (ADR 0039), which a
   native player cannot do, so `FileService.streamUrl` returns nothing when `linkFor(device)` is
   the relay and the viewer downloads as it does in Phase 2. The desktop shell's CSP, `img-src 'self'
   data: blob:` and `media-src 'self' blob:` today, must admit `http:` and `https:` for these URLs
   (`apps/desktop/src-tauri/tauri.conf.json`).

An alternative for the phone alone, recorded rather than recommended: `expo-video`'s source
takes `headers`, so the signed headers of today could be handed to the player. The signature's
timestamp is checked for freshness, and a player re-requests ranges for the whole of a playback,
so a long video would outlive it; and it does nothing for `<img>` or `<video>` on the web. The
grant is one instrument for both.

### 4.6 Motion and thresholds

| What | Value | Why |
|---|---|---|
| The spring | stiffness 320, damping 32, mass 1 | `IOS_SPRING`, the app's one spring (ADR 0050) |
| Open and return | the spring, about 350 ms to settle; chrome from 120 ms | UIKit's 0.35 s response; the chrome after the picture, so the eye follows one thing |
| Reduce Motion | 160 ms crossfade, no travel | `STILL_MS`, as the sheet and `Arrive` |
| Page | past 40 % of the width, or 500 pt/s | one page per swipe, a flick counts |
| Gutter between pages | 20 pt | iOS Photos's |
| Dismiss | 120 pt, or 900 pt/s; `tick` at the line | felt before it is seen |
| Dismiss progress | backdrop 1 → 0.3 over 300 pt; scale 1 → 0.75 over 600 pt | the room shows through before the decision |
| Zoom | min 1; max the larger of 3 and one image pixel per device pixel | a receipt is readable at full resolution |
| Double tap | 2.5× at the point, then back to fit | Photos's |
| Pinch under | 0.75 let go → close | Photos's |
| Rubber band | 0.55 | the platform's lists |
| Chrome auto-hide | 3 s into a playing video | the film, not the buttons |
| Filmstrip | 56 px thumbs, at ≥ 768 pt (phone app) / ≥ 900 px (web) | room for it |
| Web open | 350 ms on `--ease` | the design system's curve |
| Android's edges | the first ~20 pt at each side are the system's back | a swipe from there closes, with the return; the pager does not fight it |

### 4.7 Performance, and how it is measured

Budgets, to be measured on the phone with Instruments and on the desktop with the Performance
panel once Phases 1 and 5 exist; nothing here has been measured yet.

- **Tap to first frame: the next frame.** The thumbnail is already decoded in the tile; the
  viewer draws it, not a fetch.
- **The open, the swipe and the drag at the display's rate** (60 or 120 Hz): every moving value
  is a shared value on the UI thread; the JavaScript thread is idle during a gesture and hears
  from it at settle.
- **A view copy on screen within 400 ms on Wi-Fi**, and a neighbour already there when the swipe
  lands, because it was fetched when the current one settled.
- **Memory: three items decoded, none above 2,048 pixels unless asked**, so under 50 MB for
  pictures however large the originals.
- **A video's first frame within a second on the server's network** (Phase 4, streaming with
  ranges); through the relay, the poster and a true progress until it plays.
- **The room's list is not re-rendered by the viewer**: the current id lives in the provider, and
  the room subscribes to the one line it must reveal.

### 4.8 Accessibility

`accessibilityViewIsModal` on the stage and `onAccessibilityEscape` to close, as the sheet, for
VoiceOver; for TalkBack the `Modal` is a window of its own, which hides the room without being
asked, and the back gesture is the escape; each item labelled *Photo 8 of 8, receipt.jpg, from
Arjun, today at 11:26* and announced on a page change with `announceForAccessibility`, which both
readers hear; every action a 44-point button with a label; the counter
and caption capped at `BUBBLE.maxScale` like a bubble's words, since they sit in a bar with a
width to keep; Reduce Motion honoured on every travel. On the web: the `<dialog>` is modal, the
focus trap and its return are the platform's, arrows and Close are buttons with names, the
picture's `alt` is its filename, `prefers-reduced-motion` turns the FLIP into a crossfade, and
axe reads the open dialog in the visual suite.

## 5. Phases

Eight phases, each small enough for one session and one compaction, each ending in a state a
fresh session can pick up from STATUS alone. A phase has an entry, the work (which points at §4
rather than repeating it), what *done* means as sentences that can be checked, the proof, what
needs Arjun's word before it starts, and a size in working days. Every phase ends with STATUS
updated — the M4.4 line, and a session note saying what shipped, what departed from this
document and why, and the commands with their output — and, where the phase moves something on a
screen, a recording beside the figure it answers to. None touches `apps/mobile` while a simulator
walk or the phone e2e is running. Departures from what is written here are recorded under the
phase, as `phone-polish.md` did.

### Phase 0 · The deck and the arithmetic (0.5)

- **Entry:** nothing. Pure code, no app touched, no install.
- **Work:** §4.1. `packages/core/src/viewer.ts` and `viewer.test.ts`; the exports added to
  `index.ts` beside the other projections.
- **Done when:** the eleven names of §4.1 exist and are exported; `viewer.test.ts` holds
  property tests with `fast-check` for: `fitRect` never exceeds the stage and keeps the ratio;
  `coverRect` covers its frame; `clampPan` keeps the picture over the stage at every scale from 1
  to the limit; `snapPage` never leaves the deck and moves at most one page; `dismissDecision`
  closes past 120 points or 900 pt/s and not before; `deckOf` cuts the window of twenty lines around the given one, clamped to the room's ends so it
  is the room's last twenty for a line among them, keeps time order, keeps a message's
  photos contiguous with `inMessage` counting them, keeps each attachment once, includes a route
  row's files where the row stands, and leaves out voice notes, files, SVGs and deleted lines.
- **Proof:** `pnpm vitest run packages/core/src/viewer.test.ts`, then `pnpm run check`.
- **Needs his word:** nothing.
- **Departures, as built (14 September 2026).** What `viewer.ts` does that §4.1 did not say, and why:
  - **`deckOf` takes a fourth argument, the `Directory`.** `saidBy` is "resolved the way the
    room resolves it", and the room resolves a relayed line through the directory (the harness
    that relayed it, to its owner). Three arguments could not.
  - **`visibleLines` is not in core.** It is in the phone's `spaces/spaces.ts`, with a private
    copy in the web's `SpaceView.tsx`. This phase touches no app, so `viewer.ts` carries the same
    rule as a private `drawnLines`: a third copy. Moving the one rule into core, with both rooms
    reading it, belongs to the phase that next touches each room (1 for the phone, 5 for the web).
  - **`Point` is exported as well.** `clampPan`'s signature names it, and core had none. The
    "eleven names" above were counted before `DeckWindow`, `DECK_WINDOW`, `Size` and `Rect`
    joined the list. There are fifteen, and sixteen with `Point`.
  - **A flick thrown back cancels.** `snapPage` stays on the page when a flick of 500 pt/s goes
    against the way the drag had carried the page. `dismissDecision` stays when a flick of
    900 pt/s goes back toward home, however far the drag had gone. §4.1 said distance *or*
    velocity, and nothing about direction. A thumb that throws the picture back has changed its
    mind.
  - **The lines are inclusive.** 120 points closes, and so does exactly 40 % of the width. It is
    the same `>=` that `Crossing` fires its click on, so the click and the decision agree to the
    point.
  - **`inMessage.index` counts from one**, as §4.1's comment and diagram A say (`1 of 6`).
    `indexOfItem` counts from zero, as an index does.
  - **Where the media comes from.** A route row with its lane known gives the lane's files, not
    the line's own, said by the lane's specialist. That is what both rooms draw. A task card's
    media is said by the person the lane is on behalf of, as the phone's task card draws it.
  - **A tap on a line the room does not draw**, or one it cannot find, opens the room's last
    twenty.
  - **Holding the window needs no new name.** A viewer that is up asks for `messages` of at
    least the room's length, and keeps the items whose lines it opened with (the test *holds still
    while it is up*). `useDeck` does that in Phase 1.
  - **Added: the arithmetic is marked `"worklet"`.** `Stage.tsx` calls `clampPan`, `rubberBand`,
    `dismissProgress` and the rest from gesture callbacks on the UI thread. A function is
    callable there only when it is a worklet itself. Elsewhere the directive is an unknown one,
    and JavaScript ignores it. It is unproven until Phase 1 runs it.

### Phase 1 · The phone's viewer, for photos (2)

- **Entry:** Phase 0. Before the first line of code, the installs are said out loud and get his
  word: `expo-image@57.0.4`, `expo-media-library@57.0.4` for Save and `expo-clipboard@57.0.1` for
  Copy — the versions SDK 57 bundles, pinned exactly as their siblings are; then `pnpm phone pods`. The app on his phone sees none of it until
  `pnpm phone` rebuilds; the emulator sees it at its next `pnpm phone:android --no-pair`.
- **Work:** §4.2 without its *Video* paragraph. The seven files of the table; `Stage.tsx` the one
  Reanimated and gesture-handler import, mocked in `jest.setup.js` beside `Crossing` with the same
  note; the tiles in `Attachments.tsx` and `LaneChain.tsx` measuring on press and registering;
  `SpaceView.tsx` mounting the provider and answering `reveal` with an unanimated
  `scrollToIndex`; `files.view(id)` falling back to `file` on a `404`, so the phone works against
  a server from before Phase 4; `Actions.tsx` with Share, Save, Copy, Go to message, Details and
  Open original; `feel.tick()` at the dismiss line and the Android branch in `haptics.ts`; the
  Android props and the platform's marks in `icons.ts`, seen on the emulator as they are written; Jest mocks for
  `expo-image` (keeping `source` and `placeholder` as props), `expo-media-library` and
  `expo-clipboard`. A video tile keeps playing as it does today until Phase 2.
- **Done when:** a tap on any photo in a room opens the viewer from the tile, with the thumbnail
  in the first frame and the view copy crossfading in; the counter says the item's place in the
  deck — the twenty messages around the tapped one — and a thread's says the thread's; a swipe pages both ways with the gutter and
  rubber-bands at the ends; a pinch, a double tap and a pan within bounds work as §4.6 says, and a
  pinch let go under three quarters closes; a drag shows the room behind, springs back short of
  the line and returns to the tile past it, with the click, or shrinks and fades where the tile
  cannot be found; a tap hides and shows the chrome; the menu's six rows do what they say; Reduce
  Motion crossfades; on the web target the viewer opens, pages by the arrows and closes on Escape;
  `media/*.test.tsx` covers the list in §4.2; `e2e/viewer.spec.ts` is green on 5198;
  `e2e/maestro/viewer.yaml` is written; ADR 0056 is written from §2; the mobile guide says what a
  tap on a photo does; STATUS.
- **Proof:** `pnpm --filter @chipschat/mobile test`, `pnpm run check`, `pnpm mobile:e2e` on 5198
  alone, and a simulator recording — frames from `simctl` video, as before — of the open, the
  swipe and the drag, beside figures 2, 4 and 6, and the same on the emulator beside figure 3b. The
  walk on his iPhone is his, after `pnpm phone`.
- **Needs his word:** the three installs and the rebuild. Decisions 1, 2 and 5 of §7 were answered on 13
  September 2026; the rest can wait for theirs.
- **Departures, as built (14 September 2026).** What the phone's viewer does that §4.2 did not say, and why:
  - **`app.json` gained an `expo-media-library` entry**, given with the installs' word. Save writes
    to the library, and iOS ends an app that does so without `NSPhotoLibraryAddUsageDescription`.
    It asks to add and never to read, asks Android for photos and videos only, and reads no
    location. `pnpm phone` now makes `ios/` again when `app.json` or `package.json` is newer than
    it, because the main checkout's `ios/` predates the entry and a build from it would crash on
    the first Save.
  - **A video the server never measured is not in the deck** (the question Phase 0 left). The deck
    takes a video by `hasPoster`, the test the room draws a tile by. Such a video has no poster to
    stand in and no tile to fly back to; it stays a row in the room, playing in the player. `deckOf`
    and its tests changed with it.
  - **`visibleLines` is core's now** (`model/readers.ts`), and the phone's room and the deck read
    it. The web's copy waits for Phase 5. **`DISMISS_DISTANCE` is exported**, so the click and the
    decision are one number.
  - **The worklets needed an order.** The first drag on the simulator threw inside
    `dismissProgress`: the worklets plugin makes each worklet where it is declared, holding what it
    calls as it stands then, and `fromOne`, `clampAxis` and `pageStep` were declared below their
    callers. The stage had the same fault. Both are reordered, and
    `tools/guardrails/worklet-order.test.ts` reads every file with worklets and holds it to the order.
    The directives themselves hold: core's arithmetic runs on the UI thread.
  - **`Stage.tsx` is the viewer's one import of Reanimated and gesture handler**, and the
    `GestureHandlerRootView` is inside it rather than in `MediaViewer.tsx`, to keep it so. "The only
    file in the app" was never true — `Crossing.tsx`, `NeedsCard.tsx` and `app/_layout.tsx` import
    them — so it is the only file of the viewer.
  - **The pager does not re-centre three slots.** Each item stands at its own page and one offset
    carries them all; only the current item and its neighbours are mounted, keyed by attachment, so
    a settled page swaps nothing and shows no wrong frame. One gesture detector over the stage acts
    on the current item, rather than one per slot, and the zoom resets on a page.
  - **`files.view` knows the original when it sees it.** Today's server answers `?variant=view`
    with the file rather than a 404, so the phone compares the size and the type, keeps the bytes
    once as the file, and reports the original; Open original is absent then, as figure 8's note
    says it should be. A 404 still falls back to the file.
  - **Save saves the file as it was sent; Copy copies what is on the stage.** Their platform halves
    are in `spaces/local.ts` and `local.web.ts`, the split that already exists, not a new file in
    `media/`. The web target has no library and no Save row.
  - **Details is the same sheet, saying something else**, and every other row acts once the sheet
    has gone: a system sheet presented over a modal on its way down is taken down with it on iOS,
    and Go to message must not start the viewer's close under a sheet.
  - **A video in the deck is its poster with a play mark**, and a tap plays it in the player it
    already had, moved to `spaces/Player.tsx`, until Phase 2 plays it on the stage.
  - **The viewer's marks are `PHONE_ICONS`**, beside the design system's `SYSTEM_ICONS`, so the
    drift test checks only what the web has; Close is the design system's `x`.
  - **Go to message needed the room's list told**: a `FlatList` redraws its rows only when its data
    or `extraData` change, and the line to flash is neither. The flash also takes a pulse, so a line
    a card had already landed on flashes again.
  - **The room is asked to reveal a line only when the tile is off the glass**, measured as the page
    settles, not on every page. Tiles are registered by line and attachment, and a measure that does
    not answer in 150 ms is taken as no tile.
  - **The bars' fade is React Native's `Animated`**, and they arrive 120 ms in by a timer; Reanimated
    stays in the stage. The menu and the player are inside the viewer's modal view, so a screen
    reader, and the tests, find them beside a stage that is `accessibilityViewIsModal`.
  - **A touch means nothing until it has moved 10 points, and a tap fails past them.** The emulator
    found both: Android reports a pan's first update as it activates, at no distance, which a test of
    `|dx| > |dy|` read as a dismiss; and a swipe inside 500 ms was a single tap as well, which hid the
    bars. §4.2's "reads the scale at its first movement" now waits for the movement.
  - **Android's five feelings all take the platform's constants** (`Virtual_Key`, `Long_Press`,
    `Confirm`, `Reject`, `Clock_Tick`), not only the tick.
  - **ADR 0057, not 0056**, which the limiter's took on 13 September 2026; Phase 4's grant is 0058.
  - **The walk was on a fresh simulator paired with a scratch server** (`pnpm mobile:dev`, 4434),
    not the booted one, which is paired with the live `chipsd`. Frames came out of `simctl` video
    through `ffmpeg`, which ADR 0053 installed, rather than the Swift script.

### Phase 2 · Video in the viewer (1)

- **Entry:** Phase 1.
- **Work:** §4.2's *Video* paragraph, on the download path: `VideoItem.tsx`, the controls, Picture
  in Picture and *System player*; core's `fetchAttachmentWithType` gains `onProgress` over the
  body's reader and `files.play` passes it on, so the poster carries a ring while the copy comes;
  a video plays when landed on and pauses when left (decision 2, answered: it plays); the caption says when the copy
  that plays everywhere is still being made; a video tile and a row's Play open the viewer on the
  video, and `Player` goes. `app.json` gives `expo-video`'s plugin `supportsPictureInPicture`,
  which is a manifest flag and a rebuild on both platforms.
- **Done when:** a measured video opens the viewer on its poster and plays; an unmeasured one
  opens it too, from the row; the ring shows what has arrived; play, pause, the scrubber, the
  time, mute, Picture in Picture and *System player* work; leaving pauses and returning resumes;
  the drag to dismiss works on a video; the viewer says when the original is playing; the two
  video specs in `e2e/media.spec.ts` and the Jest tests in `Attachments.test.tsx` are moved to
  the viewer; STATUS.
- **Proof:** the same suites; a recording of a clip playing in the viewer beside figure 7, from the
  simulator and from the emulator; on his phone, the two-minute video over a flaky connection that M4.4's acceptance still owes,
  which this phase can walk in the same sitting.
- **Needs his word:** the `app.json` change and its rebuild.
- **Departures, as built (14 September 2026).** What the video in the viewer does that §4.2 did not say, and why:
  - **The ring is true through the relay too, and that needed the tunnel.** The phone's `fetch` is
    `expo/fetch`, which streams a body, so on the server's network the ring reads the body as it
    comes. The relay's caller held every chunk until the last, so there it could only have been a
    spinner. Arjun chose to stream the tunnel as well: `Caller.stream` hands an answer over at its
    headers with a `ReadableStream` the data frames flow into, and the relay link wraps it in a
    `Response`, or in a small one of its own where React Native's polyfill cannot hold a stream.
  - **The server says which bytes `?variant=play` gave.** Nothing on the phone could tell *the copy
    is being made* from *this video already plays everywhere* (a copy the server skips), so the
    answer carries `x-chips-playable` (`pending`, `done`, `skipped`, `failed`), and the caption
    speaks only on `pending`. A server from before it says nothing, and neither does the viewer.
  - **A video the server never measured is a deck of one** (core's `deckOfOne`), opened from its
    row's Play, with the crossfade in and the shrink-and-fade out; the room's deck rule is as it was.
  - **One player for the viewer, not one per slot.** `useVideo` puts the current video on a single
    `expo-video` player and keeps each video's place; only the current slot draws the `VideoView`,
    which the stage takes as a `video` node over the poster, so it flies, pages and drags with it. A
    neighbour is its poster and a play mark.
  - **The controls are `Controls.tsx`, drawn by the bars**, rather than inside `Chrome.tsx`. The
    scrubber is React Native's `PanResponder`, claiming at touch start as the sheet's handle does:
    the bars are outside the stage's gesture root, so a drag begun on the track is never the stage's,
    and Reanimated stays in `Stage.tsx`. It seeks at most every 100 ms while it moves.
  - **A tap on a video**, with its bars hidden or while it is paused, plays or pauses it and brings
    the bars back; with it playing and its bars up, it hides them (figure 7's note). A video that
    plays to its end brings them back too, which the simulator showed was missing.
  - **A drag to dismiss pauses the video and springing home plays it on**: the stage says when a
    dismiss takes hold and lets go (`onDragging`), and the pan's decision still waits for 10 points.
  - **System player is a full-screen modal of its own**, a `VideoView` with the platform's controls
    and a Done at the top's middle (AVKit holds both corners), with the player handed across both
    ways at its time. The view's `enterFullscreen`, called inside the viewer's modal, resolved and
    presented nothing on the simulator.
  - **The start waits for the view.** The web's player is the `<video>` its view mounts, and a seek
    or a play before that does nothing, so a landing seeks and plays as the view mounts, on every
    platform.
  - **The stage's shared values are one memoised object.** Built anew each render, they ran the
    opening, closing and paging effects on every render; a playing clock redraws the viewer four
    times a second, and each redraw restarted the closing spring, so Escape left an invisible modal
    over the room on the web target. A clock that has not moved now redraws nothing.
  - **A released player is nothing to keep.** `useVideoPlayer` releases its player as the viewer
    unmounts, before the landing's cleanup reads the time; on the simulator that was a red box on
    the first drag away. The cleanup takes a released player as gone, and the Jest fake releases
    itself the same way.
  - **Picture in Picture is asked once, and a throw is no.** On the web the export throws; the
    iPhone simulator answers no, so the button is for a phone.
  - **`media.spec.ts` had one video spec, not two**: its clip the server cannot measure now opens the
    viewer from its row, and `viewer.spec.ts` gains a clip made with ffmpeg that plays, stops when
    paged away from and plays on when paged back. Where ffmpeg is missing it is skipped.
  - **The emulator walked against the scratch server**, as the simulator did: no room in the live
    workspace has a video, so at Arjun's word the emulator's app data was cleared and it was paired
    with the worktree's `pnpm mobile:dev` at `10.0.2.2`. Pairing it back with the live workspace is
    his. What Android showed that the iPhone did not (Picture in Picture's whole-activity window, a
    black stage for a view remounted at a video's end, iOS words in two hints) is left for Phase 3.

### Phase 3 · Android: what it asks of the viewer by itself (0.75)

- **Entry:** Phase 2. Decision 11 is answered: the toolchain is on this Mac (Temurin JDK 17, the
  SDK in `~/Library/Android/sdk`, the emulator `chips-pixel-9` on Android 16, installed on his
  word on 13 September 2026), there is no Android phone, and `pnpm phone:android` checks, builds,
  installs and pairs. So Phases 1 and 2 are built and recorded on the emulator as well as the
  iPhone simulator, and this phase is only what Android asks of the viewer that the iPhone does
  not.
- **Work:** the viewer walked on the emulator against §4.2's *On Android*, and whatever differs
  fixed and recorded as a departure; `expo-media-library`'s permission strings, if Phase 1 did
  not add them; `e2e/maestro/viewer.yaml` run on the emulator.
- **Done when:** on the emulator the viewer opens from the tile and returns to it; the back
  gesture and the button close it with the return; a page swipe from inside pages and one from the
  edge is a back; the status bar's icons are light over the stage and hide with the chrome; a
  video plays from the download path — the H.264 copy where it exists, and the poster with the
  sentence where an iPhone's HEVC will not decode; Save puts a photo in the gallery; Share hands
  it to another app; `viewer.yaml` has been run on the emulator, the first Maestro flow ever run
  here; the README's *Android* section says what the viewer does there; STATUS says what differed,
  and that the click is unfelt until there is an Android phone, which `haptics.ts`'s note keeps
  saying.
- **Proof:** `pnpm phone:android`'s checks; the emulator recording beside figure 3b; the Maestro
  run's output.
- **Needs his word:** Maestro's install. A rebuild on the emulator with `--no-pair` is not his;
  pairing it again, or posting into the live workspace from it, is.
- **Departures, as built (15 September 2026).** What Android asked of the viewer that §4.2's *On
  Android* did not say, and why. Every one was seen on `chips-pixel-9`, against the worktree's
  scratch server.
  - **The viewer's own window is a native view, `ChipsViewerWindow`**
    (`apps/mobile/modules/viewer-window`). It is a local Expo module for Android only, autolinked,
    with no new package. The viewer's `Modal` is a dialog window over the activity's, and two
    things turned out to be that window's alone, which nothing in JavaScript could reach:
    - *The status bar.* An `expo-status-bar` inside the modal asks the activity's window, and the
      focused dialog decides. So the bar stayed when the bars hid, and came back out of turn. The
      view asks its own window, with light icons, and asks again whenever that window regains
      focus. On iOS and the web target it is still `expo-status-bar`.
    - *Picture in Picture.* Android pins the whole activity, dialog and all: the stage, its bars
      and its counter were pinned over the video. A React style could not take them away, since a
      pinned activity is paused and mounts nothing until it resumes. While pinned, the view
      clears the dialog and paints the activity black behind the player. It clears the dialog
      rather than hiding it, because a window made invisible and shown again came back without
      the stage's black. The pinned window now shows the video alone, playing, black around it.
    - *The pinned window's shape.* `expo-video` gives a view that was not up when its video
      loaded a default aspect of 16:9, and sets it on the activity as it pins. The viewer's view
      is put up after the load, so a clip shot upright was pinned 16:9 on about one pin in two. The
      WM shell dumped `aspectRatio=16/9` for those. Shaping the window as the viewer opened, and
      again just before the pin, both lost to that. The view now sets the video's shape once the
      activity reports it is pinned, and the window resizes to it: eight pins upright in a row.
  - **A view taking the player over paused draws its frame with a seek.** A new view has no frame
    until the player draws one, and an Android player at its end has none left to draw. So after
    System player's Done, and back from Picture in Picture, the stage was black with a play mark.
    The seek is to just before the end, 50 ms, where the last frame is. Neither the poster above
    the view nor `onFirstFrameRender` was needed.
  - **The words for an original this phone cannot play, while its copy is made:** *This phone
    cannot play the original.* and *The copy that plays everywhere is being made. Try again in a
    minute.* They sit over the poster, with **Try again**. The walk used a 10-bit HEVC clip, as an
    iPhone records in HDR, behind three five-minute clips in the copy queue. The emulator's
    decoders take HEVC Main only, and ExoPlayer failed with a codec error, which the viewer had
    said raw under *Could not play the video.* A WebM from an Android phone on an iPhone meets the
    same words. What it took beyond the words:
    - Try again asks the server for the copy alone: core's `copyOnly`, and `files.play`'s
      `forCopy`. A copy still being made leaves the original kept on the phone unfetched again.
    - **The server says `no-store` on a pending play answer.** Every attachment answer said
      `private, max-age=600`, and the emulator's HTTP cache handed the pending original back for
      ten minutes, so Try again never reached the copy. Fixed in
      `server/src/interfaces/http/routes/uploads.ts`; the live `chipsd` sends it once restarted.
    - A video that will not play has no Picture in Picture button, and no *Playing the original*
      line over it.
  - **Android's words in the menu.** Share says *The share sheet: Quick Share, and every app*.
    System player says *Full screen, with its speed and captions*: ExoPlayer's controls have speed
    and audio behind their gear, captions when the video has them, and no AirPlay.
  - **Maestro reads `${…}` as JavaScript.** All seven flows used shell defaults
    (`${APP_ID:-chat.chips.app}`), and the first run stopped before its first step. They give
    their defaults in `env:` now. `viewer.yaml` opens the room's newest video first, and looks for
    photos after, since the room opens at its newest line. It checks the clock has moved off 0:00
    rather than that the video still plays, since Maestro takes seconds a step while a video plays
    and a short clip can finish meanwhile. Maestro is the release zip in `~/.maestro`, on Arjun's
    word.
  - **The app's `.gitignore` ignored every `android/` beneath it**, so a module's Android sources
    would not have been kept. It names the app's own generated `ios/` and `android/` now, and the
    modules' Gradle output.
  - **As §4.2 said, and seen:** the back gesture from the edge and the back key close with the
    return into the tile; a swipe from inside pages; Save puts the file into the gallery (`DCIM`)
    and says *Saved to the gallery*; Share opens Android's sheet with the picture, and Messages
    took it (nothing was sent). An H.264 copy plays; decision 12 stands.

### Phase 4 · The bytes: a view copy, byte ranges, and a grant (2)

- **Entry:** Phase 2, so both video paths exist to switch over. Independent of Phases 3 and 5;
  may run beside 5. (Renumbered when Phase 4 was prompted, 15 September 2026: migration 0021 went
  to the voice notes' search on 13 September and the live database has it, and ADR 0057 to the
  viewer in Phase 1, so this phase's are migration 0022 and ADR 0058.)
- **Work:** §4.5. Migration 0022 (`view_sha256`, `view_mime_type`); `images.thumbnail` at a
  `viewEdge` of 2,048 at upload and on first request, for photos and for a video's poster;
  `BlobStore.size` and `BlobStore.read` with a range in the port and the disk adapter;
  `Range` in the route with `206` and `416` and `Accept-Ranges`; `POST /v1/attachments/:id/grant`
  with `verifyDeviceGrant` beside `verifyGrant`, its row in the authorization matrix, and the
  logger dropping `sig`; `FileService.streamUrl` on both clients, nothing when the link is the
  relay; `VideoItem` and `VideoStage` preferring it; the phone's `files.view` no longer needing
  its fallback against this server; the desktop shell's CSP admitting `http:` and `https:` for
  `img-src` and `media-src`; ADR 0058; the protocol reference regenerated; the conformance kit's
  restatement if it covers attachments.
- **Done when:** the route answers a first range, a middle range, an open-ended one and one past
  the end as the standard says; a grant is admitted for its device and refused for another, after
  its expiry and for another variant; a view copy is made at upload for a new photo and on first
  request for an old row, once; the phone streams a clip on the tailnet, starting within a second
  and scrubbing; the desktop's in-row player does the same and the lightbox will (Phase 5); a
  grant never appears in a log line; the live `chipsd` has taken 0022 at a restart on his word;
  STATUS.
- **Proof:** `pnpm test`, `pnpm run check`, the server's integration tests, a `curl` with a
  `Range:` header against the dev server showing `206`, and a phone recording of a clip starting
  on the tailnet.
- **Needs his word:** the migration on the live `chipsd` (4431) and its restart; the grant's
  trade as ADR 0058 states it; the CSP change, which is a rebuild of the desktop app.
- **Departures, as built (15 September 2026).** What the bytes turned out to need that §4.5 did
  not say, and why:
  - **A view asked of a photo with no copy is the photo itself, and the answer says so.** A GIF
    has no copy, since a copy is one still frame, and neither has a photo `sharp` could not read.
    `?variant=view` answers either with the file and `x-chips-view: original`; a copy answers
    `x-chips-view: copy`. The phone keeps the file once as the file on `original`, and guesses by
    size and type only for a server that says nothing. A video measured before 0022 has no poster
    copy, and its view is `404`. A photo kept before 0022 is given a copy at its first ask, made in
    the request: only a row with no copy is written, and two first asks in one process make it once.
  - **A grant names the bytes it resolved to** (the question Phases 2 and 3 left). A `play` asked
    for while the copy is being made names the `file`, and the answer carries `playable: pending`
    and the `variant` it named, so a grant's runs are runs of one file for its life. Play grants do
    not wait for the copy: an iPhone plays the HEVC original at once. Try again asks for a fresh
    grant; the phone keeps one until a minute before it expires, so a video paged back to plays the
    same URL and is not loaded again.
  - **The door checks a grant before it looks anything up.** Signature and expiry first, refused
    `403` with the reason; then the device, `401` once withdrawn. The person is
    `via: "device_grant"`, and `admitReader` asks on every request whether they may read the file,
    so leaving the space ends a grant. A device that signs its own request and carries another's
    grant is refused as *wrong device*. The HMAC starts with a label, so no harness grant's
    signature is ever a device grant's.
  - **What a cache may keep, and how long a grant holds.** A grant's answer is `private` with a
    `max-age` of the seconds it has left; a pending play answer to a signed GET stays `no-store`. A
    grant to a video's `file` holds as a `play` does, its length and ten minutes; a video of unknown
    length holds the hour.
  - **The range is read once, in `@chipschat/protocol`**, for the route and for the conformance kit's
    stand-in, which now answers ranges too. Several runs, or a header it does not read, get the whole
    file, as the standard allows. Every answer carries the digest as its `ETag`; `If-Range` and
    `HEAD` are answered. A harness's read is an audit event at its first byte, not at every run.
  - **`BlobStore.read` opens the file at the first read.** Opened when the stream was made, an
    answer nobody read — a test that looked only at a status — left its file open, and Node 26 calls
    a file closed by the garbage collector an error. Now an unread answer holds nothing.
  - **The logger drops `sig=` from every line it writes**, a message or an error's words included,
    by a hook on the line rather than a field path: a URL in a string was out of redaction's reach.
    The relay link's own rate-limit line logs a target, which a grant's would be.
  - **While a stream starts, the poster carries a spinner.** Nothing says how much has come, so no
    ring; the ring is the download path's. The spinner also shows while a scrub catches up.
  - **The view edge is configuration**, `attachments.viewEdge` (2,048), beside `thumbnailEdge`.
  - **Save's and Share's file names still carry the attachment id** (`att_…-receipt.jpg`):
    `files.file` was not opened, so it stays a known issue.
  - **The walk used this worktree's scratch server on 4534, not `pnpm mobile:dev`'s default ports.**
    Another worktree's scratch server and Metro held 5197, 8083 and 4434 when the walk began. So
    `chipsd` ran as `mobile:dev` starts it, on the same `.chips/phone-dev`, and later behind a small
    logging proxy on 4534 with a scratch relay on 4637. Both devices were paired with it by
    `chips://pair` links. The walk simulator was built as a Release, for arm64 alone, since its Debug
    app would have loaded its JavaScript from the other worktree's Metro.
  - **Seen on the network.**
    - The simulator: a two-minute 1080p clip of 66 MB started 0.55 s after the tap.
    - The emulator: 2.5 to 2.9 s after the tap. The logging proxy put the network at about
      17 ms of that, a 14 ms grant and a 3 ms first byte. The rest was the emulator's JavaScript
      thread (a second between the grant and the player's first request) and ExoPlayer preparing
      (0.9 s to its decoder).
    - Scrubbing: from 0:21 to 1:36 on the simulator, and from 0:02 to 1:29 on the emulator, each
      playing on from there.
    - Earlier runs of the same clip stalled while an Xcode build and another session's test run
      loaded the Mac; they are not the numbers.
  - **Seen through the relay: the download path, as before, and a fault that predates this phase.**
    A small clip rang and played on both devices. The 66 MB clip's ring sat at 1–2 % for about
    20 s: the server's end of the tunnel reads a whole answer before it sends any (ADR 0039's
    answerer). When it all arrived, the stage flew back into the tile with the viewer still open, and
    the clip played there. Phase 3's client code does the same on the emulator. It is recorded, and
    handed on as a task of its own.
  - **The live step, at Arjun's word.** He chose to push to `main` first. Phase 4, rebased onto the
    Chess Game fixes another worktree had brought to `main`, went to `origin/main`
    (`656bf2f..2bb1545`). The main checkout pulled it, `.chips/chips.db` was backed up with
    SQLite's own `.backup`, and the launch agent was restarted. The live `chipsd` took 0022 at
    14:58 UTC, 15 September 2026.

### Phase 5 · The web's lightbox (2.5)

- **Entry:** Phase 0 in code; placed after the phone so the shape is settled, and after Phase 4
  so its video streams. First, verify §1.6 in the desktop shell — what a photo's click does today
  — and record it.
- **Work:** §4.3. The six files of the table; `Attachments.tsx` losing `window.open` and opening
  the viewer for photos and for a video's poster; `SpaceView.tsx` and `Thread.tsx` mounting a
  `ViewerHost` each; styles in `styles.css` under a `viewer` block on the design system's tokens
  with the stage black; the keys; the pointer; touch through pointer events; a *Media viewer*
  section in `kitchen-sink/gallery.tsx`; a second Playwright project in `apps/web` at a Pixel's
  viewport with `hasTouch` beside `chromium` (the `tablet` project is the phone app's web target's,
  in `apps/mobile`).
- **Done when:** a photo's click opens a dialog with its place, from the tile, on the design
  system's curve; the arrows, the keys, the backdrop click and Escape do what §4.3 lists and focus
  returns to the tile; zoom is at the pointer and sharp; the filmstrip follows and hides; a video
  plays with the controls, Picture in Picture and fullscreen; a thread's viewer swipes the
  thread; the Vitest suite covers the deck, the keys, the focus and each action;
  `e2e/viewer.spec.ts` is green, on the desktop viewport and the Pixel one; the kitchen sink's
  snapshots exist in both themes, looked at before they are committed; axe reads the open dialog;
  the desktop guide has the keys table; STATUS.
- **Proof:** `pnpm --filter @chipschat/web test`, `pnpm e2e`, `pnpm visual` in the container,
  `pnpm run check`.
- **Needs his word:** nothing new; the snapshots are looked at together before they land.

- **Departures, as built (16 September 2026).** What the web's lightbox does that §4.3 did not say,
  and why:
  - **§1.6 is settled.** In Chrome a photo's click opened a second tab at the blob URL, and
    `window.open(…, "noopener")` returns `null` by the standard, so the page could never tell
    whether it had worked. In the desktop shell it did nothing: the app was built here for the
    first time and a probe in its WKWebView ran the same call — no throw, `null` back, and the
    shell's one window unchanged. The fix was the same either way, as this section said.
  - **Eleven files, not six.** The table's six are all there; four more came out of them because
    this repository caps a function's cognitive complexity at twelve and its hooks must declare
    what they read. `gestures.ts` is every pointer the stage hears and the scale, pan and drag they
    move; `useFlight.ts` is the open, the return and the focus around them; `usePicture.ts` is
    where a photo's bytes come from, with the neighbours' prefetch; `Picture.tsx` and `useThumb.ts`
    are what the stage draws. `ViewerHost.tsx` is beside `useViewer.ts` because a `.ts` file holds
    no JSX.
  - **A video keeps the browser's own controls.** §4.3 said *our controls*, as the phone has, and
    the phone had to write them because React Native offers none. A browser's `<video controls>`
    already is the list rule 7 asks for — play and pause, a scrubber, the time, mute, Picture in
    Picture and fullscreen — in the platform's own words, reachable by keyboard and by a screen
    reader, and Picture in Picture from it is a menu item rather than a button we ask for and are
    refused. So the stage uses them, and the viewer's own bottom bar stands clear above them
    (`.viewer-chrome[data-kind="video"]`). Space still plays and pauses from the keys.
  - **A double click is 2×, a double tap 2.5×.** §4.3 says two times for the web's pointer and §4.6
    says 2.5 for a tap; both are kept, told apart by the `pointerType` of the last pointer down,
    since a `dblclick` does not carry one.
  - **Only `SpaceView` mounts a host.** §4.3 said `SpaceView` and `Thread`; the desktop has no
    `Thread` any more — the thread offer was withdrawn from both clients on 15 September 2026 — and
    the room's two `Attachments`, a message's and a route row's, are both inside the one host. A
    thread that comes back mounts its own, which is what the rule asks.
  - **The strip hides by width in the stylesheet, and by zoom in the component.** 900 pixels is a
    media query, so no measurement is made to decide it; zoom is state, so the component drops it.
  - **The keys are a table, and `?` shows it.** The same list is `KEYS` in `Lightbox.tsx`, the card
    behind `?`, and the desktop guide's table.
  - **Three faults a browser found that jsdom could not**, each now a line of code with the reason
    beside it: StrictMode's second effect teardown fired the dialog's `close` and shut the viewer
    in the frame it opened, so nothing listens for `close`; the focus cannot reach a tile while the
    modal dialog is up, so the tile is focused in the same breath as `close()` rather than after a
    timer; and hiding the filmstrip while a thumb had the focus stranded the keyboard, so the
    dialog is focusable and takes the focus back when nothing else holds it.
  - **jsdom needed four stand-ins** (`src/testing/setup.ts`): `showModal`, `close`,
    `ResizeObserver`, `HTMLMediaElement.play`/`pause` and `scrollIntoView`. What they stand in for
    — the top layer, the focus trap, a stage with a size, a real decoder — is asked of a browser in
    `e2e/viewer.spec.ts` instead.
  - **The e2e reads the counter rather than counting the room.** The specs share one workspace and
    the `pixel` project runs them all again after `chromium`, so how many photos a room has
    gathered is not a number a spec can know in advance; each asks the open viewer where it stands
    and then asks about moving from there.
  - **Phase 4's web spec moved with the player**: `a clip plays in its row from a grant, which the
    player asks runs of` is `viewer.spec.ts`'s now, asserting the grant's shape and a `206` with a
    `Range` from the stage.
  - **Not done: the visual snapshots.** `pnpm visual:update` needs Docker, which was not running;
    they are to be made and looked at in both themes before they land.

### Phase 6 · The tablets, and the wide window (1)

- **Entry:** Phase 1. The Android tablet emulator is installed: `chips-pixel-tablet`, the Pixel
  Tablet profile on the same system image as `chips-pixel-9` — 2,560 × 1,600 at 320 dpi, which is
  1,280 × 800 dp and clear of `useLayout`'s 768 (16 September 2026, at his word). Nothing was
  downloaded for it.
- **Work:** §4.4. `Chrome.tsx` draws the filmstrip and the arrows when `useLayout().wide`, the
  arrows on hover for a pointer and always for a finger; rotation re-fits and keeps the zoom's
  centre; `e2e/tablet.spec.ts` gains a viewer test.
- **Done when:** on a wide window the viewer covers the window with the filmstrip and the arrows,
  the filmstrip jumps and follows, an arrow pages, rotation re-fits; a narrow window is the
  phone's viewer; the tablet spec is green; an iPad simulator recording sits beside figure 10,
  and an Android tablet emulator recording if there is an image for one; STATUS.
- **Proof:** `pnpm mobile:e2e` for the `tablet` project; `pnpm phone sim` with an iPad device
  name; `chips-pixel-tablet` for the Android recording.
- **Needs his word:** nothing. The tablet image it waited on is installed, and this phase changes
  no server and no page, so it has no live step. A real iPad is the walk that waits.
- **Departures, as built (16 September 2026).** What the tablets turned out to need that §4.4 did
  not say, and why:
  - **The arrows rest visible; they do not appear on hover.** §4.4 asked for `Pressable`'s
    `onHoverIn`, as the web's `:hover` does it. A browser can do that because a touch screen simply
    never matches `:hover`; React Native cannot, because it raises no hover event where there is no
    pointer and offers no way to ask whether one is there. Hidden-until-hover would have left an
    iPad held in two hands with no arrows at all. So they rest at 55 % and a hover takes them to
    full — the hover is still `onHoverIn`, which React Native Web raises and a mouse on Android
    raises too, and it is emphasis rather than existence.
  - **The `POINTER` gate narrowed rather than went.** The prompt said it goes. Keeping the arrows
    for a pointer *or* a wide window is what both §4.3 and rule 10 ask for together: the web target
    at a phone's window still has a mouse, still cannot swipe, and its specs page by those arrows.
    So `arrows()` is `POINTER || wide`, and a phone — the only surface with neither — is the one
    that gets none.
  - **The filmstrip is its own file, and *off while zoomed* costs nothing.** `Filmstrip.tsx` beside
    `Chrome.tsx`, because `Chrome` was already at this repository's cognitive-complexity cap;
    `TopBar` and `Arrows` came out of it in the same breath. The strip sits *inside* `Chrome`, so
    decision 8's *off while zoomed* is already true: the bars go at the first movement of a pinch
    (`Stage.tsx`'s `bare`) and come back when the picture settles fitted. Nothing tests for zoom.
  - **The strip is marked with `aria-selected`, not `accessibilityState`.** React Native Web
    dropped `accessibilityState`, so the current thumb came out with no attribute at all and
    nothing outside the app could say where the stage stood. The space list and the fleet already
    use the `aria-` spelling for the same reason; React Native maps it back to the native state.
    The tablet spec is what found it.
  - **Rotation keeps the centre by scaling the pan, on the UI thread.** The fitted rect is centred
    in the stage, so the picture's point at the middle is `-pan` over its drawn size: scaling the
    pan by how much the fitted rect changed keeps that point where it is. The zoom carries over as
    it is, short of the new orientation's maximum — one image pixel per device pixel is a different
    number the other way round — and `clampPan` has the last word. It is a worklet, handed the new
    stage and both rects by `scheduleOnUI`: written first as JavaScript, it read the zoom and the pan
    from JavaScript's copies, which hold what JavaScript last wrote and not what a gesture did since,
    and the Android tablet turned a picture at 2.5× into one at fitted size, displaced by exactly
    where `clampPan` puts zoom 1 and pan 0 on the other orientation's stage. No unit test could have
    said so — the stage is mocked under Jest — and the tablet spec cannot turn a device. The turn is
    now heard on either dimension; it was width alone, which missed a split moved up or down.
  - **Wide to narrow takes the room with it.** Narrowing the window under an open viewer does not
    give the phone's viewer: the split comes apart and the app lands back on the Spaces list, so
    the room goes and the viewer with it. That is the shell's, and it is the same whether a viewer
    is up or a room is merely being read — so it is recorded here and not fixed here. The tablet
    spec shuts the viewer, narrows, and opens the room again.
  - **The iPad was built by hand, not by `pnpm phone sim`.** That command refuses a `chipsd` bound to
    loopback, and dev mode's pairing route exists only on loopback, so it cannot walk a scratch
    server; its one server mend reinstalls the `chat.chips.serve` launch agent, which is the live
    server. The same prebuild, `pod install` and `xcodebuild` it runs were run in its place, the app
    installed with `simctl` and paired with a `chips://pair` link from the scratch server.
  - **Not this phase's, and seen on both tablets: the open does not start from the tile.** The close
    lands in it. On the iPad the first flight frame is about 430 points left of and 400 up from the
    tile; on Android nothing is drawn in flight. Recorded in STATUS with its numbers, for a session
    of its own.

### Phase 7 · The sweep (0.75)

- **Entry:** Phases 1, 2 and 5, all done; Phase 6 too (16 September 2026).
- **Work:** the grid on the phone takes `expo-image` for its tiles, so the viewer's placeholder
  is the tile's own bitmap; the album grid takes the desktop's shapes (two side by side; one tall
  and two; two by two) instead of 48 % tiles; a video sits in it as a tile with its play mark and
  length, so a message with photos and a clip is one album (decision 7); a photo alone keeps its
  shape and stops at 200 points tall (figure 1); a staged photo's chip in the composer opens the
  viewer over the picked file, with Send where it was — which needs a way in the viewer does not
  have yet, a deck of one from a local file; the blueprint's *Photos* row gains the swipe and the
  drag; the guides say what the app does, the phone's guide gaining the tablets (there are no
  screenshots in `apps/docs` to update); STATUS's M4.4 line says what the viewer is in one line
  rather than a sentence per phase, and the list below is carried into STATUS as what is left.
- **Done when:** the grid draws as figure 1 on the phone; a mixed album opens the viewer on the
  clip; a staged photo opens; the docs say what the app does; STATUS.
- **Proof:** the suites, and a last simulator recording of the room and the viewer together.
- **Needs his word:** decision 7, which was never answered, asked before the grid is written —
  and with it whether the desktop's grid, which keeps videos out too, follows. A yes that reaches
  the desktop is a page change, and the live page is rebuilt only on his word.
- **Departures, as built (16 September 2026).** Decision 7 was asked first and answered *yes, and
  the desktop follows*. What the sweep turned out to need that the work list did not say, and why:
  - **One test for what an album holds, in core.** `inAlbum` — a photo the server made a thumbnail
    of, or a video it measured — is what `deckOf` cuts the deck by and what both grids draw tiles
    by, so a tile always has an item to open and an item a tile to fly back to. Before, the deck
    had the rule and each grid its own copy of half of it.
  - **The desktop's shapes, figure 1's proportions.** The phone takes the desktop's arrangement —
    one, two side by side, one tall beside two, two by two — with square tiles, as figure 1 draws
    the album of six; the desktop keeps its 4:3 tiles. The album is a bubble wide (78 %) and no wider
    than the desktop's 420, and takes the bubble's side, as figure 1's receipt does on the right;
    the grid it replaced was 480 wide with 48 % tiles, and a photo alone ran the full width.
  - **A clip alone is a photo alone.** Its own shape, no taller than 200 points, where it was the full
    width up to 280 and, portrait, nearly 470 tall. On the desktop a clip alone takes the photo's
    rule there: no crop, at most 360 pixels.
  - **The desktop's clip gives up the Download under it.** A measured video is a tile of the grid
    now, as a photo is, and is downloaded from the lightbox, as a photo is. A video the server never
    measured keeps its card, with Play and Download, because it has no poster to be a tile with.
  - **The tall tile of three was a gap short, and is not.** The desktop's `.photo-grid` gave the first
    of three `aspect-ratio: 4 / 3` of its own width while it spanned two rows of the narrower
    column, which left it 4 pixels short of the pair beside it (148 against 152 at 300 wide). It is
    as tall as the rows now, its picture placed over it rather than sizing it. The kitchen sink's
    album section is what showed it.
  - **The kitchen sink draws the album, last.** The real `Attachments` over a stub file service, at a
    room column's width: two, three with a clip, six with `+2`, and a clip alone. Placed before the
    media viewer it moved that section by a fraction of a pixel and changed both its snapshots; placed
    last it changes none. The page's `COMPONENTS` list had been missing `media-viewer` since Phase 5
    and now mirrors the suite's.
  - **The staged photo's viewer is its own, over the same stage and bars.** `StagedViewer.tsx`,
    mounted by the composer rather than opened through the room's `MediaProvider`: a staged photo
    hangs under no line and is in no deck, has no view copy and nothing to share, save or go to —
    so the bar is Close alone and the caption says *Not sent yet* — and whether Send may be pressed
    changes while it is up, as the upload finishes, which a prop from the composer follows and an
    opening handed to the provider would not. *With Send where it was* is read as Send drawn in the
    viewer at the composer's own Send, measured on the glass, so the thumb sends from where it
    would have; the keyboard is put down first, so Send is measured where it will be. Sending
    closes with the fade, since the chip goes with the send; Close, the drag and back fly home to the
    chip. `Chrome`'s counter, Share, menu and strip are drawn only where they are given. A photo the
    workspace refused at the chip does not open, and a staged video does not either: the work list
    names a photo.
  - **An image button is found by its label on the web target.** React Native Web gives
    `accessibilityRole="imagebutton"` no role, as the room's tiles already had none, so the phone's
    photo spec finds *Look at holiday.png* by its label; the first run, asking for a button, waited
    out its ninety seconds.
  - **The blueprint's Video row changed too.** It promised an inline player, which Phase 5 moved onto
    the viewer's stage; it says so now, beside the Photos row's swipe and drag.
  - **A tile alone is sized outright.** Written first as `width: "100%"` under a `maxWidth` of 200
    times its shape, with an `aspectRatio`, it passed under Jest, which lays nothing out, and drew a
    portrait receipt 150 points wide and 395 tall on the Android emulator: Yoga takes an aspect
    ratio's height from the width before the maximum clamps it. It is 200 tall at its own width now,
    never wider than the album, and measured 150 by 200 on the emulator, the iPhone and the iPad.
  - **The lightbox holds the focus through a zoom.** The web e2e's filmstrip spec failed with and
    without this phase's grid: a thumb clicked just before a zoom had the focus, the zoom took the
    strip, and the focus fell to the inert page, so `0` and every other key went nowhere. The dialog
    takes it back (`useFocusHeld`); a jsdom test fails without it.
  - **Each web viewer spec finds its own message's grid.** The specs share a room and the Pixel
    project runs them again, so "the last grid" was the previous spec's until this one's message
    drew — a race this phase's clip spec, which left an album there, turned into a failure. Each
    message's files have names no earlier message had.
  - **The open, after the `expo-image` tiles.** On both phones it starts from the tile now: the first
    flight frame draws the picture over where the tile stood, and it grows from there. On the tablets
    it still does not. The iPad hides the tile, shows it again for two frames, and draws the first
    flight frame at the tile's size about 270 points left of and 220 above it; the Android tablet
    draws nothing for four frames at 30 fps and then the picture part way to fitted. The tiles
    changed it without fixing it, so it stays a session of its own.
  - **The walks.** The Android phone and tablet had release builds from `tools/phone/android.mjs`,
    which checks the server and mends nothing; the iPhone was a fresh simulator built by hand, as
    Phase 6's iPad was, and needed Arjun's grant before a tap could reach it. The web e2e ran on 5184
    and 5185, because Jacobian's dashboard holds 5174.

### Not in this pass, recorded

- **The share-sheet target** (M4.4's open line): sending a photo *to* Chips from Photos.
  `expo-share-intent`, a development build; unchanged by this.
- **A hardware keyboard on the tablets**: no native module for key events yet; the arrows and
  the swipe stand in.
- **Live Photos, HDR and Cinematic video**: the viewer shows what the server kept; ADR 0053's
  HDR note stands.
- **Markup**: drawing on a photo before it is sent (the blueprint's `marked.png`). Its own
  proposal.
- **Photos in search**: a voice note's words are not indexed either; the same later work.
- **The edge hand-off while zoomed** — a pan that reaches the picture's edge and keeps going
  paging to the neighbour, as Photos does. Left out of Phase 1 to keep the gesture machine to
  five states; an afternoon once the rest is lived with.
- **Gesture exclusion at Android's edges** (decision 12), if accepting the system's back turns
  out to be wrong in the hand.

## 6. Order, proof, and what needs Arjun's word

**Order: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7.** Phase 0 is pure and lands first because both viewers
read it. Phases 1 and 2 are the visible change Arjun asked for and need no server; they are
written once for both phones, seen first on the iPhone simulator and recorded on the Android
emulator in the same phase. Phase 3 follows them with what Android asks of the viewer by itself,
so that it is heard before the web copies the viewer's shape. Phase 4 is independent of Phase 5 and may run beside it; it is placed before because both
clients' video is the better for it, and because a server migration wants time on the live
`chipsd` before a phone depends on it. Phase 6 is small once Phase 1 exists. Phase 7 is the
polish that is easier to judge with the viewer in hand.

**After the compaction, the ritual is the plan's §0.2 with this document in the plan's place:**
read `docs/STATUS.md` — its *Notes for the next session* has a note for this work — then §2 and
§4 here, then the next phase whose entry is met; ask the decisions that phase names; work in
small commits on his word; before ending a session or compacting, STATUS first. A phase's
departures from this document are recorded under the phase, and a phase is not called done
until every sentence under *Done when* is true.

**Proof at the end of each phase:** the commands the phase names, `pnpm run check`, the phone
e2e on 5198 alone where the phone changed, the web e2e and the visual suite where the web
changed, a recording beside the figure the phase answers to — from the iPhone simulator and
from the Android emulator where the phone changed — and STATUS.

**Needs his word:**

- The installs: `expo-image@57.0.4`, `expo-media-library@57.0.4` and `expo-clipboard@57.0.1` into
  `apps/mobile`, then `pnpm phone pods` and a `pnpm phone` rebuild (Phase 1).
- The `app.json` change for Picture in Picture, and its rebuild (Phase 2).
- Maestro's install, for the first flow run on the emulator (Phase 3). Android's toolchain needs
  nothing more: it was installed on his word on 13 September 2026, and there is no Android phone.
- An Android tablet's emulator image, if Phase 6 is to record one.
- Migration 0022 on the live `chipsd` (port 4431) at its next restart, and the restart itself
  (Phase 4). The launch agent runs the main checkout, so that checkout is brought to `main` first.
- The grant's trade, written in ADR 0058: a ten-minute bearer URL for one file, issued only to a
  signed device request (Phase 4).
- The desktop shell's CSP change (Phase 4), which is a rebuild of the app.
- Whether the desktop's own grid also moves to the view copy for its tiles' full-size click (it
  does in Phase 5 by construction; the question is only whether the harness-facing `file` stays
  the default for Download — recommended: yes, Download is the original).

## 7. Decisions for Arjun

1. **The deck is the whole room's photos and videos**, oldest first, across every message — or
   only the tapped message's album? Recommended: the room's; a swipe should reach the photo
   sent an hour ago, and the counter says how far. *Decided, 13 September 2026: neither — the
   media of the last twenty messages. Written into rule 2 and `deckOf` as a window of twenty
   around the tapped message, which is the room's last twenty for a tap at the foot and still
   holds a photo tapped further up; if that reading is wrong, those are the two places that
   change.*
2. **A video plays when the swipe lands on it**, and pauses when it leaves — or waits for a tap?
   Recommended: plays, as Photos and WhatsApp do; the poster with a play mark is one state fewer
   to explain. *Decided, 13 September 2026: it plays.* On the web a browser allows sound on
   autoplay only after a gesture on the page, and the click that opened the lightbox is one.
3. **Streaming through a device grant URL** (§4.5) — or download-then-play only, with progress?
   Recommended: the grant; it is what makes a two-minute clip start in a second on the tailnet.
4. **A view copy at 2,048 pixels**, made at upload and on first request — or serve originals
   only? Recommended: the copy; it is the difference between a viewer that opens and one that
   waits, on every surface.
5. **Save as a row of its own** (`expo-media-library`, a permission, a native module) — or
   through Share, where iOS's sheet has *Save Image*? Recommended, since Android: the row, on
   both platforms. Android's share sheet has no Save, and a viewer that saves on one phone and
   not the other is two viewers. It was *through Share* before Android was named. *Decided, 13
   September 2026: the row, on both platforms.*
6. **Voice notes in the deck?** Recommended: no. Their words are read in the room; a black stage
   with a play button adds nothing.
7. **Mixed albums** — a video among photos in one message's grid as a tile of the grid (Phase 7)?
   Recommended: yes. *Decided, 16 September 2026: yes, and the desktop's grid follows in the same
   phase* — a measured video is a tile of the grid on the phone and on the page, so the two grids
   stay one; the page change is proved by `pnpm e2e` and the visual suite, and the live page is
   rebuilt only on his word.
8. **The filmstrip on the desktop and the iPad**: on by default where there is room, off while
   zoomed? Recommended: yes.
9. **Pinch under three quarters closes the viewer**? Recommended: yes; it is how Photos closes,
   and a thumb learns it in a day.
10. **Touch on the web** (an iPad in Safari, Chrome on Android, the tablet window): the swipe,
    the drag and the pinch through pointer events in Phase 5, or later? Recommended: in Phase 5; the
    arithmetic is core's and the events are a hundred lines.
11. **Where Android is walked**: an emulator on this Mac, an EAS build, a real Android phone —
    which are available? Phase 3 is sized for the emulator; a phone is what the `tick` and the
    share sheet need. **Decided 13 September 2026**: the emulator on this Mac, installed then;
    there is no Android phone.
12. **A page swipe that starts at Android's edge is a back.** Accept the system's rule, as Google
    Photos does — or ask the system to leave the viewer's edges alone (gesture exclusion, a small
    native piece) so every horizontal swipe pages? Recommended: accept it; the system's gesture
    is the person's, and the viewer closing with its return is not a wrong answer.

## 8. Risks

- **Gestures inside a `Modal`.** Gesture handler needs a `GestureHandlerRootView` inside the
  modal's content on iOS; the plan puts one there. If the modal fights it on a device, the fallback
  is a route with `presentation: "transparentModal"` — the same component under
  `expo-router`, and the tile's frame passed as params.
- **The return animation's target.** A tile far up a windowed list may not be laid out when the
  dismiss lands, even after the room's scroll; the fallback (shrink and fade in place) is
  designed in, and the walk on the phone says how often it is seen.
- **`expo-image` and the grid.** Until Phase 7 the grid draws React Native's `Image` and the viewer
  `expo-image`'s; both read the same local file, so the open animation's first frame is the same
  pixels from two decoders — a hairline of difference at most, and gone in Phase 7.
- **The web target.** Reanimated and gesture handler run on the web, but Playwright cannot pinch;
  the specs use the arrows, the keys and Escape, and the phone's gestures stay the simulator's
  and Maestro's to prove.
- **Ranges through the tunnel.** A `Range` request crosses the relay like any request, but a
  native player cannot use the tunnel; the design accepts the download path there. If the relay
  path matters more than expected, a local HTTP proxy in the app that answers ranges from the
  tunnel is the next instrument, and its own proposal.
- **A grant URL in the wrong hands** is ten minutes of one file. Short, bound, never logged, and
  issued only to a signed device; the ADR carries the argument so the Gate 4 review does not have
  to find it.
- **Android is an emulator.** The app was first built and walked on `chips-pixel-9` on 14
  September 2026, so Phases 1 and 2 see the viewer there as they go; what no emulator answers is
  the click and a real phone's decoder. What is most likely to differ: the `Modal`'s insets under edge-to-edge, gesture handler inside the modal, and which
  phones decode an iPhone's HEVC. Each has a fallback named above; none blocks the iPhone.
- **Android is many phones.** A 2,048-pixel view copy and three decoded slots are chosen for the
  smallest of them; a 60 Hz mid-range phone is the one to watch the open on, and the
  UI-thread design is what keeps it smooth there. The web target and the emulator prove the
  logic; only a phone proves the feel.
