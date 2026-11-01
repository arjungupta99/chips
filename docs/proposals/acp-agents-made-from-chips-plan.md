# ACP agents made from Chips: the +, Add agent and Fork, with no Main agent

**Plan of record, 14 October 2026. Status: built and live, 14 October. Phases 1–4 on his "go with
your recommendations" (A1, B1, C1), in `~/Work/chips-acp` (`38fec3f`, `ee4bbf0`); Phase 5 on his
"Push and go live" and "proceed with Phase 5": two harnesses, Claude Code and Codex, under launchd,
"ACP agents" retired, and the live scenario passed for both
([the run](../../testing/scenarios/harnesses/acp-agents-live.md)).** Arjun: "are we allowed to
create multiple ACP agents? like we create agents in Jacobian and OpenClaw?" Then, of the three
options offered: "OK i am looking for the #3 option. Without them being 'Main agent'. Build the
plan." And of the Hermes and OpenCode bridges: "no. Have Main there", so they keep theirs and
this plan doesn't touch them.

## 1. Where it stands

The ACP bridge (`~/Work/chips-acp`, Phase 4 of the
[open-source harnesses plan](open-source-harnesses-plan.md)) has been live since 14 October, as
the launch agent `chat.chips.acp`. Its harness is "ACP agents", with two agents from its config:
Claude Code (through `claude-agent-acp`) and Codex (through `codex-acp`).
- **Agents come only from the config file.** Each entry is one agent and one process. A new one
  means editing `~/.chips-acp/config.json` and restarting the bridge.
- **Claude Code is a Main agent** only because it is first in the file. A Main agent stays in its
  Main room: the apps won't move it anywhere else (ADR 0087, rule 7).
- **It declares `agents` and `restarts`, nothing more.** So Chips doesn't offer it in the + for a
  new space, on a room's Add page for a new agent, or for Fork.

## 2. What Chips already gives a harness: nothing to build in Chips

Every flow this plan needs is in Chips today, for any harness that declares it. Jacobian and
OpenClaw use them, and the conformance kit checks each one.

| A person… | Chips sends the harness | The harness answers | Declared as |
| --- | --- | --- | --- |
| picks the harness's face in the + and says what the room is for | `space.created` with `asked_of`, then the first words (`onSpaceAsked` in the SDK) | makes its thing, `claimSpace(room, key, title)`; Chips puts the key's own agent in the room; it answers the first words as that agent | `new_spaces` |
| asks for a new agent on a room's Add page | `agent.asked` with the room and a `name` (ADR 0108) | registers an agent with `madeFor` and the room; Chips puts it there | `new_agents` |
| asks for a copy of an agent (Fork) | `agent.fork` with the agent and the room (ADR 0087) | registers the copy with `forkedFrom` and the room; the copy remembers everything up to now | `forks` |
| deletes an agent | `agent.deleted` | forgets it | — |

A harness with no Main agent is allowed: "a harness without a lead has none" (ADR 0087). Its
own room keeps the agent Chips gives every harness, named after it, as an ordinary agent that
can be moved like any other.

## 3. The decisions (his)

### A. Which kind of agent a new one is

The + and Add agent ask a **harness**, not a kind of agent. A harness holding both Claude Code
and Codex wouldn't know which to make.

| | How | Chips change | Cost |
| --- | --- | --- | --- |
| **A1 (recommended)** | **One harness per kind.** The bridge runs as "Claude Code" and, separately, as "Codex": two harnesses in Chips, two faces in the +, two launch agents. Picking a face picks the kind. | None | Two processes (one each), two join links. Each kind's spend is its own harness's, as Jacobian's and OpenClaw's are. |
| A2 | One "ACP agents" harness; the kind read from the name the person types ("Codex 2" is a Codex). | None | Fragile: a name like "Nova" picks nothing, so the default kind; first names (ADR 0150) make this the usual case. |
| A3 | A Chips feature: a harness offers kinds, and the + and Add page let a person pick one (the ask carries `kind`). | Protocol, server, phone, web and Mac, an ADR | The largest. It would serve OpenClaw templates and Hermes profiles later, but nothing needs it today. |

