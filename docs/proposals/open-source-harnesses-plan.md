# Connecting an open-source harness: how plug-and-play Chips is, and the plan

**Plan of record, 14 October 2026. Status: Phases 0, 1, 2 and 3B built, pushed and live; a first
cut of Phase 4 built; Phase 6's needed half built, pushed and live (ADR 0162); Phase 7's kit checks, levels and
gallery page built and pushed; Phase 5's Hermes and OpenCode bridges built, each in its own local repo (§5).** Arjun: "How will
chips work if tomorrow we try to connect with some open source harness. How much plug and play is
it? What could be improved. Build a detailed plan." Then: "proceed with execution", with no picks
among §8's calls, so each is taken as recommended there, and nothing is published, pushed or
taken live without his word.

Read for it, 14 October 2026:
- the protocol, the SDK, the conformance kit, the CLI and the three clients, at main `60413496`;
- Jacobian's channel (`~/Work/Jacobian/src/channels/chips/`) and the OpenClaw bridge
  (`~/Work/chips-openclaw/bridge/`), read only;
- the September survey (`docs/openclaw-class-harnesses.md`), the OpenClaw test report, and the
  install plan (`install-onboarding-plan.md`), whose Phases 3–7 are not built;
- the harnesses' own docs as of October 2026 (§3).

In one line each:

- **Chips's own side is plug-and-play.** The server, the protocol and the three apps name no
  harness (a guardrail fails if they do). They take anything that speaks Agent Connect, and they
  draw each feature only when the harness has declared it, across 11 capabilities. A new harness
  cannot break a room; at worst it is a plain chat partner.
- **The harness's side is not.** Every harness needs a bridge written by hand. Neither of ours
  uses the SDK: Jacobian's channel is 9,200 lines and the OpenClaw bridge 5,500. A bridge that
  only talks, runs and asks was about 1,000 lines, written from the docs in one evening.
- **Four things stand between a new harness and plug-and-play:**
  1. Nothing a harness author installs is published. `@chipschat/harness`, `@chipschat/protocol` and
     `@chipschat/conformance` are private, at 0.0.0.
  2. There's no generic bridge. The ACP bridge in the technical plan (M7.2) was descoped by the
     install plan (§3.10), and since September ACP has grown what that descoping missed (§3).
  3. There's no SDK for Python. That matters less than it looked: Hermes, the Python harness most
     like OpenClaw, has an HTTP API a TypeScript bridge can drive (§3).
  4. The SDK stops at the agents model. It can't hear the frames for context files, models,
     heartbeats or context windows, can't upload, and keeps nothing across a restart.
- **The biggest lever is a generic ACP bridge, as its own project** (§5, Phase 4). It would be one
  daemon hosting ACP agents. The ACP registry lists 42 agents, among them Goose, Gemini CLI,
  OpenCode, Codex and Claude Code (through their adapters), Cursor, Copilot, Kimi and Qwen. One
  bridge would put all of them in Chips at the supervised level: talking, a thinking bubble with
  steps, approvals, questions, cost and Stop.
- **The second lever is the SDK** (§5, Phase 1). Lifting the ten things every bridge writes again
  would cut a full integration from 5,000–9,000 lines to 1,500–3,000.

What it costs, said up front:

| Phase | Chips | Elsewhere | Live steps | What he gets |
|---|---|---|---|---|
| 0 · Truth and small fixes | docs, CLI, the link's switches, two client fixes | none | `pnpm build`, phone, Mac (no 4431) | A newcomer's first hour stops hitting wrong docs and missing switches |
| 1 · The SDK does the boilerplate | `packages/sdk-ts` (+~2,500 lines), conformance scenarios | none | none | A TypeScript bridge is ~1/3 the size |
| 2 · Prove it on a real bridge | none | OpenClaw bridge ported to the SDK (his call) | bridge restart | Evidence, and a bridge that stops drifting |
| 3 · Publish | release workflow | npm (his call; reverses "nothing public") | none | Anyone can `npm i @chipschat/harness` |
| 4 · A generic ACP bridge | none | new repo `~/Work/chips-acp` (ADR 0041 kept: the bridge is the harness) | a new daemon, on his word | Dozens of open-source agents in Chips, supervised |
| 5 · Native bridges where ACP falls short | none | Hermes (Runs API) or OpenCode (`opencode serve`), each its own repo, when he wants one | a new daemon | Schedules, personas and cost that ACP lacks |
| 6 · The wire, where harnesses differ | protocol + server + clients, small items | none | 4431 restart, apps | Fewer Jacobian-shaped corners |
| 7 · Conformance and the gallery | kit, docs | the install plan's Phase 4 lab | docs deploy (his) | A badge that means "this works" |

**The smallest version still worth having** is Phase 0 plus Phase 1's first half (the settings
frames, uploads and a saved cursor). About a week, all in this repo, with nothing published and
no restart of 4431. After it, a TypeScript harness can reach every feature Chips has through the
SDK, and the docs say how. **If the harness for "tomorrow" is already known, §4 says which phase
it needs, and that phase goes first.**

## 1. How a harness connects today, step by step

