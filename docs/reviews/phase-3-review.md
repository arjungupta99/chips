# Phase 3 review

Verdict: **Pass with fixes** — the fixes were found during the gate, applied before the tag, and
are confirmed present below; three conditions carry into Phase 4.
Reviewed commit: tag `phase-3-complete`
Reviewer: Fable · 5 September 2026, on the Mac mini the phase was built on

The phase's goal was "routing between harnesses, or between spaces of one, with one object and
two views", and it is true on this machine: Scout routes to Ledger and the same lane is a route
card in one chat and a task card in the other, with the reply once; a room holds two harnesses
and two people and the right person answers; a thumb under what a harness said reaches that
harness and no other; Claude Code's subagents and Jacobian's placements are the same object the
samples play; a decision an hour after the gate gave up is carried into the session. The five
milestones' acceptance tests run, in Vitest, in Chromium against a real server with the real
samples, against the fake Chips, and against Jacobian's own compiler over a scratch copy of its
tree. The packet is accurate where I could check it, and it named its own soft spots — what M3.2
left unbuilt, the log line, the missing property — before I found them.

What holds the verdict at *with fixes* is the gate focus itself. The router appends a lead's
intent to the log without the door (ADR 0029, decision 6), and three fields on a `task` were
taken on the lead's word: `link_to` wrote a lane's news into any room in the workspace, on behalf
of anybody or nobody opened a room in their sidebar, and a lane id another lead had opened was
acknowledged as one's own (findings 1, 2 and 5). Under the second focus item — approval routing
inside lanes — an approval raised by a specialist that somebody else owns resolved to an owner
who could neither see nor answer it, and the person the work was for was refused (finding 3).
And under the first — one object, two views, under concurrency — cancelling a lead's run after
its lane had completed flipped a finished lane to cancelled and told the specialist to stop a
run it had finished (finding 4). Each is fixed at the gate with a test that reproduces it and a
probe re-run that shows it gone. Beside those, two standards gaps the packet had flagged
(finding 6), two questions the blueprint promised more than the phase built — a lead that
approves, a child that speaks — carried into the plan as open decisions 7 and 8, and a handful
of notes.

## What was verified

Everything was run on Node 26, as in every gate so far. **The Node 22 leg has still not been
observed** (condition 1, carried a fourth time).

| Command | Result |
|---|---|
| `pnpm check` at the tagged commit | exit 0 · 138 files, **1,755 passed**, 0 skipped · Biome clean at complexity 12 · dependency-cruiser 502 modules, 1,639 dependencies, no violations · architecture and protocol pages current · every package and the docs site type-check |
| `pnpm test` coverage | 92.71 statements / 83.18 branches / 92.94 functions / 94.69 lines — each above Gate 2's |
| `pnpm docs:check` | 5 of 5 samples, two against an in-process chipsd |
| `pnpm docs:build` | 74 pages, every link validated |
| `CHIPS_E2E_WEB_PORT=5199 pnpm e2e`, before the fixes and again after | **25 passed** both times (Chromium 22 in 1.2 minutes; restart, scale and windowing last) |
| `chips conformance claude-code` · `jacobian`, on the kit as fixed | passed, 17 events in 0.6 s · passed, 21 events in 0.6 s; Lanes lit by `task` in both |
| `chips conformance custom`, a hooks-mode harness written from the Custom guide alone | passed, 9 events in 2.1 s — after one lesson, finding 12 |
| `node adapters/jacobian/scripts/vendor.mjs --check` | Jacobian's own `tsc` over a scratch copy: 0 errors |
| `pnpm bench:append` | 10,002 events: append 1,116 ms, replay 312 ms; budget 2,000 ms |
| `pnpm bench:fold` | ten thousand events in two hundred flushes: **5 ms** |
| The windowing run | 10,000 messages: 15 rows in the DOM, 23 while scrolling, median 16.7 ms, 95th 16.7 ms, **no late frame**; 12.7 s from pairing to the last line |
| The scale run | 1,000 messages from 20 harnesses posted in 963 ms, on screen in 1.8 s, read back by a fresh pairing in 1.9 s |

