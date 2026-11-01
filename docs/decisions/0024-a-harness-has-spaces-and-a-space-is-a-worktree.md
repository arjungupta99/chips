# 0024. A harness has spaces; a space is a worktree; a session is a visit

4 September 2026 · Status: accepted · Narrowed by [0041](0041-chips-integrates-harnesses-that-run-themselves-not-the-cli-you-sit-at.md)
· Decision 3 and the addendum of 5 September on Jacobian's Spaces superseded by [0087](0087-a-harness-has-agents-and-an-agent-is-in-one-room.md), 29 September 2026: a Space is an agent, not a room

Decided with Arjun before M2.3, from the question "I work in several Claude Code and Codex
sessions at once, each on something different, and Jacobian has Spaces — how does that look in
Chips?" — and, the same day, from his naming of the two things on screen: **harness** and
**space**, not agent and chat. The blueprint's "Harnesses and sessions" section draws it; this
records why.

## Context

The protocol already has two rules for this (`docs/openclaw-class-harnesses.md`, section C):
one Chips conversation is one harness session and the adapter owns the map, and one connection
may present many participants. Neither says what a *session* is for a harness whose session is a
process that comes and goes, nor where its durable context lives, nor what a person should see
when five of them are open.

**The words.** The blueprint had called the software participant an *agent* and the place it
works a *conversation* — in the UI, a *chat*. Arjun's names for what he actually runs are
harnesses (Claude Code, Codex, Jacobian), and what he opens with each of them are spaces;
Jacobian already uses that word for exactly this, a unit of work with its own memory. Naming the
participant after the software also removes a question: there is no persona to carry over when
the software changes, only the spaces and their history.

What Claude Code is, from its own documentation on 4 September 2026:

- A session is a process. Every hook payload carries `session_id`, `cwd`, `transcript_path` and
  `permission_mode`; `SessionStart` and `SessionEnd` fire when a terminal opens and closes.
- Its durable context is the project directory. `CLAUDE.md`, auto-memory under
  `~/.claude/projects/<project>/memory/` and the session picker are all keyed by it, and a
  worktree is its own unit of parallel work (`--spawn worktree`; the worktrees page). Two
  sessions in one directory "can conflict if editing the same files" — its words.
- There are two ways to speak into a session from outside. A *channel* — an MCP server that
  declares `claude/channel` and pushes `notifications/claude/channel` — reaches a session that
  is open; it is a research preview, a custom one needs
  `--dangerously-load-development-channels server:<name>` on every launch, the model sees the
  message as a `<channel source=…>` event and answers through the channel's reply tool, and
  interactive tools are disabled when channels run under `-p`. `claude -p --resume <session-id>`
  appends a real turn to a closed session's transcript, from any directory, with the hooks still
  firing; if the session is also live in a terminal, the two interleave.
- A subagent is a lane's worth of work: `agent_id` on the hook payload, `SubagentStart` and
  `SubagentStop`.

What Jacobian is: a Space is a unit of work with its own memory, tools and ledger
(`docs/jacobian-to-chips-mapping.md`), and that memory lives in the Space's bundle, never in the
channel it talks through.

What Codex is: an app-server protocol (`thread/list`, `thread/resume`, `turn/start`,
`turn/steer`, `turn/interrupt`, approvals as JSON-RPC requests) that its own TUI is a client of,
and hooks with `command` and `mcp_tool` handlers and no `http` type. Whether a second client on
a thread receives approval requests is not documented.

## Decision

1. **The nouns.** A **harness** is the participant that is not a person: Claude Code on a
   machine, Codex on a machine, Jacobian on the Mac mini. A **space** is where a harness works,
   with you in it; a harness has as many as you open. A **session** is a visit to a space. Runs,
   lanes, approvals, policy and events are unchanged. *Agent* survives only as the generic word
   for what a harness runs, and in the protocol's name, Agent Connect; *chat* survives only as
   the medium ("a chat app"). The blueprint's Nouns section and the plan's section 6.1 say so
   from today. Whether the code, the wire (`agent_id`, `conversation_id`) and the schema follow
   is the plan's open decision 5: the same-word rule wants one rename, there is no third party
   yet, and the adapter M2.3 writes would otherwise be born in the old words.

2. **A harness is the software on a machine**, with one owner, its own tokens (ADR 0023), one
   policy and one budget. `chips connect <harness>` creates it and names it after the software
   and the machine; run twice on one machine, it finds the harness it made rather than making
   another. `chips disconnect <harness>` undoes what `connect` wrote, from the record it keeps.
   There is no `--as`: the harness is the identity, so nothing needs carrying over when the
   software changes — the spaces stay, with their history, and the other harness opens its own
   beside them.

3. **A space is keyed by the harness's durable unit of work.** For Claude Code that is the git
   worktree — the toplevel of `cwd` — falling back to `cwd` when there is no repository, and to
   the session when there is no directory worth naming. The adapter owns the map, as rule 1
   says. The title defaults to `<repository> · <branch>` and a person may rename it. A space
   has one harness in it until Phase 3 (M3.3) makes several first-class; two harnesses in one
   worktree are two spaces until then, and M3.3 may merge them. A Jacobian Space is a space —
   the same word on purpose — with J the root space and the tree carried by a parent.

