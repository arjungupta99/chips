# Phase 0 review

Verdict: **Pass with fixes**
Reviewed commit: `250910d` (tag `phase-0-complete` is `acf0f30`; the seven files changed since are documentation and one comment in `schema.ts`, so the tag is what was reviewed)
Reviewer: Fable · 3 September 2026

The foundation is real. The event log, the projections, `rebuild`, the two transports and the
guardrails do what the packet says they do, and I could reproduce every number in it. The
approval loop runs end to end in a browser against a real server, a real key and a real socket.
The guardrails caught real faults during the phase, and they caught nothing false.

What holds the verdict at *with fixes* rather than *pass* is the auth model, which is exactly
what the gate focus asked me to look at. Three things are wrong there, and the first one is
serious: **an agent can approve its own approval request.** None of them is a redesign — each is
one file and one test — but Phase 1 builds the policy engine on `submitEvent`, so they have to be
fixed before it starts, not alongside it.

## What was verified

Everything was run locally on Node 26.x, because Homebrew's `node@22` is broken on this machine
(the packet says the same). **The Node 22 leg has not been observed**: `gh` is not authenticated
here and the repository is private, so I could not read the Actions tab. See condition 3.

| Command | Result |
|---|---|
| `pnpm check` (Biome, dependency-cruiser, architecture and protocol staleness checks, typecheck, tests) | exit 0 · 23 files, **496 passed**, 0 skipped · 132 modules, no violations |
| `pnpm test` coverage | 96.68 lines / 85.38 branches / 96.25 functions / 95.03 statements — identical to the packet, and so are the per-directory numbers |
| `pnpm e2e` | 2 passed (Chromium, 7.2 s): pair, run, approve, complete, audit with seqs 1..n and no gaps |
| `pnpm build` | exit 0 (three `tsc` builds, Vite, Astro with the link validator; 58 pages) |
| `pnpm docs:check` | 3/3 samples |
| `pnpm bench:append` | append 1,300 ms, replay 296 ms, **1,596 ms** against 2,000 (packet: 1,451; both under) |

I read every non-generated source file and every test in `packages/protocol`,
`packages/platform`, `server`, `apps/web`, `examples/scout`, `tools`, the migration, the
workflow, the four configuration files, ADRs 0002–0019, `STATUS.md` and the packet. I walked the
demo script through the Playwright run, which *is* the demo script. I checked repo hygiene: 29
commits, every one Conventional and DCO signed-off; lockfile committed; `.chips/` and
`.playwright-chips/` ignored; no token-shaped string anywhere in the tree; nothing `.skip`,
`.only` or `.todo` in any test.

Then I wrote eight throwaway probes against the gateway (a temporary Vitest file, run and
deleted; the working tree is clean). They are the evidence behind findings 1, 2, 5, 6, 7 and 8:

| Probe | What it did | What happened |
|---|---|---|
| P1 | Scout posts `approval.request` for a $50,000 transfer, then posts `approval.resolved` for it with `scope: "always"` and `resolved_by: <Arjun>` | **201.** Approval resolved, decision `approved`, resolved by "Arjun". Run back to `running`. |
| P2 | Scout posts `policy.updated` for itself: autonomy 3, workspace cap 3, `changed_by: <Arjun>` | **201.** Appended at seq 5. |
| P3 | Scout posts `conversation.created` then `membership.added` for Arjun | **201, 201.** |
| P4 | Parse the `hello` the server sends a *person* through `parseEvent` | **Invalid**: `agents.0.agent_id: expected a agent id` (it is a `usr_`). |
| P5 | `GET /v1/events?since=0&limit=-5` with 14 events in the log | 9 events returned, `next_cursor: 9`. |
| P6 | Arjun signs `approval.resolved` with `resolved_by: usr_…Q` (nobody) and `resolved_at: 2020-01-01` | **201.** Both stored verbatim and returned by `/wait`. |
| P7 | Scout, a member of one conversation, reads `/v1/events?since=0` after a second conversation is opened for Dana | Sees both conversations' events. |
| P8 | Reuse one device signature for `GET /v1/events` with a different query string | 200 both times. |

## Engineering standards (Appendix G)

