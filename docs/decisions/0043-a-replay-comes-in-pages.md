# 0043. A replay comes in pages

7 September 2026 · Status: accepted

Decided in Phase 4 · Mobile and the relay, for M4.2 ("the replay batched"). The plan's
acceptance for the phone is *a fresh pairing against ten thousand messages, on screen in under
five seconds*.

## Context

A subscription with `since` replays the log the client has not seen. The server reads it from
the store 500 rows at a time and sends **one `event` frame per event**: ten thousand messages is
ten thousand WebSocket frames, each one a separate `onmessage`, a separate `JSON.parse`, a
separate dispatch. On a laptop that is merely wasteful. On a phone, over the relay, it is the
difference between a pairing that feels instant and one you watch.

The frames themselves are the cost, not the bytes: the same events in a hundred frames are the
same JSON.

The obvious move — send an array — is not safe on its own. Today's client drops a frame whose
name it does not know, in silence (`handleFrame`'s `default`). A server that started sending
pages would leave every older client with an empty screen and no error to explain it.

## Decision

1. **A new server frame, `events`, carries one store page**: `{ frame: "events", events: [...] }`,
   up to 500, in `seq` order. One frame per page the store returns.

2. **The client asks for it in `hello`.** `accepts` is an array of the server frames beyond the
   base set that this client understands — `["events"]` today. A client that says nothing is sent
   what it was always sent, one frame per event. This is cheaper than a protocol version bump: it
   is a capability, not a dialect, and the next frame that wants negotiating adds a word rather
   than a version.

3. **Only the replay is paged. Live events stay single `event` frames**, because they arrive one
   at a time and there is nothing to gather.

4. **Nothing else changes.** Every event in a page has been through the same checks a single
   delivery makes: the cursor, `canSee`, the membership it teaches, whether it is meant for this
   harness, and the shape it goes out in. An event this viewer may not see still moves the
   cursor, so the next one it does see never looks like a gap. A page with nothing in it for this
   viewer sends no frame at all.

## Consequences

- `deliver` becomes the sending half of `prepare`, which is what a page collects. That put one
  more microtask between an append and its delivery; `Session.settled` — the promise
  `onSubscribe` already waits on — is how a test waits for a delivery now, rather than on the
  shape of the call stack.
- A page counts as **one** frame against `maxUnackedFrames`, so a client is far less likely to be
  disconnected as too far behind during a replay. That is the intended effect, not a loophole: the
  limit is there to stop one slow reader holding the server's memory, and a page holds it for
  less time than five hundred frames do.
- `receiptToHarness` is per event and only for harnesses, which never ask for pages.
- **It made an old bug certain, which is how it was found.** The web's message list is windowed,
  and the browser's scroll anchoring moved `scrollTop` as its spacers were re-measured, which the
  list read as the reader scrolling back and stopped following the end. It was the intermittent
  scale-spec failure carried since Gate 3; a page changes far more heights at once, so it went
  from occasional to every time. `overflow-anchor: none`, and the list does its own anchoring.
- Measured on this machine: a fresh pairing against a thousand messages falls from **1,986 ms to
  929 ms**, and the ten-thousand-message windowing spec from 17.7 s to 5.9 s. The phone's own
  number is M4.2's to record.

## Alternatives considered

- **A protocol version bump.** Heavier: every client would have to move together, for one frame.
- **Send the array unannounced.** Silent breakage for every client that has not shipped yet.
- **Compress the socket instead.** Fewer bytes, the same ten thousand parses and dispatches. The
  frames were the cost.
