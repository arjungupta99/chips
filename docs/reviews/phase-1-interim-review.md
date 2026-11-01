# Phase 1 interim review — M1.1 and M1.2

Verdict: **M1.1 accepted. M1.2 is not finished, and has two High findings to fix inside it before
M1.3 starts: writes are not scoped by membership, and its own acceptance test is flaky because the
client renders once per frame.**
Reviewed commit: `e08d66c` (eight commits since `fe35333`, the last commit the Phase 0 follow-up
reviewed)
Reviewer: Fable · 3 September 2026

This is an interim review at Arjun's request, not the Phase 1 gate. The gate — the packet, the
kickoff prompt, and M1.1 to M1.6 against Appendix G — is still ahead. What this does is apply the
gate's standard to what exists now, so that what is wrong is cheap to fix while M1.2 is still
open, and so the gate is not the first time anyone looks.

The design system is done, and done the way the plan asks. The tokens have one definition; the
two values that differ from the blueprint differ for a measured reason that is written down; every
component has a jsdom test that reads like a sentence; thirty-four snapshots are pinned to one
container image with a guardrail that fails the moment the tag and the installed Playwright
disagree; axe is green on the kitchen sink. The three new layer rules fire on fixtures and nothing
else fires. `packages/core` is the right shape — the protocol and nothing else of ours, a pure fold
from the log to the screens, the browser confined to four files at the edge — and the shell holds
only the two things the log cannot know, which conversation is open and which tab.

Two things the Phase 0 review asked for landed the way it asked. A device signs the full request
target, and a test replays one signature with a different query and is refused. A person's socket
opens on a single-use ticket; the old signature-in-the-URL form is refused; a spent ticket is
refused. Reads are scoped by membership through one predicate that both the replay and the live
path use, which is the right structure. `message.post` was decided in the open, as an explicit
exception list rather than a loosened rule, and the test drives all thirty-two types from both
kinds.

What holds M1.2 is the mirror image of what Phase 0's review found in finding 6. **Membership now
scopes what a credential may read, and still does not scope what it may write.** Scout posts into
a direct conversation it was never in; Scout starts a run there and asks for approval there; Arjun,
who is not in it either, approves that request with `scope: "always"`; and any person can add
themselves to any conversation. Every one of those is a 201. Finding 1 says why this is High now
when its twin was Medium in Phase 0, and what the fix is.

Beside it, M1.2's own acceptance test is flaky. The reload-offline case failed three runs in four
today, always at the same line: after a fresh pairing against the five hundred messages the burst
test leaves behind, the sidebar takes longer than its twenty seconds to appear, because the client
folds and renders once per arriving frame. The fold is not the cost — measured at 12 ms for all
520 arrivals — the render is. Three Medium findings sit beside those, all M1.2's own: the shell's
Edit button resolves an approval as approved-with-edits without an editor ever appearing; a
message or a decision sent while the socket is down is lost and shown as "sending…" forever; and
the shell has no unit test at all, which the coverage report cannot say because its include glob
does not match a `.tsx` under `apps/web`.

## What was verified

Everything was run locally on Node 26, as before. **The Node 22 leg has still not been observed**:
condition 3 of the Phase 0 review is open, and eight more commits have gone to `main` since the
last review said so. See the conditions.

