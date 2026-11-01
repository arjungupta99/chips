# Phase 5 packet

Written 6 September 2026 · for tag `phase-5-complete` · from `phase-3-complete` (Phase 5 was
built before Phase 4, on Arjun's word; see Deviations)

## What shipped

People. A workspace holds more than one person: they join by an invite link with a role
attached, come back on a new device by passkey, and hold a standing in the workspace — owner,
admin, member, guest — that the door honours
([ADR 0034](../decisions/0034-people-join-by-invite-and-come-back-by-passkey.md)). A harness's
owner may hand it to somebody else, and a workspace owner or admin holds every harness's tokens
(ADR 0023's addendum). One app holds several workspaces, one in front and the rest watched
behind it (M5.3). Messages gained depth: a thread is a space with a parent and no members of
its own; a message is edited or taken back by events the log keeps; pins; a reaction on
anyone's message; and search over messages and receipts, SQLite FTS5 kept by triggers, under
200 ms with fifty thousand messages in the room
([ADR 0035](../decisions/0035-a-thread-is-a-space-with-a-parent-and-a-message-is-changed-by-events.md)).
An approval is handed to a teammate, a role or the lane's lead by an event resolved like the
request, `role:` reads the space's standing and the workspace's, a lead answers what policy
hands it from outside the specialist's room, and the queue approves several at once
([ADR 0036](../decisions/0036-an-approval-is-handed-on-by-an-event-and-a-lead-answers-what-policy-hands-it.md)).
Notifications are per person: settings on the server, theirs alone; a claim ledger that grants
a banner's key to one device of a person; the three tiers, quiet hours and a word per harness,
planned in the core and raised on the desktop or in a browser that allowed them
([ADR 0037](../decisions/0037-notifications-are-per-person-settings-on-the-server-and-one-claim-per-event.md)).

The thing worth saying about how it went: **the plan's six milestones held, and every one of
them was a door rule before it was a screen.** Rule 11 (a person's standing), rules 12 and 13
(a message changed, a thread grown), rule 9's harness clause and rule 14 (an approval handed
on) are where the phase's meaning lives; the read models, the visibility rules and the client
folds follow them, and the authorization matrix — every route against every kind of caller,
a route unaddable without a row — is the phase's acceptance test made permanent. Two open
decisions were answered on the way (2 and 7), one Phase 3 finding was closed in passing (the
queued receipt), and one long-standing gap was filled without a plan line for it: a browser
can raise a notification at all. Twenty-nine commits on `main` since the tag, each green
locally; nothing pushed, and the Node 22 CI run is still unobserved — carried a fifth time.

### Milestones

| Milestone | State | Where |
|---|---|---|
| M5.1 Invites and passkeys | done | ADR 0034; migration 0009; `invites`, `passkeys`, `devices` routes; the Join and Sign-in screens; `people.spec.ts` |
| M5.2 Membership | done | rule 11; ADR 0023's addendum; `POST /v1/harnesses/:id/owner`; the authorization matrix; the kit's rules 7 to 9 |
| M5.3 Several workspaces | done | a device per pairing with one in front; the switcher; background stores; the desktop's badge over all; a mute per device |
| M5.4 Messaging depth | done | ADR 0035; migration 0010 with FTS5; rules 12 and 13; `GET /v1/search`; threads, pins, edits, tombstones, search in the app; `messaging.spec.ts` |
| M5.5 Approval routing | done | ADR 0036; `approval.routed`; rule 14 and rule 9's harness clause; `lead` and workspace roles among the refs; Hand to… and batch approval |
| M5.6 Notifications per person | done | ADR 0037; migration 0011; `/v1/me/notifications` and its claims; the planner; `useNotifications`; the shell's `tell`; the operate page |

### Exit criteria

"Two people and three agents in a workspace, with approvals routed by role and no duplicate
notifications." Two people and three harnesses are the gateway test's standing setup since
M5.2 (Arjun, Dana, a guest or an admin added as needed; Scout, and Ledger and a third for the
lanes); approvals routed by role are `role:admin` resolving to the admins in the room and
`lead` to the lane's lead, walked end to end over HTTP in `gateway.test.ts`, "approval
routing"; no duplicate notifications is the claim ledger, walked by two devices racing in
`notification-registry.test.ts` and by the hook in `useNotifications.test.tsx`.

The acceptance lines: the authorization matrix covers 37 routes against six kinds of caller —
owner, admin, member, guest, harness, nobody — and a route cannot be added without a row;
passkey registration and sign-in pass on the web (`people.spec.ts`, a virtual authenticator in
Chromium), the phone half deferred to Phase 4 with the phone; a search over 50,000 messages
returns in under 200 ms (`messaging-depth.test.ts`, four queries against fifty thousand rows in
one room, each timed).

## Deviations

### From the plan

- **Phase 5 before Phase 4** (STATUS, Scope changes). Phase 4 needs an Expo and Xcode toolchain,
  push credentials and a phone outside the house; Phase 5 is server and web work the Mac mini
  runs. Phase 5 was built with Gate 3 passed as its entry. What it leaves for Phase 4: the
  phone half of M5.1's acceptance; push through the relay, which claims the same notification
  keys through the same route; and the deferred approval from a real phone (Gate 3's condition
  3). The plan is edited only at gates; this gate records it.
- **`role:<name>` reads two standings.** The plan's "route to a role" met ADR 0034's workspace
  roles: a ref matches a person's standing in the space or in the workspace, since the words
  are shared and the room's owner is usually the workspace's (ADR 0036).
- **Batch approval is many decisions**, one `approval.resolved` each, not a batch endpoint —
  first answer wins per ask, and the audit records each.
- **A thread is a space**, not a message with a `thread_id` (ADR 0035): every scoping rule and
  fold already knows what a space is.
- **Search is a projection kept by triggers**, two FTS5 tables of their own rather than
  external-content tables, since `messages` is keyed by a text id. Postgres gets its own
  migration for these in Phase 6.
- **No new e2e spec for M5.5 or M5.6**: the lead's path needs a second harness in a lane and
  the dedup needs two devices of one person, both of which the server's tests walk through the
  real door and store; the queue's batch and the card's Hand to… are covered in `Shell.test.tsx`.

### From the blueprint

- **Quiet hours let a decision through by default**, as a setting a person can turn off; the
  blueprint says Decide now "breaks through" and no more.
- **A reaction is a toggle**: the same emoji from the same person again takes it back. The
  blueprint says reactions and nothing about taking one back.
- **A message taken back is not erased**: the words leave every screen and the search index,
  and the log keeps them for whoever can read the log (ADR 0035). The blueprint's audit-first
  reading, kept on purpose; a reviewer may disagree.
- **A guest opens no space and no thread**, and is in one space at most; the blueprint says "may
  be in one space only" and is silent on the rest.

## Tests

| Command | Result |
|---|---|
| `pnpm check` (Biome at complexity 12, dependency-cruiser, architecture and protocol staleness, typecheck on every package and the docs site, tests with coverage) | exit 0 · 156 files, **2,244 passed**, 0 skipped |
| `pnpm test` coverage | 93.44 statements / 84.27 branches / 93.84 functions / 95.37 lines |
| `CHIPS_E2E_WEB_PORT=5199 pnpm e2e` | **28 passed** (Chromium 25 in 1.4 minutes; scale, windowing and restart last as their own project) |
| `cargo check` in `apps/desktop/src-tauri` | 0 errors, with the new `tell` command |
| `pnpm gen:protocol --check` (part of `pnpm check`) | 139 generated files current |

The Playwright suite, in the order it runs: the approval loop; attachments; Custom connect; the
decisions; feedback with the real Scout; the golden scenario with pause, steer and stop; the
group room with two browsers; the lane with a scripted specialist; Lighthouse on four screens;
messaging depth — edit, pin, thread, search, take back — against a real server (new this
phase); people — an invite, a role, a passkey and a way back, with a second browser and a
virtual authenticator (new this phase); the route with the real samples; sync under a burst and
offline; token revocation; then the restart, the scale run and the windowing run. Nothing is
skipped. No test is quarantined.

Acceptance lines that rest on Arjun rather than on a run here: passkeys on the phone (Phase
4); the desktop's `tell` and, since M2.2, its `ask`, against a real notification centre; the
dev chipsd on 4431 still runs code from before migration 0009, so Arjun's own tab has seen none
of this phase — restarting it runs migrations 0009 to 0011 on the live database.

### Coverage

| Scope | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| Overall (floor 80) | 93.44 | 84.27 | 93.84 | 95.37 |
| `packages/protocol/src`, `server/src/domain` (floor 90) | above 90 on all four; enforced by the Vitest thresholds | | | |

Every number is above the Phase 3 gate's (92.75 statements, 83.26 branches, 92.96 functions,
94.72 lines) across a phase that added the people, the threads, the search and the
notifications. Said plainly rather than quietly: against the phase's own high point at M5.5
(93.45 / 84.16 / 93.98 / 95.40), M5.6 left functions 0.14 lower and lines 0.03 lower — the You
screen's settings form and the browser notifier — while branches rose 0.11. Nothing was
excluded that was not excluded before; thresholds unchanged, none lowered.

## Engineering standards

**Coverage against thresholds.** Above, all met.

**`dependency-cruiser`.** No violations. The domain's rules take facts and answer refusals; the
read models are the only place a table is named; the FTS5 tables are the migration's and the
read model's and appear nowhere else.

**Lint and typecheck.** Biome clean with the complexity limit at twelve, which split the door's
new rules, the shell, the queue and the notifications hook this phase; `tsc` strict with
`exactOptionalPropertyTypes` across every package, `astro check` on the docs site, `cargo
check` on the shell.

**Load numbers.** Search: fifty thousand messages in one room, four queries — a rare word, two
common words, a prefix, a hyphenated token — each under 200 ms, in `messaging-depth.test.ts`.
The windowing and scale runs are unchanged from Gate 3 and still pass.

**New dependencies.** None. Migrations 0009 (`workspace_members`, `invites`, `passkeys`, with a
backfill of `person.joined` for everyone already there), 0010 (`spaces.parent_space_id` and
`root_message_id`, `messages.edited_at` and `deleted_at`, `pins`, `messages_fts` and
`steps_fts` with their triggers and a one-time fill), 0011 (`notification_settings`,
`notification_claims`). Every one runs down and up again.

**Waivers requested.** None.

### Appendix G

1. Layers inward only, dependency-cruiser green: yes.
2. Every external input validated at the edge: the invite, passkey, device, search,
   notification and claim routes parse their bodies and queries; `approval.routed` and the
   four message events go through the door like every event; a person's settings are validated
   against the protocol's schema on the way in.
3. Read models per screen, no joins at request time: the thread's members are one more lookup
   through the parent; `membersOf` joins `workspace_members` for the role ref; search is one
   FTS5 query per table.
4. Registry tables never replayed: `invites`, `passkeys`, `notification_settings`,
   `notification_claims`; `pins` and `workspace_members` are projections and are replayed.
5. Privacy of per-person data on a shared server: settings and claims are read and written only
   by their person; passkeys are withdrawn only by their person; a device by its person or an
   admin; an invite's token is stored as a digest.
6. Deterministic tests: injected clock and ids; a virtual authenticator for WebAuthn; the
   claim race walked in one process against a real database.

## Demo script

On the Mac mini, against a scratch chipsd in dev mode with the two samples started by hand, in
two browsers:

1. Pair the first browser with the code the dev bootstrap prints. Open **You**: Owner. Make an
   invite for a member; open it in the second browser; join as Priya with a passkey (Chromium
   at `localhost`, for the RP id). Priya's You says Member, and *Add a passkey* worked.
2. In PO-4471 as Arjun, say something, then **Edit** it, **Pin** it, and **Reply in thread**;
   in the second browser Priya sees the edit, the pin, the thread beside the room and replies
   there; the room's line counts the reply. Search `Northwind` from either: the hit opens the
   room at the line.
3. Ask Scout for something that needs a yes. On Arjun's card, **Hand to…** Priya with a line
   why: Arjun's buttons go, Priya's card gets them, and the audit says who handed it on. On the
   queue, tick two asks and **Approve selected**.
4. In **You → Notifications**, set Review today to never and quiet hours to now; ask Scout
   again in the other browser: a decision still arrives as a banner (the desktop, or a browser
   that allowed them), the digest does not, and the second device of the same person raises
   nothing for the same ask.
5. Withdraw Priya's device from Arjun's You: her socket closes at once, her next request is
   refused, and her passkey is still hers to come back with.

Steps 1 to 3 run unattended in `people.spec.ts`, `messaging.spec.ts` and `gateway.test.ts`;
steps 4 and 5 in the hook's and the registry's tests and `people.spec.ts`. None were walked by
hand in a browser this phase beyond the e2e runs, which is a thing to say plainly.

## Known issues

1. **The dev chipsd on port 4431 runs pre-0009 code**; Arjun's own tab has seen none of Phase
   5. Restarting it migrates the live database (0009 to 0011), which is why it was left alone.
2. **The CLI holds one device** (M5.3 gave the app several); `chips` on a second server means a
   second pairing that replaces the first.
3. **Removing a person from a workspace altogether is not a thing**: an owner withdraws their
   devices, and their row and role remain.
4. **A message's attachment bytes stay when it is taken back**: the blob store keeps bytes by
   digest, shared across messages; a sweep is Phase 6's. Search does not read attachments'
   text. An edit carries no new `mentions`.
5. **The desktop's `tell` (and M2.2's `ask`) have not been run against a real notification
   centre**; `cargo check` is what stands behind them.
