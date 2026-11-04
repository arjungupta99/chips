---
title: The relay
description: A phone away from home reaches your server through a switchboard that forwards ciphertext and reads none of it. Run one in one command.
---

On the network your server is on, a phone reaches it directly, and nothing here is involved:
the QR `chips serve` prints carries the server's address on that network, and pairing and
everything after it go straight to it. Away from that network nothing works at all — a home
router does not accept a connection nobody asked for, and a phone on cellular is behind the
carrier's NAT as well. Neither end can be dialled. So both dial *out*, to a relay, which holds
the two connections together and forwards bytes it cannot read
([ADR 0038](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0038-a-phone-takes-the-network-it-is-on-then-the-relay-and-nat-traversal-waits.md)).

A phone holding both addresses tries the network first, on a short timeout, and falls back to
the relay on its own. It never asks which network you are on, and there is no setting for it.

Run your own with the one command below, or use the one Chips hosts at `relay.chipschat.ai`,
which is free and has [terms of its own](/operate/relay-terms/). It serves any server that proves
its key.

## The Chips relay

Every server has the Chips relay behind its owner's switch, off until an owner turns it on
([ADR 0245](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0245-every-server-has-the-chips-relay-behind-its-switch.md)).
Turning it on sends the relay your server's key and address, so it waits for you to choose:

- **In the app:** You → Relay on the Mac and the web, You → Workspace → Relay on the phone. The
  setup card's **Away from home** takes you there.
- **From the terminal:** `chips up --reach relay`, or pick *Your devices, anywhere, through the
  Chips relay* when `chips up` asks who can reach Chips. It is the first answer on a machine with
  no tailnet. Chips stays reachable directly on your Wi-Fi as well, so a phone at home doesn't go
  the long way round.

A server you give a relay of your own, with `CHIPS_RELAY_URL`, has that one behind the switch
instead, and on until you turn it off.

## Notifications through the Chips relay

The Chips relay also sends notifications to the Chips app for servers that can't send them
themselves ([ADR 0246](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0246-chips-sends-pushes-for-any-server-through-its-relay.md)). Expo, which delivers them, takes the app's notifications only with
its project's access token, and the relay has it. A server without the token posts its
notifications to `https://relay.chipschat.ai/v1/push`, whether or not its relay switch is on, and
the relay passes them on to Expo. This opens no way into your server, so there's no switch for it.

The relay takes only a Chips notification: to an Expo push token, with a Chips notification's
fields, at most 4 KiB. It sends one phone at most thirty a minute, and takes at most three hundred
a minute from one address. It logs no token, sentence or id, and counts how many it sent each day.
A server with the token, `CHIPS_PUSH_ACCESS_TOKEN`, posts to Expo itself, and `CHIPS_PUSH_URL`
sends them anywhere else.

The relay's `GET /health` says what became of the last notifications it passed on, as `pushes`:
`ready`, `refused` when Expo turned down its token, `failing` when Expo didn't answer or didn't
take them, or `no_access_token` when the relay has no push door. It changes only when Expo
answers, so a relay nobody has pushed through yet says `ready`.

## Run one

```sh
CHIPS_RELAY_HOST=0.0.0.0 pnpm chips relay
```

That is the whole relay: one port, two doors — `/v1/serve` for a server dialling out, `/v1/connect`
for a phone dialling in — and `GET /health` beside them. It also serves the page an invite link
opens at, `/join`, since a server with a relay sends its invites as that page's link: the relay is
on the internet where the server may not be, and the invite stays in the link's fragment, which
never reaches the relay. The same goes for `/pair`, the page a pairing link opens at: **Pair a
computer** on a phone sends one, and so does **Copy link** under a code in You → Devices. On a
computer it shows the code and offers **Open in Chips**, which pairs Chips for Mac through the
relay when the server's network is out of reach, or **Pair in this browser** on the server's
network. It says when the code has run out. Beside it is the file that lets the iPhone app open those links itself
(`/.well-known/apple-app-site-association`). Update a relay along with its servers, so the page is
there for their links. `CHIPS_RELAY_HOST` and
`CHIPS_RELAY_PORT` say where it listens (`127.0.0.1`, `4440`);
`CHIPS_RELAY_MAX_SESSIONS_PER_SERVER` how many phones it holds open for one server (32). Put TLS
in front of it before the internet does — a Caddy line is enough — so the control frames, which
name keys and addresses, cross under `wss://`. The tunnel inside is ciphertext either way.

A relay on the internet serves any server that proves its key, unless you give it a list.
`CHIPS_RELAY_ALLOW_KEYS` names the servers it serves by their relay keys, comma-separated, and it
turns any other away with `not_allowed`:

```sh
CHIPS_RELAY_ALLOW_KEYS=<your server's relay key> pnpm chips relay
```

A server's relay key is `relay.key` in its `GET /v1/health` once it has `CHIPS_RELAY_URL`, asked
on the server's own machine (`curl -s http://127.0.0.1:4431/v1/health`): from anywhere else health
names neither the relay nor the key. A server a relay turns away says the same key in its log,
with what to do, and keeps dialling, so it is served as soon as the relay has the key.

