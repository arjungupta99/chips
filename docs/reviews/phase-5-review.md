# Phase 5 review

Verdict: **Pass with fixes** — the fixes were found during the gate, applied before the tag, and
are confirmed present below; the conditions for the next phase are at the end.
Reviewed commit: tag `phase-5-complete`
Reviewer: Fable · 6 September 2026, on the Mac mini the phase was built on

The phase's goal was "more than one person in a workspace, safely", and on this machine it is
true: a person joins by a link with a role on it and comes back by a passkey Chips verifies
itself; the door reads their standing on every event and every route answers every kind of
caller as a matrix says it should; a thread is a space with a parent, a message is changed by
events the log keeps, and fifty thousand messages are searched in under 200 ms; an ask is
handed to a teammate or a role by an event resolved like the request; a person's notification
settings are theirs alone and a banner's key goes to one device. The six milestones' acceptance
tests run, in Vitest against real databases and real credentials, in Chromium against a real
server with a virtual authenticator, and in the conformance kit. The packet is accurate where
I could check it, and it named its own soft spots — the dev server behind, the shell's banners
unrun, the coverage dip — before I found them.

What holds the verdict at *with fixes* is the gate focus itself, twice over. Under the
authorization matrix and approval routing: a specialist could name `lead` — or the lead's id —
on its own request, and the lead, another harness, would approve a $5,000 external payment
with no person in it (finding 1); an ask that named nobody was anyone's, a guest's included, and
a harness could bring that about by naming a ghost (finding 2); an admin could withdraw the
owner's every device and lock the workspace's owner out (finding 3). Under notification
deduplication: a device that reloaded was granted its keys again and raised the same banners
again (finding 5). And under the engineering standards: the append-and-replay benchmark, which
CI runs and the packet did not, was over its two-second budget by a factor of five, because
the search index was kept inside every append by a trigger that scanned the index to find its
row (finding 4). Each is fixed at the gate with a test that reproduces it and a probe re-run
that shows it gone; the benchmark's fix moved the index off the append path, which is what
Appendix G's seventh question has been asking for since Phase 1. Passkeys, the third focus
item, held up under everything I threw at them.

## What was verified

Everything was run on Node 26, as in every gate so far. **The Node 22 leg has still not been
observed** (condition 1, carried a fifth time) — and between M5.4 and this gate the benchmark
step would have failed it.

| Command | Result |
|---|---|
| `pnpm check` at the phase's tip, `4bcf94b` | exit 0 · 156 files, **2,244 passed** · coverage 93.43 / 84.24 / 93.84 / 95.37 (statements / branches / functions / lines; the packet's 93.44 / 84.27 on the same commit — a branch that depends on timing somewhere, worth knowing when a threshold is set a hundredth above a run) |
| `pnpm check` at the tagged commit, with the fixes | exit 0 · 156 files, **2,254 passed**, 0 skipped · Biome clean at complexity 12 · dependency-cruiser 557 modules, 1,870 dependencies modules, no violations · architecture and protocol pages current · every package and the docs site type-check |
| `pnpm test` coverage at the tagged commit | **93.48 statements / 84.29 branches / 93.89 functions / 95.42 lines** — each above the packet's 93.44 / 84.27 / 93.84 / 95.37 and Gate 3's floor; thresholds unchanged |
| `CHIPS_E2E_WEB_PORT=5199 pnpm e2e` at the tip, and three full runs after the fixes | **28 passed** at the tip. After the fixes the first full run had the scale spec fail on its first assertion — the newest of a thousand messages not on screen, the windowed list not following the end, which STATUS has carried as a follow-up since before the phase — it passed alone in 6.8 s (a thousand messages from twenty harnesses posted in 1.9 s, on screen in 3.3 s, a fresh pairing to the last line in 2.1 s), and the next two full runs were **28 of 28**, the last at the tagged commit (Chromium 25 in 1.4 minutes; restart, scale and windowing last) |
| `pnpm docs:check` | 5 of 5 samples, two against an in-process chipsd |
| `pnpm docs:build` | 83 pages, every link validated |
| `chips conformance claude-code` · `jacobian` | passed, 17 events in 0.5 s · passed, 21 events in 0.6 s — before the kit's rule 9 grew its guest clause, and again after: passed, 17 events in 0.6 s · passed, 21 events in 0.6 s |
| `node adapters/jacobian/scripts/vendor.mjs --check` | Jacobian's own `tsc` over a scratch copy: 0 errors |
| `pnpm bench:append` at the phase's tip | 10,002 events: append 1,729 ms, **replay 8,969 ms**, total 10,699 ms; budget 2,000 ms — **over by 8,699 ms** (finding 4) |
| `pnpm bench:append` at the tagged commit | three runs, interleaved with Gate 3's: append 1,422–1,655 ms, replay 286–308 ms, **total 1,708–1,963 ms** — under budget, with the replay back at Gate 3's cost and the append 0.2 s over it for the queue row; the machine's load average was ten throughout, from work that is not Chips' |
| `pnpm bench:append` on `phase-3-complete`, this machine, the same hour | append 1,203–1,350 ms, replay 248–270 ms, total 1,451–1,620 ms |
| `pnpm bench:fold` | ten thousand events in two hundred flushes: 5 ms |

