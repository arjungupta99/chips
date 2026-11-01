# Agent context: what a harness gives an agent, listed and edited on its page

**Plan of record, 7 October 2026. Status: Phase 0 (mocks) done; Phases 1–6 to run, each from
its prompt in §9, after a compaction.** Arjun: "I think we'll also need to build the feature in
chips to edit Agent context from the agent detail page." Then, on the plan's first draft and the
mocks: "I want to make sure Chips is not introducing 'new' context for agents on its own, it
should ideally list whats already there, and then the person has ability to edit from Chips -->
Agent detail", "and if something is shared, that Chips should say so, it should link to the
Harness Detail", "Jacobian version of 'who it is' is the charter", "I am hoping we do not need to
hard code Harness specific stuff in Chips", "If there are more than 8 then have the UI show
message about not supporting them", and "Write the phased implementation plan. Well execute after
compaction".

**The mock is the reference for every screen:** a clickable phone, light and dark, six scenes
that play themselves, built from Chips' own tokens, groups and faces:
<https://claude.ai/artifact/NDCTtC5bqeqXR4fcd6JFKB>. Its source is
`context-hifi/agent-context.html` in the scratchpad of the session that drew it; it stays out of
the repo. (An earlier low-fidelity canvas, <https://claude.ai/artifact/L7rqiyToVmXbuRTMJjF3VM>,
is superseded by it.)

**Agent context** is the text a harness builds an agent from at every turn, apart from the room:
who it is, how it works, what it knows about you. In OpenClaw, an agent's `SOUL.md`, `AGENTS.md`,
`USER.md` and `IDENTITY.md`. In Jacobian, a Space's `CHARTER.md` and `YOUR_PERSON.md` (and J's
`SOUL.md`).

In one line each:

- **Chips adds no context of its own.** It lists what the harness already gives the agent, and
  saves your edits back to the harness.
- **Each harness says what its agents have.** Names, titles, order, read-only, shared and counts
  all come from the harness; nothing about a harness is written into Chips.
- **Shared says so.** A file several agents read is tagged Shared on each and opens on the
  harness's page.
- **Eight at most.** An agent with more shows eight, and a row naming the rest says Chips does
  not show them.

## 0. How to use this document

- **Order.** Run the phases in order. Phase 1 is protocol, server and core, and changes nothing
  anyone sees. Phase 2 makes OpenClaw speak it; Phase 3 draws it on the phone. Phase 4 is
  Jacobian, Phase 5 the Mac and the web, Phase 6 acceptance.
- **Before each phase:**
  - Read §1 to §3, the phase itself, and the memory notes `chips-room-folder-openclaw-agents`,
    `chips-main-is-shared-between-sessions`, `chips-working-agreements`,
    `arjun-judges-ui-from-running-mocks`, `arjun-wants-flat-controls`, `chips-phone-testing`,
    `arjun-merge-as-you-go`, `arjun-wants-me-to-restart` and `chips-testing-folder`.
  - Run `ListAgents`, read `git reflog show main -5`, and check `git log origin/main..main`.
  - Make or reuse a worktree from main on a `claude/agent-context-*` branch; bring it up to main
    with `git rebase main` (main stays linear: replay, never merge), then
    `pnpm install --frozen-lockfile`.
- **Where.**
  - Chips: the worktree above.
  - The bridge: `~/Work/chips-openclaw` (no remote), in a worktree of its own
    (`git worktree add ../chips-openclaw-context -b agent-context`).
  - Jacobian: `~/Work/jacobian`, in a worktree of its own. Nothing is committed in Jacobian
    without his word; on a go-live he has said I commit, fast-forward and restart.
- **Commits.** Conventional Commits, `git -c commit.gpgsign=false commit -s`, ending
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Fast-forward main as each phase lands
  (merge as you go). `ListAgents` and the reflog again before the fast-forward; if a peer has
  just moved main, replay onto a new named branch from main, never a detached HEAD.
