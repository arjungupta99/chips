# OpenClaw findings, batches 2 to 5: the runbook

27 September 2026. Written to be run by a later session, after compaction, with nothing else in
hand. The findings are in `docs/reviews/openclaw-test-report.md` (1 to 23). Their sizing is in
`docs/proposals/openclaw-findings-sized.md`.

**Batch 1 is done and live**, and the Outcomes table in the report records it. It shipped at
aade3068, on the desktop and his iPhone from about 10:25 PDT, and was pushed at ef7ce93c.

**Each batch needs Arjun's word to start.** Each step marked ⏸ needs his word again. Line numbers
are as of ef7ce93c (Chips) and 71fa4b3 (Jacobian). Confirm them before editing, because other
sessions move both repositories.

## The rules, whatever the batch

- **Main only, and linear.**
  - Build in a worktree off main: `git worktree add .claude/worktrees/<name> -b claude/<name> main`, then `pnpm install --frozen-lockfile --prefer-offline`.
  - Fast-forward main when everything passes. Rebase or cherry-pick, never merge.
  - Pushing is Arjun's word.
- **Commits** use `git commit -s`, and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - The subject follows the log's style: `fix(core): …`, lowercase, plain words.
  - Say the finding in the body, for example "(OpenClaw test, finding 19)".
- **Chips has no dependency on OpenClaw of any kind.** Nothing of OpenClaw goes in this repository except prose. `tools/guardrails/no-harness-named.test.ts` enforces it. The bridge lives in `~/Work/chips-openclaw`.
- **Checks:**
  - `pnpm check` runs lint, typecheck, unit tests and phone tests. It stops at the first failure, so run `pnpm mobile:test` again yourself if `pnpm test` fails.
  - Two tests are known flakes under load: core `viewer.test.ts` ("is where the spring itself is") and web `VoiceRecorder.test.tsx` (a focus check). Rerun them before believing them.
  - End to end on 5199, **never alongside `pnpm check`**:
    `cd apps/web && CHIPS_E2E_WEB_PORT=5199 CHIPS_E2E_SERVER_PORT=4452 CHIPS_E2E_RELAY_PORT=4453 CHIPS_E2E_BUILD_PORT=5198 npx playwright test <specs> --project=chromium`
- **Test before fixing:** write the test, see it fail without the fix, then fix. Match the code around the change: its comments explain why, in plain words.
- **Going live** ⏸:
  - **Desktop:** `pnpm web:build` from the main checkout. 4431 serves `apps/web/dist` fresh on each request.
  - **Phone:** `pnpm phone build` from the main checkout. It builds, installs and launches on My iPhone 17.
  - **4431** runs the main checkout's source, as the launch agent `chat.chips.serve`. Restart it only on his word:
    - first `lsof -nP -iTCP:4431 -sTCP:LISTEN`;
    - back up with `sqlite3 .chips/chips.db ".backup '<scratchpad>/chips-4431-before-<what>.db'"`;
    - then `launchctl kickstart -k gui/$(id -u)/chat.chips.serve`;
    - check that it listens again and that Jacobian reconnects (the log says `hello negotiated`).
- **Stopping processes:** by PID only, never by pattern. Leave Storefront, quotes and the other sessions' worktrees alone.
- **Jacobian** (`~/Work/Jacobian`):
  - Nothing is committed there without Arjun's word.
  - He restarts Jacobian himself, in a gap between tasks. `jacobian restart --check` can say healthy and restart nothing.
  - Its checks are `npm test` (vitest), `npm run lint` (tsc) and `npm run build`.
- **After each batch:**
  - mark each finding's outcome in the report's **Outcomes** table;
  - add a STATUS entry (`docs/STATUS.md`, newest first under *In progress*);
  - update the memory file `chips-openclaw-test.md`.

**What is running** (all of it test gear, stopped only in Phase 8):
- **The OpenClaw container:** `chips-openclaw-gateway-1`, on Colima, shared with Storefront. Scope every command to `-p chips-openclaw`.
- **The bridge:** runs live against 4431 as harness `hrn_01M3GZ8BFBQHBDE1JJHTPDDBFA`.
  - Control it with `~/Work/chips-openclaw/scripts/bridge.sh start live | stop | status`.
  - Its PID file and log are under `~/chips-openclaw/bridge`.
  - It holds OpenClaw's `operator.admin`, and Codex runs sandbox `danger-full-access` with policy `untrusted`. Both were Arjun's call.
