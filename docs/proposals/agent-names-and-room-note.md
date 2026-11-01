# Agent names, the room note, and a file with its words

Accepted by Arjun on 1 October 2026 ("all your suggestions are accepted"), to run after
compaction. Three parts, in three repositories:

- **A. Agent names (Chips).** A person can rename an agent. Two agents never share an @-name:
  Chips numbers a repeat ("OpenClaw 2"), a person's rename holds against the harness, and `@`
  takes whole names first.
- **B. The room note (Chips, the bridge, Jacobian).** With every turn, Chips tells an agent who is
  in the room, with @-names, and how `@` works. Both harnesses put Chips's note at the top of the
  turn in place of their own wording.
- **C. A file with its words (Jacobian).** In a Chips room, Jacobian posts a turn's answer and its
  files as one message, not the words and then each file.

Already done, not part of this plan: the bridge posts OpenClaw's files with its words (bridge
889e9a8, live from 23:01 PDT, 1 October 2026).

## How to run this

1. Read this file, the top of `docs/STATUS.md`, and memory (`MEMORY.md`: the working agreements
   and the OpenClaw entries).
2. Preflight, all read-only:
   - `ListAgents`: who else is working. The original session ("Chips multi-harness support") owns
     the agents review; tell it before merging to main.
   - `git log --oneline -5` and `git reflog -10` on Chips main. Note the uncommitted edits in the
     main checkout: on 1 October they were another session's (apps/mobile spaces, Avatar, web
     Sidebar and styles, core index). Never stage, stash or build over them.
   - `lsof -nP -iTCP:4431 -sTCP:LISTEN` (the launch agent `chat.chips.serve`), the bridge's pid
     (`~/Work/chips-openclaw/scripts/bridge.sh status`), and Jacobian's start time.
3. Work in worktrees on named branches:
   - Chips: `git worktree add .claude/worktrees/agent-names -b claude/agent-names`
   - The bridge: a branch `feat/room-note` in `~/Work/chips-openclaw`.
   - Jacobian: `git worktree add .claude/worktrees/chips-room-note -b claude/chips-room-note`
4. Follow the order and the gates below. Update STATUS and memory at the end of each part, and
   before any compaction.

## Why

From the room "HTML ascii art" on 1 October 2026 (`spc_01M3XGHTS1ZWHTDY0S8N5QWQC2`, live 4431).
Arjun asked Jacobian's Hello and two OpenClaws to write an ASCII alphabet together, five letters
each:

- **Nobody moved after Hello's first page.** When Arjun asked everyone, the OpenClaws had not spoken
  yet, so Jacobian did not tell Hello they were there. Hello posted A–E addressed to nobody, and an
  agent's message to nobody gives nobody a turn. Chips tells an agent nothing about who is in the
  room; each harness words its own rule, partly (B).
- **`@OpenClaw` reached one of two.** Both agents are named "OpenClaw", and a handle two answer to
  goes to the first to join (agents review, finding 34). Chips names every claimed room's agent
  after its harness (`agentForRoom`), and nobody can rename an agent (A).
- **The four-message guard stopped the chain early.** Hello's hand-off came as two messages, the
  words and then the file, both to `@OpenClaw`. OpenClaw took a turn on each: the first found no
  file ("no attachment came through"), the second did F–J. Those two halves used two of the four
  agent-to-agent messages Chips allows after a person speaks. OpenClaw's F–J reply was the sixth,
  so it was held, and Hello never got a turn (C).

## Decisions (accepted 1 October 2026)

- **Names that clash.** Two names clash when they are equal ignoring case and spaces, the same
  whole-name @-handle: "Open Claw", "OpenClaw" and "openclaw" all clash.
  - Who counts: people (not removed) and active agents, across the workspace. Agents move between
    rooms, so a per-room rule would break on a move.
  - A harness's own participant row does not count: it shares its default agent's name by design.
  - Archived agents give their names up.
- **Numbering.** A clashing agent name gets the smallest free number: "OpenClaw", "OpenClaw 2",
  "OpenClaw 3". It is a space and a number, so the @-name is `@OpenClaw2`; "(2)", "#2" or "· 2"
  would make a handle nobody can type. A trailing " <n>" in a wanted name is a number, not part of
  the base, so there is never an "OpenClaw 2 2". People are never numbered: a person's own rename
  that clashes is refused, as today.
