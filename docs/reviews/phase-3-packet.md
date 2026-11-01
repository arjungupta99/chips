# Phase 3 packet

Written 5 September 2026 · for tag `phase-3-complete` · from `phase-2-complete` (`f0735fc`)

## What shipped

A lead that routes work, and a room that holds more than one harness. A `task` from a lead is a
**lane**: one run on the specialist, at home in the specialist's own space and linked into the
lead's, rendered as a route card in one and a task card in the other, with the reply once
([ADR 0029](../decisions/0029-a-lane-is-appended-in-the-specialists-space.md)). A room can hold
several harnesses and people, mentions address a harness, and an approval is answered only by
whom policy named ([ADR 0030](../decisions/0030-who-may-answer-is-resolved-at-ingest-and-checked-at-the-door.md)).
A thumb or a note under what a harness said is `feedback`, heard by the harness whose message it
is ([ADR 0031](../decisions/0031-feedback-is-an-event-on-a-message-heard-by-its-author.md)). Both
real adapters drive real lanes — Jacobian's placements and hand-downs, Claude Code's subagents —
as a task the lead routes to itself ([ADR 0032](../decisions/0032-a-lane-between-two-spaces-of-one-harness-is-a-task-the-lead-routes-to-itself.md));
the SDK gained `run.task()` and `runs.accept()`; the kit gained a Lanes row; the two conditions
Gate 2 set are met — the deferred approval and the Content-Security-Policy; and two open
decisions were answered by Arjun and built the same day: the bridge stays out of `PreToolUse`,
and two harnesses in one worktree share one space
([ADR 0033](../decisions/0033-two-harnesses-in-one-worktree-share-one-space.md)), with Jacobian's
tree node called a **JSpace** in Chips' prose from here on.

The thing worth saying about how it went: **the plan's five milestones held, all five landed on
one day, and the two shapes of a lane the Phase 2 packet worried about turned out to be one
object after all** — the second shape needed a `home` and a `label` on the task, not a second
model. What the plan did not foresee is written down: `run.requested` is appended, not
transformed, because the specialist cannot read the lead's space (ADR 0029); the one-harness lane
is a self-routed task rather than an ephemeral child (ADR 0032); a finished run still takes an
approval's decision, which the deferred approval needs; and who may answer is a list of people
on the stored event, kept to the room. The SDK had been waiting two seconds on every connect
since M1.2 — a non-integer ping timestamp the frame schema refused — which M3.5 found and fixed.
Forty commits on `main` since the tag, each green locally; the Node 22 CI run is still
unobserved.

### Milestones

- [x] **M3.1 Lane data model and events.** [`server/src/domain/lane.ts`](../../server/src/domain/lane.ts),
  [`route-lane.ts`](../../server/src/application/use-cases/route-lane.ts), migration 0007: a
  `task` becomes a `run.requested` in the specialist's home, seeding the specialist's run and the
  lane row; the pure `decideRoute` flattens a fourth level or a loop into a step on the lead's run;
  cancelling a lead's run cascades; the lane carries its cost and its news reaches the lead as
  `lane.updated`; an ephemeral child is minted as a transient participant. Invariant tests: a
  lane's messages exist once; cancelling cascades; depth four flattens.
- [x] **M3.2 Lane UI.** [`packages/core/src/model.ts`](../../packages/core/src/model.ts),
  [`SpaceView.tsx`](../../apps/web/src/app/SpaceView.tsx): the client folds a `Lane` from
  whichever side it can see, keyed by lane id; the route card in the lead's chat unfolds the
  reply; the task card in the specialist's home shows the trail and the person's words; the fleet
  says *for Scout*; a Needs-you card raised inside a lane carries its trail; the lead's run panel
  totals its lanes. [`lane.spec.ts`](../../apps/web/e2e/lane.spec.ts). Not built from the
  milestone's list: the mini composer inside a lane, the fan-out header, the lead-may-approve
  line (Deviations, below).
- [x] **M3.3 Group spaces.** `space.updated`, `mentions` filled by Chips, `approvers` resolved at
  ingest, rules 7 to 9 of the door, migration 0008; a members panel that adds, removes, renames
  and closes; harness-to-harness lines fold into one row; a room joined live is read from its
  beginning. [`group.spec.ts`](../../apps/web/e2e/group.spec.ts): two browsers, two people, two
  harnesses, one room, and the right person answers.
