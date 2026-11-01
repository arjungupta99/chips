# Phase 1 packet

Written 4 September 2026 · Tag `phase-1-complete` · from `phase-0-complete` (`acf0f30`)

## What shipped

The full supervision loop for one person and a few agents, in a browser, against a real server:
conversations, runs with receipts, status, context and cost, approvals with edit, deny, scope and
expiry, questions, the Needs-you queue in three tiers, autonomy and policy as a dial, attachments
with signed URLs, an SDK, and Add agent, Custom. A person pairs a browser with a code, watches an
agent read a purchase order and ask before it emails, decides on any surface — the second surface
sees "resolved elsewhere" — drops a PDF into the composer and sees the agent read it, and adds a
second agent that is talking within a minute. Everything a screen shows is a fold of the event
log; everything an agent may do is decided at one door.

The thing worth saying about how it went: **the plan's structure held under six milestones of
change**, and where it did not, the reason is written down. Policy moved from columns to a
projection ([ADR 0019](../decisions/0019-policy-is-a-projection.md)); authorization became one
function ([ADR 0022](../decisions/0022-one-authorize-in-the-domain.md)); runs are owned and
checked at the door ([ADR 0020](../decisions/0020-runs-owned-and-checked-at-the-door.md)); cost
is computed at ingest ([ADR 0021](../decisions/0021-cost-at-ingest.md)). The guardrails kept
firing on real faults: the coverage floor, the layer rules on an e2e helper, the complexity
limit on every function that grew past twelve branches, and an interim review at M1.2 that found
writes unscoped by membership before anything was built on them.

### Milestones

- [x] **M1.1 Design system.** [`packages/ui`](../../packages/ui): the tokens in three modes, the
  three faces self-hosted, the vocabulary, seventeen components with jsdom tests, a kitchen sink
  with thirty-four snapshots and axe, pinned to one Playwright image.
- [x] **M1.2 App shell and conversations.** [`packages/core`](../../packages/core) (the pure
  fold, the outbox, the cache, the device key) and [`apps/web`](../../apps/web) (the shell, the
  sidebar, the conversation, Markdown); two tabs in sync under a 500-message burst; offline
  reload from cache; reads and writes scoped by membership; a device signs the full request
  target; a person's socket opens on a single-use ticket.
- [x] **M1.3 Runs, receipts, status, context, cost.**
  [`run-state.ts`](../../server/src/domain/run-state.ts), the run panel with its timeline, ticks
  and receipt, `run.plan`, pause, resume, steer and stop with receipts to both sides, cost at
  ingest from a price table.
- [x] **M1.4 Approvals, questions, Needs you, policy.** The policy engine
  ([`policy.ts`](../../server/src/domain/policy.ts), a table test), decisions as events with
  scope and expiry, first answer wins, the question card, the three tiers with keyboard
  shortcuts, the audit view, the live dial.
- [x] **M1.5 Attachments.** Upload slots, a content-addressed local store, MIME sniffed from
  bytes, thumbnails and GPS stripping with a keep option, signed URLs bound to the token, HTML
  and SVG served as downloads, the photo grid and file card, paste and drop, every agent fetch an
  audit event ([`uploads.ts`](../../server/src/interfaces/http/routes/uploads.ts),
  [`sniff.ts`](../../server/src/domain/sniff.ts)).
- [x] **M1.6 SDK v0 and the custom connect flow.** [`@chips/agent`](../../packages/sdk-ts) with
  a contract test against a real chipsd; Add agent, Custom, with the token once, three curl
  lines and the connection checklist; Scout on the SDK and the Claude Agent SDK; the docs sample
  CI runs.

### Exit criteria