I read the diff from `phase-3-complete` — twenty-nine commits, plus the gate's — in full for
the door and the roles (`authorize.ts`, `roles.ts`, `policy.ts`), the submit path's approver
resolution and routing (`submit-event.ts`), the passkey verifier and its use case
(`webauthn.ts`, `passkeys.ts`, the routes), invites, devices, the authenticator, the limiter,
the notification registry and routes, the sweep, the planner and the web hook
(`notifications.ts`, `useNotifications.ts`), the read models' membership, thread and search
queries, the event store's scoped read, the socket session's membership refresh, visibility,
the two migrations, the authorization matrix, the four ADRs, `STATUS.md` and the packet; and by
section for the rest. I walked the demo script in the browser against a scratch chipsd on port
4437 with the real Scout, in two browsers at two origins — `127.0.0.1` for the owner, `localhost`
for the guest — and it held: a fresh pairing by a dev code; You said *Owner · runs the workspace*
and made a single-use member link; the second browser opened it, was told *Join Demo … as a
member*, named itself Priya Nair and joined with no code, its You saying *Member · opens spaces,
adds people and harnesses to them, and works*; the owner added her to PO-4471 from the room's
Members panel and her sidebar listed the room the same second; a message in the room started
Scout's run and its `email.send` ask, with Approve, Deny, Edit and *Hand to…* on the owner's card
and *Waiting on You* on hers; the message edited, and the edit on her screen at once with its
Edited tag; a thread she opened from the room, her reply in it, *1 reply* under the root on both
screens; the message pinned, in the strip at the top of the room; Search from her tab for
*Northwind* found her thread reply, a receipt and the edited message with the match marked, and
the hit opened the room at the line, highlighted; *Hand to…* Priya with a reason — the owner's
buttons went, the card said *Handed to Priya Nair by You · Priya knows the Northwind account*
and *Waiting on Priya Nair*, and hers gained Approve; she approved; the owner's card said
*Approved by Priya Nair on another device · logged · sent*, and the run finished, four steps,
≈$1.47; in You → Notifications, Review today set to never and quiet hours 22:00 to 07:00 saved
on change and were read back from the server after a reload. Not walked, and said plainly: a
passkey (the in-app browser offers no authenticator; `people.spec.ts` does it with a virtual
one), a banner (the in-app browser refuses notifications, and no claim was made — which is
right), the queue's *Approve selected* (one Scout raises one ask at a time; `Shell.test.tsx`
covers it), and the packet's fifth step, withdrawing Priya's device from the owner's You, which
has no such control (finding 13).

Then twelve probes against a scratch workspace — the same gateway the tests use, the door
asked through `submitEvent` and the routes through `app.fetch` — written to the gate focus,
each run before the fixes and again after:

| Probe | What it did | Before | After |
|---|---|---|---|
| P1 | Scout named itself, then a ghost, as who may answer; a guest in the room answered | `approvers: []` — anyone; **the guest's yes was taken**, on a $600 payment | Resolved to the owner, who is in the room; the guest refused (`not_an_approver`) |
| P2 | A rule `payment.* → ask role:finance`, no such role, Scout's owner outside the room | `[]`; a member answered | Unchanged: nobody named, the owner absent — anyone in the room but a guest (open decision 10) |
| P3 | Arjun handed an ask to a ghost, to an admin outside the room, to `lead` outside any lane | **All three accepted**, the first two as `[]` — anyone — and the third as the owner; the guest then answered | All three refused as `invalid`: "`to` names nobody who can answer here" |
| P4 | Ledger, a specialist, named `lead` and then Scout's id on a $5,000 external payment and on an external email; Scout answered | `approvers: [Scout]` — **the lead's yes was taken, three times** | Resolved to the owner; Scout refused. A person's rule naming `lead` on a plain write: still the lead's, and only then |
| P5 | Dana (member) and Priya (admin) withdrew the owner's only device | Dana 403; **Priya 200, and the owner's next request 401** | Priya 403, "An admin does not withdraw an owner's device"; the owner still here |
| P6 | A single-use link redeemed with a blank name, then with a name | 422, then **401: the link was spent** | 422, then 201 |
| P7 | Dana, in two rooms, made a guest | **Accepted**; a guest of two rooms | Refused: "in one space at most, and they are in 2: remove them from the others first" |
| P8 | An admin outside a room searched it by `space_id`; a member and Scout searched; a message was taken back | 0 hits, 1, 1; 0 after the taking back | Unchanged |
| P9 | Dana opened a thread, was removed from the parent, read her log and posted into the thread | 0 thread events after removal; the post refused (`wrong_space`) | Unchanged |
| P10 | A passkey registered; Arjun answering Dana's challenge; a sign-in; the same challenge again; an assertion from `https://evil.example`; a counter that went back; two hundred unanswered challenges | 201; 422; 201 as Arjun; 401; 401; 401; all answered, heap flat | Unchanged |
| P11 | Settings saved and read across people and a harness; a key claimed twice by one device, by a second device, by another person | Dana `null`, Scout 403; **the same device granted twice**; the second device not; Dana granted | The same device granted once, then `[]` |
| P12 | Scout handed its own ask on; an admin made an owner invite | `wrong_direction`; 403 | Unchanged |

## Engineering standards (Appendix G)

1. Layers inward, cruiser green: **yes.** The search index's port sits in the application
   layer and its drain in the store; the read model drains before it reads.
2. Input validated at the edge: **yes.** Every route of the phase parses its body and query;
   settings are validated against the protocol's schema; `approval.routed` and the message
   events go through the door. Since the gate, a routing that names nobody is refused there
   rather than accepted and widened (finding 2).
3. Idempotency: **yes**; every write keys, and a claim is one insert whose primary key is the
   whole of the dedup — now granted once (finding 5).
4. Workspace scope on every query: **yes**; the new tables carry it, and search is scoped by
   the caller's spaces intersected with `space_id` (P8).
5. One transaction, `rebuild` reproduces: **yes**; the index is not a projection but follows
   the projections by a queue, and a rebuild leaves it equal to the table (the new test).
6. Cursor pagination, indexes: **yes**; search pages by a keyset cursor; every new table names
   its index in the migration; the two maps are unique on the base row's key.
7. Heavy work off the request path: **yes, from this gate**: the search index is written in
   batches by a drain before a search and on the sweep, not inside the append (finding 4). The
   standing exception since Phase 1 — projections in the append transaction — stands.
8. Coverage met, any down: met; against Gate 3's floor all four up; against M5.5's high point
   functions 0.14 and lines 0.03 down at M5.6, as the packet said plainly, and all four up again at the tag, with the gate's tests at
   the tag.
9. Property tests: the replay's totality holds over the new tables; the lane rules' chains
   from Gate 3; the fold's order-independence. Nothing new this phase needed one that it lacks.