- [x] **M3.4 Feedback and approval outcomes.** Rule 10 of the door; `from` filled; delivery skips
  a feedback for a harness that did not say the message; two thumbs and *What went wrong?* under
  a harness's bubble; `/wrong <note>`; `chips.on("feedback")`; Scout answers with a correction.
  [`feedback.spec.ts`](../../apps/web/e2e/feedback.spec.ts).
- [x] **M3.5 Adapters and SDK.** `task.to` may be the lead's own id, with `home` and `label`; the
  ack carries the lane; the SDK's `run.task()` hands back a `Lane` and `runs.accept()` takes one
  up; Ledger joins the samples; Claude Code's subagents are lanes, the deferred approval is done
  ([`deferred.ts`](../../adapters/claude-code/src/deferred.ts)) and a note or a thumb goes back
  into the session; Jacobian's placements and hand-downs are lanes and a 👎 is
  `fixFlaggedTurn`; the kit's Lanes row is lit by both adapters; a Content-Security-Policy on the
  served page. [`route.spec.ts`](../../apps/web/e2e/route.spec.ts): both real samples, cancel
  included.

### Exit criteria

| Criterion | Status |
|---|---|
| The extended golden scenario passes with the real sample agent | **Yes.** `route.spec.ts`: Scout routes to Ledger, the reply unfolds in Scout's chat and sits once in Ledger's, the cost rolls up, a second lane is cancelled from the route card and Scout's run fails saying why. Walked by hand on this machine as well (Demo script). |
| Both adapters pass Lanes | **Yes.** `chips conformance claude-code` 17 events, `jacobian` 21 events, Lanes lit by `task` in both; a hooks-mode harness written from the Custom guide alone passes with 9 events. |
| The page chipsd serves carries a Content-Security-Policy | **Yes.** `default-src 'self'`, scripts from the page's origin only, inline styles for the windowed list's spacers and nothing else inline, no frames; checked against the built page in a browser and by `web.test.ts`. |

Gate 2's conditions: 1 (the deferred approval) and 2 (the policy) are done; 3 (a green CI run
observed) and 4 (Jacobian on the Mac mini re-vendored, the seventh seam) are Arjun's and still
open.

## Deviations

Every deviation is in [`STATUS.md`](../STATUS.md) under Scope changes, dated. The ones that
change what a later phase builds on:

- **`run.requested` is appended and projected**, system-only, with `specialist_id`, `link_to` and
  `origin`; `lane.updated` carries `cost_usd` (ADR 0029). A specialist reads only its own spaces,
  so there is no single appended event both sides could see.
- **A lane's home is the specialist's direct space with the person, or one Chips opens**; the
  plan named `home_space_id` without saying where it comes from.
- **A lane between two spaces of one harness is a self-routed task** with `home` and `label`
  (ADR 0032), not an ephemeral child per subagent; routing to oneself is not a loop; the `task`
  ack carries the lane on both transports and on a retry. Ephemeral children stay as ADR 0029
  left them.
- **A finished run still takes an approval's decision and outcome**, and the Claude Code card
  outlives the gate's nine-minute wait by an hour; the deferred approval needs both.
- **Who may answer is resolved at ingest and checked at the door** (ADR 0030); the stored
  `approval.request` carries people, not refs. **A person's directory is the workspace.** **A
  harness's own door retitles.** **A room joined live is read from its beginning.**
- **Feedback is heard only by the harness whose message it is** (ADR 0031) — the first
  per-recipient rule in delivery; a summary takes feedback; `/wrong <note>` gives it.
- **Ledger is a second sample, registering itself** through the dev route and keeping its token
  in `.chips/ledger.json`.
- **Jacobian's `hand_back` is not a lane's summary yet**; a delegation lane says "Handed back."
  until the turn-events seam lands on Jacobian's side.
- **Two harnesses in one worktree share one space** (ADR 0033, open decision 6: merge); a
  worktree key is `shared`, the second harness joins; separate worktrees are the rule against
  conflicts. **The bridge does not register `PreToolUse`** (open decision 5: no).
