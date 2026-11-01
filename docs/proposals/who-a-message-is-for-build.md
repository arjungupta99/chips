# Who a message is for: the build (ADR 0081)

**Arjun's word, 27 September 2026:** "go with A2, build it."
- **A** is the capsule above the field.
- **A2** draws the lane's route over a message only where its address changed.

**Read first:**
- `docs/decisions/0081-chips-says-who-a-message-is-for-and-only-they-take-a-turn.md`, the decision.
- `docs/proposals/who-a-message-is-for-mocks.html`, the look and the motion. Open it in a browser. The A2 phone and the Hand-over phone are what we build.

This runbook stands on its own. Line numbers are from main 5f4ffe5a; confirm each one before editing.

## 0. Ground rules

- **Where to work.** Use the worktree `.claude/worktrees/who-a-message-is-for` (branch `claude/who-a-message-is-for`). Bring it up to main first with `git merge --ff-only main`. Main is linear, so fast-forward only. Pushing is his.
- **Commits.** Sign with `-s`. End the message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Make one commit per part below, so each can be read alone.
- **Checks.**
  - `pnpm check` runs lint, typecheck, unit tests and mobile Jest, and stops at the first failure.
  - `pnpm gen:protocol` must run after any schema change; `check:protocol` is inside lint.
  - The desktop e2e runs on 5199, never alongside `pnpm check` and never alongside `pnpm mobile:e2e`:
    `cd apps/web && CHIPS_E2E_WEB_PORT=5199 CHIPS_E2E_SERVER_PORT=4452 CHIPS_E2E_RELAY_PORT=4453 CHIPS_E2E_BUILD_PORT=5198 npx playwright test <specs> --project=chromium`
- **Chips depends on no harness.** `tools/guardrails/no-harness-named.test.ts` fails on *Jacobian* or *OpenClaw* in shipped source. Build copy like the guard's line from `nameOf`. "Everyone", "No agent" and "by @" are fine.
- **Live things are his.**
  - 4431 is the launch agent `chat.chips.serve`, and it runs the main checkout's source. Restart it only on his word.
  - Rebuilding the desktop and his phone also waits for his word.
  - Nothing is committed in `~/Work/Jacobian` without his word, and he restarts Jacobian himself.
  - Kill processes by PID only. Never touch other worktrees, Storefront or quotes.
- **Running now:**
  - 4431 (the live server)
  - the bridge, live
  - the scratch server on 4436
  - vite on 5186
  - the container `chips-openclaw-gateway-1`

  Check PIDs with `lsof` before touching anything.
- **Two decisions are made here, so the build doesn't stall on them:**
  - The resolver is one pure function in `@chipschat/protocol`, shared by the server and the conformance fake, the way `mentions.ts` already is.
  - The capsule's menu is a small anchored glass menu, as in the mock. It is not a bottom sheet.

## 1. Protocol (`packages/protocol`)

1. **`message.post`** (`src/events/harness-to-chips.ts` 196–228) gains three fields:
   - `to`: optional; `z.union([z.literal("all"), z.array(id("harness")).min(1).max(64)])`. The sender's choice, made without an @.
   - `addressed_to`: optional; an array of harness ids, max 64. Filled by Chips; a value the sender writes is replaced, as `mentions` is.
   - `held`: optional; `z.literal(true)`. Filled by Chips.
2. **`message.new`** (`src/events/chips-to-harness.ts` 81–109) gains `addressed_to`.
3. **`message.overheard`** is a new event in chips-to-harness.ts:
   - `direction: "chips_to_harness"`, `requiresRun: false`.
   - Its payload is `message.new`'s plus `held`. Build it from one shared object so the two can't drift.
   - Its summary is at least 20 characters, for example "Something said in a room this harness is in, for somebody else: context, not a turn."
   - Add it to `CHIPS_TO_HARNESS` (432–447) and to the expected list in `src/events/catalogue.test.ts` (51–66).
   - Add the fixture `fixtures/message.overheard.json`; catalogue.test requires one per event (102–108).
