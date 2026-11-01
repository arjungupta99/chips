# 0050. The phone's room is a conversation: a lane is its chain, and the receipt is asked for

11 September 2026 · Status: accepted

Decided in Phase 4 · Mobile and the relay, on Arjun's review of the phone's room against
Jacobian's real traffic (`docs/proposals/phone-polish.md`).

## Context

The phone's room was built from the desktop's rules, and the desktop's rules were built for a
wide screen and a harness that says one line. Jacobian is neither. It routes every message to
one of its Spaces as a lane, sets the lane's summary to the specialist's whole reply, and
completes its own run with the same reply; core folds that completion onto the reply
(`closeOnLastSaid`, Phase 3 review finding 9) and calls the result a summary. So in J's room a
question appeared twice — once as the message, once as the lane's goal on the route card — and
an answer twice — once inside the card as the lane's summary, once beneath it as the run's green
summary bubble — with a *Done* pill that never left, a "1 step · 1m 02s" box under every reply,
and every reply on the green ground meant for a summary standing alone. The bubbles wore the
desktop's twelve-point corner on sixteen-point type, an avatar stood beside every line of a room
of two, and the thinking dots came within a hundred milliseconds of the message that was just
sent, because that is how fast Jacobian starts a run.

None of this is a bug in the data. The lane carries its goal and its summary so a lead's room can
be read on its own; the run carries its receipt so a person can audit it; the fold exists so one
sentence is not drawn twice. What was wrong was what the room chose to draw of it, on a phone,
where the room is read like Messages and anything that is not the conversation is in its way.

## Decision

1. **A lane in the room is its chain.** A route line is one slim row: the hops as faces, the
   space the work went to in words, and nothing the room already says — amended the evening it
   was written, on Arjun's read of a real room, where *J → RD Jacobian → Riaan's development*
   drew both names twice and the arrow twice with them. The lead is the room you are standing
   in; where it went is not, and going there is what the row is for. Its state stands at the
   right edge, and only while there is something to say — the dots, breathing, while the lane is
   queued or running, and *Failed* when it failed or was cancelled. Done draws nothing: the
   reply beneath is the proof. Waiting draws nothing either: the ask card at the room's foot is
   the thing to look at then. A tap crosses the lane to the space at its other end; a press and
   hold opens what the card used to show — the goal, its bounds, its deadline, its cost and its
   summary.
2. **The specialist's room keeps the question, as the person's words.** A task line is the
   chain as a caption over the goal drawn as the person's own bubble. In that room it is the
   only copy of what was asked, and it is theirs. The caption is the faces alone, standing on
   the bubble's side and beginning where the bubble begins, with no *via the lead* tag under it
   — amended the evening this was written, on Arjun's read of a real room. The room's title was
   already the last hop and the bubble already the first, so the names under the faces were a
   third telling of both; centred over a bubble that is not centred they read as a caption for
   the room rather than for the line; and the lead stood in the middle of the chain an inch
   above the tag that named it again. A screen reader still hears the whole trail, which is what
   the row is labelled with.
3. **The receipt is asked for, never shown.** No receipt is drawn under any line. The
   long-press sheet of the line that closed a run — the reply, or the status line a failure left
   — carries *What the run did*: one header (`1 step · 1m 02s · ≈$0.10`), the steps with their
   durations, and the model and the tokens when the run reported them.
4. **A reply that closed its run is a reply.** Core marks the line it folds a completion onto
   (`Line.folded`); the phone draws a folded summary on the ordinary ground and keeps the green
   for a summary that stood alone. The receipt is in the sheet either way. The desktop is free
   to read the mark or ignore it.
5. **Bubbles are a phone's.** An eighteen-point corner on seventeen-point type at twenty-two
   points of leading; consecutive lines from one author within three minutes close up into a
   turn, five-point corners on the sides that meet, two points between them and a turn's
   spacing between turns; the time inside the last bubble of a turn alone; a separator saying
   the day and the hour over the first line and after any silence of fifteen minutes; no avatar
   in a room of two, and in a room of three only beside the last bubble of a turn. Yours are the
   phone's teal with white ink, a colour the stylesheet does not hold and the drift test does
   not check; theirs the quiet surface. A bubble stops at seventy-eight per cent of the column.
6. **The thinking bubble waits a beat, and then holds one height.** It comes eight hundred
   milliseconds after the run begins and never before the person's own line is confirmed; a run
   that answers inside the beat shows no dots at all. It still leaves the instant the reply
   lands, and it does not come at all while a chain row in the same room is already breathing:
   the lead's own run and the lane it handed on are the same waiting, and a room says a thing
   once. Between those two moments it is one line — the dots, the word, and the step behind it,
   clipped where the bubble ends — and there is always a word, *Thinking* until the harness has
   one of its own. Amended 12 September 2026 (Arjun): the step had a line to itself and comes
   and goes with every tool call, so the bubble grew and shrank under a list that keeps its
   place by measuring, and the room bounced each time; and three dots alone in a box the size of
   a message read as a bubble that had lost its words.
