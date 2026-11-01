# 0118. At its spend ceiling, a room's agents pause

Date: 4 October 2026
Status: Accepted, 4 October 2026. Phase 4 of `docs/proposals/long-jobs-plan.md`. Builds on ADR 0117
(a room's spend ceiling per job) and ADR 0097 (the referee's pause).

## Context

ADR 0117 gave every room a spend ceiling per job, $3 unless a person changes it, and told every
harness what the job has spent, in numbers (`context.spend`) and in the room note. It held nothing
at the ceiling. Jacobian now carries a job on across turns (long jobs Phase 3), within a count of
five follow-ups and within the room's ceiling as `context.spend` said it when the job began. What
it cannot see is what other agents in the room spend while it works, nor a harness that chains
turns without reading the spend at all.

Arjun's rulings for the plan, 4 October 2026:

- "This needs to work everywhere, I do not want to hard code anything for J … a specialized space
  with One lead and 4 other agents … still needs to be capable of doing the same."
- "$3 default, and $ editable in room settings".

The mock he picked from (a private Artifact, "Spend per Job") drew the room at its ceiling: a quiet
line at 80%, then the referee's banner in spend's words with *Let them carry on*, and "Arjun let the
agents carry on. A new $3.00 starts now." He picked editor C and the rulings as recommended, and
said nothing against the rest, so it is built as drawn.

Chips had budget pieces that nothing produced: the `budget.warning` event (80 and 100, `warn` and
`pause`), and `run.pause` "by Chips at a budget ceiling". It cannot refuse a run: `run.started`
reports one already begun (`authorize.ts`). The referee's pause (ADR 0097) is the one hold Chips
already has over every harness: while a room is paused, every message an agent sends an agent there
is held, and the lead is handed nothing (ADR 0104).

## Decision

- **Weighed after each cost.** After every `usage` appended in a room, whichever door it came
  through, Chips reads the room's job (ADR 0117) as of that report against the room's ceiling
  (`hold-at-ceiling.ts`, beside `hand-over-held` on the gateway's after-append hook).
- **At 80%, a warning.** `budget.warning` with `threshold: 80`, `action: "warn"`, `scope: "job"`
  and `since_seq`, in the room. Every member sees it: the room's harnesses, and its people, whose
  room draws one quiet line, Chips's: "This job has spent $2.41 of the $3.00 this room allows."
- **At the ceiling, a pause.**
  - `exchange.set` by the system, `state: "paused"`, `why: "spend"`, with the job's `spend`. The
    referee then holds the agents' messages to each other as for a person's pause. A room a person
    has already paused is not paused a second time.
  - Then `budget.warning` with `threshold: 100`, `action: "pause"`. A harness that chains turns
    itself starts no new one in the room (Jacobian's follow-ups already stop on it). A harness that
    runs one turn per message needs to do nothing.
  - The room draws no line for the pause. Its banner, the referee's, says it while it lasts: "This
    job has spent $3.02 of the $3.00 this room allows. The agents start nothing new until somebody
    lets them carry on." The room's row says *Paused*.
- **Once per job.** Each event's key names the room and where the job began, so a run reporting
  after the pause, or two reports at once, add nothing. A run that jumps the job past the ceiling
  sends the pause alone, not the 80% warning first.
- **A person lets them go.** *Let them carry on* is `exchange.set` `going` by a person: what was
  held is handed over, and since it is a person's act, a new job begins with the room's whole
  ceiling (ADR 0117, R1). What was held goes over with the new job's spend, as of the hand-over, not
  the spend it was said at (5 October 2026: the acceptance run handed held words over saying
  Chips still held the agents, and the agent stopped). Its line says so: "Arjun let the agents carry on. A new $3.00 starts
  now." A message in the room does the same, with no line beyond the message.
- **The note says what happens.** The room note's spend line now ends "at $3.00 Chips holds the
  agents until a person acts". From 80% it adds "Most of it is spent: finish the step you are on,
  and say what is left", and at the ceiling it says the agents are held: "start nothing new, and
  say what is done and what is left".
- **The wire.** `budget.warning` gains `scope` (`harness`, the default, or `job`) and `since_seq`.
  `exchange.set` gains `why` (`spend`) and `spend`. The fields are optional: a harness's own
  budget warning, and a person's pause, are what they were. The conformance fake does all of this
  as the server does.
- **The plan's "extend set-exchange".** The pause is appended by its own use case rather than
  through `set-exchange`, which is a person's door: it checks who may pause, and the system is not
  somebody in the room.

## What is left out, and why

- **A push at the ceiling.** The referee's push goes out when a message is held, and a held message
  follows the pause soon enough when agents are talking. A push for a room nobody is talking in
  would be noise. One word from Arjun adds it.
- **Stopping a run already going.** Chips sends no `run.pause` to the runs in the room. A run that
  is working finishes its turn, and the pause stops what would come after it. Pausing a turn mid-way
  would leave work half-saved, and the job's spend includes only what runs have reported, once
  each, at their end.
- **The cost of each run in the room.** As in ADR 0117: the sheet has the job's total, and the
  banner the figure that paused it.
- **A harness's whole budget.** `budget.warning` without `scope` is still that, and still unused.

## Consequences

- Any harness's agents in a room stop talking to each other at the room's ceiling, whether or not
  the harness reads the spend. A harness that chains its own turns honours the pause, which the
  `budget.warning` and the referee's note on held messages both say.
- `usage` was reported once per run, at its end, by both harnesses until 5 October 2026. So one
  run could cross 80% and the ceiling in one report, with no warning first, and a job could pass
  its ceiling by a whole run's cost (long jobs C: one OpenClaw check took a $0.50 room's job from
  $0.27 to $0.95). Since then (LJ-6) both report a run's total so far while it works, at most
  every 15 s from its start, and a Jacobian turn working in the room hears the warning and the
  pause at its next round, in the room note's words. Chips needed no change: a run's report is its
  total and replaces the one before. A job can still pass its ceiling by what a run spends
  between reports and what it finishes after the pause, more for OpenClaw, whose turn is not told
  while it works. Runs still going when a person lets the agents carry on count, from then, in the
  new job; a room paused again at once after *Let them carry on* is that.
- A room whose runs report no cost is never held, and the room says how many runs were not
  counted. Until this phase that was every OpenClaw run (none of the 22 since 25 September carried a
  cost): the events OpenClaw sends a turn's watcher carry tokens only, and its `chat` final a
  usage of zeros, though OpenClaw prices each model call in its own history of the session. The
  bridge now reads that history (`chat.history`) when a turn ends and reports the sum of its calls'
  `usage.cost.total`; one turn of O4's on 5 October was three calls, $0.135.
- Jacobian let go of a room's hold only when a person spoke there. *Let them carry on* now lets go
  of it too (Jacobian, `exchange.set` `going` by a person), so the next capped turn after it
  carries on.
