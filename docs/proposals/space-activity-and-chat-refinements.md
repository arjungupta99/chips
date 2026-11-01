# Space Activity and chat refinements

> **17 September 2026: the Activity half of this document is withdrawn**
> ([ADR 0062](../decisions/0062-the-activity-card-is-withdrawn.md)). The card, its header symbol
> and screens, the `activity.updated` contract and Jacobian's adoption of it were removed the day
> after they shipped. The chat refinements stand: the scrolling colour field, the source tints,
> the long-press actions and reply provenance. What follows is kept as it was written.

*16 September 2026 · Implementation and release handoff. Arjun approved implementation after
the mocks and universal source-color clarification. Chips phases 0–4 are implemented locally;
iPhone verification is complete. External harness adoption remains a separate phase.*

This is the follow-up to [phone polish](phone-polish.md). Arjun asked to browse Algorithmic
Beauty on the iPhone simulator, improve the bubbles and colors, make bubble colors change as
the conversation scrolls, and add Copy and other useful actions to the long-press sheet. He
asked for mocks before implementation, liked the build card, and asked for a reusable component
with an animated header symbol opening a screen of its current state. He then clarified the
integration boundary: **Chips offers the public hooks; harnesses integrate with Chips. Chips
has no dependency on Jacobian.** This plan records that boundary and the implementation phases.
At 21:54 Pacific he also supplied screenshots of the routing row and its overflowing,
non-scrollable detail sheet, requesting improvements to both. The routing fix uses existing
lane data and needs no new harness integration.

## 1. Resume here

1. Read this document, [STATUS](../STATUS.md)'s newest entry, and
   [ADR 0051](../decisions/0051-a-harnesss-adapter-lives-with-the-harness.md).
2. Inspect `git status` and any applicable repository instructions. Do not overwrite unrelated
   work. Read the implementation files named in the phase being started; paths below were
   verified during planning and may have moved since.
3. Read the progress checklist and implementation evidence in section 8. Implementation has
   been authorized; finish remaining verification without restarting the live service or
   implementing the external adapter in this checkout.
4. Keep each phase reviewable. Record its changes, checks actually run, remaining limitations
   and next step here and in STATUS before ending a session or compacting.
5. Use a scratch server/workspace for integration tests. The live `chipsd` on 4431 is the
   launch agent `chat.chips.serve`; restart it only on Arjun's explicit instruction. Never
   use `pkill` by pattern. Read [the mobile build guide](../../apps/mobile/README.md) before
   installing a build; pairing survives an update.

### Design material already shown

The current design conversation contains four interactive mocks:

- `chips-bubble-refinements.html`: scrolling outgoing colors, quieter incoming messages,
  text actions and a compact build card.
- `chips-ui-mocks.html`: Bubbles, Long press and Build progress views.
- `chips-space-activity.html`: the reusable card, Orbit header symbol, Activity detail screen,
  alternate spaces and state controls.
- `chips-routing-refinements.html`: a quiet destination row (with a soft-card alternative),
  bounded handoff sheet, expandable request and full-reply reader with a fixed Back/Copy bar.
  Updated after Arjun's color correction: Designer's reply uses violet text on a soft violet
  bubble, matching its route/avatar identity rather than the receiving room's color.
  The same-room Designer example is sample content based on the supplied screenshots, not
  a live subscription. State controls cover completed, working, waiting and failed lanes.
  Preview check: default conversation/sheet inspected; at a 360px browser viewport the expanded
  request scroll reached its end, the reply reader reached End of reply with Back/Copy still
  visible, and Back preserved the sheet's prior scroll offset. This is HTML prototype evidence
  only; native iOS/Android scrolling, alternate states and light-theme visuals remain to check.

These are HTML prototypes in the conversation's visualization directory, not app components.
On this machine the directory is
`/Users/ada/.codex/visualizations/2026/09/17/01a0ad6f-9561-7a31-b7b9-7599f4418e25/`.
Read the filenames above there when resuming; use the visualization skill when changing or
presenting them. This path is design material for this session, never a runtime dependency.
Their content and counts are samples. The 2/5 in the Activity mock is not live build progress.
The baseline is a teal-led outgoing palette, quiet source-colored incoming surfaces, a compact card, and an Orbit
symbol that opens a dedicated detail screen. Exact palette and motion remain design choices;
show material departures from these mocks before implementing those departures. Do not infer
approval to implement unrelated product features from a request to run one phase.

## 2. What the initial investigation established

This table records the baseline before implementation. Section 8 records the delivered changes.

| Area | Present implementation | Implication |
|---|---|---|
| Live delivery | `packages/core/src/transport.ts` receives sequenced events and reconnects with `since` | Reuse the existing socket and replay |
| State and persistence | `packages/core/src/store.ts` folds events, caches them and batches subscriber notifications; mobile supplies SQLite | Reuse the existing store, cache and cursor rules |
| React subscription | `apps/mobile/src/store/provider.tsx` exposes `useSnapshot(store)` using `useSyncExternalStore` | Header, card and detail can subscribe to one model |
| Runs | `run.started`, `run.plan`, `run.status`, `step.log`, approvals, questions and terminal events already exist | Useful for actual runs; a workflow's lifecycle need not equal a conversational run |
| Progress fraction | The wire permits `run.status.progress` and `estimate_seconds`; the client run fold currently retains only the status phrase | Do not advertise percentages or ETAs as already available in the UI |
| Build message | Algorithmic Beauty receives one `message.post` followed by `message.edited`, without a run ID | Its five workflow cards are currently text, not structured client data |
| Text actions | `LineMenu.tsx` has feedback and receipt details; `Line.tsx` does not make every text message holdable | Copy requires both the menu action and a consistent long-press entry point |
| Bubbles | `ui/tokens.ts` fixes outgoing teal and a 78% maximum width; `Line.tsx` chooses fixed surfaces | Scroll-linked colors and wider long replies need deliberate layout/motion work |
| Routing | `LaneChain.tsx` already reads a generic `Lane`, including labels, goal, summary, constraints, state, delivery, attachments and space references | Refine the existing lane UI; no Activity schema or provider-specific lookup is needed |
| Lane detail overflow | `LaneSheet` places all details/Markdown in an unbounded `View`; `Sheet.tsx` has no panel height cap, top safe-area constraint or scroll body | A long summary can push the heading behind the status bar with no scroll recovery; clipping alone is not a fix |

