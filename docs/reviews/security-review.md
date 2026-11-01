# Security review of Chips

Verdict: **The foundations are sound and most of the cheap attacks are already closed. One
missing clause at the door switches the approval gate off, and the phone trusts the Wi-Fi more
than it should.**
Reviewed: Chips `main` at `ebace219`, read on 17 October 2026, on the Mac mini it runs on.
Reviewer: Fable, with six readers each on one surface (the door, what a credential reaches, the
relay and the crypto, the three clients, the machine side, and hygiene). Every finding graded
Critical to Medium was re-read or re-run by the lead before it went in.
Scope is `SECURITY.md`'s: the server, the CLI, the SDK, the relay, the web, Mac and phone apps,
and the protocol. The bridges live outside this repository and were read only through the SDK;
the relay host's own configuration on Hetzner was not read.

## Since this review

Arjun's word on 17 October was to fix the five findings the review puts first, each the
smallest change that closes the hole, each with a test that fails before and passes after,
one commit per finding. They are on main. The next pass the review names — SEC-11, SEC-6,
SEC-8, SEC-14, SEC-15, SEC-16, SEC-18, and what SEC-19 waits on — followed the same way on the
branch this note is on, one commit each, in the order below. The third pass — SEC-4 and the
Lows the review leaves to code — followed on 18 October the same way, one signed commit each,
rebased onto ADR 0191's first phase; what it leaves is said after the table. The text under
this section is the review as written, before any fix.

