# 0117. A room has a spend ceiling per job

Date: 4 October 2026
Status: Accepted, 4 October 2026. Phase 1 of `docs/proposals/long-jobs-plan.md`: what a room allows
a job, and what the job has spent. Nothing holds the agents at the ceiling yet; ADR 0118 (Phase 4)
does.
On the Mac the amounts are the sheet's Spend per job page, with Save, since ADR 0151.

## Context

A space's turn in Jacobian stops at 20 rounds. In the Cholesterol room (4 October) a long brief
read pages for all 20 and ended "unfinished". The long jobs plan lets work carry on across turns
and across hand-offs, for every space and every harness. Turns that carry on need a bound that is
not the round count, so the plan bounds them by what they cost.

Arjun's rulings for it, 4 October 2026:

- "This needs to work everywhere, I do not want to hard code anything for J … a specialized space
  with One lead and 4 other agents … still needs to be capable of doing the same."
- "$3 default, and $ editable in room settings".
- From the mock "Spend per Job" (a private Artifact): "go with C, R1–R3 as recommended".

Chips already had budget pieces that nothing produces or reads: `harness_policy.budget_usd`, the
`budget.warning` event, `run.pause` and the `budget_exhausted` error. They are for a harness's
whole spend, not a room's job. This ADR adds the job and the room's setting. ADR 0118 puts the
existing pieces to use at the ceiling.

The readings (Phase 0, the live log over 30 days) found 341 jobs. The largest was $1.87, seven
cost $1 or more, and none reached $2. Every Jacobian run since 30 September reported a cost.
OpenClaw's never have.

## Decision

- **A job (R1).** A room's job begins at the later of two points:
  - the last thing a person did in the room: the referee's `lastPersonAct` (ADR 0097), which
    counts a message, an answer, a decision, adding or taking somebody out, steering or stopping
    a run, and letting the agents carry on;
  - the last brief handed into the room: a lane's `run.requested` there.

  Its spend is what the room's `usage` reports said after that point, every harness's together.
  A run's own report is its total so far, so a run that began before the point counts only what it
  added after it. A step's or a lane's report adds to its run, as the projection has it. The
  server works this out (`jobSpendOf`, `infrastructure/store/spend.ts`) as of a seq, so a message
  delivered again is handed what was so when it was said.
- **A run with no cost counts $0, and is told apart (R2).** A `usage` that carried no cost, and that
  Chips's price table could not price, adds nothing. The job's `uncounted_runs` says how many runs
  did, and the note and the sheet say so. No harness is named in what the room says.
- **The room's ceiling.**
  - It is set by a new event, `space.spend_ceiling_set {usd}`, through
    `POST /v1/spaces/:id/spend-ceiling` (`set-spend-ceiling.ts`). It is modelled on the lead's:
    a person in the room who is not a guest there or in the workspace; idempotent.
  - The amount is $0.25 to $100 in steps of $0.25, or `null` for the default (R3).
  - The default is `DEFAULT_SPEND_CEILING_USD = 3`. A room that never chose follows it, so a
    change to the default reaches it.
  - It is projected to `spaces.spend_ceiling_usd` (migration 0037).
- **Every harness is told, with the turn.** Two forms:
  - **In numbers:** a `message.new` that gives a turn carries `context.spend`,
    `{ceiling_usd, spent_usd, since_seq, uncounted_runs}`.
  - **In words:** the room note ends with "This job has spent $1.20 of the $3.00 this room allows
    a job.", for every taker, in a room with other agents or none.

  The plan had `renderContext` print it too. Left out: the note already says it, and twice would be
  noise.
- **People see it on the room's settings.**
  - **The phone:** a Spend per job row between Lead and Files, with "This job so far: $1.23" under
    it. Its page is Arjun's pick C: $1, $3 (Default), $5, $10, $25 and Other, a bar of the job's
    spend against the amount picked, and Save. Other opens a field with the number pad.
  - **The Mac and the web:** the members panel has the same amounts under Lead. An amount applies
    at once, as the lead does there, and Other's applies with Set.
  - **Everyone:** `GET /v1/spaces/:id/spend` reads the job's spend for anybody in the room. A
    guest sees the amount and cannot change it. The room says who set it: "Arjun set the spend per
    job to $10.00".
  - **Core:** the amounts, the choice and the words are core's (`spend.ts`, `spendCeilingOf`,
    `maySetSpend`), so both clients say the same.

## What is left out, and why

- **Holding the agents at the ceiling.** ADR 0118 does it, with the referee's pause and
  `budget.warning`. Until then the words say only what was spent, never that anything stops.
- **Refusing a `run.started` over the ceiling.** It reports a run already begun
  (`authorize.ts`). A harness that chains turns itself honours `context.spend` instead (Jacobian,
  Phase 3).
- **The cost of each run in the room.** The sheet's row has the job's total. A line per run would
  be noise.
- **A ceiling for a workspace, or for a harness.** `harness_policy.budget_usd` already exists for a
  harness and stays unused. A room is where a job happens, and where people look.

## Consequences

- A room's agents see what their job has spent in every turn, whatever their harness. A harness
  that reports no cost is counted as $0, and the room says so. That is today's OpenClaw.
- `lastPersonAct` moved out of the referee's reads (`exchange.ts`) so the job reads the same point.
  Anything that starts the referee's count again starts a new job.
- `usage` was reported once per run, at its end, by both harnesses until 5 October 2026, so a run
  that spans a person's act counted in full in the job after it. Both now report a run's total so
  far as it goes, at most every 15 s (LJ-6), so such a run is counted more finely: what it had
  reported before the act stays in the job before.
- Phase 3 (Jacobian carrying a job on across turns) reads `context.spend`. Phase 4 holds the room
  at `ceiling_usd`.
