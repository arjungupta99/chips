# `@chipschat/core`

The protocol client, cache and state the web and mobile apps share
([ADR 0009](../../docs/decisions/0009-ui-react-plain-css.md)): the socket and its resume, an
offline cache, optimistic sends, read state, and the pure fold from the event log to what a
screen shows. It imports `@chipschat/protocol` and nothing else of ours, so mobile can share it
without dragging the web components along.

## What it holds

| Module | What it is |
|---|---|
| `model.ts` | The pure fold: events → spaces, runs (their steps, ticks, cost, pauses), the fleet, the Needs-you queue. The same fold runs in the web app and in mobile. A façade since M4.2 — the fold itself is `model/`. |
| `model/` | The fold, by event family (M4.2). `types.ts` and `readers.ts` are what a screen imports; `state.ts` and `lines.ts` are what the families share while folding; `spaces`, `sessions`, `messages`, `runs`, `approvals`, `policy`, `lanes` and `people` each keep the handlers for their own events; `build.ts` freezes what was folded and `fold.ts` puts the eight tables together. |
| `commands.ts` | What a slash command in the composer means: `/steer`, `/followup`, `/interrupt`, `/pause`, `/resume`, `/stop`. |
| `read-state.ts` | How far each space has been read, and therefore what is unread. Pure arithmetic over the model. |
| `pending.ts` | Optimistic messages overlaid on the model until the server confirms them. |
| `link.ts` | How a device reaches its server (M4.1): the network first, on a short timeout, then the relay — a Noise tunnel from `@chipschat/tunnel` in `fetch` and `WebSocket` clothing, so nothing above it knows which it got. |
| `events.ts` | The client's event shape, and the participant directory that names ids. |
| `transport.ts` | One socket: hello (asking for its replay in pages, ADR 0043), subscribe, resume with `since`, reconnect with backoff — at once on the browser's `online` event, and closed on `offline`. Gets a single-use ticket first (ADR 0006). Sends go through the outbox. |
| `outbox.ts` | What was sent and not yet answered. Every socket that opens sends it first; an `ack` or an `error` for the key settles it. |
| `device.ts` | The Ed25519 device key — non-extractable, in IndexedDB — pairing, and request signing over the full target, for a text body or an upload's bytes. A storage that cannot hold a `CryptoKey` keeps the private half its own way through `keepKey`/`loadKey` (the phone's Keychain, ADR 0044), and `readDevices` says how many keys could not be read just now, as a locked phone's cannot (ADR 0228); `browserStorage` is the IndexedDB one, exported so a client can name it. |
| `attachments.ts` | An upload — a slot, then the bytes, signed — and a fetch of an attachment or its thumbnail as a Blob, for an object URL. What kind a MIME type is. |
| `cache.ts` | The events and read state a workspace has seen, in IndexedDB, so an offline reload shows history; the cursor the socket resumes from, which the store moves only behind a batch that landed (ADR 0049); and the messages sent but not yet answered, so a reload does not lose them. |
| `store.ts` | Ties them together, and adds a harness through a signed POST (`addHarness`, M1.6): loads the cache, folds it, connects, reconciles optimistic sends, marks a refused one, keeps a decision or a run command busy until it is answered, remembers the receipts, sends again after a reload what the cache says was never answered, and hands a screen one snapshot per animation frame, however many events arrived in it. |

## Invariants