| Finding | State | Commit |
| --- | --- | --- |
| SEC-1 | Fixed. `policy.updated` is an owner's or an admin's at the door, as the two limit events are; the dial is read-only for everybody else on the web and the phone | `f19551ab` |
| SEC-2 | Fixed. The relay's key is pinned at pairing: a relay health names at another address under that key is followed, one under another key is refused and said as "pair again", never stored. A first relay is still taken, over the only link such a device has; why is written on `relayVerdict`. Closed in full by ADR 0191's Phase 2: a device holding a key reaches its server only through a tunnel to that key, at the door on its network or through the relay, so health is read inside a tunnel the server authenticated, and a relay under another key is refused whether or not the device had one. Only a device from before servers had keys still reads health plain, until Phase 3 | `17e1ec55`, `fe7017cd` |
| SEC-3 | Fixed. The tokenizer reads a message in one pass, each pattern's find kept until the cursor passes it; a link's words hold no bracket and an address's parentheses come in pairs. The review's inputs now take 0.1 to 2 ms where they took 32 to 213 ms; 64,000 of `[` 0.3 ms where it took 1.4 s. A room's name is read from its first message's first 4,000 characters | `1d419f2b` |
| SEC-5 | Fixed. A message's `attachments` are what its `upload_ids` name, as stored; the sender's own are dropped. End to end, a member naming another room's attachment moves nothing and still cannot fetch it | `26491703` |
| SEC-7 | Fixed. An HTML attachment is drawn under a policy of its own, core's `HTML_POLICY`, put first in the document: its own inline script runs, the pictures, fonts, sound and video written into it draw and play, and nothing leaves it — no fetch, socket, frame, script by address, or picture, font or media from elsewhere — so the scenario, a script probing the LAN and beaconing what it finds, stays closed (ADR 0059's addendum, Arjun's call on 18 October). The first cut put HTML under the Markdown page's no-script policy, which took back ADR 0059's promise that a mock's script runs and failed `media.spec.ts`. On the web, where the app is served by its server, the page's frame loads it from the server's page door, `GET /v1/pages/:ticket`, by a single-use ticket a signed `POST /v1/attachments/:id/page` mints, and the door answers the same policy as a header with the frame's sandbox in it, so the script runs there too (ADR 0201); in the Mac app the frame loads it from the shell's own scheme, `chips-page://`, which serves bytes the window fetched through its tunnel, once, under the same header (ADR 0201's addendum); wherever a browser goes through a tunnel, the view still gives the frame its document under the app's own policy, which runs no inline script. The view denies the camera and the microphone; on Android a page opens nothing outside, since its web view cannot tell a tap from a page leaving by itself. WebRTC and DNS prefetch are outside what a content policy holds | `b907c0fe`, `1a932b0f`, ADR 0201 |
| SEC-11 | Fixed. A middleware ahead of everything on `/v1/*` caps the body: a `content-length` over the limit is a 413 (`payload_too_large`) at once, and the body is counted as it streams, so a chunked one is refused at the byte it goes over. A request with no credential in its headers gets 64 KiB, a signed one `limits.maxBodyBytes` (4 MiB, `CHIPS_MAX_BODY_BYTES`), an upload the attachment limit. The socket server's `maxPayload` is the same limit; through the relay the answerer reads a request's limit off its first frame, so a stranger's body is refused before it is put together, and the gateway passes the tunnel's limits from config | `d103fd06` |
| SEC-6 | Fixed. A device's request is allowed only with its code in the body, compared server-side (`wrong_code` otherwise), and the owner's view withholds a device's code: the device shows it, the person types it, in any case and with or without the dash. The web dialog and the phone's sheet ask for it where they showed it, and Allow waits for a code. `POST /v1/join` is behind a limiter of its own: five asks a minute from one address that could not be taken, then a minute's wait | `d281d45d` |
| SEC-8 | Fixed. A pairing link naming another server than the one the phone holds comes back as an ask, shown as a sheet naming both servers; the pairing happens on Switch or never. A server found on the Wi-Fi that is not the held one asks the same way. The cache is kept under the workspace and the server's host (`cacheKey`), the workspace alone where a device has no server address and the browser keeps origins apart already | `d7f06054` |
| SEC-14 | Fixed. Every name a context file is written under is one path segment: no slash either way, no NUL, not `.` or `..`; a file only named as not shown may still be called anything. The SDK reads each settings frame by its schema before a handler sees it, and drops one that is not what it says it is | `436eed48` |
| SEC-10 | Fixed, by ADR 0195 (Arjun's "When it asks you"). Whether an action matters is one sentence in the protocol, `actionMatters`: it leaves the workspace, spends money, can't be undone, or carries a hot risk class. A harness that settles an ask that matters is refused (`not_an_approver`, it waits for a person); a person who answers one with This session or Always is refused (`invalid`, it is answered once); a smaller ask the harness answered in its own tools still stands (ADR 0079). A rule a person's answer made never allows an ask that matters, so an Always for a kind cannot later let the same kind through with money. The conformance kit's fake refuses the same. Stored approvers are not looked at: they are always resolved ids, so "approvers include a person" would have refused every self-settlement. The row's earlier "Fixed in `d103fd06`" was SEC-11's commit | `649c7904` |
| SEC-15 | Fixed. `message.new.from` and a context line's `from` carry a person's `workspace_role`, a line's `from` the room's `role` too; `promptFor` and the plain form say it after the name, "Priya (guest): …", and nothing for an agent or a harness. The room's role is not said, since a room's "owner" is whoever opened it. The conformance fake says the same of its owner | `b0d0e42d` |
| SEC-16 | Fixed, the repository's part. `*.db-wal`, `*.db-shm`, `*.p8`, `*.p12`, `*.pem`, `*.key` and `*.mobileprovision` are ignored wherever they land, and a guardrail asks `git` that they are. Arjun's part, a GitHub Support prune and the local `gc`, he left undone on 26 October: the scrubbed commits hold only dummy harness data, and the dev-mode token in them is dead | `c61654fc` |
| SEC-18 | Fixed, for what the review named. `sharp` 0.35.5 and `hono` 4.13.13 in the server; overrides hold `undici` 8.x at 8.12.2, `devalue` at 5.9.4, `brace-expansion` at 1.1.21 and 5.0.12, `decode-uri-component` at 0.5.0 (ESM only, so the phone's Jest is told to transform it). `pnpm audit`: 39 advisories to 12, the two criticals' `shell-quote` (React Native's dev tooling) and the false match on the `cli` folder among what is left. A guardrail reads the lockfile and fails on a vulnerable version of any of the seven coming back | `f2f484df` |
| SEC-19 | Left as it is, on Arjun's word, 26 October: he doesn't use GitHub Actions. `pnpm check` and the e2e suites run on the Mac before anything lands, in its place | — |
| SEC-4 | Fixed. A request that arrives through a relay's tunnel finds no dev route (a `/v1/dev/*` middleware on `c.env.relay`, 404); on the port they stay, relay or not, since the web e2e suite and the relay bench run dev mode beside a relay and seed through them (the first cut took them off the port too, and the suite failed on every `/v1/dev/*` call). A request at the tunnel door on this machine is not refused: the door is on the bound port. A release will not start in dev mode (`devModeRefusal`). The `UNAUTHENTICATED` comment says every `/v1/dev/*` route is open, not only the one it names. The relay bench and the relay recipe take their code from the operator's door (ADR 0048) | `8bb6ca01`, `0fad5940` |
| SEC-21 | Fixed. `isOpenRoute(method, path)` is the app's one answer to "does this request meet a credential check" — the `UNAUTHENTICATED` set, a join request, any dev route — and the credential middleware, the tunnel's stranger counter and its stranger body budget all use it: a request bound for an open door is a stranger's whatever headers it carries, and one bound anywhere with no credential still is. The tunnel door on the network (ADR 0191) shares the check | `ffabadd9` |
| SEC-22 | Fixed. The SDK asks `POST /v1/socket-tickets` with its bearer in a header and opens `/v1/ws?ticket=…`, single-use and spent on the upgrade; the conformance fake mints and spends tickets the same way. The server still takes `?token=` this release, for a bridge built on an older SDK, and warns each time that the next release refuses it; the docs and the socket sample say so. The repository's own test callers keep the tolerated form until then | `b3a6311c` |
| SEC-23 | Fixed. One list of names a secret travels under — token, authorization, cookie, password, secret, signature, sig, ticket, invite, pairing_code, api_key, public_key, private_key — matched on the whole field name or after a `_` or `-`, applied at every depth of a line's object by a copying walk in pino's log formatter, with the path list kept for a child logger's bindings. `code` on its own stays: it names the rule a refused request met. The line-level scrub drops a token or a ticket in a socket URL, an invite in a link, a pairing code in a `chips://pair` link and a join link's secret from its path, so the tunnel's 429 line says `/j/…`; it stops at a value's characters, so prose naming `?token=` stays whole | `23ff1e46`, `7eaf0b33` |
| SEC-24 | Fixed. A name somebody here goes by is still said, so the person can pick another, and is a failure of its own kind, `taken`, which the redeem route counts like a wrong token: five a minute from one address, then a minute's wait | `3977dde1` |
| SEC-25 | Fixed. `anyPerson()` is the oldest owner still here, the oldest person still here when no owner is, and never one with `removed_at` set | `04a0b9e9` |
| SEC-26 | Fixed. `role.changed` closes the person's sockets through the hub with a close of its own, 4005 `role_changed`, which the apps answer by opening the next socket, which opens with the new role; the socket that made the change stays open | `ac12b176` |
| SEC-27 | Fixed. The protocol's open frame carries an IP address or nothing; the relay sends nothing, not a word, when a socket has no address; the link checks with `net.isIP` and gives anything else one limiter bucket of its own, `unknown`, which is not the server's `local`; the join card shows an address or nothing. A relay URL may be `ws://` only to this machine; a relay elsewhere is `wss://` or the configuration does not load | `90b3ea9e` |
| SEC-30 | Fixed, the LAN half. `pictureSrc` keeps a picture's words, not the picture, when its host is an IP literal, `localhost` or a `.local` name, read off the parsed address so `2130706433` and `127.1` count as `127.0.0.1`; core parses for the web and the phone both. That a picture's host sees the viewer's address stands, as ADR 0068 chose it | `65dc1ff9` |
| SEC-31 | Fixed. `markdown-it`'s `validateLink` takes `http(s):`, `mailto:` and `#` and nothing else: a `chips://` link in a `.md` page is its words and no link, as are `ftp:`, a relative path and a protocol-relative address | `b0b49952` |
| SEC-32 | Fixed. `forgetDevice` deletes the device's cache with its key, under `cacheKey(device)`: IndexedDB on the web (`deleteCache`; an open connection steps aside), SQLite on the phone (`deleteSqliteCache`, closed first). The phone's three ways out — sign out, removed, joined elsewhere — go through `forgetHere`, which also clears every kept file when the device was the last one here | `331318da` |
| SEC-34 | Fixed. The CLI's keychain and the SDK's `keep` write `add-generic-password` to `security -i` on stdin, the account and the secret quoted and escaped, one line each; the tool still exits non-zero when the command inside fails. Checked on the Mac mini: a secret with a space and a quote round-trips | `e1c24af1` |
| SEC-35 | Fixed. The log file is opened 0600 | `c7ae4813` |
| SEC-38 | Fixed. `x-request-id` and `x-chips-workspace` are taken only as a short plain word, 64 characters of letters, digits, `.`, `_`, `:` and `-`; anything else is dropped and a request id minted | `df68d08f` |
| SEC-37 | Fixed. Every action in both workflows is pinned to the commit of its newest v4 release, the version beside it | `21da715b` |
| SEC-9 | Fixed, by ADR 0191's Phases 3 and 4. A device paired before servers had keys reads health plain once more, takes the key as its first, and tunnels from then on; a cold launch's reads wait for that rather than racing it, so one plain read per device, ever. Inside a tunnel a device signs a fifth line, the tunnel's Noise handshake hash, and says so with `x-chips-signed: v2`; the server holds the signature to the tunnel it arrived on, so a signature is good where it was made and nowhere else — not through a second tunnel, not on the plain port — and a captured request replays nowhere. The four-line shape stays the plain port's (the CLI on loopback, a browser the server served); inside a tunnel it is tolerated this release for an old phone build, said once per device, and refused once the device has signed five. Room contents and the bearer of a phone's socket ticket no longer cross the Wi-Fi at all (Phase 2). What stands of the finding: the tailnet answer bound to every interface and `NSAllowsArbitraryLoads` (a `ws://` to the tailnet is still cleartext to iOS, ADR 0191's consequence), and a harness on another LAN machine, which ADR 0191 leaves to the relay or a tailnet | `db972d16`, `721884a3`, `020d7450` |

SEC-16's GitHub Support ask and local prune, and SEC-19's billing, Arjun left as they are on 26
October. From the third pass, what stands: SEC-29 (Expo's token, his); SEC-12, SEC-13, SEC-17, SEC-20, SEC-28, SEC-33 and SEC-36, which
the pass did not take up; the beacon half of SEC-30, which ADR 0068 chose; and of the one
mechanism, ADR 0191's four phases are built (Phases 3 and 4 on the branch the SEC-9 row names),
with the harnesses' half left as the ADR leaves it. Found on the way: `security -i`
exits non-zero when the command inside fails (so SEC-34 loses no refusal); a fresh worktree needs
`pnpm install --frozen-lockfile --prefer-offline` before anything runs; and the phone's Jest
suite drops a test under CPU load when the server's vitest runs beside it, and passes whole
(959) on its own. Two things found on the way: on Android, `react-native-webview` grants a page the camera
and the microphone whenever the app holds the permission, with no prompt and no prop to say no
(`RNCWebChromeClient`); the deny above is iOS's, and Android needs a native patch or a library
release. And the SDK's one comment aside, nothing in the repository sends `attachments` on a
`message.post`; the lane tests did, and now seed stored uploads instead. From the second pass:
`pnpm lint` was red on main before it began, in two files the pass does not touch
(`apps/mobile/e2e/handoff.spec.ts`, a template literal, and `apps/web/src/app/LineMenu.tsx`, an
unused parameter); and the review's SEC-6 note of "no per-address limiter of its own" on
`POST /v1/join` overlooked the use case's ten asks a minute, which stands beside the new one.

## The short version

Five things to fix now, in this order. Each is a small change.

| # | What | Who can do it | Fix |
| --- | --- | --- | --- |
| 1 | Any person, a guest included, sends a workspace-wide `policy.updated` that puts any harness at L3 with `* → allow` and lifts the workspace cap. The approval gate is off | an invited guest | one clause in `refuseByWorkspaceRole` |
| 2 | An unauthenticated `GET /v1/health` answer over plain HTTP re-pins the server's relay key on the phone. Whoever answers at the stored LAN address owns the phone's remote path for good | a Wi-Fi neighbour, or whoever has the IP | never take a new key from health |
| 3 | A 64 KB Markdown message takes seconds to parse on every open, longer on a phone. The tokenizer is quadratic | anyone in a room, agents included | a single-pass tokenizer |
| 4 | A `text/html` attachment runs script in the phone's WebView with no policy; it can probe the LAN and ask for the camera | any agent or person who posts a file | the same CSP `.md` pages get |
| 5 | A message may carry its own `attachments`, which overwrite another attachment's row. With another room's attachment id, a member reads its bytes | a member | attachments from `upload_ids` only |

Then, in the next pass: a body cap before authentication (SEC-11), the code checked on Allow
(SEC-6), a confirmation before a link re-pairs the phone (SEC-8), the SDK validating what it
writes to disk (SEC-14), the author's role in the agent's prompt (SEC-15), GitHub asked to prune
the rewritten history (SEC-16), `sharp` and `hono` bumped (SEC-18), and CI turned back on
(SEC-19).

## What kind of security issue can happen in Chips

Chips brokers decisions for agents that have a shell on the owner's Mac, and lets other people
into the rooms those agents work in. That shapes who the attackers are and what they are after.

**Who.** A stranger on the same Wi-Fi, since the server speaks plain HTTP on the LAN and the
phone looks for it there first. A stranger on the internet who holds a server's public tunnel
key, which every QR, invite link and health answer gives out, since the relay lets anyone with
the key open a tunnel. An invited guest or member, who is in a room with agents and can send any
event a person may. A harness holding a token, or an agent that was talked into something by a
message in its room. A server the phone pairs with or re-learns, if it is not the owner's. The
relay operator, who sees ciphertext and control frames.

**What they want.** The approval gate: whether a destructive, external or paid action reaches a
person before it runs. The owner's identity: a device paired as them, or a pairing code. Room
contents, on the wire or from another room. The phone itself: its key, its cache, its camera.
The machine: files a harness writes, commands the CLI runs.

**Where the controls are.** The door (`authorize.ts`) decides who may append what, and the
read side (`canSee` and its SQL twin) who may read. Both are single-sourced and well tested,
and almost every route was found to go through them. The gaps below are the places where a rule
is missing from the list, where a client trusts a plain-HTTP answer, or where content from a room
reaches a renderer or a disk with more power than it needs.

## Findings, ranked

Confidence: *verified* means the lead re-read the path or re-ran the probe; *reviewer* means the
surface's reader confirmed it in code and the lead read the summary.

### Critical

*Fixed in `f19551ab`.*

**SEC-1 · A guest raises any harness's autonomy and the workspace cap** · verified
Where: `server/src/domain/authorize.ts`, `refuseByWorkspaceRole` gates `space.created`,
`membership.added`, `role.changed`, `attachment.limits_set` and `exchange.limits_set`,
and not `policy.updated`; `refuseOnMembership` returns at once for an event with no
`space_id`; the socket's `onEvent` (`interfaces/ws/session.ts`) takes any event type from a
person. The protocol says `policy.updated` is a person's to send and `changed_by` is filled in
by Chips. The projection (`domain/projection.ts`) upserts `harness_policy` for the named
harness and `workspace_policy.max_autonomy` from the event, unconditionally.
Scenario: an invited guest opens their socket and sends
`{type:"policy.updated", harness_id:<any>, policy:{autonomy:3, rules:[{match:"*", decision:"allow"}]}, workspace_max_autonomy:3, idempotency_key:"x"}`
with no `space_id`. Every harness they name now runs money, deletions and external actions
without asking anyone. The two limit events beside it are admin-gated; this one reads as an
oversight, and the tests for a workspace-wide event only try the owner.
Fix: add `policy.updated` to the `administers(sender.role)` clause, or tighter, require the
sender to own the harness or administer the workspace. Hide the dial for everybody else in the
apps (`core/store.ts` sends it). Add the guest case to `authorize.test.ts`.

### High

*Fixed in `17e1ec55`.*

**SEC-2 · A plain-HTTP health answer re-pins the server's relay key** · verified
Where: `packages/core/src/link.ts` `relayNamedBy` reads `relay.url` and `relay.key` from
`GET /v1/health` over whatever link reached it; `probeDirect` is a bare `fetch` of the
stored LAN address, and the direct link authenticates nothing. `packages/core/src/transport.ts`
`learnRelay` replaces `device.relay` whenever `sameRelay` says anything differs, key
included, and `rememberRelay` (`device.ts`) persists it beside the device key. iOS allows
arbitrary cleartext loads (`app.json`).
Scenario: the phone stores `http://192.168.1.10:4431`. On any network where that address is
somebody else's, or where a neighbour can answer for it, their health reply names their relay
and their key. From then on every remote connection is a Noise handshake against the attacker's
key: a persistent man in the middle until the phone pairs again. On that same plain link the
phone also shows whatever the stranger serves and signs requests the stranger can replay for
five minutes (SEC-9).
Fix: accept a relay URL from health only when the key matches the one pinned at pairing; a
different key is "pair again", never a silent change. Learn a first relay only over a link the
server authenticated, or behind an explicit tap. The larger mechanism, which also closes SEC-9,
is below under "One mechanism".

*Fixed in `1d419f2b`.*

**SEC-3 · A long Markdown message freezes every reader** · verified
Where: `packages/core/src/markdown.ts` `tokenize` runs every inline pattern against the whole
remainder for each token. Measured on V8: 4,000 chars of `[` take 17 ms, 20,000 take 495 ms;
the protocol allows 64,000. Hermes is slower. Bubble lines are cut at 4,000 before parsing
(`readers.ts`, `LINE_SOURCE`), but the open message and the full-reply page parse the whole
text, and a room's name is `plainWords` of its first message, uncut, on every list render.
Scenario: anyone in a room posts 64 KB of `[` or `@ab `. Every member's app stalls for seconds
each time the message is drawn; on a phone, long enough to look dead. Nobody but the author can
take it out of the shared log.
Fix: a single-pass tokenizer (remember each pattern's next match rather than searching again),
and cut what the name reader parses. Add a timing test with the hostile inputs from the probe.

### Medium

*Fixed in `8bb6ca01`.*

**SEC-4 · Dev routes are open through the relay when dev mode is on** · verified
Where: `interfaces/http/app.ts` registers `registerDevRoutes` before the authentication
middleware, so none of `/v1/dev/*` authenticates, though the `UNAUTHENTICATED` set names only
`/v1/dev/pairing-code`. `routes/dev.ts` gates on `config.devMode` and on the *bind* address
being loopback; a tunnelled request calls `app.fetch` directly (`interfaces/relay/link.ts`)
and never meets the bound socket.
Scenario: a server started with dev mode on and `CHIPS_RELAY_URL` set. Anyone with its public
key (from health, a QR or an invite) tunnels `POST /v1/dev/people {role:"owner"}`, gets a
pairing code, and is an owner. The live 4431 server runs with `CHIPS_HOST=0.0.0.0` and no dev
flag, so it is not exposed; `tools/relay-bench` and `tools/connect-kit` run exactly this shape
against a local relay. The docs' "the routes are simply not there" is false for the relay path.
Release builds honour `CHIPS_DEV_MODE` too (`cli/bin/chips.ts`).
Fix: in `registerDevRoutes`, also return when a relay is configured; in each handler refuse
`c.env.relay`; refuse dev mode in a release build. Correct the `UNAUTHENTICATED` comment.

*Fixed in `26491703`.*

**SEC-5 · A message's own `attachments` overwrite another attachment's row** · verified
Where: `use-cases/submit-event.ts` `fillBeforeValidation` starts from the sender's
`attachments` array as given and appends what `upload_ids` resolve to; only the latter are
checked for `uploaded_by`. `domain/projection.ts` `attachmentRows` upserts `attachments` by
`id` alone (`projection-writer.ts`), overwriting `space_id`, `message_id`, `filename`,
`sha256`. `routes/uploads.ts` `memberOfASpace` reads `attachmentSpaces` from that table while
`bytesOf` serves the real upload.
Scenario: a member of room A posts `attachments:[{attachment_id:<room B's id>, …}]` with no
`upload_ids`. The row now says room A; `GET /v1/attachments/<id>` hands them B's bytes. The same
write relabels a room file's versions (ADR 0099). Bounded by needing the id, which a person who
was once in B has.
Fix: drop any sender-supplied `attachments` on `message.post` and derive them from
`upload_ids` only, as the schema's own description already says Chips does.

*Fixed in `d281d45d`.*

**SEC-6 · Allowing a device join never checks the code** · verified
Where: `routes/join.ts` `POST /v1/join/:id/allow` takes `capabilities` and nothing else;
`use-cases/join.ts` `pairTheDevice` issues a code for `by.participantId` and pairs the
requester's key as that person. `POST /v1/join` is unauthenticated (LAN only, five waiting, but
no per-address limiter of its own) and `name`, `software` and `machine` are the requester's
words, which go onto the card and the push.
Scenario: a Wi-Fi neighbour asks to join as "Arjun's iPad". Owners and admins get a push. One
reflexive Allow pairs the stranger's key as that owner or admin. ADR 0122 made the six-character
code a thing to compare on two screens; the server does not require that it was.
Fix: for `kind:"device"`, require `{code}` in the allow body and compare it server-side; the
dialog asks for what the other screen shows. Put `POST /v1/join` behind the pair limiter.

*Fixed in `5360a3b3`.*

**SEC-7 · An HTML attachment runs script in the phone's WebView** · verified
Where: `apps/mobile/src/spaces/PageSheet.tsx` hands a `text/html` attachment's text straight
to `PageView` (`if (!markdown) return read.text`), while Markdown goes through
`markdownPage` with `default-src 'none'`. `PageView.tsx` has `javaScriptEnabled`,
`originWhitelist={["*"]}` and no `mediaCapturePermissionGrantType`; `page.ts` treats every
Android navigation as a tap and opens it outside.
Scenario: an agent posts `report.html`. Opened on the phone, its script fetches LAN addresses
(iOS allows cleartext), beacons what it finds, and prompts for the camera in Chips's name. The
WebView has no bridge to the device key, so this stops short of the credential.
Fix: inject the same meta CSP as `.md` pages, set `mediaCapturePermissionGrantType="deny"`,
and on Android refuse loads that are not the document itself.

*Fixed in `d7f06054`.*

**SEC-8 · A pair link re-pairs the phone silently, and the cache follows the workspace id** · verified
Where: `apps/mobile/src/pairing/usePairingLink.ts` `follow` calls `pairDevice` with the
link's `lan` and `relay` whenever the link names a different server than the one held, with
no confirmation, then `begin(device)` and `replace("/")`. `packages/core/src/cache.ts` opens
`chips-cache:<workspaceId>` and `store.ts` resends the outbox on open. "Ask to join" over
mDNS (`OnThisWifi.tsx`) likewise pairs with whichever server answered first.
Scenario: a `chips://pair?code=…&lan=http://attacker` link, tapped, pairs the phone with the
attacker's server and lands in it. A server that claims the victim's workspace id (public in
every event, in mDNS and in invite peeks) is handed the victim's unsent outbox and shows their
cached history as its own.
Fix: a confirmation sheet when a link or a discovered server names another server, as
`JoinSheet` has; key the cache by `server|workspace` or by device id.

**SEC-9 · The LAN link is plaintext: replay, bearer tokens and room contents in the clear** · verified
Where: `cli/src/reach.ts` binds `0.0.0.0` over `http://` for both the `lan` and `tailnet`
answers, so the tailnet choice is on the Wi-Fi too; no TLS listener exists (`gateway.ts`).
`infrastructure/auth/credentials.ts` `SIGNATURE_WINDOW_MS` is five minutes and nothing
remembers a signature. `POST /v1/pairing-codes` mints a fresh code on a body-less signed
POST; so do `POST /v1/invites`, a harness's new token and `POST /v1/sockets`. The SDK sends
its bearer as `?token=` on the socket (`sdk-ts/src/connect.ts`) and as a header over whatever
scheme the URL has. `app.json` allows arbitrary cleartext loads.
Scenario: a Wi-Fi neighbour records a signed `POST /v1/pairing-codes` and sends it again: a
fresh, unspent code is theirs, and a device paired with it is the owner's for good. A harness
on another LAN machine hands its token to anyone listening; so does every room message. The
relay path is sealed (ADR 0038); this is the direct path `chips up` offers first, and the one
a phone at home uses.
Fix: a bounded set of seen signatures in the authenticator for the window; bind the tailnet
answer to the tailnet address, not every interface; call `lan` unencrypted in the setup words;
`NSAllowsLocalNetworking` instead of `NSAllowsArbitraryLoads`; the SDK refuses a bearer over
plain HTTP to anything but loopback. The larger answer is "One mechanism" below.

**SEC-10 · A harness settles its own high-risk approvals** · verified, a design gap
Where: `authorize.ts` `settlesItsOwn` admits any decision by the harness on its own run;
`refuseSettling` refuses only `scope` other than `once` and `decision:"expired"`, never by
risk class or whether policy named people. Written for an ask answered in the agent's own tools
(OpenClaw finding 5).
Scenario: a harness asks to move money, policy names the owner, and the harness resolves it
itself before anyone taps. First answer wins; `resolved_by` is the harness. The audit cannot
show a person said yes.
Fix: refuse a self-settlement when the stored approval `matters()`, or when its approvers
include a person; both are loaded already in `gatherDecision`. His call whether the own-tools
case must keep working for asks that matter.

*Fixed in `649c7904`, by ADR 0195: an ask that matters waits for a person, answered once.*

**SEC-11 · Nothing caps a request body before the credential is checked** · verified
Where: `interfaces/http/app.ts` `readBody` calls `request.text()` or `arrayBuffer()` for the
whole body before `authenticate`; the open routes (`pair`, `join`, `invites`, `passkeys`) read
theirs the same way; no `content-length` check or streaming cap exists in the server, and the
message and attachment limits are applied after the bytes are in memory. `ws/server.ts` makes
its `WebSocketServer` with no `maxPayload` (the library default is 100 MiB). Through the relay,
`packages/tunnel/src/mux.ts` assembles a body whole before the handler, default 128 MiB with 64
in flight, and `gateway.ts` passes no limits.
Scenario: one multi-gigabyte POST from the LAN, or 64 large bodies through a tunnel opened
with the public key, and chipsd runs out of memory. `SECURITY.md` puts brute volume out of
scope; this is one request, not volume.
Fix: a byte cap in `readBody` with a 413, from `content-length` and while streaming; a small
budget for a tunnelled request whose headers carry no credential; `maxPayload` on the socket
server; tunnel limits from config.

*Fixed in `d103fd06`.*

**SEC-12 · Whoever holds a server's key can lock its phones out of the relay** · reviewer
Where: `relay/src/switchboard.ts`, 32 sessions per server, no per-address cap, unauthenticated
connect; a phone past 4 MiB unread pauses the server's one socket for everyone until 16 MiB. The
web bundle is fetchable through the tunnel with no credential. The relay's two doors take
unlimited unauthenticated sockets (`relay/src/server.ts`), each with a keypair and ten seconds
of state.
Fix: per-(key, address) session caps and handshake rate at the relay; refuse non-`/v1` targets
through the tunnel without a credential. Plan items R2 and R3 in `hosted-relay-plan.md`.

**SEC-13 · Passkey challenges pile up** · reviewer
Where: `routes/passkeys.ts` `assertion-options` only checks the limiter and never counts; each
call stores a five-minute challenge in an uncapped map (`use-cases/passkeys.ts`).
Fix: count the issue against the address and cap the map.

*Fixed in `436eed48`.*

**SEC-14 · The SDK writes whatever file name the server sends** · verified
Where: `packages/protocol/src/context-files.ts` `fileName` is `z.string().min(1).max(255)`,
so `../../.ssh/authorized_keys` parses. `packages/sdk-ts/src/connect.ts` parses frames with
`JSON.parse(...) as Frame` and `settings.ts` `hear` casts a `context.edit` without `safeParse`;
a bridge that does `join(agentDir, edit.name)` writes there. `parseJoinLink` takes `http:` and
the link alone picks the server. The server only ever sends names the harness listed itself,
so the gap is on the receiving side.
Scenario: a join link to a stranger's server, or a man in the middle on the plain LAN link,
sends a `context.edit` whose name climbs out of the agent's folder; the bridge, on the owner's
Mac, writes it. The SDK's outbound file rule (`sending.ts`) already models the discipline.
Fix: a single-segment pattern on `fileName` in the protocol; `safeParse` every settings frame;
the bridges resolve and contain the path before writing.

*Fixed in `b0d0e42d`.*

**SEC-15 · The author's role never reaches the model** · verified, a design gap
Where: `interfaces/ws/session.ts` `senderOf` puts `from.display_name` and the room role on
`message.new` (never the workspace role); `packages/sdk-ts/src/prompt.ts` `promptFor` renders
`display_name:` only; `protocol/context.ts` context lines carry no role at all. The policy
engine judges only the `action.proposed` a harness emits.
Scenario: a guest writes "delete the old branches and force-push". To the agent it reads
exactly as the owner's words would. Spoofing the author is closed server-side (`wrong_actor`),
approvers default to the owner and `any` excludes guests, so the gate still catches an action
that matters; but the model has no way to weigh who asked, and an agent at L2 or L3 acts on a
guest's say-so for anything the policy lets through.
Fix: render the role in `promptFor` ("Priya (guest):"), add `role` and `workspace_role` to
`ContextLine.from` and `message.new.from`, and let a bridge's room note say what guests may ask.

*Fixed in `c61654fc`, the repository's part; the GitHub Support ask and the local prune are Arjun's.*

**SEC-16 · The scrubbed history is still on GitHub, and the repo publishes its ids** · verified
Where: `docs/history-rewrite-2026-09-13.txt` lists the old→new ids; `gh api …/commits/5e00120a927e`
answers 200 with the pre-rewrite commit, whose tree holds `.chips.bak-20260904-2019/` with
`demo.json` (a 52-character harness token and a pairing code for 127.0.0.1:4431) and five
attachments. Locally, 382 unreachable commits still carry it. The token's digest is not in the
live database on 4431 (checked: 31 tokens, 7 live, none matching), so the credential is dead
and the repo is private.
Fix: ask GitHub Support to prune the repository after the rewrite and check the old ids 404;
`git reflog expire --expire=now --all && git gc --prune=now` in the main checkout; keep only the
new ids in the map. Add `*.db-wal`, `*.db-shm`, `*.p8`, `*.p12`, `*.pem`, `*.key`,
`*.mobileprovision` to `.gitignore` beside `.chips/`.

**SEC-17 · One throw past validation takes the server down** · reviewer, suspected
Where: `ws/server.ts` `ws.on("message", (data) => session.receive(...))` drops the promise;
`session.ts` guards `JSON.parse` and the schema, and nothing past them; no `unhandledRejection`
or `uncaughtException` handler in chipsd or the relay. launchd restarts it, so a crash is a
restart loop rather than an outage.
Fix: `.catch` on `receive` that fails the session; a process-level handler that logs.

*Fixed in `f2f484df`.*

**SEC-18 · Dependency advisories: 43, of which `sharp` and `hono` are in the server** · reviewer
Where: `pnpm audit` reports 2 critical, 18 high, 18 moderate, 5 low. Runtime: `sharp 0.35.4`
(high, librsvg; exposure low since `uploads.ts` sniffs and only raster images reach sharp) and
`hono 4.13.5` (moderate, `hono/jsx`, unused). The two criticals are the example and
React Native dev tooling. `decode-uri-component 0.2.2` via expo-router is in the phone bundle.
The "cli 0.0.0" advisory is a false match on the workspace folder name.
Fix: `pnpm up sharp hono`; overrides for `undici`, `devalue`, `brace-expansion`,
`decode-uri-component`; bump `@anthropic-ai/claude-agent-sdk` in `examples/scout`.

*Blocked on billing, which is Arjun's; nothing in the repository turns it back on.*

**SEC-19 · The CI gate has been off since 10 October** · reviewer
Where: the latest run says the job was not started because account payments failed; 388
commits have landed on `origin/main` since without lint, typecheck, test, e2e or conformance.
The workflow itself is sound (`pull_request`, `contents: read`, frozen lockfile, Apple secrets
only in the desktop job).
Fix: restore billing, or a self-hosted runner for the Linux jobs.

**SEC-20 · The bundled Node is behind** · reviewer
Where: `.node-version` and the release tarball pin 22.22.2; the reviewer found two later
security releases on nodejs.org, current 22.23.3. The hosted relay runs it on the internet.
Fix: bump, rebuild, redeploy the relay.

### Low

*Of these, SEC-21 to SEC-27, SEC-30 to SEC-32, SEC-34, SEC-35, SEC-37 and SEC-38 are fixed; the
table above names each commit.*

- **SEC-21 · The tunnel's stranger cap keys off headers, not the route** · verified.
  `link.ts` `isUnauthenticated` is "no `authorization` and no `x-chips-device`"; a bogus
  `x-chips-device` on `/v1/pair` or an invite route is not counted. The per-route limiter by
  address still stands behind it. Classify by path with the app's own `UNAUTHENTICATED` set.
- **SEC-22 · A harness token is accepted in the socket URL** (`ws/server.ts`, `?token=`), a
  durable credential in proxy logs; the log scrubber removes `sig=` only. Harnesses already have
  socket tickets. Drop `?token=`, and have the SDK stop sending it.
- **SEC-23 · Redaction is one level deep**, and `ticket`, `code`, `invite`, `pairing_code`,
  `api_key` and `public_key` are not on the list; the tunnel logs a raw `target` on 429, which
  for `GET /j/<secret>` is the join secret. ADR 0006's "at every depth" is not what pino does.
  No current call site logs such an object. Add paths, widen the regex, cut `/j/…`.
- **SEC-24 · Invite redeem tells names apart before spending the link** ("somebody here goes by
  X already") and the route does not count that answer: a link holder enumerates people and agent
  names. Count it, or answer neutrally.
- **SEC-25 · `anyPerson()` ignores `removed_at`**: if a second owner removes the first, the
  operator pairing code and device joins issue codes that `pairDevice` then refuses, and the
  machine's own door is silently shut. Prefer the oldest live owner.
- **SEC-26 · A socket's role is a snapshot**; nothing closes a person's sockets on `role.changed`,
  so presence and the directory read with the old standing until reconnect.
- **SEC-27 · The server takes the relay's `from` on faith** (any 64 chars), uses it as the
  limiter bucket and shows it to people on a join card; validate with `net.isIP`. The server never
  authenticates the relay and accepts `ws://` for a remote one.
- **SEC-28 · `/v1/health` hands strangers the relay URL and key**, which is the first step of
  SEC-4, SEC-11 and SEC-12; the relay's own `/health` is public with counts and version.
- **SEC-29 · The Expo access token is optional** (`push/expo.ts`); a leaked Expo token puts
  arbitrary words on the lock screen as Chips. Turn on Expo's enhanced security and set the token.
- **SEC-30 · Pictures in messages make every reader fetch any `http(s)` URL**: a per-reader
  beacon, and a GET to a LAN device. Tap-to-load off-server pictures, or refuse IP-literal hosts.
- **SEC-31 · `.md` pages keep `chips://` links live** (`markdownPage.ts` only `_blank`s http and
  mailto); the phone refuses them, the Mac and web hand them to the OS.
- **SEC-32 · Sign-out never deletes the IndexedDB or SQLite cache or kept files**: a shared
  browser keeps the history.
- **SEC-33 · Names are only length-checked**: homoglyphs, zero-width and bidi characters pass,
  and an agent may be named "Main" or "You"; the Main pill itself is server-flagged. An agent and a
  person may share a name, so `@Name` is ambiguous.
- **SEC-34 · Secrets ride on `security … -w <secret>` argv** (`cli/src/keychain.ts`,
  `sdk-ts/src/keep.ts`): a same-user `ps` window. Use `security -i` with stdin.
- **SEC-35 · The server log is 0644** by pino's default (`platform/src/logging/logger.ts`);
  matters on Linux under `~/.local/state/chips`. Set `mode: 0o600`.
- **SEC-36 · Install and release integrity rests on one origin's TLS**: `install.sh` takes sums
  from the same host, `--from` without sums installs after a warning, natives are installed
  unpinned at build. Gallery commands are only copied to the clipboard, never run. A detached
  signature beside `SHA256SUMS`, and a lockfile for the natives.
- **SEC-37 · GitHub Actions pinned by tag, not SHA**, in jobs that hold Apple secrets.
- **SEC-38 · `x-request-id` and `x-chips-workspace` go into every log line unbounded**; JSON
  escaping stops line injection, so this is bloat and forgery, not injection.

### Info

- Sealed push is sound: AES-256-GCM, fresh nonce, key validated, keychain after first unlock;
  every push payload carries fixed words and ids only (ADR 0045 holds). Suggest `message_id` as
  AAD.
- Noise NK matches the spec; `handshakeHash` is exposed and unused. Mixing it into the signed
  payload would bind a request to its channel and end cross-channel replay.
- `@chipschat/subtle` is a careful shim over pinned noble; low-order points are rejected
  (verified by probe); `Math.random` appears only in UI name and dust code.
- The server identity key is plaintext PKCS#8 in SQLite with no rotation path; the public half is
  on `/v1/health` by design.
- Media processing is contained: no shell anywhere, no user strings in argv, ffmpeg and whisper
  with `-protocol_whitelist file`, `-nostdin`, fixed names in a temp dir, size and time budgets,
  SIGKILL; playlists never reach ffmpeg. Sharp runs in-process with its default pixel limit.
- mDNS advertises the computer name and the workspace ULID; nothing from it is trusted beyond
  display, except that a phone pairs with the first server to answer (SEC-8).
- Web headers: CSP without inline script, `frame-ancestors 'none'`, nosniff are set; Referrer-
  Policy, Permissions-Policy and COOP are not.
- The phone's device key is generated extractable and returned extractable for the session; the
  web's is a non-extractable CryptoKey. The Tauri surface is minimal: bundled frontend, one
  validated command, no devtools, no global Tauri.
- WebAuthn: the relying-party id is the client's origin, allow-listed; user verification is only
  "preferred".
- The `@chipschat` npm scope has nothing published yet; all internal dependencies are
  `workspace:`, so there is no confusion path, but the scope is squattable until claimed.
- Not checked: `cargo audit` (not installed; the crates in `Cargo.lock` look current).

## What is done well

- One append rule (`authorize.ts`), asked again inside the store's transaction; one read rule
  (`canSee`) with its SQL twin; cursors and `?space_id=` can only narrow; FTS terms quoted.
- Device signatures over method, path, query and body digest; Ed25519 SPKI; constant-time
  compares; one `401` for unknown and revoked; no cookies and CORS only for the desktop origin,
  so no CSRF or cross-site WebSocket hijack.
- Pairing codes with 30 bits, unbiased, single-use even on failure, behind a limiter that trusts
  `x-forwarded-for` only from loopback; invites and join secrets 256 and 192 bits, kept as
  digests, spent in one SQL statement; owner-only minting; the decider re-checked at redeem;
  device joins refused through the relay.
- Idempotency keys are the sender's own (unique on actor), so nobody steals another's.
- Attachments sniffed from bytes; anything not media served as `attachment` with nosniff and
  `Content-Security-Policy: sandbox`; blob paths id-validated; signed URLs bound to token or
  device, with the room checked again on every read.
- Markdown is an AST with no HTML sink; `safeHref` degrades `javascript:`, `data:`, `file:`,
  `chips:` and protocol-relative links to text (verified by probe).
- Noise NK faithful to the spec with property tests for tamper, replay and reorder; the relay's
  key proof stops squatting; flow control is byte-bounded; the large-file path stays end to end;
  the relay's systemd unit is sandboxed behind Caddy with no access log.
- Ownership-gated harness operations (tokens, transfer, remove, restart, context files, model,
  heartbeat); rank rules for devices and roles; the last owner protected; per-person settings
  scoped to `me`; the server stamps actor, time, workspace and decider itself.
- Everything secret at rest is owner-only: data dir 0700, database, operator token, device keys,
  keychain fallback and blobs 0600; the error envelope never leaks internals; a frozen lockfile,
  three allowed build scripts, no git or tarball dependencies, the release Node checked against
  nodejs.org's sums.

## One mechanism, not six patches

SEC-2, SEC-9, SEC-21, the plaintext room contents on the Wi-Fi, and the five-minute replay
window all come from one fact: the direct link on the LAN is plain HTTP that authenticates
nothing, while the remote link is a Noise tunnel to a key the phone pinned at pairing. The
tunnel exists, the key is pinned, and the server already answers tunnelled requests through
`app.fetch`. Running the direct link through the same tunnel, to the same pinned key, over the
LAN, would close all five with code that is already there, and make the relay path and the LAN
path one path to reason about. The cost is a WebSocket handshake where a fetch is now, and the
question of how a server with no relay publishes its key (the QR already carries it).

The small patches above are right for this week. This is the shape to aim at. Drafted as
[ADR 0191](../decisions/0191-the-lan-link-is-the-tunnel-too-to-the-key-pinned-at-pairing.md), proposed
18 October 2026, with four open questions for Arjun.

## What this review did not do

- Run a hostile client against a live server; every finding here is from reading and from
  probes against the pure functions, the parser and the crypto.
- Read the bridges (`~/Work/chips-openclaw` and the others), Jacobian, or the relay host.
- Test the Android build, or the Mac app beyond its configuration.
