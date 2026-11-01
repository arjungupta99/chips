# `@chipschat/server`

`chipsd`: the event log, the gateway, and the media jobs. One Node process
([ADR 0002](../docs/decisions/0002-server-shape.md)).

The layers and the direction they may depend in are described in
[`docs/architecture.md`](../docs/architecture.md) and enforced by `dependency-cruiser`.

| Layer | What lives here today |
|---|---|
| `src/domain` | Who may append what (`authorize`), the policy engine (`evaluate`), the run state machine, the projector (what an event means for the read models), the price table, the receipt rule, and what a file is from its bytes (`sniff`). Pure — no database, no framework. |
| `src/application` | The ports — event store, fan-out, read models, clock, ids, blob store, images, uploads registry, harness registry — and the use cases: the one door for events, the long poll, the sweep for what nobody answered in time, pairing, socket tickets, uploads, adding a harness. |
| `src/infrastructure` | The SQLite adapter: connection, migrations, the event store, in-process fan-out, the uploads registry, the server's own keys. The local blob store, `sharp` for images, the signing of attachment URLs, and the tunnel key the relay knows the server by. |
| `src/interfaces` | The Hono app, its routes, the WebSocket session and the hub every session lives in, and the relay link: the server dialling out so a phone away from the network reaches the same app and the same hub through a tunnel (M4.1). |
| `src/testing` | `createTestWorkspace`: a database, a person with a paired device, a harness with a token, and a space. What `chips pair` and `chips connect` will do in Phase 1. |
| `bin/chipsd.ts` | The command line: `chipsd migrate` and `chipsd serve`. |
| `bench/` | Reproducible benchmarks. An optimization cites one. |

## The event log

`append(event)` writes the event and the projections it implies **in one transaction**. Nothing
can observe a log entry whose read models have not been updated, and nothing can observe a read
model the log does not explain. `since(workspace, seq)` is how a client resumes.
`rebuild(workspace)` drops every projection and replays through exactly the same projector, which
is what makes that claim testable rather than aspirational.

Which tables are projections and which are a registry is
[ADR 0018](../docs/decisions/0018-event-sourced-and-registry.md).

## The gateway

One port serves people, harnesses and health. HTTP is hooks mode — the "three curl lines" path, in
which a harness posts an event per lifecycle hook and blocks on
`GET /v1/approvals/:id/wait`. The WebSocket at `/v1/ws` is the same vocabulary with a stream
attached: `hello` negotiates a version, `subscribe` starts one, `since` resumes it, and every
write is answered with an `ack` carrying the sequence number it landed at.

Authentication is harness bearer tokens and device-key signatures (ADR 0006). A token is 256 bits,
stored only as a SHA-256 digest and compared in constant time. A device signs the method, the
path, a timestamp and a digest of the body, so a signature cannot be moved to another route,
replayed later, or reused with different content.

Every rule about what a frame *means* is in `interfaces/ws/session.ts`, behind a three-method
`Socket` interface, so it can be tested without opening a port. `interfaces/ws/server.ts` is the
adapter that supplies a real `ws`.

## Invariants

