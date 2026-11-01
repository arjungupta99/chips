# Reminders, schedules and "tell me when": the plan

13 October 2026. ADR 0157 (the harness keeps the clock and answers where it was asked; the note
gives the person's clock) and ADR 0158 (an agent's @ pushes the person, sealed to their phone).

## 1. What he asked, and his rulings

"Do schedules work with Chips? If I tell my agents to remind me about an event at 10am. Or message
me when XYZ task completes. Perform a certain task at 2 o'clock or after 50 minutes." Then:
"Proceed with plan and execution."

Rulings, 13 October 2026:

1. **Which messages push:** "When an agent @s you". Ordinary replies don't push.
2. **What the lock screen shows:** "Sealed text". The words travel encrypted to a key only the
   phone holds, and a notification extension opens them.

## 2. The shape

One mechanism. **The harness keeps the clock. When the clock fires, the harness speaks in the
room it was asked in, as the agent that was asked, and @s the person it's for.**

- Chips already takes such posts and runs (`message.post` needs no run; `run.started` needs no
  person). Its own parts are two:
  - telling each turn the person's clock;
  - pushing a person an agent @s, sealed.
- Stories (a) "remind me" and (c) "do X at 2pm / in 50 minutes" are the harness's schedulers
  answering in the room.
- Story (b) "tell me when it's done" comes in two kinds:
  - a background job the harness runs itself (Jacobian's hand-offs, OpenClaw's sub-agents), which
    already answers in its room;
  - a check on a schedule ("every 10 minutes, see whether X is done; tell me and stop when it
    is"), which is (c).

Cost, against what he gets:
- **Repos:** Chips (protocol note, server push, a migration, the phone's extension), Jacobian
  (reminder and schedule delivery, time parsing) and the bridge (automation results).
- **Restarts:** 4431, Jacobian and the bridge each restart once.
- **Builds:** the phone once, for the extension.
- **What he gets:** "remind me at 10am" in any room buzzes his lock screen at 10 with the words,
  and the reminder sits in the room where he asked.

## 3. Phases

Each phase ends green and committed: Chips on `claude/schedules-chips-compatibility-af1df4` and
fast-forwarded to main; Jacobian and the bridge in their own worktrees. Going live comes after
Phase 5 and covers all three repos at once (§4). Pushing is his word.

### Phase 1: Chips, the person's clock in the note (ADR 0157)

- **Protocol** (`packages/protocol/src/room-note.ts`):
  - `roomMember.time_zone` (an IANA zone, a person only, optional).
  - `NoteMember.timeZone`.
  - `renderRoomNote` gains a clock line after "In this room", from the members' zones at the note's
    `at`: "Arjun's time now: 9:12 am, Tuesday 13 October 2026 (2026-10-13T09:12-07:00,
  America/Los_Angeles)."
    Several people go in one line, each by name.
  - `roomNoteFor` takes the instant (`at`) the clock is read at.
- **Server** (`interfaces/ws/session.ts` `roomOf`): each person member's zone is their newest
  push registration's. It is read through the push registry and needs no migration.
- **Conformance fake and SDK:** the fake lists no zones. The SDK's `renderRoomNote` words the line
  again from `members`.
- **Docs:**
  - `apps/docs` gets "Speaking later", a guide for harnesses: how to post or run on one's own, @
    the person, write times with the offset, and that `NO_REPLY` says nothing.
  - The room note's page names the clock.
- **Tests:**
  - the note's words: one person, two people, a zone with half-hour offsets, the date across a
    DST change, and no zone;
  - the session: the zone comes from the newest phone, and there is none without a phone.

### Phase 2: Jacobian, reminders and schedules answer where they were asked (ADR 0157)

Built in a Jacobian worktree; nothing on Jacobian's main until going live.

1. **Who asked, and where.** `create_reminder`, `create_watch` and `create_schedule` record the
   asker from the `ToolExecutionContext` (`userId`, `sessionId`, `spaceId`), not
   `config.telegram.allowed_users[0]`. Fall back to the first owner only when there is no context
   user (YAML tasks).
2. **Where a reminder lands:**
   - asked in a Chips room, it is posted in the asking Space's room as its agent, and @s the
     person by the handle Chips's note gave ("@Arjun ⏰ Reminder: call the dentist");
   - asked on Telegram, it goes to that chat, as today.
3. **`worker_schedule` asked by a person** records the asker (user and session). When it fires:
   - the turn is a run in the Space's Chips room (the follow-up's road: `openFollowUp`), so the
     person sees it working;
   - its answer is posted on that run and @s the asker;
   - `NO_REPLY` posts nothing.

   Schedules no person made (proactive prompts, the dashboard) stay as they are.