4. **`@all`**, in `src/mentions.ts` (handles 24–66):
   - Add `mentionsEveryone(text): boolean` for the handle `all`.
   - `handlesOf` must never give a participant the handle `all`.
   - Leave `resolveMentions` as it is.
   - Also draw `@all` as a mention chip: `apps/web/src/app/Markdown.tsx` 31–40 and 82–90, and the phone's `Markdown.tsx` ~147 via core `markdown.ts`.
5. **`src/address.ts`** (new, exported from the index) holds `resolveAddress(input)`, the ADR's point 1 as a pure function.
   - **Input:** `{ senderKind, mentioned: string[], everyone: boolean, to?: string[] | "all", replyAuthor?: {id, kind}, harnesses: string[], last?: string[], chatter: number }`.
     - `harnesses` means the room's harness members that have not been removed.
     - `last` is what the sender's previous message in the room was addressed to.
     - `chatter` is the number of harness-to-harness messages since a person last spoke.
   - **Output:** `{ addressed_to: string[], held?: true }`.
   - **Rules for a person:**
     1. An @ decides: the harnesses among the mentions, or all of them for `everyone`. It gives none when the text names only people.
     2. Otherwise `to`, kept to the members.
     3. Otherwise the reply's author, when that is a harness.
     4. Otherwise the only harness.
     5. Otherwise `last`, or all harnesses when there is no `last`.
   - **Rules for a harness:** the @ harnesses, or `to`, or the reply's author when that is a harness; otherwise `[]`.
     - Adapters answer an agent with `to` (sections 12 and 13), so an answer reaches its asker even when the model writes no @.
   - **The guard:** a harness message that addresses harnesses while `chatter >= 4` becomes `{ addressed_to: [], held: true }`. Export `GUARD = 4`.
   - **Its own test** (`src/address.test.ts`): every rule and its order, `to` naming non-members, "all", a person-only @, a reply to a person, the guard at exactly 4 and at 5, and a person's message never held.
6. Run `pnpm gen:protocol`, which regenerates the generated types, the schema and the docs reference pages. Commit: `feat(protocol): who a message is for (ADR 0081)`.

## 2. Server (`server/`)

1. **Migration `0030-message-address.ts`** (in `src/infrastructure/db/migrations/`; register it in `migrator.ts` ~38 and ~81):
   - Add the columns `messages.addressed_to TEXT NULL` (a JSON array) and `messages.held INTEGER NULL`.
   - Model it on `0027-asked-of.ts`: "a rebuild fills it from the log".
   - Update `schema.ts` `MessagesTable` (173–194), and have `domain/projection.ts`'s message.post case (544–552, helper `message()` 204–221) write both.
2. **Read models.** The port is `application/ports/read-models.ts`; the implementation is `infrastructure/store/read-models.ts`.
   - `lastAddressed(ws, space, actorId): string[] | undefined`: the newest message by that actor in that space whose `addressed_to` is not null. Use the index `messages(workspace_id, space_id, seq)`.
   - `harnessChatter(ws, space): number`: walk back by seq from the newest message, counting harness-authored messages that are addressed to harnesses or held. Stop at the first person's message.
3. **Ingest** (`application/use-cases/submit-event.ts`):
   - Add `fillAddress` right after `fillMentions` (call ~229, defined 465–483). It runs for every message.post that has a space, since rules 3–5 hold even without handles.
   - It gathers the harness members from `membersOf` (port 121–134: `kind`, `removed`), the reply's author from `readModels.message` (port 191–210), `lastAddressed` and `harnessChatter`. Then it calls `resolveAddress` and writes `addressed_to` and `held`.
   - Delete any `addressed_to` or `held` the sender wrote, and keep `to` as sent.
   - Add `message.overheard` to `DELIVERY_ONLY_EVENTS` (93–98).
   - `/v1/dev/messages` (`interfaces/http/routes/dev.ts` ~82) bypasses the door. Leave it; its messages count as old ones.