- **Not built from M3.2's list**, and not recorded under Scope changes until this packet: the
  mini composer inside a lane (typing to the specialist with the lead copied — today a person
  types in the specialist's home, which they are in), the fan-out header ("Routed to 3 agents ·
  1 done" — one route card per lane, stacked, with no count), and the lead-may-approve notice
  line (a harness cannot decide; every approval inside a lane reaches a person).

### From the blueprint

Checked against the "Lead and lanes" section and its mockup. Present and matching: the route
card under the person's message, `S → L Routed to Ledger`, with the state and the cost, unfolding
the reply; the task card in the specialist's chat with the trail `You → Scout → Ledger`, the
goal and the person's words as a quote; one message row for the reply; the cost in the lead's
run panel as its own line (`+ ≈$0.03 in lanes`); the trail on a Needs-you card; *for Scout* on
the fleet row; cancelling the lead's run cascades, cancelling one lane tells the lead, which
adapts; the wire in the blueprint's own four events. What differs, and why:

| Element | As built | Reason |
|---|---|---|
| "The lane collapses" after the lead's summary | The route card stays open with the reply under it; the lead's summary is its own bubble below | The reply is what the person came for; folding it away under a card seemed worse than leaving it. A choice, not a limitation — see question 3 |
| Reply inside the lane from either chat, lead copied | A person replies in the specialist's home, where the lane lives; no mini composer on the route card | The home is a room the person is in; the lead is told by `lane.updated`, not by a copy of the words |
| "Routed to 3 agents · 1 done" | One route card per lane, stacked | No fan-out sample yet; the header is a count over cards that already exist |
| An approval inside a lane "shown in both chats" | The card in the lane's home and in Needs you with the trail; the route card says *Waiting* | The card is an event in the home space; the lead's chat shows the lane's state |
| The lead answers low-risk requests with a one-line notice | Not built; every approval reaches a person | A harness cannot decide at the door (rule 2, ADR 0030); open decision 7 |
| Reactions on the lane's reply "resolve once" | Reactions and notes on the reply in the specialist's home; none on the route card's copy | The route card shows the summary, not the message; feedback is on a message |
| Cancelling the lead's run "after a confirmation" | Stop in the run panel; no confirmation dialogue | The app has no confirmation dialogues yet; the cascade is visible on every route card |
| Ephemeral children inherit owner, autonomy and budget | Minted as a transient participant with the lead's owner; the lane opens; nothing can post into it | The child has no token and the lead's is refused as another harness's — known issue 1 |

## Tests

| Command | Result |
|---|---|
| `pnpm check` (Biome at complexity 12, dependency-cruiser, architecture and protocol staleness, typecheck on every package and the docs site, tests with coverage) | exit 0 · 138 files, **1,749 passed**, 0 skipped |
| `pnpm test` coverage | 92.70 statements / 83.19 branches / 92.91 functions / 94.70 lines |
| `pnpm docs:check` | 5 of 5 samples: the SDK and the Custom guide's curl loop, each against an in-process chipsd |
| `pnpm docs:build` | 74 pages, every link validated |
| `CHIPS_E2E_WEB_PORT=5199 pnpm e2e` | **25 passed** (Chromium 22 in 1.2 minutes; scale, windowing and restart last as their own project) |
| `chips conformance claude-code` | passed · 17 events in 0.5 s · Lanes lit · one note (usage carried no cost) |
| `chips conformance jacobian` | passed · 21 events in 0.6 s · Lanes lit · one warning (a yes with no `approval.executed`: the tool-result seam) |
| `chips conformance custom`, a hooks-mode harness written from the Custom guide alone | passed · 9 events in 2.1 s |
| `node adapters/jacobian/scripts/vendor.mjs --check` | Jacobian's own `tsc` over a scratch copy: 0 errors in all, 0 in the plugin |
| `pnpm bench:append` | 10,002 events: append 1,116 ms, replay 312 ms; budget 2,000 ms |
| `pnpm bench:fold` | ten thousand events in two hundred flushes: **5 ms** |

The Playwright suite, in the order it runs: the approval loop; attachments; Custom connect timed
from token to first message; decisions; feedback with the real Scout; the golden scenario with
pause, steer and stop; the group room with two browsers; the lane with a scripted specialist;
Lighthouse on four screens; the extended golden scenario with the real Scout and Ledger; sync
under a burst and offline; token revocation; then the restart, the scale run and the windowing
run. Nothing is skipped. No test is quarantined. Four specs are new this phase.

Acceptance lines that rest on inspection or on Arjun rather than on a run here: "a Jacobian
placement and a delegation both render as lanes" (M3.5) — rendered by the kit's Jacobian
subject and by the plugin's tests against a stub engine, not yet on the Mac mini, whose Jacobian
runs the plugin as vendored on 5 September before lanes (condition 4).

### Coverage

| Scope | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| Overall (floor 80) | 92.70 | 83.19 | 92.91 | 94.70 |
| `packages/protocol/src`, `server/src/domain` (floor 90) | above 90 on all four; enforced by the Vitest thresholds | | | |

Every number is above the Phase 2 gate's (94.27 lines, 82.77 branches, 92.37 functions, 92.39
statements) across a phase that added 13,500 lines. Nothing was excluded that was not excluded
before.

