# Chips technical plan

Version 0.1 · 2 September 2026 · Status: ready for Phase 0
Revised 4 September 2026, mid-Phase 2 at Arjun's instruction: the nouns *harness* and *space* (section 6.1, open decision 5), M2.3, the Phase 2 demo script and Gate 2 focus, open decision 4, and a note on M7.3 — all from [ADR 0024](decisions/0024-a-harness-has-spaces-and-a-space-is-a-worktree.md). `STATUS.md` records the edit under Scope changes.

**Audience.** The implementing model (Opus, working in Claude Code inside this repository) and the reviewing model (Fable, at the end of every phase). Arjun owns the decisions in the blueprint and the gate verdicts.

> **Withdrawn, 7 September 2026 — the Claude Code integration is gone.** On Arjun's call the
> adapter, the bridge, the channel and the CLI commands were deleted entire:
> [ADR 0041](decisions/0041-chips-integrates-harnesses-that-run-themselves-not-the-cli-you-sit-at.md),
> recorded in `STATUS.md` under Scope changes. **M2.3 is withdrawn**, and every line in this plan
> that names Claude Code, `adapters/claude-code`, `chips bridge` or `chips channel` is history
> rather than work to do — marked inline where it could still be mistaken for an instruction. The
> harnesses Chips is for are the ones that run themselves: Jacobian, Hermes, OpenClaw, anything on
> `@chipschat/harness`. Nothing else in the plan changed; this note is the only edit made outside a
> gate, and it is a correction, not a revision.

**Companion documents.** The product blueprint is `docs/chips-blueprint.html`. The two integration reports are `docs/jacobian-to-chips-mapping.md` and `docs/openclaw-class-harnesses.md`. This plan does not repeat them; it points at them.

---

## 0. How to use this plan

### 0.1 Files that carry state

| File | Purpose | Who writes it |
|---|---|---|
| `docs/technical-plan.md` | This plan. Phases, milestones, acceptance criteria, gate protocol. | Fable, with Arjun. Edited only at phase gates. |
| `docs/STATUS.md` | The live checklist: current phase, milestone checkboxes, blockers, last commit reviewed. Rewritten as work progresses. | The implementer, every session. |
| `docs/decisions/NNNN-title.md` | Architecture decision records. One per decision listed in section 1, plus any new decision the implementer has to make. | The implementer. |
| `docs/reviews/phase-N-packet.md` | The implementer's end-of-phase report. | The implementer, before the gate. |
| `docs/reviews/phase-N-review.md` | Fable's review with a verdict and a ranked fix list. | Fable, at the gate. |

### 0.2 Session ritual for the implementer

1. Read `docs/STATUS.md`, then the current phase in this plan, then the most recent `docs/reviews/phase-*-review.md`.
2. Pick the next unchecked milestone task. Work in small commits on `main` (trunk-based; feature branches only for experiments). Conventional Commits, DCO sign-off on every commit.
3. Every task ends with tests and docs, not just code (see 0.4).
4. Before ending a session, or before any `/compact`, update `docs/STATUS.md`: what is done, what is half-done and where, what is blocked. Context is disposable; the file is not.
5. Never skip a failing test to move on. Never widen a milestone's scope without adding it to `STATUS.md` under "Scope changes" with a reason.
6. If a decision in section 1 turns out to be wrong, do not silently work around it. Write a new ADR that supersedes it and note it in the phase packet.

### 0.3 Phase gate protocol: compact, then review with Fable

Every phase ends the same way. This is the process Arjun asked for, and it is part of the plan, not an afterthought.

1. **Finish.** All milestone acceptance criteria in the phase are met and checked off in `STATUS.md`. CI is green on `main`.
2. **Write the packet.** The implementer writes `docs/reviews/phase-N-packet.md` from the template in Appendix F: what shipped, deviations from the plan and the blueprint, test commands and their output, the demo script, known issues, open questions, and the risks it sees for the next phase.
3. **Tag.** `git tag phase-N-complete` on the reviewed commit. Push if a remote exists.
4. **Compact.** Arjun runs `/compact` in the implementer's session. Nothing is lost because steps 1 to 3 wrote everything to disk.
5. **Review.** Arjun starts the review with Fable using the kickoff prompt in Appendix F. Fable reads the packet, this plan, the blueprint, and the diff since the previous tag; runs the test suite; walks the demo script; judges the work against the phase's acceptance and exit criteria, the gate focus list, and the engineering standards in section 6 using the checklist in Appendix G; and writes `docs/reviews/phase-N-review.md` with one of three verdicts:
   - **Pass.** Next phase may start.
   - **Pass with fixes.** A ranked list of fixes the implementer applies before the next phase; Fable confirms them in a short follow-up.
   - **Fail.** The phase reopens with a fix plan. A second fail on the same phase triggers a re-planning conversation with Arjun rather than a third attempt.
6. **Start the next phase** in a fresh context: the implementer reads the review first, then the ritual in 0.2 applies.

Mid-phase compaction is fine and expected for long phases. The rule is the same: update `STATUS.md` before compacting.

### 0.4 Definition of done, for any task

- Code with types; no `any` without a comment explaining why.
- Tests at the right level (section 4.1), green locally and in CI.
- Docs updated: the protocol reference regenerates itself; guides and concept pages are edited by hand in the same commit.
- `STATUS.md` checkbox ticked.
- Meets the engineering standards in section 6, and the self-review checklist in Appendix G has been run.
- If the task adds a user-visible screen or card, it matches the blueprint's mockups in structure and tokens. Deviations are allowed, but they are written down in the packet.

### 0.5 Sizing

Duration estimates below assume one focused implementer session stream. They are placeholders for planning, not commitments. Phases are sized so that each fits a handful of sessions with at most one or two compactions.

### 0.6 Open decisions

Questions raised by a phase that a later phase has to answer. Added at a gate, removed when the answer is written into an ADR or a milestone. Each one says what it blocks, so it is found by the person it blocks.

*Answered so far: whether an agent's autonomy is a column or a projection — [ADR 0019](decisions/0019-policy-is-a-projection.md), 3 September 2026; when the code takes the nouns harness and space — the same day they were chosen, [ADR 0024](decisions/0024-a-harness-has-spaces-and-a-space-is-a-worktree.md), 4 September 2026; who may add a harness and revoke its token — any person adds one, its owner holds its tokens, [ADR 0023](decisions/0023-an-agents-owner-holds-its-tokens.md), 4 September 2026; whether the bridge registers `PreToolUse` as a gate — no: Chips is asked only when Claude Code would have asked at the terminal, Arjun, 5 September 2026 (`STATUS.md`, M3.5; ADR 0025 stands as written); two harnesses in one worktree — merge, the second joins the space the first opened, and separate worktrees are the rule against conflicts, [ADR 0033](decisions/0033-two-harnesses-in-one-worktree-share-one-space.md), 5 September 2026; how far `always` reaches — the room, for that harness, and handing the ask to a role does not widen it, [ADR 0036](decisions/0036-an-approval-is-handed-on-by-an-event-and-a-lead-answers-what-policy-hands-it.md), 6 September 2026; may a lead answer a specialist's approval — yes, when a person's rule hands it an ask that does not matter, never the specialist's own refs, never money, a deletion or an external action, ADR 0036 and its Gate 5 addendum, 6 September 2026.*