4. **Delivery** (`interfaces/ws/session.ts`):
   - In `asDelivered` (411–431), a message.post to a harness that did not send it is decided per recipient:
     - no `addressed_to` (an old message), or one that includes the recipient → `asMessageNew` (444–470), now carrying `addressed_to`
     - otherwise → the same body with `type: "message.overheard"`, plus `held`
   - Replace `harnessesMentioned` (49–53) with `addressedIn(event)`: `addressed_to` when present, else the harnesses mentioned (old messages). Use it in `liveRunFor` (524–533) and `receiptToHarness` (542–560).
   - A harness that overheard a message gets no receipt.
5. **HTTP catch-up** (`routes/events.ts` 132–157) returns the logged payloads, which now carry `addressed_to`. Nothing changes in the code; the docs (section 7) say how to read it.
6. **Tests:**
   - `submit-event.test.ts`, near 837–858 ("what Chips fills in for a room"): each rule end to end, the guard, and `to` from a person.
   - `session.test.ts`, near 670–748 (`seatLedger`, M3.3): new against overheard per recipient; an old message is new to all; held reaches others as overheard; receipts follow `addressed_to`.
   - Update the M3.3 tests that assumed every harness hears `message.new`, and `harnesses.test.ts` ~889.
7. Commit: `feat(server): Chips says who a message is for (ADR 0081)`.

## 3. SDK and conformance

1. **`packages/sdk-ts/src/connect.ts`:**
   - Remove the `hearHarnesses` option (38–44) and `overheard()` (529–536, called at 519).
   - Add `message.overheard` to `named` (623–636) and to `ChipsEvents` (`src/events.ts` 33–56).
   - `routeToRuns` (611–621) must not feed an overheard message to a run's `message` (`run.ts` 226–249).
   - Rewrite `connect.test.ts` ~327–358 for the new rule. Update `apps/docs/.../connect/sdk.md` 56–59.
2. **`packages/conformance/src`:**
   - The fake's door (`workspace.ts` `submit`/`take` 444–487) must fill `mentions` (it never did), `addressed_to` and `held` through the same `resolveMentions` and `resolveAddress`.
   - Members are `Map<id, Role>` (~105, ~1117). Get their kind from the id prefix or the directory the fake keeps.
   - Delivery (`fake-chips.ts` `asDelivered` 397–403 and `asMessageNew` 405–430) splits new from overheard the same way.
   - Tests: `fake-chips.test.ts` ~461 and `scenario.test.ts` ~40.
3. Commit: `feat(sdk,conformance): message.overheard; the SDK's filter goes (ADR 0081)`.

## 4. Core (`packages/core`)

1. **`Line`** (`model/types.ts` 274–337): add `addressedTo?: readonly string[]` and `held?: true`. Read them in `textLine` (`model/lines.ts` 78–98, beside `mentions` at 82/96).
2. **Sending.**
   - `SendMessageInput` (`store.ts` 108–118) gets `to?: readonly string[] | "all"`, and `store.send` (1110–1133) puts it on the event.
   - `act()` (`act.ts` 52–72) passes a new `ActContext.to` through.
3. **Readers** (`model/readers.ts`, exported from `model/index.ts` and `src/index.ts`):
   - `harnessesIn(space, directory)`: members that are harnesses (`participantKind`) and not `isRemoved`.
   - `nextAddress(space, directory, selfId, lines)`: the capsule's default. The addressees of your last line in the room that has `addressedTo`, kept to the current harnesses; otherwise every harness. It returns ids, and a set equal to every harness in the room shows as "Everyone".
   - `draftAddress(text, space, directory)`: the override while typing. `undefined` when there is no @, `[]` for "No agent", the ids, or every harness for `@all`.
   - `routeOf(lines, index, directory, space)`:
     - It gives `{ from, to }` for a person's text line with `addressedTo` in a room with more than one harness, when that differs as a set from the same author's previous line with `addressedTo`, or when there is no previous one.
     - Otherwise it gives `undefined`. That is A2.
   - `betweenHarnesses` (122–126) reads `addressedTo` (non-empty and all harnesses) or `held`, and falls back to `mentions` for lines without `addressedTo`.
   - `guardLine(lines, i, directory)`: the words for the margin line under the first held line of a run, built from `nameOf`, for example "{A} and {B} have sent each other 4 messages. They'll pick up when you say something."
