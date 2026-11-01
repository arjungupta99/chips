# OpenClaw test findings, sized

27 September 2026 · Phase 7 of `docs/proposals/openclaw-test-plan.md`. **Sized, nothing built.**
Each fix waits for Arjun's word. The findings themselves are in
`docs/reviews/openclaw-test-report.md` (1 to 23).

Every cause was found in the code, and the main claims were checked again by hand. The sizes come
from reading, not building:
- **S:** under an hour, under 50 lines.
- **M:** about half a day.
- **L:** more.

"Needs" says what has to happen for Arjun to see it:
- **dist:** the desktop's bundle is rebuilt. The server reads it on every request, so 4431 does not restart.
- **phone:** his iPhone is rebuilt.
- **4431:** chipsd restarts.
- **Jacobian:** Jacobian restarts.

## The short version

The fixes fall into batches by what they cost to ship. The cheapest batch fixes most of what
Arjun saw.

| Batch | Findings | Size | Needs |
|---|---|---|---|
| **1. The two apps, no server work** | 1, 3, 6, 7, 20, 21, 2, 8 (sidebar half), 22 | eight S (7 may be M), one M (22) | dist, phone |
| **2. The CLI** | 19 | S | nothing (the CLI runs from source) |
| **3. The docs** | 12 to 17, and one line for 4 | S each | nothing |
| **4. The server** | 11, 5, 8 and 18 (last seen) | S, S, M | 4431, dist, phone |
| **5. Jacobian** | 23 (its own thread per room), and hearing another harness | S, S–M | Jacobian |
| **Not now** | 4 as a field, 5 as a new event, live presence, 10, capabilities in `hello`, 23 on Chips's side | M to L, most with an ADR | see below |

**Recommendation:** batch 1 first. It fixes what Arjun hit on screen: the scrolling page, the
stale rename, raw fences, raw previews, the hidden +, the wrong "waiting" count, the green dot,
and the missing bubble. Batch 1 costs one dist rebuild and one phone rebuild. Then batches 2 and
3, which cost nothing to ship. Then 4 and 5, one restart each.

## Batch 1: the two apps

| # | What Arjun saw | Cause | Smallest fix | Size | Phone too? |
|---|---|---|---|---|---|
| 1 | The page scrolls under a tall approval card | The card's hidden screen-reader words are `position: absolute` with no positioned ancestor, so they are placed against the whole page (`packages/ui/src/styles/base.css:77`) | `position: relative` on `.ui-card` (`packages/ui/.../card.css`), so every card holds its own. One line | S | No: the phone does not use `@chipschat/ui` |
| 3 | Rename shows the previous room's title | `<Members>` keeps its state across rooms (`apps/web/src/app/Members.tsx:182`) | `key={space.id}` on `<Members>`, which also resets a half-open Add or Archive/Delete confirm. One line | S | No rename field there |
| 6 | Steps read `tool_search_code:call_…` | The step title falls back to the step id and never to the tool (`packages/core/src/model/runs.ts:106`) | Fall back to `tool` before the id, and let a later summary replace an id-as-title. About two lines in core; both apps read it | S | Yes, same fix |
| 7 | An approval preview shows its code fence raw | The card draws Markdown as a plain paragraph (`approval.tsx:136`), and core drops the preview's `format` (`model/approvals.ts:85`) | Core keeps `format`; both apps draw Markdown with the renderer they already have, and diff, JSON and table in a monospace block. About 30 lines. A 10-line version passes a renderer into the card and leaves diffs as they are | S–M | Yes (`apps/mobile/src/needs/Decide.tsx:84`) |
| 20 | The + is easy to miss | A 14 px grey glyph, whose hover colour (`--ink-1`) is not a defined token (`apps/web/src/styles.css:1811`) | A flat gold circle like the phone's (`--gold` fill, no shadow or gradient), and the token fixed. About 8 lines of CSS. Below 640 px the sidebar is hidden with the + in it; a narrow-screen + is M, and only a browser tab can get that narrow (the desktop app's minimum width is 880) | S | The phone's is fine |
| 21 | List previews show raw Markdown | The desktop shows the last line's text as it is (`apps/web/src/app/Sidebar.tsx:342`); the phone already cleans it with core's `plainWords` | Move the phone's `lastWords` into core and use it in both. About 15 lines | S | Already right |
| 2 | "22 waiting on you" on OpenClaw's card | `buildFleet` counts every item of the old For you queue, finished runs included (`packages/core/src/model/build.ts:88`) | Count only open approvals and questions. One line in core; both apps take it | S | Yes, same fix |
| 8 (half) | OpenClaw green and *Done* while stopped; "No harnesses running" before its first run | The desktop sidebar shows a finished run as a green dot, and lists only harnesses that have run (`Sidebar.tsx:57`, `:173`). The phone already does both right (ADR 0050) | Use the phone's rules on the desktop: no dot for Done, and every harness in the workspace listed | S | Already right |
| 22 | With two harnesses working, the bubble shows only the newest | Both apps draw the bubble for `space.run`, the room's newest run (`timeline.ts:281`) | Core `spaceDoing(space)`: each harness's newest run still going, one bubble each. The header and composer keep the newest run. **This also fixes a bug found while sizing:** the desktop draws approvals and questions only from the newest run (`apps/web/src/app/SpaceView.tsx:307`), so one harness's open ask disappears from the desktop when the other starts a run. The phone gathers asks from every run | M | Yes |

