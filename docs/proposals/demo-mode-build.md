# Demo mode and the first screen, built from the mock

**Build plan, 20 October 2026. Status: building. DM1 built; the two short films added on his word the same evening, and DM5's core half built; DM2, DM4 and DM5 built on the phone (tests only, walks to come) and on the web and the Mac (unit tests and the web e2e). DM6 walked on a simulator and the Mac on 21 October, WC-1 to WC-9 fixed; his iPhone, Reduce Motion and light mode not walked yet (WC-10).** Arjun asked for "a
beautiful and cool onboarding for first time chips users" so a newcomer understands the app and
how to use it, and for a "Demo mode" that shows the app running with text commentary. The mock is a
private Artifact, kept out of the repo: <https://claude.ai/artifact/Jj6hN3L16NcvFejmgDute8>. On it
he took caption style **C, Stage**, with the green chapter bar under the stage, and asked for no
claims that could cause liability. The decision is
[ADR 0213](../decisions/0213-a-newcomer-watches-chips-play-a-made-up-workspace-before-setting-anything-up.md).

This plan builds three things: **the demo engine** (a workspace that lives only on the device,
played by a script through the store's own seams), **the film** (Stage captions with the chapter
bar, on the phone, the web and the Mac) and **the new first screen**. First-time notes and Learn
Chips, also on the mock, are not in it.

## What it costs

- **No server change, no migration, no restart of 4431.** Core and the three clients only.
- **Live means client builds**: the web build, the Mac app and a phone build, on his word.
- **The wire becomes something the film depends on.** The script is wire events, so a change to an
  event the film plays has to keep the film playing. A core test catches it (DM1).
- **About:** in core, a `demo/` folder of five files and their tests; on the phone, four
  components, a branch where stores are made, and the welcome's top; on the web, three components,
  the same branch, and the unpaired page's top; one web e2e spec and one phone scenario.

## What the store needs, read from the code

A survey of the store on 20 October 2026, with what each piece of the demo answers:

| The store asks | Where | The demo answers |
|---|---|---|
| A connection, `connect(TransportOptions): Transport` | `store.ts:995`, `transport.ts:120-156` | a scripted transport: `onState("open")`, then a `hello` naming every room and the workspace, then events with rising `seq` and real prefixed ids (`newId`); `send`, `withdraw`, `wake`, `goDirect`, `onlyDirect`, `close` |
| A sent message or steer to come back | `store.ts:3353` | the same event echoed with its `idempotency_key`, and `onReceipt` for a message sent mid-run |
| An answer to an approval to be acked | `store.ts:1712` | `onAck`, then `approval.resolved` with `resolved_by` and `resolved_at` filled |
| `/v1/participants`, `/v1/me/space-icons`, `/v1/me/hidden-spaces` at start | `store.ts:1802-1804` | the made-up directory, every agent with a `state` and a `last_seen_at` (or the store reads it again), and no icons or hidden rooms |
| `/v1/search` | `store.ts:2436` | a match over the demo's own messages |
| `/v1/spaces/:id/files`, `/spend`; `/v1/agents/:id/…`; `/v1/limits` | `store.ts:2580-3101` | canned answers for the rooms and agents the film opens |
| `/v1/server`, `/v1/devices`, `/v1/connectors`, `/v1/invites`, `/v1/join`, `/v1/me/notifications`, `/v1/health` | `store.ts:1359-3188` | none asked: `isDemo` keeps the setup card, connect, invites, join requests and notification settings off; any other path answers `not_in_demo` |
| A file by id, through the device's link and a signed request | `attachments.ts:502-547`, `device.ts:1042` | `useLink(demoDeviceId, link)` answering with the bundled picture; the device's key made in memory, so signing works |
| A push token | `apps/mobile/src/push/register.ts:166` | not registered for a demo device |

Facts that shape the script:

- The thinking bubble's label and detail are core's, worked out from `run.status` (`phase`,
  `verb_phrase`) and `step.log` (`bubbleSays.ts`, `doingSays`): the script sends those.
- A lane hands work to another room (`task`, `run.requested`, `lane.updated`; `lanes.ts:145-201`),
  and the specialist works there. The film's hand-off stays in the room: Milo's message to Theo,
  with the `mentions` and `addressed_to` the protocol's own `resolveMentions` and `resolveAddress`
  write, and Theo's run in the same room.
- An approval request needs `action` and `risk` (`harness-to-chips.ts:301`).
- A table is Markdown in the message's text; a picture is an entry in `attachments`
  (`primitives.ts:103`) with its size, so the room holds its place before it draws.