A1 makes each kind a harness with its own face, spend, Restart and page, which is what Claude
Code and Codex are: separate engines with separate sign-ins.

### B. Where each agent works

Each ACP session has a working folder (`cwd`). That folder is where the agent's files are, and
what Claude Code keys its own memory and sessions by (`~/.claude/projects/<folder>/`).

| | New agent and the + | Fork's copy |
| --- | --- | --- |
| **B1 (recommended)** | **A folder of its own**, `~/chips-acp/<kind>/<agent>`, made empty | **The original's folder**: the copy goes on with the same files, as the conversation it remembers expects |
| B2 | Everyone of a kind in one project folder, set in the config (`"folder": "~/Work/some-repo"`) | The same folder |

B1 is the default; B2 is a config setting for when the agents should work on one repository
together. Both are cheap; only the default is a choice.

### C. What happens to "ACP agents"

Harnesses can't be renamed in Chips, so the two new harnesses join afresh.
- **C1 (recommended):** archive "ACP agents" room, delete its two agents, and remove the harness.
  Its history stays readable in the archived room.
- C2: keep it running beside the new ones. Two Claude Codes would answer to similar names.

## 4. Design (A1, B1, C1)

### The bridge, one kind per run

- **The config names one kind**, not a list of agents:

  ```json
  { "name": "Claude Code", "command": ["claude-agent-acp"], "mode": "default",
    "folders": "~/chips-acp/claude-code" }
  ```

  `npm start <config>` runs one harness; a second config runs the second. Each has its own
  folder for state beside its config, named after it (`state.json` with its agents and sessions,
  and the SDK's store) and its own kept key in the keychain (the key is kept under the harness's
  name).
- **One ACP process per harness, a session per agent and room.** ACP gives each session its own
  `cwd`, so one `claude-agent-acp` serves every Claude Code agent. Today it is one process per
  agent. With agents made from Chips that is a node process each on a Mac mini that already
  swaps under iOS builds.
- **Sessions close when idle.** Each open Claude Code session keeps a `claude` process. A session
  quiet for 30 minutes is closed (`session/close`) and loaded again on the next word
  (`session/load`), which both adapters offer.
- **Agents are records**, kept in `state.json`: Chips's id, the key, the name, the folder, what it
  was forked from, and the ask it answers (so an ask heard twice makes one agent). At start they
  are read from Chips's list: a new one gets a record and a folder, and a record Chips no longer
  lists was deleted while the bridge was away. (Built: Chips sets `lead` only when an agent is
  first registered, so registering again can't clear the Main flag Claude Code carries today.
  Under C1 the harnesses are new, and nothing is ever registered as `lead`.)
- **No Main agent.** Nothing is registered as `lead`. The harness's own room keeps the agent Chips
  gives every harness (named after it); its folder is `<folders>/<harness name>`. A message for
  the harness itself, where no agent is named, goes to the agent in that room.

### The three flows

1. **The +** (`new_spaces`). `onSpaceAsked` → a record and a folder for a new agent, under a new
   key → `claimSpace(room, key, title from the first words)` → Chips makes the key's agent and
   puts it in the room → the bridge reads its id and answers the first words as it. Asked beside
   another harness (`also_asked_of`), the same, and the room's name stays the other's.
2. **Add agent → new** (`new_agents`). `agent.asked` → a record and a folder → `register({ key,
   name: the ask's name, madeFor, spaceId })`. Chips puts it in the room. It speaks when spoken
   to, starting from the room's last lines as Chips hands every agent.
3. **Fork** (`forks`). `agent.fork` of one of ours → `session/fork` of its session in the room it
   is in, with the same folder → the forked session becomes the copy's session in the asked room →
   `register({ key, name, forkedFrom, spaceId })`. An agent with no session yet (it never spoke)
   is copied as a new agent in the same folder. Both adapters advertise `session/fork`. The copy
   is called `<name> · fork`, as Jacobian calls its forks, and Chips numbers it when it is taken.
   A session that won't copy makes no copy, and Chips tells the person.