4. **Tests:** `src/model.test.ts`, near the group space (M3.3) at ~1507 and `betweenHarnesses` at ~1700, cover every reader, including A2's "same address, no route" and old lines without `addressedTo`.
5. Commit: `feat(core): who a message is for, in the model (ADR 0081)`.

## 5. Desktop (`apps/web`, `packages/ui`)

1. **The route.**
   - Factor the task card's trail out of `packages/ui/src/components/task/task.tsx` (63–80: `ol.ui-task__trail`, `span.ui-task__arrow`, `Avatar size="xs"`, `trailLabel` 43; CSS `task.css` 15–40) into `components/trail/`.
   - The new trail takes a grouped last hop, several faces overlapped, for Everyone. `TaskCard` then uses it.
   - In `SpaceView.tsx` `MessageRowBody` (1352–; `.msg-body` ~1389), draw the trail at the top of the body when `routeOf` says so. Your own messages right-aligned, others after the face.
2. **The capsule and its menu.**
   - Place it in SpaceView between `SessionPicker` (~356) and `<Composer>` (384–407), only when `harnessesIn(space) > 1`. It is a button with an arrow, the face or faces, the name, and a chevron.
   - The menu is a listbox anchored above it: each harness, then Everyone. Use arrow keys, Enter and Escape.
   - The draft is at SpaceView ~183. Show `draftAddress` (with "by @") over `nextAddress`. `send()` (242–248) → `props.onSend` → Shell `carryOut` → `act()` carries `to`: the menu's pick while no @ overrides.
3. **The fold.**
   - `rowsOf` (546–559) and `Chatter` (569–596) read `addressedTo` or `held`.
   - The header becomes the trail's faces with ⇄ (A ⇄ B), the count, and the latest line, open on a click. Keep `data-testid="chatter"`.
4. **The guard's line** is a `MarginLine` (1328–1350)-style `.sys` under the fold.
5. **Styles** go in `apps/web/src/styles.css` (near `.conv-notice` 644 and `.chatter` 1773–1792) and `packages/ui` css.
6. **Tests:** `apps/web/src/app/Shell.test.tsx`, inside "a group space (M3.3)" (~2542; `group()` 2550, `WIDER` 2543):
   - the capsule shows only with two harnesses
   - its default, the menu pick, "by @", and `to` in `store.sent`
   - a route only where the address changes
   - the fold header
   - the guard line

   Also `packages/ui` trail tests (from `task.test.tsx`) and `composer.test.tsx` if the composer changes.
7. Commit: `feat(web): the capsule, the route and the fold (ADR 0081)`.

## 6. Phone (`apps/mobile/src`)

Read memory `chips-phone-testing` and ADRs 0071–0075 first. The rules that bind here:
- Motion is transforms, opacity and colour only.
- One clock.
- Arrivals happen on the cell.
- No layout animation of zero length.

1. **The capsule.** Add `spaces/AddressCapsule.tsx`.
   - Mount it in `Composer.tsx` as a child of the bar (395–411), between the staged strip (419–441) and the row (442–531), with `alignSelf: "flex-start"`.
   - It is a glass `Capsule` (`ui/Glass.tsx` 157–216), 34 tall: "→", the face or faces at 20, the name, and a chevron-down.
     - Add `xs: 20` to `Avatar` SIZES (`ui/Avatar.tsx` 38).
     - Add a `down` glyph to `ui/icons.ts`; there is none today.
   - It shows only when `harnessesIn(space) > 1`.
   - The Foot's `onLayout` (SpaceView ~781) already makes room for it in the list.
