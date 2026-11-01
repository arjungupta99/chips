# Phase 0 packet

Written 3 September 2026 · Tag `phase-0-complete` · 24 commits since `d74d27d`

## What shipped

The skeleton everything else stands on, ending with a working approval loop in a browser. A
person opens a page, pairs it with a code, and watches a scripted agent read a purchase order,
check a CRM, and ask permission to email a vendor. They approve; the agent hears the decision,
sends, and finishes; the audit tab shows the whole trail with sequence numbers. That loop runs
end to end in Playwright on a clean checkout, and everything under it — the protocol, the event
log, the gateway, the guardrails — was built to make it true rather than to look true.

The thing worth saying about how it went: **the guardrails found real faults, repeatedly.**
`dependency-cruiser` caught a cycle between the Hono app and its routes the moment the second
route existed, and caught a use case reaching into Kysely. The coverage threshold on the domain
layer failed at 71 percent and the reason turned out to be dead `?? fallback` code on fields the
schema marks required. Writing the resume test found an ordering bug that would have silently
lost the middle of a reconnecting client's stream. None of those would have been found by
reading.

### Milestones

- [x] **M0.1 Repository and tooling.** pnpm workspace, Turborepo, Biome, Vitest with ratcheted
  coverage thresholds, GitHub Actions, the licence and contribution documents, ADRs
  [0001–0018](../decisions/), and every section 6 guardrail wired into CI before any feature
  code: [`.dependency-cruiser.cjs`](../../.dependency-cruiser.cjs) with the layer rules and a
  no-cycles rule, `fast-check`, `pino`, and the typed config schema in
  [`packages/platform/src/config`](../../packages/platform/src/config).
- [x] **M0.2 Protocol package v0.** The envelope and 32 events in
  [`packages/protocol/src/events`](../../packages/protocol/src/events), the eight transport
  frames of Appendix B, one fixture per event drawn from the golden scenario, and
  [`pnpm gen:protocol`](../../tools/protocol/generate.ts) writing JSON Schema, a zod-free
  `types.ts`, and a reference page per event.
- [x] **M0.3 Storage and the event log.** Kysely on SQLite, a migration runner behind `chipsd
  migrate`, the sixteen tables, and
  [`append`/`since`/`rebuild`](../../server/src/infrastructure/store/sqlite-event-store.ts) with
  the projector as a pure function in
  [`server/src/domain/projection.ts`](../../server/src/domain/projection.ts).
- [x] **M0.4 Gateway skeleton.** [Hono](../../server/src/interfaces/http/app.ts) with one error
  envelope, agent tokens and device signatures
  ([`credentials.ts`](../../server/src/infrastructure/auth/credentials.ts)), hooks-mode ingest
  with the long-poll approval wait, and
  [`/v1/ws`](../../server/src/interfaces/ws/session.ts) with hello negotiation, `since` resume,
  heartbeats, acks and backpressure.
- [x] **M0.5 Docs site skeleton.** [Starlight](../../apps/docs) with the blueprint's eight
  sections, a Concepts page per noun, the generated reference wired in, samples that CI
  executes, and a link checker.
- [x] **M0.6 The approval loop, in a browser.** [`apps/web`](../../apps/web) on the blueprint's
  tokens, [`examples/scout`](../../examples/scout) on a raw WebSocket, and a
  [Playwright test](../../apps/web/e2e/approval-loop.spec.ts) that runs the demo script.

## Deviations

Everything here is also in [`STATUS.md`](../STATUS.md) under Scope changes.

### Additions to the repository layout (section 2)

Recorded in [ADR 0017](../decisions/0017-repository-layout-additions.md).

| Added | Why |
|---|---|
| `packages/platform` | M0.1 requires a typed config schema and a `pino` logger before `server/` exists, and section 2 gives them no home. It sits beside the layers and may import nothing of ours, enforced by `platform-imports-nothing-of-ours`. |
| `tools/` | Repository checks and generators that are never shipped: `tools/guardrails` (fixtures that break each layer rule on purpose, and the test that asserts each is caught), `tools/architecture`, `tools/protocol`. |
| `server/bench/` | Required by section 6.2: "`server/bench` holds reproducible benchmarks." |
| `docs/architecture.md` | Required by section 6.1, with `pnpm check:architecture` failing the build when stale. |

### Additions to the protocol

- **The eight transport frames of Appendix B** (M0.2). The milestone lists only events, but
  Appendix B is part of the v0 surface, decision 7 makes the Zod schemas canonical, and M0.4's
  acceptance test needs typed frames.