| Criterion | Status |
|---|---|
| M1.1 to M1.6 accepted | M1.1 and M1.2 accepted at the interim review; M1.3 to M1.6 are for this gate |
| Start here draft written | [`/start/`](../../apps/docs/src/content/docs/start/index.md) and [`/start/install/`](../../apps/docs/src/content/docs/start/install.md), rewritten for Phase 1 |
| Playwright suite green | 18 of 18 (Chromium), see Tests |
| Lighthouse accessibility above 90 on the main screens | **100, 100, 100, 100** on the conversation with a run, Needs you, Agents and Audit (two contrast findings on the Agents and Audit screens, 96 each, were fixed at the gate) — [`lighthouse.spec.ts`](../../apps/web/e2e/lighthouse.spec.ts), snapshot mode on a paired session with a run |

## Deviations

Every deviation from the plan is in [`STATUS.md`](../STATUS.md) under Scope changes, milestone
by milestone. The ones that change what a later phase builds on:

- **Policy is a projection** (ADR 0019): `agent_policy`, `workspace_policy` and
  `session_rules` are rebuilt from `policy.updated` and `approval.resolved`; the participant
  columns are gone.
- **An agent's own `allow` rule speaks only at L2 and above**; a new agent starts at L1.
- **`run.plan` was added to the protocol**; `resolved_elsewhere` is delivery's word, false in
  the log; receipts are frames, not events; the `receipt` event is unused.
- **`attachment.fetched` was added**; a message's id on the wire is its event's ULID; an agent
  hears others' messages as `message.new` and its own as `message.post`; only the uploader
  attaches an upload, by id.
- **`POST /v1/agents` is a route, not an event** — a token's digest is never in the log — and a
  new agent gets a direct conversation with the person who added it.
- **The SDK confirms its subscription with a ping round trip**, relying on the gateway handling
  a session's frames in order; the protocol gained no "subscribed" frame.
- **A PDF's first page is the browser's viewer**, not a rasterised preview.

### From the blueprint's desktop mockup

Checked at the gate against `docs/chips-blueprint.html` lines 714–893, by a reader who had not
built it. What is present matches in structure and tokens: the three panes, the sidebar's four
places plus Audit, the recent rows with an agent avatar and its ring, the fleet, the header with
its status pill and context ring, the composer with the clip and the Steer chip, the run panel's
dial, ring, timeline and controls, the approval card's preview, risk tags, expiry, three buttons
and resolved line, the Needs-you tiers with the mockup's words, the status vocabulary. What
differs, and why:

| Element | As built | Reason |
|---|---|---|
| Title bar: search (⌘K), the "3 need you" pill, the workspace switcher | Absent | Search is Phase 2's with the CLI and the desktop shell; the count sits on the Needs-you nav item; one workspace exists in solo mode. Known issue 4. |
| Approval card inside the agent's message | The current run's cards sit after the thread | A live ask never scrolls away; the decided card stays in the thread as the resolved line. Recorded in M1.4's scope changes. |
| Receipt open under the agent's message | Under the run's summary, collapsed | A run's receipt is its record, and the summary is where the run ends; opening it by default doubled the height of every finished run. Open by one click. |
| Fleet rows: dot, name, status word | Was colour and a name; **fixed at the gate** — the status word or verb phrase sits beside the name | Colour was the only signal (blueprint rule, and section 4.5). |
| Header line "owned by · L2 ask when it matters" | Was the goal; **fixed at the gate** — owner and level precede the goal | Fidelity. |
| Run panel: Budget as a bar with tokens, Artifacts, Pause/Stop at the bottom | Budget as a line under the dial (the agent's month), Cost as its own section, no Artifacts, controls under the meta | `artifact.create` renders in Phase 3 with lanes; the controls sit where a thumb reaches on the mockup's phone and where the eye lands on desktop. Known issue 5. |
| Needs-you card with the avatar, the expiry and the risk tags | Tier, agent, "wants a yes", the text, two buttons | The queue card is a pointer to the room's card, which carries the rest. Known issue 6. |
| Agent profile: the dial, "Can do", "This month", Pause | Level, budget, owner, the checklist, Open conversation | The dial is in the run panel per room; the profile's controls arrive with token revocation (known issue 3). |
| Connection checklist rows | Eight rows named for event types, Lanes absent | The rows are the event types that light them; lanes are Phase 3. No docs links yet. |
| Channels | A nav item that opens the current conversation | Channels are "Next" in the blueprint; the item is there so the nav has its shape. |
| An empty right column when no run panel shows | **Fixed at the gate** — the grid drops the column | A layout fault, not a decision. |

## Tests

| Command | Result |
|---|---|
| `pnpm check` (Biome, dependency-cruiser, architecture and protocol staleness, typecheck incl. the docs site, tests with coverage) | exit 0 · 72 files, **1,080 passed**, 0 skipped · 308 modules, no violations |
| `pnpm test` coverage | 94.61 lines / 82.84 branches / 92.49 functions / 92.37 statements |
| `pnpm docs:check` | 4 of 4 samples, including the SDK sample against an in-process chipsd |
| `CHIPS_E2E_WEB_PORT=5199 pnpm e2e` | **18 passed** (Chromium, 1.3 minutes; the scale run last, as its own project) |
| `pnpm bench:append` | append 1,239 ms, replay 261 ms (26.1 µs per event), **1,500 ms** for 10,002 events against a 2,000 ms budget |

The Playwright suite, in the order it runs: the approval loop with Scout as a child process and
axe at three states; attachments (a 21.9 MB PNG with a thumbnail, the agent's fetch and the audit
line, `.html` as a download, a PDF's first page); Custom connect timed from token to first
message, by curl and by the SDK; decisions (edit, deny, expire, resolved elsewhere, a question,
the dial); the golden scenario step by step, and pause, steer, stop; Lighthouse accessibility on
four screens; the scale run (twenty agents, a thousand messages, a fresh pairing); two tabs in
sync under a burst, a message typed offline, a reload offline.

Nothing is skipped. No test is quarantined. The real-model path in Scout (the Claude Agent SDK
drafting the email) is built but not run anywhere, since no key is available here or in CI; the
scripted path is what every run plays. That is the one acceptance line in Phase 1 that rests on
inspection rather than a run: "the golden scenario passes with the real agent".

### Coverage

| Scope | Lines | Branches | Functions | Statements |
|---|---|---|---|---|
| Overall (floor 80) | 94.61 | 82.84 | 92.49 | 92.37 |
| `packages/protocol/src` (floor 90) | above 90 on all four | | | |
| `server/src/domain` (floor 90) | above 90 on all four | | | |

Branches fell from 84.4 to 82.8 percent in M1.6 with the SDK's reconnect path and the Agents
tab, and stay above the 80 floor; the protocol and the domain layer stay above 90. Nothing was
excluded that was not excluded in Phase 0, plus the SDK's `testing/` gateway, which is test
sugar.

## Engineering standards

**Coverage against thresholds.** Above, all met.

**`dependency-cruiser`.** 308 modules, 830 dependencies, no violations. Two rules were added in Phase 1
(`clients-not-to-server`, `server-not-to-clients`) and the test-like exemption gained `e2e` and
`visual`; each fires on a fixture and nothing else fires.

**Lint and typecheck.** Biome clean with the complexity limit at twelve, which split eleven
functions across the phase; `tsc` strict with `exactOptionalPropertyTypes` across every package,
and `astro check` on the docs site.

**Load numbers.** The scale run ([`scale.spec.ts`](../../apps/web/e2e/scale.spec.ts)):
twenty agents on the SDK each start a run and post fifty messages into one room while a paired
browser watches. Alone: 1,000 messages posted and acknowledged in **1.8 s**, all on screen in
**5.2 s**, a fresh pairing against the whole log to the last message in **5.3 s**. Last in the
full suite, with every other spec's history in the log: posted in 1.0 s, on screen in 7.9 s, a
fresh pairing in 9.1 s. The event log's append benchmark: 1,500 ms for 10,002 events against
2,000.

**New dependencies, each pinned exactly.**

| Package | Where | Why |
|---|---|---|
| `sharp@0.35.4` | server | Decision 10 names it: thumbnails and GPS stripping. |
| `@anthropic-ai/claude-agent-sdk@0.3.260` | examples/scout | The plan's M1.6: Scout on the Claude Agent SDK. Words only; the run's structure is scripted. |
| `lighthouse@13.4.1`, `puppeteer-core@25.10.0` | apps/web (dev) | The exit criterion's Lighthouse score, in snapshot mode on a paired session; Lighthouse's flow API takes a Puppeteer page. |
| `tsx` | root (dev) | `pnpm gen:protocol` runs a TypeScript generator regardless of the Node version's type stripping. |

**Waivers requested.** None.

### Appendix G

1. Layers inward only, dependency-cruiser green: yes; the SDK is its own package with the
   protocol as its only dependency.
2. External input validated at the edge: every event through the protocol's schema at the door;
   uploads sniffed from bytes; the agents route reads its body by hand and refuses a non-string
   name.
3. Idempotency keys on every command, handlers safe to run twice: yes, including the SDK's
   outbox, `run.approval` with a given id, and the dev route's memberships.
4. Workspace scope on every query: yes; the attachment's conversation-membership check and the
   uploads registry are keyed by workspace.
5. One transaction per event and its projections; `rebuild` reproduces them: yes, the replay
   test covers the M1.4 projections and the attachment rows.
6. Cursor pagination with an index per query: `GET /v1/events` unchanged; the new indexes are
   on `uploads` and `attachments(conversation_id)`.
7. Heavy operations off the request path: **no.** Thumbnails and GPS stripping run inside the
   `PUT /v1/uploads/:id` request. The job port is Phase 4's with video; recorded as known issue
   7 rather than waived, since a 20 MB upload processes in well under a second here.
8. Coverage thresholds met, and did any go down: met; branches went down 1.6 points in M1.6 and
   stay above the floor.
9. Property tests for new state machines: the run state machine and the policy engine's table;
   the projection's totality.
10. Deterministic tests: injected clock and ids everywhere in the server; the e2e suite uses
    real sockets and a real clock by design, with ceilings rather than exact timings.
11. Quarantined tests older than 48 hours: none.
12. Logs carry ids and no personal data: request ids, run ids, agent ids; the token never.
13. Metrics for what a runbook would need: none yet — Phase 6's.
14. Dependencies pinned, justified, maintained: yes, above.
15. Public APIs documented, reference regenerated: the SDK page, the HTTP reference, the event
    reference regenerated on every protocol change.
16. Blueprint nouns and language: yes; the words for states and tiers are the mockup's.
17. File and function sizes: the complexity limit enforces the function half; `session.ts`,
    `ConversationView.tsx` and `model.ts` are long files that read top to bottom.
18. Load within budget, numbers recorded: the scale run above; the 10k-message and 60 fps
    budgets are not measured yet (known issue 1).

## Demo script

On a clean checkout, Node 22 and pnpm:

1. `pnpm install`, then `pnpm dev`. The server prints a pairing code and writes
   `.chips/demo.json`; the web app is at the URL Vite prints.
2. Open the app, enter the code, press Pair. The sidebar shows PO-4471 with Scout.
3. **Agents → Add agent.** Name it "Relay". Copy the three lines into a terminal and run them:
   the first lists you and Relay; the third posts "Hello from my agent". Back in the app, the
   Messages row on Relay's card lights, and its conversation shows the line.
4. In another terminal, `pnpm example:scout`. In the PO-4471 conversation, type "Get PO #4471
   confirmed with Northwind and update the tracker." Watch the run panel: four hollow dots, then
   "Reading PO #4471…", two steps done with sources, then the approval card with the preview.
5. Press **Edit**, change the body, **Approve with edits**. Scout's terminal prints the decision;
   the card reads "Approved with edits by you"; the last two steps complete; the summary card
   appears with the receipt, the cost and the context ring at 41 percent. Needs you is empty.
6. Drop a PDF into the composer and send it. The file card shows its first page; Scout posts
   "Read <name> (application/pdf, N bytes)"; the room shows "Scout read <name>" and the Audit tab
   lists the fetch.
7. Turn the dial on the run panel to L3 and ask Scout again: the email is approved on the spot,
   by policy, and the audit says so.

Steps 2 to 6 are what `approval-loop.spec.ts`, `attachments.spec.ts`, `custom-connect.spec.ts`
and `decisions.spec.ts` run.

## Known issues

1. **The message list is not windowed.** Every line is in the DOM; the fold is rebuilt from
   every event on every flush. A thousand messages render and a fresh pairing reads them back
   within the numbers above; ten thousand would not meet section 4.4's 60 fps. Real windowing is
   the first thing Phase 2's desktop shell should do.
2. **Budget warnings are not produced.** Spend is tracked per agent; nothing appends
   `budget.warning` at 80 or 100 percent, and nothing pauses a run at the ceiling.
3. **A token cannot be revoked from the app.** The registry has `revoked_at` and the
   authenticator honours it; no route or screen sets it. Until then, `chipsd` restarts in dev
   mode revoke the demo token, and a Custom agent's token lives until the row is edited.
4. **No title bar: no search, no workspace switcher.** Search is the one MVP item from the
   mockup with nothing behind it yet.
5. **The run panel has no Artifacts section**, and `artifact.create` folds to a line, not a
   card.
6. **The Needs-you card carries less than the mockup's**: no avatar, no countdown, no risk
   tags; the room's card has them.
7. **Thumbnails and metadata stripping run on the request path**, not on a job port.
8. **Video and audio are stored and served, not processed**: no duration, no poster.
9. **The SDK has no upload helper**; an agent posts `upload_ids` after two HTTP calls of its own.
   More than one agent per connection (`hello.agents`) is not in the SDK.
10. **The price table and the policy rules have no editor**; the dial sets the level, rules
    arrive by `always`.
11. **An ask with several questions is answered as one event**, and the card shows local choices
    until then.
12. **More than four photos on a message show a "+N" tile with nothing behind it.**
13. **The Claude Agent SDK path in Scout has not been run.** No key here or in CI.
14. **The Node 22 CI leg has still not been observed** from this machine: `gh` is not
    authenticated and the repository is private. Everything runs on Node 26 locally.

## Questions for the reviewer

1. The approval card sits after the thread rather than inside the agent's message. Is the
   reason — a live ask never scrolls away — good enough, or should the card be in both places?
2. `POST /v1/agents` lets any person in the workspace add an agent. Solo mode has one person;
   is a workspace-level owner role needed before Phase 5's invites, or with them?
3. The SDK's `since` replays to handlers on the tick after `connect` resolves. Is that contract
   — attach your handlers synchronously after `await connect` — acceptable, or should `connect`
   take the handlers?
4. The gateway now handles a session's frames in order. That serialises a slow `submitEvent`
   behind a fast `ping`; the SDK relies on it. Is the trade right?

## Risks for the next phase

- **The desktop shell inherits the un-windowed list.** Tauri wraps this app; the 10k budget is
  measured on it. Windowing before wrapping, or the shell ships with the fault.
- **`chips connect` needs a settled token story**: issuing, showing once, revoking, rotating.
  M1.6 did the first two.
- **Hooks mode has the long poll and nothing else on the person's side.** The deferred-approval
  resume (a paused command-line run continuing hours later) is untested against a real harness.
- **The docs cold read.** A stranger read the SDK page at this gate and listed eighteen points;
  the page was rewritten against them, but the Phase 2 acceptance — install and connect in ten
  minutes without a question — has not been attempted end to end by anyone who did not build it.