## Engineering standards

**Coverage against thresholds.** Above, all met; thresholds unchanged, none lowered.

**`dependency-cruiser`.** 502 modules, 1,638 dependencies, no violations. The SDK's lane module is
generic over its run so the two do not import each other; the router imports the domain and the
ports and nothing else.

**Lint and typecheck.** Biome clean with the complexity limit at twelve, which split several
functions this phase; `tsc` strict with `exactOptionalPropertyTypes` across every package,
`astro check` on the docs site, clippy at `-D warnings` on the shell in CI.

**Load numbers.** The windowing run
([`windowing.spec.ts`](../../apps/web/e2e/windowing.spec.ts), written to
`apps/web/reports/windowing.json`): with 10,000 messages in the room, **15 rows in the DOM**, 23
while scrolling, 119 frames at a median of 16.7 ms and a 95th of 16.7 ms, **no late frame**. The
scale run: 1,000 messages from 20 harnesses posted in **963 ms**, on screen in **1.8 s**, read
back by a fresh pairing in **1.9 s** (832 ms, 1.6 s and 1.9 s at Gate 2). A cold pairing against
a 10,000-message log takes **12.7 s** to the last line (11.5 s at Gate 2): the delivery path,
unchanged and still the next thing to measure properly, and it matters more once a phone is the
client. The fold: 5 ms for ten thousand events. Lighthouse accessibility above 90 on the four
main screens.

**New dependencies.** None. Migrations 0007 (`lanes` columns, two indexes: by lead run for the
cascade, by run for the lane's news) and 0008 (`spaces.state`, `closed_at`, `opened_by`,
`title_by`, with a backfill of `opened_by` from the log).

**Waivers requested.** None.

### Appendix G