- **Rename.**
  - Who: any person but a guest, as with an agent's face (`agent-face.ts`).
  - Clean-up: trimmed, inner spaces collapsed, 1–120 characters, as a person's name.
  - A clash is refused with the holder's name; it is not numbered.
- **The person's word holds.** Once a person names an agent, its harness's registration and a
  followed room's retitle no longer rename it, as a room's `title_by` does.
- **`@` takes whole names first.** A whole-name handle always wins. A first word names a member
  only when no other member of the room has that first word; otherwise it names nobody. A
  harness's name (`also`) comes last. The server and the apps resolve the same way.
- **Existing clashes are renumbered once**, by an upgrade command: dry run first, the oldest keeps
  the plain name, written as events.
- **The room note** comes from Chips and is worded in one place. The bridge and Jacobian use it,
  and keep their own wording only for a Chips without it.
- **A file with its words.** In a Chips room, Jacobian posts the answer with the turn's files as one
  message; Telegram keeps its split.

## Rules that hold throughout

- **4431:** untouched until his word. Restart it only with
  `launchctl kickstart -k gui/$(id -u)/chat.chips.serve`. Kill processes by PID only, never by
  pattern.
- **The live database is read-only:**
  `sqlite3 "file:/Users/ada/Work/Chips/.chips/chips.db?mode=ro"`. Keep a room check scoped
  to the room he names.
- **Leave others' things alone:** other sessions' worktrees, Storefront and quotes. Colima is shared
  with Storefront, and he restarts it.
- **Chips commits:** `git commit -s`, ending `Co-Authored-By: Claude Opus 5.5
  <noreply@anthropic.com>`. Main stays linear: replay onto a named branch and fast-forward, never
  a detached HEAD.
- **Jacobian commits:** nothing without his word. Sentence case, no prefix, no `-s`; only these
  paths, with `git commit -- <paths>`. His `.gitignore` edit and the staged
  `dashboard/tsconfig.tsbuildinfo` deletion stay uncommitted. He restarts Jacobian, and only in a
  gap between tasks. Run only the touched test suites: a full `npm test` once crashed Colima.
- **Bridge commits:** `feat(bridge): …` or `fix(bridge): …`, a body, `Co-Authored-By`, no
  sign-off. A branch, then a fast-forward; there is no remote. The auto-mode classifier refused my
  bridge restart as a production deploy, so hand him the command.
- **Mocks** are published as private Artifacts and kept out of the repo.
- **Push** only when he says.
- **Credentials:** he handles his own credentials and sign-ins. Never pair a new device to the
  live server.

## Part A: agent names (Chips)

### A0. The mock (gate: his OK on the screens)

Load the `artifact-design` skill, or run the Artifact quickstart, first. Make an animated
phone-width mock as a private Artifact:

- The Agents tab with "OpenClaw", "OpenClaw 2", "OpenClaw 3", "Hello" and "J".
- An agent card: tapping the name opens the name sheet, as You → your name does (ADR 0082: `Sheet`,
  `SheetHead` with Save, `TextInput`, the server's reason in red under it). Save, and the name
  changes in the list.
- A refusal: "An agent here goes by Hello already."
- A room with OpenClaw and OpenClaw 2 both posting, and the composer's @-picker offering
  `@OpenClaw` and `@OpenClaw2`.
- A second panel for the desktop: the agent page's heading as the field.

Server work (A1–A4) can start while he looks. The screens (A5) wait for his OK.

### A1. ADR

Write `docs/decisions/0090-…` (the next free number; check, since other sessions add ADRs), with
the Decisions above. Fix in the same part: `rename-person.ts:108` says "Somebody here goes by…"
when an agent holds the name, because it checks `kind === "harness"` and agents are `agent`.

### A2. Server

Line numbers are as of 1 October.

- **The helpers**, in a new `packages/protocol/src/names.ts` (the server, the conformance fake and
  core all need them):
  - `clashKey(name)`: trimmed, lowercased, spaces removed.
  - `freeAgentName(wanted, taken, current?)`: generalizes `forkRoomTitle`
    (`packages/core/src/forks.ts:42-54`). It keeps `current` when `current` is `wanted` or a
    numbered form of it and is free. That avoids churn when a lower number frees up.
- **Who is taken:** people not removed, plus active agents, less the agent itself and harness rows
  (`readModels.participantsIn`).
- **Every place an agent is named:**
  - `registerAgent` (`server/src/application/agents.ts:78-92`). Create gets a free name. A rename
    (`known.name !== name`) is skipped when the person named the agent, and otherwise gets a free
    name. Re-sending the name the agent already has, numbered or not, changes nothing.
  - The default agent (`agents.ts:155-167`, `add-harness.ts:154`, `submit-event.ts:786`).
  - A claim (`agentForRoom`, `agents.ts:182-202`).
  - A fork (`fork-agent.ts`): the "· fork" label stays on screen only (`forks.ts:22-35`), so a fork
    shows as "Chess Game 2 · fork".
  - A child lane (`route-lane.ts:308-314`).
  - A followed room's retitle (`open-space.ts:256-276`): skipped when the person named the agent.
  - An unarchive (around `agents.ts:346`): renumbered if its name was taken while it was archived.
  - Export `updateAgent` (`agents.ts:130-149`).
- **The person's word** is a column `name_by`, made by migration 0035 or the next free number.
  `server/src/domain/projection.ts:423-439` derives it from the log: an `agent.updated` with a
  name and `actor.kind === "person"`. Agent rows are rebuilt from the log
  (`migrations/0032-agents.ts`), so it must survive a rebuild.
- **The rename route:** `PUT /v1/agents/:id/name {name}`, beside the face route. It has its own use
  case, `rename-agent.ts`: permission and `actor: person` as in `agent-face.ts`, cleaning and
  refusals as in `rename-person.ts`. It writes `agent.updated {agent_id, name}` through Chips, the
  only writer (`submit-event.ts:364-371`). Add the route's row to the authorization matrix; a route
  cannot be added without one.
- **Tests:**
  - Numbering at a claim, a registration, the default agent, a fork, a lane and an unarchive.
  - No churn on re-registration.
  - The rename route: a guest is refused and a member is fine; a clash is refused, ignoring case
    and spaces; people count.
  - The person's word holds against re-registration and a retitle.
  - The projection is rebuild-safe.

### A3. `@` takes whole names first

- **The resolver** (`packages/protocol/src/mentions.ts`; `handlesOf` at :48, `resolveMentions` at
  :74): register every whole-name handle first, then first words only where exactly one
  participant has them and nobody has that handle as a whole name, then `also`.
- **Callers:**
  - The server: room members in join order (`submit-event.ts:800-822`, `read-models.ts:538`) and
    the harness alias (`:844-854`).
  - Core's `draftAddress` (`packages/core/src/model/readers.ts:193-213`): pass the harness names as
    the server does.
  - The web's mention chips (`apps/web/src/app/Markdown.tsx:34-42`): resolve among the room's
    members, not the whole workspace.
- **Tests:**
  - "OpenClaw" and "OpenClaw 2", in either join order: `@OpenClaw` names OpenClaw and `@OpenClaw2`
    names OpenClaw 2.
  - "Chess Game" and "Chess Game 2": `@chess` names nobody, and `@ChessGame` names Chess Game.
  - `@Jacobian` still names Jacobian's only agent in a room.

### A4. Renumbering what is there

- **The command:** `chipsd upgrade names [--apply]`, on the pattern of `upgrade agents`
  (`server/bin/chipsd.ts:123-185`, `server/src/application/use-cases/upgrade-agents.ts`).
- **The dry run** prints each rename (`agt_… OpenClaw → OpenClaw 2`), the oldest keeping the plain
  name.
- **`--apply`** appends `agent.updated {name}` by `system`, and a second run finds nothing. People
  are never renamed: an agent that clashes with a person is numbered.
- **Tests:** the dry run, apply, idempotency, and a person beside an agent.

### A5. The screens (after his OK on A0)

- **Phone:** the name on `apps/mobile/src/agents/AgentCard.tsx:92-94` becomes tappable, except for
  a guest, and opens the name sheet from `apps/mobile/src/you/Profile.tsx` (move it somewhere
  shared if needed). Add core `store.renameAgent` on the pattern of `store.rename`
  (`packages/core/src/store.ts:1635-1640`): post, then reload the directory.
- **Desktop:** the heading of the agent page (`apps/web/src/app/Agents.tsx:262,345`) becomes the
  field, on the pattern of `YourName` (`apps/web/src/app/you/Profile.tsx`): Enter or leaving the
  field saves, Escape reverts, and the reason shows below.
- **The composer's @-picker** inserts whole-name handles. Check it does.
- **Tests:** component tests, and e2e on 5199: rename an agent, and two OpenClaws addressed apart.

### A6. Docs and the conformance kit

- **Connect docs:** a claimed room's agent may be numbered (`new-spaces.md`). Registration never
  renames an agent a person named, and a name may come back numbered (`custom.md`,
  `websocket.md`).
- **Reference:** the route in `reference/http.md`, and the `agent.updated` reference page. Then
  regenerate the schemas.
- **The conformance fake:** claim naming (`packages/conformance/src/workspace.ts:774-783`), the
  numbering and the route. Run the parity suite.

## Part B: the room note

### B1. ADR

Write `docs/decisions/0091-…` (the next free number): an agent is told who is in the room and how
`@` works. The shape, to settle in the ADR:

- **Where:** a `message.new` for one or more of a harness's agents carries
  `room: { members: [{ participant_id, kind: "person" | "agent", name, handle }], notes: { [takerId]: string } }`.
- **One note per taker** in `for`, or for the harness itself where it takes the turn. A harness
  that does not know the field ignores it.
- **The note's words** live in one place, `packages/protocol/src/room-note.ts`, beside
  `context.ts`:

  > In this room: Arjun (person, @Arjun), Hello (agent, @Hello), OpenClaw (agent, @OpenClaw), and
  > you, OpenClaw 2 (@OpenClaw2). Everyone here reads what you write; only those you @-mention act
  > on it. To hand work to an agent or ask it something, @-mention it. After four messages between
  > agents, Chips waits for a person to speak.

  "four" comes from `GUARD` (`packages/protocol/src/address.ts:14`) and is never typed in.
- **Members:** the room's people and agents in join order, harness rows left out. A member with no
  handle ("J") is listed without one.

### B2. Server

- **Where:** attach the note in `server/src/interfaces/ws/session.ts`, beside `contextOf`
  (:603-617), where the takers are known. Members come from `readModels.membersOf` and `who()`.
- **When:** never on `message.overheard`, which gives no turn.
- **Tests:** the members, handles, kinds and order; one note per taker; the harness as taker in an
  unclaimed asked room; no note on an overheard message.

### B3. Docs, the SDK and the conformance kit

- **Protocol:** `packages/protocol/src/events/chips-to-harness.ts:123-170`, then regenerate
  `apps/docs/public/schema/message.new.json`.
- **Connect docs:** `custom.md` and `websocket.md`. In `sdk.md:78-82`, today's advice becomes "put
  `room.notes[<your agent>]` at the top of its turn".
- **The SDK** (`packages/sdk-ts`) exposes the note.
- **The conformance fake** sends it. Run the parity suite.

### B4. The bridge (`~/Work/chips-openclaw`, branch `feat/room-note`)

- **The note first:** put `room.notes[taker.agentId ?? harnessId]` at the top of each turn, ahead of
  the catch-up and context lines (`heard` and `withOverheard` in `bridge/src/bridge.ts`).
- **One rule, not two:** with the note there, `fromAgent` keeps only "X (an agent in this room) said
  this to you:", since the rule is in the note. Without it (an older Chips), keep today's wording.
- **Tests:** the note first; one note per agent when two of ours take the turn; the fallback.
- Commit, fast-forward, then hand him the restart (Going live).

### B5. Jacobian, the note

- **The note in place of its own lines:** `withRoom` (`src/channels/chips/room-talk.ts:229-256`)
  uses the note for the agent taking the turn when it is there. It replaces the "In this room: …"
  line (:244) and the rule in the sentence at :250.
- **The fallback** for an older Chips is today's code: the list built from `notice` and `company`
  (:126-134, :181-191), leaving out Jacobian's own agents (`bot.ts:289`, `spaces.ts:734-736`,
  `room-talk.ts:185`).
