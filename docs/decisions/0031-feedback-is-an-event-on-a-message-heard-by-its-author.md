# 0031. Feedback is an event on a message, filled at the door, heard by the message's author

5 September 2026 · Status: accepted

Decided in M3.4, whose acceptance is the SDK sample reacting to a thumbs-down by posting a fix.

## Context

The protocol has carried `feedback` since Phase 0 — a reaction or a "what went wrong" note on
one of the harness's messages, with `from` as a participant ref — and nothing sent it, filled
it or delivered it. The Phase 0 review noted that `from` on a steer and on feedback is a ref
Chips must *fill* from the credential and the membership, which a stamping table cannot do
(M1.3 did the steer). The Jacobian mapping listed a 👎 and `/wrong <note>` as "gap in Chips":
the one loop a person actually uses to teach a harness, absent.

Three questions had to be settled. Who says who gave it. What a piece of feedback may be about.
And who hears it, in a room that now holds several harnesses (M3.3): every event in a space has
so far reached every member of the space, and a reaction to Scout's words is not Ledger's
business.

## Decision

1. **A person sends it, like a steer, and Chips fills in `from`.** `feedback` keeps its
   direction (`chips_to_harness`), so the door's direction rule already makes it a person's
   to send. The door writes `from` from the credential and the sender's standing in the space,
   replacing whatever the body claimed — the same fill as `run.steer`, and the same reason:
   a harness reads `from.role`, and a client must not choose it.
2. **It is on a message a harness said, in this space, and it says what it is** (rule 10 of the
   door, ADR 0022). The message is looked up by the wire's id — `msg_` and the ULID of the
   event that carried it — through a `message` read model that says whose it is and where. A
   message nobody sent is `unknown_message`; a person's own, or one in another space, is
   `wrong_message`; a reaction without its emoji or a correction without its note is
   `invalid`. The lookup fills in the space when the event names none, as a hook's run does;
   the membership rule is asked before anything is said about whether the message exists.
3. **The harness whose message it is hears it, and every person in the room does.** Delivery
   skips a `feedback` for a harness that did not say the message. This is the first
   per-recipient rule in delivery — membership scoping is per space — and it is made after the
   cursor has moved, so the skipped event is no gap on a resume. A second harness in the room
   would otherwise have to work out that a reaction was not about its own words, and could
   not: it does not know the others' message ids.
4. **It is folded onto the message, not shown as a message.** The client puts a reaction and a
   note under the line they are about, and in the audit; the server projects nothing but the
   room's activity. A summary that ends a run is a message a harness said, so it takes
   feedback too, which is where a thumbs-down most often belongs.

## Consequences

- `feedback` needs no run: a summary belongs to a run that has ended, and a note about it is
  still welcome. A client that names a run is held to the run rules like anyone else.
- `GET /v1/events` is not scoped per recipient: a harness reading the log sees feedback on
  another harness's message, as it sees that harness's messages. The socket is what a harness
  listens on, and it is scoped.
- A reaction is one per person per emoji on a line: a second tap, or a retry, is not a second
  thumb. There is no un-reacting; a wrong thumb is corrected by a note, which is what a note is
  for.
- The SDK exposes it as `chips.on("feedback")`, on the connection rather than on a run, since it
  arrives with no run and after the run it is about may have ended. The Scout sample answers a
  thumbs-down or a note with a correction posted under the message. Carrying feedback into the
  two adapters — Jacobian's `fixFlaggedTurn`, a turn in a Claude Code session — is M3.5's, where
  the adapters gain their Phase 3 seams.

## Addendum, 18 October 2026: a correction goes on an agent's message too

Point 2 was written when a harness said its own messages. Since agents (ADR 0087) an agent says
every reply, so rule 10 refused a correction on all of them: no *What went wrong?* note reached a
harness after 29 September, and on the live server Not right? (ADR 0200) was refused on every
reply while the phone closed its page as if it had gone (finding PM-3). A correction now goes on a
message said by an agent or by a harness, anything but a person or Chips (protocol's
`isAgentKind`); it is still heard only by the harness whose agent said it.
