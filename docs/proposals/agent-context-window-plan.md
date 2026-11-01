# An agent's context window: the plan

9 October 2026. ADR 0146. Mock: <https://claude.ai/artifact/N3nnXBFU6zHfTfinXEZRjH> (layout B).
The plan of record since Arjun's rulings (section 6). The build follows the heartbeat (ADR 0143, `docs/proposals/agent-heartbeat-plan.md`) piece
by piece: read that feature's files first and do the same.

His ask: "display context window fill information for the agent and also have option to run
compaction. There should also be an auto compaction option where person can select limit."

## 1. What is there today

**In Chips.**
- A run's fill already travels: the `context.usage` event (`used_tokens`, `limit_tokens`, `model`,
  `compacted`, run-scoped), kept on the run (`runs.context_used`, `context_limit`).
- It is drawn as the context ring in the web room's header, the run panel and the sidebar, and as the
  phone harness card's "Context" bar. The tones are `packages/ui/src/vocabulary/context.ts`:
  neutral to 70%, amber to 90%, red past it. `compacted: true` puts "Context compacted" on the
  run's rail.
- Nothing is kept per agent or outside a run, and nothing goes down to a harness.
- "Context" already heads the agent's files group (ADRs 0134, 0135). The new group is headed
  **Context window**, and its words follow the ring's ("63% full").

**OpenClaw (2026.9.6, through the bridge).**
- **Fill.** `sessions.describe {key}` gives a session's `totalTokens` (used, when fresh) and
  `contextTokens` (the window: 272K for GPT-6.1 Sol). The bridge already subscribes to
  `sessions.changed`, which pushes the same row, but it ignores it.
- **Most turns send no fill today.** The bridge sends `context.usage` only from the Codex runtime's
  token events. Most Chips sessions run OpenClaw's built-in runtime, so they never send one, and
  `compacted` is never set.
- **Compact now** is `sessions.compact {key}`. It needs `operator.admin`, which the bridge has. It
  is synchronous, taking up to its 180 s timeout; the bridge's client gives up after 30 s unless
  told otherwise.
  - It refuses while the session has a run going or work queued.
  - It answers with `tokensBefore` and `tokensAfter`.
  - It emits `session.operation` start and end.
- **No per-agent limit.** Built-in sessions compact mid-turn at the window less a reserve (about 93%
  of 272K). `agents.defaults.compaction` has no threshold key, and the per-agent entry has no
  compaction block at all. Codex-runtime sessions use Codex's own global limit.

**Jacobian.**
- **History.** Jacobian owns it, in memory, one thread per person per Space
  (`chips-<user>::<space>`). Each finished turn is collapsed to its request and answer. A thread
  keeps at most 12 exchanges and is dropped after 12 hours idle. So a thread at rest is small, and
  the pressure comes mid-turn, from tool rounds.
- **It knows no window size.** Codex's `model/list` carries none, but Codex's own cache
  (`~/.codex/models_cache.json`) does: `context_window` 272000 for the GPT-6 models.
- **It compacts only mid-turn** (`compactIfHeavy`, the "working notes" fold), at one global
  threshold of **450,000 tokens**. That is above the 272K window, so the fold has never run.
- **Its live records agree.** Over the last 30 days the largest prompt was 228.5K tokens on GPT-6.1
  Sol (84% of the window). Four were over 200K and none was over 258K. Long turns are running close
  to the edge with nothing to catch them.
- It has no Compact now, and it sends no `context.usage`.

## 2. The wire

**Capability** `context_windows`, declared by the harness. A socket that says `context_windows` in
its `hello` `accepts` hears both frames below.