During the read-only check, the latest stored build summary was **1/5 done, Phase 2 in review**.
There were no `run.plan` events for that space, and the inspected runs had empty plans. This is
an observation from that session, not a status to hard-code or assume remains current.

Jacobian's repository was inspected only to establish feasibility. Its workflow store has
stable card IDs, titles, states, assignees, dependencies, timestamps, outcomes and blocked
reasons. A `card_transition` emitter feeds a progress notifier, which currently flattens those
records into text before the Chips adapter sends them. That evidence belongs to the external
integration; Chips production code and tests must never read those files or databases.

Simulator browsing also exposed a lane detail sheet overflowing the safe area and unusually
narrow long replies. Native scrolling/dragging through the available automation failed, so
the existing long-press and scrolling gestures were not fully exercised. The HTML mock
interactions were checked separately; that does not prove native behavior.
The later screenshots at 21:54:23/21:54:28 Pacific confirm the routing sheet obstruction, and
Arjun reports that its text cannot scroll. Source inspection confirms the missing constraints
and scroll container. Treat this as a usability defect, independent of the Activity feature.

## 3. Fixed architecture boundaries

1. **Chips owns a generic Activity contract.** Public protocol events, publishing helpers,
   validation, storage, replay, subscriptions and rendering are Chips responsibilities.
2. **The dependency points from a harness to Chips.** A harness can use the Chips SDK or
   implement its documented wire protocol, just as it can integrate with Telegram. Chips
   imports no harness package and calls no harness-specific API.
3. **Every adapter lives with its harness.** Jacobian's mapping from workflow cards to
   Activities lives in Jacobian. No Jacobian adapter, workflow vocabulary, filesystem paths,
   database reads or status-text parser belongs in Chips.
4. **Activity is a display record with its own lifetime.** It does not create an artificial
   open run, alter message queueing, pause execution, or complete a run. Existing runs, lanes,
   questions and approvals keep their current semantics.
5. **One source of truth per layer.** The harness owns its work; Chips owns the accepted
   Activity projection. The conversation card, header and detail read the same projection.
6. **Actions use existing public contracts.** A link to an approval or question opens that
   actual record and obeys its existing authorization. Activity never grants authority to
   approve, retry or cancel work. Generic arbitrary action callbacks are outside the first version.
7. **Generic proof comes first.** Chips must work end to end with a scripted sample harness
   and no Jacobian process, checkout or data. The real adapter is a separate integration.

## 4. Public contract and update behavior

The contract is implemented in `packages/protocol/src/activity.ts` and settled by
[ADR 0060](../decisions/0060-an-activity-is-a-publishers-versioned-snapshot-not-an-open-run.md).
The [publisher guide](../../apps/docs/src/content/docs/connect/activities.md) is the exact
integration reference. The phase descriptions below retain the implementation rationale.

### 4.1 Publish a complete, versioned snapshot

The public `activity.updated` event creates or replaces the current snapshot under
a stable `activity_id`. It is space-scoped and does not require `run_id`. Provide a typed
helper `chips.publishActivity(...)` in `@chipschat/harness` (`packages/sdk-ts`). Terminal
states use the same event. Start with complete bounded snapshots to keep retry and replay
simple; do not add JSON Patch or a second socket protocol.

| Field | Meaning and rules |
|---|---|
| `activity_id` | Stable for the lifetime of this work, including reconnects; a new independent task gets a new ID |
| Envelope `space_id` and actor | Existing Chips space and authenticated publisher; the server binds ownership, never trusts a supplied owner ID |
| `revision` | Increasing publisher revision, persisted by the publisher; retransmission keeps revision and idempotency key |
| `title`, `summary` | Short display text and optional current description, meaningful for any kind of work |
| `state` | queued, working, waiting, review, blocked, completed, failed, cancelled |
| `items` | Optional ordered items with stable IDs, title, state, optional assignee, summary and blocked reason; no items means no staged meter |
| `current_item_ids` | Optional references into those items; allow more than one concurrent item |
| `assignee` | Optional display attribution and a Chips participant/space reference when available; attribution grants no permission |
| `outcome` | Optional terminal summary and same-space message IDs, including messages carrying attachments |
| `attention_refs` | References to existing Chips approvals/questions; resolve validity, visibility and answerability through their own models |
| `source_updated_at` | When the publisher's source changed; keep this distinct from Chips' receipt time and sequence |
| `message_id` | Optional explicit link to the publisher's message in this space, for stable placement and plain-text fallback |