7. **What the app moves itself moves on a spring** — UIKit's ratio and response — rather than
   on a timing curve. Reduce Motion keeps its fades.

## Consequences

- The room draws less and says the same: a question once, an answer once, the lane as a row.
  What a card used to carry is one gesture away, which is where a phone keeps everything that is
  not the conversation.
- `Line.folded` is a new optional field on a line, set only by the fold. Every client that reads
  a line keeps working; the desktop draws a folded reply as it did until it chooses otherwise.
- Core's markdown reads `_em_` and `__strong__` as well as the star forms, bounded so an
  identifier's underscores stay whole — Jacobian writes titles that way, and both clients had
  been showing the underscores.
- The desktop's route card still carries the goal and the summary. It should follow rule 1 in
  its own task, once the phone's version has been lived with (proposal, decision 7).
- The phone's route and task cards, the receipt under a reply and the green ground on every
  Jacobian reply are gone; the tests that proved them now prove the chain, the sheet and the
  fold, and `receipt.yaml` proves the press and hold on a device.


## Addendum, 15 September 2026: the fold reaches back, and a chain with no other end opens on a tap

Two more things the Chess Game room showed against Jacobian's real traffic.

1. **The fold reaches back over the run's own messages.** Jacobian said its status, sent the
   mock with a caption, asked its question and completed the run with the status as the summary.
   The fold (Phase 3 review, finding 9) looked at the run's *last* message alone, so the status
   was drawn twice: as the bubble it was, and again as a green summary that stood alone. Core now
   folds a completion onto whichever of the run's own messages it repeats word for word, the
   newest first among the last twelve; a summary that repeats nothing recent still stands alone,
   and the folded line is marked as before (rule 4).
2. **A chain with no other end opens its details on a tap.** Rule 1 says a tap crosses the lane.
   A lane a Space hands to a part of itself in the one room — *Chess Game → Engineer*, ADR 0032's
   task the lead routes to itself — has no other end, and its row answered a tap with nothing,
   which reads as a row that is broken. Its tap opens what the press and hold opens, and its hint
   says so; the chevron was already left off. The row stays: it is the one line saying the work
   was handed on, and the reply beneath is still the proof it came back.

## Addendum — 16 September 2026: destination, source identity, and readable details

Arjun approved the routing/chat mocks for implementation. The lead's route row now shows the
destination once, with a routing mark; the source remains in the room header and the full
trail remains in details and the accessible label. Cross-space taps still navigate, with a
separate Details target. Same-room taps open details. Details are height-bounded and scroll,
with a full-reply native reader in the same modal, fixed Back/Copy controls and preserved chat.

Incoming replies inherit a quiet hue from their explicit originating lane identity, universally
across receiving spaces. The model retains the message event's run reference separately from
a completion receipt; lane/run identity resolves the source without parsing text or looking at
an adjacent route row. Unknown or ambiguous provenance stays neutral; completion does not
turn a reply green. Avatar mapping remains shared. Long press exposes original-text Copy,
selection and system sharing for every settled text message, including the person's own.

## Addendum, 4 October 2026: the beat counts from when the words are down

Since ADR 0115 a send's words fly from the field to their bubble and land about 0.95 s after the
tap. The beat counted from the run's start, which comes some 0.35 s after a message, so the
thinking bubble came about 0.2 s after the words had come to rest. The room settled and then
rose again, which read as a bounce. Arjun picked option B of a mock with three choices: A as it
was, B the beat counts from the landing, C thinking moved off the room.

The bubble now comes a beat after the later of the run's start and the send's words being down
(`SpaceView.tsx` passes "confirmed and landed" to `useThinking`). The room rises for the words,
rests, and rises again for the thinking: two moves, each its own news. Filmed on the simulator,
the words land at 0.95 s and the thinking comes at 1.76 s. A reply inside the beat still shows no
dots at all, and a bubble already standing still stays through the next send.

## Addendum, 20 October 2026: a run that only answered has a receipt too

Arjun, in the India trip room: "the last two replies do not show the cost." Jacobian answered
both from what it already knew, with no calls, and the phone offered *What the run did* only on a
run with steps. The cost was there, about $0.03 each, but the phone had nowhere to put it.

- **A run has a receipt when it has steps or a cost** (`hasReceipt` in `LinePages.tsx`). A run
  that only answered offers *What the run did* with its time and cost: `4s · ≈$0.03`. A run with
  neither has no receipt, on the phone or the desktop.
- **The one line drops the count when there were no steps.** It no longer says `0 steps`, on
  either side (`receiptSummary`, still copied word for word).
- **The desktop draws that line with nothing to open:** no disclosure, no marker.