| Command | Result |
|---|---|
| `pnpm check` (Biome, dependency-cruiser, architecture and protocol staleness, typecheck, tests with coverage) | exit 0 · 52 files, **739 passed**, 0 skipped · 234 modules, no violations; the guardrail suite proves fifteen rules fire on fixtures, including the three new ones |
| coverage | **95.17 lines / 83.04 branches / 94.84 functions / 93.09 statements** — against 95.19 / 86.05 / 96.52 / 96.81 at the Phase 0 follow-up. Above every threshold; three of four went down (Appendix G #8, below) |
| `CHIPS_E2E_WEB_PORT=5199 pnpm e2e` | **3 of 4 passed** in the full run; `sync.spec.ts` alone then passed 1 run in 3. The failing case is always the same: after a fresh pairing against the ~520 events the burst test leaves, the sidebar does not show the conversation within 20 s (`pair()`, `sync.spec.ts:72`) — finding 2. The approval loop, the single-use pairing code and the 500-message burst passed every time, the burst at 28–33 s against a 30 s assertion |
| `pnpm visual` (Docker, `mcr.microsoft.com/playwright:v1.62.1-noble`) | exit 0 · **40 passed** (51.8 s): the 34 snapshots in both themes unchanged, axe clean on the sink, the three ways to dark |
| `pnpm bench:append` | append 1,373 ms, replay 301 ms, **1,673 ms** against 2,000 (Phase 0 follow-up: 1,532 ms; under, and the Phase 0 review's finding 13 about a slower CI runner still stands) |
| `pnpm build` | exit 0 · 7 tasks (three `tsc` builds, the `/ui` style copy, Vite, Astro with the link validator) |
| `pnpm docs:check` and `pnpm docs:build` | 3/3 samples; the site builds with every internal link valid |

I read every source file and every test in `packages/ui`, `packages/core` and `apps/web/src`, the
whole server diff since `fe35333` (37 files), the workflow, the root and per-package configs, ADR
0006, the docs pages that changed, both package READMEs, `STATUS.md`, and Phase 1 in the plan.
Repository hygiene: eight commits, every one Conventional and signed off; the working tree clean
and in sync with `origin/main`; nothing `.skip`, `.only` or `.todo`; no token-shaped string in the
tree.

Then six throwaway probes — five against the gateway in a temporary test file, deleted after, and
one against `packages/core` under `tsx`. They are the evidence for findings 1, 6 and 11; the measurement row is finding 2's.

| Probe | What it did | What happened |
|---|---|---|
| W1 | Scout, a member of the demo conversation and nothing else, `POST /v1/agents/:id/events` with a `message.post` into a direct conversation that holds Dana alone | **201.** Dana's next `GET /v1/events` shows her private conversation as `conversation.created`, `membership.added`, `message.post`. |
| W2 | Scout `run.started` then `approval.request` in that same conversation over `POST /v1/runs/:runId/events`; then Arjun — not a member — signs `approval.resolved` with `scope: "always"` | **201, 201, 201.** The approval read model: `resolved`, `approved`, scope `always`, resolved by Arjun. |
| W3 | `GET /v1/events?since=0&limit=-2` against four visible events | 200 with **two** events and `next_cursor: 2`. Phase 0 finding 7, unchanged. |
| W4 | Scout posts `run.status` to `POST /v1/runs/<a run nobody started>/events` | **201.** No `runs` row exists before or after. |
| W6 | Arjun submits `membership.added` naming himself into Dana's direct conversation, then reads | Accepted. His next `GET /v1/events` returns that conversation's events. |
| T1 | A throwaway spec times a fresh pairing until the sidebar shows the conversation, at 3 events and again after a 500-message burst; `buildModel` timed in Node over the same arrivals | 3 events: 104 ms to the sidebar, 638 ms to settle. 503 events: **21.9 s** before the sidebar could be observed at all and **26.6 s** until the last of 500 rows settled — the main thread is saturated for the whole replay, which is why a 20 s wait fails on a loaded machine and scrapes through on an idle one. The pure fold costs **12 ms** for 520 one-at-a-time refolds of the whole log, so the time is the render. |
| C1 | `safeHref("/\\evil.example/x")`, and `parseInline("[Open the PO](/\\evil.example/login)")` | Returns the target unchanged; the second is a live `link` token. Chromium resolves `/\evil.example/login` to `http://evil.example/login`. |

## Engineering standards (Appendix G)

| # | Check | Result |
|---|---|---|
| 1 | Layers, inward imports, `dependency-cruiser` green | **Yes.** 234 modules, no violations. `clients-not-to-server`, `server-not-to-clients` and `ui-and-core-are-siblings` each have a fixture that fires; the exported-stylesheet exemption is narrow (`\.css$`, and only past a package's `exports`). `docs/architecture.md` regenerated with the two new nodes. |
| 2 | Every external input validated once at the edge, trusted after | **Shape and direction, yes. Membership, no.** `parseEvent` is still the one edge; `refuse()` checks workspace, actor, direction and idempotency key, and nothing checks that the actor may write into the conversation the event names — finding 1. |
| 3 | Idempotency key on every command; handlers safe twice | **Yes**, and the client leans on it well: the optimistic send's key is echoed on the streamed-back event and that is the reconciliation. But nothing is ever re-sent — finding 4. |
| 4 | Every query workspace-scoped; repository lint passes | **Scoped, by reading**, with one deliberate exception: `anyPerson()` in `read-models.ts:114–125` has no workspace predicate, is documented as dev-only, and is called only by a route that exists only in dev mode. **There is still no lint rule** (Phase 0 known issue 2; the Phase 0 review sketched a `tools/` check). The number of queries has grown by four. |
| 5 | Events and projections in one transaction; `rebuild` reproduces | **Yes**, unchanged. The scope on `since` does not touch `append`. |
| 6 | Cursor pagination, an index per query | **Yes.** The scoped `since` asks for `limit + 1` visible rows, so a page is honest whether or not the viewer can see every event in the range; `(workspace_id, conversation_id, seq)` is indexed. A negative `limit` still escapes — finding 11. |
| 7 | Heavy work off the request path | Not applicable until M1.5. |
| 8 | Coverage met, none went down | **Met; three of four went down.** Branches 86.05 → 83.04, functions 96.52 → 94.84, statements 96.81 → 93.09. Two causes, one good and one not: `packages/*/src/**/*.tsx` joined the report, which is right; and `apps/web/src/**/*.tsx` did not, which is finding 5. `packages/core/src/model.ts` is at 56 percent branches — finding 13. |
| 9 | Property tests for state machines and invariants | **One extended, none added.** The signature property now covers the target. The fold's central invariant — any order of the same events folds to the same model — is asserted on one reversed list. `fast-check` is a devDependency of `packages/core` and is imported nowhere in it — finding 13. |
| 10 | Deterministic: no sleeps, injected clock and ids | **Yes.** The e2e polls, never sleeps; `store.ts` and `time.ts` take an injected `now`; `socket-tickets.ts` takes a clock and a token source. |
| 11 | Quarantined tests older than 48 hours | **None**, verified. |
| 12 | Logs carry ids, no personal data | Unchanged from Phase 0. `socket-tickets` logs a refused ticket without the ticket. |
| 13 | Metrics for anything a runbook needs | Unchanged: declared, one recorded. No instrument for tickets issued or refused, nor for hidden-by-scope events — worth one line each when the sockets metric is wired. |
| 14 | Dependencies pinned, justified, maintained | **Yes.** Three runtime additions, the Fontsource faces, exact-pinned, OFL, justified in `STATUS.md` (self-hosting is what keeps the app offline-capable and a strict CSP possible). `@axe-core/playwright`, `@testing-library/*` and `jsdom` in dev, pinned. |
| 15 | Public APIs documented, reference regenerated | **Yes.** `http.md`, `websocket.md` and `hooks.md` say what changed; `design-system.md` is new; ADR 0006 gained the payload and the ticket as consequences; both new packages have README invariant tables. One stale sentence: `docs/architecture.md:30` still says `packages/core`, "when it arrives". |
| 16 | Blueprint nouns | **Yes.** Participant, conversation, run, approval, policy, lane, tier, throughout; the vocabulary module is exactly the blueprint's words. |
| 17 | Sizes | **Mostly.** Complexity 12 is enforced and was hit and fixed by extraction. Two more files are over 400 lines without the comment §6.4 asks for — `packages/core/src/model.ts` (520) and `apps/web/src/kitchen-sink/gallery.tsx` (542) — beside the two Phase 0 already listed. All four are flat catalogues; the argument is easy to write and still unwritten. |
| 18 | Load numbers | **Partly.** The append benchmark is unchanged and measured (above). None of §4.4 has a number yet — 10,000 messages at 60 fps, cold start under two seconds — and `STATUS.md` says so. |

## Findings

Ranked. Each has a file reference, the failure scenario, and the fix.

### 1. Membership scopes reads, not writes
**High. Fix inside M1.2, before M1.3.** `server/src/application/use-cases/submit-event.ts:194–232`
(`refuse`); `server/src/interfaces/http/routes/events.ts:42–48, 67–71`; every write path.

`refuse()` enforces four things: the actor is the principal, the workspace is the principal's, the
kind of principal may send this direction of event, and there is an idempotency key. It never asks
whether the actor may write into the conversation the event names. Since commit `2742c01` a
credential *reads* only the conversations it is a member of; it still *writes* anywhere in the
workspace. Probes W1, W2 and W6: an agent token posts into a direct conversation between people;
it starts a run and requests an approval there — which puts a card into Dana's conversation and
her Needs-you queue that she never invited; a person who is not a member resolves it, with
`scope: "always"`, which M1.4 will turn into a standing policy rule; and a person adds themself to
any conversation by id, after which they read it.

The Phase 0 review rated the read half Medium because Phase 0 had one conversation, and made it an
M1.2 task because M1.2 is where conversations arrive. They have arrived, the test workspace has two
people in it, and the read side was scoped for exactly that reason. The write side is the same
finding with worse consequences — injection rather than disclosure, and an approval is the one
object the product promises a stranger cannot touch. Section 4.3 names both halves: "token
scoping, of what a credential may write and of what it may read". M1.3 builds pause, stop and
steer on `submitEvent`, all of them person-sent and conversation-scoped, so the check has to exist
before those land, for the same reason the Phase 0 review would not let the policy engine be built
on an unfixed finding 1.

**Fix**, in `refuse()` beside the other four rules, so it holds for all three write paths at once:

- `SubmitEventDeps` gains a membership port — `ReadModels.conversationsForMember` already answers
  the question; a narrower `Memberships` interface with that one method is fine. One indexed query
  per write, before the transaction, the way `waitForApproval` and `hello` already read a
  projection. It must not live in the routes: there are three ways in.
- An event that carries `conversation_id` is refused unless the actor is a member, with a new
  `SubmitFailure` kind (`wrong_conversation`), mapped to `forbidden` at both edges like the rest.
- `conversation.created` is the one exception — nobody is a member yet — and stays person-only by
  direction. Make the creator a member: the projector writes the actor's `memberships` row on
  `conversation.created`, which ADR 0018 already calls a human action and whose actor is its first
  member. (The alternative — allowing `membership.added` from the actor of a conversation that has
  no members yet — works, and is uglier.) Either way, `membership.added` from a non-member is
  refused, which closes W6.
- Run ownership is the other half of W2 and all of W4: an event that carries `run_id`, other than
  `run.started`, must name a run that exists, in that conversation, started by that agent.
  `ReadModels.run` answers it. The plan puts "transitions enforced server-side" in M1.3; do
  ownership there, with the state machine, and the membership half now.
- Tests: `submit-event.test.ts` with a fake membership port — member and non-member, person and
  agent, `conversation.created` exempt; `gateway.test.ts` and `session.test.ts`, "cannot write
  into a conversation it is not in", beside "scoped by membership"; the row in `server/README.md`.
  Re-run W1, W2 and W6 and record them.

One structural note, because M1.4 is next. Authorization now lives in three shapes in three
places: direction in `refuse()`, visibility in `visibility.ts` with a SQL twin in the store, and a
route-level check in `/v1/agents/:id/events`. Membership on write will make a fourth, and the
policy engine a fifth. Consider one pure `authorize(event, principal, context)` in `domain` —
direction, membership, run ownership, and later policy — with `submitEvent` gathering the `context`
through ports. Then M1.4 extends one function, and "why was this allowed at 3pm?" has one answer.

### 2. M1.2's acceptance test is flaky, because the client renders once per frame
**High. Fix inside M1.2.** `packages/core/src/store.ts:96–120` (`notify`, `ingest`);
`packages/core/src/transport.ts:80–90`; `apps/web/src/app/ConversationView.tsx:56–62, 91–109,
126–165`.

"reloading with the server unreachable shows cached history" failed in three of four runs today,
every time at the same line: `pair()` waits 20 s for the sidebar to show the demo conversation
after a fresh pairing, and it does not come. The run that passed did so at 24.3 s of a 60 s test
budget; the burst test, which passes, takes 28–33 s against a 30 s assertion. The previous session
recorded all four green, and the machine was under load today (a load average of 6 to 8) — which
is the definition, not an excuse: §6.3 says a flaky test is a bug that outranks feature work, and
this is one of M1.2's two acceptance tests.

The cause is in the client, and it is not the fold. The server delivers a replay as one WebSocket
frame per event; the browser dispatches each frame as its own task; `transport.onmessage` calls
`ingest([event])` per frame; and `notify` coalesces with `queueMicrotask`, which never spans two
tasks — so every frame is a rebuild and a render, and the comment that "a 500-message burst is a
handful of renders" is not true of a socket. The rebuild is cheap: `buildModel` over the growing
array costs 12 ms for all 520 arrivals, measured in Node. The render is not: each one reconciles
every `MessageRow` in the open conversation and re-parses its Markdown, and the follow-scroll
effect (finding 10) forces a layout each time. Five hundred and twenty renders of up to five
hundred and twenty rows is a quarter of a million row renders for one pairing — measured at
21.9 s before the sidebar could be observed and 26.6 s to settle for 503 events, against 104 ms
and 638 ms for three (probe T1). Every fresh pairing, every reconnect with a large `since` gap and every burst pays it.
`ingest` also copies the whole array and opens one IndexedDB transaction per frame.

**Fix:** coalesce `notify` per animation frame (`requestAnimationFrame`, or `setTimeout(0)` where
there is none), so a replay becomes a handful of renders rather than one per frame, and batch the
cache write the same way; memoise `MessageRow` on the line's identity (`id`, `text`, `pending`),
since the fold makes new `Line` objects each time; and stop the follow-scroll effect firing on
every snapshot (finding 10). Then the timeouts are no longer at the edge — and `pair()` should not
depend on how many messages the previous test left behind: give the reload test its own
conversation, or its own data directory. Record the number afterwards; time from Pair to the
sidebar at 500 events is the first §4.4 measurement, and it should be well under a second.

### 3. The shell's Edit button approves the action
**Medium. M1.2's.** `apps/web/src/app/ConversationView.tsx:206`; `Shell.tsx:64–72`;
`packages/core/src/store.ts:192–204`.

`onEdit={() => props.onResolve(approval, "edited", approval.preview)}` sends `approval.resolved`
with `decision: "edited"` and the preview unchanged as `updated_input`. No editor opens. Scout marks
its request `editable: true` (`examples/scout/scout.ts:150`) and the card enables Edit whenever
the request is editable and has a preview, so in the demo the button is live: a person who presses
Edit to change the email has sent it. The card's own contract — "the edit flow … is M1.4's" — is
right; the shell should not have wired the button until then.

**Fix:** pass `editable={false}` from the shell until M1.4 lands the editor, so the card disables
the button (its `Actions` already does that; leaving `onEdit` off does not — the button renders
enabled and does nothing, which is the other wrong answer). A shell test that Edit is disabled;
the e2e already asserts Approve and Deny are enabled and can assert this too.

### 4. A send while the socket is down is lost, and shown as "sending…" forever
**Medium. M1.2's ("optimistic sends").** `packages/core/src/transport.ts:80–95, 106–109`;
`store.ts:122–142, 174–204`.

The transport has no failure path. `send` calls `socket?.send` on whatever socket there is: before
`start()` has connected, `transport` is undefined and the send is dropped; on a closed socket the
browser discards it; on reconnect nothing is re-sent. `onmessage` acts on `ping` and `event` and
ignores `ack` and `error`, so a refused event — an invalid one, or a `too_far_behind` — is never
reported. The store adds a pending line on `send` and removes it only when an event with the same
idempotency key streams back. So: type a message during a reconnect, and it shows "sending…"
until reload and is never sent; press Approve during one, and nothing happens at all, with nothing
on screen to say so. The idempotency key exists to make re-sending safe, and nothing re-sends.

**Fix:** queue unsent events in the transport until `open`, and resend the pending ones after every
reconnect (the key makes a duplicate a `duplicate: true` ack, which is the point of it); surface an
`error` frame to the store, which marks the pending line failed with the message; treat the `ack`
as confirmation for a send that does not echo, such as a decision. Test it in `store.ts` with the
injected `connect` — see finding 5 for why that is possible today and not done.

### 5. The shell and the store are untested, and the report cannot see the shell
**Medium.** `vitest.config.ts:16–21, 29–35`; `apps/web/vitest.config.ts`; `apps/web/src/app/*`;
`packages/core/src/store.ts:60–67`.

`apps/web/src` contains no test file. Its Vitest project includes `src/**/*.test.ts` and matches
nothing. The root coverage include lists `apps/web/src/**/*.ts` and not `**/*.tsx`, so `Shell`,
`Sidebar`, `ConversationView`, `RunPanel`, `NeedsYou` and `Markdown` are outside the report
entirely — which is how findings 3, 8, 9 and 10 exist in files no number complains about. The only
`.ts` there, `time.ts`, is at 0 percent, and so is `packages/core/src/events.ts`.

`store.ts` is excluded as "the browser itself". It is not: it is the reconciliation — dedupe by
`seq`, drop a pending line by key, compute `since`, coalesce a burst, persist read state — and it
was written with seams for exactly this (`connect`, `openCache`, `now`, `randomKey`, each marked
"swapped in tests") that no test swaps. The exclusion is right for `transport.ts`, `cache.ts` and
`device.ts`, which are a socket, IndexedDB and WebCrypto, and wrong for the file that orchestrates
them.

**Fix:** add `apps/web/src/**/*.tsx` to the include; jsdom tests for the shell in the pattern
`packages/ui` established, one behaviour per test — a conversation's messages render, mine on the
right, the approval card's buttons call the store, the sidebar's counts; take `store.ts` out of the
exclusion and test it with a fake transport and an in-memory cache, including finding 4's cases.
The e2e stays as the integration proof; it is not the unit proof.

### 6. `safeHref` passes a backslash-relative target
**Low, security.** `packages/core/src/markdown.ts:58–64`.

`/^\/[^/]/` admits `/\evil.example/login`. The WHATWG parser treats a backslash as a slash in a
special scheme, so the browser resolves it to `http://evil.example/login` — probe C1. A message
from an agent that has read an external page can carry `[Open the PO](/\evil.example/login)`, and
it renders as a link that looks internal and leaves the origin. The parser's tests cover
`javascript:`, `data:` and `//evil.example`; this is the fourth spelling.

**Fix:** resolve and compare — `new URL(href, "http://chips.local").origin === "http://chips.local"`
is pure and catches every spelling — and add the case beside `//evil.example`.

### 7. The creator of a conversation does not receive its creation on the live path
**Low; reachable once a conversation is created over the wire (M3.3, Phase 5).**
`server/src/application/visibility.ts:34–39`; `session.ts:282–308`.

`conversation.created` carries a `conversation_id`; at that `seq` nobody is a member, and it is not
a membership event, so `canSee` hides it from everyone including its actor. The `membership.added`
that follows is delivered and opens the set; the messages after it are delivered. A replay includes
the creation because the projection says the creator is a member now. So the person who opens a
group sees it appear without a title until they reload, and live and replay disagree about one
event. Nothing in Phase 1 creates a conversation over the wire, so nothing shows it yet.

**Fix:** one rule in `canSee`, mirrored in the SQL: an event the viewer sent is visible to the
viewer (`actor_id = ?`). Test beside "shows a viewer the event that adds them".

### 8. The fleet lists one entry per run, not per agent
**Low.** `packages/core/src/model.ts:404–422`; `apps/web/src/app/Sidebar.tsx:98–102`.

`buildFleet` walks `state.runs` and pushes an entry for each; `FleetRow` keys by `agentId`. An agent
with two runs — the demo's second `pnpm example:scout`, or one run in each of two conversations —
appears twice with a duplicate React key, and the Agents count in the nav doubles. **Fix:** group by
agent, keep the run with the highest `seq`; a case in `model.test.ts`.

### 9. Every person's message renders as "You"
**Low now, wrong the moment there are two people.** `ConversationView.tsx:135–139`.

`mine = line.authorKind === "person"`, so Dana's message on Arjun's screen is right-aligned, ink
on paper, and captioned "You". `personName` is threaded into `MessageRow` and unused, and the
`name` ternary has the same expression on both branches — the intent was there. **Fix:** compare
`line.authorId` with the device's participant id, which the shell has.

### 10. The conversation jumps to the bottom on every snapshot
**Low.** `ConversationView.tsx:56–62`; `Shell.tsx:73`.

The follow-and-mark-read effect depends on `props.onRead`, which is a new arrow on every `Shell`
render, and `Shell` renders on every snapshot — a connection flap, a read-state write, the
directory arriving. Each one sets `scrollTop = scrollHeight`, so a person scrolled up to read
history is pulled back down by anything at all, not only a new message. The same effect marks the
conversation read whether or not the tab is visible. **Fix:** depend on `lastSeq` only, follow only
when the reader is already at the bottom, and mark read only when `document.visibilityState` is
`visible`.

### 11. Phase 0's finding 7 is still open
**Low.** `routes/events.ts:91`. `Math.min(-2 || 500, 1000)` is `-2`; probe W3. Clamp to `[1, 1000]`.

### 12. The dev-mode pairing endpoint has no test and no loopback guard
**Low.** `server/src/interfaces/http/routes/dev.ts`; `read-models.ts:114–125`;
`packages/platform/src/config/schema.ts:35`.

`POST /v1/dev/pairing-code` mints a credential for the demo person with no credential of its own.
It exists only in dev mode and the server binds `127.0.0.1` by default, so it is the laptop
convenience it says it is — but `CHIPS_HOST=0.0.0.0` with dev mode on hands a pairing code to
anyone on the network, and nothing in the server suite exercises the route at all; only the
Playwright suite does. **Fix:** refuse to register the dev routes unless the host is loopback (or
log at `warn` that they are exposed); a gateway test that the route is 404 outside dev mode and 201
inside.

### 13. The fold is under-tested, and the property library it lists is unused
**Low.** `packages/core/src/model.ts` (56 percent branches); `packages/core/package.json`.

The fold is the client's domain — everything on every screen comes out of it — and the plan's §4.1
puts property tests for it in `packages/core`. `fast-check` is declared and never imported. The one
invariant the README names, "events out of order fold to the same thing", is checked on a single
reversed list. Untested branches include a run event before its `run.started`, `membership.removed`,
`approval.executed`, `run.failed`, and a `question.ask` without a conversation. **Fix:** the order
property with `fc.shuffledSubarray` over the golden fixtures; one case per fold that has none; and
consider adding `packages/core/src/model.ts` to the 90-percent list in `vitest.config.ts`, since it
is pure and it is the thing mobile will share.

### 14. "Reloading offline" is "reloading with the server unreachable"
**Low, honesty.** `apps/web/e2e/sync.spec.ts:152–154`; the plan, M1.2 acceptance.

The test aborts `/v1/**` and reloads; Vite still serves the app. There is no service worker, so a
reload with the network actually off is a blank page: the cache holds the history and nothing holds
the app. `STATUS.md` words it correctly; the plan says "offline". Either precache the shell (a task,
and one the desktop app in Phase 2 may make moot for desktop but not for the browser) or amend the
acceptance wording at the gate. Say which.

### 15. axe runs on the kitchen sink and not on the shell
**Low.** `apps/web/e2e/approval-loop.spec.ts`; §4.5 "axe passes on every screen"; the Phase 1 exit
criterion is Lighthouse above 90 on the main screens.

`@axe-core/playwright` is already installed. One `AxeBuilder` run on the shell, before and after
the approval, covers the main screen for the cost of ten lines. The Lighthouse pass is owed and
`STATUS.md` says so.

Smaller notes, no action required now: `replayFrom` ignores a `subscribe` frame's
`conversation_ids` and replays the whole membership scope, as it did in Phase 0; the client signs
the `path` string it was given and the browser normalises what it sends, so a query with a space
would fail to verify — sign the URL's `pathname + search`; the Composer's Steer chip has no handler,
and the Agents and Channels tabs render the conversation with `aria-current` set, which is the
placeholder the plan asked for but reads as broken; the Needs-you queue badges a question "Decide
now" where the vocabulary says a question with a default is "Review today" (M1.4's); the `hello`
sent to a person still fails the protocol's own schema (Phase 0 finding 8, deferred); a resolution's
idempotency key is `approvalId-decision`, so Approve then Deny appends two resolutions and last
wins — "first answer wins" is M1.4's; the spent pairing code in the e2e is still logged at `error`
with a stack trace (Phase 0 finding 12, deferred); the store re-folds the entire log on every batch, which
measured at 12 ms for 520 arrivals — not today's problem (finding 2 is the render, not the fold),
but not incremental either (below).

## Architecture, beyond the findings

Where the structure is right, and worth keeping as it grows:

- **The one door held.** Every write over HTTP and the socket goes through `submitEvent`; the
  bootstrap and the test scaffold append directly, as they did in Phase 0, and nothing else does.
  That is why finding 1 is one function and one test file.
- **One predicate, two paths.** `canSee` for the live path and a SQL twin built from the same
  member set for replay, in a module that is nothing but the rule. The Phase 0 review's worry was
  that the two paths would drift; the structure makes drift visible.
- **The ports grew by method, not by query.** `ReadModels` gained `conversationsForMember`,
  `participantsVisibleTo` and `anyPerson`, each one query against one projection; nothing exposes a
  builder. `SocketTickets` is shaped as a port from the first line, so Phase 6's shared store is an
  adapter swap.
- **The client is the plan's shape.** `packages/core` imports the protocol and nothing else; the
  design system takes props and holds no state; the rule that keeps them siblings has a fixture.
  The shell holds two `useState`s. Mobile will be able to share `core` without a browser in it.
- **The snapshots mean something.** One image, one tag, a guardrail tying the tag to the installed
  Playwright, and a local runner that copies the tree rather than touching it.

Where it should change, in order of how soon it will hurt:

- **Authorization wants one home.** Direction is in the use case, visibility in a module with a SQL
  twin, an agent-only check in one route, membership-on-write nowhere, policy next. Finding 1
  proposes a pure `authorize` in `domain`; M1.4 is the last cheap moment to do it.
- **The fold is not incremental.** `store.ts` re-runs `buildModel` over the whole event array on
  every batch, and `buildModel` sorts the array and every conversation's lines each time. At 520
  events that is 12 ms in total, which is why finding 2 is about the render and not the fold; at
  §4.4's 10,000 messages under a burst it becomes the frame budget.
  `FOLDS` is already shaped as `(state, event) => void`; expose an `applyEvent` and keep
  `buildModel` as the fold over it, and the store keeps its `Building` state between batches.
  Measure before doing it, but do it before the number is measured against the budget.
- **The client reads events through string keys.** `required<T>(event, "goal")` mirrors the
  domain's `required()`, which is fine; but `packages/protocol/generated/types.ts` exists and is
  zod-free, and typing `FOLDS` against it would make half of finding 13's untested branches
  impossible to write and the other half obvious.
- **The session knows which events change membership.** `session.ts:297–304` updates its member set
  on `membership.added` and `membership.removed` by name, duplicating what the projector knows. A
  small `applyMembership(viewer, event)` beside `canSee` keeps the interfaces layer out of the
  event catalogue.
- **`packages/core` is held to 80 percent, `server/src/domain` to 90.** The fold is the client's
  domain. When finding 13 is done, ratchet it.

## Deviations accepted

Everything in `STATUS.md`'s Scope changes for M1.1 and M1.2, specifically:

- Light `--ink-3` and the avatar green changed for WCAG AA; `--ink-4` off text and a test that
  keeps it there. Accepted — measured, reasoned, written down.
- Three guardrail rules with fixtures; the stylesheet exemption. Accepted.
- The three Fontsource faces as runtime dependencies. Accepted; the justification (offline, strict
  CSP) is the right one, and the CSP itself is still owed (§6.4; nothing in `index.html` or the
  Vite config sets one — worth doing while the app renders Markdown from agents).
- The visual suite runs only in the container, with `--ignore-scripts`. Accepted.
- `packages/*/src/**/*.tsx` in the coverage report. Accepted, and `apps/web` should follow it
  (finding 5).
- Cards as `<article>`s; three cards showing M1.4's states early. Accepted.
- `SHARED_EVENTS` with `message.post` on it. **Accepted; the right decision** — an explicit list
  rather than a loosened rule, decided in the open as `STATUS.md` asked, with the catalogue-wide
  test still biting.
- Socket tickets rather than a nonce. Accepted; ADR 0006 carries the consequence and the Phase 6
  note.
- `POST /v1/dev/pairing-code`. Accepted with finding 12.
- `content-visibility` as interim virtualization. Accepted as owed, and `STATUS.md` owns it.
- `transport.ts`, `cache.ts` and `device.ts` excluded from the Vitest report. Accepted.
  `store.ts` in that list is not (finding 5).
- Nothing to reverse.

## Conditions before M1.3

1. **Finding 1 fixed, with tests, inside M1.2.** One commit. Probes W1, W2 and W6 re-run and their
   new answers recorded in `STATUS.md` or in a follow-up to this review.
2. **Findings 2, 3 and 4 fixed inside M1.2.** They are M1.2's own deliverables — the client's
   resume, the shell and optimistic sends — and M1.2 is not done while any of them stands, nor
   while its acceptance test passes one run in four.
3. **Finding 5's configuration half** — the include glob, and `store.ts` out of the exclusion — in
   the same commit as finding 4, since that is what makes finding 4 testable. The shell tests as
   M1.2 closes.
4. Findings 6 to 15 at the implementer's discretion inside Phase 1. Findings 6, 8, 9 and 11 are
   ten-minute fixes and should ride along with condition 2.
5. **Condition 3 of the Phase 0 review — a green Node 22 run observed and recorded — is now the
   oldest open item in the repository**, and it is the one thing on this list only Arjun can do.

`STATUS.md`'s header lines are updated by the session that writes this review, since this time the
reviewer and the implementer are the same session; the In-progress section names findings 1 and 2 as
what M1.2 now owes first.

---

## Follow-up: the two High findings, fixed

3 September 2026 · Reviewed commits `d8ca284`, `e73dc7c`, `72e071d` · Verdict: **findings 1 and 2
closed; M1.2's acceptance suite passes 4 of 4, three times, in a quarter of the time**

Fixed by the same session that wrote the review, and confirmed the way the review looked: by
running the probes and the suite again, not by reading the diff.

### Finding 1 — writes are scoped by membership (`d8ca284`)

The rule is where the review asked: a fifth rule in `submitEvent`, after the four cheaper ones,
through the read-model port (`isMember`, one lookup on the memberships key), refused as
`wrong_conversation` and `forbidden` at both edges — so it holds for every transport, and a
forgery is refused on direction before it costs a lookup. `conversation.created` is the
exception, and the projector now writes the creator's `memberships` row beside the
`conversations` row (ADR 0018 amended); the alternative — admitting `membership.added` into an
empty conversation — would have made "who may add" a special case rather than a member's right.
`canSee` shows the creator the opening event and the session adds the conversation to its live
set, which closes finding 7 as well; the client's fold lists the creator as a member the same way.

| Probe | At the review | Now |
|---|---|---|
| W1 Scout posts into Dana's direct conversation | 201; Dana sees it | **403 `forbidden`**; Dana's conversation holds only its opening and her membership |
| W2 Scout runs and asks there; Arjun, not a member, resolves with `scope: "always"` | 201, 201, 201 | **403, 403, 403** |
| W6 Arjun adds himself to Dana's conversation, then reads | accepted; he reads it | **refused, `wrong_conversation`**; he reads nothing of it |
| W4 Scout's `run.status` for a run nobody started | 201 | 201, unchanged by design: run ownership is M1.3's, with the state machine |

Tests: `submit-event.test.ts` with a fake membership port — member and non-member, person and
agent, the exception, a workspace-wide event asks nothing, the cheaper rules refuse first;
`projection.test.ts`; `visibility.test.ts`; `gateway.test.ts` and `session.test.ts`, "writing,
scoped by membership", beside "scoped by membership" — including a person opening a
conversation over the socket and receiving both the opening and their first message back. The
server suite is 356 tests. Docs: the server README's invariant table, the hooks, WebSocket and
HTTP pages, ADR 0018.

### Finding 2 — one flush per frame (`e73dc7c`, `72e071d`)

The store schedules its flush on the next animation frame — with a 100 ms timer racing it, so a
tab the browser is not painting still flushes — instead of a microtask: however many socket
messages arrive before the frame, there is one cache write, one rebuild and one render.
`MessageRow` is memoised on what it shows rather than on the `line` object the fold remakes each
time. The follow-scroll effect runs on a new line, not on every snapshot, and only for a reader
already at the bottom — the first half of finding 10. `store.ts` is tested under Node with a
fake transport and an in-memory cache, through the seams it was written with, and is in the
coverage report: the configuration half of finding 5.

| Measurement | At the review | Now |
|---|---|---|
| A fresh pairing against ~500 messages, to the last message on screen | 26.6 s (21.9 s before the sidebar could be observed at all) | **906 ms, 876 ms, 930 ms** — three runs; the burst test now asserts it within 5 s and logs it |
| The burst test | 28–33 s against a 30 s assertion | **4.3 s, 4.6 s** |
| The reload-offline test | failed 3 of 4 runs at `pair()` | **2.8 s, 2.7 s** |
| `pnpm e2e`, all four | 60 s, 3 of 4 | **15 s, 4 of 4, three times** |

The fold was never the cost and is unchanged. `pnpm check` on the final tree: 53 files, 760 tests;
coverage 94.76 lines / 82.41 branches / 93.69 functions / 92.57 statements — `store.ts` joined
the report at 81 percent lines and 55 percent branches, which is the number the exclusion had
been hiding, and the branches it lacks are the directory fetch and the frame scheduler, both
the browser's. The reload test still pairs against whatever the
burst test left behind; with a sub-second replay under a 20 s ceiling that is a margin of twenty,
not a coupling worth a second data directory.

### Verdict

Findings 1 and 2 are closed. M1.2 still owes findings 3, 4 and 5 — the Edit button, a send while
the socket is down, the shell's tests — before it is done, and the Lows are at the implementer's
discretion. Condition 3 of the Phase 0 review, a green Node 22 run observed and recorded, remains
Arjun's.

## Follow-up 2: M1.2 closed

3 September 2026 · Reviewed commits `788777e`, `0c637c0`, `b14e70b`, `1c7ecc6` · Verdict:
**M1.2 accepted.** Findings 3 to 13 and 15 are fixed; finding 14 is a wording decision, taken
and recorded; the smaller notes stand as notes. Conditions 1 to 4 are met. Condition 5 — a
green Node 22 run observed — is still the one thing only Arjun can do.

Confirmed as before: by running the suite, the probes' successors and the browser, not by
reading the diff.

### The three Medium findings

**Finding 3 — the Edit button approved (`788777e`).** The shell passes `editable={false}` and
wires no `onEdit`; the card's own `Actions` disables the button. A shell test clicks the
disabled button and asserts nothing was sent; the approval-loop e2e asserts it is disabled
beside Approve and Deny enabled. Editing arrives with M1.4's editor.

**Finding 4 — a send while the socket is down (`b14e70b`).** The transport has a failure path
now, and it is the outbox: every send is held until the server answers for its key with an `ack`
or an `error`, and every socket that opens — first or again — sends what is still unanswered
before anything else; a resend the server had applied is acked as a duplicate. `ack` and
`error` reach the store: a refused message stays on screen marked "not sent · reason", and a
decision is busy until it is answered, so Approve cannot be pressed twice and does not silently
do nothing. A send made before the cache has loaded waits for the socket instead of vanishing.
Two things the fix turned up: `socket?.send` on a socket still connecting *throws*, so a send in
the first half-second was worse than dropped; and Chromium's offline emulation does not close
an established socket, and neither does a real drop for up to a minute — so the transport now
closes its socket on the browser's `offline` event and reconnects at once on `online`, and the
header says "Reconnecting…" meanwhile. The e2e pulls the network, types, restores it, and sees
the pending line confirmed with nothing marked failed (4.9 s). Store tests: the early send, the
refused message, the busy decision acked and refused, an error naming no event. The outbox is
pure and has its own tests.

**Finding 5 — the shell and the store untested (`788777e`; the store with `e73dc7c`).**
`apps/web/src/**/*.tsx` is in the coverage include (`main.tsx` and the kitchen sink excluded, as
the entry point and the visual suite's page), and the web project runs jsdom tests with the
setup `packages/ui` established. `Shell.test.tsx` drives the shell against a fake store with
the golden fixtures, one behaviour per test: my line on the right as "You" and Dana's under her
name; Enter sends into the open conversation; read marks only while the tab is visible;
Approve and Deny reach the store for the approval's own run; Edit disabled; a decided card
names the resolver; a busy card; a refused line; the reconnecting pill; the sidebar's counts
and the fleet; the Needs-you queue opening its conversation, and its empty state; the run
panel's timeline. The first run of it found a bug the review had not: the decided card said
"Approved by usr_01K4…" rather than "Approved by Arjun" — fixed in the same commit.

### The Low findings

| Finding | What changed | Commit |
|---|---|---|
| 6 `safeHref` backslash | Resolve against a made-up origin and compare: `/\evil.example/login`, `/\\evil.example`, `http:evil.example` and a bare `foo/bar` are refused beside `//evil.example`; the cases sit next to the old ones | `0c637c0` |
| 7 creator does not receive the opening | Closed with finding 1 | `d8ca284` |
| 8 fleet per run | Grouped by agent, showing the run most recently touched (`lastSeq`); an agent with a finished run and a live one is listed once, on the live one | `0c637c0` |
| 9 every person is "You" | Mine is the line with my participant id; the decided card names the resolver | `788777e` |
| 10 scroll and read on every snapshot | Follow only a reader at the bottom, on a new line (`72e071d`); mark read only while `visibilityState` is visible, catching up on `visibilitychange` | `72e071d`, `788777e` |
| 11 negative `limit` | Clamped to 1..1000; `limit=-2` and `limit=0` return one event with a cursor, `limit=5000` the whole log, `limit=lots` the default page | `0c637c0` |
| 12 dev pairing endpoint | Registered only when the server is bound to loopback, with a `warn` line otherwise; gateway tests for outside dev mode (404), dev mode on loopback (201), dev mode on `0.0.0.0` (404) | `0c637c0` |
| 13 the fold under-tested | The order invariant is a fast-check property over every permutation of the whole scenario (sixteen events, including a question, a removal and a summary); one case each for a run event before its start, a removal, an executed approval, a failed run, a question with no conversation | `0c637c0` |
| 14 "offline" wording | A decision, recorded in `STATUS.md`: the acceptance test is "reloading with the server unreachable"; precaching the shell is not built, and the plan's word is proposed for amendment at Gate 1 rather than edited now, since the plan is edited only at gates | — |
| 15 axe on the shell | `AxeBuilder` at three states of the loop. It found three things the kitchen sink could not: no `main` landmark, no level-one heading, and a timestamp coloured with `--ink-4`, which the design system keeps off text. All three fixed | `1c7ecc6` |

### The numbers

`pnpm check` on `1c7ecc6`: Biome clean, dependency-cruiser 240 modules and no violations, 56
test files, 802 tests; coverage 94.72 lines / 82.92 branches / 93.65 functions / 92.78
statements, with the shell in the report. `CHIPS_E2E_WEB_PORT=5199 pnpm e2e`: 5 of 5 in 19.4 s;
a fresh pairing against 501 messages in 934 ms; axe clean at all three states.

### Standing, and said so

- The smaller notes are unchanged: the client signs the path string it was given rather than
  `pathname + search`; the Agents and Channels tabs still show the conversation; a question with
  a default is badged "Decide now"; a resolution's key is `approvalId-decision`, so last wins
  until M1.4's "first answer wins"; the spent pairing code in the e2e is logged at `error`.
- The Lighthouse pass is the phase's exit criterion and has not been run. Real windowing before
  the 10k-message budget is measured is the gate's.
- Condition 5 of this review and condition 3 of the Phase 0 review are the same item, and it is
  Arjun's.

### Verdict

M1.2 is accepted. M1.3 may start, on the conditions the review set for it: run ownership with the
state machine, and `from` on `run.steer` filled by Chips.
