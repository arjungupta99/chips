# 0155. A run that has ended still takes what it cost

Date: 12 October 2026

## Status

Accepted (Arjun, 12 October 2026: "Fix CL 1-5", for finding CL-4).

## Context

A run that has ended takes nothing more (technical-plan M1.3), bar what is about an ask it made:
an approval's decision and its outcome (M3.5), and a question's answer (ADR 0079).

Jacobian tells Chips what a turn has cost every 15 seconds while it goes, and the total at its
end (LJ-6). On 12 October a turn was frozen by macOS's privacy prompt (CL-1) and cut by the
restart that freed it. The run was left open in Chips, and once stopped it refused the cost of
the turn's three Claude calls ($0.19), which stayed in Jacobian's store (CL-4).

Jacobian now keeps the runs its turns drive across a restart, and at its next start tells each
one still open what it cost and ends it. When a person pressed Stop while Jacobian was frozen or
down, Chips has already ended the run, and the cost would be refused at the door.

## Decision

- **A run that has ended still takes a `usage`.** What was spent is true after the run has
  ended. The run's state doesn't move, and a run-scoped report still replaces the run's total and
  grows the harness's spend by the difference. A room's job counts it as any other.
- Everything else into an ended run is still refused, `run.failed` and `run.completed` among
  them.
- The server's door (`server/src/domain/run-state.ts`) and the conformance fake
  (`packages/conformance/src/workspace.ts`) say the same.

## Consequences

- A harness back from a freeze or a crash can report what a cut turn cost, whether or not someone
  stopped its run meanwhile. Jacobian does so at its first hello after a start.
- A harness may report cost after a person's Stop. Jacobian does since `2f6691e` (see the
  addendum).
- Needs 4431 restarted; no migration.

## Addendum: a person's Stop reports the cost too (12 October 2026)

Arjun: "make Stop report the cost too". A Stop ends the run in Chips, and Jacobian said nothing more
on it, so what the turn spent since its last report (every 15 s) never reached the room's job. Now
Jacobian says the run's cost after its end; it says nothing else. Its frozen long-jobs vector for a
stopped follow-up is amended to match ("nothing more is said on the run but what it cost").
Live at 23:39: a turn stopped with $0.062 reported took its last `usage` after the cancel, $0.089.