Bounds: 48 items; 16 attention/outcome references; 160-character titles and assignee names;
4,000-character summaries/outcomes; 600-character item descriptions; 64 KiB UTF-8 event JSON.
Validate unique item IDs, current-item references, state values and same-space message
ownership. Treat a higher revision as a complete replacement: omitted optional fields clear
old values. Specify stale revisions and conflicting same-revision writes explicitly. A retry
must not create a second card or roll state backward. A reopened activity uses a new revision;
a new attempt that is separate work uses a new activity ID.

### 4.2 From hooks to the screen

```text
Harness's own work hooks
  -> its Chips adapter / public SDK
  -> activity.updated (authenticated, idempotent)
  -> chipsd event log + Activity projection
  -> existing WebSocket, replay and local cache
  -> @chipschat/core Activity selectors
  -> conversation card + header symbol + Activity screen
```

An adapter publishes the initial state, then meaningful changes to state, items, ownership,
title, outcomes or requested input. It coalesces rapid intermediate updates but sends terminal
states and input requests promptly. A quiet task does not need a timer that invents progress.
On restart/reconnect the adapter reconciles its durable IDs/revisions and republishes current
snapshots through the same API. Source recovery is the adapter's responsibility; delivery,
deduplication and client replay are Chips responsibilities.

The core exposes pure selectors along the lines of `activitiesInSpace`, `activityById`,
`activityProgress`, `activityAttentionFor(viewer)` and `spaceActivitySummary`. Header selection
prioritizes input this viewer can answer, then failures/blocks, running work, review/waiting,
and recent completions. Apply stable ordering within each group. A card always opens its own
activity; a header with several activities opens the space's list. An empty space can show a
quiet entry point with an empty state; it must not imply active work.

### 4.3 Truthful presentation and compatibility

- **Counts:** count completed items against known items, report cancelled items separately,
  and allow the total to change when the source changes its plan. Do not turn the count into
  an effort/time percentage. Without items, show status and recent activity only.
- **Needs you:** derive this for the current viewer from unresolved, answerable references.
  Review by another agent is *In review*. A dependency blockage is *Blocked*. Resolve linked
  asks immediately even if a publisher has not yet sent its next Activity snapshot.
- **Freshness:** display the last source update and connection state separately. Stop the
  working animation when updates cannot be trusted because the connection/source is known
  unavailable. Time without a transition alone does not prove failure or inactivity. Phase 0
  must define freshness behavior using actual available connection signals, not a guessed ETA.
- **Timeline placement:** keep a stable row and position while its contents update. Repeated
  snapshots do not append chat messages, increase unread counts or send repeated notifications.
  The first appearance and genuine linked asks follow explicit existing read/notification rules.
- **History:** show meaningful state/item changes from accepted revisions; omit duplicate
  snapshots and transport chatter. Bound the rendered history and reuse the existing history
  loading mechanism rather than retaining a second unbounded client log.
- **Fallback:** negotiate support and specify old-client behavior before rollout. Prefer an
  explicitly linked plain-text message where fallback is needed: newer clients render it as
  the rich Activity once linked, older clients retain the text. Never guess the relationship
  from a title, emoji or message content. A publication arriving before its linked message,
  or vice versa, must converge to one visible row. Unlinked Activities still work.
- **Existing records:** preserve historical text messages. No heuristic backfill of five
  stages from the current Engineering build string. A harness may republish its actual
  current data using the public contract.

## 5. UI scope

### Reusable Activity surfaces

- **Card:** title, real current status, assignee when known, optional item meter and compact
  summary. Use the same component for a build, research task or itinerary.
- **Header:** accessible Orbit button with a generous tap target. Slow motion only for active
  work; still amber for answerable input, quiet waiting/review, distinct failure and a check
  for completion. A badge counts pending asks, not tool calls. Text and shape accompany color.
- **Detail:** current state and next required input first, optional stages next, collapsed
  recent activity below. Permit several concurrent items. Back returns to the same chat
  position and draft. Support the phone route and wide split-pane header.
- **Motion/accessibility:** use the app's reduced-motion hook, haptics and native motion
  conventions. Pause loops offscreen/background. Shared-symbol expansion is polish after
  navigation works; keep a reduced-motion transition. Check VoiceOver and Dynamic Type.
- **Compatibility:** core/protocol are shared by mobile and web. The first visual rollout is
  mobile, including Android and wide layouts; web must retain a readable fallback. A full new
  desktop Activity UI is a separate follow-up unless requested.

### Chat refinements

- A shared gradient field is anchored to the visible chat viewport. Outgoing bubbles sample
  it as their position changes, keeping the teal identity with blue/violet variation. Incoming
  messages use a quiet surface tinted by their source space/specialist identity, with readable
  text in the same hue family. **Universal cross-space rule (Arjun): a space's reply inside
  any other space carries a subtle tint associated with its originating space.** Apply this
  to every source/destination pair and every harness through one shared rendering rule;
  Designer's violet reply inside Algorithmic Beauty is one example, not a special case.
  The same source keeps the same hue across receiving spaces; several sources in one
  conversation keep their respective identities. Use restrained surface/text tones derived
  from that identity, not the avatar's saturated fill copied onto a large bubble. Check
  contrast across every gradient stop and source palette, including Markdown/code and
  timestamps in both themes.
