# 0143. An agent's heartbeat is its harness's, switched and timed in Chips

Date: 9 October 2026
Status: Accepted, 9 October 2026, on Arjun's "A, Main agent only, keep the Heartbeat tag". The
build is `docs/proposals/agent-heartbeat-plan.md`.

## Context

Arjun pointed OpenClaw's Main room at `main`'s Home (bridge `5f4c1c2`), the conversation OpenClaw's
heartbeat wakes. A heartbeat is a turn the harness starts on its own every so often: the agent looks
over what it is doing and says something only when something needs the person. He asked: "I also
want to be able to adjust the Heartbeat frequency from the agent detail page, and can we also add
toggle to turn on / off?" Mock: <https://claude.ai/artifact/XedrYMcokqPMCojfed7Bfs>, layout A.

OpenClaw keeps a heartbeat per agent (`agents.entries.<id>.heartbeat.every`, changed live by
`config.patch`). Jacobian's "heartbeat" is something else, a scheduler for reminders and watches,
so it declares nothing here.

## Decision

1. **Nothing about a heartbeat is Chips'.** A harness that declares `heartbeats` sends a copy of
   an agent's (`PUT /v1/agents/:id/heartbeat`), whole, when it registers the agent, on connect,
   when it changes outside Chips, and with each answer. The copy says:
   - whether it is on (`on`), and how often it beats, in minutes (`every`, kept while off);
   - the intervals a person may pick, in minutes, ascending (`choices`, twelve at most, `every`
     among them);
   - whether a person may change it (`editable`, `why_read_only`).

   Chips puts the minutes into words itself ("30 min", "1 hour", "Once a day").
2. **A copy is a registry row** (`agent_heartbeats`, migration 0042), as a model's is (ADR 0140):
   one per agent, holding the copy and the last change asked of it. It goes with the agent when it
   is deleted and with the harness when it is removed. An agent with no copy shows no Heartbeat
   group.
3. **Read and changed by the people who run the harness**: its owner, or an owner or admin of the
   workspace. Anyone else sees no Heartbeat group.
4. **A change** is `POST /v1/agents/:id/heartbeat/changes {on, every?}`. `every` is one of the
   choices, and is the copy's own when left out. It goes down as a `heartbeat.change` frame, with
   `on` and `every` both named, to the harness's sockets that said `heartbeats` in their `hello`,
   now or never. The harness answers with its next copy, `answers` or `refuses` naming the change.
   A change not answered within a minute reads as `missed`. The refusals are ADR 0140's: 422 for
   an interval not among the choices or an agent kept read only, 422 `harness_away`, 422
   `change_waiting`, 403 and 404.
5. **A check-in is an ordinary message**, marked `heartbeat: true` on `message.post`. The apps
   draw a small "Heartbeat" tag beside the agent's name over it, so a person knows the agent wrote
   on its own. A check with nothing to say posts nothing.
6. **On the agent's page, layout A.**
   - A Heartbeat row with a switch, which saves when flipped.
   - While it is on, an Every row under it, which opens the intervals; a tap saves.
   - The foot says what the switch means and roughly how many checks a day the interval makes
     ("about 48 a day").
   - Away or read only, both rows are quiet, as the Model group's are.
7. **First, one agent.** OpenClaw's bridge sends a copy for its Main agent only, whose heartbeat
   runs in Home and so reaches the Main room. Agents in other rooms would need their heartbeat
   pointed at their room's conversation, which is not done here.

## What is left out

- Active hours, a "check now" button, a per-room heartbeat, and the heartbeat's prompt or
  checklist.
- Costs: the foot counts checks, since Chips can't know a harness's prices.
- A history of changes, and anything in the log but the check-ins themselves.

## Consequences

- The bridge carries what OpenClaw needs. A heartbeat must run with no chat channel
  (`target: "none"`), the Main agent's block must always be written once any agent has one, and
  a check-in is read from the `heartbeat_respond` tool call that OpenClaw's events carry. The plan
  says how.
- Each check is a full turn for the agent. The foot's count is the only warning of the cost.
