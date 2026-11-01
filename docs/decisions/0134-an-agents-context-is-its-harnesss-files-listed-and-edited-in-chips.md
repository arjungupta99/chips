# 0134. An agent's context is its harness's files, listed and edited in Chips

Date: 7 October 2026
Status: Accepted, 7 October 2026. Protocol, server and core (Phase 1 of
`docs/proposals/agent-context-plan.md`). The screens are ADR 0135's; the two adapters follow in
Phases 2 and 4.

## Context

Arjun: "I think we'll also need to build the feature in chips to edit Agent context from the
agent detail page." Every harness builds an agent from text it keeps apart from the room: an
OpenClaw agent from its own `SOUL.md`, `AGENTS.md`, `USER.md` and `IDENTITY.md` (one OpenClaw agent
per Chips agent since bridge `f53cef9`); a Jacobian Space from its charter (`CHARTER.md`, or the
default built into Jacobian for the 29 of its 39 Spaces that have none) and its `YOUR_PERSON.md`.
Nobody could see any of it from Chips, nor change it short of opening a terminal.

Two ways were drawn. **A**: Chips keeps instructions of its own per agent and puts them in the room
note every turn starts with (ADR 0092). **B**: Chips shows the harness's own files and saves edits
back to them. His rulings, on the mocks:

- "I want to make sure Chips is not introducing 'new' context for agents on its own, it should
  ideally list whats already there, and then the person has ability to edit from Chips --> Agent
  detail."
- "and if something is shared, that Chips should say so, it should link to the Harness Detail."
- "I am hoping we do not need to hard code Harness specific stuff in Chips."
- "If there are more than 8 then have the UI show message about not supporting them."

## Decision

- **B. Chips adds no context of its own.** It lists what a harness already gives an agent, and
  saves a person's edits back to the harness. Nothing goes in the room note.
- **The harness says what its agents have.** A harness that declares `context_files` sends a copy
  of each agent's set (`PUT /v1/agents/:id/context`) and of its own (`PUT
  /v1/harnesses/:id/context`), whole, when it makes or claims an agent, on connect, and when a file
  changes. Each file names itself (`name`), says what its row says (`title`), what it is for
  (`role`, a closed list that only picks a mark), whether it may be edited (`editable`,
  `why_read_only`), and whether the agent reads a file of the harness's own set instead
  (`shared`, `replaceable`). Chips holds no harness's file names: the guardrails refuse them.
- **Shared says so.** A harness's own set holds what several of its agents read (`used_by`) and
  what a new agent starts with (`for_new_agents`, `new_agents_note`); an agent's file that points
  at one opens on the harness's page. One no agent reads, only copied into new ones, says
  `used_by: 0`, and makes no agent's file of the same name "its own".
- **Eight shown, and the rest named.** At most eight files a set; the rest, and any text over
  64 KB, the harness names in `not_shown`, and the page says Chips does not show them. A ninth
  file sent, or a larger text, is refused (422): nothing is lost in silence.
- **The copies are a registry,** not the log (`context_sets`, `context_edits`, migration 0039),
  as join requests are (ADR 0122): what a person wrote about themselves is not replayed to every
  device. They go with the agent when it is deleted, and with the harness when it is removed.
- **Read by the people who run the harness:** its owner, or an owner or admin of the workspace,
  as restart and removal are (ADR 0078, ADR 0094). A member or guest reads nothing; a harness
  reads its own copies by keeping them.
- **An edit goes down the harness's socket.** `POST …/context/edits {name, text, base_hash}` is
  checked against the copy (the file is there, editable, and its `hash` is still `base_hash`; a
  stale one is `409 stale_context` with the file as it is now), kept as waiting, and sent as a
  `context.edit` frame to the harness's sockets that said `context` in their `hello`, now or
  never, as `restart` is (ADR 0094). With none to hear it, it is refused at once
  (`harness_away`): no queue. `base_hash: null` on a replaceable shared file gives the agent its
  own.
- **The harness's next copy answers it** (`answers`) or refuses it (`refuses`, `changed` or
  `failed`). `GET /v1/context/edits/:id` reads what became of it; one not answered within
  `CONTEXT_EDIT_WAIT_MS` (the minute a fork has) reads as `missed`, worked out when read, never
  stored.

## What is left out, and why

- **Instructions of Chips' own (A).** Two sources of truth, one of them unseen; his ruling.
- **A push to the person's other devices when a copy changes.** The page reads the copy when it
  opens; an edit's own page polls its edit. Nothing else needs to know at once.
- **Versions and diffs.** The harness keeps its files; Chips keeps the copy it last sent.
- **A harness that does not declare `context_files`** gets no Context group anywhere: a control
  that cannot keep its promise is worse than none (ADR 0046).

## Consequences

- Each adapter carries its harness's knowledge: which files, their titles, how to write one and
  detect a conflict. A new harness needs only its adapter.
- One marker crosses the wire: a shared text may hold `‹its name›`, which "Give it its own" fills
  with the agent's name.
- The copy is as fresh as the harness keeps it. A harness that changes a file and does not send
  its copy shows the old text until it does; the edit check still holds, since the harness
  refuses an edit made from an older version.
- `pnpm live context` and `context-edit` read and save them as a person, for the runs of the later
  phases.

## Addendum, 8 October 2026: a count, or none

The acceptance run (finding AC-3) found `used_by: 0` saying two things: OpenClaw's bridge sent it
for the files each new agent is given a copy of, which no agent reads after; Jacobian sent it for
its default charter once every Space had a charter of its own, though each new Space still reads
the default. Chips took both as copied, so a Space given its own charter lost its Its own tag,
its foot said the charter was copied when it was made, and Jacobian's page listed the default as
copied into new agents. A missing count meant "all of them" besides (Jacobian's Always true).

On Arjun's call, a shared file of a harness's set now says:

- **a count, `0` included:** how many of its agents read it. Jacobian counts the default charter
  and Always true over the Spaces its agents are, still in its registry (Jacobian `ca7c9e9`,
  `7fb8bd4`).
- **no count:** no agent reads it; each new agent is given a copy of its own (with
  `for_new_agents`). The bridge leaves it out on `main`'s three files (bridge `25a1161`).

The schema is unchanged (`used_by` was optional), so the server is too; core reads the absence
(`agentContextOf`, `harnessGroups`, `contextFoot`, `contextOpening`, Chips `18d9b094`).