10. Deterministic tests: injected clock and ids; a virtual authenticator for WebAuthn in
    Chromium and a fake one in Vitest; the claim race in one process against a real database.
11. Quarantined tests: none.
12. Logs: request, workspace, harness, run and lane ids; a refused unauthenticated call still
    logs at `error` (known issue 7, carried).
13. Metrics: none — Phase 6.
14. Dependencies: none new this phase; the WebAuthn verifier is Chips' own, 400 lines a
    reviewer can read in one sitting, which I did.
15. Docs: every public surface has a page; the reference regenerated for `approval.request`'s
    changed wording at the gate.
16. Blueprint nouns: **yes**; roles, invites, passkeys, threads, pins, tiers, quiet hours, digest.
17. Sizes: within the complexity limit, which split three more functions at the gate; the fold
    is 2,350 lines, and the plan's M4.2 line stands.
18. Load recorded: **no, then yes.** The packet ran the search ceiling and said the windowing
    and scale runs were unchanged, and did not run `bench:append`, which CI runs and fails the
    build on. Finding 4; the numbers are in the table above and in ADR 0035's addendum.

## Findings

### 1. A specialist could hand its own ask to the lead, and a lead could approve what must reach a person
**High, security. Fixed at the gate.** `server/src/application/use-cases/submit-event.ts`,
`judge` and `nameApprovers`; ADR 0036, decision 3; entered at `7abdd05` (M5.5).

Decision 3 let "a rule, or the specialist's own request" name `lead`, and rule 9 admitted a
harness so named. So the refs a harness sends on its own `approval.request` — trusted since
M3.3 for naming people — could name another harness, and two harnesses could agree between
themselves. Probe P4: Ledger asked to send a $5,000 external payment with `approvers: ["lead"]`,
and Scout, the lead, approved it; then with Scout's id in place of `lead`; then an external
email. Nothing in the door distinguished a rule a person wrote from a ref a harness chose, and
nothing looked at what the ask was for, though the blueprint's sentence is "money, deletions and
external actions always reach a person". **Fix:** the refs a harness names for its own ask are
people — `owner`, `any`, a role, an id — and `lead` or a harness id among them is dropped
(`peopleOnly`); a harness is dropped from the names of any ask that matters — `matters()` in
`policy.ts`: money, irreversible, external, a hot risk class — whoever named it (`peopleFor`),
so it falls to the owner or the person the lane is for; a lead is named by a policy rule alone,
and answers only what does not matter. ADR 0036 has the addendum; the approval and policy pages
and the protocol's wording say so. `submit-event.test.ts`, "never lets the specialist's own refs
name a harness, and never a harness for what matters"; `gateway.test.ts`, "lets a lead answer
what policy handed it", rewritten around a person's rule and a calendar write.

### 2. An ask that named nobody was anyone's, guests included, and handing one on to nobody widened it
**Medium, security. Fixed at the gate.** `submit-event.ts`, `inTheRoom` and `fillRouting`;
`policy.ts`, `approverRefIds`; `authorize.ts`, rule 9. ADR 0030's Gate 3 addendum, ADR 0036
decision 1; M3.3 and M5.5.

Three things met badly. Since Gate 3 a resolved list is kept to the people in the room, and
when that leaves nobody the list is empty, which the door reads as anyone in the room. Since
M5.1 a room may hold a guest — a vendor, in the one room they were let into. And a harness's own
refs pass through unchecked, so a harness could name a ghost. Probe P1: Scout named a ghost on a
$600 payment, the list came out empty, and the guest's yes was taken. Probe P3: Arjun handed an
ask to a person outside the room — accepted, as `[]` — and the guest answered that one too;
handed it to `lead` outside any lane and it went quietly to the owner. **Fix:** `any` resolves
to everyone in the room but a guest, and rule 9 refuses a guest's decision on an ask that names
nobody — a guest answers when named by id, and not otherwise; a list that names nobody present
goes to the harness's owner when the owner is here, before it becomes anyone's; and a routing
resolves strictly — `resolveApprovers`, no fall-back — kept to the room and the lane's lead,
and names somebody or is refused as `invalid`. The kit mirrors the guest clause. Left as it
was, and recorded: a rule naming a role nobody holds still falls to the owner-if-here, else
anyone but a guest (P2; open decision 10); and a named person outside the room is sent the ask
since M5.5 but cannot answer it, since rule 5 stands aside for a harness only, which is why
handing on to them is refused rather than allowed (open decision 9). `authorize.test.ts`,
"never takes a guest for anyone"; `policy.test.ts`, "resolves strictly"; `submit-event.test.ts`,
"hands an approval only to somebody who can answer it".