- **The scratch Chips:** 4436, controlled with `scripts/scratch-chips.sh`.
- **Its desktop:** vite on 5186, from the main checkout. The PID is in `~/chips-openclaw/chips/web.pid`.

## Order

1. **Batch 2 (the CLI).** Nothing to ship.
2. **Batch 3 (the docs).** Nothing to ship. Rerun A3 first, for the sentence on scopes. **Done 27
   September**, bar finding 4's paragraph: the rerun found 24, which moves to batch 4.
3. **Batch 4 (the server).** One restart of 4431, and the desktop and phone rebuilt. **Built 27
   September**: 24 by (a), 11, 5 and 18; 8's "offline" left as it is (c), both on Arjun's call.
4. **Batch 5 (Jacobian).** A Jacobian change; his word to commit, his hands to restart.

2 and 3 can share a session. 5 can go at any point, since it touches Jacobian only.

## Batch 2: the CLI (finding 19)

**What Arjun sees today:** `chips doctor` says `token:custom` and `harness:custom` for OpenClaw.
`chips connect` ends with "Undo with `chips disconnect custom`".

- **Cause:** `nameFor` in `cli/src/connections.ts` (about line 88) returns the adapter's word while a harness is the only one of its adapter: `if (alike.length <= 1) return connection.harness;`.
- **Change:** drop that line.
  - A unique display name then wins, quoted when it has a space, and the id is used when names are shared.
  - `findConnection` already accepts names, ids and adapter words, so `chips disconnect jacobian` still works.
  - Callers are `connect.ts` (~201 and ~232) and `doctor.ts` (~74 and ~94; check keys ~219–299).
- **Tests:** `cli/src/commands/doctor.test.ts` (~157, ~176, ~317) and `connect.test.ts` (~190) expect `custom` or `jacobian`. Change them to names, and add one where two harnesses share an adapter.
- **Docs:** `apps/docs/src/content/docs/operate/cli.md` (~152–169) and `connect/custom.md` (~42). Add a one-line note to ADR 0077's point 2, which chose the adapter's word.
- **Verify:** `pnpm chips doctor` from the main checkout shows `harness:OpenClaw` and `harness:Jacobian`.
- **Ship:** nothing; the CLI runs from source.

## Batch 3: the docs (findings 12 to 17, and one sentence for 4)

The pages are `apps/docs/src/content/docs/…`. Nothing checks their prose, so read each claim in the code first.

**Checks:**
- `pnpm docs:check` runs the samples in `apps/docs/samples/*.ts`.
- `pnpm --filter @chipschat/docs build` checks links.
- `pnpm lint` includes `check:protocol`: the generated `reference/events/*.md` must match the schemas.