- **Gates.**
  - `pnpm check` (lint, typecheck, Vitest, the phone's Jest).
  - The guardrails (`tools/guardrails`, `npx vitest run` there) after `git add` and before the
    fast-forward; read exit codes. `harness-literals` and `no-harness-named` refuse a harness's
    name in product code: no "OpenClaw", "Jacobian", `SOUL.md` or `CHARTER.md` in Chips outside
    tests' neutral fixtures and docs. A test fixture's harness is called something neutral
    ("Lathe"), its files too (`PERSONA.md`).
  - Biome's complexity limit is 12: split a component before it grows past it.
  - The bridge: `npm test` in `~/Work/chips-openclaw/bridge` (124 tests at `9f0d883`).
  - Jacobian: touched suites only, never its full `npm test` (it crashed Colima on 28 September).
  - The phone's Playwright suite (`pnpm mobile:e2e`, 5198) in Phase 3; the web e2e
    (`CHIPS_E2E_WEB_PORT=5199`) in Phase 5. Never two heavy suites at once, never beside
    `pnpm check`.
- **UI.** He judges from the mock and then from his phone. Controls stay flat (no gradients or
  highlights); the cool goes into motion: the pins' running light while saving, the gold landing
  flash, sheets that rise. Walk each UI phase on the iPhone 17 Pro simulator as a Release build
  with stills, against a scratch Chips. Say plainly what was not walked (Android, iOS 27, iPad).
- **Live.** 4431 is live and his. Never pair a new device to it; kill by PID only; `lsof` first.
  Scratch Chips on 4436 (`~/Work/chips-openclaw/scripts/scratch-chips.sh`), the bridge in
  scratch mode (`scripts/bridge.sh start scratch`, which takes OpenClaw away from 4431 while it
  runs), `pnpm live` with `CHIPS_CONFIG_HOME` pointing at a CLI device paired to the scratch.
- **Go-live, only on his word.** I commit and fast-forward, restart what changed (4431 for a
  migration or a server change, the bridge, Jacobian) and check each came back. Phone:
  `pnpm phone build` (builds from main). Mac and web: `pnpm web:build` (4431 serves
  `apps/web/dist`, no restart) and `pnpm desktop`.
- **Push only on his word.** Say which peers' commits a push would carry.
- **Docs.** An ADR for each decision (§7); `docs/STATUS.md`, newest first under "In progress";
  the memory note `chips-agent-context`. Update STATUS and memory at the end of each phase and
  before any compaction.
- **Reports.** Each phase ends with: gates and counts; stills where there is UI; what is on main,
  live, and on his phone, and what is not pushed; the next phase's prompt from §9.

## 1. Rulings

### 1.1 His (7 October 2026)

1. **B, not A.** Chips edits the harness's own files; it keeps no instructions of its own and
   puts nothing new in the room note.
2. **List what is there.** The agent's page shows what its harness gives it, as the harness
   names it, and edits it in place.
3. **Shared says so and links to the harness's page,** where the shared thing is shown (and
   edited, if the harness allows).
4. **Nothing harness-specific in Chips.** Each harness says what its agents have.
5. **Jacobian's Who it is is the charter** (`CHARTER.md`).
6. **More than eight: show eight and say the rest are not supported.**
7. **No backward support.** The OpenClaw agents made before 7 October (sessions of OpenClaw's
   `main`) were deleted on his word at 08:53 PDT (seven agents and the ASCII art room; OpenClaw 5
   and its room kept). Nothing needs to handle an agent that shares `main`'s files.
8. **The UI looks like the mock.**

### 1.2 Taken as drawn in the mock (change any before the phase that builds it)

9. **Only the harness's owner sees and edits an agent's context.** About you is about the owner.
   A guest, or another member, sees no Context group.
10. **A conflict asks.** If the file changed in the harness after you opened it, Save stops with
    "Changed in <harness> while you were editing" and **Keep mine** / **Use theirs**. Nothing
    typed is lost.
11. **Away means read-only.** While no socket of the harness is connected, Save is off and the
    editor says so. No queue.
12. **An edit not answered in 60 s is missed:** the editor says the harness didn't take it, and
    keeps the words. (Phase 6: it says the harness "hasn't answered", since one that answers
    later still saves; AC-1.)
13. **"Give it its own"** is offered on a shared file the harness marks replaceable. It opens
    the editor on the shared text with the agent's name filled in; Save makes the agent's own
    file, and the row turns from Shared to Its own.
14. **OpenClaw's "New agents start with"** is `main`'s `SOUL.md`, `AGENTS.md` and `USER.md` (what
    the bridge copies into each new agent), editable on OpenClaw's page. No agent runs on `main`
    any more (ruling 7); editing them changes `main` itself, which OpenClaw keeps for its own
    system work.
15. **The bridge's fallback goes** (Phase 2): an agent OpenClaw cannot make is refused, and the
    room says so after a minute (as any harness that never answers), instead of quietly
    becoming a session of `main` with shared files.
16. **A file over 64 KB** is listed like a ninth: in the not-shown row, "too large to show".
17. **A Jacobian Space's About you stays edited.** Jacobian's nightly refresh rewrites a Space's
    `YOUR_PERSON.md` when J's knowledge moves; once a person has edited it, the refresh leaves
    it alone (Phase 4). Without this an edit is gone within a day.

## 2. Why, and what is there (read 7 October 2026)

