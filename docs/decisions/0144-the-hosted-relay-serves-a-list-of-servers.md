# 0144. The hosted relay serves a list of servers, holds only what a slow end can take, and logs counts

Date: 9 October 2026
Status: Accepted, 9 October 2026. The hosted relay's list was dropped on 30 October 2026, for a limit
on servers per address: [ADR 0245](0245-every-server-has-the-chips-relay-behind-its-switch.md).

## Context

Arjun runs the relay at `relay.chipschat.ai` himself
([the hosted relay plan](../proposals/hosted-relay-plan.md)), and it is free
([ADR 0128](0128-the-protocol-stays-apache-and-the-server-and-apps-move-to-the-functional-source-license.md),
decision 7). On 9 October he said to build what it needs before it faces the internet ("go with
your recommendations, start Part 1"), with his calls: Hetzner in Hillsboro, a list of servers
while nothing is public, and devices that learn the relay rather than pair again.

What the relay was, as M4.1 left it ([ADR 0038](0038-a-phone-takes-the-network-it-is-on-then-the-relay-and-nat-traversal-waits.md),
[ADR 0039](0039-the-tunnel-is-noise-nk-over-webcrypto-and-requests-cross-it-as-messages.md)):

- **Any server** that proved its key was listed. On a box on the internet that is anybody's free
  switchboard, and the box is his.
- **No size limit.** `ws` takes a message of up to 100 MiB by default, and the relay read each
  one whole.
- **No flow control.** What one end sent was read as fast as it came and queued for the other
  end however slowly that end took it. A server sending a clip to a phone on a poor network
  queued the whole clip in the relay's memory.
- **Its log paired keys with addresses at info** (`server listed`, `session opened`), which its
  terms promise to delete after seven days but nothing on a box did.
- **A device paired before its server had a relay never learnt of it.** `GET /v1/health` names the
  relay and the key, and its doc comment says why, but no client read it. Arjun's iPhone and Mac
  were paired before 4431 had a relay.

## Decision

1. **A list of servers.** `CHIPS_RELAY_ALLOW_KEYS` names the servers a relay lists, by their relay
   key, comma-separated. Any other server is refused before its proof is checked, with a new
   relay error code, `not_allowed`, and its socket closed. Unset, a relay lists any server that
   proves its key, as before: the list is how the hosted relay runs while nothing is public, not
   a rule for every relay. An empty or malformed list is a configuration error, so a box whose
   env file still holds its placeholder does not start.
2. **The server says its key when turned away.** A server's relay link that is refused
   `not_allowed` logs its own key and `CHIPS_RELAY_ALLOW_KEYS`, and keeps dialling on its backoff,
   so it is listed the moment the relay has the key. A server's key is also `relay.key` in its
   `GET /v1/health` whenever `CHIPS_RELAY_URL` is set. No new command prints it.
3. **256 KiB a message.** A tunnel message is at most 64 KiB and a control frame is a line of
   JSON, so a socket that sends more than 256 KiB at once is not a peer of the relay's, and `ws`
   closes it (1009).
4. **The relay holds only what a slow end can take.** Each forward asks the receiving socket how
   much is waiting to leave for it. Past 4 MiB the sender is paused (not read) until the receiver
   is down to 1 MiB; past 16 MiB the session is ended with the reason `too_slow`. A server is
   held while any one of its phones is behind, and a phone while its server's socket is: one
   socket carries all of a server's sessions, so this is the head-of-line blocking TCP itself
   would have given with no relay in between. A held socket is not taken for a dead one by the
   heartbeat, since it is silent because it is not read.
5. **Counts at info, pairs at debug.** At info the relay says how many servers and sessions there
   are, once a minute when that changed, and the key of a server it turned away. Which server and
   which phone, from which address, is at debug, which is off. On the hosted box journald keeps
   everything seven days (`packaging/relay/journald.conf`), which is what its terms say.
6. **A device learns the relay its server names.** After each socket opens, over whichever link
   it opened on, the client reads `GET /v1/health`; when it names a relay this device does not
   have, or a different one, the transport reconnects through it from then on and the store keeps
   it with the device (`rememberRelay`; the phone passes its own storage). A device keeps a relay
   its server stops naming: a relay switched off for a moment is not one taken away.
7. **The box is in the repository.** `packaging/relay/` holds the systemd unit (its own user,
   loopback, the usual hardening), the env file, the Caddyfile, the journald rule and a
   `cloud-init.yaml` that carries copies of them, with a test that fails when a copy drifts. The
   Release workflow, run by hand, can build Linux x64 alone, which is the tarball the box runs, and
   its clean-machine job starts `chips relay` from that tarball.

## Consequences

- **The wire gains a code.** `not_allowed` is new in `RELAY_ERROR_CODES`; `RELAY_VERSION` stays 1,
  since a refusal's meaning did not change. A server from before this reads an error frame it
  cannot parse as nothing and logs the socket's close reason, which is the code, so it still says
  why, less helpfully. A phone never hears it.
- **The rest of the plan waits for strangers.** Per-address limits and the lockout by key (R2, R3),
  the metrics endpoint (R5), the load script and the nightly probe, `chips up`'s relay option (C1)
  and streamed bodies through the tunnel (C3) are not built. None matters while the list holds
  only Arjun's servers. A large clip through the relay still stalls before it starts (C3): the
  server buffers a whole answer before the tunnel sends it, and flow control does not change that.
- **A held server holds all its phones.** A phone that stops reading slows every other phone of
  the same server until it catches up, is ended at 16 MiB, or times out. At one person's scale
  that is the right trade for bounded memory; a relay for many would want per-session windows in
  the tunnel, which is a protocol change.
- **Arjun's devices need no pairing again.** Once 4431 has `CHIPS_RELAY_URL`, the iPhone and the
  Mac learn the relay on their next connection at home and use it from then on.

## Addendum, 12 October 2026: the large clip

"Stalls before it starts" was the wrong word for it. Measured (`pnpm relay:bench`), a 40 MB file
started at once and everything else on the tunnel waited behind it, 14 seconds on a 3 MB/s uplink.
[ADR 0152](0152-a-large-file-through-the-relay-holds-neither-the-tunnel-nor-the-phone.md) streams the
answer, paced by the server's socket, and opens the phone's frames natively.

## Addendum, 25 October 2026: sixteen sessions from one address

The first security review (SEC-12) found that whoever has a server's key, which is in every QR,
invite link and health answer, could open all 32 of its sessions and keep its phones off the
relay. A server now holds at most 16 sessions from one address (`SESSIONS_PER_ADDRESS` in the
switchboard), and the next from there is told `busy`, the code a full server already sends, so a
phone from before reads it as it always has and tries again after its backoff. An address is
counted as the server's limiter counts it (`countedAs`, ADR 0056, moved to `@chipschat/platform`
so both use one rule): an IPv4 address as itself, an IPv6 one by its /64, which is what one rented
server holds. The relay learns a phone's address as before, from the socket, or from the last
`X-Forwarded-For` entry when the connection is from a proxy on loopback, as Caddy on the box is.

R3 said four. It is sixteen because a device at home takes the door, not the relay, so the phones
that share an address at the relay are a household away together or a team in one office, and a
phone that reconnects holds two sessions until the relay drops the old one, up to a minute later.
It does not stop someone with two addresses, who can take all 32 between them; a cap by address
can only raise the cost from one place to several.

Not built: R2's handshake rate per address, and R3's 30-second close for a session that carried
nothing. A device whose server is asleep asks again every five seconds, so a household's phones
together pass R2's 30 a minute with nobody doing anything wrong, and one address on a carrier's
NAT is many people who don't know each other. Both wait with R2's caps on sockets. The review's
other half, refusing a non-`/v1` target through the tunnel without a credential, is the server's.
