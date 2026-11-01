# Jacobian on the Claude API, chosen from Chips

**Plan of record, 12 October 2026. Status, 12 October 2026 21:10: LIVE (Jacobian `e7805cb`;
web, Mac, iPhone). Phase 0 passed; Phase 4 passed steps 1–7 (scenario CL), with findings CL-1 to
CL-4. Not pushed.** Arjun: "I have got claude API credits.
I need option in Harness page, and agent detail page to be able to switch Jacobian to Claude API
(not openclaw yet). Jacobian should likely support this already, if not we can make changes to it
as well. Come up with plan first." Then: "go with your recommendations", so A, turns only, and the
newest model of each family. ADR 0154.

In one line each:

- **The agent page needs no Chips change.** Its Model sheet (ADR 0140/0141) shows whatever models
  the harness offers. Once Jacobian offers Claude models, every Jacobian agent can pick one.
- **The harness page gets the Main agent's Model row.** Jacobian's agent is what every agent on
  "Same as Jacobian" follows (21 active), so its row already switches the whole harness. Today you
  only reach it from that agent's page.
- **Jacobian has half of it.** It already has a Claude provider. It is turned off, has no key, and
  was written before the 5.x models. Most of the work is there.

## What is there now (read 12 October 2026)

**Jacobian** (`~/Work/Jacobian`, main `9094a39`):

- `src/agent/providers/anthropic.ts` runs turns on an API key: streaming, tools, adaptive
  thinking, and a cached system prompt. `claude-*` ids are sent to it while OpenAI keeps the rest
  (`provider-registry.ts`). Both providers can be on at once, and each Space's model decides which
  one answers its turn.
- **The live config has it switched off.** `claude.enabled: false`,
  `providers.anthropic.enabled: false`, no key. Turns run on `gpt-6.1-sol` at high, through the
  ChatGPT sign-in over the websocket.
- `npm run setup:auth`, option 3, saves an API key to `claude.api_key` but leaves both `enabled`
  flags off. `ANTHROPIC_API_KEY` in the environment is also read at load.
- **If we only switched it on, these would be wrong:**
  1. **Old models.** The list has Claude Opus 4.6 and Sonnet 4.6 hardcoded
     (`gateway/model-settings.ts`, `BASE_MODEL_OPTIONS`). It has no Opus 5.5, Sonnet 5.5,
     Haiku 5.5 or Fable 5.1.
  2. **No effort.** `effortsOf` gives levels only to OpenAI models on the Codex sign-in. The
     provider never sends `output_config.effort`, so Opus 5.5 would always run at its default
     (`medium`) and the sheet would show no bars.
  3. **No prices.** `src/cost/store.ts` has no Claude 5.x rows. Turns paid from real credits would
     read $0 in Chips, and the harness's budget bar wouldn't count them.
  4. **No context windows.** `spaces.compaction.windows` lists only GPT models. A Claude Space's
     gauge and its compaction point would be set to the wrong size.
  5. **Old SDK.** `@anthropic-ai/sdk` 0.79.0 types effort as low, medium, high or max, with no
     `xhigh`, and doesn't type the Models API's capabilities.
  6. **Silent refusals.** A refusal (`stop_reason: "refusal"`, from the 5.5 models' safety
     classifiers) comes back as an empty answer.
  7. **Untested on today's models.**
     - Every round of a turn is capped at `maxTokens: 8192`, and thinking counts toward that cap.
     - `runtime.ts:1671` adds a `[thinking]` text block to an assistant turn that has no text.
       Preserved thinking may refuse that edit on an account made after 31 August 2026.
     - Whether prompt-cache reads actually happen.

**Chips** (main `431f7e29`):

- The agent page's Model row and sheet show the harness's models, its effort levels and its
  wording. Chips names no model (ADR 0140).
- Jacobian's own agent (the Main agent, `lead` on the wire) has the same row. Changing it moves
  every agent left on "Same as Jacobian".
- The harness page has Restart, its context files, its agents, the trust dial, the budget, and
  recent runs. It has no Model row. Phone: `apps/mobile/src/harnesses/Profile.tsx`. Web and Mac:
  `apps/web/src/app/Harnesses.tsx`. The page also says credentials are issued from a computer,
  never pasted on a phone.