### 3. An admin could withdraw the owner's every device
**Medium, security. Fixed at the gate.** `server/src/interfaces/http/routes/devices.ts`;
ADR 0034, decision 2; entered at `36850c3` (M5.1).

The route let an owner or admin withdraw anybody's device. The roles module says an admin does
everything but touch an owner, and the role route says so; the device route did not, so an admin
could withdraw the owner's laptop and the owner's phone and the owner was out — 401 on the next
request (probe P5) — with no device to issue a code from and, without a passkey, no way back.
**Fix:** somebody else's device is withdrawn by an owner or admin of at least its person's rank
(`outranks`); an admin withdraws a member's, a guest's, another admin's, and never an owner's.
`devices.test.ts`, "lets an admin withdraw a member's device and another admin's, and never an
owner's".

### 4. The append-and-replay benchmark was over budget five times, and the packet did not run it
**High, standards. Fixed at the gate.** Migration `0010-messaging-depth`'s triggers, replaced by
`0012-search-off-the-request-path`; `server/src/infrastructure/store/search-index.ts`; ADR 0035,
decision 3; entered at `145ec15` (M5.4). CI's "Benchmark the event log" step fails the build on
this.

Decision 3 kept the FTS5 index in step by triggers that wrote the index inside every append,
and found the row to replace by `message_id`, or `run_id` and `step_id` — columns FTS5 does not
index, so each was a scan of the whole index. Ten thousand steps updated in twelve seconds and
deleted in six, measured on their own; the benchmark's replay, which deletes every projection
row and writes it again, in nine. Keyed by rowid the scan went and the run took three seconds,
still half as much again over budget: FTS5 flushes a segment on every commit, and thirty words
of text cost more per event than the log and its projections together. **Fix:** the triggers
write nothing into the index. A change is a row in `search_queue`, append-only — one plain
insert, a change made twice queued twice; `drainSearchIndex` folds the queue's distinct keys
into the index in one transaction — before every search, so a hit is never stale, and on the
sweep's timer, so the queue stays short; a deletion and a message taken back leave the index at
once, by rowid through a map whose integer key is the FTS row's rowid, stable under VACUUM; and
a rebuild drops the triggers, clears and re-queues the workspace in four bulk statements, and
puts them back, so ten thousand rows deleted and written again cost no trigger work. One lesson
on the way: `insert or ignore` inside a trigger is not ignored when the statement that fired it
was an upsert — SQLite lets the outer statement's conflict clause override the trigger's — which
the property test caught as a primary-key violation deep in a replay, and which is why the queue
has no unique key to conflict on. The bench reads 1.7 to 2.0 s at the tag under a load average
of ten, interleaved with Gate 3's code at 1.5 to 1.6 s on the same machine in the same hour; the
margin is thin, and Phase 6's M6.5 line now says to measure it on the CI runner too. `messaging-
depth.test.ts`, "follows the tables by a queue"; `migrator.test.ts`, "0012"; the fifty-thousand
ceiling holds with the fold of fifty thousand queued rows under ten seconds.

### 5. A device that reloaded raised every pending banner again
**Medium, the gate focus. Fixed at the gate.** `server/src/infrastructure/store/notification-
registry.ts`, `claim`; ADR 0037, decision 2; entered at `bebf083` (M5.6).

The ledger answered a claim with the keys the device held — "granted now, or granted to the same
device before" — so `useNotifications`, whose memory of what it raised is a set in the page,
claimed again after a reload, was granted again, and raised the same decision banners again;
the desktop app does that every morning. Exactly one notification per event per person held
across devices and not on one, and the ADR's own context had named "a reload hears it again" as
the thing to fix. Probe P11: the same device, the same key, granted twice. **Fix:** a claim
answers only what this call inserted; a key claimed before, by any device, is told taken. The
queue is the whole picture and a banner is one word about it, once. ADR 0037 has the addendum.
`notification-registry.test.ts`, "grants a key to the first device to ask, once, and never to a
second nor to the first again".

### 6. A blank name spent a single-use invite
**Low. Fixed at the gate.** `server/src/application/use-cases/invites.ts`, `redeem`.

The key's shape and the device's novelty were checked before the invite was spent; the name was
checked after, in `joinWorkspace`. A person who submitted a blank name (probe P6) was told to
give one, and the same link with a name was then "not valid": spent. **Fix:** everything that
can be wrong with the answer is refused before the invite is spent. `invites.test.ts`, "refuses
a name that is nothing before a single-use invite is spent".

### 7. A member of several rooms could be made a guest, and stayed in them all
**Low. Fixed at the gate.** `server/src/domain/roles.ts`, `refuseRoleChange`; `authorize.ts`,
rule 11.

"A guest is in one space at most" was enforced on `membership.added` and not on `role.changed`:
Dana, in two rooms, made a guest, was a guest of two rooms (probe P7), and nothing would ever
put that right. **Fix:** a change to `guest` is refused while the person is in more than one
space, with the count and what to do first. `roles.test.ts`, "makes nobody in more than one
space a guest"; `submit-event.test.ts`, the same.

### 8. The sign-in challenge door has no cap on issuance
**Note. Accepted.** `POST /v1/passkeys/assertion-options` is unauthenticated and the limiter
counts wrong answers, not requests; every call keeps a challenge for five minutes. Two hundred
in a row (P10g) cost nothing visible, and the five-minute prune bounds the map by the rate; a
flood is a memory cost of a few hundred bytes a request for five minutes. Worth a request
limiter beside the failure limiter when the relay exposes the door (M4.1).

### 9. The coverage numbers move a hundredth between runs of the same commit
**Note. Accepted.** 93.44 / 84.27 in the packet, 93.43 / 84.24 at the gate, same commit, same
machine: a branch somewhere runs or not with timing — a `catch`, a race a test sometimes wins.
Not a flake, since nothing fails; but a threshold set a hundredth above a run would be. Worth
finding when a threshold is next raised.

### 10. The kit mirrors rule 9's guest clause without a test of its own
**Note. Accepted.** The fake Chips has no way to seat a second person as a guest of its one
room, so the clause is tested through the server's door and read in the kit. When Phase 7's
adapters grow a people-aware scenario, give the fake a guest.

### 11. The answers to the packet's questions
**Note.** (1) A message taken back keeps its words in the log: keep — the audit is the
product's promise, and a redaction path for the words themselves is retention's work in Phase
6, beside the attachment sweep. (2) The person the work is for is not handed a lead's ask: keep,
now that a lead is handed only what does not matter and they may take it back. (3) Quiet hours
let a decision through by default: keep. (4) `role:<name>` reading both standings: a
convenience, and the trap is the role nobody holds, now open decision 10. (5) Phase 4 keeps its
shape; its M4.2 and M4.3 lines say what the phone inherits.

### 12. The refused unauthenticated call still logs at `error`
**Low, carried.** Known issue 7; the e2e log shows it for every wrong pairing code and spent
invite the specs try on purpose. `warn` is right.

### 13. No screen withdraws another person's device
**Low, product. Carried.** `apps/web/src/app/You.tsx`. ADR 0034 says an owner puts somebody out
by withdrawing their devices, and `DELETE /v1/devices/:id` does it; but You lists only the
caller's own devices and the People rows offer a role and nothing else, so the packet's demo
step 5 cannot be walked from the app. The route is tested (`devices.test.ts`, probe P5). Worth
a *Devices* line under each person for an owner or admin — an admin's for everyone but an owner,
after finding 3 — in Phase 4's M4.2 or Phase 6's admin work.

### 14. An invite's expiry reads "until now"
**Note. Carried.** `You.tsx`, the invite rows: a link good for a week is listed as *Member,
once, until now* and *single use, by You, until now* — the relative-time helper clamps a future
time to *now*. Cosmetic; a "for 7 days" would do.

## Deviations accepted

Every entry under Scope changes in `STATUS.md` for Phase 5, as the packet lists them, and the
packet's own: Phase 5 before Phase 4, on Arjun's word, now recorded in the plan; `role:<name>`
reading both standings; batch approval as one decision each; a thread as a space; search as a
projection kept by triggers — amended at the gate to a queue the triggers fill (finding 4);
no e2e spec for M5.5 and M5.6, whose paths the server's tests walk through the real door. The
blueprint deviations in the packet's table, each with its reason: quiet hours letting a
decision through by default; a reaction as a toggle; a message taken back kept in the log; a
guest in one space, opening none. And the acceptance line the packet owned up to: passkeys on
the phone are Phase 4's. None to reverse.

## Conditions for the next phase

1. **Observe one green CI run on `main`** — the Phase 1 review's condition 3, carried a fifth
   time. The thirty-odd commits since `phase-3-complete` are the push. If the run is red, fixing
   it comes before M4.1; the benchmark step is the one to watch, with a thin margin on this
   machine and an unknown one on the runner. `gh` is still unauthenticated here.
2. **Jacobian on this Mac mini**: re-vendor the plugin and restart it, so a live placement and a
   `hand_down` are seen as lanes on the machine they were built for; and the seventh seam. Both
   Arjun's; nothing in that checkout is committed without his word. Carried from Gate 3.
3. **The deferred approval watched from a real phone**, once, before Gate 4. Carried from Gate 3.
4. **The dev chipsd on port 4431 restarted**, by its own PID and then the exact dev command in
   the working agreements, so migrations 0009 to 0012 run on the live database and Arjun's own
   tab sees Phase 5. Arjun's, since it is his database.
5. **The shell's `ask` and `tell` run once against a real notification centre**, on the laptop
   with the desktop app, before Gate 4: M2.2's and M5.6's standing note.

## Follow-up: the fixes, confirmed

Each was made during the gate and is in the tagged commit; I re-ran what proves it, and the
`pnpm check` above and the second browser run are the runs that include them all.

| Finding | Fix | Proved by |
|---|---|---|
| 1, the lead | A harness's own refs name people; a harness dropped for what matters; `lead` by a rule alone | `submit-event.test.ts`, "never lets the specialist's own refs…"; `gateway.test.ts`, "lets a lead answer…"; probe P4 after |
| 2, nobody and guests | `any` but guests; rule 9's guest clause; the owner before anyone; routing strict and refused for nobody | `authorize.test.ts`, "never takes a guest for anyone"; `policy.test.ts`; `submit-event.test.ts`, "hands an approval only to somebody…"; probes P1, P3 after |
| 3, the owner's device | Withdrawn by somebody of at least its person's rank | `devices.test.ts`, "never an owner's"; probe P5 after |
| 4, the benchmark | Migration 0012: the index off the append path, keyed by rowid | `pnpm bench:append` 1,708–1,963 ms, three runs; `messaging-depth.test.ts`, "follows the tables by a queue"; `migrator.test.ts`, "0012" |
| 5, the reload | A key granted once | `notification-registry.test.ts`; `routes/notifications.test.ts`; probe P11 after |
| 6, the blank name | Refused before the invite is spent | `invites.test.ts`, "refuses a name that is nothing before…"; probe P6 after |
| 7, the demotion | Refused while in more than one space | `roles.test.ts`; `submit-event.test.ts`, "makes nobody in more than one space a guest"; probe P7 after |