| # | Check | Result |
|---|---|---|
| 1 | Layers, inward imports, `dependency-cruiser` green | **Yes.** Verified; the fixture tree in `tools/guardrails` proves twelve of thirteen rules fire and nothing else does. |
| 2 | Every external input validated once at the edge, trusted after | **Shape, yes. Authority, no.** `parseEvent` is the one edge and nothing re-validates. But the edge checks *what* is sent, not *who may send it* — see finding 1. |
| 3 | Idempotency key on every command; handlers safe twice | **Yes.** Refused without one at both transports; retries return the original `seq` with `duplicate: true` and publish nothing. Verified by tests and by hand. |
| 4 | Every query workspace-scoped; repository lint passes | **Scoped, by reading** — I read each query in `sqlite-event-store.ts`, `read-models.ts`, `device-registry.ts`, `projection-writer.ts` and `authenticator.ts`. The two registry lookups by `token_hash` and by `device.id` carry no workspace predicate because they are what *establishes* the workspace; that is correct. **There is no lint rule**, as the packet says. |
| 5 | Events and projections in one transaction; `rebuild` reproduces | **Yes.** One transaction; the property test rebuilds 40 random sequences of up to 25 events and compares every projection row. The generator is narrower than the state space (one run, one approval, one ask per sequence; never a second `run.started`); fine for Phase 0, worth widening when the read models multiply. |
| 6 | Cursor pagination, an index per query | **Yes**, with one bug: a negative `limit` escapes the cap (finding 7). |
| 7 | Heavy work off the request path | Not applicable yet. |
| 8 | Coverage met, none went down | **Yes**, reproduced exactly. Both per-directory thresholds were shown to bite, which matters because Vitest is silent about a glob that matches nothing. |
| 9 | Property tests for state machines and invariants | **Yes.** Ids, envelope round trip, negotiation, run state, replay. |
| 10 | Deterministic: no sleeps, injected clock and ids | **Yes**, one exception: `routes/uploads.ts:36` mints ids with the process-wide `newId` rather than `deps.ids`. |
| 11 | Quarantined tests older than 48 hours | **None**, verified. |
| 12 | Logs carry ids, no personal data | **Partly**, as the packet says. Plus: every `HttpError` — including an expected 401 for a wrong pairing code — is logged at `error` with a stack trace (`app.ts:42–46`; visible in the e2e output). |
| 13 | Metrics for anything a runbook needs | Declared, one recorded. Agree with the packet. |
| 14 | Dependencies pinned, justified, maintained | **Yes.** Fourteen runtime, all exact, all named by a decision. |
| 15 | Public APIs documented, reference regenerated | **Mostly.** The reference is generated and checked. Two omissions and one wrong sample (findings 10, 11). |
| 16 | Blueprint nouns | **Yes.** |
| 17 | Sizes | **Mostly**, as the packet says. |
| 18 | Load numbers | **Partly**, as the packet says; and see finding 13 on the CI runner. |

One thing the packet claims that is not true: *"`turbo run typecheck` — 6 packages, clean,
including `astro check` on the docs site."* `astro check` does not run (finding 4).

## Findings

Ranked. Each has a file reference, the failure scenario, and the fix.

### 1. An agent can resolve its own approval — direction is not enforced by principal kind
**High. Blocks Phase 1.** `server/src/application/use-cases/submit-event.ts:73–97,144–157`.

`submitEvent` enforces three things: the actor is the principal, the workspace is the
principal's, and there is an idempotency key. It also refuses the four delivery-only events. It
never asks whether *this kind of principal* may send *this direction of event*. So an agent
token can send any `chips_to_agent` event except those four, and any `workspace` event.

Probe P1: Scout requests approval for a $50,000 transfer and approves it itself, with
`scope: "always"`, naming Arjun as the resolver. The approval is resolved, the run goes back to
`running`, and `GET /v1/approvals/:id/wait` tells the hook `approved`. In Phase 0 the only agent
is a script, so nothing is lost today — but the entire product promise is that this cannot
happen, and M1.4 will make `policy.updated` (probe P2) the *source* of an agent's autonomy under
ADR 0019, at which point P2 is privilege escalation. Probe P3 shows an agent opening
conversations and adding people, which ADR 0018 calls "human actions".

The route-level check in `POST /v1/agents/:id/events` does not help: `POST /v1/runs/:id/events`
and the socket accept anything.

**Fix**, in `refuse()`, where the other three rules already live: `agent_to_chips` only from
`kind: "agent"`; `chips_to_agent` that is not delivery-only only from `kind: "person"` (with
`budget.warning` and `lane.updated` — which Chips computes — accepted from nobody, alongside the
delivery-only four); `workspace` only from `kind: "person"`. Tests in `gateway.test.ts` and
`session.test.ts` beside "refuses an event sent on somebody else's behalf", one per direction per
kind. Add the rule to `server/README.md`'s invariant table.

