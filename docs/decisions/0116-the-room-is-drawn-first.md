# 0116. The room is drawn first

Date: 4 October 2026
Status: Accepted. Builds on 0115.

## Context

After ADR 0115 a send's words wait at the field for the room to draw their line, then rise with
it. Arjun asked to work on what that left. First: the beat before anything moves. It measured about
105 ms from the tap on the simulator, and every bit of it was JavaScript drawing the room.

Release Hermes keeps its sampling profiler from JavaScript, so the walk counted instead. A probe
timed each store flush from start to React's commit. A stand-in for React's DevTools hook, which
the production renderer calls on every commit, counted the components drawn in each commit, by
the route they stand under. The room was a scratch copy of the live database, with a scripted
harness answering as Jacobian does.

Every event the store heard drew about 5,400 components and took 80–170 ms of the JavaScript
thread. The new line, the server's answer and the harness's run starting each did it:

- **The tabs under the room: 4,400.** Agents 2,195, Spaces 1,245, You 960. They stay in the tree
  under a room opened from them, so a swipe back finds them drawn. Each read the store as the room
  does, so React drew them in the same pass as the room, in front of the send's line. Freezing them
  is not on offer: on Fabric, native-stack never freezes the screen under the top one, since a
  frozen screen is hidden, and a swipe back would uncover a blank.
- **The room: 600–1,180.** Every row's cell, its transition, its turn and its flash, about 46
  rows, on every render of the list. A FlatList not in `strictMode` hands each row a new
  `renderItem` on every render, and the room's was new on every event anyway, since it closed
  over the space. Every row object was new as well (`groupLines`).
- **Sixteen lines drawn whole, words parsed again, on every event.** Core froze every run in a
  space afresh for any event in it, so every line that closed a run had a new `run`, and its memo
  never held.

## Decision

- **The tabs read the store at transition priority** (`useDeferredSnapshot`). React draws them
  after whatever is urgent, in slices it can set aside. A room, or a tab in front, is drawn the
  moment its news arrives, and the tabs are still up to date by the time anyone looks at them.
- **Core hands back the run it froze last time while nothing in it has changed** (`freezeRun`,
  `sameRun`). The fold changes a run's lists in place, an element at a time, so a frozen run now
  holds copies of its lists, and "the same" is judged element by element. Until now a frozen run
  shared the fold's own lists and changed under its readers.
- **The room's list draws a row once, and again only when what it draws has changed.**
  - Its `renderItem` is one function for the room's life (`renderRow`).
  - The list is in `strictMode` (passed through a spread, since React Native's types do not name
    the prop yet).
  - Each row is the same object while it says the same thing (`useRoom`).
  - A row reads what changes room-wide from a context (`RoomRows`) and is memoised on what it
    draws (`TurnRow`): its line and place, its run, lane and route, whether it is busy or
    flashed, and what every row draws the same way.

## Consequences

- Counted on the simulator, the same send:

  | | Before | After |
  |---|---|---|
  | The send's tap | 631 components | 141 |
  | The server's answer, the run starting | 670–1,180 in the room, plus the tabs | ~272, with no row redrawn |
  | The landing | 616–676 | 146 |
  | The new line | | the room commits 20 ms after the store hears it; the tabs are drawn after |

  The words set off about 50 ms after the tap, where they set off at 105 ms.
- A new line still draws every row's cell once, because the list gives each row its index and a
  row put in at the foot moves every index. The turns and lines inside do not draw again.
- The tabs still draw on every event, now after the room and in slices. A long run of events, a
  harness logging steps every tenth of a second, can keep setting their draw aside. React then
  finishes it at once after five seconds. That is a pause of a tenth of a second on the
  JavaScript thread, and none on the screen.
- What a phone at 120 Hz makes of what is left can only be measured on the phone.