- On the phone the front store is handed over once it has read its cache (`provider.tsx:334`), so
  the player starts after that.
- The places that make stores do it with fixed options today: the phone's `workspaces.ts:93`, the
  web's `App.tsx:219` and `useWorkspaces.ts:42`. Each learns one branch for a demo device.
- The device store loses every workspace when one key fails to load (`device.ts:235-260`), so the
  demo is never written there (ADR 0213, point 7).
- Core's `store.test.ts:47-215` already runs a store over a fake transport, an in-memory cache and
  injected reads. It is the template for `demo/serve.ts`.

## The film, chapter by chapter

The ten chapters, as the mock plays them (version 3), with what each puts on the wire.

| # | Chapter | Screen | What the script plays | Your turn |
|---|---|---|---|---|
| 1 | Spaces | Spaces tab | four rooms; Felix working in Garden website (face lit) | |
| 2 | Ask | the room | the composer fills with the ask | **Send** (the real composer: `message.post`) |
| 3 | Watch | the room | `run.started`; `run.status` and `step.log` twice | |
| 4 | Steer | the room | a second message mid-run (`run.steer`), its receipt | |
| 5 | Results | the room | Milo's `message.post` with a table | |
| 6 | Teamwork | the room | Milo's message to Theo; Theo's run and picture; Rosa's "Love the card!" | |
| 7 | Approve | the room | `approval.request` | **Approve** (the real card: `approval.resolved`) |
| 8 | Lock screen | a picture | a drawn lock screen, the question on it, approved there; Milo's `run.completed` with its cost | |
| 9 | Agents | Agents tab | the shelf of three made-up harnesses (ADR 0185), five agents | |
| 10 | Yours | end card | Set up my own Chips, I have an invite, Look around, Watch again | |

The made-up harnesses are **Errand**, **Studio** and **Herald**: `no-harness-named` fails any
shipped source that names a real one (ADR 0051), and the demo ships. The agents are Milo and Oscar
(Errand), Theo and Felix (Studio) and Hugo (Herald), from the first-names list (ADR 0150), one room
each (ADR 0087). The people are you and Rosa. The restaurants are made up too (Osteria Verde, Casa
Lucca, Pasta Lane), so the film describes no real business.

## The two short films