| # | Question | Raised | Blocks |
|---|---|---|---|
| 9 | **May a named person outside the room answer?** Since M5.5 an approval that names a viewer is sent to them wherever they are, and the door admits a *harness* so named from outside the room (rule 9); a person's decision from outside is still refused (rule 5), so handing an ask to somebody outside the room is refused rather than widened (Gate 5). The blueprint has a harness's owner "receive its escalations by default" wherever the harness works. Admitting a named person means the door standing aside for them as it does for the lead, and a client that draws a card for a room it is not in. | Phase 5 review, finding 2 | M4.2 (what the phone's Needs you shows for an ask handed to somebody outside the room), and the policy work in Phase 6 |
| 10 | **A rule that names a role nobody holds.** `role:finance` in a rule resolves to nobody — the protocol takes any `role:` word — and the ask falls to the harness's owner when they are in the room, else to anyone there but a guest. Refuse such a rule at `policy.updated`, or take it as the first custom role (the blueprint's `role:ops_lead`)? | Phase 5 review, finding 2 | Phase 6's policy work, and Phase 8's roles |
| 8 | **How does an ephemeral child speak?** `task.child` mints a transient participant and opens a lane, but the child has no token and the lead's is refused as another harness's, so nothing can post into the lane (Phase 3 packet, known issue 1). Either the lead's connection presents its children (`hello.agents`, one connection presenting several harnesses, which the SDK does not do yet) or a child gets a token of its own; until one is chosen a `task.child` opens a lane nobody can work. | Phase 3 review, finding 8 | M7.1 (sub-agent sessions as lanes), and any lead that really spins up a child |
| 4 | **Does a second Codex app-server client receive approval requests?** Codex answers approvals as JSON-RPC requests to "the connected client", and the docs do not say whether a thread with two clients — its own TUI over `codex --remote` and a Chips bridge — sends them to both. If not, Chips can drive a Codex thread but not co-drive one with the terminal. Try it before designing around either answer. | M2.3 design, [ADR 0024](decisions/0024-a-harness-has-spaces-and-a-space-is-a-worktree.md) | M7.3 |
| 1 | **The disclosure addresses have no mailbox.** `SECURITY.md` names `security@chipschat.ai` and `CODE_OF_CONDUCT.md` names `conduct@chipschat.ai`. Neither exists, and the repository is private, so nobody can reach either yet. Both must be real and monitored before the repository is public — a security policy that names an address nobody reads is worse than none, because it tells a finder they have been heard. | Phase 0 packet, known issue 8 | M7.7, and anything that makes the repository public earlier |

---

## 1. Fixed decisions

Each item becomes an ADR in Phase 0 (`docs/decisions/0001` onward). The implementer may challenge any of them in an ADR, but must not silently deviate.

1. **Language and repo.** TypeScript everywhere, strict mode, Node 22 LTS. One monorepo with pnpm workspaces and Turborepo. Biome for lint and format. Vitest for tests.
2. **Server shape.** `chipsd` is one Node process: Hono for HTTP, `ws` for WebSocket, in-process job queue for media processing. Packaging into a single executable is a Phase 6 decision (Bun `--compile` or Node SEA), not a Phase 0 one.
3. **Storage.** Kysely as the query builder with a single schema definition. SQLite via `better-sqlite3` in solo mode from Phase 0. Postgres via `pg` arrives in Phase 6 with the same migrations. No ORM.
4. **Event-sourced core.** An append-only `events` table per workspace with a monotonic `seq`. Every Agent Connect event and every human action is an event. Projections (conversations, messages, runs, approvals) are updated in the same transaction. The audit log is a read of the events table, never a separate write.
5. **Realtime.** One WebSocket endpoint serves people and agents. Frames carry `seq`; clients resume with `since`. Every write from a client carries an idempotency key. Heartbeats every 20 seconds; the server closes silent sockets at 60.
6. **Auth.** Solo mode: device keys (Ed25519) for people, paired by QR; agent tokens (256-bit random, stored hashed, scoped to one agent and revocable). Passkeys arrive with invites in Phase 5. No passwords, ever.
7. **Protocol.** Zod schemas in `packages/protocol` are canonical. JSON Schema, TypeScript types and the docs reference are generated from them. `hello` negotiates `protocol: {min, max}`. Semantic versioning; breaking changes only at major versions after 1.0.
8. **Policy engine.** A pure function: `evaluate(action, agentPolicy, workspacePolicy) -> {decision: allow | ask | deny, approvers?, reason}`. Autonomy levels L0 to L3 are presets that expand to rules. Rules match on `kind` globs and flags (`external`, `irreversible`, `money_usd`). Tested exhaustively with a table.
9. **UI.** React 19 with Vite. Plain CSS with the blueprint's tokens in `packages/ui`, no utility framework, so the design language survives. Radix primitives for accessibility. The desktop app is Tauri 2 wrapping the web app. Mobile is Expo, sharing `packages/core` (state and protocol client), not UI components.
10. **Attachments.** Content-addressed store keyed by SHA-256, upload slots, MIME sniffed from bytes, thumbnails with `sharp`, GPS stripped by default, signed URLs that expire in 10 minutes and are bound to the requesting token. Local disk in solo mode; S3-compatible in Phase 6. Video transcoding with ffmpeg in Phase 4.
11. **Identifiers.** ULIDs with type prefixes: `usr_`, `hrn_`, `spc_`, `msg_`, `run_`, `stp_`, `apr_`, `qst_`, `lane_`, `att_`, `ws_`. Always strings. (`agt_` and `conv_` until 4 September 2026; ADR 0024.)
12. **Testing.** Vitest for unit and integration (integration tests run against a real SQLite file in a temp dir), Playwright for the web app, the conformance kit for adapters, and one golden scenario (Appendix A) that every layer must pass.
13. **Docs.** Astro Starlight in `apps/docs`. The protocol reference is generated. Every code sample in the docs is a file under `apps/docs/samples/` that CI executes. Broken links fail the build.
14. **Licensing and contribution.** Apache-2.0 at the root, CC BY 4.0 for the spec text, DCO sign-off, `SECURITY.md` with a disclosure address, `ee/` reserved but empty until Phase 8. *Revised 6 October 2026 (ADR 0128): the protocol, SDK, conformance kit, examples and adapters stay Apache-2.0; the server, CLI, relay and apps are FSL-1.1-ALv2 and need a CLA as well as sign-off; `LICENSING.md` is the map.*
15. **Telemetry.** None by default. Local metrics only. Any opt-in reporting is a Phase 7 decision made in the open.
16. **Architecture style.** Ports and adapters with an inward dependency direction (section 6.1), enforced by `dependency-cruiser` in CI from the first commit. Storage, transport, media and the relay are adapters behind ports; the domain never imports a framework.

---

## 2. Repository layout

```
chips/
  apps/
    web/            React app; the desktop shell and browsers load this
    desktop/        Tauri 2 shell (Phase 2)
    mobile/         Expo app (Phase 4)
    docs/           Starlight docs site; samples/ executed in CI
  packages/
    protocol/       Zod schemas, generated JSON Schema, types, reference
    core/           protocol client, state, cache; shared by web and mobile
    ui/             tokens, primitives, cards (web)
    sdk-ts/         @chipschat/agent
    sdk-py/         chips-agent (Phase 7)
    conformance/    adapter test kit and checklist
  server/           chipsd: Hono, ws, Kysely, media jobs
  cli/              chips: serve, pair, connect, disconnect, bridge, doctor, conformance, export, import
  packaging/        the installer script, the Homebrew formula, the launchd templates
  adapters/
    claude-code/    hooks and channel (Phase 2) — REMOVED 7 September 2026, ADR 0041
    jacobian/       channel plugin, vendored into the Jacobian repo (Phase 2) — MOVED INTO JACOBIAN 12 September 2026, ADR 0051
    openclaw/       gateway bridge (Phase 7)
    acp/            generic Agent Client Protocol bridge (Phase 7)
    codex/          app-server bridge (Phase 7)
  relay/            outbound tunnel and push relay (Phase 4)
  examples/
    scout/          a sample agent on the Claude Agent SDK that plays the golden scenario
  docs/             this plan, STATUS.md, decisions/, reviews/, the blueprint and reports
```

---

## 3. Phases

Each phase lists its goal, entry conditions, milestones with acceptance criteria, exit criteria, a demo script, and what the gate review should focus on.

### Phase 0 · Foundation

**Goal.** The skeleton everything else stands on, ending with a working approval loop in a browser prototype.
**Duration.** About two weeks.
**Entry.** A git repository at `~/Work/Chips` on `main`, containing `docs/` (this plan, the blueprint, the reports, `STATUS.md`) and nothing else yet.

#### M0.1 Repository and tooling

- [ ] pnpm workspace; Turborepo pipelines `build`, `test`, `lint`, `typecheck`; Biome config; Vitest config with coverage. (The repository already exists on `main` with the docs committed.)
- [ ] GitHub Actions: lint, typecheck, test on every push; cache pnpm store.
- [ ] `LICENSE` (Apache-2.0), `README.md` (one paragraph from the blueprint, install placeholder), `CONTRIBUTING.md` with DCO, `SECURITY.md`, `CODE_OF_CONDUCT.md`.
- [ ] `docs/STATUS.md` from Appendix D; `docs/decisions/` with ADRs 0001 to 0016 from section 1 (short: context, decision, consequences).
- [ ] Engineering guardrails from section 6 wired into CI: `dependency-cruiser` with the layer rules and a no-cycles rule, Vitest coverage thresholds, `fast-check`, `pino`, the typed config schema, and a job that fails on any violation.

