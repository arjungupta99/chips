# 0153. The tunnel says what it has taken, and a reader that stops says so

Date: 12 October 2026
Status: Accepted, 12 October 2026.

## Context

[ADR 0152](0152-a-large-file-through-the-relay-holds-neither-the-tunnel-nor-the-phone.md) went
live on 12 October (4431 restarted, his iPhone rebuilt) and left two gaps, which he asked to have
fixed ("After that fix the gaps"):

1. **An upload through the relay was not paced.** The phone sends a file in 4 MB pieces, each
   awaited, and each piece's frames went out at once: everything else the phone sent waited
   behind the rest of the piece. The server's answers are paced by its socket's
   `bufferedAmount`; the phone cannot pace that way, because React Native's WebSocket declares
   `bufferedAmount` and never sets it.
2. **A download nobody wanted any more was sent to the end.** Closing the viewer, or paging on,
   left the phone reading the clip to the end (core read every download whole), and a reader that
   did stop only let the rest fall on the floor at the phone: the server, and the relay, and the
   phone's data plan, carried it all.

Measured with `pnpm relay:bench` against the live code (3 MB/s each way at the server's link,
75 ms): a small request sent during a 16 MB upload waited up to 1.54 s (idle 0.31 s); a small
request sent a second after letting go of a 40 MB download waited 1.28 s, behind the rest of the
file still coming.

## Decision

Three frames join the tunnel (`packages/tunnel/src/mux.ts`), each ignored by an end from before
this, since a header this end does not know is not acted on:

- **`window`** (id 0, `bytes`): the answerer's word that it acknowledges what it takes, and how
  far a body may run ahead of its acknowledgements: `UPLOAD_WINDOW_BYTES`, a megabyte, which
  keeps a 3 MB/s uplink full across a 300 ms round trip. **Said once, in answer to the caller's
  first frame, never before.** A phone finishes its half of the handshake before it listens on the
  channel; the first build of this said its window as the channel opened, the frame arrived in
  that gap and was lost, and every frame after it failed to decrypt (`not_authenticated`). The
  bench found it before it went anywhere. The caller having spoken is how the answerer knows it
  is listening.
- **`ack`** (`id`, `bytes`): how much of a request's body the answerer has taken, every 128 KiB.
- **`cancel`** (`id`): a caller that stopped reading an answer.

The **caller** paces a request's body once it has heard a window: frame by frame, never more than
the window past the last ack. A body no larger than the window, or one sent before any window was
heard (a server from before this says none), goes at once as before. A stream the caller's reader
cancels sends `cancel`.

The **answerer** acknowledges as bodies arrive, and on `cancel` stops: a streamed answer stops at
its next frame and its source is cancelled (the file closes), and an answer not yet sent is not.

**Core** lets a download go: `fetchAttachmentWithType` takes a `signal`; aborted, its reader
cancels (which, through the relay, is the `cancel` above) and it rejects with an `AbortError`.
**The phone**'s `files.play` takes the asker's signal. A download is shared by everyone who asked
for it; it stops only once every asker that gave a signal has let go and none asked without one,
and it is then forgotten, so asking again starts it again. The viewer's video lets go when it
closes or pages on.

## Consequences

Measured with the same bench, two runs:

| | Before | After |
| --- | --- | --- |
| A small request during a 16 MB upload | 0.54–1.54 s | 0.31–0.47 s |
| The upload | 2.22 MB/s | 2.21 MB/s |
| A small request a second after letting go of a download | 1.28 s | 0.31 s |

- **Old and new mix.** A phone from before this hears a window and acks it does not know and
  drops them; it never cancels, so a server sends it everything, as before. A phone after this
  talking to a server from before hears no window, so sends bodies whole, and its `cancel` is
  dropped. Both halves need their build: 4431 restarted for the server's side, `pnpm phone` for the
  phone's.
- **The first request's body is not paced**: no window has been heard yet. A phone's first frame
  is its socket opening, so in practice every upload is.
- **A video paged away from and back to starts its download again** from the first byte, through
  the relay. A download resumed by range is possible (the server answers ranges) and not built;
  on the network the player streams from a grant and none of this applies.
- **Any frame an answerer sends unasked must come after the caller has spoken**: the rule the
  window learned, written beside it, and a test (`says nothing before the caller has spoken`).

## Addendum, 24 October 2026: answers paced by what the phone has taken