Added on his word, 20 October 2026 ("Job Cost viewing, Reporting - Something went wrong, Group
chat with Multiple agents … from different Harnesses and people, ability to change model, Agent
moving and forking, Agent context compaction, Agent context / instruction update"). The group chat
is in the first film's room. The rest are two short films, on the first film's end card under More
to see, each opening where the first film stops.

**Your agents, up close** (about 50 s):

| # | Chapter | What it shows | Your turn |
|---|---|---|---|
| 1 | Agent page | Milo's page: room, now, model, context window, context, acts | |
| 2 | Model | the model sheet: Heron 2, Deep effort | **Save** |
| 3 | Instructions | INSTRUCTIONS.md opened, a line added, saved ("Milo reads it next turn") | |
| 4 | Compact | Compact now, the confirm sheet, 63% to 9% | |
| 5 | Fork | Fork into a room, a new room with the copy | |
| 6 | Move | Move to another room, Tax receipts | |

**Costs and trouble** (about 40 s):

| # | Chapter | What it shows | Your turn |
|---|---|---|---|
| 1 | Cost | press Milo's reply, What the run did: steps, times, ≈$0.42 | |
| 2 | Spend | the room sheet's Spend per job tile, its page, $5 | |
| 3 | Not right? | press the table reply, Not right?, Missed what I asked, Milo's second try | **Send to Milo** |
| 4 | Can't answer | Morning brief, Herald offline, "Hugo can't answer yet" | |

Their words follow the same rule as the first film's: what you can do and what the app shows.

## Phases

Each phase lands on main by fast-forward when `pnpm check` passes, with the e2e it drives. Going
live (web build, Mac app, phone build) waits for his word.

### DM1 · Core: the demo engine

- `packages/core/src/demo/workspace.ts`: the made-up workspace as the server would hand it. The
  person, the three harnesses and their agents (the directory), four rooms and their history up to
  chapter 1, and the picture's attachment entry.
- `demo/script.ts`: the ten chapters. For each: its caption (name, line, sentence), its events with
  the waits between them, its Your turn (the client event it waits for, and the testID of the
  control that wears the ring), and its length for the bar. All the film's words are here.
- `demo/serve.ts`: the seams handed to `createStore`. The scripted transport; `get`, `post`, `put`,
  `patch` and `remove` answering the table above; the in-memory cache; and the demo device's `Link`
  for files.
- `demo/player.ts`: the clock. Play, pause, slow, and jump to a chapter (a fresh store, the
  chapters before it replayed at once, then play from there). Its state is what the film draws:
  `chapter`, `fill`, `caption`, `turn`. Pure, with the clock injected, so tests run it in no time.
- `demoDevice()` and `isDemo(device)`: one fixed device id that pairing never makes, a key made in
  memory, and the checks that keep the setup card, the welcome, push, invites and join requests off.
- **Tests:**
  - every chapter played through the real fold, and what each leaves on the snapshot: rooms, the
    bubble's words, the table, the hand-off, the approval answered;
  - every event in the script parsed by the protocol's schemas;
  - the whole film played with `fetch` and the real transport's `connect` made to throw;
  - a jump to each chapter leaves the same snapshot as playing to it;
  - a turn left alone sends its event after five seconds; a tap sends it at once, once.

### DM2 · Phone: the film

- **The demo workspace.** Watch Chips work makes the demo device and puts it in front. The
  provider holds it beside the stored devices, and a word in the app's preferences remembers Look
  around, so the demo is built again at the next launch, played to its end. `workspaces.ts` makes
  its store with the demo's options. In the switcher it is **Chips demo**, and its Spaces title
  wears a Demo tag. Remove is the switcher's own. What needs a server says "Not in the demo" with
  Set up my own Chips.
- **The stage** (`DemoStage`): around the root navigator in `app/_layout.tsx`, only while the front
  workspace is the demo and the film plays. The root view scales to 0.74 under the status bar,
  rounded and shadowed, on one Reanimated transform (one clock, ADR 0074). Taps land through the
  scale.
- **The chapter bar** (`ChapterBar`): ten segments in green, filled from the player. The one playing
  glows, a finished one jumps once, and a tap plays that chapter.
- **The caption** (`DemoCaption`): the chapter's name, its line a word at a time, its sentence; a
  Your turn in the accent.
- **The ring**: the control the turn names (by testID: the composer's send, the approval card's
  Approve) wears a gold ring until it is tapped, or until the player sends the event itself.
- **The lock screen picture** for chapter 8, inside the stage.
- **The end card**, Leave (✕), pause on a tap on the stage, and Reduce Motion (`useReduceMotion`).
- **Tests:** the stage, bar and caption over a fake player; the ring on the named control; a turn
  sent by a real tap; Leave; Look around kept across a relaunch; Remove.

### DM3 · Web and Mac: the film

- The same demo device and branch in `App.tsx` and `useWorkspaces.ts`, kept out of IndexedDB's
  devices as the phone keeps it out of its own.
- The same `DemoStage` in the window: the app's content steps back with the bar and the caption
  under it, from the same player and script. The Mac app is the web build in a shell (ADR 0173), so
  this is one piece of work for both.
- **e2e:** `apps/web/e2e/the-demo.spec.ts`. Open the unpaired page, press Watch Chips work, tap Send
  and Approve when the ring asks, and see each chapter's caption and the bar fill. Then Look around,
  find Chips demo in the switcher, and remove it. Also: the whole film with no request leaving the
  page.

### DM4 · The first screen

- **Phone** (`app/pair.tsx`): `WelcomePreview` (plain Reanimated, no store: ask, thinking, approval,
  Approved, nine seconds, looping; still with Reduce Motion). Under it, Chat with your AI agents and
  its line, then **Watch Chips work · 1 min**, **Paste an invite link** and **Set up my own Chips**.
  Set up opens the page's ways in as they are today. Chips found on this Wi-Fi slides up from the
  foot when it is found (ADR 0172).
- **Web and Mac** (`Pairing.tsx`): the same at the top of `EnterCode` (a browser) and
  `ChooseServer` (the Mac app with no server). An invite in the address still opens `Join` first.
- **Tests:** the welcome's screen test; the web spec opens the film from the button.

### DM5 · The two short films

- **Core**: the two films' chapters in `demo/script.ts`, after `"watch"`. The server answers what
  their pages read and write: the agent's model and its choices, its context files and a save, its
  context window and a compaction, its stays, a move and a fork, a `correction` (Not right?) with
  Milo's second try, the room's spend and a new ceiling, and Herald going offline (`presence`).
- **The player names sheets.** A chapter's state names its screen and, where it has one, its sheet
  (`model`, `compact`, `roomPicker`, `runDid`, `roomSheet`, `spend`, `lifted`, `notRight`) and the
  editor route. The phone and the web open them through one `DemoDirector` that maps names to the
  routes and sheet openers the app already has; a sheet gains no demo code of its own.
- **Tests**: as DM1's, for both films: each chapter through the real fold, every event parsed, no
  network, a jump equal to playing there.
- **Built, core** (20 October 2026): `demo/book.ts` (the server's log, moved out of `serve.ts`),
  `demo/agents.ts` (Errand's copies of its agents: model, files, window; stays, move, fork), the
  spend ceiling and `presence` in `serve.ts`, the films in `script.ts`, and the player's new state
  (`agentId`, `file`, `focus`, `lineId`, `picker`, `form`, `revision`). Errand now declares
  `models`, `context_files`, `context_windows` and `forks`. The first film's dinner run reports
  its steps and its model and tokens, for What the run did. The copy's new room is **Milo · fork**,
  as the room picker names it (`forkRoomTitle`), not the mock's "Birthday dinner · fork", so the
  room is called what the sheet said it would be.
- **Built, phone** (20 October 2026, tests only): a sheet stands on the stage. A modal is a window
  the root's transform does not reach, so `ui/stageFrame.tsx` gives the modal roots (`Sheet`,
  `LiftLayer`, `PageSheet`) the stage's frame, which they draw their content in, with the bar, the
  caption and Leave drawn over it (the stage's own copy hidden meanwhile); the lifted menu puts its
  measures back into the frame. What a state asks of a screen goes through small registries the
  screens keep (`ui/asked.ts`: the room's sheet and its Spend page, an agent's page's part in view
  and its sheets, the model's picks, a file's words, a message lifted and its pages, Not right?'s
  picks, the reads gone stale), mapped in `demo/film.ts`'s `asksOf`. The editor, finding its words
  saved from outside, says Saved and goes back as after its own Save. Save and Not right?'s Send
  wear the ring. Not in the demo stands in place of making a harness link, an invite link, and a
  pairing code (`demo/NotInDemo.tsx`).
- **Built, web and Mac** (20 October 2026): on the stage, the shell's dialogs and menus are drawn
  in the stage's frame (`layer.tsx`, read by `GrowingDialog`, `ConfirmDialog`, `LineMenu` and the
  room sheet's placing): opened with `show()` over a dim of their own, they stand in the stage and
  scale with it, and the bar, the caption and Leave stay clickable. The director maps the agent's
  page and its file's editor to Agents, `focus` to the card's part, and each sheet to the web's
  opener (`demo/directing.ts`); `revision` reads the page again. The room picker is the card's
  field and What the run did is the receipt under the reply, since the web has no sheets for them.
  Not in the demo stands in for Connect a harness, Invite someone, a room's invite, New phone and
  Pair another device. Chips on this Wi-Fi comes up under the Mac app's welcome top.
  `e2e/the-short-films.spec.ts` plays both films from More to see.

### DM6 · Walks

- The phone on a simulator, then on his iPhone over Wi-Fi: the film in light and dark, both turns
  tapped and left alone, a jump from the bar, Leave, Look around, a relaunch, Remove; and a phone
  with Reduce Motion on.
- The Mac app, the same.
- A scenario to rerun, `testing/scenarios/onboarding/watch-chips-work.md`, beside `first-run.md`.
- Before App Review sees it: whether to ask Apple about a demo mode in place of the demo account is
  his decision.
- **Walked** (21 October 2026): a simulator and the Mac, dark, with what the background tools
  can't press checked in WebKit and Chromium by script ([the scenario](../../testing/scenarios/onboarding/watch-chips-work.md),
  WC-1 to WC-9 fixed). One was not the demo's alone: the Mac's WebKit moved a room's scroll back as
  a picture decoded at its end, and the list stopped following (WC-6).

## Words

All the film's words are in `demo/script.ts`, read together. They follow his rule of 20 October
2026: they describe what a person can do and what the app shows, and promise nothing an agent
does. When an agent asks is its harness's choice (ADR 0195).

## Risks

- **A screen the script doesn't feed** draws an empty or failed state in the middle of the film. The
  walks in DM5 go through every chapter's screens, and DM1's tests hold each chapter's snapshot.
- **Server-written fields** the script forgets leave a card busy or a message sending. DM1's test
  fails on any message still sending or any answer still busy at a chapter's end.
- **The stage's transform** on the root view could upset sheets or the keyboard. The film opens no
  sheet and no keyboard: the composer is filled by the script, and Send is the only tap there.

## Left for later

- First-time notes (the mock keeps the island's capsule for them) and Learn Chips with Show me,
  which would open the film at a chapter.
- The film on chipschat.ai (the web build in a phone frame), which is publishing, and his call.
- A demo that answers anything you send: one canned answer is all this plan gives.