### 2. Decision attribution is client-supplied
**High.** `submit-event.ts:111–127` (`draftFrom`), `server/src/domain/projection.ts:337–354`,
`routes/approvals.ts:42–54`.

`resolved_by`, `resolved_at`, `answered_by`, `by` and `changed_by` are free strings the sender
chooses, and the projector stores them verbatim. Probe P6: Arjun, signing correctly, attributes
an approval to a participant who does not exist, dated 2020; that is what the approval read
model and the `/wait` response now say. The audit `actor` is right, but the screen and the hook
read the payload, not the actor.

The same applies to `ts`: `draftFrom` stamps the clock and then spreads the client event over
it, so a client-supplied `ts` wins, and `expires_at` and `last_activity_at` are computed from it.
An agent can make its approval never expire.

**Fix:** server-stamp `resolved_by`/`answered_by`/`by`/`changed_by` from the principal and
`resolved_at`/`answered_at` from the clock in `draftFrom` (the plan's own phrase: "fill in what
the transport knows and the sender should not have to repeat"), or refuse when they differ from
`actor.id`. Bound `ts` to the signature window, or stamp it and keep the client's value in a
separate field if a harness needs its own clock recorded.

### 3. `CHIPS_DEV_MODE=false` turns dev mode on
**High.** `packages/platform/src/config/schema.ts:23,47`.

`z.coerce.boolean()` is `Boolean(input)`, and `Boolean("false")` is `true`. Verified:
`"false"`, `"0"`, `"no"` and `"off"` all yield `devMode: true` (and `log.pretty: true`). Dev
mode bootstraps a workspace and writes an agent token to disk. The typed configuration exists to
make this class of mistake impossible, and the test suite only tries `"true"`.

**Fix:** a string-aware boolean (`z.stringbool()` in Zod 4, or an enum of spellings with a
transform), and a test for each spelling in both directions. Check no other `coerce.boolean`
lands in the schema later.

### 4. `astro check` never runs, and the packet says it does
**Medium.** `apps/docs/package.json:13`.

`@astrojs/check` is not a dependency (it is in neither `package.json` nor the lockfile). `astro
check` prints an interactive install prompt and exits 0 — locally, in `turbo run typecheck`, and
it will in CI. The docs site has therefore never been type-checked, and the packet's Lint and
typecheck section reports it as clean. This is the one place the packet's word could not be
taken.

**Fix:** add `@astrojs/check` and `typescript` to the docs devDependencies, pinned, and prove
the check bites with a deliberate error before committing — or delete the script and say the
site is not type-checked. Correct the packet.

### 5. A device signature covers the path but not the query, and has no nonce
**Medium.** `server/src/infrastructure/auth/credentials.ts:63–68`,
`server/src/interfaces/ws/server.ts:78–98`, `apps/web/src/client.ts:46–56`.

The signed string is `METHOD\npath\ntimestamp\nsha256(body)`. Probe P8: one signature for `GET
/v1/events` works with any query string for five minutes. More important is the socket: the
browser has to put the signature in the URL, and the signed payload for the upgrade is constant
apart from the timestamp — so a URL that lands in a proxy log or a `Referer` opens a socket as
that person for five minutes and reads the whole workspace with `since: 0`. The code comments
know this; the plan's "signing requests" does not define the payload, so this is a Phase 0
decision that Phase 1 and `chips pair` will inherit.

**Fix, before `chips pair` and `packages/core`:** sign the full request-target (path and query),
and either add a nonce with a short server-side replay cache keyed by device, or exchange the
signed upgrade for a short-lived single-use socket ticket so nothing durable is ever in a URL.
Write it into ADR 0006 as a consequence.

### 6. Read scope is the whole workspace for any credential
**Medium.** `routes/events.ts:85–94`, `session.ts:161–210`, `in-process-fanout.ts:22–28`.

Memberships are projected and never consulted. Probe P7: an agent token reads every
conversation's events, including a direct conversation it is not in, via `GET /v1/events` or a
workspace subscription; so does any person. Acceptable in Phase 0 (one conversation), but the
plan's security track lists token scoping at every gate, and Phase 1's M1.2 adds conversations.

**Fix:** a task in M1.2 — reads and subscriptions filtered by membership, with the "another
conversation" test beside the "another workspace" one. Section 4.3 should say "token scoping,
read and write".

### 7. A negative `limit` escapes the page cap
**Low.** `routes/events.ts:90`, `sqlite-event-store.ts:112–119`.

`Math.min(-5, 1000)` is `-5`; SQLite treats `LIMIT -4` as unlimited; `slice(0, -5)` then drops
the last five. Probe P5: 9 of 14 events with `next_cursor: 9`. Workspace-scoped, so not a leak;
just wrong. **Fix:** clamp to `[1, 1000]`.

### 8. The `hello` sent to a person fails the protocol's own schema
**Low.** `session.ts:147–169`.

The manifest puts the person's `usr_` id in `agents[0].agent_id`, which the schema declares as
an agent id. The web client ignores it, so nothing breaks; but the server emits an event its own
package refuses. **Fix:** decide what a person's `hello` carries (the schema could allow an empty
`agents` for a person's client), and add a test that parses the server's `hello` through
`parseEvent` for both principal kinds.

### 9. Backpressure is nominal
**Low.** `session.ts:91–93,274–288`.

`unacked` counts frames sent since the last inbound frame of any kind, and resets on a `pong`.
A consumer that never reads but answers pings is never dropped, and `ws.bufferedAmount` is never
consulted, so the "bounded outbound queue" of 6.2 is unbounded in practice. **Fix** (Phase 1 or
6): drop on `bufferedAmount` above a threshold, and count delivered-but-unacknowledged *events*
rather than frames-since-last-inbound.

### 10. The hooks-mode sample defeats its own idempotency
**Low, docs.** `apps/docs/src/content/docs/connect/hooks.md:23`.

`Idempotency-Key: $CHIPS_RUN_ID-$(date +%s)` changes every second, so a retry after a dropped
connection is a *second* approval request — on the page whose next section explains that the
key is what makes a retry safe. **Fix:** key on `$CHIPS_APPROVAL_ID`.

### 11. Two documentation gaps and one stale sentence
**Low, docs.** `reference/http.md` omits `POST /v1/pair`; `connect/websocket.md` and `http.md`
omit the query-string credential forms the browser depends on (`?token=` and
`?device=&ts=&sig=`); `docs/architecture.md:135` (from the template) and `README.md:38` still
say ids live in `packages/platform`. `server/README.md` says the `Socket` interface has three
methods; it has two.

### 12. Expected refusals are logged as errors with stack traces
**Low, ops.** `server/src/interfaces/http/app.ts:42–46`. Log `HttpError` below 500 at `warn`
without `err.stack`; keep `error` for the rest.

### 13. The benchmark budget is a CI risk, not a code risk
**Low, CI.** `.github/workflows/ci.yml`, "Benchmark the event log". The number is 1.3–1.6 s on
this laptop against a 2 s line. A GitHub-hosted runner can be twice as slow, which would make
`main` red for a non-regression. Section 6.2's own wording is "fails on a 20 percent
regression": record the number as an artifact and fail against a stored baseline, or scale the
budget by a calibration run.

Smaller notes, no action required at this gate: `resolved_elsewhere` and "first answer wins" are
unenforced (two `approval.resolved` events both apply; last wins) — that is M1.4's; nothing
sweeps expired approvals — M1.4's; `POST /v1/pair` has no rate limit, but the code space is
32^6 with a 15-minute TTL and a wrong guess does not consume the real code, so brute force is not
practical against a laptop; `x-request-id` is client-controlled and echoed, which pino escapes.

## Deviations accepted

- `packages/platform`, `tools/`, `server/bench`, `docs/architecture.md` (ADR 0017). Accepted.
- The eight frames in M0.2; the three `workspace` events and the projection/registry line (ADR
  0018). Accepted — with the note that accepting `workspace` events from an agent contradicts
  the ADR's own "human actions", which finding 1 fixes.
- `evt_`, `dev_`, `tok_` prefixes. Accepted. Add one line to ADR 0011 pointing at the extension,
  so the list has one home.
- `POST /v1/pair`, the pairing use case and the dev-mode bootstrap. **Accepted; the shape is
  right** — a non-extractable key generated on the device, only the public half on the wire, a
  single-use short-lived code held in memory, a signature bound to method, path, body and clock.
  Conditions: findings 3 and 5.
- `GET /v1/approvals/:id`, `GET /v1/events`, the declared upload stub, `server/src/testing`.
  Accepted.
- Node 26 locally with Node 22 as the target. Accepted, pending CI.
- Biome `recommended` plus escalations; `useLiteralKeys` off. Accepted.
- `client.ts` and `device.ts` excluded from the Vitest report and covered by Playwright.
  Accepted; the reason is stated where the exclusion is.
- The edits to `docs/technical-plan.md` (section 0.6, M1.4, M7.7) were authorised by Arjun on
  3 September and are consistent with ADR 0019. Accepted.
- Nothing to reverse.

## Answers to the packet's questions

1. **The pair shape is right.** Build `chips pair` on it after finding 5 is fixed, and in the
   same change move the signing code to `packages/core` (question 4) so there is one signer.
2. **ADR 0019 is right**, and it makes finding 1 mandatory rather than merely important: once
   `policy.updated` *is* the policy, who may append it is the whole security of the dial. The
   ADR or M1.4 should say it in one sentence — a person with the owner role, or `system` — and
   the projector should ignore any other actor as belt and braces.
3. **Yes**, an explicit `since` is a request to re-read, and omitting it means "from now". Two
   sentences belong in `connect/websocket.md`: that reading, and that `since` is exclusive — the
   first event delivered is `since + 1`. "Replays from there" currently reads as inclusive.
4. **Move `client.ts` as the first task of M1.2**, not before the gate: it is the plan's own
   home for it, and finding 5 changes what it signs, so do both at once.
5. **Not appending `hello` is right** — it is delivery, not history (ADR 0018), and the audit
   should not show something that did not happen. Fix finding 8 so the thing that is not
   appended is at least valid.

## On the three things the implementer asked to have challenged

1. *CI has never run.* Confirmed unverifiable from here. Every command in the workflow passes
   locally; two things could make the first run red for reasons other than the code: the
   benchmark on a slower runner (finding 13), and — harmlessly — `astro check` will pass by not
   running (finding 4). `better-sqlite3` compiling on Node 22 is the genuine unknown.
2. *No lint rule enforces workspace scoping.* Agreed, and agreed it is Phase 1's. A concrete
   mechanism that fits this repository: a `tools/` check in the style of `tools/architecture`
   that parses `server/src/infrastructure/**` for `selectFrom`/`updateTable`/`deleteFrom` chains
   and fails any chain without a `workspace_id` predicate, with an allow-list for the two
   credential lookups. Cheaper than a Kysely plugin and it runs in `pnpm lint`.
3. *Pair and the bootstrap.* Answered above: shape right, two conditions.

## Conditions for the next phase

1. **Findings 1, 2 and 3 fixed, with tests, before any Phase 1 code.** One commit each, or one
   for 1 and 2 together. Fable confirms in a short follow-up; that follow-up is the gate.
2. **Finding 4 fixed** and the packet's Lint and typecheck paragraph corrected in the same
   commit.
3. **CI observed green on Node 22** for `main` after those commits. Arjun reads the Actions tab
   and says so in `STATUS.md` ("Last review", "Last commit reviewed"); if it is red, it is fixed
   before Phase 1 starts.
4. **Findings 5 and 6 written into the plan** as tasks — 5 in M1.2 alongside the `packages/core`
   move, 6 in M1.2 — at this gate, by Fable with Arjun, since the plan is edited only at gates.
5. Findings 7–13 at the implementer's discretion inside Phase 1; 10 and 11 are ten-minute fixes
   that should ride along with the commit for finding 1.

`STATUS.md` is the implementer's file and has been left alone; its two header lines should be
updated by the session that applies the fixes.

---

## Follow-up: the fixes, confirmed

3 September 2026 · Reviewed commit `fe35333` · Verdict: **Pass**

Conditions 1 and 2 are met, condition 4 is done below, and condition 5 was discretionary.
Condition 3 — a green CI run on Node 22 — is the one thing I cannot see from here: `gh` is not
authenticated on this machine and the repository is private. It is Arjun's one look at the
Actions tab, recorded in `STATUS.md`. Phase 1 may start in a fresh session once it is.

### What was verified

Not on the implementer's word, even though the implementer was also me.

- **The review's probes, re-run against `fe35333`** with a throwaway test file, deleted after.
  The table below is the before and after.
- **Finding 4 bites.** A deliberate type error in `apps/docs/src` fails `pnpm typecheck` (exit
  1); one in `apps/docs/samples` fails it (`tsc` exit 2); the clean site passes, with
  `astro check` now seeing 5 files where it saw 0.
- **`pnpm install --frozen-lockfile --offline` succeeds** on the changed lockfile — what CI runs.
- **Every fix commit's diff read.** The files touched are the ones the finding needs; nothing
  else rides along. Every path into the store is still `submitEvent` (the door), the dev-mode
  bootstrap and the test scaffold — no bypass.
- **The full chain on the final tree:** `pnpm check` 24 files, 591 tests, coverage
  95.19 / 86.05 / 96.52 / 96.81; e2e 2/2 (on `CHIPS_E2E_WEB_PORT=5199`, because 5174 belongs to
  another project on this machine); build; samples 3/3; bench 1,532 ms.
- **`chipsd serve` with `CHIPS_DEV_MODE=maybe` refuses to start**: "configuration is invalid:
  devMode: Invalid input".

| Probe | At the review | Now |
|---|---|---|
| P1 Scout resolves its own $50,000 approval, naming Arjun, `scope: "always"` | 201; approval resolved; run `running` | **403 `forbidden`**; approval `pending`; run `waiting`. "approval.resolved is something a person sends, and this credential belongs to an agent" |
| P1b the same over the socket | `ack` | `error` frame, code `forbidden`, no `ack` |
| P2 Scout appends `policy.updated` for itself | 201 | **403** |
| P3 Scout opens a conversation and adds a person | 201, 201 | **403, 403** |
| P3b Scout forges `budget.warning` and `lane.updated` | not probed | **403, 403** |
| P3c Arjun starts a run | not probed | **403** — "run.started is something an agent sends" |
| P6 Arjun attributes a decision to `usr_…Q`, dated 2020, with `ts` 2020 | stored and reported verbatim | `resolved_by` is Arjun; `resolved_at` and `ts` are the server's clock; `/wait` reports Arjun |
| P6b Scout dates an approval's `ts` into 2099 | would never expire | `expires_at` is now plus `expires_in` |
| P9 a retried post after stamping | — | still `200`, `duplicate: true`, same `seq` — stamping does not break idempotency |
| P4, P5, P8 (findings 8, 7, 5) | — | unchanged, as expected; Phase 1's |

### The four findings, one by one

1. **Fixed** (`fcdaf59`). The rule is where the review asked for it — in `refuse()` beside the
   other three — and derived from the catalogue's direction, so a new event type cannot arrive
   without a decision about who sends it. `submit-event.test.ts` drives all 32 types from both
   kinds, 64 cases, plus the two system-only events. The hooks and socket pages say who may
   send what; the server README's invariant table has the row. One thing the fix surfaced: an
   existing gateway test had Scout resolving an approval to set up a long-poll case — the hole
   had a test leaning on it — and now has Arjun sign the decision.
2. **Fixed** (`c219b6f`). `ts` and the six attribution fields are stamped in `draftFrom`; the
   schema descriptions and the envelope page say so; the web app stopped sending what it no
   longer owns. **Residual, not a blocker:** `from` on `run.steer` and `feedback` is a
   participant ref Chips must *fill* from the registry and the membership, which a stamping
   table cannot do. Nothing sends those events in Phase 0. It is now an M1.3 task.
3. **Fixed** (`f41fafb`). A union of a real boolean and `z.stringbool()`; twelve spellings
   tested in both directions, a file boolean, and the refusal that names the variable. The
   install page gained the `CHIPS_DEV_MODE` row it never had.
4. **Fixed** (`ff87183`), and further than the review asked, correctly: installing
   `@astrojs/check` alone would have produced a check of "0 files", because the tool checks
   `.astro` files and the site has none. The docs package now has a real `tsconfig.json` and
   runs `tsc` over its TypeScript, keeping `astro check` for the components later phases add.
   The packet carries the correction.

Also `49fc5cc`, found while confirming rather than by the review: the Playwright suite could
only pass once per machine, because its data directory persisted and the bootstrap reuses a
workspace it finds. A fresh temporary directory per run, removed on teardown, and both ports
configurable so the suite never competes with another project. The right fix.

### Condition 4, done at this gate

`docs/technical-plan.md`: M1.2 gains the two tasks — finding 5 (sign the full request-target
with a nonce or a single-use socket ticket; the signer moves to `packages/core` with the
client; ADR 0006 gains the payload) and finding 6 (reads and subscriptions scoped by
membership) — with the acceptance criterion extended to test both; M1.3 gains the `from`
residual; section 4.3 now reads "token scoping, of what a credential may write and of what it
may read". `technical-plan.html` re-rendered.

### Verdict

**Pass.** Phase 1 starts in a fresh context once Arjun records a green Node 22 run in
`STATUS.md`. That session reads this review, then `STATUS.md`, then Phase 1 in the plan — and
decides `message.post` from a person deliberately, which `STATUS.md` explains.