- **Three `workspace` events** — `conversation.created`, `membership.added`,
  `membership.removed` — as a third direction (M0.3). Building `rebuild` proved the gap:
  `conversations` is a projection that `rebuild` drops, and nothing in Agent Connect creates one,
  so a replay left it empty. Decision 4 already covers it — every *human action* is an event.
  [ADR 0018](../decisions/0018-event-sourced-and-registry.md) records this and the line it drew
  between the ten projection tables and the four registry tables.
- **Three identifier prefixes beyond decision 11's eleven**: `evt_`, `dev_`, `tok_`. An event
  needs an id of its own to be idempotent across a reconnect; devices and agent tokens are rows
  in the M0.3 schema. The eleven decision 11 names are unchanged.

### Additions to the API surface

- **`POST /v1/pair`** (M0.6). Listed in Appendix B but built by no milestone, and the demo cannot
  work without it: a browser needs a credential and `chips pair` is Phase 2.
- **`GET /v1/approvals/:id` and `GET /v1/events`** (M0.4). Both in Appendix B; the first makes the
  long poll usable when a hook restarts.
- **A dev-mode demo bootstrap** behind `CHIPS_DEV_MODE`, off by default. On start it ensures a
  workspace exists and writes an agent token and pairing code to `.chips/demo.json` with
  owner-only permissions. This is what makes "works on a clean machine" true.

### Deviations from decision 1

Local development runs on Node 26 because Homebrew's `node@22` on the implementer's machine is
broken (`Library not loaded: libsimdjson.30.dylib`). The project still targets Node 22 LTS:
`.node-version` is 22.12.0, `engines` is `>=22.12.0`, CI uses `node-version-file`, and
`@types/node` is pinned to 22 so a newer API cannot be used by accident. **CI has not run yet** —
see Known issues.

Biome's `all` preset was evaluated and rejected: it enables `noBarrelFile`, which contradicts the
`index.ts` boundaries section 6.1 requires, and `noNodejsModules` in a Node server. We run
`recommended` with a named set of escalations to error. `complexity/useLiteralKeys` is off
because it contradicts TypeScript's `noPropertyAccessFromIndexSignature`, which is on.

## Tests

```
pnpm check     # lint, typecheck, test with coverage
pnpm e2e       # the approval loop, end to end, in a real browser
pnpm docs:check && pnpm docs:build
pnpm bench:append
```

All of the above were run on a **fresh `git clone` with `pnpm install --frozen-lockfile`**, not
just in the working tree.

| Suite | Result |
|---|---|
| `pnpm test` | **496 passed**, 0 failed, 0 skipped |
| — `protocol` | 149 |
| — `server` | 235 |
| — `platform` | 70 |
| — `web` | 28 |
| — `guardrails` | 14 |
| `pnpm e2e` | **2 passed** (Chromium) |
| `pnpm docs:check` | 3/3 samples passed |
| `pnpm docs:build` | 58 pages, all internal links valid |
| `pnpm bench:append` | append 1,181 ms, replay 270 ms, **total 1,451 ms** against a 2,000 ms budget |

Nothing is skipped or quarantined. Retries are off, in Vitest and in Playwright.

### Coverage

| Area | Lines | Branches | Functions | Statements |
|---|---|---|---|---|
| `packages/protocol` | 98.31 | 93.62 | 96.55 | 97.92 |
| `packages/platform` | 98.72 | 92.98 | 97.06 | 98.81 |
| `server/src/domain` | **100.00** | 91.36 | 100.00 | 100.00 |
| `server/src/application` | 98.94 | 84.38 | 100.00 | 96.40 |
| `server/src/infrastructure` | 98.42 | 84.06 | 98.21 | 95.85 |
| `server/src/interfaces` | 90.97 | 79.77 | 88.89 | 88.63 |
| `apps/web` | 100.00 | 85.37 | 100.00 | 98.57 |
| **Overall** | **96.68** | **85.38** | **96.25** | **95.03** |

Thresholds in [`vitest.config.ts`](../../vitest.config.ts): 80 percent overall, 90 on
`packages/protocol/src/**` and `server/src/domain/**`. All met. **Both per-directory thresholds
were verified to bite** by raising them until the run failed with a named error — Vitest accepts
a glob that matches nothing and reports nothing, so an unverified threshold is not a threshold.

`apps/web/src/client.ts` and `device.ts` are excluded from this report and covered by the
Playwright suite instead. They are a real `WebSocket`, real IndexedDB and real Ed25519 through
WebCrypto; faking them under Node would report a number about the fakes. This is stated in
`vitest.config.ts` with the reason.

### Property-based tests