Acceptance: a clean clone runs `pnpm install && pnpm test && pnpm lint` green locally and in CI.

#### M0.2 Protocol package v0

- [ ] Envelope schema: `{v, type, id, ts, workspace_id, conversation_id?, run_id?, seq?, idempotency_key?, actor}`.
- [ ] Agent to Chips: `run.started` (optional `plan[]`, `session_ref`), `run.status`, `step.log` (stable `step_id`, `status: started|done|failed`, tool, summary, source, duration), `message.post` (text, attachments), `approval.request` (action, preview, risk[], sources[], expires_in, approvers, editable, resume_token?), `question.ask` (1 to 4 questions, 2 to 4 options each, multiSelect, allow_free_text, timeout), `artifact.create`, `checkpoint`, `handoff`, `task` (to, on_behalf_of, origin, goal, attachments, link_to, child?), `usage` (scope, model, tokens, cost_usd?), `context.usage` (used, limit, model, compacted), `approval.executed`, `run.completed`, `run.failed`.
- [ ] Chips to agent: `hello` (protocol range, agent manifest, autonomy, policy, budget), `message.new` (from with role, attachments with signed URLs), `run.requested` (lane, trail), `approval.resolved` (decision, scope once|session|always, updated_input?, reason?, resolved_by, resolved_elsewhere?), `question.answered`, `run.steer` (mode steer|followup|interrupt), `run.pause`, `run.resume`, `run.cancel`, `policy.updated`, `budget.warning`, `lane.updated`, `feedback`, `receipt` (queued|steered).
- [ ] Generators: `pnpm gen:protocol` writes JSON Schema, a `types.ts`, and `apps/docs/src/content/docs/reference/events/*.md`.
- [ ] One fixture per event under `packages/protocol/fixtures/`; a test parses every fixture; the docs reference embeds them.

Acceptance: every event has a schema, a fixture, and a generated reference page. `pnpm gen:protocol` is idempotent and CI fails if generated files are stale.

#### M0.3 Storage and the event log

- [ ] Kysely setup with SQLite; migration runner; `chipsd migrate`.
- [ ] Tables: `workspaces`, `participants` (people and agents; agents carry `owner_id`, `autonomy`, `budget_usd`, `parent_id`, `ephemeral`), `devices`, `agent_tokens`, `conversations`, `memberships`, `messages`, `runs`, `steps`, `approvals`, `questions`, `attachments`, `lanes` (schema reserved, unused until Phase 3), `events` (append-only, `seq` per workspace), `read_state`.
- [ ] Write path: `append(event)` inside a transaction that also applies the projection. Read path: `since(workspace, seq)`.
- [ ] Replay: `rebuild(workspace)` drops projections and replays events.

Acceptance: a property test generates random valid event sequences, applies them, rebuilds from zero, and gets identical projections. 10,000 events append and replay in under two seconds on a laptop.

#### M0.4 Gateway skeleton

- [ ] Hono app: `GET /v1/health`, auth middleware (agent bearer tokens; device-key signed requests for people), error envelope.
- [ ] Hooks-mode ingest: `POST /v1/runs/:id/events`, `POST /v1/agents/:id/events`, `GET /v1/approvals/:id/wait?timeout=` (long-poll), `POST /v1/uploads` (stub returning a slot).
- [ ] WebSocket `/v1/ws`: `hello` exchange with protocol negotiation, `subscribe` by workspace or conversation, resume with `since`, heartbeats, idempotency on writes, backpressure (drop the socket if 1,000 frames are unacknowledged).
- [ ] Fan-out: an event appended is delivered to every subscriber of its workspace or conversation, in `seq` order.

Acceptance: integration test with two people clients and one agent client: an approval round-trip in both hooks mode and WebSocket mode; a client that disconnects mid-stream and resumes with `since` receives exactly the missed events, once.

#### M0.5 Docs site skeleton

- [ ] Starlight site with the sections from the blueprint: Start here, Concepts, Connect, Reference, Operate, Supervise, Enterprise, Contribute.
- [ ] Generated reference wired in; a Concepts page per noun with placeholder text and the blueprint's diagrams.
- [ ] `pnpm docs:check`: executes every file in `apps/docs/samples/` and fails on any non-zero exit; link checker.

Acceptance: `pnpm docs:build` passes in CI; a deliberately broken link in a test branch fails CI.

#### M0.6 The approval loop, in a browser

- [ ] Minimal page in `apps/web` using the blueprint tokens: one conversation, one agent, an approval card with Approve, Edit, Deny.
- [ ] A scripted agent in `examples/scout` (raw WebSocket, no SDK yet) posts `run.started`, `step.log` x3, `approval.request`.
- [ ] Clicking Approve appends `approval.resolved`; the agent receives it and posts `run.completed`; the page shows the audit trail for the run.

Acceptance: a Playwright test runs the loop end to end. The demo script below works on a clean machine.

**Exit criteria.** M0.1 to M0.6 accepted; ADRs written; CI green; `STATUS.md` current.

**Demo script.** `pnpm dev` starts chipsd and the web page. `pnpm example:scout` connects the scripted agent. Approve in the browser. Watch the agent complete. Open `/audit` and see five events with sequence numbers.

**Gate 0 review focus.** Protocol shape and naming against the blueprint. Event-log invariants and the replay test. The auth model's weak points. Whether the tests would catch a regression. Repo hygiene and the ADRs.

---

### Phase 1 · The core loop in the browser

**Goal.** The full supervision loop for one person and a few agents in the web app: conversations, runs, receipts, approvals, questions, the Needs-you queue, autonomy and policy, attachments, and an SDK.
**Duration.** About four weeks.
**Entry.** Gate 0 passed.

#### M1.1 Design system

- [ ] Tokens from the blueprint: palette, dark and light, type (Bricolage Grotesque, Instrument Sans, JetBrains Mono, with fallbacks), radii, shadows, motion with reduced-motion support.
- [ ] Primitives and cards: Avatar (person circle, agent squircle with status ring), ContextRing, Pill, Button, Card, ApprovalCard, QuestionCard, Receipt, Timeline, AutonomyDial, Composer, AttachmentChip, RouteCard (visual only, wired in Phase 3), TaskCard (same), TierBadge.
- [ ] `/kitchen-sink` route rendering everything in both themes.

Acceptance: visual regression snapshots for every component in both themes; axe checks pass on the kitchen sink.

#### M1.2 App shell and conversations

- [ ] Sidebar with Needs you (count), Chats, Agents (fleet with status and context ring), Channels placeholder; conversation view; composer with slash commands stub.
- [ ] `packages/core`: protocol client with resume, optimistic sends, IndexedDB cache, read state.
- [ ] Sign the full request-target, path and query, and add a per-device nonce or a short-lived single-use socket ticket, so a captured signature or a logged `/v1/ws` URL is worth nothing after one use (phase-0-review, finding 5). The signer moves into `packages/core` with the client; ADR 0006 gains the signed payload as a consequence.
- [ ] Scope reads and subscriptions by membership: `GET /v1/events`, `subscribe` and fan-out deliver only the conversations the credential is a member of, and an agent token sees no conversation its agent is not in (phase-0-review, finding 6).
- [ ] Message list with virtualization; safe Markdown rendering; mentions of agents and people.

Acceptance: two browser tabs stay in sync under a scripted 500-message burst; reloading offline shows cached history; no unhandled rejections in the console during the Playwright run; a member of one conversation cannot read or receive another's events, tested beside the "another workspace" cases; a signed request replayed with a different query, or a socket URL reused, is refused.

#### M1.3 Runs, receipts, status, context, cost

- [ ] Run state machine with transitions enforced server-side; timeline from `plan` and `step.log`; `run.plan` replaces remaining steps.
- [ ] Status pill with verb phrase; receipt collapsible under the message; cost meter from `usage` with a per-workspace price table; context ring from `context.usage` with 70 and 90 percent thresholds and a compaction tick on the timeline.
- [ ] Run panel; pause, stop, steer (with `mode`) from the UI; the agent gets `receipt` frames.
- [ ] `from` on `run.steer` is a participant ref Chips fills from the registry and the membership; a client's value is replaced, the way the Phase 0 gate made `resolved_by` and `ts` the server's (phase-0-review follow-up). The same applies to `feedback` when M3.4 sends it.

Acceptance: the golden scenario's events produce exactly the expected UI states (Appendix A), asserted by Playwright.

#### M1.4 Approvals, questions, Needs you, policy

