# `@chipschat/relay`

`chips-relay`: the switchboard a home server dials out to and a phone dials in to
([ADR 0038](../docs/decisions/0038-a-phone-takes-the-network-it-is-on-then-the-relay-and-nat-traversal-waits.md)).
It matches the two by the server's key and moves bytes between them. The bytes are the tunnel's
ciphertext ([ADR 0039](../docs/decisions/0039-the-tunnel-is-noise-nk-over-webcrypto-and-requests-cross-it-as-messages.md)),
and the relay cannot read them.

| Where | What |
|---|---|
| `src/switchboard.ts` | The rules, with no socket in them: a server is challenged, proves its key and is listed; a phone asks by key and is put through; sessions end from either side; the newest proof for a key wins. |
| `src/server.ts` | The `ws` around it: two doors on one port, `/v1/serve` and `/v1/connect`, `GET /health` beside them, pings, and a close for a socket that never finished its first exchange. |
| `src/push.ts` | The push door, `POST /v1/push`, with the Chips app's Expo access token: a server's pushes, checked, limited and sent on to Expo ([ADR 0246](../docs/decisions/0246-chips-sends-pushes-for-any-server-through-its-relay.md)). |
| `src/tally.ts` | Each UTC day's counts: servers listed, servers a phone reached, sessions, the most at once, bytes each way, pushes sent. Numbers, never keys. |
| `bin/chips-relay.ts` | One command: `pnpm relay` from a checkout, or `chips relay`. |

Run it: `pnpm relay`, or `chips relay`. It listens on `CHIPS_RELAY_HOST:CHIPS_RELAY_PORT`
(`127.0.0.1:4440`), holds `CHIPS_RELAY_MAX_SESSIONS_PER_SERVER` phones per server (32), and with
`CHIPS_RELAY_ALLOW_KEYS` serves only the servers it names
([ADR 0144](../docs/decisions/0144-the-hosted-relay-serves-a-list-of-servers.md)). At the end of
each UTC day it logs that day's counts, and appends them to `CHIPS_RELAY_COUNTS_FILE` as a line of
JSON when that is set
([ADR 0208](../docs/decisions/0208-the-relay-counts-each-day-and-chips-says-what-it-counts.md)). A server dials
it with `CHIPS_RELAY_URL=ws://…`; put TLS in front before the internet does, on the same machine,
since a phone's address is read from `X-Forwarded-For` only from loopback. The hosted relay's box
is [`packaging/relay/`](../packaging/relay/README.md).

## Invariants

| Invariant | Test |
|---|---|
| A server is listed only after proving it holds the key it claims; a wrong proof is refused. | `switchboard.test.ts`, "is refused with a wrong proof" |
| The newest proof for a key replaces the old listing, and the old server's phones are told. | `switchboard.test.ts`, "is replaced by a newer proof"; `server.test.ts`, "lists the newest proof" |
| A phone asking for a key nobody holds is told `no_such_server`; a full server answers `busy`. | `switchboard.test.ts`, "is told when nobody holds that key" |
| A server holds at most 16 sessions from one address, an IPv6 one by its /64; the next from there is told `busy`. | `switchboard.test.ts`, "is told the server is busy when it holds as many from that address as it may" |
| Bytes cross under the session id and nowhere else; an unknown session's bytes go nowhere. | `switchboard.test.ts`, "is put through by the server's key" |
| Every byte forwarded is ciphertext: a capture at the relay holds none of the plaintext. | `server.test.ts`, "sees nothing but ciphertext" |
| Every frame carries a version; a newer peer's frame is read by the fields this version knows. | `switchboard.test.ts`, "reads a newer peer's frame" |
| A phone's address is the socket's, or, from a proxy on loopback, the last `X-Forwarded-For` entry; an entry the phone sent is not believed. | `server.test.ts`, "does not believe an address a phone put ahead of the one a proxy appended" |
| A relay with a list lists the servers on it and refuses any other `not_allowed`, before its proof. | `switchboard.test.ts`, "is listed by a relay with a list only when its key is on it"; `server.test.ts`, "turns away a server whose key is not on its list" |
| No message over 256 KiB is taken. | `server.test.ts`, "closes a socket that sends a message bigger than any peer of the relay's would" |
| The push door sends on only a Chips push, with only a Chips push's fields; anything else is `bad_request`. | `push.test.ts`, "refuses anything that isn't a list of Chips pushes", "drops what a Chips push doesn't have" |
| One phone is pushed at most 30 times a minute (`MessageRateExceeded`), and one place sends at most 300 (`busy`). | `push.test.ts`, "pushes one phone at most PER_PHONE times a minute", "takes at most PER_PLACE pushes a minute from one place" |
| Expo refusing the relay's token is `push_unavailable` to a server, never a 401 or 403. | `push.test.ts`, "tells a server the relay can't push when Expo refuses its token" |
| A relay without the token has no push door. | `server.test.ts`, "has no push door without the app's token" |
| Past 4 MiB waiting for one end, the other end is not read until the first is down to 1 MiB; past 16 MiB the session ends `too_slow`. A server is held while any of its phones is behind. | `switchboard.test.ts`, "a peer that falls behind"; `server.test.ts`, "stops reading a server while its phone is not reading" |
| At info the log says how many, never which: a key and an address together only at debug. | `switchboard.test.ts`, "names a key and an address together only at debug"; `server.test.ts`, "logs how many servers and sessions there are at info" |
| A day's counts are numbers: distinct servers by key, but no key, session or address is written. They are written when the UTC day ends and when the relay stops, and a new day starts with whoever is still connected. A day holds at most 100,000 keys a set, and one that fills a set says `at_least`. | `tally.test.ts`; `server.test.ts`, "writes the day's counts to its file when it stops" |
| The hosted box's `cloud-init.yaml` writes the files beside it as they are, and will not start a relay whose list is the placeholder. | `box.test.ts` |