| # | Page | Change | Source of truth |
|---|---|---|---|
| 12 | `reference/frames.md` (the frame table, plus a new "Shapes" section); `connect/websocket.md` §Writing | Show `{ "frame": "event", "event": { "type": …, …, "idempotency_key": … } }`. The key goes inside `event`, or the server answers `invalid_frame` | `server/src/interfaces/ws/session.ts` ~367; `packages/protocol/src/frames.ts` ~73. Optionally a sample in `apps/docs/samples` that parses it |
| 13 | Generated event pages | `tools/protocol/generate.ts` `fieldRow` (~192) prints any type longer than 90 characters as "object". Print arrays as `enum[]` or `object[]`, and list an enum's values. Run `pnpm gen:protocol`. This fixes `approval.request.risk` and the others with long types (`sources`, hello's `harnesses`) | `risk` is `z.array(riskClass)` (`packages/protocol/src/events/harness-to-chips.ts` ~246), with 8 closed values (`primitives.ts` ~113) |
| 14 | `reference/http.md` §"The error envelope" | Already shows `{error:{code,message,request_id,issues?}}`. Add `retry_after_seconds`, and link the section from `connect/custom.md` and `connect/hooks.md` where refusals are described | `server/.../errors.ts` ~53 |
| 15 | `reference/http.md` §"Uploads and attachments" (~176–182) | A signed attachment URL also wants `Authorization: Bearer`. A member harness can fetch `/v1/attachments/:id` with the bearer alone | `signing.ts` ~45 `verifyGrant`; `uploads.ts` ~421 |
| 16 | `connect/custom.md` §"Hear what people say" (wrongly says the socket gives "the same events"); `connect/websocket.md` §"What a harness hears" | `GET /v1/events` returns the logged payloads (`message.post`), where the socket gives `message.new`. Say how to rebuild it (list below the table) | `server/.../routes/events.ts` ~156; the OpenClaw bridge's `catchUp` in `~/Work/chips-openclaw/bridge/src/main.ts` does exactly this |
| 17 | `reference/frames.md` (the hello row); `connect/websocket.md` §Handshake (claims "one connection can present many harnesses") | The server ignores the `harnesses` a client names in `hello`, and its `since`; its own hello names the token's one harness, with `owner_id`. Correct the schema's `describe` text too and run `pnpm gen:protocol` | `session.ts` ~199–259; `packages/protocol/src/frames.ts` ~40 |
| 4 | `concepts/approval.md` | One paragraph: "This session" and "Always" are kept by Chips itself, whatever the harness can keep. "This session" is a rule for the rest of the run; "Always" is a policy rule. A later ask of the same kind is approved by policy, and the harness hears `approval.resolved` by policy. The rule matches the action's kind and flags, so Always on one `shell.exec` allows every `shell.exec` from that harness | `server/src/domain/projection.ts` ~675 (session rule); `server/src/application/use-cases/submit-event.ts` ~822 and `ruleFromAlways` ~1211 |

Finding 16's rebuild, step by step:
- `message_id` is the event's `id` with `evt_` changed to `msg_`.
- `from.participant_id` and `from.kind` come from `actor`.
- The display name comes from `/v1/participants`.
- Attachments have no URL there; fetch them by id with the bearer.
- `role` cannot be recovered.
- `next_cursor` can be `null`.

**Before the finding 4 sentence, rerun A3 on the scratch server** (4436, desktop on 5186, the bridge on `start scratch`):
1. Stop the live bridge first (`bridge.sh stop`); only one runs at a time.
2. Ask OpenClaw to run `date`, and approve with **Always**.
3. Ask for `date` again. Chips should approve it by policy, with no card.
4. Ask for `pwd`. It should also pass by policy, because both are `shell.exec`. That is the thing to write down.
5. Put the bridge back with `bridge.sh start live`.

## Batch 4: the server (findings 11, 5, 18, 24, and 8's second half)

One 4431 restart ⏸ for the whole batch, then the desktop and phone rebuilt ⏸. There is no
migration. Consider ADR 0079 ("what a harness may say about its own asks, usage and presence") to
hold findings 5, 11 and 18 together, or addenda to ADR 0077.

### 11. Usage with output tokens only

- **Why:** OpenClaw's Codex runtime often reports output tokens only, so 19 of 22 turns showed no usage.
- **Protocol:** `packages/protocol/src/events/harness-to-chips.ts` ~459. `usage.input_tokens` becomes optional. Run `pnpm gen:protocol`.
- **Guards** (`required` is only a cast, so a missing value becomes NaN):
  - `server/.../submit-event.ts` ~803 `priceUsage`: no cost when input is unknown.
  - `server/src/domain/projection.ts` ~102 and ~873.
  - `projection-writer.ts` ~183–189.
  - `pricing.ts` ~28 and ~52.
  - `packages/core/src/model/runs.ts` ~192–203.
  - `apps/mobile/.../LineMenu.tsx` ~189: it must not say "0 in".
  - SDK `packages/sdk-ts/src/run.ts` ~124 and ~413.
  - `apps/web/.../RunPanel.tsx` ~260 is already fine.
  - `runs.input_tokens` is nullable already.
- **Tests:** `server/src/domain/projection.test.ts`, `pricing.test.ts`, `submit-event.test.ts`, core `fold.test.ts`, SDK `connect.test.ts`.
- **Bridge, outside Chips:** `usageOf` in `~/Work/chips-openclaw/bridge/src/bridge.ts` requires both counts. Let it send output alone, and update its test.

### 5. A harness settles an ask answered in its own tools