Each step is marked **generic** (Chips does it for any harness) or **manual** (a person, or the
bridge's author, does it per harness).

1. **Run Chips and pair a device.** *Manual, once.* Done already for him.
2. **Make a way in.** *Generic, but a person acts.* Agents → Add an agent → *Your own harness* or
   *Anything with HTTP* makes a link (ADR 0122); `join({ link })`, `chips join <link>` or one
   `curl` redeems it, and no token is copied. Or the harness asks with a code and he allows it.
3. **Say what it may do.** *Manual, and incomplete.*
   - The link offers 5 of the 11 capabilities: autonomy, new_spaces, follows_rooms, new_agents
     and restarts (`apps/web/src/app/Join.tsx:71`, `OFFERED.slice(0, 5)`).
   - **`agents` isn't on the link**, and every agent feature since ADR 0087 hangs on it. Neither
     are forks or the newest four.
   - Nothing in any app changes them afterwards. Only `chips declare <harness> <whole list>` from
     a paired CLI does, and its help names three.
   - The harness can't ask for them in `hello`. That was rejected and stays rejected (ADR 0046):
     a person grants, a harness asks in its join request's `wants`.
4. **Write the bridge.** *Manual, per harness. This is nearly all the work.* In order of what it
   buys (§2's levels):
   - **Talks:** hear `message.new` (addressed to it, with `for`, `room` and `context`), post
     `message.post`, keep the `seq` cursor, put an idempotency key on every write.
   - **Supervised:** `run.started` → `step.log` → `run.completed`/`run.failed`, `approval.request`
     and its answer, `question.ask`, `usage` and `context.usage`, Stop/steer/pause, the room
     note and `NO_REPLY` in its prompts.
   - **Lives in Chips:** agents registered and attached; rooms asked of it claimed; forks and new
     agents made; archive and delete followed; restart; trouble reported.
   - **Managed from Chips:** context files, model and effort, heartbeat, context window, room files
     with versions, schedules answered in their room.
   - The SDK helps with the first two in TypeScript. For the last two it can't hear the frames
     (`packages/sdk-ts/src/connect.ts:597` only ever says `accepts: ["restart"]`).
5. **Keep it running.** *Manual.* A harness Chips supports runs by itself (ADR 0041), so the
   bridge is a daemon: launchd, a container, or the harness's own plugin host.
6. **Check it.** *Half generic.* `chips conformance custom` plays the golden scenario only, and
   can't declare a capability (`packages/conformance/src/subject.ts:57-64`). New rooms and forks
   need the TypeScript kit, which isn't published. Nothing checks agents routing, new agents,
   restarts, the newest four, room files or `NO_REPLY`.
7. **Read the docs.** *Generic, with holes:*
   - `connect/index.md:18` still offers Claude Code, removed by ADR 0041.
   - `concepts/harness.md:50-53` says a connection can present several harnesses; `websocket.md`
     and `frames.md` say one.
   - `reference/http.md` leaves out the harness, token and agent-settings routes.
   - `reference/frames.md` leaves out `context.edit`, `model.change`, `heartbeat.change` and
     `context_window.*`.
   - Nothing under `connect/` explains `context_files`, `models`, `heartbeats` or
     `context_windows`; they live only in ADRs 0134, 0140, 0143 and 0146.

## 2. How far a new harness gets, by level

| Level | What he sees | What the bridge does | Today, in TypeScript | Today, anything else |
|---|---|---|---|---|
| **Talks** | An agent in a room that answers | hear and post | ~150 lines on the SDK; an afternoon | ~300 lines on the wire; a day |
| **Supervised** | Thinking bubble, steps, approvals, questions, cost, Stop | runs, steps, asks, usage | ~800 lines; 1–2 days (the bridge's first night) | ~1,200 lines; 2–3 days |
| **Lives in Chips** | +, agents, forks, new agents, archive/delete follow, Restart | registry, claims, follow | weeks; the SDK has half | weeks |
| **Managed from Chips** | Context files, model, heartbeat, context window, room files | settings frames, sync | raw wire only | raw wire only |

What the apps do with a harness at each level is already right: a control is drawn only for what
was declared (ADR 0077), and a harness that declares nothing beyond talking is a clean chat
partner, not a broken one. **The apps are the plug-and-play part. The bridge is the work.**

What every bridge has written again so far, largest first, with each one's rough size:

1. **The wire client (500–1,000 lines):** errors, idempotent writes with retry, `hello` and
   `subscribe`, ping and backoff, `too_far_behind`, a cursor on disk, every endpoint, uploads in
   pieces, signed downloads.
2. **Run bookkeeping (300–500):** writes in order per run, steps opened and closed, nothing after
   the end, a goal that is never empty, cost so far every 15 s, runs a crash left open.
3. **Agents and rooms (400–1,300):** register by key, follow attach/release/replace, the Main
   agent in the Main room, claim asked rooms, rebuild missed `message.new` from `/v1/events`.
4. **What a turn is told (300–500):** room note, "said since you last spoke", the referee's note,
   catch-up on attach. The SDK exports `renderContext` and `renderRoomNote`; both bridges wrote
   their own anyway.
5. **Settings sync (~400, four times over):** frame → harness write → re-read → PUT the copy;
   re-read after each turn.
6. **Room files (250–300):** versions, `replaces`, the stale-file retry.
7. **Approvals and questions (~150):** id map kept across restarts, own echoes ignored, settling
   its own ask, scope downgrade.
8. **Media (~150):** bearer download, voice transcripts, the 20-file cap.
9. **Health and restart (150–200):** status, trouble, hold during a restart.
10. **Config and ids (100–200):** the four `CHIPS_*` lines, the keychain, ULIDs.

What stays harness-specific whatever the SDK does: its own client and auth; how a room maps to
its session; turning its event stream into runs and steps, quirks included; where its approvals
come from and which decisions it can keep; where its settings live; how it makes an agent; its
schedules; its ops.

## 3. The harnesses he's likely to try, October 2026

Checked on the web on 14 October 2026; sources in the session's research, the main ones linked.
What changed since September's survey is in bold.

| Harness | Its own seam | ACP | Best seam for Chips |
|---|---|---|---|
| **Goose** | `goose serve`: **ACP over HTTP and WebSocket** on `127.0.0.1:3284/acp`, plus `_goose/unstable/*` for steer and schedules | yes, the reference | The ACP bridge, over WebSocket, with a thin layer for steer and schedules |
| **Gemini CLI**, **Cursor**, **Copilot**, **Kimi**, **Qwen**, **Cline**, … | none worth bridging | `--acp` over stdio | The ACP bridge |
| **Codex** | app-server, JSON-RPC over stdio (WebSocket still "experimental and unsupported"); approvals with `acceptForSession` | through `codex-acp`, **with sub-agents** | ACP first; a native sidecar only for steer and collab threads |
| **Claude Code** | the Agent SDK | through `claude-agent-acp` | ACP. Chips owns no process: the bridge does (ADR 0041) |
| **OpenCode** | `opencode serve`: HTTP + SSE, sessions, `permission … once\|always\|reject`, questions shaped like Claude Code's, **cost per message**, child sessions, a list of agents | `opencode acp` | ACP first; a native bridge is cheap and richer |
| **Hermes Agent** | **a Runs API** (`POST /v1/runs`, SSE events with `approval.request` and sub-agent cost, `/api/jobs` for schedules, profiles as personas), and Python platform plugins | `hermes acp` (no messaging or cron tools) | A native bridge on the Runs and Jobs API, in TypeScript like OpenClaw's |
| **OpenHands** | agent server, REST + WebSocket, accept/reject confirmation | experimental | A native bridge, only for hosted sandboxes |
| **OpenClaw** | gateway, WebSocket protocol | `openclaw acp` | The bridge we have |
| nanobot, PicoClaw | an OpenAI-compatible chat endpoint at most | no | Chat only, or skip |

**ACP in October 2026** ([spec](https://agentclientprotocol.com/protocol/overview),
[proposals](https://agentclientprotocol.com/rfds/updates)):

- **Stable v1 over stdio**; a Streamable HTTP and WebSocket transport is an active proposal, and
  `goose serve` ships it. A v2 draft lets updates arrive outside a turn.
- **What maps cleanly:** `session/new` per room; `session/prompt` is a run; `tool_call` and
  `tool_call_update` are steps with stable ids; `plan` is the run's plan;
  `session/request_permission` is an approval, with `allow_once`, `allow_always`, `reject_once`,
  `reject_always`; **`elicitation/create` (form) is a question** (stable since 24 July);
  **`usage_update` carries the context gauge and a cost** (stable since 5 June); compaction and
  `notice` are stable; `session/set_config_option` sets `model` and `thought_level`;
  `session/cancel` is Stop; `session/load` brings a session back after a restart.
- **Sub-agents** are a draft the Codex and Claude adapters already implement: a child session per
  sub-agent, which is a Chips lane.
- **What it lacks:** steering a running turn, a list of personas (one process is one agent),
  scheduling, and a "for this session" approval scope. In v1 nothing arrives outside a turn, so a
  heartbeat or a reminder has to be the bridge's own.
- **Prior art:** Block's Buzz (`block/buzz`, Apache-2.0) is a self-hosted workspace where people
  and ACP agents share channels, through `buzz-acp`. It auto-approves tool permissions, which is
  the part Chips exists for.

So the September survey's rule 15 limits ("no delegation visibility, no cost standard,
client-initiated stdio only") are mostly gone, which is why Phase 4 comes back.

**MCP and A2A are not seams for this.** MCP's 2026-07-28 spec is stateless and servers no longer
call clients; it is right for the other direction, Chips's tools *inside* an agent (Phase 4 uses
it so). A2A delegates to an agent as a black box: no approvals, no steps, no cost.


## 4. What "tomorrow" looks like, by kind of harness

| Kind | Examples | Today | After |
|---|---|---|---|
| **A TypeScript daemon** | your own; nanoclaw-style | SDK from the workspace; settings by raw wire | Phase 1 (+3 to share it) |
| **A CLI that speaks ACP** | Goose, Gemini CLI, OpenCode, Codex and Claude Code through their adapters, and ~35 more | Nothing to start from; a bridge that owns the agent processes is a harness of its own | Phase 4 |
| **A daemon with an HTTP API** | Hermes Agent, OpenClaw's gateway, `opencode serve`, OpenHands' agent server | A bridge like chips-openclaw: ~1K lines to talk and be supervised | Phase 1, then 5 |
| **An in-process Python plugin** | a Hermes platform plugin, if Hermes should start messages in Chips itself | Raw wire from the JSON Schemas | A Python SDK, only then |

**What will look wrong on day one, with any of them:**

- **Unknown tools draw as a plain dot.** The thinking strip's kinds come from a table built from
  Jacobian's 32 and OpenClaw's 10 tools (`packages/core/src/bubbleSays.ts:44-49`), and the
  `tool · given` title convention (`:95-107`).
- **Background work draws as plain edited messages.** The queued-turn bubble reads Jacobian's
  `💭 / ▸ / ⏳` text convention (`packages/core/src/taskWords.ts`), which no other harness writes.
- **"X hasn't picked this up · 40s"** appears when a harness is slow to send anything (ADR 0083).
  A harness that thinks before its first event must send `run.started` first.
- **A bare `NO_REPLY` outside a run may leave that line standing.** The server turns it into
  `turn.passed` (`submit-event.ts:251`), and no client reads `turn.passed`. To verify in Phase 0.
- **The dial lies for a harness with its own permissions.** The link turns `autonomy` on by
  default (`LINK_DEFAULTS`); a harness that never reads the level shows a dial that changes
  nothing.
- **A run that never ends** keeps the thinking bubble until that harness's next run.
- **Without `agents`**, which the link can't grant, the harness is shown the pre-agents way: one
  face, no Agents tab entries of its own.

## 5. The plan

Each phase ends green and committed: Chips on its own `claude/…` branch, fast-forwarded to main;
other repos in their own worktrees. Pushing, publishing and going live are his word.

### Phase 0 · Truth and small fixes (Chips; built 14 October 2026)

The things a newcomer hits in the first hour, each small.

- **The link's switches** (core `join.ts` `OFFERED`, `apps/web/src/app/Join.tsx`): every
  capability, each with words, in the switch rows the link already draws. Defaults unchanged: the
  dial on, the rest off. (Turning `agents` on by default was weighed and left: a harness that
  never learnt agents would be shown the agents view, ADR 0087's addendum.)
- **Change them later.** The harness card on the web and the Mac gets *What it may do*, the same
  switches, saved through `PATCH /v1/harnesses/:id` as `chips declare` is (core
  `declareCapabilities`, `patchJson`). ADR 0046 holds: a person grants, the owner or an admin (the
  card offers it to whoever may hand the harness on). The phone keeps adding by link only.
- **The CLI:** `chips declare` help lists all 11 from `HARNESS_CAPABILITIES`; `chips connect
  custom --capabilities a,b`; `chips conformance custom --capabilities a,b` so a harness
  author can test new rooms and forks.
- **`turn.passed`:** confirmed: no client folded it, so a bare `NO_REPLY` outside a run left
  *hasn't picked this up* standing under a person's message. Core now folds it (`Space.passed`)
  and `waitingOn` counts a pass after the message as heard. Phone, web and Mac alike.
- **Docs:**
  - `connect/index.md`: drop Claude Code from "Not yet"; add a "How far will my harness get"
    table (§2's levels) and which capabilities each level needs.
  - `concepts/harness.md`: one connection is one harness with many agents (ADR 0087).
  - `reference/http.md` and `reference/frames.md`: the missing routes (harness registration and
    `PATCH`, tokens, the four settings' `PUT`/`GET`/changes) and frames (`context.edit`,
    `model.change`, `heartbeat.change`, `context_window.*`), by hand like the rest of both pages.
  - `operate/cli.md` and `connect/conformance.md`: `--capabilities`.
  - A new `connect/managed.md`: context files, models, heartbeats, context windows. One section
    each, with the frame, the PUT and the capability.
  - A new `connect/checklist.md`: what a harness must do or the room looks wrong (§4's list),
    and the conventions it should keep (`NO_REPLY`, the room note, ending runs).
- **Tests:** core (every capability offered with words; `declareCapabilities`; the fold and the
  wait), the web shell (the card's list sends the whole list), the CLI (`connect` and
  `conformance` with `--capabilities`), and the docs build's link checker. No e2e: the card's list
  is one component over a route `chips declare` already exercises.
- **Live:** `pnpm build`, `pnpm phone build`, `pnpm desktop`. No server change, so no 4431
  restart.

### Phase 1 · The SDK does the boilerplate (Chips; built 14 October 2026)

**Built:** items 1–5 below, about 600 lines of SDK (`settings.ts`, `files.ts`, `store.ts`,
`prompt.ts`, `run.track`), with tests against a real chipsd (`settings.test.ts`, `files.test.ts`,
including a piece lost mid-upload and a run ended after a restart) and an executed docs sample
(`apps/docs/samples/keep-an-agent-in-step.ts`). **Left, on purpose:** item 6 is already there
(`agents.register` finds by key, so it is `ensure`), and rebuilding missed `message.new` waits
for a bridge that needs it; item 7 is moot, since Chips keeps This session and Always itself (ADR
0080, found in Phase 6); item 8 for a harness whose
restart takes long enough to matter. The original list, as planned:

1. **Settings frames.** `connect({ accepts })` sends what the harness takes. Handlers:
   `onContextEdit`, `onModelChange`, `onHeartbeatChange`, `onContextWindow`. One `settings`
   helper does frame → write → re-read → PUT, and `settings.refresh()` after a turn. One shape
   for all four, replacing what each bridge wrote four times.
2. **Files.** `upload(path | bytes)` in pieces with resume (ADR 0052); `download(attachment)`
   with the bearer; room files with `replaces` and the stale-file retry (ADR 0099).
3. **A memory that survives a restart.** A `store` option (default: a JSON file beside the key
   `join()` keeps): the cursor, the outbox, the approval and question id maps, open runs.
   On start, a run a crash left open is ended (`run.failed`, "the harness restarted").
4. **Run bookkeeping.** `run.step(name, fn)` opens and closes a step around a promise; writes in
   order per run; nothing after the end; `run.costTicker(15_000)`; a goal never empty.
5. **What a turn is told.** `turnPrompt(message)` returns the room note, the catch-up, the
   referee's note and the words, in the order both bridges converged on, within a budget. Both
   bridges' versions are the test vectors.
6. **Agents and rooms.** `agents.ensure(key, name)` (register or find); `rooms` that follows
   attach/release/replace; `onSpaceAsked` → `claimSpace` already exists; `catchUp()` rebuilds
   missed `message.new` from `/v1/events`.
7. **Approvals.** `approval({ …, scopes })` returns `{ decision, scope }` and downgrades a scope
   the harness says it can't keep (Phase 6 makes that a field).
8. **Health.** `reportTrouble`/`reportOk` exist; add `holdDuringRestart()`.

Tests: the SDK's own gateway test double grows with each item; conformance gains a scenario per
capability (Phase 7 finishes it). Docs: `connect/sdk.md` gets an executed sample per item.
Nothing live.

### Phase 2 · Prove it on a real bridge (OpenClaw bridge; ~3 days; his call)

Port `~/Work/chips-openclaw/bridge` onto the SDK, one class of §2 at a time, its 216 tests green
after each. Expected: 5,500 lines down to 2,000–2,500. What's left is the measure of how
harness-specific a harness is.

This ends the bridge's test property "written from the public docs only, imports nothing of
Chips" (test D1). That property did its job in September; a bridge on the SDK is what other
people will write. If he'd rather keep it, the alternative is **Scout grown into a reference
harness** that wraps a real model loop. That's cheaper to do but proves less.

Jacobian stays as it is: its channel works and must keep working without Chips installed (ADR
0051). It can adopt the SDK once it is published, on his word.

**Built (14 October 2026), on the bridge's branch `feat/sdk-port` (d543235), not live:** the wire
client (class 1), settings (5, four times over), media (8) and health and restart (9) are the
SDK's. Each settings module's change returns the copy or throws `Refuse`, and the SDK answers. The
bridge keeps what is its own: events handed over one at a time, the cursor kept only once one is
handled, and Chips retried at start. The bridge had 216 tests, not 22; with six new ones against
the conformance kit's fake Chips, 222 pass. `scripts/vendor.sh` refreshes the SDK from a Chips
checkout.

**What it measured.** Source went from 5,457 lines to 5,374, not to 2,000–2,500: the estimate was
wrong by an order of magnitude. The bridge's bulk is OpenClaw's, and the rest resists the SDK for
one reason: the bridge writes runs, steps, approvals and room-file posts as its own events with
ids derived from OpenClaw's, so that a restart writes the same events again and Chips answers them
as duplicates. The SDK's `Run` mints its keys, so classes 2, 3, 4, 6 and 7 stay the bridge's until
the SDK can take a harness's own keys for a run's events. That is the next SDK change worth making
(stable keys from ids the harness gives: run, step, approval), and the reason Phase 2 stops here.
What the SDK gained from the port, all generic: an ack's `held` and `exchange`, `request()` for any
route, `openSpace(key)`, copies sent once and in order per agent, `settings.forget`,
`contextWindowFailed` for a compaction that fails after it was taken, and `hear()` returning the
answer's promise.

**To go live (his word):** Chips main carries the SDK change (no server change, no 4431 restart);
on the bridge, fast-forward main to `feat/sdk-port`, `scripts/vendor.sh` in the main checkout, and
restart the live bridge. Rolling back is `git checkout 74b00c2` in the bridge and a restart.

### Phase 3 · Publish (release workflow; ~1 day; his call)

Plug-and-play for anyone other than him needs `npm i @chipschat/harness`. Today `@chipschat/harness`,
`@chipschat/protocol` and `@chipschat/conformance` are private 0.0.0, by his ruling of 5 October
("I am not making anything public yet").

- **A, public npm** (recommended when he goes public): the three packages at 0.1.0, Apache-2.0
  as ADR 0128 already says, from the release workflow with provenance. The JSON Schemas as a
  release asset and under `@chipschat/protocol/schema`.
- **B, still private:** packed tarballs on the private draft release, as the install plan's call 4
  says. Enough for his own bridges, not for anyone else.

**Built (B's local half, 14 October 2026):** `pnpm release:sdk [folder]` builds the three and packs
them into `dist/sdk/` (`tools/release/sdk.mjs`); `chips-acp` installs them from its `vendor/`.
Nothing goes on a release until he says.

Either way, `npx @chipschat/conformance --url … --capabilities …` runs the kit without the CLI.

### Phase 4 · A generic ACP bridge (`chips-acp`, its own repo; ~1–2 weeks; his call)

A daemon that runs ACP agents and connects to Chips as one harness, each agent a Chips agent. It
lives outside this repo, as the OpenClaw bridge does (`~/Work/chips-acp`, a local repo with no
remote until he says), and is built on `@chipschat/harness` from Phase 1. ADR 0041 is kept: the bridge
owns the agent processes, so the bridge is the harness, which is exactly the shape ADR 0041 found
"verified as possible" and gave to "something that owns those processes".

- **Configuration:** a list of agents, each `{ name, command }` for stdio (`["goose", "acp"]`,
  `["gemini", "--acp"]`, `["npx", "@agentclientprotocol/claude-agent-acp"]`) or `{ name, url }` for
  WebSocket (`goose serve`), with a working folder. Joined by a link, `--no-dial` (an ACP agent
  has permission modes of its own), declaring `agents`, `new_spaces`, `follows_rooms`,
  `new_agents`, `restarts`, `models` and, where it applies, `context_files` and `heartbeats`.
- **A room is a session.** `session/new` with the room's folder as `cwd` on first message or when
  a room is asked of it; the map room → session kept on disk; `session/load` (or `resume`) after a
  restart where the agent offers it, else a new session with the room's context.
- **A message is a prompt.** `message.new` → `session/prompt` with the room note, the context and
  the words, files as resource links. One turn at a time per session: a message during a turn is
  queued (`receipt: queued`), and Stop is `session/cancel`. Steer is cancel-and-prompt, or Goose's
  `session/steer` where offered.
- **What comes back.** Message chunks gather into one `message.post` at the turn's end; thought
  chunks are `run.status`; `tool_call`/`tool_call_update` are `step.log` by `toolCallId`, with
  the tool's `name` and `kind`; `plan` is `run.plan`; `usage_update` is `context.usage` and a
  `usage` with its cost; compaction is `checkpoint`; `notice` is the run's status, or trouble
  when it is an error; the prompt's `stopReason` ends the run.
- **Asks.** `request_permission` → `approval.request`, its options mapped to scopes
  (`allow_once` → once, `allow_always` → always) so the card offers only what the agent can keep;
  the answer selects the option, Stop answers `cancelled`. `elicitation/create` (form) →
  `question.ask`: an enum is options, a boolean is yes/no, a string is free text.
- **Settings.** `configOptions` of category `model` and `thought_level` → the agent's Model group
  (`models`); `AGENTS.md` and the agent's own instruction file in its folder → Context files.
- **What ACP lacks, the bridge supplies.** The bridge passes every session an MCP server of its
  own (`mcpServers` in `session/new`) with three tools: *say this in the room later* (a reminder or
  a scheduled turn, kept by the bridge's clock, ADR 0157), *ask a person* (a question card), and
  *post a file*. A heartbeat is the bridge's own timer prompting the agent. So schedules and
  heartbeats work for every ACP agent, not only Goose.
- **Never offered to the agent:** the client's `fs/*` and `terminal/*` capabilities. The agent
  uses its own tools under its own permissions, which is what the approvals are about.
- **Sub-agents later:** with `clientCapabilities.subagents`, a child session is a lane.

Tests: a scripted fake ACP agent (stdio, in the bridge's tests) for every mapping above, and
`chips conformance custom --capabilities …` against the bridge. A live check needs at least one
real agent installed and signed in to a model, which is his: Codex is on this Mac already;
Goose, Gemini CLI or OpenCode would each be an install he says yes to.

Size: about 1,500–2,500 lines on the SDK.

**Built (first cut, 14 October 2026; local repo, commit 06cb6e6, no remote):** about 1,100 lines
(and 550 of tests) on the SDK. Stdio agents from a config (`~/.chips-acp/config.json`), joined by
link or code, declaring `agents` and `restarts`. The first agent is the Main agent, moved into the
harness's own room in the place of the default agent Chips gave it, and answers for that default
agent wherever Chips puts it. A room is a session (kept, loaded where offered); prompts, status,
steps, plan, gauge, cost, the reply, `NO_REPLY` as a pass, approvals (allow always → `allow_always`,
`approval.executed` when the call ends), form questions (choices and yes/no only), Stop, steer,
Restart, trouble while an agent is down, respawn with back-off, and a message waiting up to 15 s for
its agent to come back. 13 tests: a scripted ACP agent in process and as a child process against the
kit's fake Chips, and the golden scenario (passes, no warnings). **Not built yet:** WebSocket
agents, `new_spaces`/`follows_rooms`/`new_agents`, models from `configOptions`, context files, the
bridge's MCP server and heartbeats, a folder per room, sub-agents, free-text form fields. **Live check (14 October 2026, on his "install the adapters and do the live check"):** Claude
Code through `@agentclientprotocol/claude-agent-acp` and Codex through
`@agentclientprotocol/codex-acp`, on 4431. Both pass after four fixes: a `mode` per agent, since
both adapters start where the agent decides alone; the reply as the last words; the agent named on
the gauge; the whole @name off the goal. `testing/scenarios/harnesses/acp-agents-live.md`.


### Phase 5 · Native bridges where ACP falls short (own repos; when he wants one)

ACP gives the supervised level to dozens of agents and stops short of personas, schedules of the
harness's own and richer cost. Two harnesses are worth a native bridge when he wants them:

- **Hermes Agent**, on its Runs API (`POST /v1/runs`, SSE events, `POST …/approval`, `/stop`) and
  Jobs API (schedules), with profiles as agents. The most OpenClaw-like of them, in TypeScript on
  the SDK, ~1,500 lines.
- **OpenCode**, on `opencode serve`: sessions, permissions, questions, per-message cost, child
  sessions, and its list of agents. ~1,000 lines.

**Built (14 October 2026), Hermes, on his "Proceed with phase 5"** (no pick between the two; Hermes
taken because OpenCode already reaches Chips through `chips-acp` as `opencode acp`, while
`hermes acp` lacks Hermes's messaging and schedules): `~/Work/chips-hermes`, a local repo
(ee801da), about 920 lines and 530 of tests.
- **What it maps:** each profile is a Chips agent, the first the Main agent, reached at `/p/<profile>`
  or a gateway of its own. Each room is a Hermes session made with `POST /api/sessions`.
  - A message is `POST /v1/runs`.
  - `reasoning.available` and `message.interim` are the status.
  - `tool.*` and `subagent.*` are steps with kinds; a sub-agent's `cost_usd` is the step's cost.
  - The run's tokens go as a step's share, so a turn's runs add up.
  - `approval.request` is a card, answered with once, session, always or deny as Hermes offers,
    and `approval.responded` from Hermes's own tools settles it (ADR 0079).
  - Stop, steer, follow-up and interrupt map onto `stop` and `steer`.
  - `GET /health` is the harness's trouble.
  - A lost stream is read from `GET /v1/runs/{id}`.
- **Tests:** 15 against the conformance fake and a scripted Hermes, golden scenario included. It
  reaches Lives in Chips 1 of 6 (`agents`).
- **Not yet:**
  - Hermes's clarify questions (undocumented event).
  - Its cron jobs as Chips schedules.
  - Its model list (`/api/model/options`) as `models`.
  - Context files.
  - A gauge.
- **Found:** Hermes v0.20.6's API server counts itself unattended, so dangerous-command
  approvals never reach `/v1/runs` (issue #98728, open, fix in PRs). Until it lands only MCP
  consent reaches Chips as a card.
- **Live check:** needs Hermes installed and its API server keyed. That's his.

**Built (14 October 2026), OpenCode, on his "let's add support for open code as well":**
`~/Work/chips-opencode`, a local repo (b5005b1), about 1,340 lines and 730 of tests.
- **Which OpenCode:** 2.0 (`@opencode/cli` 2.0.29, what its install script and Homebrew give on
  14 October). Its server is now a V2 API under `/api`, not 1.x's `/session` and `/event`. Basic
  auth is `opencode` and `OPENCODE_PASSWORD`. Read from its source (`packages/protocol`,
  `packages/schema`).
- **What it maps:** each configured OpenCode agent (`build` by default) is a Chips agent, the first
  the Main agent. Each room is a session of that agent, made with `POST /api/session`, and it shows
  in OpenCode's own apps.
  - A message is a prompt into the session's inbox. The run lasts from `session.inbox.delivered`
    of its words to `session.execution.succeeded`, `failed` or `interrupted`.
  - Reasoning, words on the way and retries are the status.
  - `session.tool.*` are steps with kinds. The `subagent` call is a handoff, and its child
    session's cost and asks are the run's.
  - Each `session.step.ended` is a step's exact cost and tokens, and the context gauge (the window
    from `GET /api/model`).
  - `permission.asked` is a card, answered `always` or `once`, or `reject` with the person's
    reason. `permission.replied` from OpenCode's apps settles it (ADR 0079).
  - A question form (choices or yes-or-no, at most four) is a Chips question.
  - The reply is the last answer's words.
  - Stop is an interrupt, with untaken words withdrawn. Steer and follow-up are OpenCode's own
    `steer` and `queue` deliveries. An interrupt is interrupt-then-prompt, which OpenCode starts
    afresh.
  - `GET /api/info` is the harness's trouble. The event stream is one per server and doesn't replay
    what was missed, so after it drops, each turn's session is read again.
- **Tests:** 18 against the conformance fake and a scripted OpenCode server, golden scenario
  included. It reaches Lives in Chips 1 of 6 (`agents`).
- **Unlike Hermes,** OpenCode asks by default (its rules fall back to "ask"), so its permission asks
  do reach Chips.
- **Not yet:**
  - Free-text and number form fields.
  - Taking back a question answered in OpenCode (Phase 6's "ask withdrawn").
  - Its models as `models`.
  - Commands, skills and context files.
  - More than one server per bridge.
- **Live check:** needs OpenCode installed, signed in to a provider, and `opencode serve` with a
  password. That's his.

**A Python SDK** waits for a harness that needs Chips in-process in Python: a Hermes platform
plugin, if Hermes should start messages in Chips on its own. The JSON Schemas
(`packages/protocol/generated/schema`) are its starting point, generated into pydantic in CI so it
can't drift.

### Phase 6 · The wire, where harnesses differ (Chips; small items; 4431 restart)

Each is small, and each is worth doing only when a harness needs it. Listed with the harness that
would.

| Item | Why | Size |
|---|---|---|
| `step.log.kind` (search, web, shell, edit, file, …, optional) | Unknown tools stop drawing as a dot; `bubbleSays`'s table becomes the fallback | protocol + core, small |
| Background work as a typed message: `message.post.progress` `{ thought?, calls?: [{ kind, title }], stuck?, done?: { elapsed_ms, steps } }` | `taskWords.ts` parses Jacobian's emoji text, which no other harness writes. Jacobian keeps a message, not a run, for a queued turn on purpose (`task-bubble.ts`: a run there would receipt "queued", hide behind the next run, and never end if Jacobian died), so the fix is a field, not a run | protocol + core reads it first (text stays the fallback); Jacobian adds the field beside its text |
| `approval.request.scopes` | A harness says which of once/session/always it can keep (OpenClaw finding 4; ACP's options) | protocol + both apps' card |
| `approval.withdrawn` | The harness answered or timed out its own ask elsewhere (OpenClaw's gap) | protocol + server + apps |
| `usage.cache_read_tokens`, `cache_write_tokens` | Priced right; every API model has them now | protocol + pricing |
| `task.child.ephemeral` | Sub-agents as lanes without registering an agent per child (rule 3) | server `route-lane.ts` + cleanup |
| Lane delivery from the harness | `direct`/`delivered` are in the enum and never written (rule 4) | server |
| Unknown fields warned | Zod strips them silently today; a bridge author never learns a field was dropped | server, one log line per new field per harness |

Only the first two change what he sees with Jacobian and OpenClaw today. The rest wait for the
harness that needs them.

**Built (14 October 2026), on his "proceed to next phase" (ADR 0162):** read against main, two rows
were already done. `approval.withdrawn`'s case, an ask answered in the harness's own tools, is ADR
0079. `scopes` is moot: This session and Always are rules Chips keeps itself, whatever the harness
can (ADR 0080). Built, because the ACP bridge needs them now:
- `step.log.kind`, drawn by the bubble when the tool's name isn't known.
- `usage` with its cost alone (`output_tokens` optional), so an ACP turn no longer says *0 out*.
- A field Chips drops is now said: `parseEvent`'s `dropped`, one line per sender and field in
  chipsd's log, and a `!` in the conformance report.

`chips-acp` sends both. Waiting for a harness that needs them: the typed progress field (core reads
Jacobian's text, and the field would mean changing Jacobian for nothing seen), cache tokens (every
harness here sends its own cost), `task.child.ephemeral` and lane delivery, and an ask withdrawn
with no answer.

Live 14 October 2026, 08:50 PDT, on his "Push and go live": 4431 restarted, the web dist, the Mac
app and his iPhone rebuilt; one OpenClaw turn checked, and nothing either harness sends is dropped.

### Phase 7 · Conformance and the gallery (Chips + the install plan's Phase 4)

- **A scenario per capability:** agents routing and `for`, new agents, forks, restarts, follows
  rooms, context files, models, heartbeats, context windows, room files, `NO_REPLY`, schedules.
- **A report by level** (§2): "Talks ✓ Supervised ✓ Lives in Chips 4/6 Managed 0/5".
- **The gallery** (install plan §3.4): one entry per connector as docs content, `verified` from
  the lab; `chips-acp` lists each ACP agent it was checked with.
- **The lab's L4:** each listed connector against a scripted model on a clean machine, per
  release.

**Built (14 October 2026), on his "proceed to next phase":** the kit now checks each capability a
harness declares, after the golden scenario, and reports four levels.
- **The fake Chips gained** the settings copies (`PUT` for context files, model, heartbeat and
  context window, each checked against the protocol's schema), `PUT /v1/harnesses/:id/status`,
  `hello`'s `accepts`, and the `restart` and settings frames.
- **The checks** (`checks.ts`), in addition to new spaces and forks:
  - a new agent asked for in a room must join it;
  - for each settings capability, a copy must be sent, and a change to what the copy already says
    must be answered, saved or refused;
  - a Restart must bring the harness back, by a new connection or `ok`.
- **Not checkable from outside:** `agents`, `follows_rooms` and `autonomy` are said as declared.
  The levels count these, but not a declared capability that fails.
- **The levels:** Lives in Chips is the six capabilities `agents`, `new_spaces`, `forks`,
  `new_agents`, `follows_rooms` and `restarts`. Managed from Chips is the other five:
  `context_files`, `models`, `heartbeats`, `context_windows` and `autonomy`, the dial in place of
  room files, which no capability declares.
- **The gallery** (`/connect/gallery/`) is a hand-written page:
  - Scout: kit, Lives 1 of 6.
  - `chips-acp`: kit with a scripted agent, Lives 2 of 6 (its own test now asserts that).
  - The OpenClaw bridge: live, declared 4 + 4.
  - Your own.
  - Jacobian stays off it, as the install plan says.
- **Left:**
  - Room files, `NO_REPLY` and schedules have no capability, so no check.
  - Routing by `for` would need the harness to place a second agent of its own.
  - The gallery as data the app fetches, and `verified` stamps from a lab, are the install plan's
    Phase 4.

## 6. What this plan deliberately leaves alone

- **Capabilities in `hello`.** Still rejected (ADR 0046). A person grants; Phase 0 just lets them
  grant all of it, and change it later.
- **Chips owning agent processes.** ADR 0041 stands: `chips-acp` is a harness of its own, in its
  own repo, connected like any other.
- **Harness names in shipped code.** The guardrail stays; the gallery is data.
- **Jacobian's channel.** It keeps working without Chips installed (ADR 0051).

## 7. Risks

- **ACP moves fast.** Pin the ACP SDK version in `chips-acp` and test against each listed agent in
  the lab, as the bridge pins OpenClaw's gateway client.
- **An SDK that knows too much** becomes a framework. Each helper stays optional, and the raw
  `chips.on`/`post` stay first-class; Phase 2's port is the check.
- **Publishing freezes the wire.** Once outside people build on it, a change needs a deprecation
  path. That is M7.6 (protocol 1.0) in the technical plan; publishing at 0.x says so.
- **An agent the bridge runs does something unasked.** The bridge offers no file system or
  terminal of its own, and every permission the agent asks for is a Chips approval; an agent
  whose own mode is "approve everything" is the person's choice, said on its card.

## 8. His calls

1. **Which harness is "tomorrow's"?** It picks the order: Goose, Gemini CLI, OpenCode, Codex,
   Claude Code → Phase 4; Hermes → Phase 5's Hermes bridge after Phase 1; OpenHands or another
   server → Phase 1. Recommended without one, and taken: 0, 1, 4.
2. **Phase 0's switches:** every capability on the link, and a list on the harness page to change
   them later. Recommended: yes.
3. **Phase 2:** port the OpenClaw bridge onto the SDK (ends its "public docs only" property), or
   grow Scout into the reference instead. Recommended: port. Taken on his "proceed to next phase",
   14 October; built, waiting for his go-live.
4. **Phase 3:** public npm now, or tarballs until he goes public. His 5 October ruling says
   tarballs.
5. **Phase 4:** a `chips-acp` bridge as its own repo, which takes Codex and Claude Code back in
   as ACP agents a daemon owns (ADR 0041's own "only track sessions Chips started", with the
   bridge, not Chips, as the owner). Recommended: yes. Installing an agent to test it live (Goose,
   Gemini CLI, OpenCode) and signing it in are his.
6. **Phase 5:** which native bridge, if any, and when. A Python SDK only for an in-process Python
   plugin.
