# Phase 2 packet

Written 5 September 2026 · for tag `phase-2-complete` · from `phase-1-complete` (`fbfa31a`)

## What shipped

A Chips that runs on the Mac mini and is reached from a laptop and a phone; a `chips` command
that serves, pairs, connects, checks, exports and imports; a desktop app that finds the server
by itself; Claude Code and Jacobian connected as the first real harnesses, each in its own terms
— eleven hooks and a bridge on the machine for one, a channel plugin vendored in beside Telegram
for the other; a conformance kit that walks any adapter through the golden scenario and prints
the app's own checklist; and docs a stranger can install from. The nouns changed under it on the
second day: a **harness** is what you run, a **space** is where it works, a **session** is a
visit ([ADR 0024](../decisions/0024-a-harness-has-spaces-and-a-space-is-a-worktree.md)), and the
code, the wire and the schema took the words the same day.

The thing worth saying about how it went: **the plan's shape held, and the real harnesses kept
correcting the plan's assumptions in ways that are written down.** The Claude Code adapter is a
bridge on the harness's machine rather than a route on the server
([ADR 0025](../decisions/0025-the-claude-code-adapter-is-a-bridge-on-the-harnesss-machine.md)),
because the worktree, the token and `claude -p --resume` all live there. Not every Jacobian
Space is a room, on Arjun's first live look. The conformance kit found two gaps in the adapters
the moment it ran, and the docs' cold read found five in the product the moment it was walked —
the QR pointed at nothing, a second device had no way to a code, `hello-1` collided across
harnesses — and each is fixed and recorded ([ADR 0027](../decisions/0027-an-idempotency-key-is-the-senders-own.md),
[ADR 0028](../decisions/0028-chipsd-serves-the-page-and-pairs-the-machine-it-runs-on.md)).
Seventy commits on `main`, each green; two conditions of the Phase 1 review closed on the
phase's first day; the third is still nobody's to see.

### Milestones

- [x] **M2.1 The `chips` CLI.** [`cli`](../../cli): `serve` migrates, makes the workspace on a
  clean machine, pairs the machine it runs on, prints a code and a QR, advertises `_chips._tcp`
  and serves the page; `pair`, and `pair --issue` for the next device; `connect` for the three
  harnesses, naming every change first, with `--rotate` issuing before it revokes
  ([ADR 0023](../decisions/0023-an-agents-owner-holds-its-tokens.md)); `disconnect` from the
  record `connect` kept; `doctor` with a fix and a link under every failure and a test that
  induces each; `export` and `import` carrying the log and the registry and never a projection.
  `packaging/install.sh`, `packaging/chips.rb` and two launchd templates wait for a release.
- [x] **M2.2 Desktop shell.** [`apps/desktop`](../../apps/desktop): Tauri 2 around the web
  app, which knows an id and two sentences and never a token; mDNS browse and a "which server"
  screen; the Needs-you count in the menu bar; `chips://` links; a notification with Approve and
  Deny through `mac-notification-sys`; a signed or unsigned `.dmg` from CI, saying which. The
  page's side is one seam ([`native.ts`](../../apps/web/src/native.ts)) and every request names
  its server. Reconnects after a server restart in under two seconds
  ([`restart.spec.ts`](../../apps/web/e2e/restart.spec.ts)).
