# An agent's heartbeat: the plan

9 October 2026. ADR 0143. Mock: <https://claude.ai/artifact/XedrYMcokqPMCojfed7Bfs> (layout A).
The build follows ADR 0140's model and effort (`docs/proposals/agent-model-plan.md`) piece by piece:
read that feature's files first and do the same.

## 1. Rulings (Arjun, 9 October 2026)

1. Layout A: a switch on the Heartbeat row, which saves when flipped; while on, an Every row under it.
2. The Main agent only, for now (OpenClaw's `main`, in its Home).
3. Check-ins wear a "Heartbeat" tag.

## 2. The wire

**Capability** `heartbeats` (`HARNESS_CAPABILITIES.heartbeats`), declared by the harness. A socket
that says `heartbeats` in its `hello` `accepts` hears `heartbeat.change`.

**The copy**, `PUT /v1/agents/:id/heartbeat` (the harness's token, its own agent only):

```jsonc
{
  "on": true,
  "every": 30,                 // minutes, 1..10080; kept while off
  "choices": [15, 30, 60, 120, 240, 720, 1440],  // 1..12, ascending, unique, `every` among them
  "editable": true,
  "why_read_only": "…",        // optional, ≤120, only when not editable
  "answers": "chg_…",          // optional: the change this copy answers
  "refuses": { "change_id": "chg_…", "message": "…" }  // optional
}
```

**The view**, `GET /v1/agents/:id/heartbeat` (owner or admin):
`{agent_id, harness_id, on, every, choices, editable, why_read_only?, read_at, away, change?}`,
with `change` as `{change_id, state: waiting|saved|failed|missed, on, every, asked_at,
answered_at?, message?}`. `missed` is worked out when read, after `HEARTBEAT_CHANGE_WAIT_MS`
(60 000), never stored; an answer after it still counts.

**The change**, `POST /v1/agents/:id/heartbeat/changes {on: boolean, every?: int}` (owner or
admin). `every` must be among the copy's choices; left out, it is the copy's `every`. Kept as the
agent's last change, then sent:

```jsonc
{ "frame": "heartbeat.change", "change_id": "chg_…", "harness_id": "hrn_…", "agent_id": "agt_…",
  "on": true, "every": 60, "asked_by": "usr_…", "asked_at": "…" }
```

Refusals, as ADR 0140's: 422 for `every` not a choice or an agent not `editable` (its
`why_read_only`); 422 `harness_away` when no socket hears `heartbeats`; 422 `change_waiting` while
the last change waits inside its minute; 403 for anyone but the owner or an admin, and for a
harness sending another's agent; 404 for a harness that doesn't declare `heartbeats`, or no copy.

**A check-in**: `message.post` gains `heartbeat: true` (optional; only a harness or its agent may
send it). Folded into the message the apps read, as `heartbeat`.

## 3. Phases

### Phase 1: protocol, server, core

Mirror ADR 0140's Phase 1 file for file:

- **Protocol:** `capabilities.ts` (`heartbeats`); a new `agent-heartbeats.ts`
  (`HEARTBEAT_CHOICES_MAX = 12`, `HEARTBEAT_EVERY_MAX = 10080`, `HEARTBEAT_CHANGE_WAIT_MS`,
  `agentHeartbeatPut`, `AgentHeartbeatCopy`, `heartbeatChangeAsk`, `heartbeatChangeView`,
  `agentHeartbeatView`, `heartbeatChangeFrame`); `frames.ts` (`accepts` gains `heartbeats`, the
  frame union, `FRAME_NAMES`); `message.post`'s `heartbeat`; the change id prefix is `chg_` as
  the model's. `pnpm gen:protocol` after.
- **Server:** migration `0042-agent-heartbeats.ts` (registered in `migrator.ts`; take the next
  free number if another session took 0042), `schema.ts`, `agent-heartbeat-registry.ts`,
  `use-cases/agent-heartbeats.ts`, `routes/agent-heartbeats.ts`, the hub and session (send
  `heartbeat.change` to sockets that accept it), `delete-agent.ts` and `remove-harness.ts`, the
  gateway wiring, and the authorization matrix rows. The message read model carries `heartbeat`.
- **Core:** `agentHeartbeat.ts`: `everyWords(minutes)` ("15 min", "30 min", "1 hour", "2 hours",
  "12 hours", "Once a day", "Every 2 days"); `perDay(minutes)` (rounded, "about N a day", none
  under 1); `heartbeatRows(view)` (the switch row's state, the Every row's value and whether it
  shows, quiet when away or read only, saving); `heartbeatFoot(view, agentName, harnessName)`;
  `saveHeartbeatChange` (post, then read every 800 ms for up to 65 s, as `saveModelChange`); the
  message's `heartbeat` on `Message`.
- **CLI:** `pnpm live heartbeat <agent>` and `heartbeat-set <agent> on|off [minutes]`, as
  `model` and `model-set`.
- **Tests:** protocol schemas (choices ascending, unique, `every` among them; why only when read
  only), the fixture in the catalogue, server routes and use cases (each refusal, missed, an
  answer after the minute, delete and remove), the frame only to sockets that accept it, core
  words and rows, the message flag folded. The conformance fake if the model has a twin there.
- **Docs:** ADR 0143 (written), STATUS.

### Phase 2: the OpenClaw bridge

In `~/Work/chips-openclaw/bridge`, a new `heartbeats.ts` beside `models.ts`:

- **Declare** `heartbeats` (the live harness's declared list gains it: `chips declare`, a
  person's to run, with the others it has) and say `heartbeats` in the socket's `accepts`.
- **The copy, Main agent only**, sent at start, after each answer, and when OpenClaw's own value
  moves (read again after each Main-room turn and every follow pass):
  - read with `config.get`: `agents.entries.<primary>.heartbeat.every`, else
    `agents.defaults.heartbeat.every`, else OpenClaw's default (30 min);
  - `on` is an `every` above zero and the agent enrolled (an entry block, or
    `defaults.heartbeat.agentId` naming it);
  - `choices` 15, 30, 60, 120, 240, 720, 1440, with the current `every` added if it is not one.
- **A change**: `config.get` for its `hash`, then `config.patch` with `baseHash` (hot, no
  restart): `agents.entries.<primary>.heartbeat = {every: "<n>m" | "0m", target: "none"}`.
  Never `isolatedSession` (it would run outside Home). Off is `"0m"`, keeping the block, since
  once any entry has a block only those agents beat. Answer with the next copy; a refused patch
  is a `refuses` with OpenClaw's words.
- **Check-ins**: OpenClaw sends no `chat` events for a heartbeat turn. The bridge reads the
  `session.message` events of the primary's Home (`agent:<primary>:main`) for a
  `heartbeat_respond` tool call: `notify: true` posts its `notificationText` in the Main room as
  the Main agent with `heartbeat: true`; `notify: false` posts nothing. Confirm the event's shape
  on a live heartbeat before relying on it (the research saw it in the bridge's own log, 9
  October); `sessions.messages.subscribe` is the other way in.
- **"Not confirmed"**: with `target: "none"` OpenClaw records an alert as not delivered and hands
  it back on the next turn. Check what `main` makes of it after a check-in; if it repeats itself,
  the heartbeat prompt (`heartbeat.prompt`) gains a line that Chips shows its alerts.
- **Tests** in `test/heartbeats.test.ts`, as `models.test.ts`: the copy from each config shape,
  the patch for on, off and an interval, `refuses` on a failed patch, the check-in posted with
  the flag, the quiet check not posted, other agents sent no copy.

### Phase 3: phone (ADR 0143)

- `apps/mobile/src/agents/AgentCard.tsx` gains the Heartbeat group under the Model group, in a
  new `apps/mobile/src/agents/heartbeat/`: the switch row (the `Switch` the app uses elsewhere,
  flat), the Every row growing in under it, the intervals as a radio list in the app's `Sheet`,
  and the foot. Saving shows `ChipPulse` with "Saving to OpenClaw" under the switch's label and
  in the Every row, as the Model row does.
- The room's message draws the tag over a check-in: the agent's name, then a small gold
  "Heartbeat" tag with the pulse glyph (the mock's `.beat-tag`).
- Jest: the rows in each state (off, on, saving, away, read only, refused, missed), the sheet's
  pick, owner only, the tag. Walk on a Release simulator against scratch with a stand-in
  harness. Go-live, on his word: `pnpm phone build`.

### Phase 4: Mac and web

- `apps/web/src/app/Agents.tsx` gains the same group, in a new `apps/web/src/app/heartbeat/`;
  the message tag on web. Vitest and a browser walk against scratch. Go-live, on his word:
  `pnpm web:build` and `pnpm desktop`.

### Phase 5: acceptance and go-live

- On scratch first, then live on his word: 4431 backed up and kickstarted (migration 0042),
  `chips declare OpenClaw … heartbeats`, the bridge's main fast-forwarded and restarted, the three
  app builds.
- The live check: turn it on at 15 min from the iPhone, see the copy and OpenClaw's config change,
  see a quiet check post nothing, see a check-in posted with the tag (seed one by asking `main` to
  watch something), turn it off, and set it back to what he wants.
- Scenario `testing/scenarios/agents/heartbeat.md` (prefix `HB`), findings to `testing/findings.md`.

## 4. Coordination

The agent-model session builds the same page's Model group (its Phases 4 and 5) in
`AgentCard.tsx` and `Agents.tsx`. Keep the Heartbeat group in its own folder and its own component,
so each page gains one line, and say so to that session before touching either file.