- **OpenClaw** (2026.9.6) has `agents.files.list`, `agents.files.get` and `agents.files.set` on
  its gateway; `set` needs `operator.admin` (the bridge has it) and takes `expectedHash`, failing
  a mismatch with `agent_file_conflict`. Each Chips agent of OpenClaw is an OpenClaw agent
  `chips-<id>` with its own folder (`bridge/src/own-agents.ts`, bridge `9f0d883`), begun with
  copies of `main`'s `AGENTS.md`, `SOUL.md` and `USER.md` (OpenClaw's stock words), plus
  `IDENTITY.md` (OpenClaw writes the name there; Chips' rename goes through `agents.update`).
  OpenClaw agents are told they may rewrite their own `SOUL.md`.
- **Jacobian** reads a Space's kit docs every turn (`src/spaces/kit/turn-kit.ts:597-616`):
  - **The charter** (`manager.getContainerCharter`): the Space's `kit/docs/CHARTER.md`, or
    `defaultCharter` (`src/spaces/kit/charter.ts:49`), eight lines with its name filled in.
    10 of the 39 Spaces have their own, all pack-made (team packs 9 Aug–mid Sep, then the
    single-Space build pack); 29 use the default, every Space Chips made among them.
    `setContainerCharter` writes one (the dashboard's `PUT /api/spaces/:id/charter`,
    `src/gateway/routes/projects.ts:570`).
  - **The soul**: only J's (`~/.jacobian/SOUL.md` → `workers/global/kit/docs/SOUL.md`); no other
    Space carries one.
  - **The person brief** (`YOUR_PERSON.md`): every Space has its own, written at birth by
    `seedStarterKnowledge` (`src/spaces/lifecycle/starter-knowledge.ts`) from J's hand-written
    one; re-curated (rewritten, line 597) when the root's knowledge digest moves.
  - **`SPACE_INVARIANTS`**: six "Always true" rules built from code into every turn.
- **Chips** has an agent page on the phone (`apps/mobile/src/agents/AgentCard.tsx`: hero, Facts,
  History, Acts) and on web and Mac (`apps/web/src/app/Agents.tsx`, `AgentPage`, `CardSection`);
  a harness page (`apps/mobile/src/harnesses/Profile.tsx`, `apps/web/src/app/Harnesses.tsx`);
  grouped rows (`apps/mobile/src/ui/Group.tsx`: `Group`, `GroupRow`, `RowMark`, `GroupFoot`);
  the agent face (`ui/AgentFace.tsx`, pins on a native clock) and the working mark
  (`ui/ChipPulse.tsx`); sheets (`ui/Sheet.tsx`); the landing flash (`spaces/Motion.tsx`).
  Permissions live in core (`packages/core/src/agentsTab.ts`, `mayName`, `mayKeep`…).
  Capabilities a client reads to draw a control are `packages/protocol/src/capabilities.ts`
  (ADR 0046: a control that cannot keep its promise is worse than none).
- **No person-to-harness round trip exists.** Restart is fire-and-forget; Fork and Add agent are
  asked by an event and answered by the harness registering. This plan's edit is the same shape:
  asked by an event, answered by the harness sending its copy.

## 3. The design

### 3.1 Words

- **A context file:** one file an agent is built from, as its harness names it.
- **An agent's context:** its files, in the harness's order, at most eight shown.
- **A harness's context:** what its agents share, and what new agents start with.
- **Role:** one of `identity`, `instructions`, `about_you`, `memory`, `other`. Optional; it only
  picks the row's mark (icon and tint), so Who it is looks the same on every harness. The one
  shared vocabulary, a closed enum in protocol.

### 3.2 Protocol (`packages/protocol/src/context-files.ts`)

**Limits:** `CONTEXT_FILES_SHOWN = 8`, `CONTEXT_FILE_BYTES = 65_536`, `CONTEXT_NOT_SHOWN_MAX = 64`,
`CONTEXT_EDIT_WAIT_MS = 60_000`.

**Capability `context_files`** (`HARNESS_CAPABILITIES.contextFiles`): the harness sends Chips a
copy of each agent's context and of its own, keeps them current, and takes edits. A harness that
does not declare it gets no Context group anywhere.

**A file:**

```ts
{
  name: string;            // its own name, shown small: "SOUL.md"
  title: string;           // what the row says: "Who it is"
  about?: string;          // the row's line; absent → the text's first line
  role?: Role;
  text?: string;           // absent only when `shared` points elsewhere
  hash?: string;           // the harness's own hash of `text`
  editable: boolean;
  why_read_only?: string;  // "Built into Jacobian"
  shared?: string;         // the id of a harness-context file this agent reads instead of its own
  replaceable?: boolean;   // a shared file the agent may be given its own of
}
```

**Harness → Chips (harness token):**

- `PUT /v1/agents/:id/context` `{ files ≤ 8, not_shown ≤ 64: [{ name, title?, reason:
  "count" | "too_large" }], answers?: edit_id, refuses?: { edit_id, reason: "changed" |
  "failed", file? } }`. Sent when it makes or claims an agent, on connect for each agent, and
  when a file changes. A ninth file in `files`, or a text over 64 KB, is a 422: a harness
  cannot lose one silently.
- `PUT /v1/harnesses/:id/context` `{ shared: [file & { id, used_by?: number, for_new_agents?:
  boolean }] ≤ 8, new_agents_note?: string, answers?, refuses? }`.

**A person, the harness's owner:**

- `GET /v1/agents/:id/context`, `GET /v1/harnesses/:id/context`: the copies and when read.
- `POST /v1/agents/:id/context/edits` `{ name, text, base_hash | null }` → `202 { edit_id }`;
  `base_hash: null` on a `replaceable` shared file makes the agent its own. Refused `409
  stale_context` (with the file as Chips holds it) when `base_hash` is already stale, `409
  harness_away` while no socket of it is connected, `403` for anyone but the owner, `404` for a
  harness that does not declare `context_files`.
- `POST /v1/harnesses/:id/context/edits` the same, for an editable shared file.

**Chips → harness:** `agent.context.edit` (workspace event, sender chips, visible to the harness
and its owner only): `{ edit_id, agent_id | harness_id, name, text, base_hash, by }`.

**Chips → the owner's clients:** `agent.context.updated` `{ agent_id | harness_id, names, edit_id?,
outcome?: "saved" | "changed" | "failed" | "missed" }`. No text in the event log: clients re-read.

**Examples, as the two adapters will send them:**

```jsonc
// OpenClaw, OpenClaw 5
{ "files": [
  { "name": "SOUL.md", "title": "Who it is", "role": "identity", "editable": true, "text": "…", "hash": "…" },
  { "name": "AGENTS.md", "title": "How it works", "role": "instructions", "editable": true, "text": "…", "hash": "…" },
  { "name": "USER.md", "title": "About you", "role": "about_you", "editable": true, "text": "…", "hash": "…" },
  { "name": "IDENTITY.md", "title": "Identity", "role": "identity", "about": "Name: OpenClaw 5", "editable": true, "text": "…", "hash": "…" } ],
  "not_shown": [] }
