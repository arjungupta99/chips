# Agents working together: the build

**Arjun's word, 2 October 2026:** "ok add it to the plan. Next build a detailed phased plan, I will
execute it after compaction." His decisions, the same day, in order:
- "this message limiting thing seems an anti pattern to me. I would rather have chips inject
  maybe messaging or later warning context (if it is truly going south) … The limit should
  otherwise be a very large number."
- Work resets both counts.
- "When the communication is blocked by Chips, the notification needs to be clearly notified in
  the UI."
- "we need this injection feature if its not there" (a message arriving mid-turn joins the turn).

**Read first:**
- `docs/proposals/agents-working-together.md`: what the ASCII Art room showed, the principle, the
  referee, the room's files, what stays the harnesses'.
- The explainer, a private Artifact kept out of the repo:
  https://claude.ai/artifact/X95NyedY1a54WHRLiHzLdD.
- ADR 0081 (who a message is for; the guard this replaces), 0088 (the lines handed with a
  message), 0092 (the room note), 0083 (an agent that cannot answer), 0095 (the go-live order a
  two-sided change takes).

This runbook stands on its own. Line numbers are from Chips main `8f2ca285`, Jacobian main
`8b60537` and the bridge's main `7a21fd2`; confirm each before editing.

## 0. Ground rules

- **Where to work.**
  - Chips: a new worktree `.claude/worktrees/agents-together`, branch `claude/agents-together`,
    from main. Main is linear: fast-forward only, never a merge commit. Replay onto a named
    branch, never a detached HEAD. Main is shared between sessions: `git log origin/main..main`
    and the reflog before each live step, and say which peers' commits a push would carry.
  - Jacobian: a new worktree `~/Work/Jacobian/.claude/worktrees/chips-interject`, branch
    `claude/chips-interject`, from its main. Symlink `node_modules` from the main checkout as the
    earlier worktrees did (`ln -s ../../../node_modules node_modules`); unlink it before removing
    the worktree.
  - The bridge: `~/Work/chips-openclaw`, a branch off its main. It has no remote.
- **Commits.**
  - Chips: `git commit -s`, message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
    One commit per part below.
  - Jacobian: sentence case, no `-s`, only my paths (`git commit -- <paths>`). His `.gitignore`
    edit and the staged `dashboard/tsconfig.tsbuildinfo` deletion stay as they are. Nothing is
    committed in Jacobian without his word.
  - The bridge: `feat(bridge)` / `fix(bridge)`, no sign-off.
- **Checks.**
  - Chips: `pnpm check` (lint, typecheck, unit, mobile Jest). `pnpm gen:protocol` after any
    schema change; `check:protocol` is inside lint. The lint's complexity cap is 12: split
    functions rather than fight it. The desktop e2e runs on its own ports, never alongside
    `pnpm check`: `cd apps/web && CHIPS_E2E_WEB_PORT=5199 CHIPS_E2E_SERVER_PORT=4452
    CHIPS_E2E_RELAY_PORT=4453 CHIPS_E2E_BUILD_PORT=5198 npx playwright test <specs>
    --project=chromium` (5199/5194 have been in use by other sessions: pick free ports).
  - Jacobian: `npm run typecheck`, then only the suites touched, by file. Never the whole suite:
    it crashed Colima on 28 September, and Colima is shared with Storefront.
  - The bridge: `cd bridge && npm test`.
- **Chips depends on no harness.** `tools/guardrails/no-harness-named.test.ts` fails on
  *Jacobian* or *OpenClaw* in shipped source. Build copy from `nameOf`.
- **Live things are his.**
  - 4431 is the launch agent `chat.chips.serve`; it runs the main checkout's source. Restart only
    on his word: `launchctl kickstart -k gui/$(id -u)/chat.chips.serve`. Back up
    `.chips/chips.db` first (`cp` to `.chips/chips.db.bak-<date>-pre-<thing>`).
  - `pnpm build` for `apps/web/dist`, `pnpm desktop` for the Mac app, `pnpm phone` for his iPhone:
    his word for each. `pnpm phone` builds from the main checkout, so merge first.
  - He restarts Jacobian (`jacobian restart --check` can say healthy and restart nothing when it
    was started by hand: check the process start time). The classifier refuses my bridge
    restarts: hand him the command (`scripts/restart.sh` in the bridge repo).
  - Kill by PID only. Never touch other worktrees, Storefront or quotes. Never pair a new device to
    the live server; he handles credentials and sign-ins.
  - The live DB is read with `sqlite3 "file:.chips/chips.db?mode=ro"`.
- **Running at the time of writing** (verify with `lsof -i :4431` and `ps`): 4431 pid 1016
  (started 17:00 PDT), Jacobian pid 39201 (17:04), the bridge pid 44554 (17:42), the container
  `chips-openclaw-gateway-1`.
- **Decisions made here, so the build does not stall on them:**
  1. The constants are `NUDGE_AT = 8`, `WARN_AT = 16`, `CEILING = 48`, in `@chipschat/protocol`.
     `GUARD` goes.
  2. The referee's facts travel as a new `exchange` object on `message.new` and
     `message.overheard`, beside ADR 0092's `room`, with a plain `note` rendered by one shared
     function, so the server, the conformance fake and the SDK hand over the same words.
  3. Pause and carry on are one event, `exchange.set {space_id, state: "paused" | "going", by}`,
     with a person as actor. `going` is a person's act, so it resets.
  4. Hand-over on a reset is an event, `message.handed {space_id, message_id, agent_id}` (actor
     `system`), delivered to that agent's harness as `message.new` with the original message's
     payload and `handed: true`. Who the held message was for is recomputed from its stored `to`
     and `mentions` with `resolveAddress` at an exchange of zero, so no column is added.
  5. A repeat is the same `sha256` as a file the same agent posted since the reset, or words
     whose word-trigram Jaccard against one of its messages since the reset is at least 0.6
     (lowercased; `@handles`, URLs and punctuation removed; under six words never a repeat).
  6. Room files: the newest `sha256` per filename per room is the current version. A new
     version's attachment carries `replaces: att_…`; a stale `replaces` refuses the whole post
     (`stale_file`).
  7. Whether a person is looking at the room is read from `read_state`: behind the room's head
     by a message for more than a minute means not looking; unknown is `null`.
  8. ADR numbers: 0097 the referee (amends 0081, point 4), 0099 the room's files (0096 went to
     the mark redrawn and 0098 to a tab's glass, by other sessions, on 2 October). Confirm both
     are free when writing them.
  9. The bridge sets `queueMode: "steer"` on every `chat.send`: OpenClaw injects into a running
     turn and starts one when none is running. Confirm against OpenClaw's gateway docs before
     relying on it; `followup` is the fallback.