- Resolve incoming identity from explicit line/lane/run relationships and the source's existing
  avatar color mapping; do not use the receiving room's hue or the relaying harness's hue when
  a more specific originating space/specialist is known. `Avatar.tsx` currently derives hue
  with `avatarHue(name)`; share that mapping, including the same lane label used for the route
  avatar, rather than hard-coding Designer/violet or assigning a fresh random color. Audit
  provenance for forwarded/folded summaries in Phase 0: `Line.laneId` currently documents
  route/task rows, so do not assume every reply has it. Never infer origin from adjacent rows,
  initials or reply text. Use a neutral fallback when origin is unknown/ambiguous and document
  any generic model/protocol gap before implementing attribution. All mapping stays in Chips;
  no harness-specific data access. Keep the hue stable across scroll/replay; any scroll-linked
  incoming variation must stay within its source hue family. The outgoing gradient remains
  the separate treatment already mocked. Retain textual/accessibility attribution so color
  is not the only source cue; a run ending does not replace a known source's hue with green.
- Keep the inverted virtualized `FlatList`. Derive colors/gradient offsets from shared scroll
  position and measured row geometry on the UI thread where feasible; never run React state
  updates for every bubble on every scroll frame. Handle recycled cells, keyboard insets,
  rotation, history loading and arriving messages. Respect Reduce Motion with a static palette.
- Improve long-reply width and metadata density without changing grouping, text meaning,
  message anchors or the existing keep-position behavior. Check short messages and large type.
- Make all eligible text messages, including the person's own, open the action sheet on hold.
  Copy text is the first utility action; use the existing clipboard dependency. Add Select
  text, system Share and message details where supported; preserve feedback and run receipts.
  Define copying of Markdown/code clearly and preserve code whitespace. Do not offer actions
  that cannot work. Quoted Reply, if included, uses the existing message reply relationship;
  it does not reintroduce the withdrawn thread-creation UI.
- Refine routing and fix the lane detail sheet as specified below.
  Composer clarity, attachment-read metadata and unread/decision colors are secondary polish
  to review in Phase 0; keep them separate from the Activity protocol work.

### Routing rows and handoff details

- **Row:** default to a quiet strip with one destination avatar/name, a small routing mark,
  and a visible details affordance for a same-room lane. The source room is already in the
  header; put the full path in details and keep the complete accessible trail. A soft filled
  row is the mock alternative. Do not repeat the goal, summary or a permanent Done badge in
  the conversation. Keep the existing working dots/failure treatment and attachments. Leave
  the specialist's task-caption trail intact; this design specifically changes the route row.
- **Navigation:** preserve `acrossOf` and the ADR 0050 addendum: a same-room or unavailable
  destination opens details, while a cross-space tap opens the other space. Give cross-space
  rows a separate, accessible Details control as well as long press; do not nest Pressables
  or create overlapping hit targets. Label/hint the action accurately. If dropping the source
  avatar is accepted, record that visual amendment to ADR 0050 before implementation.
- **Sheet:** fixed handle/header with destination name and a 44-point Close target, a bounded
  scroll body, and optional fixed utility footer. On phones, constrain panel height from
  `useWindowDimensions().height`, top safe-area inset and a breathing margin; account once
  for the existing bottom inset/padding. On wide layouts also subtract the card margins.
  Recompute on rotation/window changes. Use `minHeight: 0`/shrinkable body geometry and a real
  `ScrollView`; adding only `maxHeight`/`overflow: hidden` would leave content unreachable.
- **Content:** full path, real lane state, Requested, a short literal reply preview and
  Read full reply. Constraints/deadline/cost are optional request details. No inferred or
  AI-generated summary is required. An expanded long goal/constraints must scroll too. Hide
  empty sections and unavailable utilities; working/waiting/failed lanes may have no summary.
  Completion and delivery are separate existing fields: do not infer delivered from completed.
- **Reader:** a dedicated full-height, safe-area-aware native text surface for `lane.summary`,
  with fixed Back/title/Copy chrome and independently scrolling Markdown. Preserve selection,
  code whitespace, long filenames and existing safe link behavior. Copy uses the actual source
  summary under the same Markdown/plain-text policy as message Copy. It is not an HTML
  attachment and must not be passed through `PageView`/a WebView. Reuse existing native modal
  conventions; avoid stacking independent native modals with competing back/gesture handling.
- **State/data:** keep the lane ID as identity and read the existing snapshot so updates while
  open are reflected. Do not reset reader position on every update; Back restores the sheet's
  position and Close restores chat position/draft. Use only the generic `Lane` and attachment
  service. No Jacobian dependency, text parsing, extra protocol event or activity publisher.
- **Gestures/accessibility:** the scroll body owns content scrolling; sheet drag stays on its
  handle. Close, Android Back, VoiceOver escape and Reduce Motion remain functional. Keep
  header/footer reachable with large type, long names, short windows and a keyboard left open.
  Prefer an explicit scroll-content slot/variant in the shared Sheet if needed; audit callers
  before changing its sizing globally so menus/media/approval sheets do not regress.

## 6. Phases and acceptance

### Phase 0 — Lock the contract and complete the design states

**Work:** read the source paths in sections 2 and 7, recheck the current checkout, and write a
short ADR for Activities with the next available number. Settle the schema bounds, revision
rules, terminal/reopen behavior, freshness, fallback/anchor behavior, unread policy and source
attribution. Design the states missing from the prototype: review, blocked, failed, cancelled,
offline, empty, several activities, unknown item total and long titles. Use a generic research
or travel example alongside a build. Preserve Arjun's mocks-first instruction for these views.
Include the routing mock's quiet-strip/soft-card choice, cross-space affordance, missing-summary
state and long-request reader behavior. Existing same-room mock interaction is the baseline;
show material departures before implementing them.

**Acceptance:** the contract can represent these examples without provider-specific fields;
every user-visible state has a defined data source and no invented progress. The implementation
can proceed without relying on the conversation history. Update this plan with final choices.

### Phase 1 — Chips protocol, ingestion and public publishing hooks

