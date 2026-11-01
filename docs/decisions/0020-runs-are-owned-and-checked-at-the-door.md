# 0020. A run's events are accepted only from its agent, in its conversation, while it lives

3 September 2026 · Status: accepted

## Context

The Phase 1 interim review found that membership scoped reads and not writes, and fixed it. It
left the other half for M1.3: an event carrying a `run_id` could name a run nobody had started
(probe W4, a 201), a run another agent had started, or a run that had ended, and the projector's
stay-put rule would quietly make sense of it. The plan's M1.3 asks for "transitions enforced
server-side". The run state machine in `domain/run-state.ts` says where a run may go; nothing
asked it before appending.

The projector's rule — a transition that does not apply leaves the run where it is, and never
throws — is right for the projector: replay must reach the same answer as live traffic, and the
log may legitimately begin mid-run. It is the wrong rule for the door, where an event that makes
no sense should be refused rather than appended and ignored.

## Decision

`submitEvent` checks the run before the transaction, through the read-model port, the way it
checks membership:

- An event with a `run_id` names a run that exists in the workspace, or is refused as
  `unknown_run` (`404`). `run.started` is the exception that opens one — in a conversation,
  always — and an owner restating it is a retry, not a second run.
- An agent writes only into a run its own token started; anyone's event names the run's own
  conversation; otherwise `wrong_run` (`403`).
- The run's state takes the event (`runAccepts`, in the domain): nothing into a run that has
  ended; no pause of a run that is not running; no resume of one that is not waiting. Otherwise
  `run_state` (`422`). Everything else is accepted — including a decision that arrives while the
  run is already running again, because two asks can be open at once and the projector's
  stay-put rule is the right one for that.

The rule lives in the use case, so it holds for every transport, and in the domain, so it can
be read and tested without a database.

Two things Chips fills in on the way, because the sender should not have to and must not be
able to: the run's conversation, when a hook posts to `/v1/runs/:id/events` and names none;
and `from` on `run.steer`, a participant ref built from the credential and the sender's role in
the conversation, the way the Phase 0 gate made `resolved_by` and `ts` the server's.

## Consequences

- Probe W4 answers 404. An agent cannot put a card into a run that is not its own.
- A hook script stays three curl lines: it names the run in the path and nothing else.
- "Paused" and "waiting on a person" share the `waiting` state on the server; the client folds
  `run.pause` and `run.resume` to tell them apart. A resume of a run waiting on an approval is
  accepted, since the person asked for it; the card stays open.
- Run ownership is one more shape of authorization in one more place — direction, membership,
  visibility, now the run. The interim review's note stands: M1.4 is the last cheap moment to
  gather them into one `authorize` in the domain, and the policy engine is the reason to.
