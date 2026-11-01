# 0166. The device keeps who is who, and the Agents tab waits for it

Date: 14 October 2026
Status: Accepted, 14 October 2026. Changes what the cache holds (`Cache`, core and the phone),
what the store's snapshot says about the directory, and what the Agents tab and page show before
it is known. Takes [ADR 0131](0131-a-list-says-it-is-empty-only-when-the-server-has.md)'s rule to
the agents.

## Context

Arjun, on his iPhone: "I see this odd screen when I cold start and quickly switch to Agents tab".
The tab said "Agents · 0", "No agents yet. Add one here, or allow one that asks.", "No harnesses
yet." and offered Add an agent, with the two empty lines a screen-name's height below their
headings.

The Agents tab draws the directory and nothing else: J, the agents and the harnesses all come from
`GET /v1/participants`. The rooms are kept in the cache (ADR 0049), but the directory never was.
A launch asked for it only after the cache had been read, and until the answer came (longer through
the relay) the directory was empty and the tab said so. Offline it said so until the server came
back. The Mac and web page did the same ("No harnesses yet." under its name and in the rail), and
an agent's or a harness's page opened before the answer said "This workspace has no agent by that
name on this phone". A launch's read that failed before the socket found its way through was not
tried again until the next reconnect.

Two fixes were offered: A, say nothing until the server has answered; B, keep the list on the
device, so a launch lists the agents at once, with A's rule for the first launch. He picked B,
"and a proper screen / loading screen for the first load case. It needs to be highly polished
and functional". A mock (kept out of the repo) showed that first load two ways: A, Spaces'
breathing placeholder rows; B, blank agent chips with the working light running round their pins,
row after row. B was built, as recommended, and on 15 October 2026 he picked it: "go with B for
the Agents loading screen".

## Decision

1. **The cache keeps the server's last answer** (`loadParticipants` and `saveParticipants`, in
   IndexedDB's `meta` and the phone's SQLite `meta`). The rows are kept as they came and read
   through the same `participantOf` as the server's, so a later build reads them its own way. A row
   that no longer reads as one is left out. `undefined` means never answered, which is not the same
   as an answer with nobody in it.
2. **The store lists what it kept before it folds the history**, so names are right from the
   first frame. Every successful read is saved. An answer that lands while the cache is still being
   read is newer and is not replaced. The snapshot says `directoryFrom` (`cache` or `server`;
   absent before any answer) and `directoryFailed` (the last read did not land). The first hello
   reads again when the launch's read failed.
3. **Core decides what the Agents tab shows** (`agentsLook`, beside `emptyList`):
   - `reading` while the cache is read.
   - `listed` once the directory is the server's word, now or kept, offline too. "No agents yet"
     is said only here.
   - `fetching` while this device has never had the server's word.
   - `failed` when the server is there and the answer did not come.
   - Otherwise the connection (`closed`, `asleep`, `rejected`). `removed` is said whatever the
     directory holds, as it is over the rooms (ADR 0160).
4. **The first load on the phone** (`agents/Arriving.tsx`): rows in the rows' own shape, a Main
   agent's place first, under the real headings without counts, and two blank harness cards. Each
   face is a blank agent (`BlankFace`): the bitten chip, flat in the page's quiet colour, its pins
   in the ink, with the light that runs round a working agent's pins running round these. Each row
   starts 140 ms after the one above (`useTurns` takes a `delayMs`). The bars are flat and still,
   so the pins carry the motion (Arjun, 25 September 2026: flat controls, the cool goes into
   motion). Reduce
   Motion holds the pins still. The list fades in over it (`Arrive`, as Spaces' rooms do), and a
   list that was there from the first frame does not fade.
5. **Why it cannot be had** uses Spaces' words and mark (`NoRooms`' `Telling`, now exported),
   with the agents in place of the spaces: "Your agents will show here as soon as it answers."
   While the body says it, the bar's mark stands down. `failed` says "Couldn't load your agents"
   with Try again, which reads again (`refreshDirectory`), the mark working while it asks.
6. **Empty sections sit under their headings** (`None`), not a screen-name's height below them
   (`Empty` is for a whole empty screen).
7. **An agent's or harness's page waits too** (`NotFound`): blank while the list is on its way,
   "This agent will show here once your server answers." when it cannot be had, and "no agent by
   that name" only once the server has said who is who.
8. **The Mac and the web take the same states** (`AgentsWaiting`, `Agents.tsx`): blank rows in the
   row's own grid, with `ChipMark`'s new `blank` state and a `delay` per row, blank cards, the
   same words for can't reach, asleep and failed, and no Add an agent or count until listed. The
   rail's "No harnesses yet." waits for the list too (`listed`).

## Consequences

- Every cold start after the first lists the agents at once, offline too, and names everybody in
  the rooms from the first frame rather than as shortened ids. The first-load screen is seen just
  after pairing, and once on each device after this ships, since no cache holds the list yet.
- A kept list can be a launch out of date (an agent archived elsewhere since). The store reads it
  again at every launch and every reconnect, as before, and the tab redraws when the answer comes.
- Proved by: core's `store.test.ts` ("who is who, kept for the next launch": six tests, two of
  them shown to fail with their guard taken out) and `emptyList.test.ts`; the phone's
  `Agents.test.tsx`, `Profile.test.tsx`, `sqlite.test.tsx`; the web's `AgentsWaiting.test.tsx` and
  `mark.test.tsx`; and two Playwright specs that hold `/v1/participants` back:
  `apps/mobile/e2e/agentsFirstLoad.spec.ts` and `apps/web/e2e/agents-first-load.spec.ts`. Each
  checks the blank rows with no "No … yet", the list arriving, and a reload listing at once from the
  cache while the server holds the read. Screenshots were read in light and dark.