## Order

1. Jacobian: one turn at a time, by injection. Needs nothing from Chips and ends the duplicate
   turns the day he restarts.
2. The referee's halves in Jacobian and the bridge. Tolerant of a Chips that sends nothing yet.
3. The referee in Chips, then live.
4. The room's files, the adapters' halves. Tolerant of absence.
5. The room's files in Chips, then live.
6. Files for people on the Mac and the phone. Later.

Each live step goes the way ADR 0095's did: the adapters first, Chips last, one restart each.

## Phase 1. Jacobian: a message arriving mid-turn joins the turn

The seam exists: `noteForNextRound(turnId, text)` queues a line on a live turn and `withNotes()`
appends it as a text block after the round's tool results, before the next model call
(`src/spaces/runtime.ts` 690–705 and 760–775). The pulse uses it. Nothing uses it for words, and
nothing looks for a live turn before starting another.

### 1.1 The runtime (`src/spaces/runtime.ts`, `src/spaces/types.ts`)

1. `TurnVitals` (runtime.ts 478–507): add `interjections: string[]` beside `notes`. Initialise it
   in `runTurn` (602–625).
2. New public `interject(turnId: string, line: string): boolean` next to `noteForNextRound`:
   trims, pushes, returns false when the turn is gone or the line is empty. Never dedupes: two
   people may say the same thing.
3. `withNotes` (760–775): after the pulse notes, when `turn.interjections` is not empty, append
   one more text block: `While you were working, these arrived:` then one line each. Drain. Log
   with `onInfo("Words reached a turn's next round", {…})`.
