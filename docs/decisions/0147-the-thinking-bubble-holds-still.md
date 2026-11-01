# 0147. The thinking bubble holds still

Date: 10 October 2026
Status: Accepted, 10 October 2026, on Arjun's "go with opens at first call and C3, build it".
Changes the thinking bubble on the phone (`Thinking.tsx`) and the Mac and web (`SpaceView.tsx`,
`Doing.tsx`). Replaces points 3 to 6 of ADR 0126; its lit dots and its still face stand. A queued
turn's bubble (`TaskBubble.tsx`) is unchanged.
Point 8's header and run panel say no state since ADR 0151.

## Context

Arjun, 10 October 2026: "The Chips loading bubble for Jacobian is super Jumpy … it switches
between "writing", "...", "partial cut off text", and more … Open claw loading basically "..." so
overall would like to see useful loading information without the jumpiness."

Real turns from the live database were replayed into a scratch server and filmed on a simulator,
frame by frame. The bubble was one slot of text that four voices took turns to write:

- a line of reasoning (`run.status`, about two hundred characters);
- Jacobian's `Writing…`, sent before every tool call and replaced in a median 17 ms (280 sends);
- the reply's first words as they streamed, 86 of 180 of them interim words before a tool call,
  the rest the opening of the reply, shown cut off and then said again whole when it landed;
- the call in hand, which usually came back in milliseconds.

Each rewrite rolled the words and fired the sheen, and the key included the call count, so a call
alone rolled the same words again. The bubble took each state's size, from 54×37 dots to a 308×93
pill to 109×37 *Writing*: fourteen shapes in the 45-second LEGO turn, the person's message moving
642 points, the shortest state on screen 0.46 s. OpenClaw names no step, only a tool and, as each
ends, a summary, so its bubble stood at dots with a call pill blinking in.

