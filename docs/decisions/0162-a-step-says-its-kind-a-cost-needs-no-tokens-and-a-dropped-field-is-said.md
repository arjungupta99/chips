# 0162. A step says its kind, a cost needs no tokens, and a dropped field is said

Date: 14 October 2026
Status: Accepted, 14 October 2026, on Arjun's "proceed to next phase" (the open-source harnesses
plan, Phase 6). Extends `step.log` and `usage`; amends finding 11's rule for `usage` (the tokens
out were required).

## Context

Phase 6 of `docs/proposals/open-source-harnesses-plan.md` listed eight changes to the wire where
harnesses differ, each "worth doing only when a harness needs it". Read against main on the day,
two were already done: a harness settles its own ask answered in its own tools (ADR 0079), and This
session and Always are rules Chips keeps, whatever the harness can (ADR 0080), so the card needs no
`scopes` from the harness. Three are needed by a harness that runs now, the ACP bridge
(`~/Work/chips-acp`):

1. **A step names a tool Chips has never read.** An ACP agent's tool call has a title and a
   `kind` (read, edit, delete, move, search, execute, think, fetch, other), not a tool name the
   thinking bubble's table knows (ADR 0147). `execute` was *Using execute* beside a plain dot, and
   any MCP tool an agent is given reads the same way.
2. **A turn's cost comes without its tokens.** ACP reports what a session has cost, not tokens.
   `usage` required the tokens out, so the bridge sent `output_tokens: 0`, and the phone's line
   menu said *0 out* for every ACP turn.
3. **A field Chips does not declare goes nowhere, silently.** The schema strips it, on purpose:
   what comes in is what the server trusts. But a bridge that misspells a field, or writes one
   from a newer protocol, never learns that it went nowhere.

## Decision

1. **`step.log.kind`, optional:** `search`, `web`, `shell`, `image`, `memory`, `edit`, `file`,
   `mail`, `handoff` or `other`. These are the kinds the bubble already draws a glyph for, and
   the list is closed for the same reason risk classes are. The apps read a step:
   - by its tool's name, when they know the tool and the harness says no other kind;
   - by the kind the harness says, when it says one: that kind's words and glyph, counted with its
     kind in the tally;
   - as a plain dot, with no guess from its name, when the harness says `other`;
   - otherwise as before, guessed from the name.
2. **`usage.output_tokens` is optional, as `input_tokens` already was.** A report with only its cost
   is a whole report. A count it does not give leaves the run's count as it was, on the server and
   in the apps. Chips prices a report only when it has both counts and the harness gave no cost.
3. **What was dropped is said.**
   - `parseEvent` returns `dropped`: the top-level fields the schema did not declare. The event is
     still taken without them.
   - chipsd says each one in its log, once per sender and field. It remembers up to 1,000 such
     pairs; past that it says nothing more, so a sender can't grow the server's memory.
   - The conformance kit warns of each one in its report, which is where a bridge's author looks.
   - A field Chips writes itself (ADR 0018) is still taken out before the check, unsaid.

## Left, each until a harness needs it

- **Background work as a typed field on `message.post`.** Core reads Jacobian's own text
  (`taskWords.ts`), which works. A field would mean changing Jacobian, for nothing anyone sees today.
- **Cache tokens on `usage`.** Every harness that runs here sends its own cost, so Chips's price
  table prices nothing of theirs.
- **`task.child.ephemeral` and lane delivery from the harness.** These wait for ACP's sub-agents.
- **An ask a harness withdraws with no answer.** This is ADR 0079's last point, still unscheduled.

## Consequences

- **The protocol stays at `v: 1`, and every change is additive.**
  - An older chipsd strips `kind`.
  - An older chipsd refuses a `usage` with no tokens out, so a harness that sends its cost alone
    needs this chipsd.
  - An older app ignores `kind`. The apps draw it only once they are rebuilt.
- **The ACP bridge sends `kind` from ACP's own kinds and its cost alone.** Execute is `shell`,
  fetch is `web`, read and move are `file`, edit and delete are `edit`, think and switch_mode are
  `other`. The OpenClaw bridge and Jacobian are unchanged: every tool they call is in the bubble's
  table already.
- **To go live:** restart 4431, then rebuild the web dist, the Mac app and the iPhone build.