- **Why:** answered in OpenClaw's CLI, the Chips card stayed live until it expired, and the run said "Needed you".
- **Server:** `server/src/domain/authorize.ts`:
  - In `refuseHarnessAnswer` (~558–566), allow a harness to send `approval.resolved` for an ask in **its own run** (`context.run.harness_id === sender`). Today only a harness policy named approver may send it (~196–203).
  - Add `question.answered` to `SHARED_EVENTS` under the same own-run rule; the direction check is at ~252–259.
  - Force scope `once` for these, so no session or always rule is written (`submit-event.ts` ~822, `projection.ts` ~676).
  - First answer still wins (rule 6).
- **Leave alone:** ended runs keep their asks open on purpose (`run-state.ts`, `ABOUT_AN_ASK`, ~105–125).
- **Clients:** nothing to change; they already say "Approved by OpenClaw" from `resolved_by`.
- **Tests:** `authorize.test.ts`, `submit-event.test.ts`, `run-state.test.ts`. Include a harness refused for another harness's run, and a person's answer after the harness's is refused as late.
- **Docs:** `concepts/approval.md`, `connect/custom.md`, and the regenerated event descriptions.
- **Bridge, outside Chips:** on OpenClaw's `exec.approval.resolved` or `plugin.approval.resolved`, for an ask whose Chips card is still open, send `approval.resolved` as the harness. Do the same for `question.resolved`. Check the event names against the gateway (`scripts/cli.sh`, or grep the image's `dist`).

### 18. "OpenClaw has never connected"

- **Why:** a message sent to a harness before its first connection is heard by nobody, and nothing says so.
- **Server:** add `last_seen_at` to `GET /v1/participants` for a harness: the latest `harness_tokens.last_used_at` across its tokens. The read model is `server/src/infrastructure/store/read-models.ts` ~771, and `ParticipantView` is in `server/src/application/ports/read-models.ts` ~255.
- **Core:**
  - `Participant.lastSeenAt` (`packages/core/src/events.ts` ~23).
  - A `neverConnected(directory, harnessId)` helper.
  - Read the directory again when a harness with no `lastSeenAt` first speaks (`packages/core/src/store.ts` ~757).
- **Clients:** a line in a room whose harness has never connected: "OpenClaw has never connected; it won't hear this yet".
  - Desktop: by the composer, `apps/web/src/app/SpaceView.tsx` ~336.
  - Phone: in the foot, `apps/mobile/src/spaces/SpaceView.tsx` ~960.
  - Show the harness's own name.
- **Tests:** `packages/core/src/events.test.ts`, web `Shell.test.tsx`, `apps/mobile/src/spaces/SpaceView.test.tsx`, and a server read-model test.
- **A limit, checked:** `last_used_at` is written when a credential authenticates, at most once a minute (`server/src/infrastructure/auth/last-used.ts`). A socket that stays open does not refresh it. So it answers "has it ever connected", and **not** "is it connected now".

### 24. "This session" and "Always" at L1 ⏸ decide first

Found rerunning A3 in batch 3; see the report. `evaluate` in `server/src/domain/policy.ts` (~276)
lets an `allow` among a harness's rules speak only at `level >= 2`, where `level` is
`min(harness.autonomy, cap)`. The rules a person's answer makes are among them: Always through
`ruleFromAlways` (`submit-event.ts` ~1211), This session through `evaluateAsk` (~926). Ask Arjun
which:

- **(a) Hold back an `allow` only where it would talk past a cap or L0 (S), recommended.** An
  `allow` among the harness's rules speaks when the workspace cap is L2 or more and the harness is
  at L1 or more: `fromHarness.decision !== "allow" || (cap >= 2 && harness.autonomy >= 1)`. A room
  capped at L0 or L1 still cannot be talked past, which is what the rule was for. L0 still asks
  for everything, and a rule made there waits for the dial. An allow rule someone wrote for a
  harness at L1 speaks too. `ruleFromAlways` skips a rule the policy already has.
  - **Tests:** `server/src/domain/policy.test.ts`: the table (L1 under cap 2 with an allow rule
    allows; under cap 1 it asks; at L0 it asks), and a property: an allow rule never speaks under
    a cap below L2. `submit-event.test.ts`: Always at L1, then the same kind again is approved by
    `system`; This session the same within the run. An e2e on 5199 (`decisions` or a new spec).
  - **Docs:** `concepts/policy.md` (the "Rules go first" paragraph and "What a decision leaves
    behind"), and finding 4's paragraph in `concepts/approval.md` (below).
  - **Live retest:** A3 again, on 4431 with OpenClaw at L1: Always on `date`, then `date` passes
    with no card and `pwd` too (both `shell.exec`).
- **(b) Offer only Once where the answer would not hold (M).** Both apps hide This session and
  Always on a card whose harness is below L2 or capped below it. Nothing loosens, but a person at
  L1 can say "stop asking" only by turning the dial to L2, which lets every plain write through.
- **(c) Leave it, and say so** in `concepts/policy.md` and `concepts/approval.md`.

**Finding 4's paragraph**, for `concepts/approval.md` once 24 is settled: This session and Always
are kept by Chips itself, whatever the harness can keep; the harness hears the scope, and OpenClaw's
bridge sends its native commands a yes as allow-once. This session is a rule for the rest of the
run, and Always a policy rule for that harness in that room. The rule matches the action's kind
and flags, so Always on one `shell.exec` covers every `shell.exec` from that harness in that room
(`date` and `pwd` alike). A later ask it covers is approved by policy, and the harness hears
`approval.resolved` by `system`. With (c), add where that does not hold.

### 8, second half: "offline" ⏸ decide first

The server knows which harnesses have a socket open, but only in memory: `server/src/interfaces/ws/hub.ts` ~73 (`sessions`, added ~115, removed ~136). It publishes none of it. Ask Arjun which:

- **(a) At read time (S–M):** `GET /v1/participants` also says `connected: true|false` from the hub's set. The desktop sidebar and the phone's fleet say "offline" for a harness with no socket. It is fresh whenever the directory is read (at connect, on some events, on opening Harnesses), not live.
- **(b) Live (L):** an opt-in `presence` frame through the hello's `frames` list (ADR 0043), sent on subscribe and on each harness socket opening or closing, and folded into `model.presence`. This needs an ADR.
- **(c) Leave it:** "never connected" (18) covers the case that lost a message.

Either way, the bridge should close its Chips socket while OpenClaw is down, or it still looks connected. That is a bridge change, outside Chips.

### Checks and ship, batch 4

1. `pnpm check`, then end to end on 5199: `decisions`, `approval-loop`, `golden`, `group`, `shapes`, `custom-connect`, plus a new spec for a harness settling its own ask.
2. Fast-forward main.
3. ⏸ Restart 4431, with a backup first.
4. ⏸ `pnpm web:build` and `pnpm phone build`.
5. Restart the bridge (`bridge.sh stop`, then `start live`).
6. Retest live with OpenClaw: usage on every turn (U1); an approval answered in OpenClaw's CLI (`scripts/cli.sh approvals resolve <id> allow-once`) cools in Chips (A4); a new custom harness's room says it has never connected; with (a) for 24, Always holds at L1 (A3).

## Batch 5: Jacobian (finding 23)

**Reshaped on 27 September 2026 by ADR 0081**, before any of it was built:

- **Chips goes first.** It decides who each message is for (`addressed_to`) and delivers
  `message.new` only to those harnesses. The rest hear `message.overheard`, and a guard stops
  harnesses after 4 messages between themselves.
- **Then Jacobian.**
  - A thread per room, which is option B below.
  - A turn only on `message.new`.
  - `message.overheard` noted into the room's thread.
  - An addressed harness message accepted when both harnesses share an owner.
  - The room's roster given to the turn.
- **Dropped:** the per-room turn cap in "Hearing another harness" below, which is now Chips's
  guard.
- **Replaced:** the "@mention decision" is now ADR 0081's rules.

The mock is `docs/proposals/who-a-message-is-for-mocks.html`. The text below is kept as it was
written.

"A joint space" (made with No one, then Jacobian and OpenClaw added) goes to J. It mixes into J's
history with Arjun, unmarked, and it can never become a Space. Chips refuses a claim on a room not
asked of the harness (`server/src/application/use-cases/open-space.ts` ~335). **Leave that as
it is.** Letting a member claim would let it rename and archive a room people made (ADR 0069),
and a room holds one key.

All in `~/Work/Jacobian`. ⏸ Commit only on his word. He restarts Jacobian after `npm run build`.

### B: each room its own thread in J (recommended; S)

- `src/conversation.ts`:
  - add `conversationId?` to `IncomingMessageParams` (~159–173);
  - pass it through `handleIncoming` → `runSpaceTurn` → `runtime.runTurn` (~504);
  - keep `session.sessionId` for stop, live turns and cost.
- `src/channels/chips/bot.ts` `turn()` (~906): when `this.spaces.jacobianSpaceOf(room)` is undefined, the room is not one Jacobian knows, so pass `${session.sessionId}@${room}`. J's own room and a Space's room are known, and keep their keys.
- `/reset` said in such a room must forget that room's thread. `forget` matches the record id exactly (`src/spaces/runtime.ts` ~1948, `conversation.ts` ~272).
- **Tests:** `tests/unit/channels/chips/bot.test.ts`, and one beside `tests/unit/channels/placed-turn-dispatch.test.ts`:
  - two unknown rooms get two threads;
  - J's own room keeps its key;
  - `/reset` in a group room forgets only that room.
- **What Arjun gets:** "A joint space" no longer mixes into his conversation with J. J keeps one memory, and the router's "previous landing" hint still spans rooms, which is harmless.

### Hearing another harness that @mentions Jacobian (S–M) ⏸ decide first

- **Today:** Jacobian drops every message from a harness (`bot.ts` ~652, `isAuthorized`), so it never heard OpenClaw's "Hey @jacobian".
- **Change:**
  - `readInbound` reads `from.kind` and `mentions`.
  - Accept a harness's message only when its `mentions` include Jacobian's own harness id (`settings.harness_id`) and its owner is one of Jacobian's owners. `owner_id` comes from `GET /v1/participants`; add a client method and a small cache.
  - Cap the turns harnesses can start per room, for example 3 in 10 minutes, against ping-pong.
  - Run the turn as its own conversation, not the owner's. Approvals still go to the owner.
- **Size:** about 40 lines and 4 tests.

### A: a Space per room (later, as an act; M)

- **Trigger:** Jacobian binds a room to a Space of its own when asked, for example with a `/space` command said in the room, not for every group room.
- **Binding:** on Jacobian's side only, through a `bindLocal` in `src/channels/chips/spaces.ts`, saved in `ChannelState` and loaded before `openAll`.
- **Naming:** from the room's title. `client.ts` needs a `roomTitle(spaceId)` that pages `GET /v1/events?space_id=`, falling back to the members' names.
- **Do not reuse the + flow.** Its claim gets a 403, marks the room refused, and `serving` then drops every later message.
- **Tests:** about 8–10, including "a restart finds no second room" and "erasing the room forgets the Space".

## Not scheduled

Each needs its own word, and most need an ADR:
- **4 as a field:** `approval.request` names the scopes a harness keeps. Only if the A3 rerun shows a need.
- **5 as a new event:** `ask.withdrawn`, with its own copy.
- **8 live presence:** option (b) above.
- **10:** one connection presenting several agents (open decision 8).
- **Capabilities declared in `hello`:** this reverses ADR 0046.
- **23 on Chips's side:** a member harness claiming a room.

## Then Phase 8: uninstall OpenClaw ⏸

The steps are in `docs/proposals/openclaw-test-plan.md`, Phase 8. In short:
1. **On 4431:** delete OpenClaw's rooms if Arjun wants them gone, then `chips remove OpenClaw` (ADR 0078). This withdraws its tokens, takes it out of the lists, and forgets the keychain secret.
2. **Stop what runs:** `~/Work/chips-openclaw/scripts/bridge.sh stop` and `scripts/scratch-chips.sh stop`. Stop the vite on 5186 by the PID in `~/chips-openclaw/chips/web.pid`.
3. **Uninstall:** `~/Work/chips-openclaw/scripts/uninstall.sh`. It takes away the container, the 4.87 GB image and `~/chips-openclaw`, then proves it with `check.sh --gone` against the baseline taken at 00:04 on 27 September.
4. **His hands:** end the ChatGPT sign-in for OpenClaw, if his account lists it.
5. **What stays:** the `~/Work/chips-openclaw` repository (bridge and scripts, local only), unless he says otherwise.