**Deleted** (`agent.deleted`): its sessions are closed and its record forgotten. **Its folder is
left on disk**: what an agent wrote may matter, and deleting files is not the bridge's call.
**Renamed** in Chips: the record takes the new name. **Archived** and unarchived: nothing to do,
since sessions close when idle.

### Capabilities

`agents`, `new_spaces`, `new_agents`, `forks`, `restarts`. That is Lives in Chips 5 of 6 (all but
`follows_rooms`), up from 2. Managed from Chips stays 0 of 5: models from `configOptions`, context
files and the rest are another plan.

## 5. Phases

Each phase: tests against the conformance fake and the scripted ACP agent, then commit in
chips-acp (local). Chips gets a docs commit at the end. Nothing is pushed or published without
his word.

| Phase | What | Done when |
| --- | --- | --- |
| 1 · One kind per harness | Config of one kind; one process; agents as records in `agents.json`; no `lead`; the default agent in the harness's room; idle sessions closed and loaded again | The existing tests pass on the new shape; a test registers no lead and clears an old one; a session closed when idle is loaded on the next message |
| 2 · New agents | `agent.asked` → a record, a folder, `register` with `madeFor`; `agent.deleted` forgets it and keeps its folder; renames kept | Bridge tests; the kit's new-agent check passes |
| 3 · The + | `onSpaceAsked` → a new agent, the claim, the first words answered as it; `also_asked_of` | Bridge tests; the kit's new-space check passes (it fails a harness that doesn't claim) |
| 4 · Fork | `agent.fork` → `session/fork` in the same folder, the copy registered with `forkedFrom`; a never-spoken agent copied fresh | Bridge tests with the scripted agent's `session/fork`; the kit's fork check passes; the golden scenario at Lives in Chips 5 of 6 |
| 5 · Live | Two configs and two launch agents (`chat.chips.acp.claude-code`, `chat.chips.acp.codex`) replace `chat.chips.acp`; two join links; "ACP agents" retired as C says | The live scenario below passes on 4431 |

Size: chips-acp is about 1,100 lines and 650 of tests today. This adds about 500 and 450.

## 6. The live check (Phase 5)

A new section of `testing/scenarios/harnesses/acp-agents-live.md`, each step for Claude Code and
then Codex:
1. The + with the harness's face and a first sentence: the room is claimed and named, and a new
   agent answers in it, working in a folder of its own.
2. Add agent → new in that room: the agent joins with the name asked and answers when @-mentioned.
3. Fork the first agent into a new room: the copy remembers what was said before the fork, and
   what is said to it after is not known to the original.
4. Move an agent between rooms: no Main agent holds it back.
5. Delete the copy: it leaves, and its folder is still on disk.
6. An agent quiet for 30 minutes: its session closed (the bridge's log), and the next word
   answered with what came before remembered.

**Cost:** about 15 Claude Code turns at $0.05–0.25 each, so $1–3. Codex on his ChatGPT sign-in
reports none.

## 7. Risks

- **`session/fork` in practice.** Both adapters advertise it, but Claude Code keys sessions by
  folder: forking into the same folder (B1) is the safe case, and the one this plan takes.
  Tried, 14 October, on both adapters directly (claude-agent-acp 0.90.0, codex-acp 2.2.2): the
  copy remembered the word said before the fork, the original didn't hear what the copy was told
  after, and a session closed and loaded again remembered.
- **Many sessions at once.** Idle closing bounds the `claude` processes, not the work: ten agents
  answering together are ten engines. Run one heavy thing at a time, as the testing rules say.
- **Agents in the harness's room.** The agent Chips gives the harness is a regular agent; moving
  it out leaves the harness's room empty of agents, which is allowed.

## 8. Not in this plan

- Main agents for the Hermes and OpenCode bridges stay as they are (his word).
- `follows_rooms` (a room archived or deleted in Chips carried to the agent's side).
- Models, context files, heartbeats and the context window from Chips for ACP agents.
- A3, kinds as a Chips feature, unless A1 falls short.
