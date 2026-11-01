# 0131. A list says it is empty only when the server has

Date: 6 October 2026
Status: Accepted, 6 October 2026. Changes how the phone launches (the launch picture,
`src/store/provider.tsx`), what the Spaces list shows with no room in it, and how the connection's
mark ends (`ui/Connection.tsx`, the mark of 22 September 2026). The web rail takes the same rule.

## Context

Arjun, on his iPhone: "when I cold start the app I see this message 'no spaces yet' briefly,
before the spaces load and show … Currently the list loads up with a jerk each time." And: the
"No spaces yet" message should be nicer and offer to create a space, and no spaces, no connection
and reconnection should all look polished.

The cause was in the provider. It handed the tabs the store the moment the store was made, and
the store reads its cache after that, asynchronously (SQLite: open, then the events, the cursor,
the read state, the outbox). Until the read landed the model was empty, and the list said
"No spaces yet". The launch picture had already gone, on the root's first layout. Since
[ADR 0116](0116-the-room-is-drawn-first.md) the tabs read the store at transition priority, so the
cached rooms then came in as one low-priority render. That took longer, and all the rows dropped
in at once.

The same words were false in three more places: straight after pairing (nothing cached and the
socket not through), with the server unreachable and nothing cached, and with the hello already
listing rooms that had not come in yet. An empty model cannot tell any of these from a workspace
with no rooms. Only the server can say there are none.

A mock was shown first (kept out of the repo): the cold start fixed; the list's body saying what
is going on; for no spaces, A (centred, with a button) or B (a row that makes one); for losing the
connection with rooms on screen, A (the mark says it is back) or B (A plus a capsule over the
list). He picked A for both.

## Decision

1. **The snapshot says what the store knows** (core, `store.ts`). `readingCache` is true until
   `start` has read the cache, whatever it held. `awaiting` counts the rooms the last hello listed
   that the fold has not taken in. A room leaves the count when it first comes in, and a room
   erased later does not rejoin it. `lostAt` is when the socket stopped being open, while it is
   not.
2. **Core decides what an empty list says** (`emptyList`). `reading` while the cache is read.
   `none` only once a hello has listed no rooms. `fetching` while listed rooms are on their way.
   Otherwise the connection: `connecting`, `closed`, `asleep`, `rejected`. Open with no hello yet
   counts as `connecting`.
3. **The phone's first frame is what it last saw.** The provider hands the store over once it has
   read its cache, or after `CACHE_WAIT_MS` (1.5 s) at the latest. Until then `ready` is false,
   and the launch picture stays up until `ready` (`Curtain`, `app/_layout.tsx`), or 4 s after the
   root's layout at the latest. So the picture dissolves into the cached rooms, and no tab draws an
   empty model.
