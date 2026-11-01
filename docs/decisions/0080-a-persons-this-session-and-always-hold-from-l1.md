# 0080. A person's This session and Always hold from L1

Date: 27 September 2026
Status: Accepted. Amends the engine's rule of 3 September (ADR 0008's "an agent's own `allow`
speaking only where policy decides anyway"); ADR 0036's reach of `always` is unchanged.

## Context

The policy engine let an `allow` among a harness's rules speak only at L2 and above, so that a
room capped at L0 or L1 could not be talked past by a harness's rule. It came first. *This
session* and *Always* came later and were built on the same rules: Always is written into the
harness's policy for the room, and This session goes in front of those rules for the rest of the
run. Every harness starts at L1, so at the level where people meet the card most, both choices
wrote a rule that changed nothing. Rerunning A3 of the OpenClaw test found it: Always on `date`,
then `date` asked again (`docs/reviews/openclaw-test-report.md`, finding 24). Arjun chose to make
them hold, option (a) of three (the others: hide the two choices below L2, or document the gap).

## Decision

1. **An `allow` among a harness's rules speaks when the workspace's cap is L2 or more and the
   harness is at L1 or more.** The cap is what the old rule protected: a room capped at L0 or L1
   still cannot be talked past. L0 still asks for everything, and a rule made there waits for the
   dial.
2. **An `always` the room already has writes nothing.** The rule there decides the same way; a
   second `policy.updated` would only grow the list.
3. **Rules written by hand for a harness at L1 speak too.** They were written to be obeyed.

## Consequences

- An Always on one command is a rule for its kind: Always on `date` (`shell.exec`) also passes
  `pwd`. The approval page says so, so a person can choose Once.
- The property "never looser as the level goes down" still holds for the presets. A new one
  holds for rules: an `allow` never speaks under a cap below L2, or at L0.
- Nothing on 4431 changed on the day: neither Jacobian nor OpenClaw had a rule.