- [ ] ApprovalCard with Approve, Edit (updated input), Deny (reason), and scope once, session, always. Expiry countdown; fallback on expiry per policy; first answer wins with a "resolved elsewhere" state.
- [ ] QuestionCard with the fixed shape; free text; timeout and no-answer outcome.
- [ ] Needs-you queue with the three tiers; keyboard shortcuts.
- [ ] Policy engine and the autonomy dial per agent per conversation; workspace caps; auto-approvals logged as events; injection flag when `sources` includes external content.
- [ ] Split `participants` per [ADR 0019](decisions/0019-policy-is-a-projection.md): identity stays a registry row, and `autonomy`, `budget_usd`, `spent_usd` and the rules become an `agent_policy` read model built from `policy.updated` and `usage`. `workspaces.max_autonomy` moves the same way. Creating an agent appends its initial `policy.updated`; nothing writes a policy directly. The engine reads the projection, so "why was this allowed at 3pm?" is answerable by replaying to that sequence number.

Acceptance: policy table test covers every level against every risk flag combination; Playwright covers approve, edit, deny, expire, and resolved-elsewhere; the audit view shows who decided what and when; the replay property test in `server/src/infrastructure/store/replay.test.ts` covers `agent_policy`, so a rebuild from zero reproduces every policy the engine ever read.

#### M1.5 Attachments

- [ ] Upload slots, content-addressed local store, MIME sniffing, thumbnails, GPS stripping with a keep option, signed URLs bound to the token, HTML and SVG served as downloads.
- [ ] Photo grid (up to four), file card with PDF first-page preview, paste and drop in the composer.
- [ ] Agent side: attachments in `message.new`; `message.post` with `upload_id`s; every agent fetch is an audit event.

Acceptance: a 20 MB photo uploads with a thumbnail; the agent downloads it and the audit log shows the fetch; an uploaded `.html` file downloads instead of rendering.

#### M1.6 SDK v0 and the custom connect flow

- [ ] `@chipschat/agent`: `connect`, `runs.start`, `run.status`, `run.step`, `run.approval`, `run.question`, `run.context`, `run.usage`, `run.complete`, `run.fail`, `on('message.new')`, reconnect with resume, idempotency keys, typed from `packages/protocol`.
- [ ] In the app: Add agent, Custom, which creates the agent, issues a token, and shows the three curl lines; the connection checklist on the agent profile lights rows as event types arrive.
- [ ] `examples/scout` rewritten on the SDK and the Claude Agent SDK, playing the golden scenario with a real model.

Acceptance: the SDK docs page has a sample that runs in CI against a local chipsd; a timed test shows Custom connect from token to first message in under five minutes; the golden scenario passes with the real agent.

**Exit criteria.** M1.1 to M1.6 accepted; Start here draft written; Playwright suite green; Lighthouse accessibility score above 90 on the main screens.

**Demo script.** Start chipsd and the web app. Add agent, Custom, paste the curl lines into a terminal: the checklist lights Messages. Run `examples/scout`: send "Get PO #4471 confirmed with Northwind", watch steps, approve the email, see the summary and the cost. Drop a PDF into the composer and watch the agent read it.

**Gate 1 review focus.** Fidelity to the blueprint's desktop mockup. Policy engine correctness. Signed URL and token security. SDK ergonomics as a cold reader. Performance with 1,000 messages and 20 agents.

---

### Phase 2 · Desktop app, CLI, and the first real harnesses

**Goal.** Run on the Mac mini; connect Jacobian and Claude Code; a stranger can install from the docs.
**Duration.** About three weeks.
**Entry.** Gate 1 passed.

#### M2.1 The `chips` CLI

- [ ] `chips serve`: starts chipsd, creates the workspace on first run, prints a QR code and a pairing code, advertises over mDNS.
- [ ] `chips connect <claude-code|jacobian|custom>`: explains what it will change, then writes config, registers the agent, stores the token in the keychain, opens the connection.
- [ ] `chips doctor`: checks server reachability, token validity, pairing, hooks firing, disk space, clock skew; prints one fix per problem with a docs link.
- [ ] `chips export` and `chips import` of a workspace folder.
- [ ] Installer script and a Homebrew formula draft.

Acceptance: `chips doctor` detects and explains five induced failures in a test; export then import yields identical projections.

#### M2.2 Desktop shell

- [ ] Tauri 2 app for macOS wrapping `apps/web`; server discovery over mDNS; pairing flow; native notifications with Approve and Deny actions; menu bar badge with the Needs-you count; deep links `chips://`.
- [ ] Build and notarization scripts; a signed `.dmg` in CI artifacts.

Acceptance: approve from a macOS notification; the app reconnects after the server restarts without user action.

#### M2.3 Claude Code adapter — WITHDRAWN 7 September 2026 ([ADR 0041](decisions/0041-chips-integrates-harnesses-that-run-themselves-not-the-cli-you-sit-at.md))

*Built 4 September 2026, removed entire on 7 September. Everything below is a record of what was
built and then deleted. Do not implement it.*


Design: [ADR 0024](decisions/0024-a-harness-has-spaces-and-a-space-is-a-worktree.md) and the blueprint's "Harnesses and sessions" section. A harness is Claude Code on a machine; a space is a worktree; a session is a visit.

- [ ] `adapters/claude-code`: `chips connect claude-code` writes `http` hooks: SessionStart to find or create the space by worktree and mark the session live, SessionEnd to mark it closed, UserPromptSubmit to `run.started` with the prompt as the goal and the session in `session_ref`, PreToolUse and PermissionRequest to the approval gate with deferred resume, PostToolUse to `step.log`, Stop to `run.completed` plus `usage` from the transcript, PreCompact to `checkpoint` and `context.usage`, Notification to `run.status`, SubagentStart and SubagentStop to `task` and lane stubs.
- [ ] Two ways in, and the composer says which before the message is sent: the Chips channel — an MCP server declaring `claude/channel` and `claude/channel/permission`, documented with the development flag it needs today — into a session that is live; `claude -p --resume <session-id>` into one that is not. Never both on one session.
- [ ] `chips connect claude-code` run twice on one machine finds the harness it made; `chips disconnect claude-code` undoes what `connect` wrote, from the record it keeps.
- [ ] Harnesses roll up per harness — live sessions, working, needs you; the harness card lists its spaces with their worktree and sessions; the space shows a session strip, a "from" tag on messages typed in a terminal, and a line under the composer; the run panel names the run's session, links to the transcript, and offers one run per live session.
- [ ] Mapping page in the docs — hook to event, worktree to space — with the plain statement of what differs between chatting in the terminal and in Chips, and what does not.

Acceptance: two Claude Code sessions in two worktrees of a sample repo show as two spaces of one harness, with runs, receipts and approvals; a third session in the first worktree joins the first space and its runs are told apart; approving in Chips unblocks the tool; a deferred approval answered after the session ended resumes correctly; a message from Chips reaches a live session through the channel and a closed one by resuming it, and the composer said which before it was sent; closing every terminal leaves the space in place, and reopening one in the same worktree continues it.

#### M2.4 Jacobian adapter

- [ ] `adapters/jacobian`: a channel plugin implementing `ChatChannel` and `ReplySession` per `docs/jacobian-to-chips-mapping.md`, read with ADR 0024: Jacobian is one harness and each of its JSpaces — Chips' word for Jacobian's tree node (ADR 0033) — is a space, J at the root; with a script to vendor it into the Jacobian repo. **Changed 12 September 2026 ([ADR 0051](decisions/0051-a-harnesss-adapter-lives-with-the-harness.md)):** the plugin and its tests live in Jacobian's own repository; `adapters/jacobian` and the vendor script are gone, and Chips connects Jacobian as a custom harness with the dial off (`chips connect custom --name Jacobian --no-dial`). The seams checklist below stays Jacobian's.
- [ ] A checklist for the four Jacobian-side seams from that report: an outbound source on replies, `spaceId` on permission requests, a per-JSpace budget check, tool-result step logs. Those changes land in the Jacobian repo; this repo tracks them in the packet.

Acceptance: Telegram and Chips run side by side; a placed message and a `hand_down` appear in Chips as runs with steps; an approval answered in Chips settles the same record Telegram would.

#### M2.5 Conformance kit v0

- [ ] `packages/conformance`: a fake Chips server plus a driver that walks an adapter through the golden scenario and prints the checklist rows: Messages, Approvals, Steps, Usage, Context, Lanes.
- [ ] `chips conformance <adapter>` and a CI job per adapter.

Acceptance: both adapters pass Messages, Approvals, Steps and Usage; the report format matches the in-app checklist.

