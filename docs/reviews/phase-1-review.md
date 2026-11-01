# Phase 1 review

Verdict: **Pass with fixes** — the fixes were found during the gate, applied before the tag, and
are confirmed present below; three conditions carry into Phase 2.
Reviewed commit: tag `phase-1-complete` (fbfa31a)
Reviewer: Fable · 4 September 2026

The core loop is in the browser, and it is real. A person pairs with a key the browser never
exports, watches an agent read a purchase order and ask before it emails, decides on any surface,
sends it a file the agent then reads, and adds a second agent that is talking within a minute.
Every screen is a fold of the event log; every write goes through one door with one `authorize`;
what an agent may do is decided by one pure function at the level the dial is set to. The six
milestones' acceptance tests all run, in Vitest and in Chromium, against a real server, a real
key and real sockets, and I could reproduce every number in the packet.

What holds the verdict at *with fixes* rather than *pass* is not the security surface, which the
gate focus asked me to look at first and which held under every probe I wrote, but two things
the focus list also asked about: the client does not window its message list, so a thousand
messages render but the main thread is saturated for seconds after a pairing against a large log
(finding 1); and the SDK's documentation, read cold by someone who had not built it, left
eighteen points open (finding 2). Both were fixed or bounded at the gate. Beside them, a
robustness gap in the policy engine that no code path reaches today (finding 3), and the
blueprint deviations, of which three were fixed at the gate and the rest are accepted with
reasons.

## What was verified

Everything was run locally on Node 26, as in Phase 0. **The Node 22 leg has still not been
observed** from this machine (condition 3 of Phase 0, still open).

| Command | Result |
|---|---|
| `pnpm check` | exit 0 · 72 files, **1,080 passed**, 0 skipped · Biome clean at complexity 12 · 308 modules, no violations · docs site type-checks |
| `pnpm test` coverage | 94.61 lines / 82.84 branches / 92.49 functions / 92.37 statements — identical to the packet |
| `pnpm docs:check` | 4/4 samples, one of them the SDK against an in-process chipsd |
| `CHIPS_E2E_WEB_PORT=5199 pnpm e2e` | **18 passed** (Chromium, 1.3 minutes; the scale run last as its own project) |
| Lighthouse accessibility (snapshot mode, paired, a run waiting) | 100 · 100 · 100 · 100 on the conversation, Needs you, Agents, Audit |
| `pnpm bench:append` | 1,500 ms for 10,002 events against 2,000 |
| The scale run | 20 agents, 1,000 messages: posted in 1.8 s, on screen in 5.2 s, a fresh pairing to the last message in 5.3 s (alone); about 40 s end to end inside the suite |

I read the diff from `phase-0-complete` in full: the protocol's additions, `authorize`,
`policy.ts`, `run-state.ts`, the projector and the writer, the door, the session, the uploads
path, the agents route, the SDK, the fold and the store, the shell and its components, every
test, ADRs 0019–0022, `STATUS.md` and the packet. I walked the demo script through the four
Playwright specs that are the demo script, and by hand once with `pnpm dev`, `pnpm example:scout`
and a PDF.

Then I wrote seven throwaway probes against the gateway and the engine (temporary Vitest files,
run and deleted; the tree is clean):

| Probe | What it did | What happened |
|---|---|---|
| P1 | A grant signed for attachment A, presented on attachment B, same token | **403.** The signature covers the id. |
| P2 | A revoked token presenting a valid grant | **401.** The token is checked before the grant. |
| P3 | Scout posts `message.post` with `upload_ids` of a file Arjun uploaded | **Refused (`invalid`).** Only the uploader attaches an upload. |
| P4 | `evaluate` for an external, irreversible email: agent L3, workspace cap L1 | **ask, at L1.** The cap wins. With the cap `undefined`: **allow, level NaN** — finding 3. |
| P5 | Arjun approves an `email.send` with `scope: always`; Scout asks for `payment.transfer`, then for `email.send` again | Payment **asks**; the email is **approved by policy** ("Arjun said always"). The rule is in the room's policy, not the agent's (deviation, accepted below). |
| P6 | (from the suite) Scout resolves its own approval; Dana approves in a conversation she is not in; a person's signature replayed with a different query; a socket URL reused | All refused, as in the interim review; unchanged. |
| P7 | The three curl lines from Add agent, run against the dev server | The second line **404**'d — the app named `POST /v1/events`, which does not exist. Fixed at the gate (`/v1/agents/:id/events`) and now proved by `custom-connect.spec.ts`. |