I read the diff from `phase-2-complete` — forty commits, plus the gate's — in full for the door
and the router (`authorize.ts`, `run-state.ts`, `lane.ts`, `route-lane.ts`, `submit-event.ts`'s
routing, filling and approver resolution, `open-space.ts`), the two migrations and the lane
read models, the client's lane fold and the two cards (`model.ts`, `SpaceView.tsx`), the SDK's
`lane.ts`, the bridge's `deferred.ts` and its subagent path, the plugin's `lanes.ts`, the kit's
`routeTask` and its door restatement, every ADR from 0029 to 0033, `STATUS.md` and the packet;
and by section for the rest. I walked the demo script in the browser against a scratch chipsd
with the real Scout and Ledger: the route card under the question at once, `Working` with
Cancel; `Done · ≈$0.03` with the reply unfolded and Scout's summary under it; the run panel's
`+ ≈$0.03 in lanes`; Ledger's chat with the task card `You → Scout → Ledger`, the question, the
constraint and the reply once; a second ask cancelled from the route card, the card `Failed`,
Scout's run failing with *Ledger's check was cancelled, so I have no comparison to give you.*
Attribution held everywhere I looked: every card names who routed to whom and on whose behalf,
the fleet row says *for Scout*, and in a room with two harnesses every bubble carries its
author. Jacobian's lanes on the Mac mini are not walked: its plugin is the one vendored before
lanes (condition 2).

Then nine probes against the scratch install, written to the gate focus, each run before the
fixes and again after:

| Probe | What it did | Before | After |
|---|---|---|---|
| P1 | A lead sent `task` with `link_to` naming a space it is not in; the specialist completed | `lane.updated`, summary and cost, in that space and **nowhere else** — the lead's own space heard nothing | The news in the lead's own space only; the other space untouched |
| P2 | `on_behalf_of` naming a person who does not exist | **A direct space opened for the ghost**, with a membership row for it, and a lane in it | Kept in the run: "is not a person here"; nothing opened |
| P3 | A second lead sent `task` with the first lead's `task_id` | **Acknowledged with the first lead's lane**: its run id and its home | Kept in the run: "belongs to another lead"; no lane in the ack; the first lane untouched |
| P4 | The specialist completed its lane; the person then cancelled the lead's run | `lane.updated` **completed, then cancelled**; `run.cancel` appended into the finished run | Completed stays completed; nothing into the finished run |
| P5 | Ledger, Dana's, raised an approval inside a lane for Arjun in the home Chips opened between Ledger and Arjun | `approvers: [Dana]`; **Arjun refused** (not an approver); **Dana refused** (not a member) and her device never saw the card; the ask sat until its fallback | `approvers: [Arjun]`; Arjun's yes taken; Dana still outside the room, as she should be |
| P6 | A → B → C → A, then A → B → C → D → E | The loop kept in C's run as a step naming A; depth four kept in D's as a step naming the limit | Unchanged |
| P7 | `task.child` with a label; the lead then posted into the child's lane run | The lane opened; the post refused: "started by another harness" | Unchanged — finding 8 |
| P8 | Two tasks at once to a specialist with no direct space to the person | One home for both; the loser of the append found the winner's space | Unchanged |
| P9 | A self-routed task at home in the lead's own space; then one naming a room the lead is not in | A lane in the room; the other kept in the run with no lane in the ack | Unchanged |

## Engineering standards (Appendix G)

1. Layers inward, cruiser green: **yes.** The router is the one place a lead's words reach the
   log without the door, which is why findings 1, 2 and 5 were possible; it now checks what the
   door would have. The kit restates the door and the router rather than importing them.
2. Input validated at the edge: **yes, now.** Every event through the schema; `task.home`,
   `link_to`, `on_behalf_of` and `task_id` checked against membership, existence and ownership
   before a lane lands anywhere; `space.updated` and `feedback` refused when they say nothing.
3. Idempotency: **yes**; the router keys every append, and a retried `task` is acknowledged with
   the same lane. P8 showed the home's key surviving a race.
4. Workspace scope on every query: **yes**; the new read models are keyed by workspace.
5. One transaction, `rebuild` reproduces: **yes**; the four new event families project through
   the replay's projector, and the replay property covers the new tables.
6. Cursor pagination, indexes: **yes**; two indexes on `lanes` beside their queries.
7. Heavy work off the request path: **no**, unchanged from Phase 1 and accepted for the same
   reason; nothing this phase added is heavy.
8. Coverage met, any down: met; all four up on Gate 2.
9. Property tests: the fold's order-independence over the whole scenario, lanes included; the
   replay's totality; the kit's door rules; and, from this gate, any chain of up to seven hops
   against the lane rules (finding 6).
10. Deterministic tests: injected clock and ids in the server; real sockets and a real clock in
    the kit's and the adapters' integration tests, with ceilings; the samples in the e2e run in
    process groups of their own and none was left running after either suite.