#### M2.6 Docs

- [ ] Start here, for real. Connect guides: Claude Code, Jacobian, Custom. Operate: Mac mini. Concepts pages filled in.

Acceptance: a cold reader (Fable, at the gate) installs from the docs on a clean machine and connects a custom agent in under ten minutes without asking a question.

**Exit criteria.** Arjun's Mac mini runs chipsd with Jacobian connected; the desktop app is paired; the docs pass the cold-read test.

**Demo script.** On the Mac mini: `chips serve`. On the laptop: open the desktop app, pair by QR. `chips connect jacobian` and `chips connect claude-code` (changed 12 September 2026, ADR 0051: `chips connect custom --name Jacobian --no-dial`). Send Jacobian a message from Chips and from Telegram; see both. Trigger a tool in Claude Code that needs approval; approve from the Mac notification. Open Claude Code in a second worktree and see a second space under the same harness; send the first a message from Chips while its terminal is open, and the second one after closing it.

**Gate 2 review focus.** Measured setup time. Adapter behavior across restarts and reconnects. Deferred approvals in hooks mode. The worktree key and the two inbound paths, and whether the docs say plainly what differs between the terminal and Chips. Local install security: token storage, what mDNS exposes, file permissions. The cold-read test.

---

### Phase 3 · Lead and lanes, and spaces with several harnesses

**Goal.** Routing between harnesses, or between spaces of one, with one object and two views.
**Duration.** About three weeks.
**Entry.** Gate 2 passed.

#### M3.1 Lane data model and events

- [ ] `lanes` table live: `lane_id`, `run_id`, `home_space_id`, `linked_space_ids`, `trail`, `delivery` (direct, queued_to_lead, failed), `depth`.
- [ ] `task` from a harness creates a lane and a run on the target; `run.requested` delivered to the specialist with the trail; `lane.updated` delivered to the lead; ephemeral children from `task.child` become transient participants inheriting owner, autonomy and budget.
- [ ] A lane between two spaces of one harness — Jacobian's `hand_down`, a Claude Code subagent — is the same object as a lane between two harnesses, keyed by the harness's own trail (`trace_id`, `agent_id`); the worker level that ADR 0024's addendum folded into a task JSpace's space is where those lanes live.
- [ ] Depth limit three with flattening beyond it; cancel cascade with confirmation; cost roll-up into the lead's run.

Acceptance: invariant tests: a lane's messages exist once in `messages`; read state and notifications are per lane; cancelling a lead's run cancels its lanes; depth four flattens into steps.

#### M3.2 Lane UI

- [ ] RouteCard wired: collapsed and expanded states, fan-out header, mini composer that posts to the lane with the lead copied; TaskCard with the trail and quoted origin in the specialist's chat; Needs-you cards carry the trail; fleet rows show "Working for X"; lead tag; cost roll-up in the run panel; the lead-may-approve notice line.

Acceptance: Playwright scenario from the blueprint's lane mockup: Scout routes to Ledger, Ledger replies once, both chats show it, Scout's synthesis follows, the lane collapses.

#### M3.3 Group spaces

- [ ] Several harnesses and people in one space; mentions address a harness; harness-to-harness traffic collapsed by default and inspectable; membership management. Two harnesses in one worktree may merge their spaces here, or be linked (ADR 0024; open decision 6). A space can be retitled and closed, by a person or by the harness that opened it, so a room opened before a rule changed does not keep a wrong name for ever.

Acceptance: a space with two harnesses and two people where an approval from one harness is answered by the right person per policy.

#### M3.4 Feedback and approval outcomes

- [ ] Reactions and a "what went wrong" note become `feedback` events to the harness. (`approval.executed` already turns the card to sent or failed, since M1.6; both adapters send it.)

Acceptance: the SDK sample reacts to a thumbs-down by posting a fix.

#### M3.5 Adapters and SDK

- [ ] Jacobian `hand_down` and `hand_back` map to `task` and lane posts keyed by `trace_id`; Claude Code subagents map to lanes; SDK gains `run.task()` and the `run.requested` handler; conformance gains the Lanes row.
- [ ] **The deferred approval** (Gate 2, condition 1). A decision that arrives after the Claude Code gate has handed the question back to the terminal starts a turn in that session that carries it — through the channel when the session is live, by `claude -p --resume` when it is closed — and the card says which; a decision the terminal has already made is told on the card rather than acted on twice. The bridge already writes `resume_token` on every request.
- [ ] A Telegram-started turn in Jacobian is visible in Chips only once the turn-events seam lands in Jacobian (Phase 2 packet); the adapter's `Run` is the shape it drives.

Acceptance: a Jacobian placement and a delegation both render as lanes; conformance passes Lanes for both adapters; the deferred approval resumes a closed session and reaches a live one, in the bridge's integration test.

**Exit criteria.** The extended golden scenario (Scout routes to Ledger) passes with the real sample agent; both adapters pass Lanes; the page chipsd serves carries a Content-Security-Policy (Gate 2, condition 2).

**Demo script.** Ask Scout whether the Northwind quotes are in line with last quarter. Watch the route card appear, unfold, and collapse when Scout summarizes. Open Ledger's chat and see the same reply once. Cancel a lane and watch Scout adapt.

**Gate 3 review focus.** The one-object-two-views invariants under concurrency. Approval routing inside lanes. Loop and depth safety. Whether attribution is always obvious on screen.

---

### Phase 4 · Mobile and the relay

**Goal.** Decisions from a phone anywhere, against a server at home.
**Duration.** About five weeks.
**Entry.** Gate 3 passed — and, since Phase 5 was built first (Gate 5, below), Gate 5 passed.

#### M4.1 Relay v0

- [ ] `relay/`: the home server dials out with its device key; phones connect to the relay; end-to-end encryption between phone and server (a Noise-based handshake with libsodium; the relay forwards ciphertext only); pairing QR embeds the relay address and the server's public key; self-hostable with one command.
- [ ] The app issues a pairing code for another device — a screen for what `chips pair --issue` and `POST /v1/pairing-codes` do since Gate 2 — so a phone is paired from the desktop without a terminal.

Acceptance: a packet capture at the relay shows no plaintext; a phone on cellular reaches a server behind NAT with no port forwarding.

#### M4.2 Expo app

- [ ] Tabs: Needs you (swipe right approve, left deny, tap for detail), Spaces, Harnesses (profile with the dial, capabilities, budget), You. Shared `packages/core`; SQLite cache; deep links; passkey-free pairing by QR.
- [ ] What Phase 3 put on the card, on the phone too: Needs you lists an approval only to who may answer it (`approvers`, [ADR 0030](decisions/0030-who-may-answer-is-resolved-at-ingest-and-checked-at-the-door.md)) and carries a lane's trail; a route card and a task card render from the client core's lane; the run panel totals its lanes. The fold in `packages/core/src/model.ts` is one file for every event family, 2,350 lines at Gate 5: split it by family first, or say in the packet why not.
- [ ] What Phase 5 put there, since it came first: a person's role on the card and in the directory; a thread beside a room, and a search whose hit opens the room at the line; an ask handed on, with who handed it and why, and *Hand to…* for whoever may; the lead's notice; a workspace switcher, since the phone holds several servers too (M5.3). And M5.1's other half: the passkey flows on the phone — sign in with a passkey pairs the phone, no code from anywhere.
- [ ] The replay batched: a cold pairing against a 10,000-message log took 12.7 s to the last line at Gate 3, one socket frame per event, on a laptop on Wi-Fi.

Acceptance: the three phone mockups in the blueprint exist as screens; Maestro flows cover approve, deny, and steer; a cold pairing against a 10,000-message log reaches the last line in under five seconds on Wi-Fi.

#### M4.3 Push

- [ ] APNs and FCM with actionable categories; the push relay path carries an opaque ping (agent name, kind, id); the phone fetches content on wake; approve and deny from the lock screen; iOS Live Activity for "waiting on you" as a stretch goal.
- [ ] A push reaches only a person who may answer the approval — the `approvers` the door wrote — and never carries a lane's trail or the words: ids only, content on wake. A decision from the lock screen an hour after the ask is still the acceptance, watched once from a real phone with what the card said written in the packet. **Changed 7 September 2026 (ADR 0041):** this line used to name the Claude Code deferred gate and `adapters/claude-code/src/deferred.ts`. Both are deleted. The deferral itself is server-side and untouched, so raise the approval from **Jacobian or a sample harness** that asks and waits.
- [ ] A push is claimed like a banner (M5.6, [ADR 0037](decisions/0037-notifications-are-per-person-settings-on-the-server-and-one-claim-per-event.md)): on wake the phone claims the key at `/v1/me/notifications/claims` before it shows anything, so a person with the app open on the mini and the phone in their pocket hears once — and a key is granted once, to whichever device asked first, never again (Gate 5). The tiers, quiet hours and per-harness words are the same settings, read from the server.

