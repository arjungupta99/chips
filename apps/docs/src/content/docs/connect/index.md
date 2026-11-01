---
title: Connect
description: One command for the harnesses Chips knows; a token and four lines for the one you wrote.
sidebar:
  order: 1
---

Agent Connect is to Chips what the Bot API is to Telegram, with typed messages on top. A harness
keeps its own loop, memory and tools. It changes where its messages go, and gains structured asks.

## The harness you run

| Harness | How | Guide |
| --- | --- | --- |
| **OpenClaw, Hermes, OpenCode, Claude Code, Codex** | **Agents → Connect a harness**, then the harness's card. It gives one line to run on the computer the harness runs on, which installs Chips there if it isn't already, fetches the harness's bridge from npm, joins, and keeps it running. | [Gallery](/connect/gallery/) |
| **Your own, on the SDK** | **Agents → Connect a harness → Your own harness** makes a link; `join({ link })` takes it up and keeps its key. Or it asks with a code and you allow it. No token is copied. | [Join requests](/connect/join/) |
| **Anything else** | **Agents → Connect a harness → Anything with HTTP**: one curl call trades the link for a key; or, under Advanced, a token and four lines, as `chips connect custom` gives. | [Custom](/connect/custom/) |
| **Jacobian**, as a worked example | Its own channel, in its own repository. It is added as a custom harness with the dial off — `chips connect custom --name Jacobian --no-dial` — and given the four lines. J and its Spaces are spaces. | [Jacobian](/connect/jacobian/) |

## Three ways to speak

| Mode | For | How |
| --- | --- | --- |
| **[Hooks](/connect/hooks/)** | A harness with lifecycle hooks | Each hook makes one HTTP call. A pre-tool hook posts an approval request, waits for the decision, and exits allow or deny. The harness loop is untouched. |
| **[SDK](/connect/sdk/)** | A harness you control, in TypeScript | Import `@chipschat/harness`, emit events from inside the loop, hear messages, decisions and steering on a callback. |
| **[The wire](/connect/websocket/)** | Everything else | HTTP for writes and reads, a WebSocket for a stream that resumes. Every event in [the reference](/reference/events/) is a JSON object with a bearer token. |

## Nothing inbound is required

The harness opens an outbound WebSocket to the server, or long-polls. A harness on a Mac mini
behind a home router works without a public address.

## Progressive

The minimum is three events: a run started, a message, a run completed. Every extra event
upgrades the interface, and the checklist on the harness's card says how far it has got — the
same eight rows `chips conformance` prints:

| Row | Lights on | Gives you |
| --- | --- | --- |
| Messages | [`message.post`](/reference/events/message-post/) | The harness talking in a space |
| Runs | [`run.started`](/reference/events/run-started/) | A run panel with its goal |
| Steps | [`step.log`](/reference/events/step-log/) | A receipt under the summary |
| Approvals | [`approval.request`](/reference/events/approval-request/) | A card that asks before the harness acts |
| Questions | [`question.ask`](/reference/events/question-ask/) | A question card with options |
| Context | [`context.usage`](/reference/events/context-usage/) | The context ring |
| Cost | [`usage`](/reference/events/usage/) | The cost meter |
| Finished | [`run.completed`](/reference/events/run-completed/), [`run.failed`](/reference/events/run-failed/) | A summary card, and the run's state |

`chips conformance <adapter>` walks an adapter through the golden scenario against a fake Chips
and prints those rows; see [Conformance](/connect/conformance/).

## How far will my harness get

Four levels, each a superset of the one before. A harness at the first level is a plain chat
partner, not a broken one: Chips draws a control only for what a harness [takes](#what-it-may-do).

| Level | What a person sees | What the harness does | Capabilities |
| --- | --- | --- | --- |
| **Talks** | An agent in a room that answers | Hears [`message.new`](/reference/events/message-new/), sends `message.post`, keeps the cursor | none |
| **Supervised** | The thinking bubble and its steps, approvals, questions, cost, Stop | Runs, steps, asks, `usage` and `context.usage`; hears `run.cancel` and `run.steer` | `autonomy`, when it reads the level |
| **Lives in Chips** | New rooms from the +, several agents, copies and new agents, Restart | Registers its agents, claims rooms asked of it, follows archive and delete | `agents`, `new_spaces`, `follows_rooms`, `forks`, `new_agents`, `restarts` |
| **Managed from Chips** | An agent's files, model and effort, heartbeat, context window, edited from its page | Sends its copy of each and takes a person's changes | `context_files`, `models`, `heartbeats`, `context_windows` ([Managed from Chips](/connect/managed/)) |

What a harness must do, at any level, for the room not to look wrong is on one page:
[the checklist](/connect/checklist/).

## What it may do

A harness's capabilities say what it takes. A person grants them, never the harness (ADR 0046):
on the link that brings it in (**Agents → Connect a harness**), on its card later (**What it may do**),
or with `chips declare <harness> <the whole list>`; `chips connect custom --capabilities a,b`
grants them as it registers. A harness asking with a code names what it wants in `wants`, and the
person allows each.

| Capability | What it promises | What Chips draws for it |
| --- | --- | --- |
| `autonomy` | It reads the level and the rules Chips sends, and asks accordingly | The L0–L3 dial |
| `agents` | It reads `hello.agents` and `for`, and speaks as one of its agents | Its agents as themselves; without it, one face |
| `new_spaces` | It takes a room a person opens and asks it into, and claims it | It on the + |
| `follows_rooms` | A person's archive and delete reach its own side of the room | "Deleted in it too" on the sheets |
| `forks` | It copies an agent when asked, and registers the copy within a minute | Fork |
| `new_agents` | It makes a new agent when asked in a room, within a minute | It on a room's Add page |
| `restarts` | It runs its own restart on the `restart` frame | Restart on its card |
| `context_files` | It sends its agents' files and saves a person's edits | An agent's Context group |
| `models` | It sends each agent's model and effort and takes a change | An agent's Model group |
| `heartbeats` | It sends each agent's heartbeat and takes a change | An agent's Heartbeat group |
| `context_windows` | It sends each agent's context window and takes Compact now and a new limit | An agent's Context window group |

## Coming from the Telegram Bot API

| Telegram Bot API | Agent Connect | Notes |
| --- | --- | --- |
| Bot token | harness token | Scoped to one harness, revocable from its profile, tied to a named owner. |
| `chat_id` | `space_id` | Keep your chat-to-session map exactly as it is. One space, one session. |
| `from.id` | `from.participant_id` + `role` | Every message says who sent it and whether they are the owner, a member or a guest. |
| `getUpdates` or webhook | WebSocket, or `GET /v1/events?since=` | Cursor-based and resumable, so a restart never loses a decision. |
| `sendMessage` | [`message.post`](/reference/events/message-post/) | Markdown, mentions, attachments. |
| *No equivalent* | `addressed_to`, [`message.overheard`](/reference/events/message-overheard/) | In a room with several harnesses, Chips says who each message is for; the rest overhear it. |
| `sendChatAction` "typing" | [`run.status`](/reference/events/run-status/) | Carries a verb phrase — "Reading the PO…" — instead of a typing dot. |
| Inline keyboard + `callback_query` | [`question.ask`](/reference/events/question-ask/) → [`question.answered`](/reference/events/question-answered/) | Options with a default and an expiry. |
| *No equivalent* | [`approval.request`](/reference/events/approval-request/) → [`approval.resolved`](/reference/events/approval-resolved/) | A preview, a risk class, who may answer, and an audit record. |
| `sendDocument`, `sendPhoto` | [`artifact.create`](/reference/events/artifact-create/) | Versioned, opens in the side panel. |