Tests: each has a home beside its neighbours:
- `Shell.test.tsx` for the desktop;
- `model.test.ts` and `timeline.test.ts` in core;
- `Decide.test.tsx` and `Thinking.test.tsx` on the phone;
- one Playwright check that the page never scrolls under a card (`e2e/decisions.spec.ts`).

## Batch 2: the CLI

| # | What | Fix | Size |
|---|---|---|---|
| 19 | `chips doctor` says `harness:custom`, and `connect` says "Undo with `chips disconnect custom`" | `nameFor` returns the adapter's word while a harness is the only one of its adapter (`cli/src/connections.ts:90`). Drop that line, so its name is used. `chips disconnect OpenClaw` already works. Docs: `operate/cli.md`, `connect/custom.md` | S |

## Batch 3: the docs

The pages are what a third party writes a harness from. Nothing checks their prose, but `pnpm lint`
fails if the generated event pages drift from the schemas.

| # | Page | Fix | Size |
|---|---|---|---|
| 12 | `reference/frames`, `connect/websocket` | Show an `event` frame's shape, with its idempotency key inside `event` | S |
| 13 | Generated event pages | The generator prints any long type as "object" (`tools/protocol/generate.ts:192`). Print arrays and their allowed values; this fixes `risk` and several others at once | S |
| 14 | `reference/http` | The refusal body is documented already; add `retry_after_seconds` and link it from `connect/custom` | S |
| 15 | `reference/http` | Say that a signed attachment URL also wants the bearer token | S |
| 16 | `connect/custom`, `connect/websocket` | Say how `GET /v1/events` differs from what the socket hears, and how to rebuild `message_id` and `from` | S |
| 17 | `reference/frames`, `connect/websocket` | The server ignores the harnesses a client names in `hello`; say so, and correct the schema's description | S |
| 4 | `concepts/approval` | One sentence: This session and Always are kept by Chips itself, whatever the harness can keep (see below) | S |

## Batch 4: the server

| # | What | Smallest fix | Size | Needs |
|---|---|---|---|---|
| 11 | Usage shown on 3 of 22 OpenClaw turns | Let `usage` carry output tokens alone. `input_tokens` becomes optional, with a guard at each place that adds it up or prices it (about ten places, about 30 lines). No migration: the column is nullable already | S | 4431, dist, phone |
| 5 | An ask answered in OpenClaw stays live in Chips | Let the harness that asked settle its own ask with the events that exist. Scope forced to once, and first answer still wins. The apps already say "Approved by OpenClaw". Server only, about 30 lines | S | 4431 |
| 8, 18 | A harness that is down, or has never connected, looks fine | `last_seen_at` for each harness in the participants read model, from the token's last use (written at most once a minute today). Rooms say "OpenClaw has never connected; it won't hear this yet", and the sidebar says offline. No migration | M | 4431, dist, phone |

The bridge should also close its Chips socket while OpenClaw is down, or it still looks connected.
That is a bridge change, outside Chips.

## Batch 5: Jacobian (finding 23)

"A joint space" went to J and mixed into J's history with Arjun. Chips cannot help as it stands.
Its claim is only for rooms asked of a harness (`open-space.ts:335`), and changing that is the
"Not now" item below.

| Option | What | Size | Needs |
|---|---|---|---|
| **B (recommended now)** | Keep sending such rooms to J, but give each room its own thread in J's history, so the joint room no longer mixes into J's own conversation. About 20 lines in `conversation.ts` and the Chips adapter, and `/reset` said there needs the room too | S | Jacobian restart |
| A (later, as an act) | Jacobian opens a Space of its own for a room it is added to, named from the room's title and bound on Jacobian's side only. It is set off by the first owner message there, not by `membership.added`, which carries no title and can replay before the map is loaded. About 150 lines, 8 to 10 tests. Best offered as an explicit act (a `/space` command in the room) rather than for every group room | M | Jacobian restart |
| Hearing another harness | Jacobian drops every message from a harness, so it never heard OpenClaw's "Hey @jacobian". It would accept one that @mentions it from a harness with the same owner, capped per room against ping-pong. About 40 lines | S–M | Jacobian restart |

Nothing is committed in Jacobian without Arjun's word.

## Not now, and why

| # | What | Why not now | Size |
|---|---|---|---|
| 4 (field) | `approval.request` names the scopes a harness can keep | Chips already keeps the wider scopes itself, and verified by hand: "This session" is a rule for the rest of the run (`projection.ts:675`), and "Always" is a policy rule (`submit-event.ts:822`). A later ask of the same kind is approved by policy, and the bridge passes that on as allow-once. So Always holds. **One thing to know:** the rule matches the kind of action, so Always on `date` allows every shell command from that harness. Rerun A3 to see it, before deciding whether a field is needed | S–M |
| 5 (event) | A new `ask.withdrawn` event with its own copy ("Answered in OpenClaw") | The smallest option above gets the same result for a person | M |
| 8 (live) | A presence frame on the socket, live | `last_seen_at` answers the question with no protocol change | L |
| 10 | One connection presenting several agents (open decision 8) | A token for a set of harnesses, a migration, and every place that assumes one harness per socket. One token per agent works today | L |
| Capabilities in `hello` | A harness declares its own capabilities | It reverses ADR 0046: a harness could give itself the autonomy dial or a place on the +. `chips declare` keeps that with a person | S–M, and an ADR |
| 23 (Chips side) | A harness claims a room it was added to | Claiming makes the harness the room's opener, so it could rename and archive a room people made (ADR 0069). A room holds one key, so in a room with two harnesses the first to claim wins. Option B in Jacobian needs none of it | S–M, and an ADR |