`fast-check` covers: identifier ordering, uniqueness and timestamp round-tripping under a hostile
clock; that a validated event survives a JSON round trip unchanged and that no undeclared field
ever passes the edge; that version negotiation never picks a version outside either range; that a
run in a terminal state never moves again; and — the one M0.3's acceptance names — that a random
sequence of valid events, applied and then rebuilt from zero, produces identical projections.

## Engineering standards

### `dependency-cruiser`

```
✔ no dependency violations found (132 modules, 349 dependencies cruised)
```

Thirteen rules, described in [`docs/architecture.md`](../architecture.md). Twelve of them have a
fixture in `tools/guardrails/fixtures` that breaks them on purpose and a test asserting each is
caught **and that nothing else fires**. The thirteenth, `not-to-dev-dep`, needs an installed tree
to classify and is unfixtured; only its `from` filter is ours.

Building that fixture tree found two faults in the configuration itself: `includeOnly` was
stripping npm modules out of the graph, which left five rules unable to match anything, and the
framework rule only recognised bare specifiers.

### Lint and typecheck

`biome check .` — clean across 176 files. `turbo run typecheck` — 6 packages, clean, including
`astro check` on the docs site. TypeScript is `strict` plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitOverride`,
`noImplicitReturns` and `noFallthroughCasesInSwitch`.

*Correction, 3 September, after the review (finding 4): `astro check` was not running at the
tag. `@astrojs/check` was not installed, so the command printed an install prompt and exited 0 —
and the site has no `.astro` files, so it would have checked nothing anyway. The docs package now
has a `tsconfig.json` and its `typecheck` runs `tsc` over `content.config.ts` and the samples,
with the same strict flags as the rest of the repository, and keeps `astro check` for the
`.astro` components later phases add. Verified to fail on a deliberate type error before it was
committed.*

There is **no `any` in product code** outside one file,
[`projection-writer.ts`](../../server/src/infrastructure/store/projection-writer.ts), which
exists to hold the run-time table dispatch Kysely's per-table types cannot follow. It carries a
file-level suppression explaining that, so a stray `any` anywhere else is still a review comment.
Two migrations carry a single-line suppression each, for the same reason migrations always do.
There is no `@ts-ignore` or `@ts-expect-error` anywhere.

### New dependencies

Every runtime dependency and the decision that fixes it:

| Package | Fixed by | Why |
|---|---|---|
| `zod` | decision 7 | The protocol schemas and the typed config |
| `pino`, `pino-pretty` | 6.4, 6.5 | Structured logs with redaction; human-readable in a terminal |
| `@opentelemetry/api` | 6.5, decision 15 | Metric instruments with no SDK, so nothing is reported by default |
| `kysely`, `better-sqlite3` | decision 3 | The query builder and the solo-mode store |
| `hono`, `@hono/node-server`, `ws` | decision 2 | HTTP and WebSocket on one port |
| `react`, `react-dom` | decision 9 | The web client |
| `astro`, `@astrojs/starlight`, `starlight-links-validator` | decision 13 | The docs site, and the link checker that makes a broken link a build failure |

Fourteen runtime dependencies, all pinned to an exact version, all named by a fixed decision.
Development adds `typescript`, `@biomejs/biome`, `vitest`, `@vitest/coverage-v8`, `turbo`,
`dependency-cruiser`, `fast-check`, `tsx`, `vite`, `@vitejs/plugin-react` and `@playwright/test`.

### Latency and load

M0.3's budget — ten thousand events appended and replayed in under two seconds — is measured by
[`server/bench/append.ts`](../../server/bench/append.ts), which exits non-zero when missed and
which CI runs as its own step. It is at **1,451 ms**, 27 percent under.

Getting there took two changes, both citing the benchmark: the duplicate check moved inside the
transaction and then behind the unique constraint entirely, so the common path does not pay for a
lookup that almost always misses; and the sequence number is allocated by the insert rather than
by a preceding `select max(seq)`. That took 2,103 ms to 1,451 ms.

The other budgets in 6.2 — fan-out under 100 ms at p95 with 100 agents, approval round-trip under
300 ms on a LAN — have **no measurement yet**. The nightly load run is Phase 6 work; see Known
issues.

### Waivers requested

One, and it is a statement rather than a request: `apps/web/src/client.ts` and `device.ts` are
covered by Playwright rather than by the Vitest coverage report, for the reason above.

### Appendix G

| # | Check | Result |
|---|---|---|
| 1 | Layers, imports inward, `dependency-cruiser` green | **Yes.** 132 modules, no violations. Twelve of thirteen rules have a fixture proving they fire. |
| 2 | Every external input validated once at the edge, trusted after | **Yes.** `parseEvent` at the HTTP and socket edges; `submitEvent` is the single door. The domain distinguishes `required()` from `field()` rather than re-defending. |
| 3 | Every command carries an idempotency key; handlers safe twice | **Yes.** Refused without one, at both transports. Unique indexes on `(workspace_id, id)` and `(workspace_id, idempotency_key)` are the guarantee; a retry returns the original `seq` with `duplicate: true` and publishes nothing. |
| 4 | Every query workspace-scoped | **Yes**, by reading. **No lint rule enforces it** — see Known issues. |
| 5 | Events and projections in one transaction; `rebuild` reproduces | **Yes.** One transaction in `sqlite-event-store.ts`; a property test applies a random sequence, rebuilds from zero and compares every projection row. |
| 6 | Cursor pagination, an index per query | **Yes.** `since` and `/v1/events` page by `seq`; every index in `0001-initial.ts` sits beside a comment naming the query. |
| 7 | Heavy work off the request path | **Not applicable yet.** No media, no jobs. The job port arrives with attachments in Phase 1. |
| 8 | Coverage met, none went down | **Yes.** 96.68 lines, 85.38 branches overall; 100/91.36 on the domain. First thresholds, so nothing to go down from. |
| 9 | Property tests for new state machines and invariants | **Yes.** Listed above. |
| 10 | Deterministic: no sleeps, no network, injected clock and ids | **Yes** in the unit and integration suites. The e2e suite uses a real server and browser, which is its point; it has no sleeps. |
| 11 | Quarantined tests older than 48 hours | **None.** Nothing is quarantined or skipped. |
| 12 | Logs carry request, run and lane ids, no personal data | **Partly.** Request, workspace and agent ids are carried; run and lane ids are not yet, because no route is run-scoped. Redaction is tested at every nesting depth. |
| 13 | Metrics for anything a runbook needs | **Yes**, declared: appends, fan-out latency, pending approvals and their age, sockets, job queue depth. **Only `chips.events.appended` is incremented** — see Known issues. |
| 14 | New dependencies pinned, justified, maintained | **Yes.** Table above; every one exact-pinned and named by a decision. |
| 15 | Public APIs documented, reference regenerated | **Yes.** Every schema field carries a description — a test fails if one does not — and `pnpm check:protocol` fails on a stale reference. |
| 16 | Files match the blueprint's nouns | **Yes.** participant, conversation, run, message, approval, policy, event, lane, throughout. |
| 17 | File and function sizes within limits | **Mostly.** Cognitive complexity 12 is enforced by lint and was hit six times, each fixed by extraction rather than a waiver. Two files are over 400 lines without a comment saying why — see Known issues. |
| 18 | Load run within budget, numbers recorded | **Partly.** The append benchmark is measured, enforced and recorded. The fan-out and approval budgets are not. |

## Demo script

On a clean machine with Node 22 or newer and pnpm:

```bash
git clone https://github.com/arjungupta99/chips.git
cd chips
pnpm install
pnpm dev
```

The terminal prints a pairing code and the path to `.chips/demo.json`. Open
<http://127.0.0.1:5173>, type the code, and press Pair. The page shows an empty conversation and
a green link light.

In another terminal:

```bash
pnpm example:scout
```

Scout starts a run with a four-step plan, reads the PO, checks the CRM, and asks to email
dana@northwind.com. In the browser: two green steps, one amber step reading "needs your
approval", the status pill on "Waiting on you", and an approval card carrying the action, both
risk classes, the drafted message and the source.

Press **Approve**. Scout receives the decision, sends, logs the last two steps and completes.
The pill goes to "Done", all four dots go green, the card reads "Approved by you · sent", and a
summary appears. Press **Audit**: sixteen events, numbered 1 upward with no gaps, including
`run.started`, `approval.request`, `approval.resolved`, `approval.executed` and `run.completed`.

`pnpm e2e` runs exactly that, in Chromium, and asserts each step.

## Known issues

Ranked.

1. **CI has never run.** The workflow is written and every command in it passes locally on a
   clean clone, but nothing has been pushed to a remote that would run it. In particular the
   Node 22 leg is unverified, and `better-sqlite3` compiles from source there. This is the
   highest-risk item in the phase.
2. **No lint rule enforces workspace scoping** (Appendix G #4). Section 6.2 asks for one on the
   repository layer. Every query is scoped today, by reading and by tests that assert one
   workspace cannot see another's events — but that is a review, not a guard. Phase 1 should add
   the rule before the number of queries grows.
3. **Metrics are declared but not recorded.** Only `chips.events.appended` is incremented. Fan-out
   latency, pending approvals and their age, open sockets and queue depth all have instruments
   and no call sites, so a runbook written against them would be fiction today.
4. **Two files are over 400 lines without the comment section 6.4 asks for**:
   `server/src/domain/projection.ts` (534) and `packages/protocol/src/events/agent-to-chips.ts`
   (412). Both are flat catalogues — one projector per event type, one schema per event — rather
   than tangles, which is the argument for leaving them; but the plan asks for the argument to be
   written down, and it is not. `projection.ts` is also the file risk 3 below is about.
5. **`POST /v1/uploads` is a declared stub.** It returns a slot and says `"stub": true`. M0.4 asks
   for a stub; this is one, but nothing stores bytes.
6. **The `lanes` and `read_state` tables have no projector.** Reserved by the plan until Phase 3
   and Phase 1 respectively. `rebuild` empties them, which is correct today and will need a
   backfill decision if a lane ever has to be reconstructed from events that predate its
   projector.
7. **`docs/architecture.md`'s graph is thin.** It renders one node per package and per server
   layer, which is right, but with `packages/platform` as the only leaf today it does not yet
   show the inward direction it describes.
8. **The disclosure addresses are unconfirmed.** `SECURITY.md` names `security@chips.chat` and
   `CODE_OF_CONDUCT.md` names `conduct@chips.chat`. Neither has a mailbox.

## Questions for the reviewer

1. **`POST /v1/pair` and the dev bootstrap are the largest thing I added that no milestone asked
   for.** The alternative was a fake credential in the browser, which would have made the demo a
   demo of nothing. Is the shape right — a short-lived single-use code, a non-extractable key in
   IndexedDB, a signature over method, path, timestamp and body digest — or should Phase 1
   redesign it before `chips pair` is built on top?
2. ~~**ADR 0018 draws the line between projections and the registry.** Participants are a registry
   row, but an agent's autonomy changes by `policy.updated`, which is an event. Today nothing
   reads `participants.autonomy` except `hello`, so nothing is wrong yet. Which should be the
   truth when the policy engine lands in Phase 1?~~
   **Answered by Arjun on 3 September 2026, after this packet was tagged: the event is the
   truth.** Written up in [ADR 0019](../decisions/0019-policy-is-a-projection.md) and specified
   as a task in M1.4. No Phase 0 code changed — nothing reads the column but `hello`, and no
   `policy.updated` has ever been appended, so there is nothing to repair, only a split to make
   in Phase 1. Worth reviewing the ADR, not just the answer.
3. **A re-subscribe with an explicit `since` deliberately replays.** I read that as a client
   asking to re-read; a client that only wants what it missed passes the cursor it reached, and
   one that wants nothing older omits `since`. Is that the right reading of "resumes with
   `since` receives exactly the missed events, once"?
4. **Should `apps/web/src/client.ts` move to `packages/core` now** rather than in Phase 1? It is
   the protocol client the plan says mobile will share. Moving it while there is one consumer is
   cheap; moving it later is not.
5. **`hello` is delivered as an event frame but never appended**, so it has no `seq` and the
   audit does not show it. Is that the right treatment for a handshake?

## Risks for the next phase

1. **Policy is the sharpest thing in Phase 1.** The engine is a pure function and easy to test,
   but everything else — where the autonomy that feeds it lives, what `scope: "always"` turns
   into, how a workspace cap is represented — is unbuilt, and question 2 above has to be answered
   before it is.
2. **Attachments will be the first thing that needs the job port**, which exists only as an idea.
   Content addressing, MIME sniffing, GPS stripping, thumbnails and signed URLs are five separate
   security surfaces, and `POST /v1/uploads` is a stub that currently promises a shape.
3. **The read models are per screen, and Phase 1 adds screens.** Needs you, the conversation list
   and the run panel each want a different shape. The projector is a flat catalogue today; adding
   three read models to it without splitting it will make `projection.ts` the file everything
   touches.
4. **Nothing has been tested against a real model.** The golden scenario runs with a scripted
   agent, which is deterministic and therefore not evidence that the protocol is comfortable to
   emit from inside a real loop. Section 6.3 asks for a nightly run with a real model; that gap
   grows more expensive the longer the vocabulary sits unvalidated by an actual harness.
5. **`packages/core` and `packages/ui` do not exist**, so `apps/web` holds both the protocol
   client and the tokens. Mobile in Phase 4 shares `packages/core`; the longer the web app is the
   only home for that code, the more of it will assume a browser.
