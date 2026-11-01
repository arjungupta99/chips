# Long jobs — a space carries big work to the end, in its own room, within a spend ceiling

**Plan of record, 4 October 2026. Status: written, not started.** Arjun asked for it ("make a
phased execution plan. I will run it after a compaction") after the Cholesterol room got stuck
(read in `docs/STATUS.md`, 4 October, 19:45 and 20:45). Each phase is run from its prompt in
§9, after a compaction. This plan spans Chips (this repo), Jacobian (`~/Work/Jacobian`) and the
OpenClaw bridge (`~/Work/chips-openclaw`, no remote).

In one line each:

- **A hand-off may move on.** Handing work to another space need not block. The space handing
  it off decides, per hand-off, whether to wait (a quick answer it needs now) or move on (a
  job). (Rule 1.)
- **Any turn can carry on.** A turn that runs out of rounds continues in follow-up turns,
  whoever asked: a person, another space or a schedule. The follow-ups are bounded by a count
  and by the room's spend ceiling. (Rule 2.)
- **The plan is prose.** A space plans a many-part request as a numbered list, works it in
  order and answers before its rounds run out. Nothing reads the plan. Live since 4 October
  20:41 (Jacobian `a193a83`). (Rule 3.)
- **A job answers in its own room.** The space handing it off is handed the answer as a
  message and may stay silent.
- **Every room has a spend ceiling per job,** $3 unless a person changes it in the room's
  settings. At the ceiling the room's agents stop starting new work until a person lets them
  carry on.

Nothing here is written for J. In Jacobian, J is the top space and plays by every space's
rules. In Chips, a room's lead and agents may be any harness's. A specialist room with a lead
and four agents gets exactly what J gets.

## 0. How to use this document

- **Order.** Run the phases in order. Each one is shippable on its own and leaves the system
  safer than before. Phase 3 (longer chains) never ships before Phases 1 and 2.
- **Before each phase:**
  - Read §1 and §2, the phase itself, and the memory notes `jacobian-capped-hand-down`,
    `chips-main-is-shared-between-sessions`, `arjun-wants-me-to-restart` and
    `chips-working-agreements`.
  - Run `ListAgents`, read the reflog of Chips main and of Jacobian main, and check
    `git log origin/main..main` in both.
- **Commits.**
  - **Chips:** a worktree on a `claude/<name>` branch, commits made with
    `git -c commit.gpgsign=false commit -s`, ending
    `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Fast-forward main as each phase
    lands (merge as you go). Main stays linear: replay, never merge.
  - **Jacobian:** a worktree on a `claude/<name>` branch.
    - The subject is a sentence-case sentence; there is no DCO; the body ends with the same
      Co-Authored-By line.
    - Main's checkout has his uncommitted `.gitignore` edit and a staged deletion of
      `dashboard/tsconfig.tsbuildinfo`. Leave both untouched.
    - Fast-forward Jacobian main only at the phase's go-live. If the classifier refuses a
      Jacobian git step, run it from a scratchpad script.
  - **The bridge:** a worktree, fast-forward at go-live. It has no remote.
- **Gates.**
  - **Chips:** `pnpm check` (lint, typecheck, vitest, phone Jest), plus the phase's web e2e
    specs on their own ports.
  - **Jacobian:**
    - touched suites only, by path with `npx vitest run <paths>`;
    - the one-space conformance file filtered with `-t`;
    - `npx tsc --noEmit`, `npm run lint:vocabulary`, `npm run lint:one-space`.
    - **Never the full `npm test`:** it once crashed Colima, which Storefront shares.
  - **The bridge:** `npm test` in `bridge/`.
- **Frozen vectors.**
  - Jacobian's `tests/conformance/one-space.conformance.test.ts` is grow-only, and a frozen
    assertion that would change is a stop-and-ask.
  - This plan changes exactly the vectors listed in §5, under his rulings in §1. Any other
    frozen assertion that would change: stop and ask him.
  - Every new behaviour gets a new FROZEN vector.
- **Go-live, the phase's last step, only on his "go live".**
  - **Chips server:**
    - `lsof -nP -iTCP:4431 -sTCP:LISTEN` first;
    - back up with `sqlite3 .chips/chips.db ".backup .chips/chips.db.bak-<date>-pre-<what>"`;
    - kickstart `chat.chips.serve`, which migrates on start;
    - verify the new pid and "chipsd listening".
  - **Clients:** `pnpm build` (web), `pnpm phone build` (his iPhone), `pnpm desktop` (Mac app).
  - **Jacobian:** fast-forward main, run `~/Work/Jacobian/bin/jacobian restart --check`, and
    verify `chips=healthy` and the socket back in the 4431 log. If Jacobian was started by
    hand, it restarts nothing: say so.
  - **The bridge:** `cd ~/Work/chips-openclaw && scripts/bridge.sh stop && scripts/bridge.sh
    start live >/dev/null 2>&1`. Never pipe it to `tail`.
  - Tell any busy peer session that touches Jacobian before restarting it.
- **Push only on his word.** Say which peers' commits a push would carry.
- **Live database.** Read-only: `sqlite3 "file:.chips/chips.db?mode=ro"`. For Jacobian's
  stores, copy the WAL database to the scratchpad first.
- **UI.**
  - He judges UI from running mocks. Phase 0 shows phone-width animated HTML mocks, published
    as private Artifacts and kept out of the repo.
  - No phone UI is built before his pick.
  - Controls stay flat: no gradients or highlights.
- **Docs.**
  - **Chips:** an ADR per decision (§8); `docs/STATUS.md`, newest first; the memory note.
  - **Jacobian:** the CLAUDE.md sections in §7.4 and the debug-jacobian skill.
  - STATUS and memory are updated at the end of each phase, and before any compaction.
- **Reports.** Each phase ends with:
  - gates and counts, and readings before and after (§6);
  - what is live and what is not pushed;
  - the next phase's prompt from §9.

## 1. Rulings taken (Arjun, 4 October 2026)

1. "I want to make sure we are not turning jacobian into deterministic hell for using tasks.
   Is this something we can add with prose?"
   - Plans are prose; there are no task states and no board, and nothing reads a plan.
   - The removed board (Jacobian `b8b6de8` to `d630746`) and to-do tool (`4217872`) stay
     removed.
2. "This needs to work everywhere, I do not want to hard code anything for J … a specialized
   space with One lead and 4 other agents … still needs to be capable of doing the same."
   - No J-specific code: every rule is a rule for every space.
   - In Chips, every rule holds for any harness.
3. "let it decide": the space handing work off decides whether to wait, per hand-off.
4. "answer in the specialist room": a handed-off job answers the person in its own room. The
   space that handed it off is handed the answer and may stay silent.
5. "$3 default, and $ editable in room settings": a spend ceiling per job, per room. $3 is the
   default, and any person in the room but a guest may edit it.
6. The rules in this plan's head, which he sent on as the plan to make. They amend the
   one-link follow-up chain, so §5's amended vectors stand on his approval of this plan. If
   Phase 3 starts without that approval said in words, ask before touching them.

**Open rulings, each with a recommendation.** Take each at the phase named; do not block
earlier phases on them.

- **R1 (Phase 1): what counts as a job.**
  - Recommendation: a job begins at the latest of:
    - the last person's act in the room (`lastPersonAct`, `server/src/infrastructure/store/exchange.ts:57-80`), counting their messages and "let the agents carry on";
    - a brief handed into the room: a lane's task, or a Phase 5 hand-off.
  - It counts every run in the room started after that point, of any harness, including lane
    runs, whose `space_id` is the specialist's room.
  - A run that began before the point counts its `usage` deltas after it.
- **R2 (Phase 1): harnesses that report no cost.**
  - Today OpenClaw reports none, and 96 of Jacobian's `gpt-6-sol` reports carried none.
  - Recommendation: such a run counts $0, and the room says so ("2 runs with no cost were not
    counted"), naming no harness in shipped source.
  - Fix the bridge in Phase 4 if OpenClaw's usage carries a cost.
- **R3 (Phase 1): the ceiling's range.**
  - Recommendation: $0.25 to $100 in steps of $0.25, with "Default ($3)" restoring null.
- **R4 (Phase 3): the follow-up count backstop.**
  - Recommendation: at most 5 follow-ups per chain (config `jobs.max_follow_ups`), whatever
    the spend.
- **R5 (Phase 3): the ceiling where there is no room (Telegram, Slack, Discord).**
  - Recommendation: config `jobs.spend_ceiling_usd`, default 3, measured from Jacobian's own
    cost store (§3.3).
- **R6 (Phase 5): a hand-off with no room (Telegram).**
  - Recommendation: the handed job answers in the same chat, under the space's name (the
    executor's "🤖 Space Agent (<name>)" delivery), and the delegator is handed it as in a
    room.

## 2. Why (read 4 October 2026)

- **Cholesterol.** J handed a long brief to a new space and waited (`hand_down` is
  `await deps.runTurn`, Jacobian `src/spaces/verbs.ts:257-264`), so J's room was busy for 4
  minutes.
  - The space read pages for all 20 rounds.
  - A turn answering a parent never continues (`answeringAParent`, `runtime.ts:305`;
    `someoneIsWaiting`, `:333`), so it ended "this is unfinished".
  - He had to say "Try again please".
- **The chain is one link by construction** (Jacobian `de06e82`).
  - "The bound is someoneIsWaiting itself, no counter and no new state … the #78
    unattended-chain shape (520 wakes, $58.53) fenced before the first loop can exist."
  - This plan replaces that fence with two explicit ones: a count and the room's spend.
- **A follow-up is invisible to Chips.** A capped turn's follow-up is a queued `space_turn`
  (`gateway/index.ts:1182-1198`) run as `schedule:` (`tasks/executor.ts:1120-1141`).
  - In Chips it is a message edited in place, not a run (`channels/chips/task-bubble.ts:1-16`).
  - So Chips sees no cost for it, the room's Stop cannot stop it (only `/cancel`), and a
    person's words in the room cannot reach it (`joinTurn` reaches only a live chat turn).
- **No spend check exists anywhere.**
  - Jacobian has no dollar check, and its runtime deps carry no cost store
    (`runtime.ts:210-266`).
  - Chips has a harness-wide budget that nothing enforces:
    - `harness_policy.budget_usd/spent_usd` (`server/src/infrastructure/db/schema.ts:420-433`);
    - `hello.budget`;
    - the `budget.warning` event (80/100%, `warn|pause`, `packages/protocol/src/events/chips-to-harness.ts:461-475`);
    - the `budget_exhausted` error (402);
    - the `run.pause` frame ("or by Chips at a budget … ceiling", `:378`).
  - Nothing produces any of them, and no harness handles them. **This plan puts them to use
    rather than adding new ones.**
- **A room's lead already runs a team the right way.** ASCII Fish (4 October) showed it:
  - the lead briefed J2–J4 by message;
  - they worked in parallel;
  - they reported back by @-mention;
  - the lead's turn woke on each report and combined the work.
  - Messages never block. Only Jacobian's `hand_down` does.
- **What the rest of the field does.** "Chief of staff" agents (xAI's Grok Bot) delegate by
  message and keep going on a cloud computer until done, stopping only for approvals at
  irreversible actions. Rules 1 and 2 give every space that shape.

## 3. The design

### 3.1 A job and its spend (Chips; Phases 1 and 4)

- **Room setting.** `spaces.spend_ceiling_usd`: null means the default,
  `DEFAULT_SPEND_CEILING_USD = 3`.
  - Set by a new person event, `space.spend_ceiling_set` (`{usd: number | null}`), modelled
    on `space.lead_set`.
  - Any member but a guest may set it.
- **The job's spend.** Computed by the server (R1) and handed to every harness:
  - **On the message.** `message.new`'s `context.spend` is
    `{ceiling_usd, spent_usd, since_seq, uncounted_runs}`.
  - **In the room note.** One line for every taker: "This job has spent $1.20 of the $3.00
    this room allows a job."
- **At the ceiling** (Phase 4), Chips:
  1. appends `exchange.set paused` by the system, with `why: "spend"`. The referee then holds
     every agent-to-agent message, as for a person's pause.
  2. sends `budget.warning {level: 100, action: "pause", scope: "job", space_id}` to every
     harness in the room, and `level: 80, action: "warn"` at 80%.
  3. draws one line: "This job has spent $3.02 of its $3.00 — the agents are paused", with
     "Carry on". Carry on is the existing "let the agents carry on". It is a person's act, so
     it starts a new allowance of one ceiling (R1).
- **What Chips cannot do.** It cannot refuse a `run.started`: that reports a run already
  begun (`server/src/application/authorize.ts:398-428`). So a harness that chains turns
  itself (Jacobian) must honour `context.spend` and `budget.warning`. Phases 3 and 4 make
  Jacobian do so.

### 3.2 Follow-ups are runs in the room (Jacobian; Phase 2)

- **A follow-up opens a run in its room.** When a capped turn's job came from a Chips room,
  its follow-up opens a run in that room, the same as a live turn, instead of the in-place
  `ChipsTaskBubble`.
- **What that gives the room:**
  - its steps;
  - its `usage`, so Chips counts it;
  - its answer as the run's message;
  - a person's Stop (`run.cancel` → `stopTurn`);
  - a person's words in the room joining it at its next round, through the same `joinTurn`
    as a live turn, since the follow-up's conversation is registered for the room.
- **Telegram, Slack and Discord** are unchanged: a follow-up there stays a queued task with
  its receipt.

### 3.3 Any turn can carry on (Jacobian; Phase 3)

- **Two questions, not one.** `canDefer` (may async tools go to the background) stays
  exactly as it is. Whether a capped turn may continue becomes its own question,
  `mayCarryOn(input, chain)`, true when all of these hold:
  - the chain has had fewer than `jobs.max_follow_ups` follow-ups (R4);
  - the job is under its ceiling: `context.spend` from Chips when the job came from a room,
    otherwise `jobs.spend_ceiling_usd` (R5), measured by the cost store's trace cost from the
    chain's first turn (`CostStore.getTraceCost`, `src/cost/store.ts:562-567`), handed to the
    runtime as a new dep `spentSince(traceId, since)`;
  - no `budget.warning` pause is standing for the room;
  - the turn is not answering a parent that waits inline. A waiting `hand_down` stays exactly
    as frozen today: the child parks nothing and the parent judges the answer.
- **The follow-up's record.** Its task metadata carries `followUp: n` and the job's
  `since_seq`. Each follow-up is handed the plan the turn said and the record of the calls it
  ran (`continuationGoal`, `continuationRecord`; prose rule 3 already asks the turn to say
  which parts are done and which are left).
- **A chain that stops for count or spend** ends with its words and one sentence naming why:
  "Stopped at this room's $3.00 for the job — say carry on to continue", or "Stopped after 5
  follow-ups". It is never silent.

### 3.4 A hand-off may move on, and the job answers in its own room (Jacobian; Phase 5)

- **The `wait` flag.** `hand_down` gains `wait: boolean`, default `true` so every frozen
  hand-off vector holds. Its description says when to pass `false`, as judgment: "a job the
  person will want done properly rather than an answer you need for this reply".
- **`wait: false` returns at once.** The child's turn is queued as a `space_turn` on the
  child, with source `handed:<parentId>` (data, not a kind branch). Its `someoneIsWaiting` is
  true: a person is waiting, in the child's room. The parent's tool result is:
  "Handed to <name>. It works on in its own room and answers the person there; its answer
  will be handed to you."
- **The child's job.**
  - On Chips it runs as runs in the child's room (Phase 2), carries on within the room's
    ceiling (Phase 3), and posts its answer as its own message in that room.
  - On Telegram it answers in the same chat under its name (R6).
- **When the child's job ends,** the parent is handed the answer as a message: a new turn,
  source `child:<childId>`, on the parent's conversation. The message says the person already
  has it in the child's room. Prose tells the parent to stay silent unless it has something
  to add or a plan of its own to continue. On Chips an empty answer is a pass (`turn.passed`,
  ADR 0105).
- **The Chips lane.** A `wait: false` hand-off still opens a lane, so the parent's room shows
  the route and, at the end, Chips's `lane.updated` line with the summary and cost. Phase 5
  checks whether a lane may outlive its lead run (lanes: ADRs 0029, 0032, 0077, 0087). If it
  may not, Phase 5's Chips part amends that.

### 3.5 What is deliberately not here

- No task list tool, no task states, no board, no scheduler of steps. Plans stay prose (rule 3).
- No time limit. A month of Jacobian's call log (682 turns since 4 September): rounds p50 2,
  p90 8, p99 18; a turn's span p50 21 s, p90 about 5 minutes. Time stops runaways badly; spend
  and a count stop them well.
- No change to the 20-round cap per turn. A turn is a checkpoint, and a follow-up starts small.
- No refusing `run.started` in Chips (§3.1).

## 4. Phases

Each phase lists what changes, its tests, its live check and its go-live.

### Phase 0 — readings and the mock (no product code)

1. **Readings (§6), before any change.** Write them to the scratchpad, and summarise them in
   the phase report and in STATUS.
2. **Mock.** A phone-width animated HTML mock, published as a private Artifact and not kept
   in the repo, with three views:
   - (a) the room sheet's spend row ("Spend per job · $3.00") and its editor, in two or three
     variants (stepper, field, preset chips);
   - (b) the room line at the ceiling, with Carry on;
   - (c) the room note's spend line, as an agent reads it.
3. **Stop for his pick** before Phase 1's client work. Phase 1's server and protocol parts may
   start once he has seen the mock.

### Phase 1 — Chips: the room's spend ceiling and the job's spend (ADR 0117)

- **Migration.**
  - `server/src/infrastructure/db/migrations/0037-room-spend-ceiling.ts` adds
    `spaces.spend_ceiling_usd real` (null).
  - Append it by hand in `migrator.ts`; never renumber.
- **Event.**
  - `space.spend_ceiling_set` in `packages/protocol/src/events/workspace.ts`, beside
    `space.lead_set` (`:460-471`).
  - Route `POST /v1/spaces/:id/spend-ceiling`, modelled on `routes/lead.ts:40` and registered
    in `app.ts`.
  - Use case `set-spend-ceiling.ts`, modelled on `set-lead.ts:34-80`, wired in `gateway.ts`.
    It refuses a guest, is idempotent, and validates the range (R3).
  - Projection beside `projection.ts:391-398`.
- **Core.** `store.setSpendCeiling` beside `store.setLead` (`packages/core/src/store.ts:1965`),
  a fold beside `model/spaces.ts:102`, and a reader beside `roomLeadOf` (`model/readers.ts:633`).
- **The job's spend.**
  - Server `jobSpendOf(spaceId)` per R1: `lastPersonAct` and lane tasks, summing
    `runs.cost_usd` plus `usage` deltas. Cross-check: the live DB gives ASCII Fish's job 5
    runs, $1.23.
  - It is exposed on the space's read, so clients can draw it.
- **Protocol to harnesses.**
  - `roomContext` gains `spend` (`packages/protocol/src/context.ts:130-155`), built in
    `server/src/interfaces/ws/session.ts` `contextOf` (`:734`).
  - The room note gains the spend line (`room-note.ts`, `roomNoteFor` `:359`).
  - `renderContext` prints it.
  - Run `pnpm gen:protocol`; update the conformance fake (`packages/conformance/src/fake-chips.ts`)
    and the docs (`apps/docs/src/content/docs/connect/{websocket,sdk,hooks,jacobian}.md`).
- **Clients (after his pick).**
  - Phone: a row on the room sheet's first page (`apps/mobile/src/spaces/RoomSheet.tsx`, the
    Card at `:588-615`, beside `LeadRow` `:951`) and its page.
  - Web and Mac: `apps/web/src/app/Members.tsx` (beside `LeadPicker` `:254-294`).
  - A guest sees it but cannot edit.
- **Tests.**
  - Protocol: schema and the room note line.
  - Server: the use case, including the guest refusal and range; `jobSpendOf` over a fixture
    with a lane, a run spanning the start, and a run with no cost.
  - Core: the fold.
  - Phone and web: the components.
  - Conformance.
  - Web e2e: setting it from the sheet.
- **ADR 0117** "A room has a spend ceiling per job" (R1–R3 as decided).
- **Live check.**
  - Set a room's ceiling from the phone.
  - Ask him to run a small job in it.
  - Read the room's `context.spend` in a harness's next `message.new` (4431 log) and the room
    note line.
- **Go-live:** migration (backup first), 4431, web, phone, Mac. Nothing pauses yet.

### Phase 2 — Jacobian: a follow-up is a run in its room

- **Where it changes.** The Chips channel (`src/channels/chips/`):
  - `bot.ts` (task bubble at `:618-621`, posting at `:488-512` and `:971-979`), `run.ts`,
    `session.ts` and `task-bubble.ts`;
  - the executor hook that posts a `space_turn`'s answer (`src/tasks/executor.ts:1364-1368`).
- **Behaviour.** When the task came from a Chips room, the follow-up:
  - opens a run in that room (goal: the original request's words, `goal_from: "chips"`);
  - streams its steps;
  - reports `usage` so Chips counts it;
  - posts its answer as the run's message;
  - registers its conversation so `joinTurn` reaches it;
  - is stopped by `run.cancel`.
- **Unchanged:** Telegram, Slack and Discord. The chain is still one link.
- **Tests.**
  - The Chips channel suite (`tests/unit/channels/chips`).
  - Executor delivery tests.
  - A new FROZEN vector: a Chips-room follow-up is a run and its Stop stops it.
  - The flaky task-bubble timing test still passes.
- **Docs:** Jacobian `CLAUDE.md` (#70, the queue, `:304-347`; brackets and lanes, `:2480-2492`)
  and `src/channels/CLAUDE.md` (`:855-880`).
- **Live check:** he gives a room a deliberately large ask that hits the cap once. Read that
  the follow-up is a run with cost and steps, and that a word from him joins it.
- **Go-live:** Jacobian fast-forward and restart.

### Phase 3 — Jacobian: any turn can carry on, within the count and the spend

- **Before starting:** confirm his approval of §5 (ruling 6) if it was not said in words.
- **Where it changes.**
  - `src/spaces/runtime.ts`:
    - add `mayCarryOn` beside `someoneIsWaiting` (`:333`);
    - `continueAtCap` (`:1462`) uses it;
    - `queueContinuation` (`:1527-1546`) carries `followUp` and `since_seq`;
    - the stop sentence (§3.3);
    - a new dep, `spentSince`.
  - The gateway wires `spentSince` from `CostStore` (`gateway/index.ts` near `queueTurn`,
    `:1182-1198`).
  - Config: `jobs.max_follow_ups` (default 5) and `jobs.spend_ceiling_usd` (default 3), in
    `config/default.yaml` and `src/config.ts`.
  - Chips: `TurnInput` gains `spend` (`src/spaces/types.ts:152-191`), read from
    `context.spend` beside `heardIn` (`bot.ts:1717-1754`) and passed through `handleIncoming`
    (`conversation.ts:648-656`).
  - A standing `budget.warning` pause for a room is remembered by the Chips bot and stops new
    follow-ups there. Handle `budget.warning` in the `bot.ts` switch (`:1179-1231`).
- **Frozen vectors** amended per §5. New FROZEN vectors:
  - a chain stops at the count;
  - a chain stops at the room's ceiling, saying so;
  - a chain stops on a `budget.warning` pause;
  - a waiting `hand_down` child still parks nothing;
  - Telegram's chain uses the config ceiling.
- **Pulse.** The `turn.rounds` note's "one follow-up turn carries the work on" becomes "a
  follow-up turn carries the work on" (`src/monitoring/pulse.ts:690-695`). Update its tests
  (`tests/unit/monitoring/pulse.test.ts:481-489`, which use substrings; adjust them, since
  they are not frozen).
- **Docs:**
  - Jacobian `CLAUDE.md` (the cap, `:335-347`; #78 at `:1660-1685` gets a line saying what
    fences it now);
  - `src/spaces/CLAUDE.md` (`:628-660`, "one link long by construction" is rewritten);
  - the debug-jacobian skill (#70);
  - `src/tasks/CLAUDE.md` (`:141`) if the queue's notes change.
- **Live check.** He gives a room a job bigger than two turns. Read:
  - the chain's follow-ups as runs;
  - the spend rising in the room note;
  - the chain ending with its answer, or stopping at the ceiling with its sentence.
- **Go-live:** Jacobian.

### Phase 4 — Chips: the ceiling holds the room, for every harness (ADR 0118); the bridge reports cost

- **Server.** After each `usage` append (`gateway.ts`, beside `hand-over-held.ts`'s hook at
  `:464-467`), check the room's job against its ceiling:
  - **At 80%:** `budget.warning` warn to the room's harnesses (once per job).
  - **At 100%:**
    - append `exchange.set paused` by the system with `why: "spend"` (extend `set-exchange`
      to accept a system pause with a reason);
    - send `budget.warning` pause (extend the event with `scope: "job"` and `space_id`);
    - draw the line.
  - A person's "let the agents carry on" releases it. As a person's act it starts the next
    allowance (R1).
- **Clients.**
  - `PausedBanner.tsx:29` (phone) and `SpaceView.tsx:491` (web) say the spend reason and the
    figures, with Carry on.
  - Core `pauseWords` (`core/model/exchange.ts:143`) gains the spend wording.
- **The bridge.**
  - Handle `budget.warning` (log it; OpenClaw runs one turn per message, so there is no chain
    to stop).
  - Report cost when OpenClaw's usage carries one (R2): read OpenClaw's usage shape
    read-only (`docker exec chips-openclaw-gateway-1`).
  - Tests in `bridge/test/bridge.test.ts`.
- **Tests.**
  - Server: the 80% warning once, the 100% pause once, carry on starting a new allowance, a
    room with no cost reports never pausing.
  - Protocol schema and conformance.
  - Clients.
- **ADR 0118** "At its spend ceiling a room's agents pause".
- **Live check.** Set a room's ceiling to $0.50, give it a job, and read:
  - the warning at $0.40;
  - the pause line at $0.50;
  - Jacobian's chain stopping with its sentence;
  - held agent words;
  - Carry on releasing them.
- **Go-live:** 4431, clients, the bridge.

### Phase 5 — Jacobian: a hand-off may move on; the job answers in its own room

- **Where it changes.**
  - `src/spaces/verbs.ts` `hand_down` (`:223-288`):
    - the `wait` flag and its description;
    - `wait: false` queues the child's job (a `space_turn`, source `handed:<parentId>`) and
      returns at once.
  - `src/spaces/runtime.ts`:
    - `someoneIsWaiting` is true for `handed:`;
    - the child's end hands its answer to the parent (a turn with source
      `child:<childId>`, on the parent's conversation, with the "already answered in <room>"
      prose).
  - Chips channel: the handed job's runs are in the child's room (Phase 2's machinery), and
    its answer is posted there as the child's message.
  - On Telegram, the answer under the space's name (R6).
- **Chips.** Check that a lane may outlive its lead run (`server/src/domain/lane.ts`,
  `route-lane.ts`). If not, amend that with an ADR, so the parent's room shows the route and
  the completion line with cost (`LaneChain.tsx`, `SpaceView.tsx:1491-1530`).
- **Frozen vectors.** None changed: `wait: true` is today's. New FROZEN vectors:
  - a `wait: false` hand-off returns before the child's first round;
  - the child's answer lands in its room;
  - the parent is handed it and may pass;
  - the child's chain follows Phase 3's limits;
  - a Telegram hand-off answers in the chat.
- **Docs:**
  - Jacobian `CLAUDE.md` (`:23-67` on hand_down);
  - `src/tasks/CLAUDE.md` (`:141`, "no serialization of `hand_down`": add that a hand-off
    that moves on is a queued job);
  - the debug-jacobian skill.
- **Live check.** In J's room he asks for a large job "in a new space". Read:
  - J answering in seconds;
  - the new room's lane;
  - the job planning, carrying on and answering there;
  - J staying silent or adding one line;
  - J's room showing the completion line.
- **Go-live:** Jacobian (and Chips if the lane amendment was needed).

### Phase 6 — acceptance

His runs; read each room and report against §6's readings.

- **A.** J to a new specialist room, a Cholesterol-sized ask.
- **B.** A room with a lead and four agents, one an OpenClaw agent, on a job bigger than
  ASCII Fish.
- **C.** The ceiling: a room set to $0.50.
- **D.** Stop mid-chain from the room.
- **E.** A from Telegram.

Then STATUS, memory, and a push on his word.

## 5. Frozen vectors this plan amends (ruling 6)

These are in Jacobian `tests/conformance/one-space.conformance.test.ts` (line numbers as of
`02b878d`). Each amendment keeps the vector's name with "(amended 2026-10, long jobs)" and adds
the new behaviour's vectors beside it. Delete none.

- `:4249` "FROZEN: a capped turn with a person waiting queues ONE follow-up…" (`goals.length`
  is 1). Becomes: queues a follow-up, and the chain may continue up to the count and the
  ceiling.
- `:4261` "FROZEN: a capped follow-up cannot queue a third…". Becomes: a capped follow-up may
  queue the next one within the count and the ceiling, and says "unfinished" with its reason
  when it may not.
- `:4285` "FROZEN (2026-09-16)…" ("still exactly one follow-up"). Becomes: as above.
- `:4083` "FROZEN: a turn that IS the background defers nothing". Unchanged in what it
  asserts. Read it again in Phase 3 to confirm it holds once deferral and carrying on are
  separate questions.

Kept as they are (a waiting `hand_down` is unchanged): `:1754`, `:1762`, `:4273`, `:6356`,
`:6441`, `:8725`, `:2940`, `:876`, `:13798`. If any of them would change, stop and ask.

## 6. Readings (Phase 0, then each phase's after)

1. **Job spend per room, last 30 days.**
   - From the live DB per R1: how many jobs would have reached $3, and the distribution.
   - Check that ASCII Fish's job comes out at $1.23 and Cholesterol's at about $0.29.
2. **Cost-reporting coverage.** Share of `usage` reports with a cost, per harness.
3. **Capped turns per week** (Jacobian log, "Reached the end of what one turn may do") and
   follow-ups per chain.
4. **Rounds per turn** (p50/p90/p99) from Jacobian's `api_calls` (a scratchpad copy of
   `~/.jacobian/data/workers/global/worker.db`), and the share of browser rounds after
   `70ec6fe`.
5. **The hand-off wait.** How long a parent's turn waits on a `hand_down` (span of the child's
   rounds inside the parent's trace).

## 7. Code map and docs

### 7.1 Chips

| Concern | Files |
| --- | --- |
| Migrations | `server/src/infrastructure/db/migrations/`, `migrator.ts`; latest `0036-room-lead` |
| Lead template | `routes/lead.ts`, `use-cases/set-lead.ts`, `domain/projection.ts:391-398`, `store/lead.ts:74`, core `store.ts:1965`, `model/spaces.ts:102`, `readers.ts:633` |
| Referee | `routes/exchange.ts:34`, `set-exchange.ts:50-77`, `protocol/src/address.ts:77-80`, `exchange.ts:47-48,154`, `submit-event.ts:898-937`, `hand-over-held.ts` |
| Cost | `submit-event.ts:1393-1409` (`priceUsage`), `domain/pricing.ts:20-24`, `projection.ts:1093-1105`, `projection-writer.ts:142-206`, core `model/runs.ts:249-264` |
| Context and note | `protocol/src/context.ts:130-155,375`, `room-note.ts:87-112,136,359`, `ws/session.ts:734-850` |
| Unused budget pieces | `schema.ts:420-433`, `ws/session.ts:373-375`, `chips-to-harness.ts:378,461-475`, `frames.ts:228`, `errors.ts:33` |
| Lanes | `domain/lane.ts:1-12,128-133`, `route-lane.ts:597-623`, core `model/lanes.ts:201-215`, phone `LaneChain.tsx`/`LaneDetails.tsx`, web `SpaceView.tsx:1491-1530` |
| Clients | phone `RoomSheet.tsx`, `PausedBanner.tsx`; web `Members.tsx`, `SpaceView.tsx:491`; the Mac is the web build |

### 7.2 Jacobian (line numbers as of `02b878d`)

| Concern | Files |
| --- | --- |
| hand_down | `src/spaces/verbs.ts:151-169,223-288`; `runtime.ts:1766-1770` (verbs one at a time) |
| The cap | `runtime.ts:59,305,333,360-404,1150,1262,1454-1469,1527-1546,1716-1718` |
| Queue | `gateway/index.ts:1182-1198`, `tasks/executor.ts:271-310,348,1120-1141,1178,1251-1257,1338-1368`, `scheduler.ts:126-144,1000-1025` |
| Cost | `turn-kit.ts:475-534`, `cost/store.ts:562-567` |
| Chips channel | `bot.ts:250-323,488-512,618-621,768-800,886-894,971-979,1179-1231,1717-1754,1926-1936`, `lanes.ts:42-143`, `session.ts:394-397,451-502,571-604,669`, `run.ts:85-165`, `task-bubble.ts`, `conversation.ts:521-548,648-656,660,703-735` |
| Prose and pulse | `src/spaces/kit/charter.ts` (`SPACE_INVARIANTS`), `src/monitoring/pulse.ts:675-700` |

### 7.3 The bridge

`bridge/src/bridge.ts` (usage at `:303-309`, frames at `:840-856`) and `bridge/test/bridge.test.ts`.

### 7.4 Docs to update

- **Chips:**
  - ADRs 0117 and 0118, plus a lane amendment if Phase 5 needs one;
  - `apps/docs` connect pages, and the generated reference;
  - `docs/STATUS.md`;
  - memory `jacobian-capped-hand-down` (or a new `chips-long-jobs` note, linked).
- **Jacobian:** root `CLAUDE.md` (`:23-67`, `:304-347`, `:1660-1685`, `:2480-2492`),
  `src/spaces/CLAUDE.md` (`:628-660`), `src/tasks/CLAUDE.md` (`:141`),
  `src/channels/CLAUDE.md` (`:855-880`), and the debug-jacobian skill.

## 8. Decision records

- **ADR 0117:** a room has a spend ceiling per job (Phase 1).
- **ADR 0118:** at its spend ceiling, a room's agents pause (Phase 4).
- **A lane may outlive its lead run** (Phase 5, only if needed).
- Jacobian records its rules in its CLAUDE.md files, not ADRs.
- Each ADR quotes his words from §1 and reads like 0112: Context, Decision as bold-led
  bullets, "What is left out, and why", Consequences.

## 9. Post-compaction prompts

Paste one to start a phase.

### Phase 0

> Run Phase 0 of `docs/proposals/long-jobs-plan.md`. Read §0–§3 and §6 and the memory notes
> it names. Take the readings in §6 from the live Chips DB (read-only) and a scratchpad copy of
> Jacobian's `worker.db`. Then build the phone-width animated mock (spend row and editor in two
> or three variants, the ceiling line with Carry on, the room note line) as a private Artifact,
> loading `artifact-design` first. Report the readings and the mock link, and stop for my pick.

### Phase 1

> Run Phase 1 of `docs/proposals/long-jobs-plan.md` (Chips: the room's spend ceiling and the
> job's spend, ADR 0117). My pick from the mock: <pick>. Rulings R1–R3: <as recommended, or
> changes>. Build in a worktree, gates per §0, merge as you go, then report and wait for my
> "go live".

### Phase 2

> Run Phase 2 of `docs/proposals/long-jobs-plan.md` (Jacobian: a follow-up is a run in its
> room). Build in a Jacobian worktree, touched suites only, add the FROZEN vector, update the
> CLAUDE.md sections named, then report and wait for my "go live".

### Phase 3

> Run Phase 3 of `docs/proposals/long-jobs-plan.md` (Jacobian: any turn can carry on within
> the count and the spend). I approve amending the frozen vectors in §5. Rulings R4–R5: <as
> recommended, or changes>. Build in a Jacobian worktree, then report and wait for my "go
> live".

### Phase 4

> Run Phase 4 of `docs/proposals/long-jobs-plan.md` (Chips: the ceiling holds the room, ADR
> 0118; the bridge reports cost). Build in worktrees (Chips and the bridge), then report and
> wait for my "go live".

### Phase 5

> Run Phase 5 of `docs/proposals/long-jobs-plan.md` (Jacobian: a hand-off may move on; the job
> answers in its own room). Ruling R6: <as recommended, or changes>. Check the lane question
> first and tell me if Chips needs an amendment. Then build, report, and wait for my "go live".

### Phase 6

> Run Phase 6 of `docs/proposals/long-jobs-plan.md`. I have run A–E in the rooms named <…>.
> Read each, report against the readings, and update STATUS and memory.