4. **A session is a visit, never a space of its own.** A terminal opens, works, closes; the
   space stays. Every run says which session it came from — `session_ref` is
   `claude-code:<session_id>` and the run carries the transcript path — the space shows which
   of its sessions are live and where, and a person can jump to the transcript. Two sessions in
   one worktree share the space, and their runs are told apart by session; the run panel offers
   one run per live session.

5. **Harnesses roll up across their spaces**: how many sessions are live, how many runs are
   working, how many things need you. The context ring is the most recent run's. `FleetAgent`
   changes shape for this; today it names one conversation and one run.

6. **Two ways in, and the composer says which before you send.** A message to a space with a
   live session goes through the Chips channel into that session; a message to one with no live
   session resumes the most recent session with `claude -p --resume`. Never both on one session,
   because that is the interleaving case. When two sessions are live in one worktree, the
   composer names the one it will use and offers the other.

7. **The docs say plainly what differs.** The model, the system prompt, `CLAUDE.md`, the tools,
   the MCP servers, the memory and the permission mode are the session's on either path — Chips
   runs no model. A message through the channel arrives as a channel event and is answered
   through a reply tool, so Claude treats it as a message from outside; a resumed turn is
   indistinguishable from typing it; questions and plan approval do not come through the
   channel. Where Chips is behind Remote Control for Claude Code alone, the docs say so; where
   it is ahead — one place for every harness, approvals across all of them, an audit log, a
   server you own — is the product.

8. **Memory is the harness's.** Chips holds the log and the supervision. It is not a memory
   store for a harness and does not try to be one for a Space.

9. **Codex stays at M7.3.** Its chat path is the cleanest of the three — Chips would be a peer of
   its TUI — but its hooks have no `http` type, its two-client behaviour is undocumented, and
   Phase 2 has three adapters already. The open question is the plan's open decision 4.

## Consequences

- M2.3 registers `SessionStart`, `SessionEnd` and `UserPromptSubmit` beside the hooks the plan
  named: the first two are what make a session's life visible, the third is what starts a run
  with the prompt as its goal. The plan's M2.3, demo script, Gate 2 focus and section 6.1 were
  edited mid-phase at Arjun's instruction, and `STATUS.md` records that.
- The UI is Needs you · Spaces · Harnesses · Channels. Spaces is one row per space, so a
  worktree is a row and its harness is a tag; Harnesses is one row per harness, rolled up; the
  harness card lists its spaces with their worktree and sessions; a space gains a session strip,
  a "from" tag on messages that came from a terminal, and a line under the composer. All drawn
  in the blueprint.
- `session_ref` gains a format, and the run projection carries the session and the transcript
  path. The event vocabulary does not change here; open decision 5 may rename its fields.
- The Jacobian mapping report's answer — "a Space is an agent with its own conversation" — is
  superseded: a Space is a space, and a `hand_down` is a lane between two spaces of one harness.
  Phase 3's lane model gains that case beside the lane between two harnesses. Presenting
  Jacobian's Spaces as several participants on one connection (`hello.agents`) is no longer the
  shape; whether `hello` changes is M2.4's design or decision 5's rename, not settled here.
- Reopening a terminal in a worktree tomorrow continues the same space rather than starting a
  new one, which is the property Arjun asked for and the one a Jacobian Space has.
- A space whose worktree is deleted keeps its history and stops receiving sessions; a moved
  repository is a new worktree and a new space, with the old one still readable.

## Addendum, 4 September 2026: the code follows

Arjun answered open decision 5 the same day: the code takes the nouns. One commit renames the
identifiers, the files, the UI strings and the docs site; on the wire `agent_id` and
`conversation_id` become `harness_id` and `space_id`, `hello.agents` becomes `hello.harnesses`,
`conversation.created` becomes `space.created`, `participant_kind` is `person` or `harness`;
the tables `conversations`, `agent_tokens` and `agent_policy` become `spaces`, `harness_tokens`
and `harness_policy`; the id prefixes `agt_` and `conv_` become `hrn_` and `spc_`; the SDK
package `@chipschat/agent` becomes `@chipschat/harness`. Two names keep the word: Agent Connect, the
protocol, and the Claude Agent SDK, which is Anthropic's. The migrations were rewritten in
place rather than appended to, because nothing outside a scratch directory held data: a
database or an export made before this commit is not readable by it, and is deleted.

## Addendum, 5 September 2026: which of Jacobian's Spaces are spaces

Arjun, on the first live look at M2.4, with fifty-five rooms on screen: **J and the Spaces
directly under J are spaces** — the ones a person's tasks are performed in. A worker under one
of those, and anything deeper, is not a room of its own: what it says or asks shows in its task
Space's room, attributed as Jacobian attributes it, and the worker level is what lanes carry in
Phase 3. Decision 3's "a Jacobian Space is a space" reads with that: the tree's second level, not
every node of it.

## Addendum, 5 September 2026: two harnesses in one worktree

Arjun answered open decision 6 after M3.5: **merge**, with separate worktrees as the rule
against conflicts on disk. Decision 3's "two harnesses in one worktree are two spaces" is
superseded for worktrees by [ADR 0033](0033-two-harnesses-in-one-worktree-share-one-space.md): a
worktree's key is shared, and the second harness to open it joins the space the first opened. A
JSpace — Chips' name for Jacobian's tree node from here on, at Arjun's suggestion — keeps a key
of Jacobian's own.
