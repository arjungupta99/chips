# 0245. Every server has the Chips relay behind its switch

Date: 30 October 2026
Status: Accepted. Arjun, 30 October 2026, on the readiness list's R1 ("Wow major issues, yes
proceed with R1 and M3"). Amends [ADR 0144](0144-the-hosted-relay-serves-a-list-of-servers.md)
(the hosted relay serves a list), [ADR 0211](0211-the-way-to-the-server-is-seen-and-goes-direct.md)
(the owner's relay switch) and [ADR 0121](0121-chips-up-is-the-first-run.md) (`chips up`). It
builds item C1 of `docs/proposals/hosted-relay-plan.md`, with what the plan said on consent kept:
the relay is never on until an owner chooses it. Amended by
[ADR 0247](0247-what-a-new-person-meets-says-where-it-works.md): the apps read a switch nobody has
turned as the server started it, and an invite says where it opens from its link.

## Context

A phone away from home reaches a server only through a relay. Until now a server had one only if
`CHIPS_RELAY_URL` was set, which nothing asked for: `chips up` never offered it, and Chips for Mac
runs `chips up --reach lan`. So a new person's phone worked at home and nowhere else. And had they
found the setting, the hosted relay would have turned them away: it served only the servers on
its list (ADR 0144), two keys, both Arjun's. The phone then said "your server is not reachable —
it may be asleep", which was not why.

## Decision

1. **A server with no `CHIPS_RELAY_URL` has the Chips relay (`wss://relay.chipschat.ai`) behind
   its owner's switch, off until an owner turns it on.** The switch (ADR 0211) is now on every
   server. Before any owner has turned it, it is on for a relay the server was set up with and off
   for the Chips relay. Turning it on sends the relay the server's key and address, so it waits
   for the owner. `GET /v1/relay` says which relay (`url`), so the switch names it before it was
   ever on.
2. **The app leads there.** The setup card's *Away from home* has **Set up** while it is undone,
   which opens the switch: the Relay page on the phone, and You scrolled to the Relay card on the
   Mac and the web.
3. **`chips up` offers it**, as the plan's fourth answer: *Your devices, anywhere, through the Chips
   relay (encrypted end to end)*, and `--reach relay`. It is listed first on a machine with no
   tailnet and after the Wi-Fi on one with a tailnet. It sets `CHIPS_RELAY_URL` for the service
   and binds the Wi-Fi too when there is one, so a phone at home goes direct. A server given a
   relay of its own has no such answer: its relay goes with every answer. `chips doctor`'s fix for
   a server no phone can reach names both ways.
4. **The hosted relay serves any server that proves its key.** Its list is dropped. In its place,
   a relay lists at most eight servers from one address (`SERVERS_PER_ADDRESS`, counted as the
   phones per address are, an IPv6 address by its /64), and turns another away as `busy`. A server
   already listed from there comes back after a restart, since it replaces itself. The limits on
   phones per server and per address, message size and flow stay as they were.

## Consequences

- A new person turns on reaching Chips from anywhere with one switch, from the card that tells
  them it's missing, on the Mac app's path as on the terminal's.
- The hosted relay is open to anyone. A proof of the key keeps anybody from standing in for a
  server, the tunnel inside is sealed end to end, and the per-address limits keep one address from
  taking the box. Limits on handshakes per address and a status page are still to come, and
  would be needed if the relay draws abuse.
- A server that once had its own relay and an owner's word on the switch, and then lost
  `CHIPS_RELAY_URL`, keeps that word, now for the Chips relay. Nobody but Arjun ran a relay of
  their own, and his server keeps its setting.
- A self-hosted relay can still serve a list (`CHIPS_RELAY_ALLOW_KEYS`), and its box files still
  start with one.