- **Tests:** the touched suites only.

## Part C: a file with its words (Jacobian)

**Today, two messages:**
- The answer goes first: `src/channels/conversation.ts:586`, `session.reply`
  (`src/channels/chips/session.ts:195-201`), then `bot.postText` (`bot.ts:605-619`).
- Then each file, as its own message: `conversation.ts:594`, `deliverProduced`, then
  `deliverAttachments` (`src/channels/attachment-delivery.ts:65-117`), then `session.sendDocument`
  (`session.ts:234-241`), then `bot.postFiles` (`bot.ts:524-545`). Each file carries its caption.
- The `deliver` tool (`src/tools/artifacts.ts:29-85`) asks the model to say what the file is in its
  reply and in a one-line caption.

**The change, in the engine:**
- **A new reply method:** an optional `ReplySession` method (`src/channels/types.ts:226-245`), say
  `replyWithFiles(answer, files)`. `conversation.ts:580-595` uses it when `outcome.attachments` is
  not empty and the session has the method.
- **The Chips session** implements it with `host.postFiles(spaceId, run, files, answer)`.
  `postFiles` returns a `SentMessageRef`, so `recordAnswer` (`conversation.ts:592`) keeps the
  message's id for a 👎.
- **Keep** the path dedupe (`attachment-delivery.ts:79-97`) and the fallback when sending fails: a
  words-only post, then "I couldn't send".