2. **The menu.** Add a small anchored menu, `spaces/AddressMenu.tsx`: a glass `Capsule`, 236 wide, radius 22, placed above the capsule.
   - It scales and fades in on a transform (`Coming`/`Leaving`, RoomMotion 537–590).
   - Rows: each harness, then Everyone ("Both answer" or "All answer" under it), with a check on the current one. Rows are at least 44 tall.
   - Tapping outside closes it.
3. **Sending.** `send` (340–371) → `act(…)` gets `to`: the menu's pick while no @ overrides.
   - The draft is the module `drafts` Map (~103). Recompute `draftAddress` on each `type` (373–380); the "by @" state is derived, not stored.
   - `placeholderOf` (279–282) stays as it is.
4. **The route over the bubble.**
   - Export `Trail` and `Hop` from `LaneChain.tsx` (122–146, 65–70), and let the last hop be a group of faces overlapped by −4.
   - In `Line.tsx`, a message line with `routeOf(...)` gets the chain over the bubble, as `Task` does (117–154; `chain`, `chainMine`, `chainPastFace` 636–639).
   - Break the run at a routed line in `groupLines` (`spaces/spaces.ts` 137–157), so the route never sits in the 2pt grouped gap.
5. **The route's flight** rides the send's flight (`SendFlight.tsx`), on the model of the photos:
   - Add `route?: Rect` to `Launch` (`sendLanding.ts` 55–63), measured in `launchOf` (Composer 256–276) from the capsule's arrow and face with `measureInWindow`.
   - Give it a copy that is stepped in the same frame callback as the words, the way `PictureCopy` is (481–530, `useCopy` 192–208). It scales from 20/28 to 1 on the UP spring and lands on a watch over the route's own view, like `BubbleWatch`.
   - Hold the route's opacity until it lands, as the bubble's `held` is (Line ~500/646).
   - Your face in the route fades in after it (`Coming`).
6. **The fold.**
   - Add `FoldRow` to `Row` (`spaces/spaces.ts` 104–107), keyed `fold:<firstLineId>`. It is built in SpaceView's `drawn` from `betweenHarnesses` runs, like the desktop's `rowsOf`.
   - Four places assume `.line` and need updating: `useArrivals` (~960), `heldBack` (sendLanding 159–165), `Flown`'s `drawn.find` (~453), and `drawn.map(each => each.line)` (~208, ~430).
   - The header is the faces with ⇄, the count, and the latest line on one line. A tap opens it; the lines inside are ordinary `Line`s.
7. **The guard's line** is a margin line (Line.tsx `styles.margin`/`marginWords` 657–658) under the fold.
8. **Tests.**
   - Jest: `spaces/SpaceView.test.tsx`, with a two-harness room like ~740/935 (`members: ["per_arjun","har_scout","har_tree"]`): the capsule, the menu, "by @", `to` sent, the route only on a change, the fold, and the guard line.
   - Jest: `Composer.test.tsx` (the `composer()` helper at 99–127) and the `launchOf` route rect.
   - Pure helpers go in `*.vitest.ts`.
9. **Walk it on a simulator** against a scratch `mobile:dev` server, never the live one; the recipes are in memory `chips-phone-testing`.
   - Film a send with a changed address and one without, the menu, and the fold.
   - Say plainly what has not been walked on a device.
10. Commit: `feat(mobile): the capsule, the route and the fold (ADR 0081)`.

## 7. Docs (`apps/docs/src/content/docs`)

- `concepts/space.md` 58–76: "Mentions address a harness" becomes the rules; the fold section covers the new header and the guard.
- `concepts/message.md` 28–33.
- `connect/websocket.md` 95–110, "What a harness hears": new against overheard, and the guard.
- `connect/custom.md` 70–102: add rows for `addressed_to`, `message.overheard` and `to` to the mapping table (93–100). A harness reading `GET /v1/events` takes a turn only where `addressed_to` holds it, or where it is absent (an old message). Answer an agent with `to`.
- `connect/sdk.md` 56–59, and `connect/index.md` ~60.
- `pnpm docs:check` and `pnpm --filter @chipschat/docs build`.
- Commit: `docs: who a message is for (ADR 0081)`.

