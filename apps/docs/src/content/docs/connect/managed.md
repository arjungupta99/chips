---
title: Managed from Chips
description: An agent's context files, its model and effort, its heartbeat and its context window, kept by the harness and changed from the agent's page.
sidebar:
  order: 6.7
---

Four things about an agent live in its harness and are shown and changed in Chips: the files it
is built from, the model it runs on and how hard it thinks, the turn it takes on its own every so
often, and how full its context is. Chips never holds them. The harness sends a copy, keeps it
current, and takes a person's change in its own way. Each is a [capability](/connect/#what-it-may-do)
a person grants; without it, the agent's page has no such group.

## One pattern, four times

| Step | What the harness does |
| --- | --- |
| **Say it listens** | Its socket's `hello` says the word in `accepts`: `context`, `models`, `heartbeats`, `context_windows`, `jobs`. A socket that doesn't is never sent the frame. |
| **Send its copy** | `PUT` the whole copy when it connects, and again whenever it changes on the harness's side, for each agent (and for context files, its own shared set). |
| **Hear a change** | A frame arrives with an id — `edit_id` or `change_id` — and what the person asked. It is sent now or never: it is not in the log, and a reconnect doesn't hear it again. |
| **Answer it** | Make the change in its own way, then `PUT` the copy as it is now with `answers: <id>`; or, if it can't, the copy as it is with `refuses: { …_id, message? }`. Within a minute, or the person is told it was `missed`. |

What a person may change is the harness's to say: each copy carries `editable`, and
`why_read_only` in the harness's words when it isn't (*Built into Lathe*). The page reads
`away` when no socket of the harness listens, so a person reads the copy but isn't offered a
change that would go nowhere.

## Context files

`context_files`, `accepts: ["context"]` ([ADR 0134](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0134-an-agents-context-is-its-harnesss-files-listed-and-edited-in-chips.md)).

- `PUT /v1/agents/:id/context`: `{ files, not_shown?, read_note? }`. Up to eight files, each
  `{ name, title, about?, role?, text?, hash?, editable, why_read_only?, shared?, replaceable? }`.
  `role` is `identity`, `instructions`, `about_you`, `memory` or `other` and picks the row's mark;
  `hash` is the harness's own hash of `text`, which an edit names as the version it was made from.
  A file over 64 KB, or past the eighth, goes in `not_shown` with its reason. `read_note`, a
  sentence, says when the agent reads them where that isn't at the start of every turn: "Hermes
  reads these when a conversation starts." The page puts it under the files (ADR 0238).
- `PUT /v1/harnesses/:id/context`: the harness's own set, `{ shared, not_shown?, new_agents_note? }`.
  A shared file has an `id`; an agent's file names it in `shared` to read it rather than a copy of
  its own.
- The `context.edit` frame: `{ edit_id, agent_id?, name, text, base_hash, asked_by, asked_at }`,
  `agent_id` absent for the harness's own set. `base_hash: null` asks to give the agent its own
  copy of a shared file. When the file changed since `base_hash`, refuse with
  `reason: "changed"`, and the person sees the file as it is now.

## Models and effort

`models`, `accepts: ["models"]` ([ADR 0140](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0140-an-agents-model-and-effort-are-its-harnesss-chosen-in-chips.md)).

- `PUT /v1/agents/:id/model`: `{ model, effort?, own, default?, choices, editable, why_read_only?, followed_by? }`.
  `choices` lists up to forty models, each `{ id, label, efforts: [{ id, label }], effort_default? }`,
  efforts lowest first. `own: false` says the agent runs on `default` (`{ label, model, effort? }`,
  *Same as J*). `followed_by` counts the agents that follow this one's.
- The `model.change` frame: `{ change_id, agent_id, model, effort }`. `model: null` with
  `effort: null` puts the agent back on the default.

## Heartbeats

`heartbeats`, `accepts: ["heartbeats"]` ([ADR 0143](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0143-an-agents-heartbeat-is-its-harnesss-switched-and-timed-in-chips.md)).

A heartbeat is a turn the agent starts on its own every so often. What the turn says goes in its
room like any other: the harness keeps the clock ([Speaking later](/connect/later/)).

- `PUT /v1/agents/:id/heartbeat`: `{ on, every, choices, editable, why_read_only? }`, `every` in
  minutes and one of `choices` (up to twelve, shortest first), kept while it is off.
- The `heartbeat.change` frame: `{ change_id, agent_id, on, every }`.

## Its own jobs

`jobs`, `accepts: ["jobs"]` ([ADR 0252](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0252-a-harnesss-own-jobs-on-its-page.md)).

The jobs a harness runs by itself, outside any space, show on its page with a switch each, their
runs, and what each run cost. Unlike the others here, the copy is the harness's, not an agent's.

- `PUT /v1/harnesses/:id/jobs`: `{ jobs: [...] }`, every job whole, up to 24. Each is
  `{ job_id, name, about, kind, every?, when?, next_at?, for_agents?, on, editable, why_read_only?, choices? }`:
  `kind` is `heartbeat`, `memory`, `skills` or `other`; `every` is in minutes, or `when` says it
  in words; `choices` are the intervals a person may pick. A job left out is gone, runs and all.
- `POST /v1/harnesses/:id/jobs/runs`: `{ runs: [...] }`, up to 200, each
  `{ job_id, run_id, started_at, ended_at, outcome, quiet?, waited?, error?, agent_id?, cost_usd?, tokens?, model? }`.
  `outcome` is `done`, `failed` or `stopped`. A run posted again replaces the one before, so post
  it once more when its cost is known. Chips keeps runs for 90 days.
- The `job.change` frame: `{ change_id, job_id, on, every? }`. Answer with the whole copy.

## Context windows

`context_windows`, `accepts: ["context_windows"]` ([ADR 0146](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0146-an-agents-context-window-is-its-harnesss-shown-and-compacted-in-chips.md)).

- `PUT /v1/agents/:id/context-window`:
  `{ used, window, model?, as_of, compacting?, last?, long_turn?, compacts, why_not?, limit?, editable, why_read_only? }`.
  `compacting` is `queued` or `running` while it compacts; `last` is the last compaction
  `{ at, from, to, by: "asked" | "itself" }`; `limit` is
  `{ at, choices, default?, may_turn_off }`, the percent of the window it compacts itself at.
  A copy whose `last` is newer than the one before writes one quiet line in the agent's room.
- The `context_window.compact` frame asks it to compact now: answer at once with `compacting`
  set and `answers`, and send the copy again when it is done.
- The `context_window.change` frame: `{ change_id, agent_id, at }`, a new limit, or `null` for only
  when asked.