Mocks, phone width, replaying the same turns: <https://claude.ai/artifact/3qJfhBjoXSxv9QCAZ25K5q>
(kept out of the repo). He picked **C**, a fixed bubble with a strip of glyphs; of four ways for the
strip to outgrow its width, **C3**, repeats folding together; a **neutral** lit glyph ("for the
strip highlight square I need a neutral color"); and of two ways to use the strip's row before the
first call, **opens at the first call** over his own idea of a two-line detail, which the mocks
showed would leave a line standing empty for 4 to 7 seconds of most Jacobian turns (59 of 98 turns
with calls said nothing but `Writing…` before the first, a median 10.3 s in).

## Decision

1. **One shape, three parts, each with one job** (core's `bubbleSays`):
   - the **label**, on the top line beside the dots: what kind of work this is, read off the
     tool and never off the harness's prose — *Searching the web*, *Reading a page*, *Running a
     command*, *Checking memory*, *Thinking*, *Writing*, *Still working* — and a **clock**, m:ss
     since the run began;
   - the **detail**, under it: what the call was given beside its glyph, a thought's first
     sentence, OpenClaw's summary of a step as it ends, a harness's still-going words, or a tally
     (*4 searches · 2 pages so far*). Still-going words keep the mark they lead with: Jacobian's
     ⏳ says the line is its pulse, as it does in Telegram (Arjun, 10 October 2026: "that ⏳ emoji
     is needed … that is an indicator that pulse is active"), so *⏳ Round 15 of 30*. They lose
     the age they carry (*⏳ Waiting on the model*, from `still on your message, 5m — waiting on
     the model` or `waiting on the model, 2m`): Jacobian says a line once, when what it is about
     changes, so the age stood still beside the ticking clock;
   - the **strip**, from the first call: a glyph a call, in order.

   Every tool Jacobian (32) and OpenClaw (10) called between 26 September and 10 October 2026,
   1,428 calls, is one of nine kinds: page, search, file, command, memory, image, edit, hand-off,
   email. A tool nobody has named is said by its name and drawn as a dot, or as a kind its name
   gives away. A file the room sent is *a photo/file from the room*, never Chips' id for it.
2. **Words hold.** A new label waits until the one shown has stood 1.5 s, a new detail 1.1 s, and
   only the latest wish waits (`holdSays`). A finished call with nothing begun since goes back to
   *Thinking* after 3 s, keeping its detail, counted on the device from when it saw the call end.
3. **`Writing…` alone is not read**, and the reply is never previewed. The fold keeps a run's last
   real status apart (`Run.thought`): a status that is one word and its ellipsis is a ping. A
   harness writing says *Writing · after 9 searches*, or *Writing · the answer* before any call.
4. **Changes crossfade where they stand**: out in 120 ms, in over 200 ms from 60 ms, rising 3
   points. Nothing rolls and no light crosses the bubble.
5. **The bubble is one width**, the widest a bubble may be, and **opens once**: two lines when it
   comes, the strip's row opening with the first words said after the first call, on the room's
   transition. A turn that calls nothing never grows. The row stays open while the bubble stands,
   through the next run's start too.
6. **The strip folds** (`stripOf`, `fitStrip`): a run of one kind is one glyph and its count; the
   newest is lit in ink, not in the face's colour; when the glyphs outgrow the strip, the oldest
   fold into a `+N` at its start. It never scrolls or wraps. Calls show at least 90 ms apart, so a
   burst ripples in. Folded, the 107-call reading-list turn moved the strip 9 times where a glyph
   apiece moved it 96.
7. **What a screen reader hears is what is shown**: name, label and detail. The strip is hidden
   from it.

Core keeps what this reads: a step's `tool` and `summary`, a run's `thought`, and `Doing` carries
the run's id, its start and the calls made.

## Consequences

- Filmed on the simulator replaying the LEGO turn: one size change after the bubble came, 56 to
  80 points as the strip's row opened, the room moving 24 points with it; one size for the 39
  seconds after. The 107-call turn and OpenClaw's 38-call turn held one size throughout.
- OpenClaw says what it is doing: *Running a command · Research Terafab supply-chain evidence*,
  *7 commands · 9 pages so far*.
- A label set by tool can be less specific than a harness's own sentence. A harness that wants its
  words shown sends them as a thought (`run.status` with words), which becomes the detail.
- `CallPill` and `Rolling` are now only the queued turn's bubble's.

## Addendum, 10 October 2026: the words around the bubble, on the Mac and the web

Arjun, 10 October 2026, of the Mac app: "go through the loading bubble in the web flow. It needs
refinements and polish as well". Two of the live Terra Fab turns, replayed from the live database
into a scratch server and filmed in a browser at his window's size, showed the bubble steady and
everything around it still jumping:

- The header's pill, the run panel's and the sidebar's list of harnesses still said Jacobian's
  `run.status` as it came: a line of reasoning two hundred characters long, `Writing…`, and the
  reply's own first words (*Working · The desktop and…*), which point 3 had stopped the bubble
  previewing. The header's pill grew across it with each and folded the room's name to nothing,
  six times in an eighty-second turn, his *Terra Fab Research* standing on three lines.
- The bubble was 340 pixels, a third narrower than the replies beside it, so a thought showed
  forty-odd characters of a hundred and forty.
- OpenClaw's detail went from a step's summary to a tally (*2 commands so far*) as each call
  began and back to the next summary as it ended: thirty changes in fifty seconds. Its summary of
  a page it read was `from https://terafab.ai/ (max 24000 chars)`.
- The tally counted Jacobian's `tool_search`, nearly always its first call, as a search: *Writing
  · after 1 search · 8 commands* in a turn that searched nothing.

So:

8. **The bubble alone says what the work is.** The header's pill and the run panel's say the
   state, *Working*; the sidebar's list and a harness's card on the phone say the bubble's top
   line, held as the bubble holds it (core's `fleetDoing`: *Jacobian · Running a command*). A
   harness's `run.status` prose is said nowhere but as the bubble's detail. The header's name is
   one line, cut with an ellipsis, never wrapped.
9. **The bubble is the widest a bubble may be** on the Mac and the web too: a reply's 60ch, as
   point 5 meant.
10. **A call with nothing to say for itself keeps what the harness last said it was at** — the
    last summary that was not a page or file it read — and a tally only before it has said
    anything, so OpenClaw's detail moves once a call. Its `from <address> (max N chars)` is the
    page, said as an address beside a globe, or the file beside a page.
11. **A tally leaves out Jacobian finding its own way about**: `tool_search` and `space_boundary`
    are on the strip and in no count.

Filmed again on the same turns: the header one size and the name whole throughout, the bubble 422
pixels wide, *Writing · after 8 commands · 10 images*.

12. **The reply waits for its run to close** (Arjun, 10 October 2026: "yes hold the reply").
    Jacobian posts its reply and closes the run 30 ms to 1.1 s later; the close makes the line the
    answer, brings its receipt and takes the bubble away, so drawn as it came the reply stood over
    the bubble as a plain line and then the room moved again. A line the run's own author said in
    a run still at work (core's `saidMidRun`) is held up to `CLOSE_WAIT_MS`, 1.5 s, from when the
    room first sees it; the reply, its receipt and the bubble's going are then one change. A line
    still waiting when the time is up was a word said mid-run and is drawn as it is, the bubble
    working on under it. Lines there when the room opened are drawn at once. Filmed on the end of
    the 12:07 Terra Fab turn, whose close came 1.1 s after its reply: the bubble alone until the
    close, then the answer and its receipt in the same frame as the bubble goes. The phone holds
    the same lines (Arjun, 10 October 2026: "do the same reply hold on the phone";
    `spaces/heldReplies.ts`), before and apart from its hold while a send is in the air (ADR
    0072); `useThinking` already drops a stopped harness's bubble in the render its run ends, so
    the answer goes in as it goes. Filmed on the simulator replaying the same turn's end: without
    the hold the room moved twice, 16.9–17.7 s as the reply went in over the bubble and
    18.0–18.7 s as the bubble went; with it, once, 17.7–18.5 s, the bubble standing alone until
    then.

## Addendum, 14 October 2026: out of touch, the bubble rests

Arjun sent a message in "Garage door replacement" and put the phone away. Jacobian answered at
14:24:48 and closed the run 84 ms later; at 14:25:43 the relay let go of the sleeping phone. He
came back at 14:33 to the room still thinking, the bubble breathing, and the answer appeared only
when he left the room and came in again. Nothing reads a room again for being opened: the phone
had been catching up meanwhile — the old socket found dead, a second's backoff, a second and a half
on the server's own address that cellular cannot reach, then the relay, then the replay — and the
room drew what it had known as if it were still happening. On the simulator through a local relay
75 ms each way, the stale bubble breathed 3.3 s before the answer landed.

13. **Out of touch, the bubble rests** (his pick of three, 14 October 2026). While the socket is
    not open, and for `CATCH_UP_MS`, 0.8 s, after it is (`useInTouch`), the bubble's dots stand
    unlit and its clock stops: it says what was known when the server was last heard from, and
    nothing on it says the work goes on. It keeps its place, so an answer the catch-up brings goes
    in as the bubble goes, in one move (point 12); without the beat after the open the dots lit
    for a frame before the replay came a round trip behind and the bubble went. A turn still going
    lights them again. The phone (`ThinkingBubble`'s `resting`, `Dots`' `resting`) and the Mac and
    the web (`.doing-bub[data-resting]`) alike.
14. **Coming back replaces a quiet socket at once and still hears it** (core's `transport.ts`,
    `replace`). The socket found quiet on waking — or by the silence sweep — is given up on and the
    next opened in the same breath, not after the backoff its `onclose` would have waited for, and
    not after that `onclose` either, which a dead socket may never send. Nor is it closed until the
    next is open: a phone the relay let go of while it slept can still be holding the frames sent
    before it did, and is handed them a moment after it is told it is in front. Closed at once,
    they went with it and the answer waited seconds for the relay; heard, it was in the room 0.7 s
    after the app came back. The store folds each event once, by its `seq`, whichever socket
    brought it.

Left as it is, his call: the server's own address is still tried for 1.5 s before the relay on
every reconnect. Trying the relay alongside it after a short head start would save about 1.2 s on
cellular.