| Invariant | Protected by |
|---|---|
| The screen shows nothing the log does not say; events out of order fold to the same thing. | `src/model.test.ts` |
| An unknown event type changes nothing, so an old client survives a newer server. | `src/model.test.ts` |
| A cross-space reply uses explicit lane/run provenance; ambiguous or unrelated replies have no inferred source. | `src/model/origin.test.ts` |
| Every event type the fold knows has exactly one handler, in exactly one family: none lost and none claimed twice when the table is spread from eight files. | `src/model/fold.test.ts` |
| A pending approval or question is in Needs-you until it is resolved. | `src/model.test.ts` |
| Read state only ever moves forward. | `src/read-state.test.ts` |
| An optimistic line shows immediately and is dropped when its event streams back. | `src/pending.test.ts`, `src/store.test.ts`; `apps/web/e2e` |
| A send made before the socket exists, or while it is down, is neither dropped nor shown as sending for ever: it waits in the outbox, goes when a socket opens, and a message the server refuses stays on screen with the reason. A decision is busy until the server answers for it. | `src/outbox.test.ts`, `src/store.test.ts`; `apps/web/e2e`, "a message typed while the connection is down" |
| A message typed while the socket was down survives a reload: it is pending again on the next load and goes under the same key when the socket opens; one whose echo the cache already holds is not sent twice; one the server refused does not go again on its own. | `src/store.test.ts`, "an unsent message survives a reload"; `apps/web/e2e/sync.spec.ts`, "survives a reload" |
| A run's summary that repeats its last message word for word is one card, not two: the message's bubble becomes the summary card, keeping its id for feedback. | `src/model.test.ts`, "draws one card" |
| Events arriving one at a time are one flush per frame, not one per event; the cache is written once per flush, one batch at a time. | `src/store.test.ts` |
| A relaunch resumes from the cursor the store recorded behind the last batch that landed, never from the highest cached `seq`: a batch the cache lost holds the cursor back and is written again ahead of what followed, so the server sends it again; a cache from before the cursor was kept is read from the start once; a room's history read over HTTP is cached but moves no cursor (ADR 0049). | `src/store.test.ts`, "where a relaunch resumes" |
| The person who opens a space is in it before anyone is added. | `src/model.test.ts` |
| A new plan replaces the steps still to come and keeps the settled ones and the ticks in their place; a compaction leaves a tick after the last step begun; a run-scoped usage is the total and a step's adds to it; a pause holds and a resume carries on; a stop ends the run and nothing after moves it. | `src/model.test.ts`, "the run's timeline, cost and controls" |
| A steer, a pause, a resume and a stop go through the outbox and are busy until answered; a steer shows at once as the person's own line and is confirmed by its echo; a receipt is kept by the line's key. | `src/store.test.ts`, "acting on a run"; `apps/web/e2e/golden.spec.ts` |
| The golden scenario's events produce exactly the expected UI states, step by step. | `apps/web/e2e/golden.spec.ts` |
| A message's files are on its line as the server described them, before and after the server confirms it; a harness's read of a file is a line in the room and an entry in the audit; an upload is a slot then the bytes, each signed for its own target. | `src/model.test.ts`, "attachments"; `src/pending.test.ts`; `src/attachments.test.ts`; `apps/web/e2e/attachments.spec.ts` |
| An approval's countdown runs from when the harness asked; a decision folds with who, when, its scope, an edit's input and whether it was made elsewhere; a question folds with its options, its timeout and its answer; a policy change folds into the harness's level in that room, the cap and the budget; every decision is in the audit, newest first. | `src/model.test.ts`, "approvals, questions, policy and the audit" |
| The three tiers are a property of the kind: approvals and questions without a default are Decide now, finished runs and questions with a default are Review today, checkpoints are FYI. | `src/model.test.ts`; `apps/web/src/app/Shell.test.tsx`, "the three tiers" |
| Every decision attempt has a key of its own, so a retry is not the decision that won; an answer and a turn of the dial are busy until the server answers. | `src/store.test.ts`, "deciding, answering and turning the dial" |
| An edit shows in place and marked; a line taken back is a tombstone with its files, thumbs and pin gone; a pin is listed in order; a thread and its root know each other whichever arrives first, the root counts the replies still said, and a reply brings the room forward; a thread goes when the reader leaves its room; the same reaction again takes it back, and a re-delivered one counts once (M5.4). | `src/model.test.ts`, "messaging depth" and "feedback on a harness's line" |
| A queued receipt is settled by the harness's next line in the room (Phase 3 review, finding 10); a thread is opened once per line, under an id minted here. | `src/store.test.ts`, "messaging depth, from the store" |
| An approval handed on changes who may answer, says who handed it and why, and is in the audit; the store sends the refs as the request's own words, busy until answered (M5.5). | `src/model.test.ts`, "an approval handed on"; `src/store.test.ts`, "handing an approval on" |
| A room the reader is not in and only knows through an ask that named them is a glimpse: it is not among their spaces on screen, and the card says so. An ask handed to them there draws its card from the hand-on, since the request that raised it was never theirs to see (ADR 0042). | `src/model.test.ts`, "marks a room the reader only glimpses" and "draws a card from a hand-on" |
| A decision is a notice at once, through quiet hours unless nothing breaks through; Review today and FYI are one digest per tier per UTC bucket, held in quiet hours; a harness is heard in full, for its decisions, or not at all; the settings are read once and kept, saved whole, and a claim answers the keys this device may raise (M5.6). | `src/notifications.test.ts`; `src/store.test.ts`, "notification settings and claims" |
| A reload offline shows cached history; two tabs stay in sync under a burst; a fresh pairing against 500 messages shows them within seconds. | `apps/web/e2e` |

`transport.ts`, `cache.ts` and `device.ts` are the browser-bound seam — a real socket, real
IndexedDB, real WebCrypto — and are covered by the Playwright suite rather than Vitest, for the
reason the coverage config states. `apps/mobile` replaces the last two of them on the phone,
with SQLite and the Keychain, and takes everything else here unchanged. `store.ts` is tested here with a fake transport and an
in-memory cache, and the outbox the transport leans on is pure; everything else is pure and
tested here too.

## Testing

```bash
pnpm --filter @chipschat/core test
```
| What each harness has sent is folded into a connection, so a profile can light its checklist row by row. | `src/model.test.ts`, "connections" |
| The people of the workspace fold from `person.joined` and `role.changed` with their roles, and every joining, role change and harness handover is in the audit; a role change is busy until answered; a handover reads the directory again (ADR 0034, M5.2). | `src/model.test.ts`, "the people of the workspace"; `src/store.test.ts`, "people, invites, passkeys and devices" |
| An invite link joins a browser as the person the invite names, and a passkey pairs a new device with no code; the WebAuthn JSON forms are converted for the browser and back. | `src/device.test.ts`; `apps/web/e2e/people.spec.ts` |