**Work:** define the event/schema and ID convention, register it in the catalogue, add fixtures,
generated types/schema/reference docs, and typed SDK publishing support. Extend submission
authorization and server projection storage with the next migration. Use the existing event
log, sequence, transaction and subscription mechanisms. Support retrieving/replaying current
activities through existing read paths; add an endpoint only if the documented recovery or
history contract requires it. Publish an example and conformance cases.

**Likely files:** `packages/protocol/src/events/harness-to-chips.ts`, `events/catalogue.ts`,
`ids/`, `capabilities.ts` if negotiation needs it; `packages/sdk-ts/src/connect.ts` and exports;
`server/src/application/use-cases/submit-event.ts`, `server/src/domain/authorize.ts`,
`projection.ts`, the event-store ports/adapters, DB schema/migrations and projection writer.

**Proof:** schema limits and invalid references; another harness cannot overwrite an activity;
same-space membership and visibility; idempotent retry; conflicting/stale revision behavior;
atomic event/projection writes; server restart and replay; existing message receipt/run behavior
unchanged. A sample harness publishes queued -> working -> review -> completed with no open
run and normal chat remains usable. Test linked approvals without widening their permissions.

**Exit:** documented public hooks work with a generic producer; no harness integration required.

### Phase 2 — Shared core model, selectors and recovery

**Work:** add `Activity`/item types, an activity fold family and pure selectors. Connect stable
chat anchors, resolved attention references and history to the existing model. Export from
core. Reuse cached events and the store subscription; do not introduce a second event store.
Ensure removed membership clears inaccessible activities through the existing cache rules.

**Likely files:** `packages/core/src/model/types.ts`, `state.ts`, `fold.ts`, `index.ts`, a new
`activities.ts` fold/reader module as appropriate; `packages/core/src/store.ts`, read-state
and history paths where the new row kind requires them.

**Proof:** live events and cold replay produce the same projection; updates and fallback
message linkage in either order give one row; stale retries never roll state backward;
missing attribution/unknown totals/concurrent items work; an answered ask stops counting;
offline reopen and reconnect converge; subsequent updates do not disturb read marks.

**Exit:** all three future surfaces can read one stable projection, and mobile SQLite plus
web cache/replay remain compatible.

### Phase 3 — Mobile Activity card, header and detail screen

**Work:** introduce focused `ActivityCard`, `ActivitySymbol`, `ActivityDetail` and list
components, with a small hook over core selectors if useful. Add navigation from both the
phone header and wide-pane header. Keep selection by activity ID; retain conversation state
under the detail screen. Wire the real snapshot, linked asks and outcome references. Add
animation after state transitions and navigation work.

**Likely files:** new `apps/mobile/src/activity/` components; `app/spaces/[id].tsx`, a dedicated
Activity route, `src/spaces/RoomPane.tsx`, `SpaceView.tsx`, `Line.tsx` and `ui/Pane.tsx` as needed.
Reuse `src/store/provider.tsx`, `ui/useReduceMotion.ts`, theme/tokens and shared controls.

**Proof:** with a sample harness, update the card while its detail is open and while scrolled
away; all surfaces agree. Verify multiple activities, failed/blocked/review/offline and empty
states; header and card open the correct destination; back preserves chat position/draft;
questions use the existing answer flow. Walk iPhone and Android, a wide viewport, large text,
VoiceOver semantics and Reduce Motion. Confirm no animated loop keeps running in background.

**Exit:** the reusable component is live using generic hooks, with no hard-coded build data.

### Phase 4 — Bubbles, long-press actions and room polish

**Work:** implement the reviewed viewport-linked outgoing colors, incoming contrast, wider
long replies and compact metadata. Extend `Line` hold eligibility and `LineMenu` with the
working text utilities, reusing `Sheet`. Deliver the routing work below. Use existing SVG/
animation dependencies first; if a native dependency is necessary, follow the mobile guide's
pods/rebuild path. Keep visual changes in a separately reviewable change from protocol work.

**4A — Routing and readable handoffs:** implement the reviewed row treatment and explicit
details access, source-colored replies, bounded scrollable sheet, and full-reply reader from
section 5. Start with the
safe-area/scroll defect, then the visual changes. This subtask uses the existing lane model
and may be run independently ahead of Phases 1–3 when requested; those phases are not a
prerequisite for fixing the screenshot bug. Keep any shared Sheet sizing change narrowly
scoped and verify its other callers.

**4B — Bubble colors and message actions:** the remaining chat refinements in this phase.
Keep 4A and 4B separately reviewable and record their evidence separately.

**Likely files:** `src/spaces/Line.tsx`, `LineMenu.tsx`, `SpaceView.tsx`, `Motion.tsx`,
`LaneChain.tsx`, a focused `LaneDetails`/`LaneReplyReader` extraction if useful, `ui/Sheet.tsx`,
`ui/SheetRows.tsx`, `Markdown.tsx` only if selection requires it, `Composer.tsx` only for agreed
polish, and `ui/tokens.ts`/theme. Read `ui/Sheet.test.tsx`, existing room/lane tests and native
receipt flows before choosing regression coverage.

**Proof:** own and incoming text Copy exactly; selection handles and share work; code retains
whitespace; absent/deleted content does not expose unusable actions; feedback/receipts still
work. Native scroll proves the color effect, including recycled rows, an open keyboard,
rotation and history loading. Verify Reduce Motion, contrast in both themes, long text,
safe-area sheets and the existing follow-own/keep-position behavior. Measure scroll smoothness
with a long conversation and record the device/build; HTML mock behavior is not native proof.