Two cold reads were commissioned, by readers who had built none of it: one of the SDK page and
README alone, asked to write the smallest agent and list every point of doubt; one of the shell
against the blueprint's desktop mockup, lines 714–893. Their lists are findings 2 and 4.

## Engineering standards (Appendix G)

1. Layers inward, cruiser green: **yes.** The SDK is a package with the protocol as its only
   dependency; the two client rules added in Phase 1 fire on fixtures.
2. Input validated at the edge: **yes.** The door parses every event; uploads are sniffed; the
   agents and dev routes read their bodies by hand and refuse what is not a string.
3. Idempotency: **yes**, including the SDK's outbox, minted approval ids and the dev seats.
4. Workspace scope on every query: **yes.**
5. One transaction, `rebuild` reproduces: **yes**; the replay test covers the new tables.
6. Cursor pagination, indexes: **yes**; `uploads` and `attachments(conversation_id)` indexed.
7. Heavy work off the request path: **no** — thumbnails and metadata stripping run inside the
   upload PUT. Known issue 7 in the packet; accepted for solo mode at this size, a Phase 4 item
   with video.
8. Coverage met, any down: met; branches down 1.6 points in M1.6, above the floor.
9. Property tests: the run state machine, the policy table, the projector's totality.
10. Deterministic tests: the server suite, yes; the e2e suite uses real time by design, and its
    ceilings are ceilings.
11. Quarantined tests: none.
12. Logs: ids, never the token.
13. Metrics: none — Phase 6.
14. Dependencies: four new, pinned, each with a reason in the packet.
15. Docs: the SDK page, the HTTP reference, the regenerated event reference.
16. Blueprint nouns: yes.
17. Sizes: within the complexity limit; three long files read top to bottom.
18. Load recorded: the scale run and the benchmark, above.

## Findings

### 1. The message list is not windowed, and the fold is rebuilt on every flush
**Medium. Bounded at the gate; a condition for Phase 2.** `apps/web/src/app/ConversationView.tsx`
(every line in the DOM); `packages/core/src/store.ts` (`buildModel(events)` per flush).

A thousand messages from twenty agents render, and a fresh pairing reads them back in five
seconds, which meets the gate's focus. But after that pairing the main thread stays busy for
seconds: during the full suite, with the scale run's log in the workspace, the sync spec's
"typed while offline" test could not see the reconnect pill within fifteen seconds, because the
`offline` handler ran only when the fold and the render let it. Ten thousand messages would not
meet section 4.4's 60 fps.

At the gate the scale run was moved after the rest of the suite, so the numbers the other specs
record are against a small log, and the fault is recorded as the packet's first known issue.
**Fix, before the desktop shell wraps this app (M2.2):** window the list — render the rows in
view and a margin, with measured heights — and make the fold incremental, folding the events a
flush brings onto the previous model rather than every event from zero. Both are `packages/core`
and `ConversationView.tsx` changes with no protocol or server part.

### 2. The SDK page left a cold reader eighteen points short
**Medium. Fixed at the gate.** `apps/docs/src/content/docs/connect/sdk.md`;
`packages/sdk-ts/README.md`.

A reader with the two pages and nothing else could not have run a first agent: no install line,
no way to close the connection, an example that would not compile under `strict` (the env
variables typed `string | undefined`), an attachment snippet with an undeclared `token`, and no
word on what a decision is, whether own posts echo, or how a restart resumes. The page was
rewritten against the whole list: install, `close`, strict-safe examples, the `from` shape, the
echo rule (own posts come back as `message.post`, never `message.new`), `plan` versus `step`, the
`Decision` type, `executed`, `question`, restarts by id with `since`, `runId` and `approvalId`,
and every exported type by name. The README's example is now the same program.

### 3. An unreadable workspace cap opens the policy engine
**Low, security; fixed at the gate.** `server/src/domain/policy.ts:189`.

`Math.min(agent.autonomy, workspace.maxAutonomy)` with an `undefined` cap is `NaN`, and `NaN`
is below no level: probe P4 got `allow` for an external, irreversible email at "level NaN". No
code path reaches it today — the door fills the cap from the workspace projection or the default,
and the type says the field is a number — but the engine is a pure function other callers will
use, and a policy engine fails closed. Now: a cap that is not a finite number is L0, with a test
that says so.

### 4. Blueprint deviations, three fixed and the rest accepted
**Low.** From the fidelity read; the full table is in the packet.

