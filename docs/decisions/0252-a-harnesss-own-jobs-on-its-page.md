# 0252. A harness's own jobs, on its page, each with its switch, its runs and their cost

Date: 31 October 2026
Status: Accepted, 31 October 2026, on Arjun's "Build A". Mock:
<https://claude.ai/artifact/GBUaTPRMKFs3QjvzuAc89U> (layout A).

## Context

OpenClaw runs jobs by itself, outside any space. On Arjun's gateway there are three: the Main
agent's Heartbeat every hour (ADR 0143), Dreaming every night, which sorts each agent's day into
its memory, and a Skill review for each agent every week. Nothing in Chips showed them. In the
last week of October they cost $14.90, $14.39 of it the Heartbeat: on Claude Opus 5.5 each check
sends Main's whole conversation again, about 68,000 tokens, because the model's cache has lapsed
by the next hour. Each check costs 34¢, and every check that week had nothing to say. The Skill
reviews each waited half an hour for an approval nobody saw and then did nothing.

Arjun: "for #2 let's keep leave them on for now. can we just have controls in the harness details
page? we can have each of these open into section, that shows the times it ran, and costs. please
make make sure this is very polished". Of the mock's three layouts he chose A: an "Its own jobs"
group on the harness page, each job a row that opens its own page.

## Decision

1. **Nothing about a job is Chips'.** A harness that declares `jobs` sends a copy of the jobs it
   runs on its own (`PUT /v1/harnesses/:id/jobs`), whole, when it connects, when they change
   outside Chips, and with each answer. Each job says:
   - its id (the harness's own, stable), a name, and one sentence on what it does (`about`);
   - its `kind`, one of `heartbeat`, `memory`, `skills` and `other`, which picks its mark;
   - how often it runs, in minutes (`every`), and when it runs next (`next_at`). Chips puts these
     into words itself: "Every hour", "Every night at 3:00 AM", "Every Thursday at 8:00 PM", in the
     reader's own time. A schedule that is not an interval sends words instead (`when`);
   - the agents it runs for, if it runs for some (`for_agents`);
   - whether it is on, and whether a person may switch it from Chips (`editable`,
     `why_read_only`);
   - for a job whose interval a person may pick, the intervals it offers (`choices`), as a
     heartbeat's (ADR 0143).
2. **A job's runs are kept by Chips.** A harness posts each run it finishes
   (`POST /v1/harnesses/:id/jobs/runs`, up to 200 at once), and may post a run again with more
   said, such as its cost; what a run posted again leaves out stays as it was, so a harness that
   posts its recent runs again on each start never takes away a cost it gave before. A run says when it started and ended, how it ended (`done`, `failed` or
   `stopped`), whether it had nothing to say (`quiet`) or waited for an approval (`waited`), the
   harness's words for a failure, the agent it ran for, and, when the harness knows them, what it
   cost in dollars, its tokens and its model. Chips keeps runs for 90 days, so a harness that keeps
   a week of them can still be read for two.
3. **Read and switched by the people who run the harness**: its owner, or an owner or admin of the
   workspace, as its restart, model and heartbeat are. Anyone else sees no jobs.
   `GET /v1/harnesses/:id/jobs` gives the copy with, for each job, what its runs cost in the last
   seven days, how many runs Chips holds, its last run and its last change.
   `GET /v1/harnesses/:id/jobs/:job/runs` gives runs newest first, by `since` and `before`.
4. **A change** is `POST /v1/harnesses/:id/jobs/:job/changes {on, every?}`. It goes down as a
   `job.change` frame to the harness's sockets that said `jobs` in their `hello`, now or never, and
   the harness answers with its next copy, `answers` or `refuses` naming the change. It waits a
   minute, then reads as missed. The refusals are ADR 0143's: 422 for a job kept read only or an
   interval not among its choices, 422 `harness_away`, 422 `change_waiting`, 403 and 404.
5. **On the harness page, layout A.**
   - An "Its own jobs" group under its agents, its heading carrying what the jobs cost this week.
     A row for each job: its mark, its name, when it runs, what it cost this week (or Off), and a
     chevron. The foot says the harness runs these by itself, outside the spaces, and that what
     they cost is in no space's total.
   - A row opens the job's page: its mark and name large, what it does, the switch (saving as the
     Heartbeat's does), an Every row for a job with choices, the last 14 days as a bar for each day
     with what they cost in all, and its runs, newest first, twenty at a time.
   - A run says when, how long it took, and how it went in words: "Nothing to say", "Waited for an
     approval", "Stopped: OpenClaw restarted". Its cost, or a dash when the harness didn't know it.
6. **An agent's heartbeat may also be a job.** OpenClaw's bridge lists its Main agent's heartbeat
   among its jobs, `kind: heartbeat`, for that agent. The switch and Every row on the job's page
   and the Heartbeat group on the agent's page change the same thing, and the bridge sends both
   copies after either change.

## What is left out

- Running a job now, a switch per agent where a harness has one switch for all (OpenClaw's Skill
  review is one setting for every agent), and changing a job's schedule beyond its choices.
- The approvals a job waits for. OpenClaw's Skill review asks one, and nothing in Chips hears it;
  showing it to a person is its own decision.
- Counting jobs' costs in a space's total, a budget, or the usage page.

## Consequences

- OpenClaw's bridge reads the gateway's jobs (`cron.list`), turns each switch into the setting
  OpenClaw keeps for it (the gateway refuses to switch its own jobs off by `cron.update`), groups
  the Skill reviews into one job, and prices each run from the session's history as it does a
  turn's (ADR 0214). Dreaming's model calls are not in any session, so its runs carry no cost.
- A copy that drops a job drops its runs with it.
- The page shows what a job costs. It changes nothing about why the Heartbeat costs what it does.