Acceptance: an approval created while the app is closed produces a lock-screen notification with working Approve and Deny within five seconds on Wi-Fi.

#### M4.4 Media on mobile

- [ ] Camera and library capture, files, voice notes with a transcript (on-device or server-side, decided in an ADR), share-sheet target, resumable video upload with server-side transcode and poster.

Acceptance: a two-minute video uploads over a flaky connection with resume; a voice note reaches the agent with audio and text.

#### M4.5 Docs

- [ ] Operate: relay, Tailscale, your own domain. Mobile guide.

**Exit criteria.** Approve from the lock screen against the Mac mini from outside the home network.

**Demo script.** Leave the house. Have Scout request an approval. Approve it from the lock screen. Send Scout a voice note and a photo of a receipt from the phone.

**Gate 4 review focus.** The end-to-end encryption design and its implementation. Push payload privacy. Reconnect and battery behavior. Swipe ergonomics. Media pipeline isolation (transcoding runs in a separate process with limits).

---

### Phase 5 · People

**Goal.** More than one person in a workspace, safely.
**Duration.** About four weeks.
**Entry.** Gate 4 passed — as planned. Built instead with Gate 3 passed as its entry, before Phase 4, on Arjun's word of 6 September 2026 ("Proceed with phase 5": Phase 4 needs a toolchain, push credentials and a phone this machine has not; Phase 5 is server and web work it has). Recorded here at Gate 5, which passed with fixes the same day ([the review](reviews/phase-5-review.md)); what Phase 5 left for Phase 4 is in M4.2 and M4.3 above.

#### Milestones

- [ ] **M5.1 Invites and passkeys.** Invite links (single-use or open, with a role); WebAuthn passkeys; roles owner, admin, member, guest.
- [ ] **M5.2 Membership.** Per-space membership; guests limited to one space; harnesses always have a named owner; ownership transfer.
- [ ] **M5.3 Several workspaces.** The app holds keys for several servers; the switcher; per-server notification settings.
- [ ] **M5.4 Messaging depth.** Threads, reactions, edit, delete, pin, and search over messages and receipts with SQLite FTS5.
- [ ] **M5.5 Approval routing.** Route to a role or a teammate; batch approve; the audit log records who decided.
- [ ] **M5.6 Notifications per person.** Tiers, quiet hours, digest, per-harness settings; exactly one notification per event per person.

Acceptance: an authorization matrix test covers every endpoint against every role; passkey registration and sign-in flows pass on the web and the phone; a search over 50,000 messages returns in under 200 ms.

**Exit criteria.** Two people and three agents in a workspace, with approvals routed by role and no duplicate notifications.

**Gate 5 review focus.** The authorization matrix. Passkey implementation details. Privacy of per-person data on shared servers. Notification deduplication.

---

### Phase 6 · Hosting, hardening, operations

**Goal.** The same binary in Docker with Postgres, at production quality.
**Duration.** About four weeks.
**Entry.** Gate 5 passed.

#### Milestones

- [ ] **M6.1 Postgres.** Second dialect with the same migrations; CI matrix runs the integration suite on both. The search index behind the same port: the queue and the maps are the dialect's, and Postgres gets a `tsvector` with a GIN index where SQLite has FTS5 ([ADR 0035](decisions/0035-a-thread-is-a-space-with-a-parent-and-a-message-is-changed-by-events.md) and its Gate 5 addendum).
- [ ] **M6.2 Object store.** S3-compatible attachments with presigned uploads.
- [ ] **M6.3 Docker.** Image, compose file with Postgres and MinIO, health checks, backups, restore drill; export from solo, import into team, and back, with projections compared.
- [ ] **M6.4 Hosted relay and push.** Rate limits, abuse controls, a status page; the business side, still open-source code.
- [ ] **M6.5 Performance.** Targets: 10,000 messages in one space scroll smoothly; 100 connected harnesses; fan-out latency under 100 ms at p95 on a Mac mini. The append-and-replay budget (M0.3: 2,000 ms for 10,000) held at Gate 5 by a thin margin (1.9 s) once the search index came off the append path; measure it on the CI runner as well as the mini, and say where the two seconds go.
- [ ] **M6.6 Security.** Threat model document; token rotation; signed URL audit; fuzzing of the protocol parser; dependency scanning; a third-party review if budget allows.
- [ ] **M6.7 Accessibility and packaging.** Keyboard and screen-reader pass; the single-executable decision executed; desktop auto-update.

Acceptance: `docker compose up` yields a working team server; the migration drill passes both ways; performance numbers recorded in the packet.

**Gate 6 review focus.** The threat model against the implementation. Migration correctness. Runbooks. Performance against targets.

---

### Phase 7 · Ecosystem and public launch

**Goal.** Other people's harnesses connect without asking us.
**Duration.** About five weeks.
**Entry.** Gate 6 passed.

#### Milestones

- [ ] **M7.1 OpenClaw bridge.** A sidecar joining the Gateway as an operator client, per `docs/openclaw-class-harnesses.md`; sessions per Chips space; sub-agent sessions as lanes.
- [ ] **M7.2 ACP bridge.** Generic Agent Client Protocol client covering Goose, Gemini CLI, OpenCode, OpenHands and others.
- [ ] **M7.3 Codex bridge** on the app-server protocol; open decision 4 (section 0.6) is answered first. An observe-only `chips connect codex` through its command hooks may land earlier as a scope change at a gate. **Reopened 7 September 2026 ([ADR 0041](decisions/0041-chips-integrates-harnesses-that-run-themselves-not-the-cli-you-sit-at.md)):** this milestone was going to inherit ADR 0025's bridge, which no longer exists. Codex is a CLI somebody sits at, so it has to answer the question that removed Claude Code first — *does it run when nobody is watching?* — before any of it is built. **M7.4 Hermes plugin** and the Python SDK.
- [ ] **M7.5 Adapter gallery** with conformance badges in the docs.
- [ ] **M7.6 Protocol 1.0.** Freeze, RFC process, versioning and deprecation policy, compatibility tests across the last two minor versions.
- [ ] **M7.7 Launch.** README, contributing guide, issue templates, public roadmap, a sixty-second video, the blueprint moved into the repo. Open decision 1 (section 0.6) closes here: the addresses in `SECURITY.md` and `CODE_OF_CONDUCT.md` must be real and monitored before the repository is public.

Acceptance: three adapters written by following the docs alone pass conformance; 1.0 is tagged with a signed release.

**Gate 7 review focus.** Protocol stability. Third-party ergonomics. A docs cold-read by someone who has never seen Chips. License and trademark files.

---

### Phase 8 · Enterprise (outline only)

Organizations and workspaces, SSO and SCIM, the policy engine with templates and risk classes, audit export to SIEM, retention and legal hold, budgets and reports, the agent registry, the admin console, the kill switch, data residency, bring-your-own-key, and the `ee/` license boundary. This phase is planned in detail after Gate 5, when the multi-user model has met real users.

---

## 4. Cross-cutting tracks

### 4.1 Testing

| Level | Tool | What it covers | Where |
|---|---|---|---|
| Unit | Vitest | Protocol schemas, policy engine, state machines, utilities | Every package |
| Integration | Vitest against a real SQLite file | Gateway, event log, projections, uploads | `server/` |
| End to end | Playwright | The web app against a live chipsd | `apps/web/e2e` |
| Mobile | Maestro | Needs you, approve, deny, steer | `apps/mobile/e2e` |
| Adapter | Conformance kit | Every adapter, every phase | `packages/conformance` |
| Property | fast-check | Event log, state machines, policy engine, lane invariants | `server/`, `packages/core` |
| Contract | Protocol fixtures | The SDK against the server; adapters against the conformance kit | `packages/sdk-ts`, `packages/conformance` |
| Load | autocannon or k6, nightly | Appends, fan-out, approval round-trip against the budgets in 6.2 | `server/bench` |
| Golden | All of the above | The PO-4471 scenario in Appendix A | Runs on every push |

### 4.2 Docs

A milestone is not done until its docs are. The reference regenerates from the protocol package. Guides and concept pages change in the same commit as the code. Every sample runs in CI.