**What happened.** On his iPhone on 5G, through the hosted relay, Terra Fab Research's
Synchrotron page (1.24 MB, built into one document) never opened, and the room's Files then never
loaded. 4431's log showed the page asked for at 12:25:55, 12:26:04 and 12:26:12, the socket closed
39 seconds after the last, and the same again after each reconnect. From this Mac through the
hosted relay with the link held to 30 KB/s, the files list waited 38 seconds behind one copy of
the page. The server paces an answer by its own socket's backlog (ADR 0152), but a relay takes
what that socket sends and holds up to 4 MiB for a slow phone, so the backlog the server reads
stays empty. Every page asked again added its megabyte to the queue, every other answer and the
socket's own frames waited behind it, and after 60 seconds of hearing nothing the phone gave the
connection up and asked for the page again.

**Decision.** The caller says, before its first frame, that it acks answers (`window`, id 0, with
`ANSWER_WINDOW_BYTES`, 4 MiB: the most it holds), and acks what has come of each answer every
64 KiB and at its end. The answerer then keeps the answers on their way, all of them together,
within about a second of what the caller has been taking, measured from those acks, never under
128 KiB, which is also where it starts. A body in hand longer than one chunk goes out as it is
read, so it waits like any other. An answer counts until the caller has taken all of it; one that
failed or that the caller cancelled stops counting at once.

**Measured** on this Mac, a client on core's own relay link through a local relay, two copies of
the page asked at once and the files list three seconds later:

| | Files list | Both pages |
| --- | --- | --- |
| 30 KB/s, before (one copy of the page, hosted relay) | 38 s | 41 s for one |
| 30 KB/s, a fixed 512 KiB window | 21 s | 82 s |
| 30 KB/s, about a second of what the phone takes | 8 s | 82 s |
| 8 MB/s phone link, 2 MB/s server uplink, 240 ms round trip | 0.46 s | 3.1 s |

**Old and new mix.** An answerer from before this hears a `window` and `ack` from the caller it
has no use for and drops them, sending as it always has. A caller from before says no window, and
the answerer never waits on it. The server's side needs 4431 restarted; the phone's, its build.

**A page given up on.** A request may carry its caller's `signal`, as `fetch` takes one. Aborted
before all of its answer has come, the request fails there with an `AbortError` and the caller
sends `cancel`, as a reader that stops reading does, so the answerer sends no more of it, or none
at all if it was still building the page. Through `getBytes`, the store's `projectPage` and
`projectFile`, the phone's page sheet and Universe give their reads up when they close, so a page
nobody is waiting for no longer holds a share of the window. Nothing new goes over the wire, and a
server from before stops on `cancel` as it already did.

**Many small answers at once** (later on 24 October). Foodie's photos stopped loading on Arjun's
iPhone through the relay. Opening the room asked for its albums' thumbnails at once, 13 to 47 KiB
each. Every frame of an answer, its end included, waited for room in the window. The caller acks
an answer only every 64 KiB of it or at its end. So once 128 KiB of small answers were in flight,
none could end and none could be acked, and every read on the tunnel after them waited with them.
Now a frame goes out whenever its own answer has less than 64 KiB on its way that the caller has
not acked. Each answer can always reach its next ack or its end, and a large answer is held as
before. With many answers at once the window can be overrun by up to 64 KiB per answer. A test of
ten answers that are never acked fails without the change. The fix is on the server's side only,
so it reaches every phone once 4431 is restarted.

**What a caller's acks may cost** (25 October 2026, the second security review's SEC-43). The
answerer measured the caller's take rate from every ack of the last two seconds, rebuilding that
list on each one, and counted every answer it sent until the caller acked all of it. A stranger
holding the server's key could open one tunnel, say its window, draw refusals and stream small
acks: each cost more than the last, and some 10,000 a second held the server's one event loop.
Now the rate is kept as one mark per 50 ms over the same two seconds, at least two, a few dozen
however fast acks come; the bytes in flight are a running total, not a walk over every answer;
an ack counts no further than what was sent; and a finished answer the caller is silent on for a
minute is forgotten, as is the oldest once more than 1,024 wait on their last ack. Forgetting
only ever makes room, so none of it can hold an answer up. A test of 50,000 acks
inside one second, which took 6.8 s before, now has half a second to run in. The server's side
only: 4431 restarted.