6. **A browser's notification permission is asked from You only**; a tab that never opens You
   never hears a banner, by design, and the queue still counts everything.
7. **The server logs a refused unauthenticated call at `error` level** (an invalid pairing code,
   a spent invite); `warn` would be right. Cosmetic, carried from M5.1.
8. **Notifying the new approvers of an ask handed on** rides on the planner: they see it in the
   queue and are notified by their own claim, but nobody is told "this was handed to you" in so
   many words.

## Questions for the reviewer

1. **Taking a message back keeps the words in the log** (ADR 0035). Is "not erasure, for
   whoever can read the log" the right reading for a product that promises an audit, or does a
   deletion need a redaction path for the words themselves?
2. **A lead answering what policy hands it** (ADR 0036, decision 7 answered yes): the person the
   work is for is not handed it and cannot answer until they take it back. Is that the right
   default, or should the on-behalf-of person always be among the names?
3. **Quiet hours let a decision through by default.** Right default?
4. **`role:<name>` reading both standings**: is a shared vocabulary between the room's roles and
   the workspace's a convenience or a trap?
5. The reordering: with Phase 5 done first, does Phase 4 keep its shape, or does the phone now
   inherit enough (roles, threads, routing, the claim ledger) that its milestones should be
   re-cut at this gate?

## Risks for the next phase

- **The phone meets everything at once**: roles on the card, threads in a room, a handed-on ask,
  a claim before a push. The claim ledger is the one piece built for it; the rest is the same
  core, which is the bet.
- **Push needs the relay** (M4.3) and the relay carries an opaque ping; the phone claims the key
  when it wakes, which is a round trip before a lock-screen banner has buttons. The 5-second
  acceptance line is at risk from that hop, not from the server.
- **The live Jacobian and the dev server on the mini are both behind**: three migrations and
  five milestones of server behaviour nobody has run against a real terminal since 5 September.
- **`packages/core/src/model.ts` grew again** (threads, pins, tombstones, routing) and the phone
  will import all of it.