4. **Times:**
   - the parser takes 12-hour times ("10am", "2:30 pm", "tomorrow at 9am") and ISO 8601 with an
     offset;
   - `create_schedule` takes an `at` (ISO with offset) as well as a delay;
   - a time with no zone is read in the machine's zone, as now.

   Each tool's description says to take the date and zone from Chips's note and write the offset.
5. **Missed while down.** A reminder that fires late says when it was due ("was due 10:00").
6. **Tests:**
   - the touched suites (§5 of `testing/jacobian.md`): tools, parser, scheduler, executor
     delivery, and the Chips adapter;
   - new `FROZEN (schedules)` conformance vectors, using the real executor and `ChipsBot`;
   - tsc and both lints.

### Phase 3: the bridge, OpenClaw's automations answer in the room (ADR 0157)

Built in a bridge worktree (`feat/automations`).

1. **`current` jobs.** OpenClaw commits a `current` job's result to the creating conversation as
   a `session.message` with automation provenance; for a room that is the room's session key. The
   bridge posts it in that room as that session's agent, with idempotency
   `openclaw-automation:<job>:<run>`. It @s the person the job was made for when the text
   @s nobody. A silent result posts nothing.
2. **Isolated jobs made from a room** (`agent:<a>:cron:<job>[:run:…]`). When the agent's turn in
   a room creates the job, the bridge records job → room and asker. It does this from the creating
   session the job carries, or else from the tool call it sees in that room's turn. It then posts
   the run's final answer there, and the run's approvals get cards there.
3. **System-event reminders** (`sessionTarget: main`). An agent's home (`agent:<a>:main`) maps to
   the agent's one room. This extends what the bridge does for `main` today, so a wake whose turn
   says `heartbeat_respond(notify:true)` or answers is posted there.
4. **The turn's preamble** (where the files line is) adds one sentence:
   > To remind someone or to do something later, use automations with `sessionTarget: "current"`:
   > what it says is posted in this room. Write times with the offset Chips's note gives; an `at`
   > without one is read as UTC.
5. **Verify against the real OpenClaw** on a scratch Chips (4436), with a scratch bridge and a
   two-minute job. Record each event shape seen.
6. **Tests:** stand-in tests for each row, plus `npm run typecheck`.

### Phase 4: Chips, an agent's @ pushes the person, sealed (ADR 0158)

- **Migration 0046:** `push_tokens.seal_key` (TEXT, null), with schema and registry
  (`PushToken.sealKey`).
- **`PUT /v1/me/push-token`** takes an optional `seal_key`: base64 of exactly 32 bytes, otherwise
  422. It is never returned.
- **`server/src/domain/seal.ts`:** AES-256-GCM, a 12-byte random nonce, and
  `base64(nonce ‖ ciphertext ‖ tag)`. Its round trip is tested against Node's crypto. The Swift
  side opens the same layout (`AES.GCM.SealedBox(combined:)`).
- **`notify-mention.ts`**, wired beside `notifyExchange`, runs after a `message.post` from an
  agent kind:
  - Who: the persons among `mentions` who are members of the room and not removed.
  - Skipped: quiet hours (no break-through), a harness word other than `all`, and phones that
    lose the claim `mention:<message id>`.
  - Sent: the fixed title "A message for you" and body "Open Chips to read it."; `data`
    `{space_id, message_id, sealed?}`; `mutableContent: true`; priority high; a TTL of 6 hours.
  - The sealed `title` is "<agent> · <room>", and the `body` is the text with Markdown stripped,
    to 240 characters.
