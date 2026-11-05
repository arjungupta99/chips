# 0257. Connect says what its steps are, and where a line runs

Date: 1 November 2026
Status: Accepted, 1 November 2026, on Arjun's "Build 1B + 2A + hover". Mock:
<https://claude.ai/artifact/HJ3jEB1whQn8uX2GW22UJ2> (1B, 2A and the hover lines).

## Context

Arjun, 1 November 2026, on Chips for Mac's first run, Connect Claude Code: "the list with circles
feels like I should tap it, can we refine so its not confusing?", "whenever we are asking user to
run a command in terminal, we should say 'run in terminal'", and "all the switch options should
have a very short explainer on hover".

The four steps of On this Mac (ADR 0218, phase 5) stood in one grey box with rules between the
rows, each with an empty ring and a title near full white: a settings list of radio buttons, though
nothing in it can be pressed. A line to run sat in a box with Copy and nothing else; only the
bridge's sentence above it said what to do with it, and each bridge says that differently ("Install
it with npm, then try again.", "Run this in a terminal, then try again."). The It may switches in the
card's two columns show only their labels, so "Follow the spaces you open" or "Take the autonomy
dial" says nothing to somebody new.

The mock drew today beside A, numbers on flat discs in the same box, and B, the steps on a thin line
with no box; and, for the lines, A, Run in Terminal on the box, beside B, a button that opens
Terminal with the line running. He chose B and A.

## Decision

1. **Steps on a line.** Each place's steps stand under a label, **What Connect does** on this Mac
   and **What happens** on another computer (core's `STEPS_LABEL`), on a thin line with no box and
   no rules: a small dot for each to come, a turning arc for the one under way (on the card's own
   ground, `--join-ground`, so the line doesn't show through it), a tick once done with the line
   behind it gone green, and amber where it stopped. The dialog keeps its height from its first
   frame, as ADR 0190 asks. The phone's Connect sheet keeps its own steps for now.
2. **Run in Terminal.** Every box that holds a line a person runs says **Run in Terminal** at its
   top (core's `RUN_IN_TERMINAL`), with Copy at the end of those words on the web and on the Mac;
   on the phone it heads the box, over Copy and Send…. That is a card's line and the curl line for
   anything with HTTP (core's `runsInTerminal`), a command a bridge gives where it stopped, and the
   four lines of Advanced on a harness's page. Code for a harness's source, a sentence to say and a
   link to hand over don't say it, and nor does a setting a bridge gives (`NAME=value`, as Hermes's
   `API_SERVER_ENABLED=true`), which goes in a file (`HereStop.run`). With the box saying it, the
   line under a card's name says only where the line goes: "This goes on the computer where Hermes
   runs, and installs Chips there if it needs to."
3. **A sentence on hover.** Each capability has a `hint` beside its label and `detail` in core
   (`capabilityWords`), one whole sentence: "When you archive or delete a space, it does too." In
   the card's two columns it shows in a small bubble under the row once the pointer has rested
   there for 350 ms, or while the keyboard is on its switch, which it describes
   (`aria-describedby`). It floats, so the rows keep their height; the right column's bubbles open
   leftward and the last row's upward, so none leaves the card. A harness's page has room for the
   line under each switch and keeps it. The phone has no hover and is unchanged.

## Consequences

- No bridge release: the box says Run in Terminal whatever the bridge's sentence says, and a bridge
  that gives a setting gets a plain box from its shape alone.
- A bridge whose line to copy is neither a command nor a `NAME=value` setting would be labelled Run
  in Terminal; if one ever gives such a line, it needs a field on `chips connect --json`'s failed
  line, not a longer pattern.
- Not taken: B for the lines, a button that opens Terminal with the line running. Chips can't see
  the line finish, so the person still presses Try again, and the button needs a shell command on
  the Mac.