**Routing proof:** reproduce with a summary at least as long as the supplied screenshot and
a much longer goal/constraint list. On iPhone and Android, reach both the first and last lines
by native scroll; header and Close/Copy remain accessible, handle drag does not steal content
scrolling, Back/Close restore sheet/chat position and draft. Check same-room details and
cross-space navigation/details separately, attachments, no summary, live summary updates,
failure, multi-hop trails, largest supported text size, rotation/short window and a wide pane.
Verify that Designer replies remain violet when forwarded into Algorithmic Beauty, match the
route avatar, retain their identity after summary folding/replay, and use a neutral fallback
when provenance is absent rather than inheriting the preceding lane's color.
Prove the universal rule with multiple source spaces in one receiving conversation and the
same source replying into two different spaces, using a generic harness fixture. Verify all
existing identity palette hues in light/dark themes; no Designer/Algorithmic Beauty special
cases or per-room color assignments are allowed in the implementation.
Record the visible native result, not only a `ScrollView` presence test. Add focused navigation
and long-content regression coverage; do not claim the bug fixed from an HTML preview alone.

**Exit:** requested chat refinements work in the installed app and do not regress navigation,
media gestures or compose behavior.

### Phase 5 — Harness-side adoption (separate repository)

**Owner:** the harness repository. This phase is a handoff to Jacobian's Chips integration,
and is not implemented by adding Jacobian code to this checkout. Chips Phases 1–4 must stand
and pass without it. Work there only when the user invokes that integration in the appropriate
workspace; do not silently edit another checkout while running the Chips phases.

**Work there:** consume Chips' published contract. Map the harness's existing workflow records
and hooks into generic activity/item states; retain durable IDs and revisions. Cover edits as
well as transitions, startup reconciliation, reconnect, terminal updates and deletion/archive
semantics. Convert source approval/question IDs to their actual Chips references through the
adapter's existing mapping; never pass source IDs off as Chips IDs. Coalesce updates away from
the workflow write path so channel failure cannot fail a workflow transition. Keep Telegram
and other channels independent. Adopt explicit fallback-message linkage to avoid duplication.

**Known source locations for that implementer only:** `src/spaces/state/workflow.ts`,
`src/channels/workflow-progress.ts`, `src/channels/types.ts`, and `src/channels/chips/` in
Jacobian. They are not imports, runtime locations, fixtures or test dependencies for Chips.

**Proof there:** adapter mapping/recovery tests, a fixture of the public protocol and a smoke
against a scratch Chips server. Review the full actual stage list and real owners/outcomes.
Only then arrange a live Algorithmic Beauty verification with any required process restarts
explicitly authorized. Never advance real work merely to demonstrate the UI.

**Exit:** the existing source workload publishes real Activity updates through public hooks.

### Phase 6 — Integrated verification and release handoff

**Work:** verify the complete user journey with the generic producer and, when Phase 5 is
available, the real integration. Repeat checks only for new changes or unresolved failures.
Run relevant protocol/server/core/mobile checks and the repository's required checks; record
commands and actual results. Regenerate protocol/architecture docs when their sources change.

**Required scenarios:** publishing and retry; cold cached launch; reconnect after missing
several updates; producer restart; completed/reopened work; unresolved/resolved input;
multiple publishers and activities; no-stage tasks; long names; role/space visibility; normal
messaging during a background activity; no duplicate rows/unread/push storms; copy/selection;
native gradient scrolling and reduced motion.
Include routing navigation and long handoff/request scrolling from Phase 4A.

**Release handoff:** list commits/changed areas, migrations and compatibility requirements,
builds walked, any missing native proof, and separately any server/harness restart or phone
rebuild still needed. Do not claim the live build uses Activities until its source adapter
actually publishes them. A generic Chips release can complete while external adoption is
pending, provided that limit is stated.

## 7. Validation and operational notes

- Protocol changes: `pnpm gen:protocol`, `pnpm check:protocol`, package tests and typechecking.
- Server/core/SDK: use the relevant Vitest suites, including submission authorization,
  projection/replay, model/store and SDK reconnect/idempotency. Add semantic tests for the
  new contract, not tests that merely copy component implementation.
- Mobile: `pnpm mobile:test` plus focused web-target e2e; `pnpm mobile:export` checks bundles.
  Native gestures/motion still need an installed iPhone simulator build and Android walk.
- `pnpm phone sim` builds and installs; inspect `apps/mobile/README.md` and the command's
  pairing/server effects first. Preserve the live simulator's pairing and avoid sending test
  events into the user's real spaces. Use a dedicated test device/workspace when possible.
- Public generated reference pages live under `apps/docs/src/content/docs/reference/events/`.
  Publish an integration guide that any harness can follow and prove it with a generic sample.
- Do not restart live services, publish packages, push commits or deploy merely to finish a
  phase's local checks. Record those as release steps when not already authorized.

## 8. Implementation, evidence and remaining release steps

- [x] Browse the app, show mocks and incorporate the universal source-color correction.
- [x] Phase 0: accepted contract and state behavior in ADR 0060.
- [x] Phase 1: protocol, atomic ingestion/projection, SDK capability check and generic producer.
- [x] Phase 2: shared fold, selectors, stable presentation, provenance and recovery tests.
- [x] Phase 3: reusable card, animated header, multi-activity browser and live detail.
- [x] Phase 4A: quiet routing row, bounded scrollable handoff and full-reply reader.
- [x] Phase 4B: universal source tint, wider replies, scroll-linked outgoing colors and text actions.
- [x] Phase 5: Jacobian's adapter publishes its workflow boards as Activities (17 September
  2026, in `~/Work/Jacobian`'s working tree — Arjun's to commit and restart; see the follow-up
  below and the operational handoff).