11. Quarantined tests: none.
12. Logs: request, workspace and harness ids on every line, and from this gate the run and the
    lane on the append line (finding 6); no personal data.
13. Metrics: none — Phase 6.
14. Dependencies: none new this phase.
15. Docs: every public surface of the phase has a page; the reference regenerated for
    `space.updated` and the new fields, and again at the gate for the task's rules.
16. Blueprint nouns: **yes**, and JSpace for Jacobian's node (ADR 0033).
17. Sizes: within the complexity limit, which split eleven functions this phase and three more
    at the gate; the client core's fold is one 2,000-line file, which the plan now asks Phase 4
    to split before the phone imports it.
18. Load recorded: the windowing run at a locked 60 fps, the scale run within a tenth of Gate
    2's, the benches within budget; the cold pairing 1.2 s slower than Gate 2 on the same path.

## Findings

### 1. A lane's news could be written into any room in the workspace
**Medium, security. Fixed at the gate.** `server/src/application/use-cases/route-lane.ts`,
`optionalFields`; entered at `b0d629d` (M3.1).

`task.link_to` was taken as given: the router put it on `run.requested` as the lane's linked
space, and every `lane.updated` — the specialist's summary and cost — was appended into it with
`system` as the actor, past the membership rule. Probe P1: a lead named a space it is not in,
the specialist's summary landed there for that space's members to read, and the lead's own
space heard nothing at all, since `link_to` had replaced it rather than joined it. **Fix:** a
lane is linked into the space the task was sent from, always, and into `link_to` only when the
lead is a member of it (`linkedSpaces`); the kit mirrors the rule; the task's description says
it. `route-lane.test.ts`, "links a lane into the space the task came from, and into link_to
only when the lead is in it".

### 2. A task on behalf of anybody, or of nobody
**Medium, security. Fixed at the gate.** `route-lane.ts`, `resolveHome` and `openHome`.

`on_behalf_of` chose whose direct space the lane's home would be, and when there was none Chips
opened one — `opened_for` that person, with a membership row as its owner — without asking
whether the person exists or has anything to do with the lead. Probe P2 opened a room for a
ghost; the same call with a real id opens a room in any person's sidebar, with a stranger's
harness in it and work they never asked for. **Fix:** the person must exist and be either the
lead's own owner or a member of the space the task was sent from — the person whose message the
lead took — and otherwise the task is kept in the run with a note (`checkPerson`). Every real
lead already satisfies it: the bridge and the plugin route on behalf of their owner, Scout on
behalf of the message's author. `route-lane.test.ts`, "keeps a task on behalf of nobody, or of
somebody not in the space, in the lead's run".

### 3. An approval inside a lane that nobody could answer
**Medium. Fixed at the gate.** `server/src/application/use-cases/submit-event.ts`,
`nameApprovers`; ADR 0030, decision 1.

The gate focus asked about approval routing inside lanes, and this is where it broke. A lane's
home is the direct space between the specialist and the person the work is for (ADR 0029). When
the specialist belongs to somebody else — Ledger is Dana's, the work is Arjun's — its approval
resolved, by the default ref `owner`, to Dana: not a member of that room, so not sent the card
(visibility) and refused if she answered (rule 5); while Arjun, who was, was refused as not an
approver (rule 9). Probe P5: two 403s and a card that would sit until its fallback. **Fix:** the
resolved list is kept to the people in the room, because only they can be sent the card and
only their decision is taken; when that leaves nobody, the person the lane is for answers, when
the run is a lane's and they are here; otherwise the list is empty, which already meant anyone
in the room. A room the event cannot name is left as policy named it, so a hooks event with no
space behaves as before. M3.3's case — Dana in the room — is unchanged. ADR 0030 has the
addendum. `submit-event.test.ts`, "keeps who may answer to the room, and inside a lane falls
back to the person it is for".

### 4. A cancel reached a lane that had already finished
**Medium. Fixed at the gate.** `route-lane.ts`, `cascade`; ADR 0029, decision 4.

The first focus item is the one-object-two-views invariant under concurrency, and the cascade
broke it in the ordinary case: a person cancelling a lead's run after its lane had completed.
`lanesLedBy` returned every lane, finished or not; each got a `run.cancel` appended into its
run — which the projector's stay-put rule ignored — and then an unconditional
`lane.updated: cancelled`, which the projector and the client's fold did not ignore. Probe P4:
the lane's history read *completed, cancelled*, the route card said cancelled for work the
person had already read, and the specialist heard a cancel for a run it had finished. **Fix:**
the cascade cancels only a lane still going and walks the chain below it regardless, in case a
lane of its own outlived it. `route-lane.test.ts`, "leaves a lane that already ended alone when
the lead's run is cancelled".