## The plan

### Step 0: the key (his, on the Mac mini, about two minutes)

The key goes into Jacobian on the Mac mini, never through Chips. That keeps the harness page's
rule about credentials. I can't type his key for him either. After Phase 1's small fix to the
setup script, he runs this once and pastes the key:

```
npm --prefix ~/Work/Jacobian run setup:auth   # choose 3
```

Before that fix, the same step also means turning the two `enabled` flags on by hand. The key
has to be in place before Phase 0, since the probe needs it.

### Phase 0: probe (about $1 of credits, nothing live)

This runs a real `AnthropicProvider` on `claude-opus-5-5` from a scratch stand-in, the same way
the agent-model phases were tested. It runs:

- a turn with tools over several rounds
- a picture
- a thread that carries across two turns
- one long answer

Things to read off it:

- whether 8192 tokens is enough for a round
- whether the `[thinking]` block is accepted
- `cache_read_input_tokens`
- what a refusal looks like

Whatever it finds becomes item 9 of Phase 1.

### Phase 1: Jacobian (one repo, one restart, no Chips change)

1. **Model catalog.** `AnthropicProvider.listModels()` reads the Models API (`GET /v1/models`) for
   each model's id, `display_name`, effort levels (`capabilities.effort`) and context window
   (`max_input_tokens`). `gateway/model-catalog.ts` already asks the Codex sign-in. It also asks
   Anthropic: at boot, then every 15 minutes, keeping the last good list.
2. **Which models are offered.** The newest of each family (Fable, Opus, Sonnet, Haiku, so four
   rows), plus any model a Space already runs on. The stale 4.6 rows go. Claude rows come after the
   GPT rows.
3. **Effort.** `effortsOf` gives Claude models the levels the API lists (low to max, with xhigh).
   Each model's fallback is its own default: Opus 5.5 medium, Sonnet 5.5 high, Haiku 5.5 medium.
   The provider always sends `output_config: {effort}`.
4. **Prices.** Claude 5.x rows go into `BUILTIN_PRICING`:
   - Opus 5.5: $4 / $20 per million tokens, cache reads $0.20
   - Sonnet 5.5: $2 / $10
   - Haiku 5.5: $0.10 / $0.50
   - Fable 5.1: $10 / $50

   Cache-write rates are read from Anthropic's pricing page at build time, so Chips shows real
   dollars and the budget bar counts them.
5. **Context windows.** The catalog's window (1M) feeds `windowOf`, and an entry in the config
   overrides it.
6. **Refusals.** Server-side fallbacks go on (`fallbacks: "default"`): a refused turn is retried
   on another model in the same call. A turn that is still refused says so in the room instead of
   giving an empty answer.
7. **SDK upgrade.** `@anthropic-ai/sdk` 0.79 goes to the current version, for xhigh, the Models
   API's capabilities and `stop_details`. The commit message says why.
8. **Setup.** Option 3 turns Claude on (both flags) and leaves the ChatGPT sign-in alone.
9. **Whatever Phase 0 found.**

Tests are written red first. The model copy in the one-Space conformance file gains a Claude row.
After that come the gates, a Jacobian restart, and `pnpm live model Jacobian`, which should list
the Claude rows. **When Phase 1 is done, the agent page can switch any Jacobian agent to Claude on
the phone, the Mac and the web, with no Chips release.**

### Phase 2: the harness page in Chips (no protocol change, no migration, no 4431 restart)

- **A Model group on the harness page, under Restart.** It is the harness's Main agent's own row,
  with the same `useModelGroup` / web `ModelGroup` and the same sheet. Its foot says who follows
  it: "Jacobian and the 21 agents that follow it".
- **Who sees it.** The same people as on the agent page: the harness's owner, or an owner or admin
  of the workspace, and only once the harness has sent its copy.
- **OpenClaw gets the row too.** Chips doesn't hardcode harness names, so OpenClaw's harness page
  shows its Main agent's row as well. It just has no Claude models to offer yet.
