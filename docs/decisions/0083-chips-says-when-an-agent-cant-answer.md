# 0083. Chips says when an agent can't answer

Date: 28 September 2026
Status: Accepted. Reverses the "leave it" on presence in the OpenClaw test (finding 8), extends 0081.

## Context

On 28 September Arjun asked Everyone in a room for the first ten digits of pi. Jacobian answered.
OpenClaw said nothing, and nothing in Chips said why. The machine OpenClaw runs on had stopped at
6:11 PM. The bridge that connects it to Chips was still connected, so Chips took OpenClaw to be
fine. The message waited in the bridge until OpenClaw came back at 6:34. Arjun: "we need a way to
show harness failure state in chips, these silent failures are bad."

Chips knew nothing it could say:

- chipsd holds each socket in memory and tells nobody when one opens or closes. The only stored
  signal is a token's last use, which says whether a harness has ever connected, not whether it is
  connected now (ADR 0078, finding 18).
- A harness has no way to say that the part of it Chips cannot see is broken.
- Nothing notices a message that an agent never picks up.

When the OpenClaw test raised presence (finding 8), Arjun chose to leave it. This reverses that.

Of the mock's three options (`docs/proposals/agent-trouble-mocks.html`), he picked B: the watch
under the message, plus the agent's state.

## Decision

1. **The watch: an agent that hasn't picked up a message.** This is worked out in core, from what
   the room already holds, for any agent. A person's newest message addressed to an agent is
   *waiting* on it while nothing from that agent in the room follows it: no line, and no run whose
   last event comes after it. When 30 seconds have passed, the room says so under that message,
   with the agent's face and how long it has been: "OpenClaw hasn't picked this up · 40s". It goes
   the moment anything from the agent arrives. It is the newest message only, one line per agent,
   so a room never shows a column of them. It needs nothing from any agent and catches failures
   nobody predicted, but it cannot say why.
2. **An agent's state is live, and the server keeps it.** For each harness chipsd holds three
   things in memory:
   - whether any socket of it is open (through the port or the relay);
   - since when;
   - any trouble it reported, with its words and since when.

   This is state, not history: nothing is written to the log, and a restart forgets it. A harness
   whose last socket closes is called offline only after 15 seconds without another, so a
   reconnect never flashes. On a fresh start, a harness is taken as connected for the first 15
   seconds, which is how long the harnesses take to come back. After that, one nobody has heard
   from is offline since the start. Trouble ends when the harness says so, or when its last socket
   closes: offline says more, and a harness that comes back says again what is still wrong.
3. **A harness says what is wrong on its side.** `PUT /v1/harnesses/:id/status` takes
   `{ "state": "trouble", "reason": "Can't reach its gateway" }`, or `{ "state": "ok" }`. It is
   called by that harness's own token and nobody else's. The reason is one line in the product's
   voice, up to 200 characters. The same trouble again keeps its first `since`. The SDK has
   `reportTrouble(reason)` and `reportOk()`, and says the trouble again whenever it reconnects. The
   OpenClaw bridge reports its gateway. Jacobian reports its model provider when calls to it fail.
4. **The apps read it, and hear it change.**
   - `GET /v1/participants` gives each harness a `state`: `{ connected, since, trouble? }`.
   - A person's socket that says `presence` in its `hello`'s `accepts` is sent a `presence` frame,
     `{ participant_id, state }`, whenever one changes.
   - The apps read the directory again on every reconnect, so a change missed while they were away
     is caught.
   - A guest is sent no frames. Guests read states from the directory, which shows them only the
     harnesses they share a room with.
5. **What the apps show.** An agent that is offline, or in trouble, *can't answer*.
   - Its face wears a small amber mark wherever faces are drawn: in the room, in the field, in the
     route over a message, and in the +'s list.
   - A room's header adds "1 can't answer".
   - The watch's line appears as soon as the message is sent, not after 30 seconds, and it says
     why: "OpenClaw can't answer yet", then "Can't reach its gateway · since 6:12 PM", or
     "Offline · since 6:12 PM".
   - The Harnesses tab says it in words on the agent's row.
   - A harness that has never connected is offline too, and "Never connected" is its why. The
     line that said so by the field ("X has never connected; it won't hear this yet", finding 18)
     is gone, on Arjun's word: it said again what the mark, the header and the line under the
     message already say.

## Consequences

- An agent whose machine stops is marked within 15 seconds, before anybody writes to it. One whose
  back end fails says why, if it reports. Anything else that swallows a message, a bug included,
  is caught by the watch after 30 seconds.
- An agent that answers slowly without showing anything looks, for a while, like one that isn't
  there. The watch is 30 seconds for that reason: a harness that takes a message on shows a run or
  a line well inside that.
- A run a harness started and never ended is not caught: it did pick the message up. Stale runs
  are their own fix.
- The state is only as honest as the connection. A harness that keeps its socket open while it
  cannot work is connected until it reports trouble or the watch catches it. That is why the
  bridge and Jacobian report.
- Nothing is logged, so there is no history of an agent's outages in Chips. chipsd's own log
  records each report.
