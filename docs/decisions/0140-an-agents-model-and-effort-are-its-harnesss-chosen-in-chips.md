# 0140. An agent's model and effort are its harness's, chosen in Chips

Date: 8 October 2026
Status: Accepted, 8 October 2026. Protocol, server and core (Phase 1 of
`docs/proposals/agent-model-plan.md`). The screens are ADR 0141's; the two adapters follow in
Phases 2 and 3.

## Context

Arjun: "next I need ability to change the LLM model and its effort level from the Agent detail
page." Both harnesses already keep a model and an effort per agent, and Chips can see neither:

- Jacobian keeps `metadata.models.{turn, effort}` on each Space, inherited up the Space tree. No
  Space sets its own today, so all 38 of its Chips agents run on J's.
- OpenClaw keeps a model per agent (`agents.update`) and a default thinking level per agent
  (`thinkingDefault`), and lists each model's levels.

The only model in the protocol was the one a finished run reports (`usage.model`). Two layouts
were drawn in a mock; he picked **B**: one row on the agent's page, and one sheet with the models,
a "Same as …" switch, the effort bars and one Save. The rulings taken with it are §1 of the plan.

## Decision

- **Nothing about a model is Chips'.** A harness that declares `models` sends a copy of each
  agent's (`PUT /v1/agents/:id/model`), whole, when it makes or claims an agent, on connect, when
  the agent's model or effort changes outside Chips, and with each answer. The copy says:
  - the model it runs on and its effort, and whether they are its own (`own`);
  - what it runs on with none of its own, and what the switch calls it (`default`: "Same as J");
  - the models it may run on (`choices`, 40 at most), each with its effort levels lowest first (8
    at most) and the words for each;
  - whether a person may change it (`editable`, `why_read_only`), and how many agents follow it
    (`followed_by`).

  A model or effort that isn't among the choices is refused (422). Chips holds no model's name:
  its fixtures use made-up ones.
- **A copy is a registry row,** not the log (`agent_models`, migration 0041), as context files
  are (ADR 0134). One row per agent holds the copy and the last change asked of it; nobody needs
  the history. It goes with the agent when it is deleted, and with the harness when it is removed.
- **Read and changed by the people who run the harness:** its owner, or an owner or admin of the
  workspace, as context files, restart and removal are. Anyone else sees no Model group.
- **One change carries both.** `POST /v1/agents/:id/model/changes {model, effort}` names a model
  among the choices and one of its levels (`null` for a model with none), or `null` for both: no
  model or effort of its own, the default's. It is checked against the copy, kept as the agent's
  last change, and sent as a `model.change` frame to the harness's sockets that said `models` in
  their `hello`, now or never, as `context.edit` is.
- **The harness answers** with its next copy, naming the change in `answers` (saved) or `refuses`
  (failed, with its words). `GET /v1/agents/:id/model` returns the copy with `away` and the last
  change; one not answered within `MODEL_CHANGE_WAIT_MS` (a minute) reads as `missed`, worked out
  when read, never stored, and an answer after it still counts.
- **Refusals,** each in words for the person:
  - 422 for a model not among the choices, an effort not the model's, `null` without a default,
    or an agent the harness keeps read only (with its `why_read_only`);
  - 422 `harness_away` when no socket of the harness hears `models`: no queue;
  - 422 `change_waiting` while the last change waits inside its minute;
  - 403 for anyone but the owner or an admin, and for a harness sending another's agent;
  - 404 for a harness that doesn't declare `models`, or hasn't sent this agent's copy.

  The plan drew the second and third as 409s. They are 422s with a `refusal` word, as
  `harness_away` already is for context edits, so the clients branch on one field and the
  protocol gains no error code.
- **Core draws it once for both clients:** `modelRow` (the label, "Steady effort · Same as J", the
  bars, quiet when away or read only, the foot), the sheet's state with no drawing in it
  (`openModelSheet`, `sameAs`, `pickModel`, `pickLevel`, `canSave`, `modelAsk`), ruling 6's
  `levelAfter` (keep the level, else the model's default, else the nearest lower, else the
  lowest), `saveModelChange` (post, then read every 800 ms for up to 65 s), and the words under
  Save.

## What is left out, and why

- **A model per room, `/model` in a room, utility models, fallbacks and allow-lists.** One
  agent, one model; the harness knows what it can run.
- **Costs per level.** The sheet says "Higher is slower, and costs more" and no numbers: Chips
  can't know a harness's prices, and Jacobian's Codex runs are billed $0.
- **A history of changes,** and anything in the log.
- **A confirmation before a change other agents follow** (J's, which 38 follow). The foot says how
  many follow it. He may ask for one before Phase 4.
- **A harness that does not declare `models`** gets no Model group anywhere (ADR 0046).

## Consequences

- Each adapter carries its harness's knowledge: which models it may offer, their labels, what
  "default" means, and how to set one. A new harness needs only its adapter.
- The copy is as fresh as the harness keeps it. Jacobian's 30 s follow pass and the bridge's
  check after each turn send a changed copy, so a change made elsewhere shows within a pass.
- A change applies on the agent's next turn, the harness's way; Chips says Saved when the harness
  says so, not when a turn has used it.
- `pnpm live model` and `model-set` read and change it as a person, for the runs of the later
  phases.

## Addendum, 10 October 2026: OpenClaw's Main agent

Arjun: "why is it that I cannot change the Openclaw main agent's model from Chips?" The bridge
changed only the agents it made, and sent `main` read only as OpenClaw's own (the plan's ruling 11,
taken as the mock drew it, not his). Since then `main` became the harness's Main agent, in its Main
room, and Chips sets its heartbeat (ADR 0143), so its model is changed from Chips too: one
`config.patch` of its entry, as for a made agent (bridge `c0faa22`). An agent the bridge found in
OpenClaw stays read only. Nothing in Chips changed: the copy says `editable`, and the row follows.
A change applies wherever main answers, not only in Chips, since OpenClaw keeps the model per agent.