1. Layers inward only, dependency-cruiser green: yes. The router appends its own events straight
   to the store, as the sweep and the policy engine do (ADR 0022's consequence), which is the one
   place a lead's words reach the log without the door — the Phase 3 review probes exactly that.
2. External input validated at the edge: every event through the protocol's schema at the door
   and in the fake; `task.home` checked for membership before a lane lands there; `space.updated`
   refused without a title or a state; feedback refused without its emoji or its note; the
   members panel's ids checked to exist (rule 8). What the router took on the lead's word —
   `link_to`, `on_behalf_of`, a `task_id` — is the review's to judge.
3. Idempotency keys on every command, handlers safe to run twice: yes; the router keys
   `run.requested` by lane, a home by specialist and person, a cascade by lane, each `lane.updated`
   by lane, event and space; a `task` retried is acknowledged with the same lane.
4. Workspace scope on every query: yes; the lane, membership and message read models are keyed by
   workspace; `GET /v1/events?space_id=` still checks membership.
5. One transaction, `rebuild` reproduces: yes; `run.requested`, `lane.updated`, `space.updated`
   and `feedback` project through the same projector the replay uses; the replay property test
   covers the new tables.
6. Cursor pagination with an index per query: `GET /v1/events` unchanged; two indexes on `lanes`;
   `directSpaceBetween` joins memberships on the existing space index; `membersOf` reads one
   space's rows.
7. Heavy operations off the request path: as in Phase 2 — unchanged, and nothing new is heavy;
   the cascade is a handful of appends per lane.
8. Coverage thresholds met, and did any go down: met; all four up on the Phase 2 gate.
9. Property tests: the replay's totality; the fold's order-independence over the whole scenario,
   lanes included; the door rules in the kit; the lane chain has unit tests for the first lane, a
   nested one, the fourth and a loop, and no property of its own yet.
10. Deterministic tests: injected clock and ids in the server; the kit's tests and the two
    adapters' integration tests use real sockets and a real clock by design, with ceilings; the
    samples run in the e2e in their own process groups.
11. Quarantined tests older than 48 hours: none.
12. Logs carry ids and no personal data: request, workspace and harness ids on every line; the
    "event appended" line carries the type and the seq but **not the run or the lane** (6.5 asks
    for both) — a small gap for the review.
13. Metrics for what a runbook would need: none yet — Phase 6's.
14. Dependencies pinned, justified, maintained: no new ones.
15. Public APIs documented, reference regenerated: `space.updated` and the fields on `task`,
    `run.requested`, `lane.updated`, `approval.request`, `message.post` and `feedback` in the
    reference; the lane, space, approval, policy and message concept pages; the SDK, Claude Code,
    Jacobian and conformance pages; the HTTP reference.
16. Blueprint nouns and language: yes; and one new word, JSpace, for Jacobian's node (ADR 0033).
17. File and function sizes: the complexity limit enforces the function half;
    [`model.ts`](../../packages/core/src/model.ts) in the client core is now 1,967 lines, the
    fold for every event family in one file, which Phase 4 shares with the phone — a candidate to
    split by family before M4.2; `SpaceView.tsx` (1,067), `workspace.ts` in the kit (961),
    `fake-chips.ts` (930), `submit-event.ts` (803), `translate.ts` in the bridge (791) and
    `bot.ts` in the plugin (719) are long files that read top to bottom, each one thing.
18. Load within budget, numbers recorded: above; the windowing run at a locked 60 fps, the scale
    run within a tenth of Gate 2's, the benches within budget.

## Demo script

On the Mac mini, against a scratch chipsd in dev mode with the two samples started by hand
(`pnpm example:ledger` beside `pnpm example:scout`), in the browser:

1. Pair the browser with the code `chips serve` or the dev bootstrap prints.
2. In Scout's space, ask *Are the Northwind quotes in line with last quarter?* The route card
   appears under the question at once — `S → L Routed to Ledger · Working`, with Cancel — while
   Ledger thinks.
3. Ledger answers: the card reads `Done · ≈$0.03` and unfolds the reply; Scout posts *Ledger
   checked: …* as its own summary; the run panel shows the run's cost and `+ ≈$0.03 in lanes`.
4. Open Ledger's chat: the task card with the trail `You → Scout → Ledger`, the question and the
   constraint, then Ledger's reply once as a message, and its summary.
5. Ask again, and while the card says Working, open Harnesses: Ledger's row says it is working
   for Scout. Back in Scout's space, press Cancel on the route card: the card reads Failed, and
   Scout's run fails with *Ledger's check was cancelled, so I have no comparison to give you.*

Steps 1 to 5 were walked here on 5 September, in the browser, against the scratch server; the
same steps run unattended in `route.spec.ts` against the real samples. Jacobian's lanes on the
Mac mini and a Claude Code subagent from a live terminal are covered by the kit and the two
integration tests; the live runs are Arjun's (condition 4, and a session with a subagent).

## Known issues

1. **An ephemeral child's lane can be worked by nobody.** `task.child` mints a transient
   participant and opens the lane, but the child has no token and the lead's is refused at the
   door as another harness's (`wrong_run`), so nothing can post into the lane. The blueprint's
   "ephemeral children are first-class" is a row in the fleet and a card with nothing behind it.
2. **The lead may not approve anything.** The blueprint lets policy hand low-risk approvals inside
   a lane to the lead with a one-line notice; a harness cannot decide at the door, and no policy
   ref names a lead. Safe as it stands — every approval reaches a person — but M3.2's line is
   unmet.
3. **A route card does not collapse** after the lead's summary; the reply stays open under it.
4. **A specialist that says its answer and then summarises it shows the sentence twice** in its
   own chat — a message and a summary card — as the Ledger sample does.
5. **A person's message keeps its `queued` receipt** after the harness has acted on it: the
   receipt frame has no later word (M1.3), and a room full of answered questions says QUEUED on
   each.
6. **Jacobian's `hand_back` is not a lane's summary**, and a child's own tool calls are not in
   Chips: the turn-events seam (Phase 2 packet). A Telegram-started turn is still invisible.
7. **A Claude Code subagent's own cost is not on its lane**: its transcript is a file the hooks
   do not name.
8. **A lane's autonomy is not clamped to the lead's**; a brand-new lane is L1, as a new harness is.
   **Attachments are not forwarded through `run.requested`** until they can be signed for the
   specialist's token.
9. **The participant directory is fetched once**, and again when the fold sees an id it does not
   know; a person added after the app connected is not in the Add list until then.
10. **`packages/core/src/model.ts` is nearly two thousand lines**, and the phone will import it.
11. **The kit restates rules 1 to 6 and the run rule**, not rules 7 to 10 (space changes,
    participants, approvers, feedback); none is an adapter's to send today. Its shared-events
    list lacks `space.updated`, so an adapter that sent one directly would be refused by the fake
    where the server takes it from the opener.
12. **The Content-Security-Policy allows inline styles** (`style-src 'unsafe-inline'`), for the
    windowed list's spacers.
13. **The Jacobian on this Mac mini runs the plugin as vendored on 5 September, before lanes**;
    condition 4.
14. **The Node 22 CI leg has still not been observed**; everything here runs on Node 26, and
    Homebrew's `node@22` on this machine is unlinked.
15. **A cold pairing against a 10,000-message log takes 12.7 s**; the delivery path.

## Questions for the reviewer

1. Should a lead ever answer a specialist's approval — a policy ref such as `lead` that resolves
   to the lead's owner with a notice on the card — or is "every approval reaches a person" the
   rule for good?
2. Ephemeral children: does the lead's connection speak for its child (`hello.agents`, one
   connection presenting several harnesses), or does a child get a token of its own? Until one
   is chosen, should `task.child` be refused rather than opening a lane nobody can work?