**The copy**, `PUT /v1/agents/:id/context-window` (the harness's token, its own agent only). It is
sent whole: when the agent registers, on connect, after each of its turns, when a compaction starts
and ends, and with each answer.

```jsonc
{
  "used": 172000,               // tokens the agent holds now, as its harness counts them
  "window": 272000,             // its model's window
  "model": "gpt-6.1-sol",       // optional
  "as_of": "…",                 // when `used` was measured
  "compacting": null,           // null | "queued" (waits for its turn to end) | "running"
  "last": { "at": "…", "from": 221000, "to": 24000, "by": "asked" | "itself" },  // optional
  "compacts": true,             // takes a Compact now
  "why_not": "…",               // optional, ≤120, when it doesn't
  "long_turn": { "at": "…", "peak": 218000, "folds": 1 },  // optional (10 Oct, ADR 0146 addendum)
  "limit": {                    // optional: absent, the page shows no Compacts itself row
    "at": 80,                   // percent of the window; null = only when asked (or when full)
    "choices": [50, 60, 70, 80, 90],   // ascending, ≤12, `at` among them unless null
    "default": 80,              // the harness's own, marked in the list
    "may_turn_off": true
  },
  "editable": true, "why_read_only": "…",
  "answers": "chg_…",           // optional: the ask this copy answers
  "refuses": { "change_id": "chg_…", "message": "…" }   // optional
}
```

**The view**, `GET /v1/agents/:id/context-window` (owner or admin): the copy plus `read_at`, `away`,
`change?` (the limit, as ADR 0143's: `waiting|saved|failed|missed`), and `compaction?`. A
compaction is one of:
- `waiting`, until the harness answers;
- `taken`, answered and not yet done;
- `done`, when an answer isn't compacting, or the next copy after it stops compacting;
- `failed`, when the harness refuses;
- `missed`, when there is no answer within `WINDOW_ASK_WAIT_MS` (60 000). It is worked out when
  read, never stored.

**Compact now**, `POST /v1/agents/:id/context-window/compactions` (owner or admin), sends:

```jsonc
{ "frame": "context_window.compact", "change_id": "chg_…", "harness_id": "hrn_…",
  "agent_id": "agt_…", "asked_by": "usr_…", "asked_at": "…" }
```

The harness answers at once with a copy naming it (`compacting: "queued"` or `"running"`), or
`refuses` it ("nothing to compact yet", "it is busy elsewhere"). It sends another copy when it is
done.

**The limit**, `POST /v1/agents/:id/context-window/changes {at: int | null}` (owner or admin), sends
`context_window.change {change_id, …, at}`. The harness answers with its next copy, as a heartbeat
change is answered.

**Refusals**, as ADRs 0140 and 0143 have them:
- 422 for an `at` not among the choices, or for `null` without `may_turn_off`;
- 422 for an agent that isn't `editable`, or a Compact now that `compacts` says no to;
- 422 `harness_away` and `change_waiting`;
- 403 and 404.

**Store.** Migration 0043 adds `agent_context_windows`, one row per agent: `said`, `read_at`,
`change`, `compaction`. The row goes with the agent when it is deleted, and with the harness when
the harness is removed.

**The run's ring, too.** Both harnesses also send the existing `context.usage` at the end of every
turn, with `compacted` when they compacted on the way. That lights the ring in OpenClaw's built-in
rooms and in every Jacobian room, at no cost to Chips.

## 3. Who owns the limit

**The harness owns it**, as it owns a model and a heartbeat. Chips shows the limit and passes on a
change. Each harness keeps it below the limit in the way it can:

- **Jacobian:**
  - The mid-turn fold starts at `at × window` of the turn's model, replacing the global 450K. The
    old number is kept only for a model whose window is unknown.
  - A thread that ends a turn above the limit is compacted between turns as well (rare, since
    threads at rest are small).
- **OpenClaw:**
  - The bridge checks the session after each turn and calls `sessions.compact` when it is at or
    over the limit.
  - OpenClaw's own near-full compaction (about 93%) stays as the mid-turn backstop, so "Only when I
    ask" means that backstop and nothing sooner.
  - The per-agent entry has no room for a limit, so the bridge keeps the limits in its own state.

The other way would be for Chips to keep the limit and send Compact now itself when a copy comes in
over it. That is less code in each harness, but it would break the rule that a harness's settings
are the harness's (ADRs 0140, 0143). It also could not reach Jacobian's mid-turn fold, which is
where Jacobian needs it.

## 4. On the agent's page

The group sits under Model and Heartbeat and above Context, for the harness's owner and an owner or
admin. With no copy, there is no group. The fill's colour is the ring's tone: ink to 70%, amber to
90%, red past it.

- **A · A meter and two rows** (the Heartbeat group's pattern, the smallest).
  - The meter: "63% full", "172K of 272K tokens", a bar with the limit's tick.
  - **Compact now** opens a short sheet that says what compacting does ("J sums up its conversation
    so far and carries on from the summary… Details from early on may be lost"), with Compact and
    Cancel.
  - **Compacts itself**, "At 80%", opens the choices as a radio list with a small meter on each. A
    tap saves.
  - The foot says when it last compacted, from how much to how much.
- **B · A gauge you drag.**
  - The window as 40 lit bars, with the limit as a marker standing in them. Dragging the marker
    snaps to the choices and saves when let go.
  - Compact now is a button in the gauge, and a Compacts itself switch sits under it.
  - It costs about 200 more lines on each client than A, for the gauge and its drag.

**Both layouts.**
- While compacting, the row (A) or the button (B) shows the working face with "Compacting", and the
  fill drains when the copy says it is done.
- Away or read only, everything is quiet and a tap explains why, as the Model group does.
- The page reads the copy again:
  - on focus;
  - when one of the agent's runs ends;
  - every 2 s while a compaction is under way.

**In the room** (a ruling, section 6). When a copy's `last` moves, the server writes a quiet line in
the agent's room, as it writes join lines (ADR 0104): "J's context compacted · 214K → 21K".
Tapping it opens the agent's page. It tells people why the agent may have forgotten details.

## 5. Phases

### Phase 0: Jacobian's fold, now (his word: it is Jacobian's config)

Set `spaces.compaction.threshold_tokens: 200000` in `~/.jacobian/config.yaml` and restart Jacobian.
- It is one line, and it lets today's fold run before the window fills.
- Phase 3 replaces it with each agent's limit.

### Phase 1: protocol, server, core (ADR 0146)

Mirror ADR 0143's Phase 1 file for file.
- **Protocol:**
  - `capabilities.ts`;
  - a new `agent-context-windows.ts`: the copy, the two asks, the view, the two frames,
    `WINDOW_ASK_WAIT_MS`;
  - `frames.ts` (`accepts`, the union, `FRAME_NAMES`) and the fixtures, then `pnpm gen:protocol`.
- **Server:**
  - migration 0043 (or the next free), the registry, the use cases (the compaction's states are
    worked out as `missed` is), the routes;
  - the hub's `offer(…, "context_windows", frame)`;
  - delete-agent, remove-harness, the gateway wiring and the authorization matrix.
  - Optional: the room line, if ruled in.
- **Core:** `agentWindow.ts`.
  - `mayChangeWindow`.
  - The fill's words and tone, from the ui vocabulary's `contextPercent`/`contextTone` so the
    page, the ring and the harness card agree.
  - `windowRows(view)` (meter, Compact now, Compacts itself; saving, compacting, quiet).
  - `limitChoices`, `compactSheetWords`, `windowFoot`.
  - `saveWindowChange` and `askCompaction` (post, then read every 800 ms; compaction reads every
    2 s for up to 4 min).
  - The store's `readAgentWindow`, `changeAgentWindow`, `compactAgent`.
- **CLI:** `pnpm live window <agent>`, `window-set <agent> <percent>|off`, and
  `window-compact <agent>`.
- **Tests:** schemas, each refusal, a compaction through each state, an answer after the minute,
  delete and remove, the frame only to sockets that accept it, core words and rows.

### Phase 2: the OpenClaw bridge

`windows.ts` beside `models.ts` and `heartbeats.ts`, for every agent the bridge seats.
- **The copy:**
  - read with `sessions.describe` on the agent's session (Home for the Main agent);
  - sent after each turn and on `sessions.changed`, only when it changed.
- **Compact now:**
  - `sessions.compact` with a 200 s request timeout;
  - queued behind the session's running turn (the bridge knows when its own turns end);
  - for Home, which OpenClaw's own channels share, retried for up to 5 minutes, then refused with
    OpenClaw's words.
- **The limit:** the after-turn check (section 3), with the limits kept in the bridge's state.
  Choices 50 to 90; default "Only when I ask", meaning OpenClaw's own, near full.
- **The run's ring:** `context.usage` for built-in sessions, from `sessions.describe`, with
  `compacted` read from the `compaction` stream the bridge drops today.
- **Tests:** in `test/windows.test.ts`, as `heartbeats.test.ts` has them.

### Phase 3: Jacobian

- **The window.**
  - Read `context_window` from Codex's `models_cache.json` with the catalog (boot, then every
    15 min).
  - A `models.windows.<id>` config entry overrides it. An unknown window sends no copy.
- **The fill.**
  - Report the agent's Space's most recently active thread.
  - `used` is that thread's last turn's first prompt (input plus cache read and write, from
    `api_calls`) plus its answer. That is what the next turn starts from.
  - Mid-turn, the room's ring shows the climb.
- **Compact now.**
  - Between turns, fold that thread's exchanges into one notes message, keeping the last two
    exchanges, with `summarizeMiddle`'s prompt.
  - It is queued behind a running turn on the thread.
  - At rest a Jacobian thread is small, so this frees little. The limit does the real work.
- **The limit.**
  - `metadata.compaction.at` on the Space, resolved up the tree as `metadata.models` is, into the
    turn kit.
  - `compactIfHeavy` reads it.
  - Default 80%.
- **Also:** `context.usage` at each turn's end.
- **Tests:** the touched suites only, never the full `npm test`.
- **Built** 9 October on Jacobian's branch `claude/chips-context-window` (0336d8e), not on its
  main:
  - the override is `spaces.compaction.windows.<id>`, beside the fold's other settings;
  - Jacobian's limit may not be turned off (`may_turn_off: false`), since its fold is how a long
    turn survives; picking the limit an agent would follow clears its own;
  - the fill is kept in memory with the threads (`src/spaces/windows.ts`), not read from
    `api_calls`, so a thread forgotten (idle, `/reset`, a restart) holds 0;
  - before a turn has ended since Jacobian started, a copy says 0 held and "Nothing to compact
    yet";
  - the Compact now's "to" is estimated (four characters a token) until the next turn measures
    it;
  - a fold mid-turn is reported as `last` (`by: "itself"`) once the next round measures what it
    left.

### Phase 4: phone (ADR 0146's layout)

- A new `apps/mobile/src/agents/window/`: `WindowGroup.tsx`, `CompactSheet.tsx`, and
  `LimitSheet.tsx` (A) or `WindowGauge.tsx` (B, a pan gesture on the UI thread).
- `AgentCard.tsx` gains one line, under the heartbeat.
- The room line in `spaces/Line.tsx`, if ruled in.
- Jest for each state. Walk on a Release simulator against scratch with stand-ins.

- **Built** 9 October on main (`94da4610`, foot fix `2b0e666a`): `apps/mobile/src/agents/window/`
  (`WindowGroup`, `GaugeBars`), the confirm sheet reused for Compact now, the Model group's hint
  for a quiet limit; walked on a Release simulator build against a scratch server with a scripted
  harness.

### Phase 5: Mac and web

- `apps/web/src/app/window/`, mounted in `.agent-card-side` after `HeartbeatGroup`.
- Vitest, an e2e as `agent-model.spec.ts`, and a browser walk.

- **Built** 9 October on main (`c24a5815`): `apps/web/src/app/window/` (pointer drag, arrow
  keys, the confirm dialog), the room line a button; walked in the browser against the same
  scratch server. No Playwright spec: the jsdom tests cover the states, and the drag was walked.

### Phase 6: acceptance and go-live

- On scratch first, then live on his word:
  - 4431 backed up and kickstarted (migration 0043);
  - `chips declare … context_windows` for both harnesses;
  - the bridge and Jacobian restarted;
  - the three app builds.
- The live check:
  - J's and OpenClaw Main's fill match `/status` and Jacobian's `api_calls`;
  - Compact now on each drains the fill;
  - a limit set low compacts after the next long turn;
  - put things back.
- Scenario `testing/scenarios/agents/context-window.md` (prefix `CW`).

- **Live** 9 October, 20:33–20:41 PDT, on his "Push and go live": 4431 on migration 0043, both
  harnesses declare `context_windows`, the bridge on `8e11c78` and Jacobian on `0336d8e`, the web
  page and the Mac app rebuilt (the iPhone was away from the Mac). Limits and Compact now passed
  live on both harnesses; see the scenario's runs and CW-1.

**Rough size:**
- Phase 1, as the heartbeat's.
- The bridge, about 300 lines.
- Jacobian, about 450 lines.
- Each client, about 350 lines for A or 550 for B.

## 6. Rulings (Arjun, 9 October 2026: "B, with the room line, every agent, Phase 0 now")

1. **Layout B**, the gauge you drag.
2. **The room line**, yes.
3. **Every agent**, from the start.
4. **Phase 0 now**: done 9 October, 18:22 PDT. `spaces.compaction.threshold_tokens: 200000` in
   `~/.jacobian/config.yaml` (the old file kept beside it as `config.yaml.bak-20261009-compaction`).
   Jacobian was restarted with `restart --check` and came back as pid 46331, with `chips=healthy`.
5. **The limits on offer**: not ruled, so the recommendation stands. 50 to 90% by tens; Jacobian's
   default is 80%; OpenClaw's is "only when asked" (its own, at about 93%).

## 7. Left out

- What the summary says. OpenClaw keeps it readable; Jacobian's notes and Codex's compaction differ.
- Focus words for a compaction ("keep the quotes").
- Jacobian's other threads, when two people talk to one agent.
- A fill in the Agents list, and a ring in the phone's room.
- What a compaction costs. It is a short turn on the agent's model, and Chips can't price it.

## 8. Coordination

The agent-model session's Phase 5 (web) is on main, not pushed. The model and heartbeat groups
share `AgentCard.tsx` and `Agents.tsx`. Keep this group in its own `window/` folder so each page
gains one line, and tell the sessions on those files before touching them.
