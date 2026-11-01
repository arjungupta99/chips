# 0106. Chips names the turns that hear, and a steer redirects

Date: 3 October 2026
Status: Accepted, 3 October 2026. Amends 0105, whose mid-turn hearing was each harness's own
reckoning, and the steer of the run panel, whose modes Jacobian heard as one. Jacobian changes; the
OpenClaw bridge does not.

## Context

ADR 0105 went live with three things left over, which Arjun asked to have done ("complete what's
left"):

- **Who hears what is said mid-turn was the harness's to work out.** Jacobian scanned its own live
  turns for the room. Another harness would have to do the same, and the room never learnt
  whether a working agent had heard anything.
- **A follow-up was a steer.** The run panel sends `run.steer` as `steer`, `followup` or
  `interrupt`, and Chips's receipt tells the person `steered` or `queued`. Jacobian joined all of
  them to the turn at its next round, so a follow-up the receipt called queued was heard mid-turn.
- **A steer waited for the next round.** Jacobian hands a turn words only between its tool rounds,
  so a steer said while the model was writing its answer reached the turn after.

## Decision

1. **Chips names the turns that are to hear what is said.** A `message.overheard`, a
   `message.new` and a harness's own `message.post` as it comes back carry `working_turns`: that
   harness's agents with a turn going in the room, each `{ agent_id, run_id }`, never the one who
   said it nor one it is for. A turn nothing has been heard from for ten minutes is not listed, as
   in the room note. The own `message.post` comes back with `message_id` and `from` when it does,
   so ASCII Art's words reach J1 when both are Jacobian's (run 4). A handed message carries none.
2. **The harness says when a turn heard them.** It hands the words to each named turn at its next
   step, never starting a turn on them, and once a turn has them it posts `message.heard
   { message_id }` on that run, as its agent. People in the room see "J1 heard this while
   working" beneath the message (`Line.heardBy`, core `heardWords`, on the phone and the Mac). A
   turn that ends first hears nothing and says nothing; ADR 0105 hands it the words next turn.
3. **Each steer mode does what its receipt says.** In Jacobian, `steer` redirects at once:
   `SpaceRuntime.redirect` aborts the model call out now, puts its half-streamed words back, and
   asks the same round again with the words at the end of its request; between calls they ride the
   next round. `followup` waits: the turn never hears it, and the next turn begins with it.
   `interrupt` stops the turn first, as before. With no turn going, any of them starts one.
4. **Jacobian hears through `working_turns`** rather than its own scan: `interject` and
   `tellTurn` take an `onHeard`, called once a round carries the words, which posts
   `message.heard`.

## Consequences

- One delivery to a harness reads which of its agents have a turn going in the room: one indexed
  query on `runs`, and the newest events of each going run.
- A redirected call costs the tokens it had spent; a steer is a person's, and rare.
- The bridge posts no `message.heard` and hands nothing to a running turn: OpenClaw's own `steer`
  becomes a follow-up turn when the turn has just ended, whose answer would go to the room. Its
  agents get what was said with their next turn (ADR 0105), and the room says nothing of them.
- The conformance fake names the same turns, without the ten-minute rule, since it keeps no clock.

## Addendum, 30 October 2026: Hermes hears too, the others wait

The agents in "Bro chat" said that words a person adds while they work don't reach them until
their next turn. Point 2 was Jacobian's alone. The SDK now has its half for any bridge:
`workingTurnsOf(message)` reads `working_turns`, `overheardLine(message)` words them as said in
the room and not to the one hearing, and `run.heard(messageId)` posts `message.heard` on the run.

- **Hermes** hands them to each named run with its `steer` route, which Hermes gives the model
  after the run's current tools. A steer Hermes had not given when the run ended comes back as
  `pending_steer` on its end and is not run, so the bridge posts `message.heard` once the run
  completes, for each message whose words are not in what came back. A run that ends any other
  way says nothing of them.
- **Claude Code, Codex (the ACP bridge) and OpenCode** don't. Words sent after a turn's last step
  become a turn of their own there: OpenCode runs what is left of its inbox as new prompts when a
  turn ends, and Claude Code's queued prompt may still run. That turn's answer would go to the
  room as an answer to words that were for somebody else, as OpenClaw's would. Their agents get
  the words with their next turn (ADR 0105), as before.