- [ ] Phase 6: iPhone verification and both native builds complete; Android runtime checks
  await explicit approval for the new scratch-device pairing (see operational handoff).

### 17 September 2026 follow-up: the flicker, the frame drops, and Jacobian

Arjun reported the outgoing bubbles' colour flickering as a room opened and closed and when a
bubble stood at the very top, and frames dropping while a room scrolled; and asked for the
Activity card's integration with Jacobian. [ADR 0061](../decisions/0061-the-room-moves-by-transform-and-redraws-by-difference.md)
records the cause and the rule.

- **The field is placed by transform alone** (`apps/mobile/src/spaces/scrollField.ts`,
  `ScrollColours.tsx`). Phase 4B's worklet returned the field's `height` as well as its
  transform; on the new architecture Reanimated 4 commits a shadow tree for a layout property,
  synchronously, on every scroll frame — the frame drops — and that commit raced the row's
  render — the flicker. The field is now one tall picture scaled and translated to the
  viewport; a measurement that fails for a frame keeps the last placement instead of hiding
  the field (the flash of static teal on opening, closing and at the top); measuring and
  styling are separate worklets.
- **A row is drawn again only for a difference in what it draws**: `Line` is memoised, the
  room's handlers keep one identity (`ui/useHandler.ts`), a space's lanes keep their array
  while they read the same (`spaces/sameLanes.ts`), a run is found by id, the list keeps
  fewer screens mounted, and core places an Activity's row by binary search rather than
  sorting the room (`packages/core/src/model/activity-lines.ts`).
- **Jacobian** (`src/channels/chips/activity.ts`, `bot.ts`, `cards.ts`, `client.ts`, `ids.ts`,
  `spaces.ts`; `src/channels/types.ts`, `workflow-progress.ts`, `registry.ts`; tests beside
  them): a workflow board's run is the ⚙️ status message **and** an `activity.updated` linked
  to it by `message_id` — one row on the phone, the text elsewhere — under a stable `act_` id
  and a durable revision kept in the channel's state; items are the cards, `current_item_ids`
  the running ones, `attention_refs` only the Chips approvals the card desk put the cards'
  approvals up as, the ✅ line the outcome. A revision goes only for a change in the cards, a
  burst is one revision after 1.5 s, the end goes at once, a retry repeats the same revision
  and key, a restart continues the same message and activity, and a server whose hello does
  not say `activities.v1` is left the message alone. The notifier gained the generic seam
  (`WorkflowProgressSink`, `ownerWorkflowProgress`, `resumeWorkflowProgress`); Telegram, Slack
  and Discord are untouched. Chips's own repository still imports nothing of Jacobian.

### Delivered implementation

- Protocol: `packages/protocol/src/activity.ts`, the `activity.updated` catalogue entry,
  `act_` IDs, `activities.v1` in hello, generated schemas/types/reference pages and fixture.
- Server: migration 0023 `activities`; the rebuildable current projection; transactional
  ownership, revision, message binding and reference validation in `store/activity-write.ts`.
  Exact retries retain the accepted receipt; equal conflicts/stale revisions are rejected.
- SDK: `publishActivity({ spaceId, snapshot })` on the existing socket/outbox. The model-free
  `examples/scout/activity.ts` persists before sending and demonstrates process-restart retry.
- Core: `model/activities.ts`, `activity-readers.ts`, `activity-lines.ts`, and pure Activity
  types. Full replacement clears omitted fields, first sequence anchors the card, history is
  bounded at 20 changes, real unresolved asks determine attention, revoked access clears data.
  Activity does not open a run, move the room, increment unread or create notification traffic.
- Mobile: `src/activity/` plus `app/activities/[spaceId].tsx`; wide layouts preserve the mounted
  conversation beneath Activity. Source identity comes from explicit lane/run provenance via
  `model/origin.ts` and shared `ui/sourceColours.ts`, with neutral ambiguous/unknown sources.
- Chat: `LaneDetails.tsx`, `TextReader.tsx`, bounded/full `Sheet`, quieter `LaneChain`, universal
  text long press, original-Markdown Copy, selection, native Share and message details.
  `ScrollColours.tsx` measures bubbles on the UI thread against a viewport gradient; native
  translation of a static SVG field avoids unsupported animated SVG gradient coordinates.
  Reduce Motion uses static teal. No React renders or polling timer are driven by scrolling.
- Public handoff: [Activity guide](../../apps/docs/src/content/docs/connect/activities.md),
  [SDK README](../../packages/sdk-ts/README.md), [generic producer](../../examples/scout/activity.ts).
  No production or test dependency on Jacobian was introduced.

### Checks actually run

- `pnpm test`: **204 files, 2,943 tests passed**, including coverage thresholds. Statements
  91.75%, branches 84.03%, functions 91.84%, lines 93.59%.
- `pnpm --filter @chipschat/mobile test --runInBand`: **27 suites, 307 tests passed**.
- `pnpm typecheck`: **15 tasks passed**. `pnpm lint`: dependency boundaries, generated protocol
  (148 files) and generated architecture checks passed; existing CSS warnings remain.
- Mobile Playwright: `activity.spec.ts`, `handoff.spec.ts`, `room.spec.ts` — **4 passed**.
  These cover live card/detail revisions, reload, preserved draft, long request/reply scrolling,
  fixed controls and exact return scroll offset on the web target.