- [x] **M2.3 Claude Code adapter.** [`adapters/claude-code`](../../adapters/claude-code): a
  bridge on the machine; eleven `http` hooks with a shared secret; a worktree is a space, found
  on the server by its key; a session is a visit with `session.started` and `session.ended`; a
  prompt is a run with the person's words as their own message; the approval gate that waits
  nine minutes and hands the question back to the terminal rather than failing open or closed;
  usage from the transcript's tail; two ways in — the channel into a live session, `claude -p
  --resume` into a closed one, never both — with the composer saying which before you send; a
  message that reaches nothing says so; the mapping page.
- [x] **M2.4 Jacobian adapter.** [`adapters/jacobian`](../../adapters/jacobian): a channel plugin
  in Jacobian's own terms, type-checked against a stub of the slice it compiles against and
  against the real Jacobian by `vendor.mjs --check`, brought into Jacobian by a script; J and the
  Spaces directly under J are spaces; a message from Chips is a run through the same engine
  Telegram uses; a card in Chips settles the same record Telegram would, first answer wins;
  usage from the cost store when the runtime carries it. Live on this Mac mini: the acceptance's
  "placed message and `hand_down` as a run with steps" observed on 5 September; seven
  Jacobian-side seams tracked below.
- [x] **M2.5 Conformance kit v0.** [`packages/conformance`](../../packages/conformance): a fake
  Chips that speaks the wire — the routes, the socket, the handshake, the replay, the door's six
  rules restated — and a driver that plays the person through the golden scenario and prints the
  checklist the Harnesses tab lights, which moved into `@chips/protocol` so the two cannot differ
  ([ADR 0026](../decisions/0026-the-conformance-kit-is-a-fake-chips-that-speaks-the-wire.md));
  `chips conformance <claude-code|jacobian|custom>`; a CI job per adapter. Both adapters pass.
- [x] **M2.6 Docs.** [`apps/docs`](../../apps/docs): Start here as ten minutes from a clone;
  Install; Connect with the checklist; Custom from a token to a run with an approval, every call
  as curl and run in CI; Hooks, the SDK and the wire; Claude Code and Jacobian; Conformance; a
  Mac mini; the chips command; Chips for Mac; Harness, Space and Session concepts. The cold read
  walked, timed, and its five findings fixed.

### Exit criteria

| Criterion | Status |
|---|---|
| Arjun's Mac mini runs chipsd with Jacobian connected | **Yes, live.** This packet is written on that machine: `chips doctor` reports pairing, the server, Claude Code's bridge on 8790 and Jacobian's token, "last spoke 250 minutes ago". Jacobian runs the plugin as vendored on 5 September, before M2.5's cost-store read and M2.6's per-sender keys; the re-vendor and restart are Arjun's, with his own uncommitted changes in that checkout left alone. |
| The desktop app is paired | **Arjun's.** The app is built, the pairing screen finds a server on the network, and the code for it comes from `chips serve` or `chips pair --issue`; the pairing itself happens on his laptop. |
| The docs pass the cold-read test | **Rehearsed, not supplied.** Walked on 5 September in a scratch environment following Start here and Custom as written — serve to a harness saying hello in 64 s from the terminal, a minute more through the browser — and again from a fresh clone at the gate (numbers in the review; under Node 26, because Homebrew's `node@22` on this machine is unlinked). The reviewer's own cold read on a clean machine is the acceptance. |

## Deviations

Every deviation is in [`STATUS.md`](../STATUS.md) under Scope changes, dated. The ones that
change what a later phase builds on:

- **The nouns** — harness, space, session — and the plan edited mid-phase to carry them
  (ADR 0024, 4 September). The code, the wire, the schema and the id prefixes followed the same
  day; a database from before is not readable and was deleted.
- **The Claude Code adapter is a process on the harness's machine** (ADR 0025), not a route on
  the server; the hooks post to loopback with a shared secret. `PreToolUse` is not registered as
  a gate — `PermissionRequest` fires wherever Claude Code would ask a person — so a Chips rule
  cannot deny what Claude Code would allow on its own.
- **Two events the protocol did not have**, `session.started` and `session.ended`, and
  `external_key` on `space.created`; `goal_from` on `run.started`; `opened_for` on
  `space.created`. A harness may open a space of its own kind through one door, which the hooks
  page had said it may not.
- **At L2 a shell command runs unasked**, and the docs say so; a new harness starts at L1.
- **No context ring from `PreCompact`**: nothing says the window size, so the row stays dark
  rather than guess.
- **`Stop` posts the reply as a message** before `run.completed` (M2.5's finding); the plan had
  it as a summary only.
- **Not every Jacobian Space is a space**: J and the Spaces directly under J; a worker under one
  of those shows in its task Space's room (ADR 0024, addendum of 5 September).
- **chipsd serves the page; the serving machine is paired by construction; a paired person
  issues the next code** (ADR 0028). **An idempotency key is the sender's own** (ADR 0027,
  migration 0006). **The launch agent is a template, not a command.**
- **`connect` opens no direct space for Claude Code or Jacobian**, which open their own.

### From the blueprint

Checked against the "Harnesses and sessions" section and the connect mock. What is present
matches in structure and words: Needs you · Spaces · Harnesses · Channels; one row per space
with its harness as a tag; the harness rolled up as live sessions, working, needs you; the
session strip on a space; a message marked *at Claude Code* when it was typed in a terminal;
the line under the composer saying where the words will go, in both of its states and a third
the mockup did not draw (nowhere); the run panel naming its session; `chips connect` naming
every change and printing the run, launch and undo lines. What differs, and why:

| Element | As built | Reason |
|---|---|---|
| Harness card: Kind, Machine, Token, Owner | Name, level, owner, spaces, checklist, Tokens | The kind is the name `connect` gives it; the machine is on each session's line, since a harness may run on several |
| Checklist rows: Sessions, Runs, Approvals, Steps, Usage, Context ring, Lanes, Messages | Messages, Runs, Steps, Approvals, Questions, Context, Cost, Finished | The rows are the protocol's event families, the same for every harness; a Sessions row would be dark for a Jacobian that is complete. Lanes is Phase 3 |
| Approval "also waiting in Terminal · first answer wins" line | The card, without the line | The hook is what waits; the terminal's own prompt appears only when the gate hands the question back |
| Search (⌘K), the workspace switcher | Absent | One workspace; search has nothing behind it yet — carried from Phase 1 |
| The connect mock's `~/.claude/mcp.json` line | `claude mcp add chips --scope user -- chips channel`, printed | Claude Code registers a channel through its own command, not a file Chips edits |
| "Approve from the Mac notification" | Built through the system API; not pressed by a test | macOS attributes a banner to a bundle, and a button is not a thing a suite presses |

## Tests

| Command | Result |
|---|---|
| `pnpm check` (Biome at complexity 12, dependency-cruiser, architecture and protocol staleness, typecheck on every package and the docs site, tests with coverage) | exit 0 · 131 files, **1,548 passed**, 0 skipped |
| `pnpm test` coverage | 94.21 lines / 82.72 branches / 92.29 functions / 92.31 statements |
| `pnpm docs:check` | 5 of 5 samples: the SDK and the Custom guide's curl loop, each against an in-process chipsd |
| `pnpm docs:build` | 73 pages, every link validated |
| `CHIPS_E2E_WEB_PORT=5199 pnpm e2e` | **21 passed** (Chromium, 1.1 minutes; scale, windowing and restart last as their own project) |
| `pnpm --filter @chips/cli run start conformance claude-code` | passed · 14 events in 0.5 s · one note (usage carried no cost) |
| `pnpm --filter @chips/cli run start conformance jacobian` | passed · 19 events in 0.6 s · one warning (a yes with no `approval.executed`: the tool-result seam) |
| `pnpm --filter @chips/cli run start conformance custom`, a hooks-mode harness written from the Custom guide | passed · 7 events |
| `node adapters/jacobian/scripts/vendor.mjs --check` | Jacobian's own `tsc` over a scratch copy: 0 errors in all, 0 in the plugin |
| `pnpm desktop:check` | clippy at `-D warnings` and the Rust tests, in CI on every push |
| `pnpm bench:fold` | ten thousand events in two hundred flushes: 70 ms rebuilt from zero, **4 ms** incremental |

The Playwright suite, in the order it runs: the approval loop; attachments; Custom connect
timed from token to first message; decisions; the golden scenario with pause, steer and stop;
Lighthouse on four screens; sync under a burst and offline; then the scale run, the windowing
run and the server restart. Nothing is skipped. No test is quarantined.

Three acceptance lines rest on inspection or on Arjun rather than on a run here: "approve from
a macOS notification" (M2.2), "Telegram and Chips run side by side" (M2.4 — the manager fans
every card to every channel, exercised through that seam in the unit suite, and Arjun's live run
of 5 September saw a Chips message become a run), and the deferred approval "answered after the
session ended" (M2.3 — see known issue 1).

### Coverage

| Scope | Lines | Branches | Functions | Statements |
|---|---|---|---|---|
| Overall (floor 80) | 94.21 | 82.72 | 92.29 | 92.31 |
| `packages/protocol/src`, `server/src/domain` (floor 90) | above 90 on all four; enforced by the Vitest thresholds | | | |

Every number is above the Phase 1 gate's (94.61 lines then, with far less code; 82.84 branches),
except lines, which fell 0.4 points across a phase that added the CLI, two adapters, the kit and
the desktop seam — `adapters/*/src` was put *into* the report rather than left out. Nothing was
excluded that was not excluded in Phase 1.

## Engineering standards

**Coverage against thresholds.** Above, all met; thresholds unchanged, none lowered.

**`dependency-cruiser`.** 494 modules, 1,519 dependencies, no violations. `packages/conformance`
sits under the `clients-not-to-server` rule; the adapters and the CLI import the server only
for its exported wiring, never a route.

**Lint and typecheck.** Biome clean with the complexity limit at twelve, which split nine
functions this phase; `tsc` strict with `exactOptionalPropertyTypes` across every package,
`astro check` on the docs site, clippy at `-D warnings` on the shell.

**Load numbers.** The condition-1 work, measured
([`windowing.spec.ts`](../../apps/web/e2e/windowing.spec.ts), written to
`apps/web/reports/windowing.json`): with 11,000 messages in the room, **17 rows in the DOM**, 25
while scrolling, 119 frames at a median of 16.7 ms and a 95th of 16.8 ms, **no late frame** — a
locked 60 fps against section 4.4's budget. The scale run: 1,000 messages from 20 harnesses
posted in **832 ms**, on screen in **1.6 s**, read back by a fresh pairing in **1.9 s** (1.8 s,
5.2 s and 5.3 s at Gate 1). A cold pairing against a 10,000-message log takes 11.5 s to the last
line, which no budget covers and which is the delivery path, not the fold; the next thing to
measure properly. The fold: 4 ms incremental, 70 ms from zero. The desktop app reconnects after
a server restart in under two seconds.

**New dependencies, each pinned exactly.**

| Package | Where | Why |
|---|---|---|
| `bonjour-service@1.4.4` | cli | mDNS: `chips serve` advertises `_chips._tcp`; the desktop app and `doctor` browse |
| `qrcode@1.5.4`, `@types/qrcode` (dev) | cli | The pairing code as a QR in the terminal, for a phone camera |
| `kysely@0.29.5` | cli | `export` and `import` read and write the log through the server's own schema |
| `ws@8.21.3`, `@types/ws` (dev) | packages/conformance | The fake's `/v1/ws`; the kit depends on the protocol and this and nothing else of ours |
| `zod@4.5.4` | adapters/jacobian | The channel's settings, written to the API zod 3 and 4 share, because Jacobian already has it |
| `@tauri-apps/api@2.11.1`, `@tauri-apps/cli@2.11.4` (dev) | apps/desktop | The shell |
| `mac-notification-sys` and Tauri's Rust crates | apps/desktop/src-tauri | A notification with Approve and Deny; Tauri's plugin draws a banner with no buttons on macOS |

The Jacobian plugin itself brings no dependency into Jacobian: HTTP and Node's own `WebSocket`
to chipsd, and zod which Jacobian has.

**Waivers requested.** None.

### Appendix G

1. Layers inward only, dependency-cruiser green: yes. The kit restates the door's rules rather
   than importing `server/src/domain`, on purpose (ADR 0026); the CLI imports the server's
   wiring; the adapters import nothing of the server.
2. External input validated at the edge: every event through the protocol's schema at the door
   and in the fake; hook payloads read wire-first by a reader that names each field; the
   settings file parsed and refused rather than overwritten; the space door's key and title
   bounded; the pairing body's three fields checked before a lookup.
3. Idempotency keys on every command, handlers safe to run twice: yes, and now per sender
   (ADR 0027); the bridge keys every event by run and hook; the Jacobian plugin by message and
   record; `connect --rotate` issues before it revokes and is safe to interrupt.
4. Workspace scope on every query: yes; the session and space-key tables are keyed by workspace;
   the events read carries the viewer for membership.
5. One transaction, `rebuild` reproduces: yes; the replay property test covers `sessions` and
   `external_key`; `chips import` is the same replay through the same code.
6. Cursor pagination with an index per query: `GET /v1/events` unchanged; new indexes on
   `sessions(workspace_id, space_id)`, `sessions(workspace_id, harness_id, state)`,
   `spaces(workspace_id, external_key)`, and the key index rebuilt with the actor.
7. Heavy operations off the request path: as in Phase 1 — thumbnails on the upload request;
   Phase 4's with video. The transcript read in the bridge is bounded (256 KB doubling, capped).
8. Coverage thresholds met, and did any go down: met; lines down 0.4 with the adapters added to
   the report, branches up.
9. Property tests: the replay's totality extended to the new tables; the run state machine and
   the policy table unchanged; the kit's door rules tested rule for rule against `authorize.ts`.
10. Deterministic tests: injected clock and ids in the server and the CLI; the kit's tests and
    the bridge's integration test use real sockets and a real clock by design, with ceilings.
11. Quarantined tests older than 48 hours: none.
12. Logs carry ids and no personal data: request, run and harness ids; tokens, signatures and
    anything called `secret` redacted at every depth; the bridge logs a session's id and never a
    prompt.
13. Metrics for what a runbook would need: none yet — Phase 6's; `doctor` is the runbook's
    first page.
14. Dependencies pinned, justified, maintained: yes, above.
15. Public APIs documented, reference regenerated: the two session events and the three new
    fields in the reference; the CLI page, the two adapter pages, Custom, Conformance, the Mac
    mini page.
16. Blueprint nouns and language: yes, and the code took them (ADR 0024).
17. File and function sizes: the complexity limit enforces the function half;
    `fake-chips.ts` (≈900 lines), `translate.ts` in the Claude Code adapter and `bot.ts` in the
    Jacobian adapter are long files that read top to bottom, each one thing.
18. Load within budget, numbers recorded: the windowing run at 60 fps, the scale run, the fold
    bench; the append bench unchanged from Phase 1.

## Demo script

On the Mac mini, which is where this packet was written:

1. `pnpm chips serve` (or the launch agent). It prints the address, a pairing code and a QR, and
   pairs the machine it is running on. Open the address in a browser and pair with the code.
2. `pnpm chips connect jacobian`; paste the block it prints into `~/.jacobian/config.yaml` with
   `server_url: http://127.0.0.1:4431`; `pnpm --filter @chips/jacobian vendor`; restart
   Jacobian. J and its task Spaces appear as spaces, opened for you.
3. On the laptop: open Chips for Mac; it finds the mini on the network; type the code from
   `pnpm chips pair --issue` on the mini, or scan its QR from a phone.
4. On the laptop: `chips pair --server http://<mini>:4431 <code>`, `chips connect claude-code`,
   `chips bridge`. Open Claude Code in a worktree: the space appears with a live session.
5. Send Jacobian a message from Chips in a task Space's room: a run with the walk's steps, the
   bubble's reasoning as its status, the reply as a message and the run's summary. Send J a
   message from Telegram: nothing in Chips today — the sixth seam.
6. In Claude Code, run a `WebFetch` at L2: the hook blocks, the card is in Needs you and a
   notification with Approve and Deny is on the Mac; approve there or in the app, and the tool
   runs, the card says executed, the receipt has the line.
7. Open Claude Code in a second worktree: a second space under the same harness, its own
   session. With the first terminal open and the channel loaded, send the first space a message
   from Chips: it arrives in the terminal and the answer comes back here. Close the second
   terminal and send its space a message: `claude -p --resume` runs it, and the answer comes
   back as a message and a summary.

What was walked here, and by whom, is in the review. Steps 1, 3 (the issuing half), 4 (by
`bridge.integration.test.ts` and the hand checks of 4 September) and 7 (the same) are covered
by tests and hand checks on this machine; step 5's first half was observed live on 5 September;
step 2's live run, step 3's laptop half, step 5's Telegram half and step 6's notification are
Arjun's.

## Known issues

1. **An approval decided after the hook gave up goes nowhere.** The gate waits nine minutes
   and hands the question back to the terminal; the card expires by its fallback at the same
   moment; nothing carries a later decision into the session. M2.3's acceptance says "a deferred
   approval answered after the session ended resumes correctly", and the blueprint's connect
   section says the hook "defers and is resumed later". The bridge writes `resume_token` on
   every request and reads it nowhere. Safe as it stands — nothing is approved that nobody saw —
   but the blueprint's promise is not kept.
2. **The served page has no Content-Security-Policy.** Section 6.4 asks for a strict one.
3. **The app has no "Pair another device" screen**; `chips pair --issue` is the only surface.
4. **`POST /v1/pair` is not rate-limited.** Wrong codes are answered at the speed of the
   machine; a code is 2³⁰ possibilities and lives fifteen minutes.
5. **The data directory and the database are created with the process's umask** — `0644` on
   this machine — while every file the CLI writes is owner-only.
6. **`~/.claude/settings.json` carries the bridge secret and is `0644`.** Another account on the
   machine could post hooks the bridge would believe.
7. **The Jacobian on this Mac mini runs the plugin as vendored on 5 September**, before the
   cost-store read; and the cost store itself is not on the runtime bundle (the seventh seam).
   Its Cost row is dark until both land, and both are Arjun's.
8. **`lanUrl` takes the first non-internal address**, which on a laptop with Tailscale is the
   VPN's, so the QR may carry an address the phone cannot reach on the LAN.
9. **A space cannot be retitled or closed**; `Jeff` and the worker rooms opened before Arjun's
   rule stay until they are left.
10. **No `approval.executed` from Jacobian** — the fourth seam — so a yes stays at "approved".
11. **Editing a tool call from the approval card** is a yes today, for both adapters.
12. **The installers point at a release that does not exist.**
13. **A cold pairing against a 10,000-message log takes 11.5 s**; the delivery path, not the
    fold.
14. **The Node 22 CI leg has still not been observed**; everything here runs on Node 26, and
    Homebrew's `node@22` on this machine is unlinked, so the reviewer's fresh clone ran on 26 too.

## Questions for the reviewer

1. Is handing the question back to the terminal (`ask`) the right reading of "defers and is
   resumed later", or must a late decision start a new turn in the session that carries it?
2. `PreToolUse` is not registered as a gate, so a Chips rule cannot deny what Claude Code would
   allow. Is that the trade for Phase 2, or should the bridge register it now that it knows the
   policy from `hello`?
3. Two harnesses in one worktree are two spaces until M3.3. Should M3.3 merge them, or leave
   them side by side with a link?
4. The checklist rows are the protocol's event families rather than the blueprint's
   harness-shaped list. Keep?

## Risks for the next phase

- **Lanes meet two shapes at once**: a lead routing to another harness (the plan's case) and
  Jacobian's `hand_down` between spaces of one harness, whose worker level is already folded
  into a task Space's room. One lane model has to carry both, and the Jacobian side needs the
  turn-events seam before a Telegram turn is even visible.
- **Group spaces meet two harnesses in one worktree** with two separate histories to reconcile
  or link.
- **The deferred approval** (known issue 1) is the one place the blueprint promises more than
  the adapter does, and lanes will add a second party to every approval.
- **The docs' cold read has been rehearsed by the person who wrote the docs.** A stranger's
  read is still the acceptance nobody has run.

## The Jacobian-side seams

The adapter ([`adapters/jacobian`](../../adapters/jacobian), the
[Jacobian page](../../apps/docs/src/content/docs/connect/jacobian.md)) is a channel plugin
vendored into Jacobian, and works against Jacobian as it is. Seven changes on Jacobian's side
would make it better: four named in the mapping report
([`jacobian-to-chips-mapping.md`](../jacobian-to-chips-mapping.md), section F), three found
building and running the adapter. None is done; each says what it unlocks and where the adapter
already reads for it.

- [ ] **An outbound source on `ReplySession.reply`** (report F1). Today a live answer carries no
  Space name (`conversation.ts:489-503`); only queued replies do, as a `🤖 Space Agent (Name):`
  header. With a source on the reply the adapter posts the answer in the answering Space's own
  room. The adapter already reads `OutboundSource.spaceId` on every channel-level send
  ([`bot.ts` `spaceFor`](../../adapters/jacobian/src/channels/chips/bot.ts)); a source on
  `reply` would flow into `ChipsReplySession.reply` the same way.
- [ ] **`spaceId` on `requestPermission`** (report F5). A permission-layer approval
  (`permissions/index.ts:334-421`) names a tool and an action but not the Space that asked, so
  its card lands where the person last wrote, or in `J`. With the Space on the request the card
  goes to that Space's room and, later, per-Space autonomy becomes possible. The adapter reads
  the pending request by id when it puts the card up
  ([`cards.ts` `payloadFor`](../../adapters/jacobian/src/channels/chips/cards.ts)); a `spaceId`
  there would choose the room.
- [ ] **A per-Space budget check in `kit.meter`** (report F6), using `CostStore.getCostByWorkspace`,
  so a Space's spend can be capped. `usage` itself no longer waits on this: see the cost store
  below. `api_calls` rows carry `workerId/taskId/traceId/iteration` (`turn-kit.ts:377-399`),
  which is the per-run figure a budget wants.
- [ ] **Tool-result step logs**: `onToolResult` is a no-op in the engine
  (`conversation.ts:469-474`). The adapter closes a step when the next begins, or when the
  bubble is disposed ([`session.ts` `ChipsThinkingBubble`](../../adapters/jacobian/src/channels/chips/session.ts)),
  so a step's duration is the gap to the next call and a failed tool is not marked failed. With
  the result reported, `step.log` gets `done`/`failed`, `duration_ms` and `error`, and
  `approval.executed` becomes possible after a yes.
- [ ] **An addressed turn** (found while building the adapter). Every message is placed by the
  walk from the top of the tree (`conversation.ts:671`); nothing lets a channel say "run this on
  Space X". A message sent in a Space's own room in Chips should land there by construction.
  Until then the adapter tells the walk, in the message it reads, which room the message was
  said in ([`translate.ts` `addressedTo`](../../adapters/jacobian/src/channels/chips/translate.ts)),
  and the Space's own turn sees the words alone.
- [ ] **Turn events for every surface** (found on the first live message). A turn that starts on
  Telegram — placed, run, answered — is invisible in Chips: the channel plugin sees only the
  turns it starts itself, because a `ReplySession`'s bubble and replies are the starting
  channel's, and nothing announces a turn to the channels that did not start it. Only what the
  manager already fans out reaches Chips from such a turn: an approval card, a queued reply. An
  observer the engine or runtime offers to every channel — turn started on Space X from source
  Y with the message, each tool call, the answer — would make a Telegram turn a run in Chips
  like any other, which is what "one place for every harness" means. The adapter's `Run` and
  `ChipsThinkingBubble` are already the shape such an observer would drive.
- [ ] **The cost store on the channel runtime** (found by the conformance kit, M2.5). A turn's
  model calls are recorded in `CostStore` with the reply session's id (`api_calls.session_id`,
  `conversation.ts:731`), but the runtime bundle the gateway hands `create()`
  (`gateway/index.ts:607`, `ChannelRuntime` in `manifest.ts:136`) does not carry the store, so
  no channel can read them. One line — `costStore` on `channelRuntime` — and the plugin sends
  `usage` for every turn: it already reads `runtime.costStore` structurally
  ([`plugin.ts` `create`](../../adapters/jacobian/src/channels/chips/plugin.ts)), adds the
  turn's calls up ([`translate.ts` `usageOf`](../../adapters/jacobian/src/channels/chips/translate.ts))
  and sends them before the run ends. Until the line lands, the Cost row for Jacobian is lit in
  the kit — the fake runtime hands the store over — and dark on the Mac mini.

Two more from the report that are Chips' side, not Jacobian's, and are in the plan: `hand_down`
and `hand_back` as lanes keyed by `trace_id` (M3.5), and `feedback` for a 👎 (M3.4). Both landed
on 5 September 2026 from what the channel can already see — the bubble's `hand_down`, the
placement receipt, the engine's `fixFlaggedTurn` — with no seam; what the channel cannot see (a
child's `hand_back`, the journey's `trace_id`) stays with the turn-events seam above.

## What the kit found (M2.5) and what the cold read found (M2.6)

The kit ([`packages/conformance`](../../packages/conformance), the
[Conformance page](../../apps/docs/src/content/docs/connect/conformance.md), ADR 0026) walks an
adapter through the golden scenario against a fake Chips and prints the app's checklist. Both
adapters pass its six required rows. Two things it found on the way, and what was done:

- **Claude Code's reply was never a message.** `Stop` sent `usage` and `run.completed` with what
  Claude said as the summary, and nothing else: the Messages row was dark, and a room with
  Claude Code in it held the person's prompts and summary cards. Fixed in the adapter: `Stop`
  posts the reply as `message.post` on the run before the completion, clipped to the protocol's
  bounds, as Jacobian's channel already did.
- **Jacobian sends no usage without a seam.** Tracked above as the cost store on the channel
  runtime. The adapter's side is done and tested; the kit lights the row because its fake
  runtime hands the store over, and the live Jacobian will not until the one line lands.

What is worth watching at the gate: the fake mirrors the server's door rules by restating them
(`packages/conformance/src/workspace.ts`), not by importing `server/src/domain`, so a rule that
changes on one side has to change on the other — the kit's `workspace.test.ts` is written rule
for rule against `authorize.ts` so the drift would show there first.

The cold read of the docs (M2.6), walked in a scratch environment following Start here and
Custom as written, found five things in the product, all fixed before the milestone closed: the
QR pointed at nothing (chipsd served no page); nothing could issue a second pairing code outside
dev mode; `chips connect custom` put the token where the harness could not reach it; the kit and
a hooks-mode harness waited for each other; and two harnesses could not both say `hello-1`
(ADR 0027, ADR 0028).