- **`PushMessage.mutableContent`**, mapped by the Expo sender (`mutableContent`).
- **Tests:**
  - seal round trip;
  - recipients: @ yes, no @ no, a removed person, quiet hours, `none`;
  - the route's `seal_key` validation;
  - the migration.

### Phase 5: the phone, its key and its notification extension (ADR 0158)

- **A native module, `apps/mobile/modules/push-seal` (Swift):**
  - `sealKey()` makes 32 random bytes once and keeps them in the keychain, under access group
    `$(AppIdentifierPrefix)chat.chips.app.shared` with a fixed service and account;
  - it returns them as base64;
  - Android returns null.
- **`register.ts`** sends `seal_key` with the token.
- **A config plugin, `apps/mobile/plugins/with-push-seal.js`:**
  - adds the notification service extension target `ChipsNotifications`
    (`NotificationService.swift`);
  - gives both the app and the extension the keychain access group;
  - sets the extension's Info.plist, bundle id `chat.chips.app.notifications` and deployment
    target.

  `NotificationService.swift` reads `userInfo["body"]["sealed"]` (Expo puts `data` under `body`),
  opens it with CryptoKit and sets title and body. It leaves the fixed words when it can't.
- **Foreground:** Chips in front shows no banner, as for every push (`silenceInForeground`).
- **A tap** opens the room (`space_id`), as the exchange's pushes do.
- **Tests:**
  - Jest for `register.ts` sending the key;
  - the plugin's output checked by a prebuild into a scratch directory;
  - on the simulator, `xcrun simctl push` with a sealed payload shows the opened words.

## 4. Going live (after Phase 5)

1. **Check the peers.** Run `ListAgents`, the reflogs of Chips main, Jacobian main and the bridge
   main, and `git log origin/main..main`. Message any busy session before each restart.
2. **Chips:**
   - Fast-forward main.
   - Back up `.chips/chips.db`, then `launchctl kickstart -k gui/$(id -u)/chat.chips.serve`
     (migration 0046). Check the pid and port.
   - `pnpm web:build`.
   - `pnpm phone` (the phone needs a prebuild for the new target: check `tools/phone`). He turns on
     Notify me on this phone again if the token was dropped.
   - `pnpm desktop`.
3. **Jacobian:** commit, fast-forward, `bin/jacobian restart --check`, and verify pid,
   `chips=healthy` and its socket in 4431's log.
4. **The bridge:** commit, fast-forward, `scripts/bridge.sh stop && scripts/bridge.sh start live
   >/dev/null 2>&1`, and verify.
5. **Live check:** the scenarios in §5. Then STATUS and memory. Pushing is his word.

## 5. Acceptance (`testing/scenarios/schedules/reminders-and-schedules.md`)

- **S1.** In a Jacobian room: "remind me in 3 minutes to stretch". Three minutes later the room
  has "@Arjun ⏰ Reminder: stretch" from that room's agent, and the locked phone shows it sealed
  and opened.
- **S2.** The same in an OpenClaw room. Then "remind me at <a clock time 3 minutes on>", to prove
  the zone.
- **S3.** "In 2 minutes, look up today's weather and tell me", in both harnesses: a run appears
  in the room at the time and its answer @s him.
- **S4.** "Check every 2 minutes whether the file /tmp/s4-done exists; tell me and stop when it
  does": a quiet run, or none, until the file appears, then one @ and the schedule gone.
- **S5.** With Chips in front on the phone, S1 shows no banner.
- **S6.** In quiet hours, S1 posts in the room and sends no push.

## 6. Left out (the ADRs say why)

- A list of schedules in Chips.
- Chips waking a harness.
- A zone for someone with no phone.
- A person's @ pushing.
- A mentions switch.
- Browser and Mac notices for mentions.
- Sealed text on Android.