### 5. A task wearing another lead's lane id was acknowledged with that lane
**Low. Fixed at the gate.** `route-lane.ts`; `submit-event.ts`, `laneOpenedBy`.

A `task_id` is the lead's own choice, and the router keyed `run.requested` by it. A second lead
sending a task with a lane id it had seen — in a room shared with the first lead, say — found
the `run.requested` a duplicate and was acknowledged, `duplicate: false`, with the first lane's
run and home (probe P3); its own `task` line then folded into that lane on screen. It could not
post into the run, which is the specialist's; the harm is confusion and the ids. **Fix:** a
lane id already in use by another lead flattens the task, and the ack carries a lane only when
its lead is the sender. `route-lane.test.ts`, "keeps a task wearing another lead's lane id in
the run, and acknowledges no lane for it".

### 6. The append log named no run or lane, and the lane rules had no property
**Low, standards. Fixed at the gate.** `server/src/interfaces/http/routes/events.ts`;
`server/src/domain/lane.test.ts`.

Section 6.5 asks for request, run and lane ids on every line; the "event appended" line carried
the type and the seq, with the request, workspace and harness in context. Now the run and the
lane too. And the plan's testing table lists lane invariants under property tests; the domain
had four hand-written chains. Now any chain of up to seven hops, five hundred at a time: never a
lane past the limit, never a route back into the trail, the person at the head, a loop named
before depth. The packet had flagged both.

### 7. The lead may not approve anything
**Note. Carried as open decision 7.** The blueprint: "policy may let the lead answer low-risk
requests on your behalf with a one-line notice; money, deletions and external actions always
reach a person." M3.2's task list has the notice line; it is not built, and cannot be without a
door change: a harness cannot decide (rule 2), and no approver ref resolves to a harness's
owner-as-lead. As it stands every approval inside a lane reaches a person, which is the safe
half of the promise, and finding 3 makes it a person who can answer. Whether the other half is
wanted, and what ref carries it, is Phase 5's (M5.5, routing to a role) — the packet's first
question, answered: not yet, and not in Phase 4.

### 8. An ephemeral child's lane can be worked by nobody
**Note. Carried as open decision 8.** `route-lane.ts`, `mintChild`; ADR 0029, and probe P7.

`task.child` mints a transient participant and opens a lane on it; the child has no token, and
the lead's is refused at the door as another harness's. The blueprint's "ephemeral children are
first-class" is, today, a fleet row and a task card with nothing behind them. The two ways out
— the lead's connection presenting its children (`hello.agents`, which the SDK does not do) or
a token per child — are a design choice the plan now records; until it is made a `task.child`
opens a lane nobody can work, and the SDK does not offer one. The packet's second question,
answered: decide before M7.1, where sub-agent sessions arrive as lanes; refusing `task.child`
now would break nothing and mislead nobody, and is worth doing if the decision waits past Phase
4.

### 9. The route card stays open, and a specialist may say its answer twice
**Note. Accepted.** The blueprint has the lane collapse after the lead's summary; the card stays
open with the reply under it and the lead's summary below, which is the better reading — the
reply is what the person came for. And the Ledger sample posts its answer as a message and
again as its run's summary, so its own chat shows the sentence twice; the log holds the reply
once, which is the invariant. The packet's third question, answered: keep, and let a sample
that has said its answer summarise in fewer words.

### 10. A person's message keeps its `queued` receipt after the harness has answered
**Low, product. Carried.** The receipt frame (M1.3) has one word for a message the harness has
been sent and no later one, so a room full of answered questions says QUEUED on each. Not
Phase 3's; M5.4's messaging depth is where read state lands.

### 11. The kit restates rules 1 to 6 and not 7 to 10
**Note. Accepted, and re-read at Gate 5.** `packages/conformance/src/workspace.ts`. The Phase 2
review asked for this file to be re-read when lanes added a rule; lanes added none to
`authorize.ts` — routing is the router's — while M3.3 and M3.4 added four, all of them a
person's to trip: a space change, a membership, a decision, a feedback. No adapter sends any of
them, so no adapter can drift on them. One asymmetry to know: the fake's shared-events list
holds `message.post` only, so a harness that sent `space.updated` directly would be refused by
the fake where the server takes it from the opener; both real adapters retitle through the
space door instead. When people arrive (Phase 5) the fake should grow rules 7 to 9.