## 8. End to end

- Add `apps/web/e2e/addressing.spec.ts`, on the model of `group.spec.ts` (23–130: Dana, Ledger by `registerSpecialist`, Scout, and the group made through Create new space → No one plus the Members panel). Harnesses are test-played sockets (`e2e/support.ts` `Harness` 103–203: `next`, `send`). The spec covers:
  1. "@Ledger …" → Ledger `next("message.new")`, and Scout `next("message.overheard")`.
  2. The capsule shows Ledger; pick Scout from the menu and send with no @ → Scout gets `message.new`. The route shows you → Scout, and the next message to Scout has no route.
  3. Ledger and Scout address each other five times → the fifth reaches the other as overheard with `held`, the room shows the guard's line, and the exchange is one fold.
- Update `group.spec.ts` where it expected every harness to hear everything.
- Run the e2e command from section 0, with nothing else running.
- Commit: `test(e2e): who a message is for (ADR 0081)`.

## 9. Green, then STATUS

- `pnpm check`, green.
- The e2e on 5199, green.
- Add a STATUS entry saying what was built, what was walked, and what was not.
- Fast-forward main. Then ask him about going live (section 11).

## 10. Scratch check before live

On the scratch server (4436, the desktop on 5186), with the bridge moved there (`bridge.sh stop`, then `start scratch`) and back afterwards:
- Seat OpenClaw with a test-played or scripted second harness, and walk W1–W4 and W8 from section 14.
- The scratch server runs from its own checkout. Check how `~/Work/chips-openclaw/scripts/scratch-chips.sh` starts it before restarting it onto the branch.

## 11. Going live ⏸ (each step needs his word, asked when the build is green)

1. **4431.** It runs the main checkout's source (launch agent `chat.chips.serve`), so:
   - Fast-forward main first.
   - If there is a migration, back up the database first; the batch 4 recipe is in STATUS.
   - Restart with `launchctl kickstart -k gui/$(id -u)/chat.chips.serve`.
   - Check with `lsof -iTCP:4431 -sTCP:LISTEN` and the log.
2. **Desktop.** Rebuild `apps/web/dist` from main (`pnpm --filter @chipschat/web build`).
3. **Phone.** `pnpm phone` builds from the main checkout and installs to his iPhone. His phone must be unlocked. See memory `chips-phone-testing`.
4. **The bridge.** Restart it: `~/Work/chips-openclaw/scripts/bridge.sh stop`, then `start live`.
5. **Jacobian.** He restarts it himself after `npm run build`.

Until Jacobian and the bridge are changed, both are already correct under Chips's delivery: they get `message.new` only when addressed. They lose only the context of what they overheard.

## 12. Jacobian's half (batch 5) ⏸ commit only on his word; he restarts Jacobian

All of this is in `~/Work/Jacobian`, at HEAD fae325d. Before starting, the tree has a modified `.gitignore` and a deleted `dashboard/tsconfig.tsbuildinfo` that are NOT ours; leave them alone.