// OpenClaw's own: what new agents start with; nothing shared
{ "shared": [ { "id": "soul", "name": "SOUL.md", "title": "Who it is", "for_new_agents": true, "editable": true, … }, … ] }

// Jacobian, Shore Writer
{ "files": [
  { "name": "CHARTER.md", "title": "Who it is", "role": "identity", "shared": "default-charter", "replaceable": true, "editable": false },
  { "name": "YOUR_PERSON.md", "title": "About you", "role": "about_you", "editable": true, "text": "…", "hash": "…" } ] }
// Jacobian's own
{ "shared": [
  { "id": "default-charter", "name": "CHARTER.md", "title": "Who it is", "role": "identity", "about": "Jacobian's default",
    "editable": false, "why_read_only": "Built into Jacobian", "used_by": 29, "for_new_agents": true, "text": "## Mission …" },
  { "id": "always-true", "name": "Always true", "title": "Always true", "role": "instructions",
    "editable": false, "why_read_only": "Built into Jacobian", "text": "1. Work only inside …" } ],
  "new_agents_note": "and an About you that Jacobian writes from J's" }
```

### 3.3 Server

- **Migration** (next free; 0039 on 7 October): `context_files` (owner kind `agent | harness`,
  owner id, position, name, title, about, role, text, hash, editable, why_read_only, shared,
  replaceable, used_by, for_new_agents, read_at), `context_not_shown` (owner, name, title,
  reason), `context_edits` (id, owner, name, base_hash, text, by, asked_at, state `waiting |
  saved | changed | failed | missed`, answered_at).
- **Use cases:** `put-context` (a harness replaces an owner's set in one transaction, closes the
  edit it answers or refuses, emits `agent.context.updated`); `ask-context-edit` (the checks of
  §3.2, stores the edit, sends `agent.context.edit`); the 60 s miss (on a timer the server
  already runs, as `FORK_WAIT_MS`).
- **Deleting an agent** deletes its copies and edits; removing a harness deletes its own.
- **Routes** in `server/src/interfaces/http/routes/agent-context.ts`, each in the authorization
  matrix (a route cannot be added without a row).

### 3.4 Core (`packages/core/src/context.ts`)

- `contextView(snapshot, agentId, selfId)` → `{ rows, notShown, readAt, harness, away } |
  undefined`; each row `{ name, title, line, role, tag: "shared" | "own" | "read_only" | none,
  opens: "editor" | "harness" | "read_only" }`, so the phone and the web draw the same.
- `harnessContextView(snapshot, harnessId, selfId)` for the harness page: shared rows (with
  `used_by`), new-agents rows, the note.
- `mayEditContext(model, directory, harnessId, selfId)`: the harness's owner, and only while the
  harness declares `context_files`.
- Store: `readContext`, `readHarnessContext`, `editContext(…)` returning the edit's outcome by
  watching `agent.context.updated` (or the 60 s miss), and the `role` → mark map
  (`identity` sparkle on violet, `instructions` list on blue, `about_you` person on green,
  `memory` drawers on sea, `other` page on slate).

### 3.5 OpenClaw bridge (`bridge/src/context.ts`)

- **Declares `context_files`** (`chips declare <id> … context_files`, then a reconnect: OA-6).
- **Sends each agent's files:** whatever `agents.files.list` names and has, minus `BOOTSTRAP.md`,
  in the order `SOUL.md`, `AGENTS.md`, `USER.md`, `IDENTITY.md`, then the rest by name; titles
  Who it is / How it works / About you / Identity / Memory (`MEMORY.md`); anything else keeps
  its own name as its title, role `other`. Beyond eight, or over 64 KB, into `not_shown`.
- **When:** after making or claiming an agent, on connect for each made agent, after each turn it
  ran ends if any hash moved (`agents.files.list` gives sizes and times; `get` and hash only what
  moved), and after a Chips rename (it rewrites `IDENTITY.md`).
- **Its own context:** `main`'s `SOUL.md`, `AGENTS.md`, `USER.md`, `for_new_agents: true`,
  editable; nothing shared.
- **Edits:** `agents.files.set` with `expectedHash: base_hash`; `agent_file_conflict` →
  `refuses { reason: "changed", file }` with the file as it is now; any other error → `failed`.
  A file write is not a config change, so it should not trip OA-2's
  `PreparedModelCatalogConfigReplacedError`: check.
- **Tidy (ruling 15):** the fallback to a session of `main` and the code for keys on `main`
  (`unmade`, `…:asked` claim keys) go; an agent OpenClaw cannot make is refused.

### 3.6 Jacobian adapter

- **Declares `context_files`.**
- **Each Space's files:** Who it is, `CHARTER.md`: its own if it has one (editable), else
  `shared: "default-charter", replaceable: true`; About you, `YOUR_PERSON.md` (editable). J also
  sends its `SOUL.md` (title Who it is, its own) and its brief.
- **Its own context:** `default-charter` (the text with `‹its name›`, read only, `used_by` from
  the Spaces with no charter, `for_new_agents`), `always-true` (`SPACE_INVARIANTS`, read only),
  `new_agents_note`.
- **When:** at registration and on connect; when the charter route, a pack, or
  `seedStarterKnowledge` writes a charter or a brief.
- **Edits:** charter through `setContainerCharter`, brief through `setPersonBrief`, each with the
  hash checked in the adapter first; `base_hash: null` on the default makes the Space's own
  charter.
- **The brief stays edited (ruling 17):** an edit from Chips marks the brief person-written (in
  the starter-knowledge marker); re-curation keeps the selection's facts but no longer writes
  the brief.

### 3.7 Phone (as the mock, scenes 1–6)

- **Agent page** (`AgentCard`): between Facts and History, a **Context** heading with the harness's
  squircle and "<Harness> · <time read>" at its right; a `Group` of marked rows (`RowMark`
  tile by role, title, "`file` · line", and a tag: **Shared** with the harness's mark, **Its
  own** after giving it its own, **Read only** where so); a `GroupFoot` saying what the harness
  gives and where the files came from, with a link to the harness's page. Then, for a
  replaceable shared file, an act row "Give <agent> its own <title>…". More than eight: a last,
  quiet row "N more files not shown" naming them, and the foot: "Chips shows the first 8, in
  <harness>'s order, and doesn't support more than that yet. The other N are still in
  <harness>, and <agent> still reads them."
- **Editor** (`app/agents/[id]/context/[name].tsx`): glass back button, the title, and **Save**
  (glass and grey until edited, gold when edited, the working mark while saving, a green check
  when saved); under the bar the file's tile, name and whose it is; the text in a 22-pt card,
  Markdown's marks dimmed as typed (a `TextInput` takes styled `Text` children; check the caret
  on iOS, else plain text); a glass status capsule at the foot: read at / edited / saving
  (`ChipPulse`) / saved / theirs / away / missed. Saved goes back by itself after a second, and
  the row flashes gold. Leaving with words unsaved asks once.
- **Conflict sheet** (`Sheet`): the agent's face, "`file` · time", "Changed in <harness> while you
  were editing", what each side added (a line diff in green and red soft), **Keep mine** (gold)
  and **Use theirs**.
- **Harness page** (`Profile`): for its owner, **Shared by its agents** (rows with a mosaic of
  faces and the count, opening the read-only page) and **New agents start with** (rows, or the
  harness's note), each with its foot.
- **Read-only page:** the tile, "<name> · built in", a **Read only** tag, the text in a
  surface-2 card, and **Used by** with the mosaic and count.

### 3.8 What is not here

- No history of versions, no full diff view beyond the conflict sheet.
- No editing from a room, no `/context` command, no agent asking Chips to change its files (it
  changes them in its harness, and Chips shows it).
- No rich-text editor; Markdown as typed.
- Nothing for a harness that does not declare `context_files`.
- No queue while a harness is away.

## 4. Phases

### Phase 0 — mocks (done, 7 October 2026)

The prototype above, six scenes; the shapes of §3.7. The deletion of ruling 7 done the same
morning by a subagent on his word (every call 200; OpenClaw 5 kept).

### Phase 1 — protocol, server, core (ADR 0134)

- §3.2 in protocol (`context-files.ts`, the capability, the two events with their visibility,
  limits, the role enum) with zod shapes and tests.
- §3.3: migration, use cases, routes, the 60 s miss, deletes; the authorization matrix rows.
- §3.4: `contextView`, `harnessContextView`, `mayEditContext`, store reads and the edit, the
  role marks.
- `pnpm live context <agent>` (read) and `pnpm live context-edit <agent> <name> <file>` (edit,
  waits for the outcome), for the later phases' runs; the same for a harness with `--harness`.
- **Tests:** protocol shapes (a ninth file and a 64 KB text refused); server Vitest for every
  route and refusal (owner only, harness only, away, undeclared, stale, missed, answers,
  refuses, deletes); core views (shared, own, read only, not shown, away).
- **Docs:** ADR 0134 "An agent's context is its harness's files, listed and edited in Chips"
  (§1, §3.1–3.4; shape as ADR 0112: Context, Decision as bold-led bullets, What is left out,
  Consequences). STATUS, memory.
- **Go-live, on his word:** restart 4431 (migration). Nothing shows until a harness declares.

### Phase 2 — the OpenClaw bridge

*Built 7 October 2026, 18:45 PDT: bridge `0847550` on `feat/agent-context`, 140 tests. Scratch run
with real OpenClaw 19:01–19:11 PDT, all passed (STATUS). LIVE 19:15 PDT with Phase 1 (4431 on
0039, the live harness declares `context_files`, bridge `0847550`).*

- §3.5 in `bridge/src/context.ts`, wired in `bridge.ts`; the fake claw grows `agents.files.*`.
- **Tests:** the order and titles; eight and the rest in `not_shown`; a 70 KB file; an edit
  saved; a conflict refused with the file; a failure; a turn that changes `SOUL.md` sends a
  copy; no fallback (an agent that can't be made is refused); the harness's own context.
- **Scratch run** on 4436 with `pnpm live context` and `context-edit`: read OpenClaw 5-like
  agents; save an edit and read it in the agent's folder; edit `SOUL.md` in the folder while an
  edit is waiting and see `changed`; stop the bridge and see `harness_away`. Tidy as the
  own-agents scenario does.
- **Go-live, on his word:** declare `context_files` on the live harness, restart the bridge, and
  read OpenClaw 5's context with `pnpm live context`.

### Phase 3 — phone (ADR 0135)

*Built 7 October 2026, 20:20 PDT (ADR 0135): the styled `TextInput` held its caret on the
simulator (colour-only marks); phone Jest 675 (18 new), phone e2e 32/32 with `agent-context.spec.ts`; walked as
Release on the simulator against scratch with a stand-in harness (the bridge's own Chips client
and context code, OpenClaw's gateway in memory), so the live bridge stayed on 4431: scenes 1, 2,
3 (both refusals), 6, the harness page, away, missed, the leave ask, light and dark. Not walked:
scenes 4 and 5 (shared, give its own: Jacobian's, Phase 4; Jest covers them), Android, iOS 27,
iPad. Not on his iPhone until `pnpm phone build`.*

- §3.7 for the phone: `AgentCard`'s Context group and its rows, the editor route, the status
  capsule, the conflict sheet, the harness page's two groups, the read-only page, the not-shown
  row, away and missed. Components small enough for Biome's 12.
- **Tests:** Jest for each row tag, each editor state, the discard ask, owner only, more than
  eight, away; the phone e2e (`apps/mobile/e2e/agent-context.spec.ts`): open an agent, edit,
  Save, see saved (a scratch harness answering), see the flash.
- **Walk** on the simulator, Release, against scratch with the bridge in scratch mode: stills of
  each scene of the mock that OpenClaw can show (1, 2, 3, 6 with a scratch agent of eleven
  files), and the harness page.
- **Docs:** ADR 0135 "The context editor" (§3.7). STATUS, memory.
- **Go-live, on his word:** `pnpm phone build` from main.

### Phase 4 — Jacobian

*Built 7 October 2026, 22:00 PDT, in Jacobian's worktree `agent-context`, not committed: the
adapter's `context.ts`, the `context.edit` frame, `setSoul`, an uncapped root brief and ruling 17
(`brief_by_person`); 407 touched tests, one new FROZEN vector. Scratch run with Jacobian's own
`ChipsBot` against 4436 (a stand-in, not a second Jacobian), and scenes 4 and 5 walked on the
simulator. Live waits for his word: commit, fast-forward, restart, `chips declare … context_files`.*

- §3.6 in Jacobian's Chips adapter, and ruling 17 in `starter-knowledge.ts`; touched suites
  (the adapter's, starter knowledge's, charter's).
- **Scratch first** (a Jacobian pointed at 4436, as `testing/jacobian.md` says), then live: read
  Shore Writer's context; open the shared Who it is on Jacobian's page; give a test Space its own
  charter and see the next turn follow it; edit a Space's About you and run the refresh
  (`force` off) to see it kept.
- **Go-live, on his word:** commit and fast-forward Jacobian, restart it, check it came back.
  Scenes 4 and 5 of the mock on his phone need no phone change.

### Phase 5 — Mac and web (ADR 0135's addendum)

*Built 7 October 2026, 23:00 PDT (ADR 0135's addendum): the editor's workings lifted from the phone
into core (`contextEditor.ts`), so the two clients only draw; the desktop's pages in
`apps/web/src/app/context/`, stacked over the Agents tab; `pnpm check` green (Vitest 4,862, phone
Jest 677), guardrails 101/101, web e2e 60/62 on 5199 with `agent-context.spec.ts` 2/2 (the one
failure, `approval-loop`'s axe check, is main's since `8181f902`, not this phase's). Walked in a
browser against scratch with both stand-ins, dark and light. Not on 4431's web or the Mac app until
`pnpm web:build` and `pnpm desktop`.*

- §3.7 in `apps/web/src/app/Agents.tsx` (`CardSection` gets the group; the editor is a page in
  the agent pane; the conflict a dialog) and `Harnesses.tsx`, from the same core views.
- **Tests:** web Vitest and the web e2e on 5199, alone.
- **Go-live, on his word:** `pnpm web:build`, `pnpm desktop`.

### Phase 6 — acceptance

*Run 7 October 2026, 23:04–23:26 PDT (`testing/scenarios/agents/agent-context.md`, prefix AC):
scratch passed with both harnesses' own code in stand-ins (stopping the live bridge for a scratch
run was refused by the session's permission classifier), after two fixes in core's editor
(`dc7e0524`: away comes back, AC-2; missed says "hasn't answered", AC-1, which changes ruling 12's
words). Live OpenClaw passed read, save, a turn following the edit and the conflict ($0.20). On
his "go live" at 23:35, Phase 4 went live (Jacobian `f78e0f0`, `context_files` declared) and the
live Jacobian steps passed; on his calls, AC-3 (a count, or none for a file only copied: ADR 0134's
addendum) and AC-4 (Used by is a count) were fixed, and everything went out at 00:02–00:10 on 8
October (Chips `173d2281` pushed; bridge `25a1161`; Jacobian `7fb8bd4`); away passed live too.
On his word, Jacobian's three commits were pushed at 00:10 and a missed edit passed against the
live bridge at 00:11 (AC-5): nothing is left.*

- `testing/scenarios/agents/agent-context.md` from `TEMPLATE.md` (prefix `AC`), a row in
  `testing/scenarios/README.md`, the prefix in `testing/findings.md`.
- Scratch, then live with `pnpm live`, both harnesses: read; edit and save; a conflict (edit the
  file in the harness while the editor is open); away (bridge stopped); missed (a harness that
  never answers: the scratch bridge paused); shared → harness page → read only; give it its
  own; more than eight (a scratch agent with eleven files); a turn that follows each edit. About
  $0.50 of turns.
- His look on the iPhone and the Mac; record the run; fix what is small.

## 5. Risks, and what to check first

- **RN `TextInput` with styled children** (Phase 3): caret drift or lost input on iOS. Check on
  the simulator first; plain text is the fallback, and the dimmed marks go.
- **`agents.files.list`'s fields** (Phase 2): if it gives no size or time, the bridge hashes what
  `get` returns after each turn, for made agents only.
- **A file write during a turn** (Phase 2): OpenClaw may read the file mid-turn; the next turn
  reads the new one, which is what the editor promises ("reads it next turn").
- **Jacobian's charter route** may validate or trim: the adapter sends back what was stored, not
  what was asked.
- **Personal text on the server:** `USER.md` and `YOUR_PERSON.md` land in Chips' database. It is
  his own server; owner-only reads; no text in the event log.
- **Peers on main:** search sessions moved main twice on 7 October; replay, never merge.

## 6. Code map

- Protocol: `packages/protocol/src/capabilities.ts`, a new `context-files.ts`,
  `events/workspace.ts`, `visibility.ts`.
- Server: `server/src/interfaces/http/routes/agent-context.ts` (new), its use cases in
  `server/src/application/use-cases/`, `server/src/infrastructure/db/migrations/`.
- Core: `packages/core/src/context.ts` (new), `agentsTab.ts`, `store.ts`.
- CLI and testing: `tools/live/live.mjs` (`pnpm live`), `testing/live-agents.md`.
- Phone: `apps/mobile/src/agents/AgentCard.tsx`, new `apps/mobile/src/agents/context/`
  (`ContextGroup.tsx`, `ContextEditor.tsx`, `ConflictSheet.tsx`, `ReadOnlyPage.tsx`),
  `apps/mobile/app/agents/[id]/context/[name].tsx`, `apps/mobile/src/harnesses/Profile.tsx`,
  `ui/Group.tsx` (`RowMark`), `ui/ChipPulse.tsx`, `spaces/Motion.tsx`.
- Web: `apps/web/src/app/Agents.tsx`, `apps/web/src/app/Harnesses.tsx`.
- Bridge: `~/Work/chips-openclaw/bridge/src/context.ts` (new), `bridge.ts`, `own-agents.ts`,
  `test/`.
- Jacobian: its Chips adapter, `src/spaces/lifecycle/manager.ts` (charter, brief),
  `src/spaces/lifecycle/starter-knowledge.ts`, `src/spaces/kit/charter.ts`.

## 7. Decision records

- **ADR 0134:** an agent's context is its harness's files, listed and edited in Chips (Phase 1).
- **ADR 0135:** the context editor and its screens (Phase 3; an addendum in Phase 5).
- Take the next free numbers when each phase starts; another session may take one first.

## 8. Testing

- The scenario of Phase 6 (`AC`), and the own-agents scenario
  (`testing/scenarios/harnesses/openclaw-agent-of-its-own.md`) re-run once in Phase 2, since the
  fallback goes.
- Findings go to `testing/findings.md` under `AC`.

## 9. Post-compaction prompts

### Phase 1

> Run Phase 1 of `docs/proposals/agent-context-plan.md` (protocol, server, core, ADR 0134).
> Rulings §1 stand <or: changes>. Read §0–§3 and the memory notes §0 names. Build, test, run the
> gates, fast-forward main, update STATUS and memory, and report with Phase 2's prompt. Wait for
> my word before restarting 4431.

### Phase 2

> Run Phase 2 of `docs/proposals/agent-context-plan.md` (the OpenClaw bridge). Build with tests,
> run it on scratch, and report. Wait for my word before the live bridge.

### Phase 3

> Run Phase 3 of `docs/proposals/agent-context-plan.md` (phone, ADR 0135). Check the styled
> `TextInput` on the simulator first. Build, test (Jest, then the phone e2e alone), walk it on
> the simulator as Release with stills against the mock, fast-forward main, and report. Wait for
> my word before `pnpm phone build`.

### Phase 4

> Run Phase 4 of `docs/proposals/agent-context-plan.md` (Jacobian). Touched suites only; scratch
> first, then report. Wait for my word before committing and restarting Jacobian.

### Phase 5

> Run Phase 5 of `docs/proposals/agent-context-plan.md` (Mac and web). Build, test (the web e2e
> on 5199, alone), fast-forward main, and report. Wait for my word before `pnpm web:build` and
> `pnpm desktop`.

### Phase 6

> Run Phase 6 of `docs/proposals/agent-context-plan.md` (acceptance). Write the scenario, run it
> on scratch and then live, record the run and findings, fix what is small, and report.