- **Docs.** ADR 0154, a phone test, a web e2e, and STATUS.
- **Going live.** `pnpm web:build`, `pnpm desktop` and `pnpm phone build`.

### Phase 3 (optional): provider headings in the sheet

Headings would split the sheet into "ChatGPT sign-in · in your plan" and "Claude API · billed per
token", so a person sees what a pick costs. This needs:

- an optional `group` on `modelChoice`, carried through protocol, core, phone and web
- Jacobian sending it
- a 4431 restart, because the server parses the copies

Whether to do it is decided after he has seen Phase 2.

### Phase 4: acceptance (scenario CL, about $2–5 of credits)

These run live, in a test room on Claude:

- tools, a picture, and a long answer
- the run's cost compared against Anthropic's console
- an effort change, and switching back to "Same as"
- Jacobian switched to Claude from the harness page and back
- what the room says when credits run out

## What it costs

- **Jacobian:** about eight files plus tests, one SDK upgrade, and one restart.
- **Chips:** two screens (phone and web), their tests, and one ADR. No protocol change, no
  migration, no server restart.
- **Credits:** about $1 for the probe and $2–5 for acceptance. After that, a typical turn on
  Opus 5.5 costs about $0.05–0.20 when the opening prompt is cached. GPT turns stay $0 on his
  plan.

## Decisions for him

1. **What the harness page shows.**
   - **A (recommended):** the Main agent's Model row, as above.
   - **B:** a "ChatGPT sign-in | Claude API" switch that is new at the harness level. It needs a
     new copy, a protocol change, a migration, and work in both adapters.
2. **What a switch moves.**
   - **Recommended:** only the Main agent and the agents that follow it. Jacobian's background work
     (`utility_model`, memory extraction, compaction notes) stays on the ChatGPT sign-in, at $0.
   - **Or:** everything.
3. **Which Claude models.**
   - **Recommended:** the newest of each family (4 rows).
   - **Or:** everything the API lists (old ones included).

## As built