3. The route card stays open with the reply after the lead's summary rather than collapsing.
   Keep?
4. Open decision 2 (`always` scope) was pointed at M3.2 and lanes did not touch it: a rule from
   `always` stays the space's. Re-point it at M5.5, where routing to a role arrives?

## Risks for the next phase

- **The phone meets lanes, approvers and feedback at once**: a Needs-you card on the phone must
  carry the trail and show only what its person may answer; a push must reach only somebody who
  may answer, or it is a notification for a card with no buttons.
- **The deferred approval from a phone is the whole point of Phase 4**, and the card now lives an
  hour past the gate: a decision from the lock screen an hour later starts a turn in a terminal
  somebody may have walked away from. The words carried say so, but nobody has watched it happen
  from a phone.
- **12.7 s to the last line of a 10,000-message log** is a laptop on Wi-Fi; a phone on cellular
  through the relay will be slower, and the replay is one socket frame per event.
- **`packages/core` is the phone's too**, and its fold is one file.
- **Jacobian's live plugin is still the pre-lanes one**; nothing here has been seen on the Mac
  mini with a real placement.

## The Jacobian-side seams

Unchanged from the [Phase 2 packet](phase-2-packet.md#the-jacobian-side-seams): seven changes on
Jacobian's side, none done, each with what it unlocks. Two things there were Chips' side and
landed in M3.5 from what the channel can already see: a placement (the receipt reply) and a
`hand_down` (the bubble's tool call) open lanes with no seam; what the channel cannot see — a
child's `hand_back`, the journey's `trace_id`, a child's tool calls — waits on the turn-events
seam. `vendor --check` passes against Arjun's checkout with his own uncommitted files left alone;
nothing was committed there.