1. **A thread per room** (the runbook's option B).
   - `src/channels/conversation.ts`: `IncomingMessageParams` (~159) gets `conversationId?`. Pass it through `handleIncoming` → `runSpaceTurn` (~473) → `runtime.runTurn` (~504, which takes `conversationId: session.sessionId` today).
   - Keep `session.sessionId` for stop, live turns and cost.
   - `src/channels/chips/bot.ts` `turn()` (~887–915): when `this.spaces.jacobianSpaceOf(room)` is undefined, pass `${session.sessionId}@${room}`. J's room and every Space's room keep their keys.
   - The runtime keys threads `${conversationId}::${spaceId}` (`src/spaces/runtime.ts` `conversationFor` ~1920).
   - `/reset` in such a room forgets only that room's thread: `forget` matches `recordId` exactly (runtime.ts ~1948; conversation.ts ~268).
2. **Turn only on `message.new`.** `onEvent`'s switch (bot.ts ~616) gets `case "message.overheard": return this.onOverheard(event);`.
   - `onOverheard` keeps a bounded buffer per room: the last 20 lines, about 4k characters, each `Name: words`.
   - The next turn in that room gets the buffer as a preface to `executionMessage`: "Said in this room since you last spoke: …". Then the buffer is cleared.
   - Do NOT push user-role entries into the runtime thread. Two user messages in a row break the model's alternation (runtime.ts ~905–925 copies the thread and writes back one exchange).
3. **Hear an agent that addresses Jacobian.**
   - `readInbound` (bot.ts ~128) reads `from.kind` and `addressed_to`.
   - `onMessage` (~650) drops a harness's message today, because `isAuthorized` (~283) checks owners. Accept a harness's `message.new` when its owner is one of Jacobian's owners. The owner is `owner_id` from `GET /v1/participants`; add a client method in `src/channels/chips/client.ts` and a small cache. Run it as that room's conversation, and approvals still go to the owner.
   - Answer with `to: [that harness]` on the `message.post`, so the answer reaches it whether or not the model writes an @. This means plumbing `to` through `ChipsReplySession` → `client.postText`.
4. **Tell the turn who is in the room.** One line in the preface: "In this room: Arjun (person), OpenClaw (agent). Address another agent with @Name."
5. **Tests.**
   - `tests/unit/channels/chips/bot.test.ts`: two unknown rooms get two threads; J's room keeps its key; `/reset` forgets one room; overheard lines preface the next turn and are cleared; a harness's addressed message runs, and one from a stranger's harness does not; the reply carries `to`.
   - One test beside `tests/unit/channels/placed-turn-dispatch.test.ts`.
6. **The superseded parts of the runbook's batch 5.** Its per-room turn cap is dropped (Chips has the guard). Option A ("a Space per room") stays for later.

## 13. The bridge (`~/Work/chips-openclaw`, a local repo, at d6200a4)

- `bridge/src/bridge.ts` `onChips` (~171): add `case "message.overheard"` → a per-room buffer (as in 12.2), prefaced to the next `chat.send` in that room. `heard()` (~190) drops its own `from.kind === "harness"` mention check, since Chips decides now.
- Answer an agent with `to: [its id]`: the `message.post` at ~440.
- `bridge/src/main.ts` `catchUp` (~45–60) reads the log's `message.post` for people only. It must now take only posts whose `addressed_to` includes the bridge's harness (or has no `addressed_to`, meaning an old message). The rest become context.
- Run its tests (25 today) and commit locally (never pushed; there is no remote).

## 14. The live test, after everything is live (on 4431, in "A joint space")

| # | Do | Expect |
|---|---|---|
| W1 | "@OpenClaw is the build green?" | Only OpenClaw thinks and answers. The route is you → O, and the capsule turns to OpenClaw |
| W2 | "and the PR checks?" with no @ | OpenClaw again, and no route over it |
| W3 | Capsule → Jacobian, then "add that to the notes" | Jacobian answers, and the route is you → J. J's own room shows nothing of it (a thread per room) |
| W4 | Capsule → Everyone, then "hi both" | Both answer once, and the route is you → J+O |
| W5 | Ask Jacobian to ask OpenClaw something | Jacobian → @OpenClaw → an answer back, folded (J ⇄ O · 2), then Jacobian answers you |
| W6 | A new room made with No one, then both added, then "Hi" | Both answer, since a first message goes to Everyone |
| W7 | A direct room (J's room) | No capsule and no routes; everything as before |
| W8 | The guard, on the scratch server (4436) with two scripted harnesses, not live | The fifth message is held, and the line shows |

Write the results into `docs/reviews/openclaw-test-report.md` under a new "ADR 0081" section, then Phase 8 (uninstall OpenClaw) as in `openclaw-batches-2-5.md`, on his word.
