# 0282. Spend stays in sight, and the limit is raised from the hold

Date: 6 November 2026
Status: Accepted, 6 November 2026, on Arjun's "Do C" after the mock "Spend in Chips explain"
(https://claude.ai/artifact/GoEJKnXAr44ygiTdM9rXyX). Builds on ADRs 0117, 0118 and 0196.

## Context

In "Chips explain" on 6 November, Jiro (Claude Code) worked from 1:49 to 6:58 AM on one job of 54
steps, most of it waiting on asks nobody answered overnight. Claude Code says what a turn cost only
when the turn ends, so the whole cost, about $3.10, came in one `usage` report half a second before
the reply. It was past the $3.00 the room allows a job, so Chips held the agents (ADR 0118), after
the work was already done.

At 7:15 Arjun pressed *Let them carry on*, which he read as raising the limit. It started a new job
with a fresh $3.00; the limit stayed $3.00. Then he wrote: "Long press on the message does not show
me spend. Space details → Spend per job shows zero". The amount was still there, last on the grey
line under the reply's *What the run did*, but the banner was gone, the carry-on line said nothing
of it, and Spend per job showed the new job's $0.00.

The mock offered three fixes: keep the amount in sight (A); A, and raise the limit from the banner
(B, the pick); B, and the room's spending listed job by job on Spend per job (C). He picked C.

## Decision

1. **The banner says when the job had already finished.** Held at the ceiling, with no run there
   still going and a run that ended within a minute of the hold, it reads `Jiro's job came to $3.10
   when it finished, past the $3.00 this space allows a job. The agents start nothing new until
   somebody lets them.` ("This job" when several agents ran). The client knows when Chips held them
   (`PausedSpend.at`, from the event).

2. **Raise the limit, and Carry on at the ceiling there is.** At the ceiling the banner's carry-on
   says its amount, `Carry on at $3.00`. Before it, for whoever may set the ceiling (the workspace's
   owner, ADR 0196), `Raise the limit` opens the room's sheet on Spend per job with the next amount
   up picked, and Save says `Save $5.00 and carry on` (or `Carry on at $3.00` with the room's own
   amount picked). It sends one request, `POST /v1/spaces/:id/spend-ceiling {usd, carry_on: true}`:
   the server sets the ceiling as it did, and, while the agents are held, lets them carry on as the
   exchange route does, so the room hears `space.spend_ceiling_set` and `exchange.set` together. The
   sheet then goes.

3. **The room's line says the amount.** A carry on at the ceiling reads `let the agents carry on
   after $3.10. A new $3.00 starts now.` Carried on by the person who has just set the ceiling, the
   ceiling's line, the room's last, becomes `raised the limit to $5.00 and let the agents carry on
   after $3.10.`, and no second line is drawn (core's fold remembers the ceiling's line,
   `ceilingLine`).

4. **The room's spending, job by job.** `GET /v1/spaces/:id/spend` adds what began the present job
   (`started`: when, who, and whether a message, an answer, a carry on, a brief or another act), the
   jobs before it that spent or ran without a cost (`jobs`, newest first, at most 30), and what every
   job in the room has spent (`total_usd`). The server walks the room's `usage` reports once,
   counting each into the job running when it came, by the same rule `jobSpendOf` counts the present
   one; a job is marked held where Chips paused at the ceiling in it. The tile says `Last job $3.10`
   under `$0.00 of $3.00`. Spend per job says `Since you let them carry on at 7:15 AM` under This job
   so far, and under Save lists `Jobs before this one`: whose runs, when, the steps, `Held`, the
   amount, each going to its reply; then `All jobs here`.

5. **The receipt says the cost first.** `≈$3.10 · 54 steps · 8 failed · 5h 09m`, everywhere a
   receipt line is drawn; on the phone's lifted message the cost is in ink.

## Consequences

- A harness that says a turn's cost only at its end still passes the ceiling before Chips hears of
  it. The hold stops the next job, not this one; the banner now says so in its words.
- The spend read walks every `usage` report and every person's act in the room. It is read as the
  room's sheet opens and again as the room moves on, once per open sheet.
- A server from before this ADR answers the spend read without `started`, `jobs` or `total_usd`, and
  the clients show what they did before. One that does not know `carry_on` sets the ceiling and
  leaves the agents held; the banner stays until somebody carries on.
- No migration and no new event.
