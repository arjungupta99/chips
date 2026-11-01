# 0240. A person pins a room to the top of their own list

Date: 27 October 2026
Status: Accepted, 27 October 2026, on Arjun's "Go with A" on the mock. Builds on ADR 0205 (Hide),
whose side of the swipe and whose way of keeping a person's own choice it shares. Select (ADR 0181)
is unchanged.

## Context

Arjun, 27 October 2026: "I need an ability to pin spaces in the spaces tab. The option to pin should
be present in the row item slide options, on the left side. Mocks first".

The Spaces list stands its rooms by their last message, the Main room among them. A room he wants
to find in the same place every time, say Bills, sinks under whatever is busy. A row pushed right
already offered Hide (ADR 0205): the acts that touch only the reader's own list sit on that side,
and Archive and Delete, which everybody sees, sit on the other.

The mock (<https://claude.ai/artifact/2pRiCfJJmzQTCCcnxvpTtg>) ran today's list and three ways for a
pinned room to stand, each on Bills: A, its row lifting and gliding to the top of the list with a
small pin before its time; B, the same rows under a Pinned heading; C, a row of big faces across
the top, as Messages pins conversations. It offered Pin's colour in gold, orange or teal, and a
table of rules for all three. He took A. Gold and the order of pins (newest first, fixed) were the
mock's recommendations, taken with it.

## Decision

1. **A pin is a person's own, kept beside their hidden rooms.** `pinned_spaces` (migration 0057)
   holds one row per person per room with when it was pinned. `GET /v1/me/pinned-spaces` answers
   `{ spaces }`, the newest pin first; `PUT` and `DELETE` on `/v1/me/pinned-spaces/:spaceId` pin and
   unpin one, for a room the caller is in (`not_found` for any other). Pinning one already pinned
   keeps its place. Nobody reads or writes another person's. The store reads them from the device's
   cache as it starts and from the server at every hello, and carries them on the snapshot
   (`pinnedSpaces`, newest first). A pin changes the list at once; one the server refuses is put
   back where it stood among the pins (`pinnedAsBefore`) and said.
2. **A row pushed right offers Pin first, then Hide**, and a pinned row **Unpin**, then Hide. Pin
   is the outermost disc, so it is the first a thumb uncovers. It is Chips' gold with the ink
   Select's Read wears on it (`actTone`, `actInk`); its pin's head pushes in once the disc is clear,
   and Unpin's pulls up and drops back. Neither asks first.
3. **Pinned rooms stand first in the open run, the newest pin on top, and keep their places**
   whatever is said in them or under them (core's `listRuns`, which the phone and the rail both
   use). The rest follow by their last message, as before. A pinned row wears a small pin, leaning,
   before its time, in the time's grey; nothing else about it changes.
4. **The row glides there.** Pinned or unpinned, the row goes home, lifts a little on a shadow, and
   glides to its new place while the rows it passes glide out of its way (`Glide`, a Reanimated
   layout transition). The list arms the open run's rows for that one move only, a beat before the
   pin is asked, since a row takes up a layout transition only after the draw that gave it one, and
   disarms them after: a room rising with a new message, or a row folding or landing, moves as it
   did. The rail glides the same way (`usePinGlide`, the Web Animations API). Reduce Motion makes
   both a jump.
5. **Who may pin** (`mayPinRoom`, `pinAct`, core): anybody in the room, a guest too. The Main room
   may be pinned, unlike Hide, and so may a locked room: a pin changes nothing for anybody else.
   Not a thread. Pin and Unpin are offered only in the open run: a hidden or archived room offers
   neither and draws no pin, keeps its pin all the same, and comes back pinned when it is unhidden
   or unarchived.
6. **On the web and the Mac the rail has no swipe**, so Pin and Unpin stand at the room sheet's foot,
   before Hide (`pin-space`, `unpin-space`). The sheet stays: the room is still in the rail, in its
   new place.
7. **Nothing else changes.** Unread counts and notifications are as they were. Select is unchanged,
   with no Pin in its bar for now. There is no limit to how many rooms are pinned, and dragging pins
   into another order can come later.

## Consequences

- One more table beside the log, which a rebuild does not touch and which an erase clears with the
  room's faces and hidden rows.
- A pin made on the phone reaches the Mac at its next connect, as a hide does.
- A server older than this answers the routes `404`: the pin is put back, and the phone says the
  server is older than the app.
- The design system's icons take the phone's `pin` (it was the phone's own, for a message's Pin) and
  a new `unpin`, the pin struck through.
- Proven by the server's route, migration and erase tests, core's store and rules, the phone's list
  and cache tests, the web's Shell tests, and `apps/web/e2e/the-pinned-room.spec.ts` against a real
  server (Pin from the sheet's foot, first in the rail with its mark, a second browser of the same
  person reading it from the server, Unpin). The swipe, its gold disc and the glide are the
  simulator's to walk.
