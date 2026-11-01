# An agent's model and effort, chosen on its page

**Plan of record, 8 October 2026. Status, 9 October 2026: Phases 0–6 done, live and pushed
(Phase 5 on 4431's page and the Mac app at 18:25). Phase 6's acceptance passed on scratch and live
(`testing/scenarios/agents/agent-model.md`); his look on the iPhone and the Mac is owed.** Arjun: "next I need ability to change the LLM model
and its effort level from the Agent detail page", then, on the mock: "B, write the phased plan".

**The mock is the reference for every screen:** a phone, light and dark, six scenes that play
themselves, layout B ("One row, one sheet"):
<https://claude.ai/artifact/SaHTfGPQg7Y2u3D2R2PEUT>. Its source is `model-mock/agent-model.html`
in the scratchpad of the session that drew it; it stays out of the repo.

In one line each:

- **The harness says what an agent runs on and what it could.** Its models, each model's effort
  levels, what "same as" means, and the words for all of them come from the harness. Chips names
  no model.
- **One row, one sheet, one Save.** The agent's page shows its model and effort in one row; the
  sheet holds the models, a "Same as …" switch and the effort bars; Save sends both together.
- **The harness answers.** A change goes down the harness's socket and is done when the harness
  says so, refused with its words, or missed after a minute, as an edit to a context file is.

**What it costs.** About half of agent context (ADR 0134/0135), since there is one small record
per agent and no editor:

- **Chips:** a capability, a protocol module, migration 0041, three routes, core, the phone's
  group, sheet and bars, and the web's.
- **Elsewhere:** the OpenClaw bridge and Jacobian's adapter.
- **Going live:** 4431 restarted once (the migration); the bridge and Jacobian restarted and
  declared; `pnpm web:build`, `pnpm desktop` and `pnpm phone build`.

## 0. How to use this document

- **Order.** Run the phases in order:
  1. Protocol, server and core. Nothing changes that anyone sees.
  2. OpenClaw's bridge.
  3. Jacobian, before the phone, because the phone's walk needs a harness with a "Same as"
     default.
  4. The phone.
  5. The Mac and the web.
  6. Acceptance.
- **Before each phase:**
  - Read §1 to §3, the phase itself, and these memory notes:
    - `chips-agent-model-effort`, `chips-agent-context`;
    - `chips-main-is-shared-between-sessions`, `chips-working-agreements`;
    - `arjun-judges-ui-from-running-mocks`, `arjun-wants-flat-controls`;
    - `chips-phone-testing`, `arjun-merge-as-you-go`, `arjun-wants-me-to-restart`;
    - `chips-testing-folder`.
  - Run `ListAgents`, read `git reflog show main -5`, and check `git log origin/main..main`.
  - Make or reuse a worktree from main on a `claude/agent-model-*` branch, and bring it up to
    main with `git rebase main` (main stays linear: replay, never merge). Then run
    `pnpm install --frozen-lockfile`.
- **Where.**
  - Chips: the worktree above.
  - The bridge: `~/Work/chips-openclaw` (no remote), in its own worktree. Symlink
    `node_modules` in, and unlink it before removing the worktree.
  - Jacobian: `~/Work/Jacobian`, in its own worktree with `node_modules` symlinked the same
    way. Nothing is committed in Jacobian without his word. On a go-live he has said I commit,
    fast-forward and restart.
- **Commits.**
  - Conventional Commits, `git -c commit.gpgsign=false commit -s`, ending
    `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Jacobian's commits are sentence case, with no prefix and no DCO.
  - Fast-forward main as each phase lands (merge as you go). Run `ListAgents` and read the
    reflog again before the fast-forward. If a peer has just moved main, replay onto a new
    named branch from main, never a detached HEAD.
- **Gates.**
  - `pnpm check` (lint, typecheck, Vitest, the phone's Jest).
  - The guardrails (`pnpm --filter @chipschat/guardrails test`) after `git add` and before the
    fast-forward; read the exit codes.
    - `harness-literals` and `no-harness-named` refuse a harness's name in product code.
    - A model name is the harness's word too: no `gpt-`, `claude-` or `opus` in Chips' product
      code. The pricing table in `server/src/domain/pricing.ts` is the one place that has them
      today.
    - Test fixtures use neutral names: harness "Lathe", models "Heron 2" and "Heron 2 Mini",
      levels "Light", "Steady" and "Deep".
  - Biome's complexity limit is 12.
  - The bridge: `npm test` in its `bridge/`.
  - Jacobian: touched suites only. Never run its full `npm test`, and never type `jacobian`
    bare.
  - The phone e2e (`pnpm mobile:e2e`) in Phase 4; the web e2e (`CHIPS_E2E_WEB_PORT=5199`,
    `--project=chromium`) in Phase 5.
  - Never two heavy suites at once, and never beside a peer's `pnpm check`. Check `ps` for jest
    or vitest first.
- **UI.**
  - He judges from the mock and then from his phone.
  - Controls stay flat. The cool goes into motion: the bars' light sweeping up, the check
    popping in, the working mark while saving, the gold landing flash on the row.
  - Walk each UI phase on a simulator as a Release build, with stills, against a scratch Chips.
    Say plainly what was not walked (Android, iOS 27, iPad).
- **Live.**
  - 4431 is live and his: never pair a new device to it, kill by PID only, and run `lsof`
    first.
  - Scratch Chips is on 4436 (`~/Work/chips-openclaw/scripts/scratch-chips.sh start|stop`).
    Harnesses run there as stand-ins built from each harness's own code, as agent context's
    Phases 3 and 4 did: the bridge's Chips client with OpenClaw's gateway in memory, and
    Jacobian's `ChipsBot` with a real `SpaceManager` on a scratch data folder. That way the live
    bridge and the live Jacobian stay on 4431.
  - `pnpm live` with `CHIPS_CONFIG_HOME` pointing at a CLI device paired to the scratch.
- **Go-live, only on his word.**
  - I commit, fast-forward and restart what changed, and check each came back.
  - 4431: back up the database first, then kickstart it. The bridge, and Jacobian.
  - `chips declare` sets a harness's whole capability list, so read the current list first.
  - Phone: `pnpm phone build` (it builds from main). Mac and web: `pnpm web:build` and
    `pnpm desktop`.
  - Before a phone build, tell busy peers, and tell them again when it's done.
- **Push only on his word.** Say which peers' commits a push would carry.
- **Docs.**
  - The ADRs of §7.
  - `docs/STATUS.md`, newest first under "In progress".
  - The memory note `chips-agent-model-effort`.
  - Update STATUS and memory at the end of each phase and before any compaction.
- **Reports.** Each phase ends with:
  - the gates and their counts;
  - stills where there is UI;
  - what is on main, live and on his phone, and what is not pushed;
  - the next phase's prompt from §9.

## 1. Rulings

### 1.1 His (8 October 2026)

1. **From the agent's page:** its model and its effort level.
2. **B, not A:** one row and one sheet, with models, the "Same as …" switch and the effort bars
   together, and one Save.

### 1.2 Taken as drawn in the mock (change any before the phase that builds it)

3. **Nothing about a model is Chips'.** The harness sends:
   - each model's id and label, and each model's effort levels, lowest first;
   - the label of the default ("Same as J", "OpenClaw's default");
   - why an agent's model can't be changed, when it can't.

   Chips' only words of its own:
   - "effort";
   - "its own";
   - the line "Higher is slower, and costs more";
   - the states: saving, saved, refused, hasn't answered, away.
4. **The harness's owner, or an owner or admin of the workspace, sees and changes it**, as for
   context files. Anyone else sees no Model group.
5. **One Save sends the model and the effort together.**
   - The "Same as …" switch drops both, so the agent uses the default for each.
   - With the switch off, the agent has both of its own, starting from what it runs on now.
6. **Changing model keeps the effort if the new model has that level.** Otherwise it takes the
   model's own default level, else the nearest lower one. A model with no levels hides the bars.
7. **Away means read only.**
   - While no socket of the harness hears changes, the row is quiet, the sheet doesn't open, and
     the foot says so.
   - A tap shows "<Harness> is away".
   - There is no queue.
8. **A change not answered in 60 s is missed.** The sheet says "<Harness> hasn't answered. It
   may still change it." A later answer still counts.
9. **A refused change keeps the sheet open,** with the harness's message under Save and the
   picks left as they were.
10. **Changing an agent other agents follow changes theirs too** (J in Jacobian).
    - The foot on its page says how many follow it: "38 agents have no model of their own and
      use J's."
    - There is no extra confirmation.
11. **OpenClaw:**
    - Set per agent, not per session, so a session reset keeps it.
    - Agents the bridge made can be changed, and so can `main`, the Main agent (his word, 10
      October 2026; bridge `c0faa22`). Any agent the bridge adopted is read only: "OpenClaw's own
      agent. Change it in OpenClaw." Until 10 October `main` was read only too.
12. **Jacobian:**
    - Chips sets a Space's turn model and effort (`metadata.models.turn` and `.effort`).
    - Its utility model, the placement hop and the compaction fold are left as they are.
13. **The bars:**
    - One bar per level the harness gives, rising, lit gold up to the chosen level.
    - At most 8 levels. A harness sends its most useful 8.
    - Under each bar its level's name when there are 5 or fewer; above that, only the big name of
      the chosen level.

## 2. What is there (read 8 October 2026)

**Chips** stores no model or effort for an agent.

- The only model in the protocol is the per-run `usage.model` (and `context.usage.model`), which
  the run panel and the phone's line menu show.
- Capabilities live in `packages/protocol/src/capabilities.ts`. A socket's `accepts` list is in
  `frames.ts:51-57`.
- The template is agent context, as built:
  - Registry tables, not the log (`0039-context-files.ts`).
  - A frame down sockets that say `context` in `hello` (`interfaces/ws/hub.ts:217-235`).
  - The harness answers with its next `PUT` (`answers` / `refuses`).
  - "Missed" is computed when read.
  - "Away" means no socket hears it (`use-cases/context-files.ts`).
- The agent's page:
  - Phone: `apps/mobile/src/agents/AgentCard.tsx`, in the order hero, Facts, Context, History,
    Acts.
  - Web and Mac: `apps/web/src/app/Agents.tsx` (`CardSection`, `.agent-card-side`).
- The next migration is 0041 and the next ADR is 0140.

**Jacobian** already has what this needs.

- **Storage.** Each Space keeps `metadata.models.{turn, utility, effort}` on its registry row.
- **Inheritance.** It is resolved up the Space tree by `resolveModels` (`src/spaces/models.ts`).
  The first Space that sets a slot answers it. A slot nobody sets falls to the config defaults
  (`src/gateway/index.ts:1047-1051`).
- **Next turn.** The kit is rebuilt each turn, so a change applies on the next turn with no
  restart.
- **Dashboard.** It edits the same store with `GET/PUT /api/spaces/:id/models`
  (`src/gateway/routes/projects.ts:881-967`).
- **Effort values.** `low | medium | high | xhigh | max` (`src/agent/types.ts:75-81`). Only the
  ChatGPT and Codex providers honour them.
- **Models.** No model id is validated at runtime. A reachable list comes from
  `model-settings.ts` `buildOptions`: the base options plus the pricing table. Claude ids must
  not be offered while Anthropic is off.
- **Live today:**
  - `gpt-6.1-sol` at `high` through Codex, billed $0.
  - No Space sets its own, so all 38 of its Chips agents follow J.
- **The adapter's template.** `src/channels/chips/context.ts`:
  - `Contexts.send` resends only when a hash moved;
  - every hello clears that memory;
  - the follow pass runs every 30 s.

**OpenClaw** (image 2026.9.6; its source isn't on disk, so these come from the protocol schema
in the bridge's `node_modules`):

- **Model.** `agents.update {agentId, model: "provider/id" | null}`.
- **Effort.** `config.patch` on `agents.entries.<id>.thinkingDefault`, with a `baseHash` from
  `config.get`. `sessions.patch` with `thinkingLevel` also works, but a session reset loses it.
- **Lists.** `models.list` gives each model with its `thinkingLevels[{id,label}]` and
  `thinkingDefault`. `agents.list` gives an agent's `model.primary` and `thinkingDefault`.
- **Live today:** `openai/gpt-6-astra`, with no `thinkingDefault` set anywhere.
- **Reloads.** A config write reloads OpenClaw, which can fail a turn that is starting
  (`PreparedModelCatalogConfigReplacedError`). The bridge already resends such a turn once.
- **Sessions.** Each made agent has exactly one session.

## 3. The design

### 3.1 Protocol (`packages/protocol/src/agent-models.ts`)

**Limits:**

- `MODEL_CHOICES_MAX = 40`
- `EFFORT_LEVELS_MAX = 8`
- `MODEL_CHANGE_WAIT_MS = 60_000`
- The id prefix `change: "chg"`.

**Capability `models`** (`HARNESS_CAPABILITIES.models`). The harness:

- sends Chips each agent's model and effort and what it could have;
- keeps them current;
- takes changes.

A harness that does not declare it gets no Model group. A socket that takes changes says `models`
in its `hello` `accepts`.

**Harness → Chips (harness token):** `PUT /v1/agents/:id/model`

```ts
{
  model: string;              // the model it runs on now (an id from `choices`)
  effort?: string;            // the level it runs at now; absent when its model has none
  own: boolean;               // it has a model or an effort of its own; false: it uses `default`
  default?: {                 // what it uses with none of its own; absent: no "Same as" switch
    label: string;            // "Same as J", "OpenClaw's default"
    model: string;
    effort?: string;
  };
  choices: Array<{            // 1..40, `model` among them
    id: string;               // the harness's own id: "gpt-6.1-sol", "openai/gpt-6-astra"
    label: string;            // "GPT-6.1 Sol"
    efforts: Array<{ id: string; label: string }>;  // 0..8, lowest first
    effort_default?: string;
  }>;
  editable: boolean;
  why_read_only?: string;     // "OpenClaw's own agent. Change it in OpenClaw."
  followed_by?: number;       // agents with none of their own that use this one's
  answers?: string;           // the change this copy answers: done
  refuses?: { change_id: string; message?: string };  // a change not made
}
```

When it is sent:

- when the harness makes or claims an agent;
- on connect, for each agent;
- when an agent's model or effort changes outside Chips;
- with each answer.

A `model` or `effort` that isn't in `choices` is a 422.

**A person, the harness's owner or an admin:**

- `GET /v1/agents/:id/model` returns what the harness sent, plus:
  - `agent_id`, `harness_id`, `read_at`;
  - `away`;
  - `change?: { change_id, state: "waiting" | "saved" | "failed" | "missed", model, effort,
    asked_at, answered_at?, message? }`, the last change asked.
- `POST /v1/agents/:id/model/changes` `{ model: string | null, effort: string | null }` returns
  `202 { change }`. Both null means use the default. It is refused with:
  - **422**: not in `choices`; an effort that isn't one of that model's levels; null without a
    `default`; or a model not editable;
  - **409 `harness_away`**: no socket hears `models`;
  - **409 `change_waiting`**: a change younger than a minute still waits;
  - **403**: anyone but the owner or an admin;
  - **404**: a harness that doesn't declare `models`, or hasn't sent this agent's yet.

**Chips → harness:** the frame `model.change`, sent now or never (not in the log):

```ts
{ frame: "model.change", change_id, harness_id, agent_id,
  model: string | null, effort: string | null, asked_by, asked_at }
```

The harness answers by `PUT`ting the agent's copy with `answers` or `refuses` naming `change_id`.

**Examples, as the two adapters will send them:**

```jsonc
// Jacobian, Shore Writer (follows J)
{ "model": "gpt-6.1-sol", "effort": "high", "own": false,
  "default": { "label": "Same as J", "model": "gpt-6.1-sol", "effort": "high" },
  "choices": [ { "id": "gpt-6.1-sol", "label": "GPT-6.1 Sol", "efforts": [
      { "id": "low", "label": "Low" }, { "id": "medium", "label": "Medium" },
      { "id": "high", "label": "High" }, { "id": "xhigh", "label": "Extra high" },
      { "id": "max", "label": "Max" } ] }, … ],
  "editable": true }
// Jacobian, J
{ "model": "gpt-6.1-sol", "effort": "high", "own": false,
  "default": { "label": "Jacobian's default", "model": "gpt-6.1-sol", "effort": "high" },
  "followed_by": 38, "choices": [ … ], "editable": true }
// OpenClaw, a made agent
{ "model": "openai/gpt-6-astra", "effort": "medium", "own": false,
  "default": { "label": "OpenClaw's default", "model": "openai/gpt-6-astra" },
  "choices": [ { "id": "openai/gpt-6-astra", "label": "GPT-6 Astra",
      "efforts": [ { "id": "low", "label": "Low" }, … ], "effort_default": "medium" } ],
  "editable": true }
```

### 3.2 Server

- **Migration 0041 `agent-models`.** One registry table `agent_models`:
  - primary key `(workspace_id, agent_id)`;
  - `harness_id`;
  - `said`, the harness's copy as JSON, read and written whole;
  - `read_at`;
  - `change`, as JSON, nullable: `{ id, model, effort, asked_by, asked_at, state, message,
    answered_at }`.

  Only one change is kept per agent, so there is no second table.
- **Use cases** in `use-cases/agent-models.ts`:
  - **`putAgentModel`:** only the agent's own harness may call it. It checks `model` and `effort`
    against `choices`, stores the copy, and closes the waiting change it answers or refuses.
  - **`readAgentModel`:** owner or admin, the capability declared, the copy sent. It reports
    `away` and the change's state. Missed is worked out on read and never stored.
  - **`askModelChange`:** the checks of §3.1. It stores the change, then sends the frame. With no
    socket hearing it, the change is marked failed and refused as `away`.
- **Hub:** `hearingModels(workspaceId, harnessId)` and `modelChange(…)` beside `hearingContext`
  and `contextEdit`. The `accepts` enum gains `models`.
- **Routes** in `interfaces/http/routes/agent-models.ts`. Each one gets its row in the
  authorization matrix.
- **Cleanup.** Deleting an agent deletes its row; removing a harness deletes its agents' rows
  (`delete-agent.ts`, `remove-harness.ts`).

### 3.3 Core (`packages/core/src/agentModel.ts`)

- `takesModels(directory, harnessId)` and `mayChangeModel(model, directory, agentId, selfId)`:
  owner or admin, and the capability declared.
- **`modelRow(view)`** gives one row, for both clients:
  - `label`: the model's label;
  - `sub`: "High effort · Same as J", or "· its own";
  - `level` and `levels` for the bars;
  - `quiet` when away or read only;
  - `foot`, which covers `followed_by`, away and read only.
- **`ModelSheet`**, the sheet's model with no drawing in it:
  - `open(view)`;
  - `same(on)`;
  - `pick(modelId)`, applying ruling 6;
  - `level(effortId)`;
  - `changed`;
  - `ask()` → `{ model, effort }`, both null when Same.
- **`saveModelChange(store, agentId, ask)`** posts the change, then reads it every 800 ms for up
  to 65 s. It settles on saved, failed with the harness's message, or missed.
- **The words.** "Saving to <harness>", "Saved", "<harness> hasn't answered. It may still change
  it.", "<harness> is away".
- **Store:** `readAgentModel`, `changeAgentModel`.
- **`pnpm live model <agent>`** reads, and **`pnpm live model-set <agent> --model <id> --effort
  <id> | --same`** changes and waits for the outcome. Later phases' runs use both.

### 3.4 OpenClaw bridge (`bridge/src/models.ts`)

- **Check first, read only, against the live gateway** (`scripts/cli.sh gateway call … --json`):
  1. `models.list` with `view: "default"` and `view: "configured"`. Which models are
     `available`? Which `thinkingLevels` does each give?
  2. `agents.list`: what does a made agent show for `model` and `thinkingDefault`?

  Pick the view that lists what this install can run, and filter out `available === false`.
- **Each made agent's copy:**
  - `model` from `agents.list` (`model.primary`, else the default's).
  - `effort` from `thinkingDefault`, else the model's `thinkingDefault`.
  - `own` when the agent's entry sets either.
  - `default`: `{ label: "OpenClaw's default", model: agents.defaults.model.primary, effort?:
    agents.defaults.thinkingDefault }`.
  - `choices` from `models.list {agentId}`.
- **Adopted agents:** sent with `editable: false` and ruling 11's words. (`main` was too, until
  10 October 2026; it is changed as a made agent is now.)
- **A change:**
  1. `agents.update {agentId, model | null}`.
  2. `config.patch` `{ agents: { entries: { <id>: { thinkingDefault: level | null } } } }`, with
     a `baseHash` from `config.get`.
  3. Read `agents.list` again and `PUT` the copy with `answers`.

  An error refuses, with OpenClaw's message cut to 300 characters.
- **Check on scratch:**
  - Does the made agent's session follow the agent's model on the next turn, with no session
    override? If not, also `sessions.patch {key, model: null, thinkingLevel: null}`, so the
    session inherits.
  - Does `agents.update` reload the config? The bridge's resend-once covers a turn it breaks.
    Say so in the report.
- **Wiring.**
  - `chips.ts`: `onModelChange`, `accepts` gains `models`, and a `case "model.change"`.
  - `main.ts`: wire it.
  - The fake gateway in `test/bridge.test.ts` grows `models.list`, `agents.update` and
    `config.patch`.
- **When it sends:**
  - on connect, for each agent;
  - after each change;
  - after a turn, if `agents.list` shows the agent's model or `thinkingDefault` moved (hash-diff,
    as context does).

### 3.5 Jacobian adapter (`src/channels/chips/models.ts`)

- **`Models`, beside `Contexts`, for each Chips agent** (J, and the Spaces directly under J):
  - `model` and `effort` from `resolveModels`. The defaults are built as
    `index.ts:1047-1051` builds them; the bot reads `config` already.
  - `own` when the Space's own `metadata.models` sets `turn` or `effort`.
  - `default`:
    - For a Space, its parent's resolved values, labelled "Same as <parent's agent name>" ("Same
      as J").
    - For J, the config defaults, labelled "Jacobian's default".
  - `followed_by`: for J, the Chips agents whose Spaces set neither slot. For any other Space,
    the Chips agents under it that set neither (none today).
- **`choices`:**
  - Ids from `model-settings.ts` `buildOptions`, without `whisper-1`.
  - Leave out Claude ids while Anthropic is off.
  - Labels made in the adapter from the id ("gpt-6.1-sol" → "GPT-6.1 Sol").
  - The effort levels are `REASONING_EFFORT_VALUES`, labelled Low, Medium, High, Extra high and
    Max, for models whose provider honours effort. Other models get none.
- **A change:**
  - Validate as the dashboard's route doesn't: the model must be in `choices`, and the effort
    must be `isReasoningEffort`.
  - Write `metadata.models.turn` and `.effort` through `manager.getContainerRecord` +
    `manager.updateProject`, as `projects.ts:943-961` does. Null clears a slot.
  - Answer with the copy.
  - Queue per agent, as `Contexts` does.
- **Wiring.**
  - `client.ts`: `onModelChange`, a `case "model.change"`, and `accepts` gains `models`.
  - `bot.ts`: wire it in `start`.
- **When it sends:**
  - at hello;
  - on `agent.registered`;
  - on every 30 s follow pass, with the hash-diff.

  That way a dashboard edit, or J's change reaching 38 agents, shows in Chips within 30 s.
- **Touched suites:** `tests/unit/spaces/models.test.ts`, and
  `tests/unit/channels/chips/{client,models,bot}.test.ts`.

### 3.6 Phone (as the mock, layout B)

- **The Model group, on `AgentCard`, between Facts and Context:**
  - The heading is "Model", with the harness's squircle and its name at the right.
  - One marked row:
    - a `RowMark` tile with a new `model` icon (a chip glyph, added to `@chipschat/ui`'s icons and
      the phone's `SYSTEM_ICONS`);
    - the model's label;
    - the sub line, "<Level> effort · Same as J" or "· its own";
    - the bars at the right;
    - a chevron.
  - A `GroupFoot` under it with `modelRow`'s foot.
- **`ModelSheet`** (`ui/Sheet.tsx`), from top to bottom:
  1. The head: the agent's face, "<Name>'s model" and the harness's name.
  2. A "Same as …" row with a flat switch, when a default is given.
  3. The models as radio rows with a gold check, dimmed while Same is on.
  4. "Effort": the big name of the level, the line "Higher is slower, and costs more", and the
     bars. They are buttons, rising, lit gold up to the chosen one; the light sweeps 50 ms a bar.
     They are dimmed while Same is on.
  5. A full-width Save: grey until something changed, then gold. While it waits it shows
     `ChipPulse` and "Saving to <harness>"; then a green check and "Saved". The sheet closes
     650 ms later, and the row flashes gold (`spaces/Motion.tsx`).
  - Refused or missed: the sheet stays, with the line under Save (rulings 8 and 9).
- **Away or read only:** the row is quiet with no chevron. A tap shows a glass hint, "<Harness>
  is away" or the harness's reason.
- **Motion** uses React Native's `Animated`, since Reanimated in a tested component crashes Jest.
  It respects reduce-motion.
- **Files.** In `apps/mobile/src/agents/model/`: `ModelGroup.tsx`, `ModelSheet.tsx`,
  `EffortBars.tsx` (row and dial in one component, by size) and `useAgentModel.ts`. Each stays
  under Biome's limit.

### 3.7 Mac and web

- **Where:** a Model group in `.agent-card-side`, above Context, with the same row and foot.
- **The dialog:** the same parts as the sheet.
  - The models are a radiogroup and the bars are a radiogroup; arrow keys move along both.
  - Enter saves and Escape closes.
  - Focus goes back to the row.
- **Files:** `apps/web/src/app/model/` (`ModelGroup.tsx`, `ModelDialog.tsx`, `EffortBars.tsx`),
  from the same core.

### 3.8 What is not here

- No model per room, and no `/model` in a room.
- No utility model, fast mode, fallbacks, allow-lists or cost estimates.
- No history of changes; nothing in the log.
- Nothing for a harness that doesn't declare `models`.
- No queue while a harness is away.

## 4. Phases

### Phase 0: the mock (done, 8 October 2026)

The mock above has two layouts. He picked B. Research of all three codebases is in §2 and in the
memory note.

### Phase 1: protocol, server, core (ADR 0140)

- **Protocol:** §3.1, with zod shapes, fixtures (`frames/model.change.json`, a copy, a view) and
  tests. That includes a 41st choice, a 9th level, and a `model` not among the choices.
- **Server:** §3.2, with the migration and its roll-back test lists starting at 0041, the use
  cases, the routes, the hub and the cleanup.
- **Core:** §3.3, plus `pnpm live model` and `model-set` in `tools/live/live.mjs`.
- **Tests:**
  - Server Vitest for every route and refusal: owner or admin only, harness only, away, waiting,
    undeclared, not sent, not in choices, effort not the model's, no default, answers, refuses,
    missed, cleanup.
  - Core: `modelRow` and `ModelSheet`, ruling 6 in every case.
- **Docs:**
  - ADR 0140, "An agent's model and effort are its harness's, chosen in Chips", built from §1 and
    §3.1–3.3. Its shape follows ADR 0134: Context, Decision as bold-led bullets, What is left
    out, Consequences.
  - STATUS and memory.
- **Go-live, on his word:** back up the database, kickstart 4431 (migration 0041). Nothing shows
  until a harness declares `models`.

### Phase 2: the OpenClaw bridge

- §3.4 in a bridge worktree, checking with the live gateway first.
- **Tests:**
  - the copy for a made agent, and for `main`;
  - a change saved: both calls made, the copy re-read;
  - Same: both cleared;
  - a refusal carrying OpenClaw's words;
  - a turn that finds the model moved sends a copy.
- **Scratch run** against 4436, with the stand-in (the bridge's Chips client and `models.ts`,
  OpenClaw's gateway in memory, its `models.list` answer taken from the live read), driven by
  `pnpm live model` and `model-set`:
  - read;
  - change;
  - Same;
  - a refusal (the stand-in refuses one model);
  - away (the stand-in stopped) gives `harness_away`;
  - missed (the stand-in paused).
- **Go-live, on his word:**
  1. Fast-forward the bridge's main and restart it.
  2. `chips declare hrn_01M3GZ8BFBQHBDE1JJHTPDDBFA <its current capabilities> models`, then a
     reconnect.
  3. `pnpm live model "OpenClaw"`.
  4. One change on the test agent *OpenClaw*. Its next turn's `usage.model` says the new model,
     and `agents.list` shows the `thinkingDefault`.
  5. Put it back.
- **As built (8 October 2026; bridge `0107232` on `feat/agent-model`):**
  - **The view is `configured`.** Live, it lists six models, each with levels `low` to `ultra`
    (five for the two Lunas), all `available`. The `default` view adds three with no levels,
    one named in lower case; `all` gives the same six.
  - **One `config.patch`, not `agents.update` and then a patch.** The agent's entry gets `model`
    and `thinkingDefault` in one merge patch with the config's hash: one write, both or neither.
    OpenClaw's reload plan has `agents.entries` as a hot path, so it reloads without restarting
    the gateway (read in the container's code; `config.patch` restarts only for a path that
    needs it, or with reload off, which this install isn't). `agents.update` writes the same key.
    A config moved since it was read is read again, three tries.
  - **Sessions:** the made agent's session keeps no model or level of its own
    (`modelOverrideSource: null`). No `sessions.patch`; the go-live checks the next turn.
  - **The order at go-live:** a Chips from before ADR 0140 refuses a `hello` that says `models`,
    so 4431 is kickstarted (migration 0041) before the bridge restarts. Then declare, then the
    bridge.
  - **The test agent:** *OpenClaw* (`agt_01M4D2N6RTP1HAHTY0WZPWPKH9`) was deleted on 8 October,
    and the name is now the Main agent's, which is read only. The made agent live is *OpenClaw 5*.

### Phase 3: Jacobian

- §3.5 in a Jacobian worktree; touched suites, with each new test shown failing first.
- **Scratch run** with the stand-in (the real `ChipsBot` and `SpaceManager` on a scratch data
  folder, against 4436, under a scratch harness that does not declare `restarts`):
  - read J and a Space;
  - change a Space and see `metadata.models` written;
  - Same clears it;
  - change J and see the Space's copy follow within a pass;
  - a dashboard-style write (`updateProject` by hand) reaches Chips within 30 s.
- **Go-live, on his word:**
  1. Commit and fast-forward Jacobian, then `bin/jacobian restart --check`.
  2. Check its pid and start time, and that `chips=healthy`.
  3. `chips declare hrn_01M1S0WD54TRY8QVF6EAV7RDKE <its current capabilities> models`.
  4. `pnpm live model J`.
  5. One change on the test Space *Agent Context Check*. Its next run's log shows the model and
     effort, then it is put back.
- **As built (9 October 2026; Jacobian branch `claude/agent-model` from main `1883662`, not
  committed):**
  - **The tree comes from the gateway, not the adapter.** §3.5 had the adapter rebuild the defaults
    from config. Instead the gateway hands every channel, once, the `spaceModels` service: the
    `SpaceStore` and `modelDefaults` its turns resolve with, the dashboard's chat models
    (`getModelSettings`, so `whisper-1` and, with Anthropic off, Claude are left out), and
    `takesEffort`. What Chips shows is read the way a turn resolves it, from one place.
  - **Effort only where it is honoured.** `takesEffort` (new in `model-settings.ts`): an OpenAI
    model on the Codex sign-in (`providers.openai.auth: codex`). Live is that, so each model
    offered has Low to Max.
  - **The models offered** are the dashboard's, not the cost table's: with a config shaped like the
    live one, GPT-5.5, GPT-5.3 Codex, GPT-5.4, GPT-5.4 Mini and GPT-6.1 Sol (labelled from its
    id), plus any model a Space already runs on that the list lacks.
  - **`followed_by`** counts the agents with nothing of their own between them and that Space
    (all of them for J); it is sent only when it is above 0.
  - **After a saved change every copy that moved goes at once,** so J's change shows on its
    followers' pages in the same second, not at the next pass.
  - **Files:** `src/channels/chips/models.ts` (new), `client.ts`, `bot.ts`, `spaces.ts`
    (`spaceAgents` carries names), `src/channels/services.ts`, `src/gateway/index.ts`,
    `src/gateway/model-settings.ts`, `src/channels/CLAUDE.md`; tests `models.test.ts`,
    `client.test.ts`, `fakes.ts`, `model-settings.test.ts` and the `FROZEN (agent model)` vector.
  - **Scratch run passed** (9 October, 00:02–00:04 PDT), as STATUS records.
  - **Later the same day (08:30, Jacobian `e846bb6`, live): the models are Codex's.** GPT-6-Astra
    was missing because the dashboard's list was Jacobian's own. Now Jacobian asks the sign-in's
    app-server `model/list` at boot and every quarter hour, and on the Codex sign-in offers what it
    lists, each model with the levels Codex gives it that Jacobian has (no Ultra) and Codex's
    default as `effort_default`. `takesEffort` became `effortsOf`.

### Phase 4: phone (ADR 0141)

- §3.6, with Jest for:
  - the row in each state (follows, its own, away, read only, `followed_by` foot);
  - the sheet (Same on and off, pick keeps or moves the level, Save off until changed, saving,
    saved, refused, missed);
  - owner only.
- The phone e2e `apps/mobile/e2e/agent-model.spec.ts`: open an agent, open the sheet, pick a
  model and a level, Save, see Saved with a scratch harness answering, see the row change.
- **Walk** on a simulator, Release, against scratch with both stand-ins: stills of each scene of
  the mock, light and dark, with the bars' sweep filmed once.
- **Docs:** ADR 0141, "The model sheet" (§3.6). STATUS and memory.
- **Go-live, on his word:** `pnpm phone build` from main.
- **As built (9 October 2026; branch `claude/agent-model-p4`, replayed onto main `29211a65`):**
  - **`apps/mobile/src/agents/model/`:** `ModelGroup.tsx` (`useModelGroup` gives the card its
    group and, beside the scroll, the sheet and the glass hint), `ModelSheet.tsx`,
    `EffortBars.tsx` (`RowBars` and `DialBars`, one sweep, `sweepOf`) and `useAgentModel.ts`
    (the copy, read on focus and on a quiet row's tap, and the sheet's state). The group sits
    above the Heartbeat group (ADR 0143), which landed on main the same night.
  - **Core** gains `defaultWords` ("Heron 2 · Steady effort", under the switch),
    `MODEL_GROUND_INDEX` and `MODEL_SAVED_MS`. `@chipschat/ui` and the phone gain the `model` icon.
    `GroupRow` gains an `off` tone, `Icon` a `weight` (the check is drawn at 2.8, as the mock's),
    and `Arrive` moved to `ui/Arrive.tsx`.
  - **The bars are kept by place, not by level:** keyed by level, a model change unmounted a bar
    whose light was about to move, which the native driver refuses (seen in Jest).
  - **Walked** on `chips-walk-ac` (Release app, this branch's JS swapped in) against scratch
    4436 run from this worktree, with the Jacobian stand-in (`am3`) and the OpenClaw stand-in
    (`am2`): every scene of the mock, light and dark, the save's states (Jacobian paused for
    "Saving to Jacobian"), a refusal (the stand-in refuses GPT-5.6-Terra), OpenClaw's own agent
    read only, and away and back. The sweep was filmed and read frame by frame: down from Extra
    high to Low the bars go out top first, back up they light bottom first, about 50 ms apart.

### Phase 5: Mac and web (ADR 0141's addendum)

- §3.7, with web Vitest and the web e2e `agent-model.spec.ts` on 5199, alone.
- A browser walk against scratch with both stand-ins, light and dark.
- **Go-live, on his word:** `pnpm web:build` and `pnpm desktop`. Done 9 October 18:25, on his "go
  live with Phase 5 and push", from main `5c3d6f7a`, and pushed.
- **As built (9 October 2026; branch `claude/agent-model-p5`):**
  - **`apps/web/src/app/model/`:** `ModelGroup.tsx` (first in `.agent-card-side`, above
    Heartbeat and Context), `ModelDialog.tsx` (a `GrowingDialog` out of the row), `EffortBars.tsx`
    (`RowBars` and `DialBars`, the light a CSS layer per bar with its own delay) and
    `useAgentModel.ts` (the copy, read on open, on the window's return and on a quiet row's press,
    and the dialog's state). `AgentPage`, `Harnesses` and `Shell` pass `models` as they pass
    `heartbeats`. The context rows' `Glow` is exported for the row's flash.
  - **Core** gains `sweepOf` and `EFFORT_SWEEP_MS` (moved out of the phone's `EffortBars`), so
    both clients sweep alike.
  - **Keyboard:** real radios under the model rows and the bars (the arrow keys move and pick);
    Enter saves; Escape, the × or a click outside closes; the row has the keyboard back once the
    dialog has gone (behind a modal dialog the page is inert, so focusing it earlier does
    nothing). Save is `aria-disabled`, so it keeps the keyboard while it waits.
  - **Found on the walk:** with Jacobian's eight models the bars fell below an 800-pixel window,
    so the model rows are 38 pixels; and the dimmed big name and line under Same fail contrast,
    so only the bars dim.
  - **Walked** at 1280×800 against scratch 4436 run from the worktree, with the Jacobian stand-in
    (`am3/standin5.mts`: `effortsOf` and a fixed copy of Codex's list, so the walk never asks the
    sign-in) and the OpenClaw stand-in (`am2`), dark and light: J with "2 agents … use J's", Shore
    Writer on "Same as J", the dialog on Same, Same off and GPT-6-Astra at Extra high, Saving
    (the Jacobian stand-in paused), Saved, the row flashing, Juniper's six levels with only the
    big name, OpenClaw's refusal under Save, Cove read only, and Jacobian away.

### Phase 6: acceptance

- **The scenario.** Write `testing/scenarios/agents/agent-model.md` from `TEMPLATE.md`, with
  prefix `AM`. Add a row in `testing/scenarios/README.md` and the prefix to
  `testing/findings.md`.
- **Scratch first, then live with `pnpm live`, on both harnesses:**
  - read;
  - change the model, and the next turn's `usage.model` agrees;
  - change the effort (Jacobian: the run log; OpenClaw: `thinkingDefault`);
  - Same again;
  - J's change reaches a follower within 30 s;
  - away;
  - missed (the live bridge paused with `kill -STOP`, a trap to `CONT`, as AC-5);
  - refused;
  - a room still answers after each.
- About $0.30 of turns; Jacobian's run through Codex and cost $0.
- His look on the iPhone and the Mac. Record the run, and fix what is small.
- **As run (9 October 2026, 17:10–17:29 PDT; Chips main `bb19739b`, then `ab8634b2`):**
  - **The scenario** is `testing/scenarios/agents/agent-model.md` (prefix `AM`), twelve steps. Two
    beyond the list above: each model offered answers a turn (§5's risk, on both harnesses), and
    the apps on scratch.
  - **Scratch passed** with both stand-ins: read, change, effort, Same, J's change at its two
    followers in 2 ms, away, missed and the late answer saved, the stand-in's refusal and Chips's
    own, and the web walk dark and light.
  - **Live passed** on the run's own *OpenClaw 2* and *Agent Model Check*: each change `saved` in
    about 1.3 s and the next turn's `usage` on the model chosen; the effort in OpenClaw's entry
    (`thinkingDefault`) and in the Space's row (`models.effort`); `--same` leaving nothing of the
    agent's own in either; J's effort at its follower in 95 ms and back; away (the bridge stopped,
    `harness_away` in 0.3 s); missed (the bridge paused past the minute, saved 2 s after it went
    on); Chips's refusals; every turn answered; Jacobian's eight models and OpenClaw's six each
    answering. Seven OpenClaw config writes, each followed by a turn within 2 s, never tripped a
    reload error. Jacobian's away was scratch only (live, it would mean stopping his Jacobian).
  - **Found:** AM-1, `pnpm live read` named no model (fixed, `ab8634b2`, with T-20's seconds);
    AM-2, 4431 logs every refused request as an error with its stack (every route; open, small).
  - **Left for him:** the two rooms and their agents; his look on the iPhone, and on the Mac once
    Phase 5's go-live builds it.

## 5. Risks, and what to check first

- **OpenClaw's config reload** can fail a turn that is starting. The bridge resends once.
  Phase 2 checks how often a model change trips it.
- **Whether an OpenClaw session follows its agent's model** with no override of its own. If not,
  the session is patched to inherit (§3.4).
- **`models.list` may list models this install can't run.** Filter `available`, and read the live
  answer before choosing a view.
- **Jacobian has no model allow-list.** A model the adapter offers but can't reach fails the
  next turn. The adapter offers only reachable providers, and Phase 6 tries each offered model
  once on scratch.
- **Effort costs.** Higher levels spend more and take longer. Jacobian's Codex runs are billed
  $0, so its spend ceilings never see the difference. The sheet's line says so plainly, with no
  numbers.
- **J's change reaches 38 agents.** The foot says so (ruling 10). He can ask for a confirmation
  before Phase 4.
- **Peers on main:** replay, never merge.

## 6. Code map

- **Protocol:** `packages/protocol/src/capabilities.ts`, a new `agent-models.ts`, `frames.ts`
  (`accepts`, the frame union, `FRAME_NAMES`), and `ids/ulid.ts`.
- **Server:**
  - `server/src/infrastructure/db/migrations/0041-agent-models.ts`, registered in `migrator.ts`;
  - `schema.ts`;
  - `infrastructure/store/agent-model-registry.ts`;
  - `application/use-cases/agent-models.ts`;
  - `interfaces/http/routes/agent-models.ts`;
  - `interfaces/ws/hub.ts` and `session.ts`;
  - `delete-agent.ts` and `remove-harness.ts`;
  - `gateway.ts` for the wiring.
- **Core:** `packages/core/src/agentModel.ts` and `store.ts`.
- **CLI and testing:** `tools/live/live.mjs` and `testing/live-agents.md`.
- **Phone:**
  - `apps/mobile/src/agents/AgentCard.tsx` and a new `apps/mobile/src/agents/model/`;
  - `ui/Sheet.tsx`, `ui/Group.tsx`, `ui/ChipPulse.tsx` and `spaces/Motion.tsx`;
  - the icon in `packages/ui` and `SYSTEM_ICONS`.
- **Web:** `apps/web/src/app/Agents.tsx` and a new `apps/web/src/app/model/`.
- **Bridge:** `~/Work/chips-openclaw/bridge/src/models.ts` (new), `chips.ts`, `main.ts` and
  `test/`.
- **Jacobian:**
  - `src/channels/chips/models.ts` (new), `client.ts` and `bot.ts`;
  - read only: `src/spaces/models.ts`, `src/gateway/model-settings.ts` and
    `src/agent/types.ts`.

## 7. Decision records

- **ADR 0140:** an agent's model and effort are its harness's, chosen in Chips (Phase 1).
- **ADR 0141:** the model sheet (Phase 4; an addendum in Phase 5).
- Take the next free numbers when each phase starts; another session may take one first.

## 8. Testing

- The scenario of Phase 6 (`AM`). Findings go to `testing/findings.md` under `AM`.

## 9. Prompts

### Phase 1

> Run Phase 1 of `docs/proposals/agent-model-plan.md` (protocol, server, core, ADR 0140).
> Rulings §1 stand <or: changes>. Read §0–§3 and the memory notes §0 names. Build, test, run the
> gates, fast-forward main, update STATUS and memory, and report with Phase 2's prompt. Wait for
> my word before restarting 4431.

### Phase 2

> Run Phase 2 of `docs/proposals/agent-model-plan.md` (the OpenClaw bridge). Read the live
> gateway first (read only), build with tests, run it on scratch with the stand-in, and report.
> Wait for my word before the live bridge.

### Phase 3

> Run Phase 3 of `docs/proposals/agent-model-plan.md` (Jacobian). Touched suites only; scratch
> with the stand-in, then report. Wait for my word before committing and restarting Jacobian.

### Phase 4

> Run Phase 4 of `docs/proposals/agent-model-plan.md` (phone, ADR 0141). Build, test (Jest, then
> the phone e2e alone), walk it on the simulator as Release with stills against the mock,
> fast-forward main, and report. Wait for my word before `pnpm phone build`.

### Phase 5

> Run Phase 5 of `docs/proposals/agent-model-plan.md` (Mac and web). Build, test (the web e2e on
> 5199, alone), fast-forward main, and report. Wait for my word before `pnpm web:build` and
> `pnpm desktop`.

### Phase 6

> Run Phase 6 of `docs/proposals/agent-model-plan.md` (acceptance). Write the scenario, run it on
> scratch and then live, record the run and findings, fix what is small, and report.