Fixed at the gate: fleet rows had colour as their only signal (section 4.5, and the blueprint's
own rule at line 706) — they now carry the status word or verb phrase; the conversation header
showed the goal where the mockup shows "owned by · L2 ask when it matters" — it now shows both;
the grid reserved an empty 300 px column when no run panel showed. Accepted with reasons: the
approval card after the thread rather than inside the agent's message; the receipt under the
summary, collapsed; the run panel's controls under the meta and the budget as a line; the thinner
Needs-you card; the agent profile without the dial and the month's stats; the checklist rows
named for event types. Missing, to build: the title bar with search and the workspace switcher
(Phase 2, with the desktop shell), Artifacts (Phase 3 with lanes).

### 5. `always` is scoped to the room
**Low; a deviation to confirm.** `server/src/application/use-cases/submit-event.ts`
(`ruleFromAlways`); probe P5.

An approval resolved with `scope: "always"` becomes a rule in the agent's policy *for that
conversation*, not for the agent everywhere: a second email in the same room is approved by
policy; the same email in another room asks. The blueprint says "`always` becomes a policy
rule" and does not say where. Room scope is the safer reading — the dial is per room too — and
the audit line says who said always and when. Accepted, subject to Arjun's word; the question is
recorded in the plan's open decisions.

### 6. `POST /v1/dev/agents` mints tokens to anyone on the machine
**Low; accepted as a dev-mode convenience.** `server/src/interfaces/http/routes/dev.ts`.

Like the pairing-code route beside it, it is registered only in dev mode and only on loopback,
and it exists for the scale run. Anyone with a shell on the machine already has `.chips/demo.json`
with a token in it. Kept, with the same guard.

### 7. Vite's proxy logs `read ECONNRESET` when a proxied socket is closed by a page
**Low, cosmetic.** Seen in the web server's output at the end of `custom-connect.spec.ts`. It is
Vite's dev proxy noting a WebSocket the browser dropped; nothing in `chipsd` logs it and nothing
fails. Phase 2's desktop shell talks to `chipsd` directly.

## Deviations accepted

Every entry under Scope changes in `STATUS.md` for M1.2 to M1.6, as the packet lists them: the
policy projection (ADR 0019), one `authorize` (ADR 0022), runs owned at the door (ADR 0020), cost
at ingest (ADR 0021), `run.plan` and `attachment.fetched` added to the protocol, receipts as
frames, `resolved_elsewhere` as delivery's word, the message id convention, `message.new` at
delivery, `POST /v1/agents` as a route, the SDK's ping round trip, the browser's PDF viewer, and
the room-scoped `always` (finding 5). None to reverse.

## Conditions for the next phase

1. **Window the message list and make the fold incremental before M2.2 wraps the web app in
   Tauri** (finding 1). Measure against the 10k-message, 60 fps budget in section 4.4 and record
   the number in the Phase 2 packet.
2. **Token revocation and rotation** with `chips connect` (M2.1, M2.4): a route and a screen
   that set `revoked_at`, so a Custom agent's token can be withdrawn without editing a row.
3. **Observe one green Node 22 run in CI** and write it on the "Last review" line of
   `STATUS.md`. Open since Phase 0; still nobody with access to the Actions tab has looked.

## Follow-up: the fixes, confirmed

Each was made during the gate and is in the tagged commit; I re-ran what proves it.

| Finding | Fix | Proved by |
|---|---|---|
| P7, the curl line | `curlLines` names `POST /v1/agents/:id/events`; the new-agent card carries the id | `custom-connect.spec.ts` posts the second line with `fetch` and sees the row light; `Shell.test.tsx` asserts the route |
| 2, the SDK page | Rewritten against the cold read's list; the README example is the same program | `pnpm docs:check` (the sample), `astro check` |
| 3, the cap | A non-finite cap is L0 | `policy.test.ts`, "a cap that cannot be read" |
| 4, fleet rows | The status word or verb phrase beside the name | `Sidebar.tsx`, `fleet-word`; Lighthouse and axe unchanged |
| 4, the header line | "owned by · L2 ask when it matters" before the goal | `ConversationView.tsx`, `agentLine` |
| 4, the empty column | The grid drops the third column when no panel shows | `styles.css`, `.shell[data-panel="false"]` |
| Lighthouse 96 on Agents and Audit | Contrast on the card's sub line, the unlit checklist labels and the audit kind | `lighthouse.spec.ts`: 100 on all four screens |
| 1, the un-windowed list | Bounded: the scale run goes last; the fault is the packet's first known issue and condition 1 | `playwright.config.ts`, the `scale` project |