**Phase 1, Jacobian.** Branch `claude/claude-api`, in the worktree
`~/Work/Jacobian/.claude/worktrees/claude-api` (its `node_modules` is a symlink to the main
checkout's).

- **The provider** (`src/agent/providers/anthropic.ts`):
  - `listModels` reads the Models API.
  - `claudeModelsOf` offers the newest model of each family and keeps the rest hidden.
  - What a call carries comes from what the list said of its model: the effort only for a level
    the model takes; `max_tokens` = what was asked + `THINKING_ROOM` (16,000), under the model's
    own cap; a top-level cache breakpoint (`claude.prompt_caching.enabled`); and
    `fallbacks: "default"` with its beta header for a model listing `allowed_fallback_models`.
  - `blocksOfReply` keeps only the declined model's words before a fallback, and drops blocks
    Jacobian has no shape for.
  - A refusal comes back as `CompletionResponse.refusal`.
  - `complete()` is streamed, and carries the effort too.
- **Plumbing.** The SDK backend and the router's adapter pass `listModels` through.
- **The gateway.**
  - `ModelCatalogs` holds `{codex, claude}`. The Claude catalog runs when `hasAnthropicAuth`.
  - `listedOf` gives the model settings both lists.
  - `ModelWindows` reads a Claude model's window from its list.
  - `api.modelCatalogs` replaces `api.modelCatalog`.
- **The model settings** (`gateway/model-settings.ts`):
  - They take `Listed` (`{codex, claude}`).
  - Claude rows are offered **only when a key can run them** (they used to be offered whenever
    Anthropic wasn't switched off, key or not).
  - With the list in hand, the rows are its newest per family, in Anthropic's words. Without it,
    Jacobian's own four 5.x rows (the 4.6 rows are gone).
  - Order: GPT first, then Claude by family (Fable, Mythos, Opus, Sonnet, Haiku), newest first
    within a family.
  - `effortsOf` gives a Claude model the API's levels, and none before the list is read.
- **The turn** (`spaces/runtime.ts`). A refused call ends the turn with `refusalWords` ("The model
  declined to answer this (its safety check: cyber)."), after whatever earlier rounds said. It is
  not asked to carry on.
- **Prices.** Exact rows in `BUILTIN_PRICING` for Fable 5.1 and 5, Opus 5.5 and 5, Sonnet 5.5 and
  5, Haiku 5.5, and Opus 4.8 and 4.7. Without them, a longest-prefix match would have priced Opus
  5.5 as Opus 5, and Opus 4.8 as Opus 4 at $15.
- **Setup** (`cli/setup-config.ts`):
  - `saveClaudeKey` saves the key, sets `claude.enabled` and `providers.anthropic.enabled`, moves
    a pre-5.x `claude.model` to `claude-opus-5-5`, and leaves OpenAI alone.
  - `savedConfig` writes over only the top-level sections that changed, so the live config's six
    comments survive (`stringify` used to drop them all).
  - The setup menu's models, the schema's default and `config/default.yaml` now name 5.x models.
- **Tests:**
  - `tests/unit/agent/anthropic-provider.test.ts` (10)
  - `tests/unit/cli/setup-config.test.ts` (2)
  - model-settings (+2, and the Codex test now has a key)
  - model-windows (+1), model-catalog (+1), cost store (+1)
  - runtime (+2: a refusal ends the turn; earlier words kept)
  - config (the default)
  - the one-Space conformance vector's Claude step

  The runtime and price tests fail on main's code. Touched suites: 73 files, 1,072 tests. `tsc`,
  `lint:vocabulary` and `lint:one-space` are clean.
- **Deviations:**
  - **Item 7, the SDK upgrade, was dropped.** 0.79 does it all once the request body is cast, and
    upgrading would have changed the main checkout's shared `node_modules`, which the running
    Jacobian loads.
  - **Two things were added:** comment-keeping setup, and Claude rows only when a key can run
    them.

**Phase 2, Chips.** On this branch.

- **Core:** `harnessModelAgent(directory, harnessId)`, the Main agent that isn't archived.
- **Phone** (`harnesses/Profile.tsx`): `useHarnessModel` → `useModelGroup` under Restart, with
  the overlays beside the scroll.
- **Web** (`Harnesses.tsx`): `HarnessCard` takes a `modelGroup` (`ModelGroup` for the Main agent)
  under Restart.
- **Tests:**
  - core `agentModel.test.ts` (+2)
  - phone `Profile.test.tsx` (+2: the row with its foot, and nothing asked without a Main agent)
  - web e2e `agent-model.spec.ts` (+1: the card's row with its foot; the agent took the name
    "Wyvern 2", ADR 0091)
- **Scenario:** `testing/scenarios/agents/claude-api.md` (prefix CL).

**Phase 0, the probe, PASSED 12 October 2026, on his "run the probe"**, after he put the key in
with option 3. His first try was option 1, which imported Claude Code's own sign-in, expired on 2
October, and isn't his API credits; option 3 cleared it. The probe ran Jacobian's own provider
from the worktree against the API, for under $0.20 of credits:

- **The list.** 14 models. Visible: Haiku 5.5, Sonnet 5.5, Opus 5.5 and Fable 5.1, each Low to
  Max with Extra high, a 1M window, and a 128K output cap.
- **A tool round** on Opus 5.5 at High:
  - It called the tool and then answered.
  - A harder question at Max thought first: `thinking` blocks with empty text and a signature (the
    API's default display). Echoed with the tool result, they were accepted.
- **Cache.** Round 1 wrote 2,587 tokens to the cache, round 2 read them, and a repeat read 2,652:
  every round reads the rounds before it.
- **The `[thinking]` edit is accepted** on his account: the turn loop's quiet retry, a text block
  added after a round's thinking.
- **Effort.** Low was taken.
- **`complete()`** works.
- **Two things the probe changed, Jacobian `e7805cb`:**
  - The Models API names no model's fallbacks, while every model tried took `fallbacks:
    "default"` (the four 5.x models and Opus 4.6), so every call asks for one.
  - A model's family is the API's own `line`, and thinking tokens come from
    `usage.output_tokens_details.thinking_tokens`.

**Still to do:**

- Jacobian's commit, fast-forward and restart, and `pnpm web:build`, `pnpm desktop` and
  `pnpm phone build`, on his word to go live
- Phase 4