4. `TurnOutcome` (types.ts ~285): add `undelivered?: string[]`. Where the loop returns through
   `done(...)` (the closure the loop's `return done({...})` calls, 1020–1170), hand any
   interjections still queued into the outcome. A turn that ended on its final answer, or on an
   error, never silently drops words.
5. `TurnEntered` (types.ts 222–226) and `TurnEnded` (234): add `turnId: string`. Set it where
   `entered` is built (runTurn 624) and where the turn ends.
6. Tests, `tests/unit/spaces/runtime.test.ts`: a fake backend scripted `tool_use` then text.
   - Interject during round 1: the second model call's last `user` message ends with the block.
   - Interject after the final call: the outcome's `undelivered` carries the line.
   - Interject on an unknown id: false.

### 1.2 The engine (`src/channels/conversation.ts`)

1. `private turnsOn = new Map<string, Set<string>>()`, keyed by `session.sessionId`
   (`channel-user`): filled from `onTurnEntered(info.turnId)` and emptied from `onTurnEnded` in
   the TurnSession built in `runSpaceTurn` (526–560).
2. `private starting = new Map<string, string[]>()`, keyed by `${sessionId}::${spaceId}`: words
   that arrived while the walk was still placing the first message. `handleIncoming` (844–890)
   marks the key before `placeMessage` and clears it when the turn registers; `runSpaceTurn`
   drains it into `runtime.interject` on the turn's `onTurnEntered`.
3. New `interject(session, spaceId, words): "injected" | "queued" | "none"`: every live turn on
   the session gets the words (a `hand_down` child runs on the same session; both hear it at
   their next round); else the `starting` queue if the key is marked; else `"none"`.
4. `handleIncoming`: first line, `if (this.interject(session, entry, params.executionMessage) !==
   "none") return;`. No walk, no turn, no receipt.
5. `runSpaceTurn`'s `finally` (620–636): when the outcome has `undelivered` lines, or `starting`
   still holds some for this key, run one follow-up turn on the same session and Space with them
   joined under `While you were working, these arrived:`. Not awaited by the caller.
6. Tests, new `tests/unit/channels/interject.test.ts`, built like `stop-live-turn.test.ts`:
   - A second message during a turn: `runtime.interject` is called, `runTurn` once.
   - A second message during the walk: folded in when the turn begins.
   - A second message during the final answer: one follow-up turn carrying the words.
   - Two people on two sessions: two turns, as today.

### 1.3 The Chips adapter (`src/channels/chips/bot.ts`)

1. `liveSessionFor(spaceId, agentId)`: scan `this.live` (run id → `ChipsReplySession`, which
   carries `spaceId` and `run.agentId`, session.ts 123–186) for the room and the agent; the
   default agent matches `undefined`.
2. In `turns` → `turnOf` (1044–1060), before `new Run(...)`: if a live session is found, fetch
   the attachments as `turn()` does (`receive`, 1328–1334) and call
   `this.deps.engine.interject(session, spaceId, line)` with `line` in `heardIn`'s shape,
   `Name: words` (room-talk.ts 88). On `"none"` fall through to a turn. No `run.start`, no
   second run: Chips already told the person `queued`, and the answer lands in the run that is
   going.
3. Agents' words (`onAgent`, 1007) take the same path. A command is never injected.
4. Tests, `tests/unit/channels/chips/bot.test.ts` with `fakes.ts`: two `message.new` for one
   agent in one room while the first turn is live → one `run.started` and one `interject`; a
   message for another of Jacobian's agents → a run of its own, as today.

### 1.4 Live

**Built 2 October 2026, 20:10 PDT**, in `~/Work/Jacobian/.claude/worktrees/chips-interject`
(branch `claude/chips-interject` off `8b60537`), uncommitted. Two changes from the plan above,
found while building:
- **The key is the conversation, not the session id.** A Chips person's runs in every room share
  one session id (`chips-<user>`), so keying by it would have joined words said in one room to a
  turn in another. `ReplySession.turnKey` (optional; absent = the session id, which is right for
  Telegram, Slack and Discord, one DM per person) names the conversation, and
  `ChipsReplySession` sets `${sessionId}:${run.id}`. The engine keeps one `going` entry per key
  from the instant a message comes in (before the walk) until its last turn is over; there is no
  separate `starting` map. `engine.joinTurn(session, words, tmpPath?)` returns
  `"joined" | "waiting" | "none"`.
- **The follow-up is awaited, in order.** `handleIncoming` loops: a turn, its answer, then one
  more turn on the same Space for words its last round never carried, under the same heading,
  until none are left. Awaited, so a Chips run completes only after the follow-up has answered.
  A stopped turn's undelivered words end with it; words said after the stop start the next turn
  (a Chips interrupt steer: stop, then the words). A follow-up begins strictly after the stop
  that ended its predecessor, even in the same millisecond.

The checks. Jacobian's typecheck is `npm run lint` (there is no `typecheck` script).
- `npm run lint`: clean.
- The touched and neighbouring suites by file: 691 of 692 pass. The one failure is
  `one-space.conformance` §6.3, retired vocabulary at `src/cost/store.ts:181` (his 27 September
  line); it fails the same way on `8b60537` with these changes stashed.
- The vectors: runtime 4, engine 6 (`tests/unit/channels/interject.test.ts`), adapter 5
  (`agents.test.ts`) and 1 (`bot.test.ts`, a steer while the turn is going).

- **On his word:**
  - Commit:
    ```
    git commit -- src/spaces/runtime.ts src/spaces/types.ts src/spaces/index.ts
      src/channels/conversation.ts src/channels/types.ts src/channels/chips/bot.ts
      src/channels/chips/session.ts tests/unit/spaces/runtime.test.ts
      tests/unit/channels/interject.test.ts tests/unit/channels/stop-live-turn.test.ts
      tests/unit/channels/chips/agents.test.ts tests/unit/channels/chips/bot.test.ts
      tests/unit/channels/chips/fakes.ts
    ```
    The message: "Chips and Telegram: words arriving mid-turn join the turn, or a follow-up turn;
    one turn at a time per conversation".
  - Fast-forward his main. He restarts.
- **What changes for a person.** Words said while a turn waits on a long tool or an approval land
  when that wait is over, not as a turn of their own.
- **Acceptance:** in a room with one of his agents, two lines ten seconds apart give one run in
  Chips and one answer covering both. Then the same on Telegram.

## Phase 2. The referee's adapter halves

Both adapters must read a `message.new` without `exchange`, and without `held` on the ack, as
today's. Nothing here waits for Chips.

### 2.1 Jacobian (`src/channels/chips/room-talk.ts`, `bot.ts`, `client.ts`)

1. `roomNoteOf` (room-talk.ts 229) gains a sibling `exchangeNoteOf(event)` reading
   `event.exchange?.note` (a string). `withRoom` (248) puts Chips's note first, ahead of the
   room note and the lines (ADR 0092's place), as `Chips: …`.
2. The post's answer. `postText` (bot.ts ~600–620) posts over HTTP through `client.ts`; the
   response gains `held: true` and `exchange: {count, allowance}` (Phase 3). When held: if the
   posting turn is still live (`liveSessionFor` by run), `runtime.interject(turnId, "Chips held
   your message to @…: the agents here have sent each other N messages since a person last
   acted. It is handed over when one does.")`; otherwise keep the line for the agent's next turn
   in this room (a small map room → pending note, read by `turn()` where `heard` is built, 1363).
3. Tests: `room-talk.test.ts` (the note's place), `bot.test.ts` (a held answer reaches the
   next prompt).

### 2.2 The bridge (`bridge/src/bridge.ts`)

1. `noteFor` (321): when `event.exchange?.note` is present, it comes first, then the room note.
2. `heard` (738–743): `queueMode: "steer"` on every `chat.send` (decision 9). The empty-turn
   handling at 1134 stays.
3. The post's answer: `chips.ts`'s post returns the body; when `held: true`, `chat.send` a
   `Chips: your message to @… was held …` line with `queueMode: "steer"` to the session that
   posted.
4. Tests, `bridge/test/bridge.test.ts`: note placement; `queueMode` on every send; a held
   answer sends the line.
5. Live: he restarts the bridge.

### 2.3 Built

**Built 2 October 2026, 20:30 PDT.** Phase 1 was not committed yet (the classifier refused my
commit), so Jacobian's half is in a worktree with Phase 1's changes under it.

**One change from 2.1.2 and 2.2.3: a held answer never starts a turn.** A steer to an idle
OpenClaw session starts a turn, and a turn started by a hold may say something that is held again,
which loops at the ceiling. So the held line goes to the turn that said it only while that turn
has a round left; otherwise it is kept for that agent's next turn in the room and said once, first,
as `Chips: …`. The bridge posts an answer only when OpenClaw's turn is over, so there it is always
the next turn. The words are the same in both adapters: *Your last message here was held, so the
agents it named do not have it yet: messages between the agents in this room are held (they have
sent each other N since a person last acted) until a person acts. Until then, tell the person what
is done and what is blocked, rather than asking the agents again.* The count is left out when Chips
gives none, as on a pause.

**`queueMode: "steer"` confirmed.** The 2026.9.6 image's `docs/gateway/protocol/rpc-session-control.md`
says a steer send "atomically injects the message into that session's direct active run, or starts
a new turn when the session is idle". With no `messages.queue` in the gateway's config, steer is
already its default, so this pins today's behaviour.

- **Jacobian:** worktree `~/Work/Jacobian/.claude/worktrees/chips-referee`, branch
  `claude/chips-referee` off `8b60537`.
  - `exchangeNoteOf` (room-talk.ts). `withRoom` takes `chips` lines, said first.
  - `heldNoteOf`, and `RoomTalk.keepHeld` / `takeHeld` keyed by room and agent.
  - `Inbound.exchange`. `joined()` carries the note with the words.
  - `onHeld` after `postText`.
  - `Appended.held` / `exchange` (client.ts).
  - `ConversationEngine.tellTurn` (conversation.ts): it interjects only into a turn in a round.
    A `Going.told` set drops what a turn with no round left was told, rather than carrying it into
    a follow-up.
  - Checks: lint and vocabulary lint clean; every channel suite plus one-space conformance pass
    bar the old `src/cost/store.ts:181` line.
  - New tests 10: room-talk 4, bot 2, agents 2, interject 1, plus the fakes' `holdPosts`,
    `inRound` and `told`.
- **The bridge:** `6e41a85` on its main, from branch `feat/referee`. Tests 82.
- **His commands, in order** (messages in the session scratchpad):
  1. Phase 1's commit in `chips-interject`.
  2. `merge --ff-only claude/chips-interject`.
  3. In `chips-referee`, `git reset claude/chips-interject`. This is a mixed reset: the working
     tree keeps both phases, the index and branch move onto Phase 1, so the diff is Phase 2 alone.
  4. Commit Phase 2's nine paths.
  5. `merge --ff-only claude/chips-referee`.
  6. Restart Jacobian, and the bridge.

## Phase 3. The referee in Chips

### 3.1 Protocol (`packages/protocol/src`)

1. `exchange.ts` (new, exported from the index):
   - `NUDGE_AT`, `WARN_AT`, `CEILING`.
   - `exchangeFacts` schema: `count`, `since: {kind: "person" | "work" | "start", seq, at}`,
     `minutes`, `person_looking: boolean | null`, `made: [{kind: "file", name, version, by, at}
     | {kind: "question" | "approval", by, at}]`, `repeats: [{message_id, of_message_id, kind:
     "file" | "words", by}]`, `no_turn: [{agent_id, message_id}]`, `also_for: [agent ids]`,
     `stage: "quiet" | "nudge" | "warning" | "held"`, `allowance`, `paused: boolean`.
   - `circleIn(speakers: string[], repeats: number): boolean`: the last 2p speakers are two
     rounds of the same p ∈ {2, 3} with a repeat, or three rounds without.
   - `repeatOf(text, earlier: string[]): boolean` (decision 5).
   - `renderExchangeNote(facts, nameOf): string`, the plain words, in two tones: nudge (facts)
     and warning (facts, then "Stop, and tell <person> what is done and what is blocked.
     Messages to each other are held after N.").
   - Tests, `exchange.test.ts`: the two ASCII Art stretches as fixtures (speakers Oc2 · Oc3 ·
     AA · Oc2 · AA · AA: no circle; AA · Oc3 · Oc2 · AA · Oc3 · Oc2 with a repeat: a circle at
     six); the repeat on identical words, on the same words with different @names, and not on
     five words.
2. `address.ts`: `GUARD` goes. `AddressInput.chatter` becomes `exchange: {count: number;
   paused: boolean}`; an agent's addressed message is held when `paused || count >= CEILING`.
   `address.test.ts` follows. Core's and the fake's imports of `GUARD` follow.
3. `events/chips-to-harness.ts`: `message.new` (159) and `message.overheard` gain
   `exchange?: exchangeFacts.extend({note: string})` and `handed?: z.literal(true)`.
4. `events/workspace.ts`: `exchange.set {space_id, state, by}` (actor a person) and
   `message.handed {space_id, message_id, agent_id}` (actor `system`); into `WORKSPACE_EVENTS`,
   fixtures under `fixtures/`, `catalogue.test`. `visibility.ts`: both seen by the room's
   members. `pnpm gen:protocol`.
5. `frames.ts` `ackFrame` (101–120): `held?: z.literal(true)` and `exchange?: {count,
   allowance}`. The HTTP post's response body likewise (3.2).
6. `context.ts` is untouched here (Phase 5 touches it).

### 3.2 Server

1. `infrastructure/store/read-models.ts`: `agentChatter` (625–650) becomes
   `exchangeOf(workspaceId, spaceId): ExchangeView` — the reset seq (the newest of: a person's
   message or act in the room, an agent's message carrying a `sha256` new to the room, a
   `question.asked` of a person, an `approval.request`, `exchange.set going`), the agent→agent
   messages since (count, speakers in order, ids, texts and shas for the repeat test, capped at
   `CEILING`), what was made since, `paused` (an `exchange.set paused` newer than the reset).
   Presence from `read_state` (decision 7). Test beside `message-address.test.ts`.
2. `application/use-cases/submit-event.ts` (895): pass `{count, paused}` to `resolveAddress`.
3. Delivery, `interfaces/ws/session.ts` `asDelivered` (~85–100): for a `message.new` or
   `message.overheard` to an agent, when the stage is nudge or above, attach `exchange` with
   `note` from `renderExchangeNote`. `also_for` is the message's other addressees. `no_turn` is
   ADR 0083's fact (`readModels.liveRun`, a run that never started within two minutes).
4. The ack: where the `ack` frame is sent after an append, add `held` and `exchange` when the
   address held it. The HTTP route that posts a message returns the same two fields.
5. Hand-over, a new use-case `hand-over-held.ts`, called after a person's act in a room
   (`message.post` by a person, `question.answered`, `approval.resolved` by a person,
   `membership.added`/`removed` by a person, `exchange.set going`): the held messages since the
   hold began; for each, who it was for (decision 4); the newest per agent; one `message.handed`
   each, delivered as `message.new` with the original payload and `handed: true`.
6. `exchange.set`: use-case `set-exchange.ts` and route `POST /v1/spaces/:id/exchange {state}`
   (template: `routes/agent-keep.ts`), for a person who is a member of the room and not a guest.
   A row in the authorization matrix.
7. `notify-push.ts` (~39, the events worth a push): the first held message of a hold, key
   `held:<space>:<reset seq>`, title "Chips paused the agents"; the first warning of a stretch,
   key `warning:<space>:<reset seq>`, title "The agents are circling". Both only to people not
   looking at the room. Fixed words, two ids, as the file's rule says.
8. Tests: read-models (`exchangeOf` on a seeded room), submit-event (held at the ceiling and
   when paused; not held at 47; a file with a new sha resets; a person's message resets),
   session (facts on `message.new`; the ack's `held`), the use-cases, the route and matrix,
   notify-push.

### 3.3 The conformance fake (`packages/conformance`)

`workspace.ts` and `fake-chips.ts` mirror 3.2: `exchangeOf`, held at `CEILING` or paused,
`exchange.set`, `message.handed`, facts on delivery, `held` on the ack.

### 3.4 Core (`packages/core/src`)

1. `model/readers.ts` `guardLine` (349–362) becomes `exchangeLine(lines, index, directory)`: the
   warning line, drawn from the lines alone (`runStart`, `talkersIn`, and protocol's `circleIn`
   over the speakers since the last reset): *ASCII Art, Oc2 and Oc3 have sent each other N
   messages since you last acted.* with *and the last k repeated earlier ones* when they did;
   under the first held line: *Chips paused the agents.* Updated in place as the count grows.
2. `model/spaces.ts`: the room's `paused: boolean` (a held line since the last reset, or an
   `exchange.set paused` since it); `exchange.set` and `message.handed` as lines (*Arjun let
   them carry on*, *Arjun paused the agents*; a handed message marks its line `handed`).
3. `store.ts`: `setExchange(spaceId, state)` → `POST /v1/spaces/:id/exchange`.
4. `rooms.ts`, `index.ts`: exports. Core tests in `model.test.ts`.

### 3.5 The phone (`apps/mobile/src/spaces`)

1. `SpaceView.tsx` (584, 599–625): the fold's `guard` words come from `exchangeLine`; the line
   gets two taps at the warning stage, *Let them carry on* and *Pause them*.
2. New `PausedBanner.tsx` above the composer while `room.paused`: *Chips paused the agents.
   <names> sent each other N messages since you last acted.* and *Let them carry on*
   (`store.setExchange(id, "going")`). Palette `danger` border, as the mock. It stays until a
   person acts.
3. `spaces.ts` and the list row: a *Paused* pill while `room.paused`; the subtitle *Chips paused
   the agents*.
4. Held bubbles already fold; mark each *held*.
5. Tests in `__tests__` beside the existing SpaceView and list tests.

### 3.6 The Mac (`apps/web/src/app`)

`SpaceView.tsx` (25, 599–625) the same line and taps; the banner above the composer; the Spaces
list's mark; `styles.css`. `Shell.test.tsx` cases.

### 3.7 End to end (`apps/web/e2e/who-a-message-is-for.spec.ts`)

Replace "a loop between them stops at four" with, using `Harness` from `support.ts` (103):
- Two scripted harnesses echo each other with the same words: at the sixth message the warning
  line is visible and nothing is held; the sixth `message.new` carries `exchange.note`.
- They carry on to 48: the banner appears, the sender's ack says `held`, the Spaces row says
  *Paused*. *Let them carry on* → the newest held message reaches its harness as `message.new`
  with `handed: true`, and the banner goes.
- A file with a new sha at message 40 resets: no hold at 48.

### 3.8 Docs

ADR 0097 (amends 0081's point 4; the referee, the two counts, the reset, the stages, blocked is
loud; the constants). ADR 0081's status line notes it. `apps/docs` reference regenerates
(`pnpm gen:protocol`); `reference/http.md` rows for the exchange route and the post's new fields.
`docs/STATUS.md`.

### 3.9 Live, on his word

Fast-forward main; `pnpm build`; back up the DB; `launchctl kickstart -k
gui/$(id -u)/chat.chips.serve`; `pnpm desktop`; `pnpm phone`. No capability to declare: the note
is optional on the wire. Acceptance: the ASCII Art room, a brief to Everyone, the agents run
without a hold, the notes show in Jacobian's and the bridge's logs, the Spaces row and the room
show nothing until 48.

### 3.10 Built

**Built 2 October 2026, 21:15 PDT**, in `.claude/worktrees/agents-together` (branch
`claude/agents-together`). Not live: 4431 runs main's source and restarts on his word.

**What changed from the plan, and why:**
- **Nobody's reading is known to the server.** Decision 7 read `read_state`, and nothing writes it
  (each device keeps how far its person has read). `person_looking` is in the schema and always
  `null`; the push goes to the room's people outside their quiet hours, once each, by the claim
  ledger. Telling who has a room open needs presence the server does not keep.
- **Left for later:** `no_turn` (ADR 0083's fact) and the full `made` list. The reset says what
  was made last (`since.made`, `since.file`).
- **A pause is relative to the person, not the reset.** An agent's new file starts the count
  again but does not lift a pause; only a person acting does, as *It stays until a person acts*.
- **A file repeat is any file already in the room**, not only one the same agent posted since the
  reset: the ASCII Art starter posted again at 11:31 was first posted at 11:01, before the 11:30
  reset, and was the repeat the proposal's replay names.
- **The facts ride `message.new` only.** On `message.overheard` they would tell a harness of a
  turn it does not take.
- **A handed message is numbered as the hand-over** (`message.handed`'s id and seq), so no
  harness's cursor goes back; `message_id` is the held message's own. Delivered to the harness
  itself where it is the member addressed, as before agents.
- **Core's line runs from the person.** The fold keeps two marks per room, `actedSeq` (any
  person act the server counts, by `resetsTheCount`) and `pausedSeq`/`pausedBy`; `exchangeLine`,
  `pausedIn` and `pauseWords` read them with the lines. Words repeat only (core's attachments
  carry no digest).
- **The push's words:** *Chips paused the agents* / *Open the room to let them carry on*, and
  *The agents need a look* / *They have been talking among themselves* (a warning may be a count,
  not a circle). `data` is the room's id.
- **The held line in a context** reads *(held by Chips until a person acts)*.

**Where:**
- Protocol: `exchange.ts` (constants, `PERSON_ACTS`/`WORK_ACTS`, `circleIn`, `repeatOf`,
  `exchangeFactsOf`, `renderExchangeNote`); `address.ts` (`exchange` in place of `chatter`,
  `GUARD` gone); `message.new` `exchange` and `handed`; `exchange.set`, `message.handed`; the
  ack's `held` and `exchange`; the room note's last sentence.
- Server: `store/exchange.ts` (`exchangeOf`, `heldIn`), `application/exchange.ts` (the note on
  delivery), `hand-over-held.ts` (in the gateway's `react`, after every append), `set-exchange.ts`
  and `POST /v1/spaces/:id/exchange` (matrix row), `notify-exchange.ts` (beside notify-push),
  `heldOf` on the ack and the HTTP answer, `MessageView.seq`.
- The fake: `conformance/src/exchange.ts`, the hold, the hand-over, `setExchange`, the note on
  delivery, the handed delivery, `held` on the ack and the HTTP answer.
- Core: `model/exchange.ts`, the two folds, `Space.actedSeq`/`pausedSeq`/`pausedBy`,
  `Line.handed`/`exchange`, `store.setExchange`.
- The Mac: the line under the fold with its taps, `PausedBanner`, the row's *Paused*, styles.
- The phone: `RefereeLine` under the fold, `PausedBanner.tsx`, the row's *Paused* pill, *held* /
  *handed on* beside a held bubble's time.
- End to end: `who-a-message-is-for.spec.ts` — the circle at six with the note and the taps, the
  hold at 49 with the ack, the banner and the row, *Let them carry on* handing it to Pilot.
- Docs: ADR 0097, ADR 0081's status, `reference/http.md`, `connect/websocket.md`, the generated
  reference.

## Phase 4. The room's files, adapter halves

### 4.1 The bridge

`withOverheard` and `heard`: when `event.context.files` (Phase 5) lists files, fetch the current
version of each file a line of this turn names (cap five files, five MB each, `fetchAttachment`)
and send them as `attachments` on `chat.send`, beside the message's own. When OpenClaw's answer
names a file it fetched, post the new version with `replaces` set to the attachment id it
fetched. Tolerant of absence. Tests.

### 4.2 Jacobian

1. Find why the queued task's words and file landed as two messages (the run-less posts of
   10:57–11:03 in the ASCII Art room): `postFiles` (bot.ts 600–620) posts the file with a
   caption after the words; the turn's own path already posts them together
   (`conversation.ts` 584, `replyWithProduced`). Make the queued path do the same.
2. `media.ts`: fetch the current version of a room file the turn names, from `context.files`;
   keep the attachment id beside the file in the Space's `artifacts/` so a re-post carries
   `replaces`.
3. Tests. His restart.

### 4.3 Built

**Built 2 October 2026, 22:40 PDT.** No Chips code. The room's files are ADR 0099: 0096 and 0098
went to other sessions, and the 0098s above were put right in the Phase 5 branch.

**Where things stood:** Jacobian main was still `8b60537` (Phases 1 and 2 uncommitted) and the
bridge had run since 17:42, from before `6e41a85` (not restarted onto Phase 2). So Jacobian's Phase 4
was built in a worktree of its own, `chips-room-files` (branch `claude/chips-room-files` off
`8b60537`), with Phases 1 and 2 applied under it, so that his Phase 2 commit in `chips-referee`
does not take Phase 4's edits to the same files.

**4.2.1, why a queued task's words and its file were two messages (10:57 to 11:03).** The room was
erased at 21:16; the 17:00 backup (`chips.db.bak-20261002-pre-0095`, read with `immutable=1`) has
the posts: four run-less pairs, words then the file with a caption, each pair in one millisecond.
Jacobian's log has the four `user_request` tasks (created 10:53, a queued plan, `deliver` in the
turn that says what it found). The Jacobian running then was started at 08:11 PDT on `e395275`.
The one-message path for a queued turn (`notifyWithProduced` through `sendMessageWithFiles`) reached
main at 08:38 in `269465b`, and ran only from the 17:04 restart. Nothing on today's path splits
them: a Chips turn always has a user, no Space adds channels of its own, and the ref is Chips's. A
test now holds it for the path those tasks took (`answer-with-files-executor.test.ts`: a queued
request's plan replayed, then said, one message).

**One change of shape: `replaces` is a map on the post, not a field on the attachment.** Both
adapters post files by `upload_ids`, and Chips fills each attachment in from what it stored, so a
harness has no attachment to put a field on. A post says
`replaces: {"<upload id>": "<attachment id it was made from>"}` (an upload's id is its attachment's
id). Today's Chips strips a key it does not know (zod's default), so it takes the post and drops the
map. **Phase 5.1.2 becomes:** `message.post` gains `replaces?: Record<id("attachment"),
id("attachment")>`, each key one of the post's `upload_ids` or `attachments`; Chips copies each onto
the stored attachment as `replaces`. The refusal is `stale_file` in the HTTP error body
(`{error: {code: "stale_file", message}}`), its message naming the file
(*ascii-alphabet.html is now v3, by Oc2. Fetch it and redo.*): the adapters leave out the files
whose names the message says, or every file the post sent as a version when it names none.

**Read tolerantly from `context.files`:** `name`, `version`, `attachment_id`, `sha256`, `byte_size`,
`mime_type`, `url`, and `by` as a name or as a participant (`{id, kind, name}`, as a line's `from`).
A file the room has under a name, posted again without `replaces`, is the next version unchecked;
Phase 5 decides whether that stays so.

**Both adapters:**
- A turn is handed the files its words name: the message, Chips's lines for it and the room's
  lines. A name counts whole (`page.html` is not named by `mypage.html`; a path ending in it is).
  Five files at most, of five MB each; what is left out is named, with why.
- A room's line now says what a message sent after what it wrote: `Oc3: Started it (sent
  ascii-alphabet.html)`. Before, a line with words dropped its files, so the 11:31 re-post read as
  words alone. A voice note's line is still its words.
- A post refused `stale_file` is posted again without the stale files, its words saying
  `(ascii-alphabet.html was not posted: …)`; the agent's next turn in the room is told first, as
  Chips's (*Your last answer here sent a file Chips did not take as its next version: …*), and is
  handed the new version, which the line names. Never a turn of its own, as for a hold.

**The bridge** (`2f5fb0e` on its main, from `feat/room-files`): the files go inline on `chat.send`
beside the message's own. A session is handed each version once: the bridge keeps, per session and
room, the version of each name it has (handed, on the message, or posted), and a file the answer
sends back by `MEDIA:` under that name replaces it. `held` became `told`, a list, so a hold and a
refusal can both wait for the next turn. Tests 82 → 90.

**Jacobian:**
- The files are saved where the turn's Space keeps its artifacts, under their own names, so its
  file tools edit them and `deliver` sends them: `ArtifactService.ownerRoot` with
  `bundleArtifactRootResolver` (a Space inside another in its own bundle, J's at the root), from the
  Space manager the channel is bound to; a test seam `artifactsOf`.
- Which version each copy is, is kept in the channel's state by path (`room_files`, the newest 500),
  not in a file beside the copies as 4.2.2 said: a delivered file's path is all a post knows, and a
  state key leaves nothing in the Space's folder. A file a Space posts is remembered the same way,
  so its next change names it.
- Nothing of the Space's is written over. A file under the same name that is neither the current
  version nor an unchanged copy (its own, or an edit of an older version, as after a refusal) is
  kept aside as `<name>.before-v<n>`; a copy changed from the current version is left as it is, and
  the turn is told which.
- Words that join a turn going bring their files with them. `ChipsError` carries Chips's `code` and
  words.
- Checks: `npm run lint` and the vocabulary lint clean; the touched suites (every Chips channel
  suite, interject, answer-with-files, stop-live-turn, the runtime, the executor's files,
  attachment-delivery, one-space conformance) 566 of 567, the old `src/cost/store.ts:181` line.
  New: `room-files.test.ts` 12, `bot.test.ts` 4, the executor 1, a room line 1.
  `task-bubble.test.ts` fails about one run in two on Jacobian main too (it reads the clock).

**His steps:**
1. Jacobian, Phases 1, 2 and 4 as three commits, then main fast-forwarded once:
   `zsh <scratchpad>/jacobian-phases-1-2-4.sh` (session 29794728's scratchpad). It checks that
   main and the three worktrees are at `8b60537`, adds each phase's paths before committing them
   (`git commit -- <paths>` refuses a file git does not know: Phase 1's `interject.test.ts` would
   have stopped the runbook's 1.4 command), stops on anything left over, and was rehearsed in a
   scratch clone: 13, 9 and 10 files. Then he restarts Jacobian.
2. The bridge: `scripts/bridge.sh stop`, then `start live`, onto `2f5fb0e` (Phases 2 and 4).

Until Phase 5 is live, both read nothing new: Chips lists no files and drops `replaces`.

## Phase 5. The room's files in Chips

### 5.1 Protocol

1. `context.ts` `roomContext` gains `files: [{name, version, attachment_id, sha256, byte_size,
   mime_type, by, at, url, url_expires_at}]`, the current version per name, newest first,
   cap 20. `renderContext` adds *Files in this room:* lines (`name · v3 · by · when · url`).
2. `events/harness-to-chips.ts` `message.post` attachments (213): `replaces?: id("attachment")`.
3. A refusal `stale_file` (`frames.ts` refusals, `agent-place.ts`'s pattern): *<name> is now v7,
   by <agent>. Fetch it and redo.*
4. `pnpm gen:protocol`; tests.

### 5.2 Server

1. Read model `roomFiles(workspaceId, spaceId)` over `attachments` (it has `space_id`,
   `filename`, `sha256`, `created_at`, `message_id`): versions are distinct shas per name in
   order; the current one is the newest.
2. `application/room-context.ts` (116): include `files`, signed per harness as `signed()` does
   (session.ts 705–714); the pull route `GET /v1/spaces/:id/context` (routes/spaces.ts 60)
   includes them too.
3. `submit-event.ts`: a post whose attachment carries `replaces` that is not the current version
   of that name in that room is refused `stale_file`.
4. `GET /v1/spaces/:id/files` (routes/spaces.ts): the same list, for people and harnesses in the
   room. Matrix row. `reference/http.md`.
5. Tests: read model, context, the refusal, the route.

### 5.3 The fake and the SDK

`packages/conformance` mirrors `roomFiles` and the refusal; `packages/sdk`'s `renderContext`
prints the files.

### 5.4 Core

`model/spaces.ts`: the room's `files` from its attachments, for Phase 6; `store.ts` reads
`GET /v1/spaces/:id/files` when a room opens.

### 5.5 End to end

Two scripted harnesses: A posts `gallery.html` v1; B reads it from its `message.new`'s
`context.files` URL and posts v2 with `replaces: v1`; A posts a v2 from v1 and is refused
`stale_file`; `GET /v1/spaces/:id/files` says v2 by B.

### 5.6 Docs and live

ADR 0099; `reference/http.md`; STATUS. Live on his word, as 3.9.

### 5.7 Built

**Built 2 October 2026, 23:30 PDT**, in `.claude/worktrees/room-files` (branch `claude/room-files`).
Not live: 4431 runs main's source and restarts on his word. ADR 0099 was free, and the 0098s above
are put right.

**Decided here (ADR 0099, point 5):**
- A same-named file posted without `replaces` is the next version, unchecked: people have no way to
  say what a file was made from, and neither does a harness from before this.
- A `replaces` naming an attachment of another name, of another room, or none Chips has is left
  out, and the file is the next version unchecked. Refusing it would refuse every later post of the
  file by a harness that lost track, and a version of another room is nothing to say to a harness
  that is not there.
- A `replaces` key that is none of the post's files is refused `invalid_event`.

**What changed from the plan, and why:**
- **Versions compare bytes, not ids.** A file whose bytes differ from the version before it is the
  next one, so the same bytes again are no new version and a revert is one. A post is stale when
  neither the bytes it was made from nor the bytes it posts are the current version's, so a re-post
  of the current bytes, or an edit of bytes a revert made current again, is taken.
- **The refusal is asked inside the append** (`fileGate`, beside the one-room rule's `agentGate`),
  so of two posts made at once from one version, the second is refused. The door does the rest
  (`fillMadeFrom`): copies each `replaces` onto its attachment, drops the map, refuses a key the
  post does not carry, leaves out a version of another name or room.
- **`stale_file` is an error code of its own**, `409`, on the HTTP envelope and the socket's `error`
  frame, as the adapters read it. The store's refusal keeps the file's name as written (not
  capitalised).
- **Read from the `attachments` projection joined to `messages`** (seq, author, taken back), not a
  new table: a rebuild gives the same versions. `artifact.create`'s file counts, as its row is
  there.
- **The list rides `context`, so a harness that asked for no lines gets none with a message**; it
  reads `GET /v1/spaces/:id/files`. The catch-up an agent gets as it joins a room carries the list
  too. The pull route's list is as of now; a message's is as of it, its own files included (the
  bridge counts on that: a file on the message is the session's with it).
- **The route lists up to 200** (`ROOM_FILES_CEILING`), the context 20 (`ROOM_FILES_IN_CONTEXT`).
  For a harness each has a `url` for its token (`harnessGrant`, shared with the socket); a person
  fetches by id.
- **Core reads the route on demand, not as a room opens.** `store.roomFiles(spaceId)`, as
  `agentStays` is, and `filesIn(space)` over the lines a device holds; nothing calls either until
  Phase 6 draws them, so no request is made for a list nobody shows. Core's attachments now carry
  `sha256` and `replaces`.
- **The SDK's `post` takes `replaces`**, and its `RoomFile` type is exported.

**Where:**
- Protocol: `room-files.ts` (`roomFile`, `versionsOf`, `currentFiles`, `staleVersion`,
  `staleRefusal`, `staleWords`, `renderRoomFiles`, the constants); `context.files`;
  `renderContext` prints the files; `message.post.replaces`; `attachment.replaces`; `stale_file` in
  `errorCode`.
- Server: `store/room-files.ts` (`postedFilesIn`, `attachmentFact`, `fileGate`),
  `application/room-files.ts` (`roomFilesFor`, `fillMadeFrom`), the context and catch-up
  (`room-context.ts`, `session.ts`), `GET /v1/spaces/:id/files` and the context route's URLs
  (`routes/spaces.ts`), the matrix row, `harnessGrant` (`signing.ts`).
- The fake: `conformance/src/room-files.ts`, the context and catch-up, the files route, the
  refusal at the door.
- Core: `model/files.ts` (`filesIn`), `store.roomFiles`, attachments' `sha256` and `replaces`.
- End to end: `the-room-files.spec.ts`. Scout posts `gallery.html` v1 for Painter. Painter's turn
  lists it with a URL it fetches, and Painter posts v2 made from v1. Scout's change made from v1 is
  refused `409 stale_file`, *gallery.html is now v2, by Painter. Fetch it and redo.*, and the room
  does not show it. The files route says v2, by Painter.
- Docs: ADR 0099, `reference/http.md` (the route, the refusal, `409 stale_file`),
  `connect/websocket.md` (*The room's files*), the generated reference.

## Phase 6. Files for people

The Mac's room panel gets a *Files* section and the phone's room settings a *Files* row: the
current version per name, newest first, versions behind a tap, opened in the viewer. After
Phase 5 has been live a while.

### 6.1 Built

**Built 3 October 2026**, in `.claude/worktrees/room-files-ui` (branch `claude/room-files-ui`), as
[ADR 0100](../decisions/0100-people-see-a-rooms-files-and-their-versions.md). Started on his word
("just proceed with phase 6") before the Phase 5 acceptance was run. Mocks of three options (a page
per file, B: a tap opens the newest and `v3 ⌄` unfolds the versions, the versions in the viewer)
were published as a private Artifact; he picked B ("build B").

**Decided here (ADR 0100):**
- One name's versions are `GET /v1/spaces/:id/files?name=`, newest first, each with `replaces`,
  behind the list's door and a matrix row. Every room file on the wire also says its `message_id`
  and a photo's or a video's size and length, so it opens in the viewer.
- Files reads the route as it shows and again when a line carrying a file lands or is taken back
  (core's `fileLinesKey`); nothing is merged on the device. `filesIn` is gone.
- A voice note and a photo or video a picker named (`image.png`, `IMG_0233.png`) are left out of
  Files (core's `inFiles`), and stay in the room, the viewer and the agents' context.
- The Mac gets a page view, from Files and from a page's card in the room: a sandboxed frame given
  the document, whose scripts the app's policy keeps off.

**What changed from the plan, and why:**
- **On the phone, the page and the viewer open inside the sheet** (`DeckViewer`, a deck handed over
  whole): iOS presents a modal only from the one that holds it.
- **A photo opens on a deck of its versions,** not the room's twenty messages: its message may be
  older than any the device holds.
- **The Mac reads a page's words through the file service** (`page`), since the app's policy
  refuses a `fetch` of its own object URL; the e2e caught it. The spec's pages are now documents:
  the server sniffs a bare fragment as text.

**Where:**
- Protocol: `roomFile` gains `message_id`, `width`, `height`, `duration_ms`, `replaces`;
  `versionsNamed`. Server: `postedFiles(…, {upto, name})`, `madeFrom`, `fileVersionsFor`, the
  route's `?name=`, the matrix row. The fake: the same fields and `?name=`.
- Core: `store.fileVersions`, `inFiles`, `fileLinesKey`, `postedBy`, `deckOfVersions`; `isPage`
  and `MAX_PAGE_BYTES` moved in from the phone.
- The phone: `spaces/RoomFiles.tsx` (the page, `useRoomFiles`), the row in `RoomSheet.tsx`,
  `PageSheet`'s version line, `DeckViewer` and `useDeck`'s given deck. The Mac:
  `RoomFiles.tsx`, `PageView.tsx`, `Members.tsx`, the file card, the viewer's `openDeck`.
- End to end: `the-room-files.spec.ts` opens the members panel's Files: gallery.html by Painter,
  v2 current and v1 behind a tap, each opening in the page view on its own words.

## Acceptance for the whole

Run the ASCII Art brief again, three agents, from a fresh room: no hold before 48; the agents'
turns carry the facts and one turn each per message burst; one file crosses from the mini to the
container by its room-file link and comes back as v2 and v3; K–O lands; the finished page is
attached for Arjun.