| Invariant | Protected by |
|---|---|
| The event and its projections are written in one transaction. | `src/infrastructure/store/event-store.test.ts`, "writes the log and the projection in one step" |
| Sequence numbers are monotonic, and per workspace. | `src/infrastructure/store/event-store.test.ts`, "append" |
| Appending the same event id or idempotency key twice changes nothing and publishes nothing. | `src/infrastructure/store/event-store.test.ts`, "idempotency" |
| `since` returns exactly the missed events, once, and pages by cursor. | `src/infrastructure/store/event-store.test.ts`, "since" |
| No query crosses a workspace boundary. | `event-store.test.ts` and `in-process-fanout.test.ts`, the "another workspace" cases |
| Rebuilding from zero reproduces the projections exactly, for any sequence of valid events. | `src/infrastructure/store/replay.test.ts` |
| Rebuilding twice changes nothing. | `src/infrastructure/store/replay.test.ts` |
| Ten thousand events append and replay in under two seconds. | `src/infrastructure/store/replay.test.ts`, and `pnpm bench:append` for the numbers |
| A run in a terminal state never moves again, whatever arrives. | `src/domain/run-state.test.ts` |
| The projector is total: every declared event type projects without throwing. | `src/domain/projection.test.ts` |
| Migrations run up and down, and up again. | `src/infrastructure/db/migrator.test.ts` |
| A token digest is compared in constant time, and matches itself and nothing else. | `src/infrastructure/auth/credentials.test.ts` |
| A device signature is bound to its method, path, body and timestamp. | `src/infrastructure/auth/credentials.test.ts` |
| An unknown credential and a revoked one are told apart in the log and never on the wire. | `src/interfaces/http/gateway.test.ts`, "authentication" |
| An event may only be sent by its own sender, into its own workspace. | `src/interfaces/http/gateway.test.ts` and `src/interfaces/ws/session.test.ts` |
| An event is accepted only from the kind of credential that sends it: a harness's token sends what a harness sends, a person's device key sends what a person sends, both send a message, and nobody sends what Chips delivers or works out for itself. A harness cannot resolve its own approval. | `src/application/use-cases/submit-event.test.ts`, every event type from both kinds; `gateway.test.ts` and `session.test.ts`, "refuses a harness resolving" |
| A device signs the full request target, path and query, so one signature stands in for no other request. | `src/infrastructure/auth/credentials.test.ts`; `gateway.test.ts`, "a different query" |
| A person opens a socket with a single-use ticket, not a durable credential in the URL. | `src/interfaces/ws/gateway.e2e.test.ts`, "a single-use ticket" and "a spent ticket" |
| A read or a subscription sees only the spaces the credential is a member of, and the workspace-wide events that belong to none. | `gateway.test.ts` and `session.test.ts`, "scoped by membership"; `src/application/visibility.test.ts` |
| An event into a space is accepted only from a member of it, whatever the transport; whoever opens a space is its first member, and sees it live. | `src/application/use-cases/submit-event.test.ts`, "into a space the sender is in"; `gateway.test.ts` and `session.test.ts`, "writing, scoped by membership"; `src/domain/projection.test.ts` |
| An event into a run names one that exists, in its own space, that the sending harness started, and that its state takes: nothing into a run that has ended, no pause of a run not running, no resume of one not paused. A hook's event that names the run and not the space lands in the run's. | `src/domain/run-state.test.ts`, "what a run takes at the door"; `src/application/use-cases/submit-event.test.ts`, "into a run that exists"; `gateway.test.ts` and `session.test.ts`, "writing to a run" |
| `from` on a steer is who sent it and their standing in the space, from the credential and the membership; a value the sender writes is replaced. | `submit-event.test.ts`, "what Chips fills in for a run"; `gateway.test.ts` |
| A `usage` with no cost gets one from the workspace's price table at ingest, recorded on the event; a model the table cannot price gets none. A run-scoped usage is the total; a step's adds to it. | `src/domain/pricing.test.ts`; `submit-event.test.ts`; `src/domain/projection.test.ts`; `gateway.test.ts`, "prices a usage" and "adds a step's usage" |
| A new plan replaces the steps still to come and keeps the settled ones in their place; a `step.log` refines a planned step without blanking its place or title. | `src/domain/projection.test.ts`; `gateway.test.ts`, "replaces the steps still to come" |
| A person's mid-run message is answered with a receipt, queued or steered, after its ack; the run's harness gets the same receipt beside the event. | `src/domain/receipt.test.ts`; `session.test.ts`, "writing to a run, over the socket" |
| A thread is a space with a parent and no members of its own: whoever is in the parent is in it, sees it live and on replay, leaves it with the parent, and nobody is added to it (ADR 0035). A message roots one thread. | `src/domain/authorize.test.ts`, "a thread"; `src/infrastructure/store/messaging-depth.test.ts`; `session.test.ts` and `gateway.test.ts`, the thread cases |
| A message is edited by its author alone and taken back by its author, the space's owner or a workspace admin; one taken back is left alone; a pin is a person's, not a guest's; a reaction goes on anyone's message and a correction only on an agent's or a harness's. The log keeps the words; the row and the search index lose them. | `authorize.test.ts`, "changing a message" and "a reaction on anyone's message"; `projection.test.ts`, "messaging depth"; `gateway.test.ts`, "messaging depth" |
| Search finds messages and receipts only in the caller's spaces, newest first by keyset cursor, follows an edit and a deletion, and answers in under 200 ms with fifty thousand messages in the room. The index is off the append path (Gate 5): a change is a queue row, folded in before a search and by the sweep; a taking back leaves the index at once; a rebuild leaves the index equal to the table. | `messaging-depth.test.ts`, "search"; `gateway.test.ts`, "searches the caller's spaces"; `migrator.test.ts`, "0012" |
| A replay is sent in pages to a client whose `hello` asked for them — one frame per store page, up to 500 events — and one frame per event to one that did not; every event goes through the same checks either way, and the cursor moves the same (ADR 0043). | `session.test.ts`, "sends the replay in pages" and "counts a page as one frame" |
| An approval is handed on only by somebody who may answer it or runs the workspace, never by a harness, never once decided, and only to somebody who can answer it — nobody, a guest of another room, or the lead for what matters is refused (Gate 5); the new names are resolved from the same refs and written on the event (ADR 0036). `role:<name>` reads the space's standing and the workspace's; `any` is the room but its guests; `lead` names the lane's lead. | `authorize.test.ts`, "handing an approval on"; `policy.test.ts`, "with a lead and the workspace's standings"; `submit-event.test.ts` and `gateway.test.ts`, "approval routing" |
| A person policy named answers from wherever they are in the workspace, and is sent the ask, the hand-on, the decision and its outcome — and nothing else of that room (ADR 0042). A person's id and `owner` reach outside the room; `any` and `role:<name>` are the room; a guest answers only in the one room they are in; an ask that names nobody is still the room's. A hand-on carries what the ask is, because whoever is handed it never saw the request. | `authorize.test.ts`, "lets a person policy named answer from wherever they are"; `submit-event.test.ts`, "who may answer" and "handing an approval on"; `visibility.test.ts`; `event-store.test.ts`, "replays the ask, the hand-on and the decision"; `apps/web/e2e/outsider.spec.ts` |
| A harness decides only an approval a person's rule handed it — the lane's lead, for an ask that does not matter — from outside the specialist's room, and is sent what names it wherever it is; a specialist's own refs never name a harness, money, deletions and external actions always reach a person (Gate 5), and a guest is never "anyone". | `authorize.test.ts`, "a lead handed an ask" and "never takes a guest for anyone"; `submit-event.test.ts`, "never lets the specialist's own refs name a harness"; `visibility.test.ts`; `gateway.test.ts`, "lets a lead answer" |
| A person's notification settings are theirs alone — read and written through `/v1/me/notifications`, by nobody else — and a banner's key is granted once, to the first device of a person to ask, and told taken to every later ask, the same device's included (ADR 0037, Gate 5). Claims older than a week are pruned by the sweep. | `src/infrastructure/store/notification-registry.test.ts`; `src/interfaces/http/routes/notifications.test.ts`; `authorization-matrix.test.ts` |
| Who may append an event is one pure function, `authorize`, asked one lookup at a time: sender, workspace, direction, key, run, membership, and first answer wins. | `src/domain/authorize.test.ts`; `src/application/use-cases/submit-event.test.ts` |
| The policy engine is a pure function, tested against every level and every flag; the workspace cap always wins; a harness's `allow` speaks only under a cap of L2 or more, and not at L0. | `src/domain/policy.test.ts` |
| Every approval request is put to policy as it arrives; an `allow` or a `deny` is an `approval.resolved` by `system` beside the request, and a retried request appends no second decision. | `submit-event.test.ts`, "policy, on an approval request"; `gateway.test.ts`, "policy at the door" |
| A decision made `always` becomes a rule in the harness's policy, as a `policy.updated`; one made for `session` decides the same kind the same way for the rest of the run. | `submit-event.test.ts`; `gateway.test.ts`; `src/domain/projection.test.ts` |
| An approval already resolved and a question already answered take no second answer; on every surface but the one that decided, the decision arrives as made elsewhere, and the log holds it once. | `src/domain/authorize.test.ts`, "first answer wins"; `session.test.ts`, "across surfaces"; `gateway.test.ts` |
| An approval nobody answers is resolved as expired by its fallback, once; a question nobody answers is answered with its default, as timed out. | `gateway.test.ts`, "the sweep" |
| A harness's policy — level, rules, budget, spend — is a projection of `policy.updated` and `usage`, per space, rebuilt with the rest; the identity stays a registry row; `hello` reports the projection. | `src/infrastructure/store/replay.test.ts`; `src/infrastructure/db/migrator.test.ts`, "the policy split"; `session.test.ts`, "the handshake" |
| An event Chips produces at delivery time is never accepted from a client. | `src/interfaces/http/gateway.test.ts` |
| Every write carries an idempotency key, and a retry changes nothing and publishes nothing. | both gateway test files |
| A hook blocked on the long poll is woken by the decision, not by its timeout. | `src/interfaces/http/gateway.test.ts`, "the approval round trip" |
| A client that resumes with `since` receives exactly the missed events, once — including events appended while the replay is still running. | `src/interfaces/ws/session.test.ts`, "resuming" |
| A consumer more than `maxUnackedFrames` behind is told to resume and dropped. | `src/interfaces/ws/session.test.ts`, "heartbeats and backpressure" |
| A silent socket is closed at the idle timeout; one that answered its ping is not. | `src/interfaces/ws/session.test.ts` |
| A client that speaks no version this server does is refused and closed. | `src/interfaces/ws/session.test.ts`, "the handshake" |