4. **The list's body says what is going on** (`spaces/NoRooms.tsx`). It sits where the rows would
   be, with the connection's own mark drawn large:
   - Reaching your server: the pins running, and the server's address.
   - Can't reach your server, Your server is asleep, This phone isn't paired anymore: the mark
     still and red, with Try again (the store's `wake`) or Pair again.
   - Rooms on their way: placeholder rows in the rows' own shape, breathing. The rooms fade in
     over them (`Arrive`). Rooms already there on the first frame do not fade.
   - No spaces yet (A): the mark, one line on what a space is, the faces of the harnesses that
     take new spaces and who can start one, and a gold Create a space. It opens the + window out
     of the button itself (`useNewSpace().open`). With nobody to ask, See agents. There is no
     search box, because there is nothing to search. (Since ADR 0148's addendum, Create a space
     whoever there is to ask: the room it makes with nobody to ask is empty.)

   While the body says what the connection is doing, the bar's mark stands down
   (`tellsConnection`), so the mark is not shown twice.
5. **The connection's mark says it is back** (A). After it has shown red, the connection
   returning turns it green with every pin lit for `BACK_MS` (900 ms), and then it goes. It keeps
   that look while it fades. A slow connect that never failed just goes, or every slow launch
   would flash green. The mark's sheet now says which server and when it last connected
   ("4 min ago").
6. **The web rail follows the same rule** (`emptyWords`, `Sidebar.tsx`). It says nothing while
   the cache is read, then "Reaching your server…", "Loading spaces…", "Can't reach your server."
   or "This device isn't paired anymore.", and "No spaces yet." only for `none`.

## Consequences

- Walked on my own simulator (iPhone 17 Pro, iOS 26.5, a Release app with this branch's Hermes
  bundle, scratch chipsd 4495, never 4431). Filmed cold starts went from the launch picture
  straight into the cached list, with no frame saying "No spaces yet". A temporary probe showed the
  store handed over by its cache read 242 ms after it was made, not by the 1.5 s cap. Deleting the
  workspace's only room drew No spaces yet with "Scout can start one", and Create a space opened
  the + window. With the server down and nothing cached, the body said Can't reach your server and
  showed 127.0.0.1:4495. A server that no longer knew the device drew This phone isn't paired
  anymore. With rooms on screen and the server down, the bar's mark went red and its sheet showed
  the server and "Last connected just now". Try again with the server back filmed red, then green
  with every pin lit for 0.9 s, then gone. A first connect with the cache deleted faded the room in.
- A launch now keeps its picture up for the cache read: about a quarter of a second on the
  simulator with one room. On his phone, with every room cached, it is longer. That time used to be
  spent showing "No spaces yet", and the 1.5 s cap bounds it.
- If a hello lists a room the store then fails to read (a backfill that fails), the list holds
  placeholders until the next hello. It only does this while there is no room to show.
- Not yet seen on his iPhone (iOS 27, 120 Hz).

## Addendum: the Mac and the web, 6 October 2026

On his "yes fix Mac as well" (and "this would apply to Web as well right?"; it does, the Mac app
is the web app's own copy), the desktop takes the same states, built rather than mocked since the
phone's were already picked:

1. **The rail's mark wears the connection** (`apps/web/src/app/Connection.tsx`, `RailMark`). The
   product's mark at the top of the rail was the one thing the desktop always shows and it said
   nothing; the only word on the connection was the pill in an open room's header. It now rests
   while connected, runs its pins while reaching, goes still and red when it cannot reach (pressed,
   it tries again, the store's `wake`), and after red is green with every pin lit for 900 ms. The
   settle and the beat are the phone's (`SETTLES_MS`, `BACK_MS`). Its tooltip and name say which
   server and since when. `ChipMark` in `@chipschat/ui` gains the `failed` and `back` looks.
2. **The space pane says what is going on** with no room to open (`NoRooms.tsx`): reaching, can't
   reach, asleep, each with the mark at 64 px and the address, Try again where it helps; and No
   spaces yet with who can start one and a gold Create a space. A browser the server no longer knows
   goes to pairing before it gets here.
3. **One new-space dialog for the shell** (`useNewSpaceDialog`): the rail's + and Create a space
   both open it, out of whichever was pressed, with the same draft and last pick.
4. **The rail holds places** for rooms the hello listed (`Placeholders`), breathing, and the rooms
   fade in over them (`useArrival`, once, set before paint).
5. The words both clients say move into core: `serverHost`, `lostWords` (on core's `agoWords`) and
   `startersWords`.

Walked in Chromium at 1280 × 800 against the worktree's web app (Vite, 5195) and a scratch chipsd
on 4495: No spaces yet with "Scout can start one", Create a space opening the dialog, the server
killed (the rail's mark red, its tooltip "Can't reach your server · 127.0.0.1:5195 · last connected
just now · press to try again"), a reload with the cache deleted and the server down (Can't reach
your server in the pane), and a restart (red, then green with every pin lit, then gold). The open
room's header keeps its Reconnecting pill.

## Addendum: trouble is said once it has lasted, 15 October 2026

With no room kept, can't reach and asleep now wait four seconds of trouble before they are said,
and until then the list says the server is being reached, which it is. A launch's socket missing
a try is not an outage. [ADR 0166](0166-the-device-keeps-who-is-who-and-the-agents-tab-waits-for-it.md#addendum-spaces-is-patient-too-15-october-2026)
has the detail. Rejected and removed are still said at once.

## Addendum: the mark stands inside Select, 31 October 2026

Arjun, 31 October 2026: "I want the loading icon on top right show within the select button
bubble on the left. We do a similar thing in a space when there is loading icon plus universe
icon showing at the same time."

When Spaces or Agents shows Select, the bar's mark no longer stands on its own beside it. It
comes into the Select capsule, on the left of the word, the way the mark shares a capsule with
Universe in a room (`MarkBeside`, `ListCorner` in `spaces/Selecting.tsx`):

- The capsule opens on its left first, and the mark fades in 120 ms later (`INTO_ROOM_MS`), once
  its room is mostly open, so it never draws over the word. Leaving, the mark fades and then the
  room closes. The word does not move either way.
- Inside, the mark has 11 pt on its left and 7 pt before the word (`BEFORE_A_WORD`); the word
  keeps its own 16 pt either side. Alone, the capsule is as it was, its word centred.
- With no Select in the bar (nothing to pick, or the Agents tab's other views), the mark stands
  alone as before. While the body says what the connection is doing, the mark stands down in
  both places, as decision 4 says.
- Tapping the mark opens its sheet; tapping the word, or the space around it, picks.

Later the same day, Arjun: "during cold start the bubble expands abruptly, rather than smoothly
with transition". Measured frame by frame on a launch, the capsule narrowed by 3 points over
120 ms and then grew 20 points in one frame: the mark's room was drawn only once the mark was in
it, so while the mark waited for its room only the padding moved, and the room came in at the
width it had reached. The room is drawn from the start now, empty until the mark arrives, and
the capsule grows from 78 to 100 points over a quarter of a second, never more than 3.3 points a
frame. Beside Universe it is the same room.

On his phone it still jumped: "it still opens abruptly, and it looks more like frame drops". The
room is layout, and it ran on React Native's JS driver, a frame at a time asked of JavaScript,
which a launch keeps busy. It runs on Reanimated now (`ui/MarkBeside.tsx`), each frame set on the
UI thread. Filmed on the simulator through a launch with the server slow to answer and
JavaScript kept three quarters busy: before, a frame every 33 ms and up to 8 points at a step;
after, a frame every 16 to 17 ms and at most 3.3 points, opening and closing alike. `useMarking`
now says whether the room is open, and `MarkBeside` moves it. The web's launch e2e
(`selectMark.spec.ts`) measures the capsule on every frame.

On his phone it still dropped frames: "the bubble expansion still has frame drops during cold
start". Measured on the phone itself, with a probe sending the UI thread's frames to the Mac
through three launches each: two and a half seconds in, where the room opened, the UI thread
itself stalled, frames 70 to 205 ms apart where they come every 8.3, and the room opened in three
to five of them. From 1.5 to 2.3 seconds the stalls came 100 to 250 ms apart; then none for most
of a second. JavaScript was idle through them. No motion drawn a frame at a time is smooth
through that, on any thread, so the room now waits until the frames have come on time for
300 ms, watched on the UI thread, and moves then; 1.5 s at the most. The mark is put in its room
at once and shown by it, coming up over the room's last part, rather than mounted 120 ms in
(`INTO_ROOM_MS` is gone). Measured the same way: the room opened over 30, 23 and 30 frames, every
frame on time but one of 34 ms, at most 4.4 points a step. Closing, as the connection comes up,
can still lose a frame or two in the launch's second busy spell, as it did before.