- **Captions:** dropped when the answer has words, since the model already says what the file is.
  They become the words when the answer has none.
- **Task turns** do the same: `src/tasks/executor.ts:455-485` and `1380-1425` (`notifyUser`, then
  `notifyDocumentOrBroadcast`, then `bot.ts:384-393` and `486-499`).
- **Telegram** is unchanged.
- **Tests:** the touched suites only.

## Order and gates

| # | Step | Where | Gate |
|---|------|-------|------|
| 1 | Preflight | all, read-only | — |
| 2 | A0 mock | private Artifact | **his OK on the screens** |
| 3 | A1, B1 ADRs | Chips worktree | — |
| 4 | A2–A4 server, `@`, upgrade | Chips worktree | `pnpm check` green |
| 5 | B2, B3 note, docs, SDK, kit | Chips worktree | `pnpm check`, parity |
| 6 | A5 screens, A6 docs | Chips worktree | after step 2's OK; phone e2e; web e2e on 5199 |
| 7 | Merge to main | Chips | `ListAgents`, reflog, tell the original session; fast-forward |
| 8 | B4 | bridge branch | tests, typecheck |
| 9 | B5 and C | Jacobian worktree | **his word to commit** |
| 10 | Going live | below | **his word for each step** |
| 11 | The live check | live | — |
| 12 | Push Chips, push Jacobian | — | **his word** |

## Going live (each step on his word)

The classifier may refuse any of these as a production deploy. If it does, hand him the command.

1. **Back up the live database:**
   `sqlite3 .chips/chips.db ".backup .chips/chips.db.bak-<date>-pre-agent-names"`, then an
   integrity check.
2. **Restart 4431,** which migrates to 0035:
   `launchctl kickstart -k gui/$(id -u)/chat.chips.serve`
3. **The renumbering dry run,** from `server/`:
   `CHIPS_DATABASE_URL=sqlite:../.chips/chips.db npx tsx bin/chipsd.ts upgrade names`. Show him
   the list. On his word, run it again with `--apply`, then kickstart 4431 again at once, so every
   socket rereads names.
4. **The apps:** `pnpm web:build`, then `pnpm phone` (with the phone unlocked), then
   `pnpm desktop`. These build from the main checkout, so first check it holds nobody else's
   uncommitted edits, or settle them with him.
5. **The bridge:** `~/Work/chips-openclaw/scripts/bridge.sh stop`, then
   `~/Work/chips-openclaw/scripts/bridge.sh start live`. These are his to run.
6. **Jacobian:** his restart, in a gap between tasks.

## Done when (the live check)

- An agent is renamed on the phone and on the Mac. A taken name is refused, and a guest sees no
  control.
- A new room asked of OpenClaw, beside the agent already called "OpenClaw", is answered by
  "OpenClaw 2". `@OpenClaw2` reaches it, and `@OpenClaw` reaches the original, in either join
  order.
- Restarting the bridge and Jacobian leaves a person's rename in place.
- The upgrade's dry run was shown to him and applied, and no two active agents share a clash key.
- Every agent turn carries the room note, and the bridge and Jacobian put it first.
- A re-run of the HTML ascii art relay (Hello and two OpenClaws, "to all") gets past each hand-off:
  - each agent @-mentions the next by its unique name;
  - OpenClaw's files arrive in the room (bridge 889e9a8);
  - Jacobian's words and files arrive as one message.

  Chips still holds the fifth agent-to-agent message, by design.
- STATUS and memory are updated. Pushes and restarts happened only on his word.

## Not in this plan

- **The guard's number** (four agent-to-agent messages, then Chips waits for a person). An A–Z
  relay in five-letter chunks needs more hand-offs than four; raising it is a separate decision.
- **Files an agent only overheard.** He is fine with the sharer having to @-mention.
- **The rest of finding 34:** a one-letter name ("J") still has no handle.
- **The context cut** at an agent's last post rather than its last turn's message, and a line that
  lands during a turn (agents review, *Since this review*). Both are open and his to decide.