- `pnpm mobile:export`: iOS and Android Hermes bundles succeeded.
- iOS Release `xcodebuild`: succeeded; installed on an isolated iPhone 17 Pro simulator,
  “Chips Activity QA”, paired only to scratch chipsd on 4448.
- Generic producer executed as three separate processes: working revision 1 accepted,
  completed revision 2 accepted, then revision 2 reported already accepted. No run opened.
- Native Activity: card/header/detail read one record; a revision published while detail was
  open updated immediately to completed, 3/3; returning to chat showed the same state.
- Native Maestro (explicitly authorized by Arjun): physical swipe changed the same outgoing
  bubble from violet-blue toward teal; long press exposed Copy/Select/Share/details; Copy
  matched the original string on the simulator clipboard; Select opened the native reader;
  Share presented the iOS system share controller. Light source-colored reply inspected.
- Native dark routing: the expanded request and 20-paragraph reply scrolled to their final
  text with Close/Back/Copy visible; Back restored the expanded handoff at its prior position.
  The native clipboard matched all 3,271 source characters, paragraphs and code indentation.
- Native Reduce Motion: enabled the actual iOS switch, confirmed its dependent Cross-Fade
  setting, and verified bubbles remained static teal through a physical swipe. Restored the
  setting afterward. Two initial automation selectors did not hit the intended native
  elements; corrected controls were verified visually rather than counting those runs.
- Outgoing contrast: 202 interpolated samples, including the 90%-white timestamp, had minimum
  contrast **4.85:1**. Source-color contrast is tested independently in both themes.
- `pnpm docs:check`: **5/5 documentation samples passed**. Final lint, typecheck, generated-file
  checks and `git diff --check` passed; RoomPane's focused tests passed after its final
  navigation-target fix. Sandbox IPC refusals were rerun with the needed local access.
- Android `app:assembleRelease -PreactNativeArchitectures=arm64-v8a`: **BUILD SUCCESSFUL**,
  647 tasks. Installed only on a newly created isolated QA emulator, not an existing device.
  Maestro launched it and verified the unpaired “Pair this phone” screen. An initial ADB
  disconnect recovered before that passing retry. No Android pairing was performed.
- Final iOS Release installed and launched on the original iPhone 17 Pro simulator with its
  pairing intact. Opened Algorithmic Beauty and its real Designer handoff/full-reply reader,
  then returned to the conversation. No messages or work commands were sent there.
- Contrast tests cover every source hue in light and dark at normal-text contrast >= 4.5.
  Protocol/server/SDK/core suites cover ownership, retry, stale/conflicting revisions, source
  restart, replay, linked fallback in both arrival orders, no duplicate card, quiet unread,
  multiple/concurrent items, resolved asks, changed/removed fields and access revocation.

### Operational handoff

The live launch agent `chat.chips.serve` on port 4431 was **not restarted**. Its schema/features
remain those of the running process. The original simulator's pairing was preserved; all
synthetic publishes, new activities, routing and long-message tests used an isolated workspace.
No changes were made in the external harness checkout, and no commits or pushes were made.

The real Algorithmic Beauty card (17 September 2026): Phase 5 is committed in Jacobian
(`17d9ce9` on its `main`, tested there with its full Vitest suite, `tsc`, `lint:vocabulary`
and `lint:one-space`), and on Arjun's word that evening the `chat.chips.serve` launch agent
on 4431 was restarted (migration 0023 applied; the hello says `activities.v1`) and Jacobian
restarted, `bin/jacobian restart --check` green. From then on the next board run in any Space's
room is a card on the phone and the ⚙️ message on the desktop; a run already going when
Jacobian restarts is continued on the same message. Neither repository is pushed. The
installed UI cannot manufacture that data; the guide and generic producer remain the API
handoff for any other harness.

Android runtime checks are paused at one access change: pairing the new `ChipsActivityQA`
emulator (`emulator-5582`, AVD under `/private/tmp/chips-activity-native/android-avds`) to scratch
chipsd on port 4448. Automatic approval review rejected that operation because it grants
device access and the earlier Maestro authorization did not explicitly cover the pairing.
An asynchronous question asks Arjun to approve this specific scratch pairing or finish with
iPhone verification. Do not work around the refusal or pair it until that answer authorizes it.

Scratch iOS device: `2BEA673E-96AA-444C-8C91-6F113429E59F` (“Chips Activity QA”). Original device:
`738F5D39-431A-41BF-A914-3B09EC8443AE`. Local fixtures, credentials and logs are under
`/private/tmp/chips-activity-native`; never copy its credentials into the repository. Public
Activity example state is `example-state.json`. The scratch server was launched in this
session only; any later restart must keep its database path and port separate from live 4431.

Native screenshots are copied under `native-proof/` in the design-material directory from
section 1: `gradient-before.png`, `gradient-after.png`, `routing-dark.png`, `reply-end.png`,
`static-before.png`, and `static-after.png`. These are simulator captures, not mocks.
Maestro flow logs are in `/private/tmp/chips-maestro-*.log`; the successful regular-motion
gradient/actions run is `2026-09-16_232112`, dark handoff run `2026-09-16_232654`, and verified
reduced-motion run `2026-09-16_233339` under `~/.maestro/tests`.

Native Android gestures and real-device haptics are not yet claimed; Android build/bundle and
shared component logic passed. Neither these results nor the installed UI imply that the live
Algorithmic Beauty harness publishes Activities. Further device stress checks (large Dynamic
Type, rotation during long sheets and sustained long-history performance) remain release QA.