- Not yet walked on a simulator or his iPhone (the pin light runs on the native driver there).

## Addendum: a launch's blip is not trouble, 14 October 2026

On his iPhone, through the relay, the first load went: the blank agents, then "Couldn't load your
agents", then the agents. The launch's read of the list goes out as soon as the cache is read,
before the socket has found its way to the server. Through the relay it failed, and was counted as
`failed`. From the moment the socket opened until the hello's read came back through the relay,
about a second, the tab said the list could not be loaded. 4431's log showed his device's socket
closing and opening again three times in its first seventeen seconds, and each gap would have said
"Can't reach your server" too.

1. **A read that fails before the socket is open is not a failure** (`missedDirectory`, core). It
   is owed, and read at the hello. `directoryFailed` is now only a read that failed with the socket
   open, and then only after the store has tried twice more itself, two seconds apart, while
   nobody is known (`DIRECTORY_RETRIES`, `DIRECTORY_RETRY_MS`).
2. **The first load is patient with trouble** (`patientLook`, `AGENTS_PATIENCE_MS`, core). Can't
   reach, asleep and failed are said once they have lasted four seconds, timed from the first
   trouble since the list was last on screen, so a socket going out and back with every try does
   not restart the wait. Until then the blank agents stay. Once trouble has been said, a new try
   says "Reaching your server", rather than going back to blank agents and out again. Rejected and
   removed are said at once: waiting cannot change them. Each app times it (`useTold`).
3. The phone's Playwright spec gained the case: the first read refused, the next held five seconds,
   and nothing on the page ever says "Couldn't load" or "Can't reach". Against the old code it
   fails, on the first-load screen showing "Couldn't load your agents".

Spaces' body (`NoRooms`, ADR 0131) says "Can't reach your server" at once as well, but it only does
with no room kept: just after pairing, or an empty workspace offline. Not changed here.

## Addendum: Spaces is patient too, 15 October 2026

On his "fix the Spaces tab the same way too if it has the same issue": it did. With no room kept,
just after pairing or on the first launch after a cache is cleared, the Spaces list said "Can't
reach your server" the moment a launch's socket missed a try, for the second or two until it was
through. The space pane and the rail on the Mac and the web said it too.

1. **Core's `patientEmpty`** gives the list's look (`emptyList`) the Agents tab's patience: closed
   and asleep are the server being reached ("Reaching your server", the mark working) until they
   have lasted four seconds. Rejected and removed are said at once. The wait is timed from the
   first trouble since there were rooms, or the server's word that there are none, so a socket
   that goes out and back with every try does not restart it. With rooms kept nothing changes:
   the rows are on screen and the bar's mark keeps its own short settle.
2. **One patience for both lists.** `AGENTS_PATIENCE_MS` is now `PATIENCE_MS`, and `troubled`
   takes either look. Each app's timer is one hook, `usePatience(over, trouble)`
   (`apps/mobile/src/ui/usePatience.ts`, `apps/web/src/app/usePatience.ts`), which the Agents tab
   and Spaces both use. On the web the shell works out the look once (`usePatientEmpty`), so the
   pane and the rail say the same thing.
3. **Proved by** core's `emptyList.test.ts`; the phone's `List.test.tsx` (the blip, the wait
   timed from the first trouble, rejected said at once); the web's `Shell.test.tsx` (pane and
   rail); and two Playwright specs that refuse the launch's first two socket tickets, so the
   socket is through after three seconds: `apps/mobile/e2e/spacesFirstLoad.spec.ts` and
   `apps/web/e2e/spaces-first-load.spec.ts`. Each records everything the page says and expects
   only "Reaching your server". With the patience taken out, the phone's two tests of it, the
   web's and both Playwright specs fail, on "Can't reach your server".

## Addendum, 16 October 2026: the faces chosen for rooms are kept and read again too

Arjun, the night ADR 0176 went on his iPhone: "how is it that when I changed the theme, all the
space icons with images switched to text". The theme had nothing to do with it. The faces a person
chooses for their rooms (`GET /v1/me/space-icons`) are not on the log, so nothing replays them,
and the app read them once, when the Spaces list (or the web's shell) first drew, with no copy
on the device and a failure swallowed. After the fresh install his phone started through the
relay while 4431 was restarting; that one read failed, and every room's picture stood as its
letters until the app was closed. The server still held all fourteen.

1. **Kept on the device, as who-is-who is.** `Cache.loadSpaceIcons` / `saveSpaceIcons` (IndexedDB's
   `meta` on web and the Mac, SQLite's on the phone, key `space-icons`). The store draws what it
   kept as it starts, before the server answers, and keeps each answer and each pick.
2. **Read by the store, not by a screen.** The store reads them as it starts and again at every
   hello after the first, so a face picked on another device comes in at the reconnect. A read
   that fails before the socket is open is owed to the hello; one that fails with it open is tried
   twice more two seconds apart, then left to the next hello. What the cache held stays meanwhile,
   and nothing is said: a room without its picture still reads. The list's and the shell's own
   one-off reads are gone; `loadSpaceIcons` remains as "read again now", sharing the store's one
   read at a time.
3. **A pick on its way wins over a read that lands meanwhile**, and a refusal puts back that room's
   face alone rather than the whole map as it stood when the pick was made.
4. **Proved by** core's `store.test.ts` (kept faces drawn before the server answers, the hello's
   read after a failed launch read, the two tries, the reconnect's read, a pick over a late read),
   the phone's `sqlite.test.tsx`, and `apps/mobile/e2e/facesKept.spec.ts`, which refuses every
   read of the faces across a relaunch and still finds the room's picture.
