# 0191. The LAN link is the tunnel too, to the key pinned at pairing

Date: 18 October 2026
Status: **Accepted, 18 October 2026**, on Arjun's "Accept ADR 0191 as written", with his answers
to the four open questions below: trust on first use for a typed code (no fingerprint beside it);
phones without a key migrate silently; channel binding (decision 6) in a later phase; harnesses
later. Phase 1 (the server's half) was started the same day. Drafted after the security review
(`docs/reviews/security-review.md`, "One mechanism, not six patches").
Changes ADR 0038 (decision 1, the plain LAN path) and ADR 0039 (decisions 3 and 5). Keeps ADR 0006
(the device signature is still the credential), ADR 0122/0172 (asking to join), ADR 0152 (files
stream inside the tunnel) and ADR 0164 (an invite carries the way to its server).

## Context

A phone reaches its server two ways. Away from home it opens a Noise NK tunnel through the relay
to a key it pinned at pairing: the relay sees ciphertext, the server is the one that holds the
key, and every request inside is signed by the device (ADR 0039). At home it does none of that:
it fetches `/v1/health` at the stored LAN address, and if anything answers `200` it talks plain
HTTP to whatever answered (ADR 0038, decision 1; ADR 0039, decision 5).

The security review found that the plain path is where the Wi-Fi findings come from, and that
they are one finding wearing five faces:

- **SEC-2.** The phone learned its relay and the server's key from that unauthenticated health
  answer, so whoever answered at the stored address could re-pin the key and sit in the middle of
  every remote connection after. Fixed on 17 October by refusing a key that differs from the one
  held; a first key is still taken over the plain link.
- **SEC-9.** A signed request is good for five minutes and nothing remembers it: a neighbour
  replays `POST /v1/pairing-codes` and is handed a fresh code. Room messages, attachments and a
  harness's bearer cross the Wi-Fi in the clear. Not fixed; the cheap fix is a seen-signature set.
- **SEC-21.** The tunnel's stranger cap and the plain path's limiter count differently; one path
  has two doors to keep in step.
- **SEC-8's cache finding** leaned on the same thing: a server reached over plain HTTP that claims
  a workspace id is believed.

Each has a small patch, and the review recommended the patches for this week. It also said what
the shape should be: the tunnel exists, the key is pinned, the server already answers tunnelled
requests through the same Hono app (`interfaces/relay/link.ts`), and the relay is the only thing
the LAN path lacks. The LAN link is the one place in Chips where the phone trusts an address
instead of a key.

Three facts about today's code shape the decision:

1. The server's tunnel key is made on first use, so **a server with no relay has no key**
   (`infrastructure/relay/identity.ts`), and the pairing payload, the invite link and `/v1/health`
   carry `server_key` only when a relay is configured.
2. The phone's direct link is `fetch` and `WebSocket` against the LAN address; the relay link is
   `linkOverCaller(createCaller(createChannel(tunnel, wire)))` over a Noise tunnel. Both are a
   `Link`; nothing above them knows which it got (`packages/core/src/link.ts`).
3. The server end of a tunnel is an `Answerer` whose request handler builds a `Request` for
   `app.fetch` and whose socket handler spends a ticket in the same hub as `/v1/ws`. It is wired
   only to the relay's sessions (`createRelayLink`).

## Decision

1. **The server has a tunnel key from its first start, relay or not.** `createRelayIdentity`
   makes the key when the server starts rather than when the relay first asks. `/v1/health`,
   `POST /v1/pairing-codes` (the QR), `POST /v1/invites` (the link, ADR 0164) and the Wi-Fi join
   answer (ADR 0172) carry `server_key` always; `relay` stays `null` where there is none. The key
   is still the server's, kept in the database and not exported (ADR 0039, decision 3).

2. **The server opens a tunnel door on the network: `/v1/tunnel`.** A WebSocket beside `/v1/ws`,
   on the same port. The phone is the Noise NK initiator against the key it holds, the server the
   responder with the same pair it proves to the relay, the same prologue `chips/tunnel/1`, the
   same `Answerer`, request handler and socket handler the relay link uses. What differs is the
   wire (the socket itself, no relay frames) and `from`: the socket's remote address, where the
   relay path has the relay's word. Stranger cap, body budgets, the limiter, the door: one code
   path, shared by both ways in.

3. **The phone's LAN link is a tunnel to that door.** `establishLink` tries the handshake at
   `ws://<lan>/v1/tunnel` for the time the probe gets today (1.5 s), then the relay. The handshake
   is the probe: a server at that address that cannot complete it is not this phone's server and
   gets nothing, not even a health read. `probeDirect` goes. The plain `directLink` stays for one
   thing, decision 5's first pairing with a typed code, and is otherwise unreachable from the
   transport. `relayNamedBy` keeps SEC-2's rule and runs inside the tunnel, so a relay is learnt
   only from the server that holds the pinned key.

4. **Everything a device does rides inside**, as it already does through the relay: signed
   requests, the socket with its ticket, uploads and downloads as streamed frames (ADR 0152).
   `/v1/health`, `POST /v1/pair`, the invite peek and redeem, the open join routes and the web page
   stay served plain for strangers, browsers and older builds. Nothing is removed from the plain
   port in this decision; the phone and the Mac app stop using it.

5. **How the phone comes to hold the key.** Three ways in, two of them already carry it:
   - **A QR or an invite link** carries `server_key` (decision 1): the phone pairs inside the
     tunnel from its very first request, as it does through the relay today.
   - **A typed code**, with no key yet: the phone pairs over the plain link once; the pair answer
     carries `server_key`, and the phone pins it before it does anything else. Trust on first use,
     bounded by one request under a single-use code, and the answer names the machine and the
     workspace the person is looking at. Today the same exposure lasts the life of the device.
   - **Asking to join over the Wi-Fi** (ADR 0172): the join answer carries the key; the code the
     person compares on two screens stays. Same bound as the typed code.
   A pinned key changes only by pairing again. A LAN address can move freely: the key says which
   server, the address only where.

6. **A request inside a tunnel is bound to it.** The device signature's payload (ADR 0006:
   method, target, timestamp, body digest) gains a fifth line when the request crosses a tunnel:
   the Noise handshake hash, which both ends already hold (`handshakeHash`, exposed and unused).
   The server checks it against the tunnel the request arrived on. A signature made for one
   tunnel is no good through another or on the plain port, so a replay has nowhere to go and the
   five-minute window stops mattering for anything inside a tunnel. The header says which shape
   it signed (`v=2`); the plain pairing request keeps `v=1`. This closes SEC-9 without a
   seen-signature set.