### 12. A hooks-mode harness that fires before the person speaks fails the kit
**Low, docs. Fixed at the gate.** `apps/docs/src/content/docs/connect/conformance.md`. My first
harness, written from the Custom guide, said hello and started its run at once; the driver had
not yet posted the person's message, took the run as nobody's answer, and reported that the run
never ended. The guide's sample is scripted end to end and does not show the wait. The page now
says: hear the person first — `message.new` on the socket, or read the log in hooks mode.

### 13. The Content-Security-Policy allows inline styles
**Note. Accepted.** `style-src 'unsafe-inline'` for the windowed list's spacers; scripts are the
page's own only, no frames, no other origins. Nonces would need the server to stamp the page;
worth doing when the relay serves it (Phase 4) if the spacers cannot be moved to a class.

### 14. The client core's fold is one file
**Note. In the plan.** `packages/core/src/model.ts`, 1,967 lines, every event family's fold in
one place, and the phone imports it in M4.2. The plan's M4.2 line now asks for the split first,
or a reason.

## Deviations accepted

Every entry under Scope changes in `STATUS.md` for Phase 3, as the packet lists them:
`run.requested` appended and projected (ADR 0029); the home as the specialist's direct space or
one Chips opens; the one-harness lane as a self-routed task with `home` and `label`, and the
ack carrying the lane (ADR 0032); a finished run taking an approval's decision and outcome, and
the card outliving the gate by an hour; who may answer resolved at ingest (ADR 0030), the
directory as the workspace, a harness's own door retitling, a room joined live read from its
beginning; feedback heard by its author (ADR 0031), a summary taking feedback, `/wrong`; Ledger
registering itself; Jacobian's `hand_back` not yet a summary; the merge (ADR 0033) and the
`PreToolUse` answer. The blueprint deviations in the packet's table, each with its reason. And
the three things from M3.2's list the packet owned up to: the mini composer inside a lane
(accepted — the home is a room the person is in, and the lead hears by `lane.updated`), the
fan-out header (accepted until a fan-out exists to count), and the lead-may-approve line
(finding 7). None to reverse.

## Conditions for the next phase

1. **Observe one green CI run on `main`** — the Phase 1 review's condition 3, carried a fourth
   time. The forty-six commits since `phase-2-complete` are the push; if the run is red, fixing
   it comes before M4.1. `gh` is still unauthenticated here and Homebrew's `node@22` on this
   machine still wants a reinstall before the Node 22 leg can be run locally.
2. **Jacobian on this Mac mini**: re-vendor the plugin and restart it, so a live placement and a
   `hand_down` are seen as lanes on the machine they were built for; and the seventh seam, one
   line in Jacobian's gateway, so the Cost row lights there too. Both Arjun's; nothing in that
   checkout is committed without his word.
3. **The deferred approval watched from a real phone**, once, before Gate 4: a decision from the
   lock screen an hour after the gate gave up, carried into a real Claude Code session, with
   what the card said written in the packet (the plan's M4.3 line).

## Follow-up: the fixes, confirmed

Each was made during the gate and is in the tagged commit; I re-ran what proves it, and the
`pnpm check` above and the second browser run are the runs that include them all.

| Finding | Fix | Proved by |
|---|---|---|
| 1, `link_to` | The task's own space always; `link_to` only when the lead is in it | `route-lane.test.ts`, "links a lane into the space the task came from…"; probe P1 after |
| 2, `on_behalf_of` | A person who exists, and is the lead's owner or in the task's space | `route-lane.test.ts`, "keeps a task on behalf of nobody…"; probe P2 after |
| 3, approvers | Kept to the room; the lane's person when nobody named is here | `submit-event.test.ts`, "keeps who may answer to the room…"; probe P5 after |
| 4, the cascade | Only a lane still going is cancelled; the chain below still walked | `route-lane.test.ts`, "leaves a lane that already ended alone…"; probe P4 after |
| 5, a foreign lane id | Flattened; the ack names a lane only for its own lead | `route-lane.test.ts`, "keeps a task wearing another lead's lane id…"; probe P3 after |
| 6, logs and property | Run and lane ids on the append line; any chain against the rules | `lane.test.ts`, "any chain at all"; the log line read |
| 12, the docs | The conformance page says to hear the person first | The custom run: 9 events, passed |