Run that proxy on the relay's machine. The relay tells your server each phone's address, for
[the limit on wrong answers](#limits), and counts by it the phones one address holds open for a
server. On a connection from loopback it takes that address from `X-Forwarded-For`, and only from
its last entry, the one the proxy wrote. Entries before it are whatever the phone sent. From a
proxy on another machine the header is not read, and every phone counts as that machine.

A relay of your own has no push door unless you give it the Chips app's Expo access token
(`CHIPS_PUSH_ACCESS_TOKEN`), and only Chips has that. Servers using your relay still send their
notifications through the Chips relay's push door, unless they have the token themselves.

Then tell the server where it is, and restart it:

```sh
CHIPS_RELAY_URL=wss://relay.example pnpm chips serve
```

`chips serve` prints a `relay` line, and every pairing code it prints from then on — and every
one issued from You → Devices → *Pair another device…*, or `chips pair --issue` — carries the
relay's address and the server's tunnel key in the QR, beside the code. A phone that scans it
can reach the server from anywhere. A device paired before the server had a relay learns of it
from the server on its next connection, or at once when an owner turns the relay on while it is
connected ([ADR 0247](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0247-what-a-new-person-meets-says-where-it-works.md)),
and keeps it, so nobody pairs again
([ADR 0144](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0144-the-hosted-relay-serves-a-list-of-servers.md)).
The same goes for a server whose relay moves.

## On a box of its own

The files for a relay on a small Linux VM are in
[`packaging/relay/`](https://github.com/arjungupta99/chips/tree/main/packaging/relay): a systemd
unit that runs `chips relay` as its own user on loopback, a Caddyfile, an env file for the list,
journald kept for seven days, and a `cloud-init.yaml` that puts them all in place. Its README is
the steps, from an empty VM to a relay answering `GET /health`.

## What the relay sees, and what it cannot

The relay learns which server spoke to which phone, from which address, and when, because a
switchboard must. It logs that only at debug, which is off: at info it says how many servers and
sessions it holds, once a minute when that changes, and the key of a server it turned away. On
the box in `packaging/relay/`, the journal is deleted after seven days. At the end of each UTC day
it logs how many servers it listed, how many a phone came through to, how many sessions, and the
bytes each way, and with `CHIPS_RELAY_COUNTS_FILE` set it keeps that line: numbers, with no key and
no address in them. It reads no event, holds
no role and enforces nothing: who may do what is the server's door, exactly as on the network. It
cannot open the bytes it moves.

Those bytes are a tunnel between the phone and the server: a Noise NK handshake against the
server's key from the QR, so the phone knows it is talking to its server and not to whoever the
relay put behind that key; then every request and the socket, as messages inside it, signed by
the phone's device key the way every request has been signed since the first release
([ADR 0039](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0039-the-tunnel-is-noise-nk-over-webcrypto-and-requests-cross-it-as-messages.md)).
The test suite captures every byte the relay forwards and checks that none of the words, paths,
codes or headers is in it.

A server proves it holds its key before the relay lists it, so nobody can sit where your server
should be. A phone that asks for a key nobody holds is told so and closed — which is what a phone
shows when the laptop at home is asleep: the relay cannot conjure a server that is not running.

## Limits

A tunnel is a stranger until a credential lets it in, so the server allows thirty requests
without one per tunnel per minute — enough for pairing, an invite or a passkey sign-in, and not
enough to guess a code — and the pairing limiter counts by the address the relay saw, an IPv6
one by its /64, as on [your own domain](/operate/own-domain/#what-the-internet-can-reach). The
relay holds at most thirty-two phones per server, and sixteen of them from any one address,
counted the same way. A server's key is in every pairing QR and invite link, and anyone who has
it can ask the relay for that server; this keeps one address from taking all thirty-two. Sixteen,
not two, because a household away together, or a team in one office, shares an address.

The relay takes no message over 256 KiB (a tunnel message is at most 64 KiB) and holds only so
much for an end that is slow to take it. Past 4 MiB waiting for one side, it stops reading the
other until the first is down to 1 MiB, as TCP would have slowed the sender with no relay in
between; past 16 MiB it ends that session (`too_slow`), and the phone reconnects. One socket
carries all of a server's phones, so a phone that stops reading slows the others of the same
server until it catches up or goes. A relay lists at most eight servers from any one address,
counted the same way, and turns a ninth away as `busy`: a home or an office runs one or two, and
a relay open to anyone needs a limit on what one address can take. Homes behind a carrier's shared
address (CGNAT) count as one address, so on such a connection the eight can fill with servers that
aren't yours. A server turned away keeps dialling and is listed when there is room, and
[a relay of your own](#run-one) has no such neighbours.

NAT traversal — the two ends learning each other's public addresses and speaking directly, with
the relay as the fallback — is deferred behind a number rather than a date: it is revisited when
a relay's egress passes 10 TB in a month or its bill passes $100. Every frame and every pairing
payload already carries a version and a candidate-address list, empty for now, so that day is a
new field and not a re-pairing of every phone.