### 4.3 Security, every phase

Token scoping, of what a credential may write and of what it may read, signed URL expiry, input sniffing, no inline execution of uploaded content, injection flags on approval previews, audit completeness. The gate review checks these explicitly.

### 4.4 Performance budgets

Message list scroll at 60 fps with 10,000 messages; approval round-trip under 300 ms on a LAN; cold start of the web app under two seconds on a Mac mini.

### 4.5 Accessibility

Keyboard operable throughout; visible focus; color never the only signal; reduced motion honored; axe passes on every screen.

---

## 5. Risks

| Risk | Signal | Response |
|---|---|---|
| The event log becomes the bottleneck | Append latency rises above 5 ms at p95 | Batch appends; move projections to a follower; never abandon append-only |
| Harness adapters drift as harnesses change | Conformance fails on a version bump | Pin harness versions per adapter; the gallery shows tested versions |
| The lane model confuses users | Attribution questions in testing | Strengthen trail visuals; collapse more aggressively; never add copies |
| Relay becomes a trust problem | Users ask what the relay can read | Publish the encryption design; ship the self-hosted relay first |
| Scope creep from the blueprint | STATUS.md "scope changes" grows | Gate reviews push new scope into the next phase or Phase 8 |
| Model costs in tests | CI bills climb | The real-model golden run is nightly, not per push; per push uses the scripted agent |

---

## 6. Engineering standards

These are requirements, not aspirations. Each has a check that runs in CI or a line in the gate checklist (Appendix G). A phase does not pass with a known violation unless the packet records a waiver and the reviewer accepts it.

### 6.1 Architecture

- **Layers with an inward dependency direction.** `protocol` (schemas) → `domain` (pure: policy, run and lane state machines, invariants) → `application` (use cases: post a message, request an approval, resolve it, route a task) → `infrastructure` (Kysely repositories, WebSocket and HTTP transports, media jobs, the relay) → `interfaces` (routes, socket handlers, the CLI). Inner layers never import outer ones. `dependency-cruiser` encodes the rule and fails CI on a violation or a cycle.
- **Ports and adapters.** The application layer defines interfaces for storage, transport, blob store, job queue, clock, id generator and fan-out. SQLite and Postgres, local disk and S3, in-process and worker queues, single-node and multi-node fan-out are adapters. This is what makes one binary serve a Mac mini and a cluster.
- **Event-sourced write model.** A command is validated at the edge with Zod, executed by a use case, and results in events appended in one transaction with the projections that read models need. Projections are rebuildable from zero; read models are per screen (Needs you, conversation, run panel), never assembled with joins at request time.
- **Explicit module boundaries.** Every package and every module exposes an `index.ts`; deep imports across boundaries fail lint. The package graph is documented in `docs/architecture.md` and regenerated by CI.
- **Errors are values at boundaries.** Use cases return typed results; infrastructure throws typed error classes; nothing throws strings. Every external input is validated once at the edge and trusted inside.
- **Idempotent, concurrent-safe handlers.** Every command carries an idempotency key. Projections use `seq` for optimistic concurrency. No shared mutable module state; no singletons holding requests.
- **Injected time and randomness.** Clock and id generation come through ports so tests are deterministic.
- **One typed configuration.** A Zod config schema merges defaults, file and environment. `process.env` is read in exactly one file.
- **The ubiquitous language.** Code uses the blueprint's nouns: participant (a person or a harness), space, run, lane, approval, policy, event. The same words appear in the schema, the UI and the docs. *Harness* and *space* replaced *agent* and *conversation* on 4 September 2026 (ADR 0024), and the code, the wire and the schema followed the same day (open decision 5, answered); milestones before Phase 2 keep the names they shipped with.
- **Size limits.** A file over 400 lines or a function over 60 lines needs a comment saying why. Lint enforces cyclomatic complexity of 12.

### 6.2 Scalability

- **Stateless gateway processes.** All state lives in the store. Any process can serve any client because streams resume from `seq`. Phase 6 runs several gateway processes behind one address with fan-out over Postgres `LISTEN/NOTIFY` or Redis; the fan-out port exists from Phase 0 with an in-process adapter.
- **Fan-out with backpressure.** Subscriptions are keyed by workspace and space. Each socket has a bounded outbound queue; frames batch under load; a consumer that falls more than 1,000 frames behind is disconnected and resumes with `since`.
- **Cursor pagination everywhere.** List endpoints paginate by `seq` or ULID, never by offset. Every index is declared in a migration next to the query that needs it.
- **No N+1.** Read models batch their lookups; a test asserts the query count for the main screens stays constant as data grows.
- **Tenancy from the first table.** Every table carries `workspace_id`; every repository method takes a workspace scope; a lint rule on the repository layer fails any query that lacks the predicate.
- **Heavy work off the request path.** Thumbnails, transcodes, transcripts and exports run through the job port with retries and idempotent job ids. In solo mode the worker is in-process; in team mode it is a separate process.
- **Limits and budgets.** Message size, attachment size, rate per token, subscribers per socket and pending approvals per harness are configurable limits with sane defaults. Latency budgets: append under 5 ms at p95 locally, approval round-trip under 300 ms on a LAN, fan-out under 100 ms at p95 with 100 agents. A nightly load run records the numbers and fails on a 20 percent regression.
- **Measure before optimizing.** `server/bench` holds reproducible benchmarks. Optimizations cite a benchmark in the commit.

### 6.3 Testing

- **Coverage thresholds, ratcheted.** 90 percent lines and branches on `packages/protocol`, the domain layer and the policy engine; 80 percent overall. Thresholds live in the Vitest config and may only go up.
- **The right test at the right level.** Unit tests for pure code, integration tests against a real SQLite file and real sockets, contract tests from the protocol fixtures for the SDK and the adapters, property-based tests with `fast-check` for the event log, state machines, policy engine and lane invariants, end-to-end tests with Playwright and Maestro, nightly load tests, fuzzing of the protocol parser from Phase 6, migration tests up and down on both dialects, visual snapshots for components in both themes.
- **Deterministic tests.** No sleeps; fake timers and injected clocks. No network in unit tests. Fixed ids. Fixtures come from `packages/protocol/fixtures` so every layer agrees on the shape of an event.
- **One behavior per test, named for the behavior.** Arrange, act, assert. A failing test's name tells the reader what broke without opening the file.
- **Flakes are bugs.** A flaky test outranks feature work. Quarantine is allowed for 48 hours with an issue link; CI retries are off.
- **The golden scenario is the contract.** It runs with the scripted agent on every push and with a real model nightly. A change that alters expected UI states updates Appendix A in the same commit.
- **Tests document invariants.** Each package README lists its invariants and points at the tests that protect them.

### 6.4 Code quality

- TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. No `any` without a comment; no `@ts-ignore` without an issue link. Biome at its strict preset.
- Public APIs carry TSDoc; the SDK's API reference is generated from it.
- Dependencies are few, pinned and audited in CI. A new runtime dependency is justified in its commit message and must be actively maintained.
- Parameterized queries only; no string-built SQL. Secrets never appear in logs. Token comparison is constant-time. The web app ships a strict content security policy.
- Conventional Commits, small and green. Every milestone ends with the self-review in Appendix G, recorded in the packet.

### 6.5 Observability and operations

- Structured JSON logs with request, run and lane ids, and levels; no personal data in logs by default.
- Metrics through the OpenTelemetry API from Phase 0: appends, fan-out latency, pending approvals and their age, sockets, job queue depth. A Prometheus exporter arrives in Phase 6.
- Tracing spans from gateway to store to fan-out, carrying the same ids the audit log uses, so a slow approval can be followed end to end.
- Health and readiness endpoints; graceful shutdown drains sockets; the process is safe to kill at any moment because the event log is the truth.
- A runbook per failure mode, starting from what `chips doctor` can detect and growing with each incident.

### 6.6 How the gate enforces this

The packet has an Engineering standards section with coverage numbers, the dependency-cruiser output, lint and typecheck status, load numbers, new dependencies with reasons, and any waivers. Fable applies Appendix G and fails the phase on coverage below threshold, a dependency cycle or layer violation, an unvalidated boundary, a non-idempotent command, an unscoped query, or a flaky test left in the suite.

---

## Appendix A · The golden scenario, PO-4471

Used by every layer. A person and the harness Scout (procurement) in a workspace on a solo server.