## Running it

```bash
pnpm --filter @chipschat/server test
pnpm bench:append                     # the append and replay numbers
pnpm --filter @chipschat/server run migrate
pnpm dev:server                       # chipsd serve, on 127.0.0.1:4431
```
| What a file is comes from its bytes, never from its name or from what the client said; a photo or a PDF is served inline and everything else — HTML and SVG first — as an opaque download. | `src/domain/sniff.test.ts`; `src/interfaces/http/routes/uploads.test.ts`, "an uploaded .html file" |
| A photo is straightened and stripped of its metadata, location included, unless the uploader keeps it; every raster image has a thumbnail; bytes are kept once, by digest. | `src/infrastructure/media/sharp-images.test.ts`; `src/application/use-cases/uploads.test.ts`; `src/infrastructure/blobs/local-blob-store.test.ts` |
| A device's signature covers an upload's bytes; other bytes under the same signature are refused. | `src/interfaces/http/routes/uploads.test.ts`, "binds the signature to the bytes" |
| A signed attachment URL is good for one attachment, one token, ten minutes — and nothing to anyone else; without a grant, only the uploader and the members of a space it was sent in may fetch. Every harness fetch is an `attachment.fetched` event. | `src/infrastructure/attachments/signing.test.ts`; `src/interfaces/http/routes/uploads.test.ts`, "who may fetch" |
| A message attaches only the sender's own stored uploads, by id, and Chips fills in what they are; a harness hears a person's message as `message.new`, with signed URLs. | `src/interfaces/http/routes/uploads.test.ts`, "who may fetch"; `src/interfaces/ws/session.test.ts`, "what a harness hears" |
| Add harness, Custom: a person gets the token once and Chips keeps only its digest; the harness starts at L1 with a direct space to speak in; a harness cannot add a harness. | `src/interfaces/http/routes/harnesses.test.ts` |
| A socket's frames are handled in order, so a `ping` sent after `subscribe` is answered only once the subscription is live. | `packages/sdk-ts/src/connect.test.ts`, "messages" (the SDK relies on it) |
| A person's role in the workspace is a projection of `person.joined` and `role.changed`; the oldest person is the owner; a guest opens no space, adds nobody, is in one space at most — so nobody in more than one is made a guest (Gate 5) — and is told only whom they share it with; only an owner or admin changes a role, an admin never an owner's, and the last owner stays (ADR 0034). | `src/domain/roles.test.ts`; `src/domain/authorize.test.ts`, "a person's standing in the workspace"; `src/application/use-cases/submit-event.test.ts`; `src/infrastructure/db/migrator.test.ts`, "0009" |
| An invite is a digest with a role, made by an owner or admin for a role within their reach, single-use unless said otherwise; redeeming it joins the person with that role and pairs the device that asked, and nothing wrong with the answer — a blank name included — spends the link first (Gate 5); a spent, expired or withdrawn invite is one answer on the wire; a name somebody there goes by is refused as `name_taken`, so the joiner is asked for another on the same link (ADR 0197); the door with no credential is rate limited. | `src/application/use-cases/invites.test.ts`; `src/interfaces/http/routes/invites.test.ts` |
| A passkey is verified by Chips itself — challenge, origin, relying-party id, user presence, signature, counter — for ES256, EdDSA and RS256, attestation ignored; a sign-in pairs a new device for the passkey's person; a passkey is its person's alone. | `src/infrastructure/auth/webauthn.test.ts`; `src/application/use-cases/passkeys.test.ts`; `src/interfaces/http/routes/passkeys.test.ts` |
| A withdrawn device is refused at its next request and its sockets close now; a person withdraws their own, an owner anybody's, an admin anybody's but an owner's (Gate 5). | `src/interfaces/http/routes/devices.test.ts`; `src/interfaces/ws/gateway.e2e.test.ts`, "device is withdrawn" |
| A harness is handed on by its owner or by a workspace owner or admin, to a person who is not a guest, recorded as `harness.transferred`; a guest adds none. | `src/application/use-cases/transfer-harness.test.ts`; `src/interfaces/http/routes/harnesses.test.ts`, "owner" |
| A harness is removed by its owner or by a workspace owner or admin (ADR 0078): its tokens are withdrawn and its sockets close, it is given no token, added to no room and asked for none, a token of its that survived is refused, its homes stop being homes live and on a rebuild, and its name still resolves; removing it again records nothing. | `src/application/use-cases/remove-harness.test.ts`; `src/interfaces/http/routes/harnesses.test.ts`, "DELETE /v1/harnesses/:id"; `src/domain/authorize.test.ts`, "removed" |
| A person is removed by a workspace owner or admin, never an owner by an admin and never by themselves (ADR 0160): their sockets close with 4003, their devices, passkeys, pairing codes and open invites are withdrawn, their harnesses are handed on, each room they were in says so, a code or a passkey pairs nothing for them, and a request their own key signed is told `person_removed`; their name is free, and removing them again records nothing. A socket answers to its person's role as it is now (JR-9). | `src/interfaces/http/routes/remove-person.test.ts`; `src/interfaces/ws/gateway.e2e.test.ts`, "ADR 0160" and "JR-9"; `src/application/use-cases/passkeys.test.ts`, "removed from the workspace" |
| Every HTTP route is answered for every kind of caller — owner, admin, member, guest, harness, nobody — as the matrix says, and a route cannot be added without a row. | `src/interfaces/http/authorization-matrix.test.ts` |