## What is left out, and why

- **Browsers on the LAN.** A browser that loads the web app from the server over `http://` got
  the page itself in the clear; a tunnel inside that page protects nothing the page's loader did
  not. That is TLS's job: the tailnet HTTPS his server already advertises (`CHIPS_PUBLIC_URL`), or
  a later TLS mode of `chips up`. The Mac app is not a browser in this sense: it bundles its own
  copy of the app (ADR 0086) and gets the tunnel from core like the phone.
- **Harnesses.** The SDK keeps signed HTTP with a bearer. On loopback, where every bridge of his
  runs, the wire is not a wire. A harness on another machine should come through the relay or a
  tailnet; a later decision may put the SDK on the tunnel too, since a join link already carries
  the key (ADR 0164's shape for `chips join`).
- **Noise IK, a device static key at the tunnel.** ADR 0039's consequence stands: the door
  authenticates by device signature, and the tunnel's job is to authenticate the server. Nothing
  here needs the phone known at the handshake.
- **TLS on the LAN instead of the tunnel.** Same pinning problem with a certificate for a key,
  plus certificate plumbing on three runtimes, ATS's view of self-signed certificates, and a
  second code path beside the relay's. The tunnel is one code path that already runs in all three.
- **The seen-signature set and the other small patches.** Right for this week if the tunnel waits;
  redundant the day decision 6 lands. The review's table says which.

## Consequences

- SEC-2 is closed in full (there is no plain link to learn a key from), SEC-9 (plaintext and
  replay) and SEC-21 (two stranger doors) with it; room contents stop crossing the Wi-Fi in the
  clear; and `Link` means one thing: a tunnel to a key.
- One more WebSocket where a `fetch` is now, and an X25519 handshake, a few milliseconds, on each
  connection. The relay path already pays this; the LAN path joins it. A tunnel is one socket per
  device, which is what the relay already holds.
- A server that never had a relay now has a key, so a backup that keeps the workspace keeps its
  phones paired (ADR 0039, decision 3), and a relay added later needs no re-pairing.
- **Phones paired before this.** A device holds the key only if its server had a relay when it
  paired or re-learnt one. A device without one, on its first connection after the update, reads
  `/v1/health` over the plain link one last time and takes the key it finds, once, as a first key
  (SEC-2's `relayVerdict` already admits a first one), then never again. Whether that first taking
  asks the person ("Chips on Arjun's Mac mini now has a key. Keep it?") or is silent is his call
  (open question 2).
- Older phone builds keep working: the plain `/v1` stays on the port; the tunnel door is additive.
  The phone's ATS exception stays as it is: a `ws://` to a LAN or tailnet address is still
  cleartext to iOS, and `NSAllowsLocalNetworking` does not cover the tailnet
  (`chips-phone-testing`, trap 5).
- Tests: the tunnel's own hold (`packages/tunnel`); the door gets the relay link's tests run
  against a socket at `/v1/tunnel`; core's `establishLink` tests swap the probe for a handshake;
  the signature tests gain the fifth line; a simulator walk against a scratch server on the LAN
  address, with the relay down, shows the room working and a capture showing ciphertext.

## Open questions, his to answer

1. **Typed-code pairing: trust on first use, or a fingerprint beside the code?** The code screen
   could show six characters of the key beside the code, for the person to compare as they
   compare the join code. Stronger, and one more thing on a screen that is meant to be one tap.
2. **Migration of phones without a key: ask, or take silently?** One sheet, once per device, or
   nothing at all.
3. **Decision 6 in the same phase, or after?** It is the piece that retires the replay window; it
   is also the only wire change the SDK and the conformance kit have to learn, since a harness
   through the relay would sign the same way.
4. **Harnesses on the tunnel, later?** Yes or never; it only decides whether `chips join` keeps the
   key it is handed.

## Rollout, if accepted

1. Server: the key at first start; `server_key` always in health, the QR, the invite link and the
   join answer; the `/v1/tunnel` door wired to the existing `Answerer`. Older phones unaffected.
2. Core, phone, Mac: `establishLink` handshakes first; `directLink` kept only for the typed-code
   pairing; the pair and join answers pin the key. Scratch-server walk on the LAN address.
3. Migration: the one-time first key for devices without one, as question 2 decides.
4. Channel binding (decision 6), with the SDK and the conformance kit, as question 3 decides.

Each phase a gate and a walk, then his word; each closes something on its own.

## Addendum, 18 October 2026: Phase 2, the phone and the Mac go through the door

Rollout step 2 is built, on the branch the lead lands: `90be1ca0` (the tunnel package's
`dialTunnelDoor`, the phone's side of the door), `da196c15` (`POST /v1/pair` answers
`server_key`, the one server change) and `fe7017cd` (core, the web app and the phone). What
landed, against decisions 3, 4 and 5:

- **`establishLink` shakes hands first.** A device holding its server's key tries
  `ws(s)://<lan>/v1/tunnel`, with `probeDirect`'s 1.5 s when a relay waits behind the door and
  the whole dial (10 s) when none does, since nothing waits; then the relay, when the device
  names one. `probeDirect` is gone. A server at the stored address that cannot complete the
  handshake is sent the handshake's first message and nothing else, not a health read. One
  `tunnelOver` serves the relay (its frames through `connectThroughRelay`) and the door (the raw
  socket). A link's kind is `direct`, `tunnel` or `relay`; the screens say "through the relay"
  only for the last.
- **The plain link is for two things.** A first pairing by a typed code, before the device holds
  a key, and a browser the server itself served, whose device names no address (the page's own
  origin is the server): ADR 0191 leaves that one to TLS. A device paired before servers had
  keys still gets it, until Phase 3 takes its first key.
- **Before the transport has chosen a link**, a device holding a key is handed a tunnel still to
  be chosen, which waits for the transport's rather than falling back to the plain link. The
  first walk found the reason: at a cold launch the first reads (the server's facts, the devices,
  the people, the icons) raced the socket's handshake by a few hundred milliseconds, and five of
  them crossed the port in the clear. A read waits as it does for a dropped connection (ADR
  0179), and asks again on the chosen link.
- **The record keeps the key beside the address**, apart from the relay (`serverKey`,
  `relayUrl`), so a server with no relay has a key all the same; a record from before, with the
  key inside its relay, is moved on read and written back with its Keychain reference as it was.
  `relayVerdict` holds a named relay against the device's own key: a relay under another key is
  refused whether or not the device had one before.
- **How the key is pinned**, per decision 5: a QR or an invite link carries it and the pairing
  goes inside the tunnel from its first request (the phone's and the web's pairing keep a key
  without a relay now); a typed code pairs on the plain link once, pins the key the answer
  carries and opens the tunnel at once, so the reads after pairing do not go the way the pairing
  did; the Wi-Fi join pins `server_key` from the join answer. A key that is not the shape of one
  is not pinned.
- **An attachment grant**, a plain URL for a native player, is refused through either tunnel: on
  the network a clip now comes through the tunnel as the relay path already brings it, rather
  than from the plain port in the clear.
- The Mac app gets all of this through core; nothing in `apps/desktop` changed.

The simulator walk (`testing/scenarios/relay/the-lan-link-through-the-door.md`) showed, through
a logging proxy on the port: a pairing by a link carrying the key with not one plain request;
a typed-code pairing with exactly one, `POST /v1/pair`, then tunnels; a message landing through
the tunnel; and a server holding another key at the stored address receiving nothing but failed
handshakes, one to four seconds apart, with the phone saying it is not connected.

Left for later phases: Phase 3, the one-time first key for a device paired before servers had
keys, silently (his answer to question 2); Phase 4, channel binding (decision 6); harnesses.
Two things to know: a pairing through the door costs one handshake more than it needs, since the
pairing's tunnel is replaced by the transport's a moment later (the relay path has always done
the same); and the web app's `e2e/join.spec.ts` J4 reaches the relay by the same rule as the
phone now, a door that does not answer.

## Addendum, 18 October 2026: Phases 3 and 4, the silent first key and channel binding

Rollout steps 3 and 4 are built, on the branch the lead lands: `db972d16` (core, Phase 3),
`721884a3` (the server's half of decision 6) and `020d7450` (core's half). What landed:

- **Phase 3, silently** (his answer to question 2). A device record holding an address and no
  key — paired before servers had keys, never through a relay — reads `/v1/health` over the
  plain link one last time on its first connection after the update, takes `relay.key` as its
  first key, keeps it with the record (`rememberReach`, through the store), and every connection
  from then on is a tunnel to it. This is the one plain read left in the transport
  (`withFirstKey`), and a device makes it once: a record holding a key is never asked. A server
  that names no key — one from before — leaves the record as it was, to be asked again on the
  next connection, and the device stays on the plain link, which is all such a server has.
  `linkFor` hands a device with an address and no key the tunnel still to be chosen too, so a
  cold launch's first reads wait for the key rather than racing it plain, as Phase 2's LD-1 did
  with the handshake. `reachNamedBy` is the one parse of health's relay line, for a key with or
  without a relay; a key that is not the shape of one is not named. The "Phase 3 ends it" notes
  Phase 2 left on the plain-link fallback are gone.
- **Phase 4, decision 6.** The signing payload gains the tunnel's Noise handshake hash as a
  fifth line when the request crosses a tunnel, said with a fourth header, `x-chips-signed: v2`
  (the four-line shape says nothing, as before; a separate header, since the existing parsing
  takes the signature as base64 of exactly sixty-four bytes). The server learns the hash of the
  tunnel each request arrived on: both tunnel peers' bindings carry `handshakeHash`, set by
  `answerTunnel` once the handshake is done, and the credential middleware hands it to the
  authenticator. The rule: a `v2` signature is good only inside the tunnel whose hash it names
  (another tunnel's, a bad signature; the plain port, `signature_not_bound`); the four-line
  shape is good on the plain port, where the CLI on loopback and a browser the server served
  sign; inside a tunnel it is tolerated this release for a phone build from before, said once
  per device in the log as SEC-22 said `?token=`, unless the device has signed `v2` before, when
  it is a captured request played back through a tunnel of the attacker's own and is refused.
  The set of devices that have signed `v2` is held in memory: a restart forgets it until the
  device's next request, milliseconds later, and the next release refuses the four-line shape
  inside a tunnel outright. On the client the `Link` names its tunnel's hash, a tunnel still to
  be chosen answering with its choice's once chosen, and `signRequest` signs for the link the
  request will go by. The phone, the web app and the Mac get it through core; the CLI signs four
  lines on loopback and is unchanged. The SDK and the conformance kit sign nothing, they carry a
  bearer, so neither changes; a harness through the relay would learn the fifth line the day
  harnesses go on the tunnel.
- SEC-9 closes (the review's table). What stands of it is what ADR 0191 left out: the tailnet
  answer on every interface, `NSAllowsArbitraryLoads`, and a harness on another LAN machine.

Tests: core's device tests sign four lines on the plain link and five inside a tunnel, checked
against the lines the server rebuilds; the transport's tests show the one plain read and then
none; the credentials, the authenticator, the relay link and the door hold a `v2` signature to
its tunnel and refuse it through a second tunnel and on the port. The simulator walk is
`testing/scenarios/relay/the-first-key-and-the-bound-signature.md`.

## Addendum, 25 October 2026: the four-line shape is refused inside a tunnel

The second security review (`docs/reviews/security-review-2026-10-25.md`) found the four-line
signature still tolerated inside a tunnel, a release after decision 6 said the next release would
refuse it. Arjun's call, 25 October: refuse it now ("we can reinstall soon"), and reinstall any
phone on a build from before 18 October. None is left: his iPhone and Natalie's are on builds
from 24 and 25 October, and the live server's log, which goes back past 18 October, holds the
warning once, for a Chips for Mac build since replaced through the door, and never for a phone.

So inside a tunnel only the five-line shape is good, held to that tunnel's hash; a four-line
signature there is `signature_not_bound`, from any device, whether it has signed five or not.
The in-memory set of devices that had signed five goes, and the warning with it. The plain port
is unchanged: the four-line shape is its shape, for the CLI on loopback and a browser the server
served, and a `v2` signature there is still refused. Nothing changes on the wire for a device on
a build since 18 October, and nothing on the phone, the web or the Mac.


## Addendum, 26 October 2026: health keeps the relay and the key from strangers (SEC-28)

The first security review's SEC-28 still stood: `GET /v1/health` handed anybody who reached the
port the relay's address and the server's tunnel key, which together are how anybody dials this
server through its relay, the first step of SEC-4, SEC-11 and SEC-12. The relay's own `/health`
said how many servers and phones it carried.

So health names `relay.url` and `relay.key` only to a request straight from the server's own
machine: the socket's peer and the host it asked for are loopback, and no proxy says it forwarded
it (`requestArrivedAt`, the rule a link for something on this machine already had). That is
`chips doctor` beside the server, Chips for Mac asking which server answers on its port (ADR
0231), and an operator reading the key for a relay's list of servers. Everybody else, inside a
tunnel too, reads `relay: { status }`: a tunnel's far end knows the key already, and the rule is
one rule. Tailscale Serve reaches the port from loopback but says who it forwarded for, so a
request through it is a stranger's.

A paired device reads the relay and the key from `GET /v1/server`, which a person signs for and
which now carries `key` beside `url` and `status`. The transport's two reads move there, signed
for the link they go by: Phase 3's one plain read for a device with no key yet, and the read each
time a socket opens, by which a device learns a relay its server gained later (ADR 0038, ADR
0144). A device with no key of its own to sign with asks nothing. Every pairing QR still carries
the key, and nothing else about pinning changes.

The relay's `/health` says `status`, `name` and `version` to anybody, which a monitor and a deploy
read, and how many servers and sessions it carries only to a request from its own box, by the same
rule: Caddy, in front of the hosted relay, says who it forwarded for and asks for the relay's name,
so the internet is told nothing more, while the operator's `curl` on the box and the suites are.

A phone or Mac on a build from before this reads health as before and is told no relay and no
key, so until it is updated it learns no new relay, and a device that never had a key gets none.
Neither touches the devices on this server: the phones are on builds from 24 and 25 October, which
took their key on 18 October or at pairing, and the iPhone, the web and the Mac update at this
go-live.

Tests: health answers a stranger, a tunnel and a forwarded request `{ status }` and a request
straight from this machine the relay and the key; `GET /v1/server` gives a person the key; the
transport's plain read is `/v1/server`, signed; the relay's `/health` counts for its own box and
not for a request a proxy forwarded.

## Addendum, 31 October 2026: the door and the relay race (ADR 0253)

Decision 3 tried the door, waited for it to answer or for 1.5 s to pass, and only then dialled the
relay. Now the door has 250 ms to itself, and the relay is dialled beside it once that has passed
or the door has failed; the first tunnel through is the link, and the other is closed having been
sent only the handshake. A door on the same network answers well inside the 250 ms, so at home the
relay is not dialled. The door is still given up on after 1.5 s, and Only direct still dials the
door alone.