1. Person posts "Here's the signed PO. Get it confirmed with Northwind and update the tracker." with `PO-4471.pdf` attached. Expected: message with a file card; Scout receives `message.new` with a signed URL; audit shows the fetch.
2. Scout emits `run.started` with a four-step plan. Expected: run panel shows four hollow steps; status pill "Working".
3. `run.status` "Reading PO #4471…", then `step.log` done for steps one and two with sources Drive and CRM. Expected: receipt shows two ticks; timeline shows two green dots.
4. `approval.request` for `email.send` to an external domain with a preview, risk `external` and `irreversible`, `expires_in` 3600, step three. Expected: approval card in the space and in Needs you at the Decide-now tier; status pill "Waiting on you"; timeline step three amber with "needs your approval".
5. Person approves with scope once. Expected: `approval.resolved` reaches Scout; card shows "Approved by Arjun"; audit records both events; status returns to "Working".
6. `approval.executed` sent. Expected: card shows "sent".
7. `step.log` done for steps three and four; `usage` with tokens and cost; `context.usage` at 41 percent. Expected: cost meter and context ring update.
8. `run.completed` with a summary. Expected: summary card; status "Done"; the run panel is final.
9. Phase 3 extension: person asks whether the Northwind quotes are in line with last quarter; Scout emits `task` to Ledger; Ledger replies once; Scout summarizes. Expected: the route card in Scout's chat, the task card in Ledger's chat, one message row for Ledger's reply, the lane collapsed after the summary.

Negative cases: an approval that expires (fallback deny, audit shows expiry); a second surface answering after the first (resolved elsewhere); an uploaded `.svg` served as a download; a `task` at depth four flattened into steps.

## Appendix B · API surface v0

HTTP: `GET /v1/health` · `POST /v1/pair` · `POST /v1/harnesses` · `POST /v1/harnesses/:id/tokens` · `POST /v1/harnesses/:id/events` · `POST /v1/runs/:id/events` · `GET /v1/approvals/:id/wait` · `POST /v1/uploads` · `PUT /v1/uploads/:id` · `GET /v1/attachments/:id?sig=` · `GET /v1/events?since=` · `GET /v1/export` · `POST /v1/import`.

WebSocket `/v1/ws` frames: `hello`, `subscribe`, `event` (any protocol event), `ack`, `receipt`, `ping`, `pong`, `error`. Every client-originated `event` carries `idempotency_key`; the server answers with `ack {key, seq}`.

## Appendix C · Core types

```ts
type Envelope<T extends string, P> = {
  v: 1; type: T; id: string; ts: string; workspace_id: string;
  space_id?: string; run_id?: string; seq?: number;
  idempotency_key?: string; actor: { kind: 'person' | 'harness' | 'system'; id: string };
} & P;

type RunState = 'queued' | 'running' | 'waiting' | 'done' | 'failed' | 'cancelled';

type Decision = { decision: 'allow' | 'ask' | 'deny'; approvers?: string[]; reason: string };
declare function evaluate(
  action: { kind: string; external?: boolean; irreversible?: boolean; money_usd?: number },
  harness: { autonomy: 0 | 1 | 2 | 3; rules: Rule[] },
  workspace: { maxAutonomy: 0 | 1 | 2 | 3; rules: Rule[] },
): Decision;

type Approval = {
  id: string; run_id: string; step_id?: string; action: unknown; preview?: unknown;
  risk: string[]; sources: { kind: 'external' | 'internal'; label: string }[];
  expires_at: string; fallback: 'deny' | 'allow'; approvers: string[];
  resolution?: { decision: 'approved' | 'edited' | 'denied' | 'expired'; scope: 'once' | 'session' | 'always';
                 by: string; at: string; updated_input?: unknown; reason?: string };
};
```

## Appendix D · STATUS.md template

```markdown
# Status

Phase: 0 · Foundation
Last review: none
Last commit reviewed: none

## Milestones
- [ ] M0.1 Repository and tooling
- [ ] M0.2 Protocol package v0
- [ ] M0.3 Storage and the event log
- [ ] M0.4 Gateway skeleton
- [ ] M0.5 Docs site skeleton
- [ ] M0.6 The approval loop, in a browser

## In progress
(what is half-done and where to look)

## Blocked
(what and why)

## Scope changes
(anything added or removed, with a reason)

## Notes for the next session
```

## Appendix E · ADR template

```markdown
# NNNN. Title

Date · Status: proposed | accepted | superseded by NNNN

## Context
## Decision
## Consequences
```

## Appendix F · Phase gate templates

### Packet template, `docs/reviews/phase-N-packet.md`

```markdown
# Phase N packet

## What shipped
(one paragraph, then the milestone list with links to the key files)

## Deviations
(from this plan and from the blueprint, each with a reason)

## Tests
(commands run and their summarized output; coverage numbers; anything skipped and why)

## Engineering standards
(coverage against thresholds, dependency-cruiser output, lint and typecheck status, load numbers, new dependencies with reasons, waivers requested)

## Demo script
(exact steps to reproduce the phase demo on a clean machine)

## Known issues
(ranked)

## Questions for the reviewer

## Risks for the next phase
```

### Review kickoff prompt, pasted to Fable after `/compact`

```text
Review Phase N of Chips. Read docs/reviews/phase-N-packet.md, docs/technical-plan.md
(Phase N and its gate focus), docs/STATUS.md, and the blueprint at docs/chips-blueprint.html.
Inspect the diff from tag phase-(N-1)-complete to phase-N-complete. Run pnpm test, pnpm lint,
pnpm typecheck and the Playwright suite; walk the demo script. Judge against the phase's
acceptance and exit criteria, the gate focus list, and the engineering standards in section 6
using the checklist in Appendix G. Write docs/reviews/phase-N-review.md
using the review template, with a verdict of Pass, Pass with fixes, or Fail, and a fix list
ranked by severity with file references. Be specific and adversarial; do not accept a
milestone on the packet's word alone.
```

### Review template, `docs/reviews/phase-N-review.md`

```markdown
# Phase N review

Verdict: Pass | Pass with fixes | Fail
Reviewed commit: <sha>

## What was verified
(tests run, demo walked, code read)

## Engineering standards
(Appendix G results: coverage, boundaries, idempotency, tenancy scoping, flakes, dependencies)

## Findings
(ranked by severity; each with a file reference, the failure scenario, and the fix)

## Deviations accepted
(and any to reverse)

## Conditions for the next phase
```

---

## Appendix G · Engineering checklist

Run by the implementer before marking a milestone done, and by Fable at every gate. Every "no" needs either a fix or a waiver in the packet.

1. Do all new modules sit in the right layer, with imports pointing inward only? Is `dependency-cruiser` green?
2. Is every external input validated with a schema at the edge, and trusted afterwards without re-validation?
3. Does every command carry an idempotency key, and is the handler safe to run twice?
4. Does every query carry a workspace scope? Does the repository lint pass?
5. Are events appended and projections updated in one transaction? Does `rebuild` reproduce the projections?
6. Are list endpoints cursor-paginated, with an index declared for each new query?
7. Are heavy operations on the job port rather than the request path?
8. Are coverage thresholds met, and did any go down?
9. Are there property tests for any new state machine or invariant?
10. Are tests deterministic: no sleeps, no network, injected clock and ids?
11. Are there any quarantined tests older than 48 hours?
12. Do logs carry request, run and lane ids, and no personal data?
13. Were new metrics added for anything a runbook would need?
14. Are new dependencies pinned, justified and maintained?
15. Is every public API documented, and is the docs reference regenerated?
16. Do the files match the blueprint's nouns and the ubiquitous language?
17. Are file and function sizes within limits, or explained?
18. Did the load run stay within budget, and were the numbers recorded?

---

*Revised at Gate 3, 5 September 2026: open decisions 5 and 6 answered and removed, decision 2 re-pointed at M5.5, decisions 7 and 8 added from the Phase 3 review, Phase 4 refined with what Phase 3 put on the card — who may answer, the trail, the lanes total, the deferred approval from a phone — and with the replay batched before a phone reads a long log.*

*Revised at Gate 5, 6 September 2026: Phase 5 recorded as built before Phase 4, on Arjun's word, with Gate 3 as its entry; open decisions 2 and 7 answered and removed, decisions 9 and 10 added from the Phase 5 review; Phase 4 refined with what Phase 5 put on the card and in the room, the phone's passkeys, and a push claimed like a banner; Phase 6's M6.1 given the search index's dialect and M6.5 the append budget's thin margin. Next revision: at Gate 4, with Phase 6 detail refined from what the phone taught.*
