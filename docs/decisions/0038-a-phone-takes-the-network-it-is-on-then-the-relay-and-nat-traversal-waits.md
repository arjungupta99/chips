# 0038. A phone takes the network it is on, then the relay — and NAT traversal waits for a number

6 September 2026 · Status: accepted

Written at the entry to Phase 4 · Mobile and the relay, before M4.1, because "phones connect to
the relay" is silent about whether the relay is the only way to a server, and the silence
becomes an answer the moment somebody writes the handshake.

## Context

A phone on the network its server is on already reaches it, and has since Gate 2. `chips serve`
bound to anything but loopback prints the LAN address and puts that address in the pairing QR
([ADR 0028](0028-chipsd-serves-the-page-and-pairs-the-machine-it-runs-on.md), decision 4), so
pairing and everything after it go straight to the server. No relay is involved and none is
wanted: the two machines are on one network.

Away from that network nothing works at all. A home router does not accept a connection nobody
asked for, and a phone on a cellular network is behind the carrier's NAT as well. Neither end
can be dialled. That is what M4.1 is for: both ends dial *out* to a relay, which holds the two
connections together and forwards ciphertext it cannot read.

What M4.1 does not say is whether the relay is the only remote path. A third exists: the two
ends learn each other's public addresses, punch through their own NATs, and speak directly,
with the relay introducing them and standing by as the fallback. Tailscale and WebRTC both work
this way and report that most connections end up direct. It is well-trodden — and it is a
subsystem, not a feature: candidate gathering, STUN, the several kinds of NAT, the symmetric
ones that defeat it, IPv6, and a relay fallback that has to be built and correct regardless.

The reason to settle it before M4.1 is not the work. It is that the choice shows up on the
wire — in what a server says when it dials out, and what a phone does with what it is told. A
phone paired against a protocol that cannot describe an address has to be re-paired when that
protocol grows one.

The reason not to build it now is that its entire payoff is bandwidth, and bandwidth is free at
this size. On an estimate — ten thousand servers connected, everyday traffic of about 200 events
per person per day at roughly a kilobyte each, and media of about 50 MB per person per month
reaching the relay rather than going direct over home Wi-Fi — the relay moves something like
half a terabyte in a month. That sits inside the included allowance of every host that is not
AWS. Weeks of work to reduce a number that is already zero on the invoice.

## Decision

1. **Three paths, tried in one order.** The network the server is on, then the relay, then —
   not yet — directly across the internet. A phone holding both a LAN address and a relay
   address tries the LAN first on a short timeout and falls back on its own. It never asks the
   person which network they are on, and there is no setting for this.

2. **The relay forwards and does not understand.** It matches two connections by device key and
   moves bytes. It learns no roles, reads no events, and holds no opinion about who may do what:
   that is the server's door
   ([ADR 0030](0030-who-may-answer-is-resolved-at-ingest-and-checked-at-the-door.md), and Phase
   5's authorization matrix). A relay that enforced a permission would have to read the traffic,
   and every claim made for the encryption would be gone with it.

3. **The pairing payload and the relay's control frames carry a version, and a place for
   addresses.** The QR and what `POST /v1/pairing-codes` mints carry a version. So do the frames
   a server sends when it dials out and a phone sends when it asks for a server, and those frames
   carry a list of candidate addresses which in v0 is always empty. A peer receiving a version it
   does not know says so and uses the relay, rather than failing. This is the whole cost of
   keeping point 4 open, and it is an afternoon.

4. **NAT traversal is deferred, and its trigger is a number rather than a phase.** Revisit when
   either is true of a month: the relay's egress passes 10 TB, or the relay's bill passes $100.
   Until then the relay is the only remote path. A date here would be a guess, because what
   traversal saves depends on how people use Chips and nobody has watched them yet; a threshold
   is a measurement. M6.4 owns watching it, since M6.4 is where the relay becomes something
   operated rather than something written.

## Consequences

- M4.1's acceptance gains a line beside the one it has. Unchanged: a phone on cellular reaches a
  server behind NAT with no port forwarding. Added: on the server's own network the phone
  connects without the relay, and a capture at the relay shows nothing at all.
- Because the LAN path already works, M4.2 can be built against a server on the same network and
  have the relay slid underneath it. The app does not block on the relay being finished.
- The version fields buy an option. If traversal is never built they cost an afternoon, which is
  the right price for not having to re-pair every phone in the world.
- Every remote session goes through a box we run, so when that box is down everybody away from
  home is down. That is an operations commitment rather than a design fault, and it is what
  M6.4's rate limits, abuse controls and status page are for.
- The relay knows which server spoke to which phone and when, because a switchboard must. It
  should keep as little of that as it can for as short a time as it can. What exactly, and for
  how long, is M6.4's to write down before strangers are on it.
- Media is the only line that grows with use rather than with users, and so the only one that
  can move the trigger in point 4 quickly. Phase 4 builds it plainly and Gate 4 measures it; a
  cap chosen now would be a guess at a number that arrives in five weeks.
- None of this reaches a laptop that is asleep. The relay cannot conjure a server that is not
  running, so a person whose Chips lives on a laptop has an offline Chips whenever the lid is
  shut. Two follow-ups are owed and neither belongs here: the phone saying *your server is
  asleep* rather than *reconnecting* (M4.2), and an operate page for people without an
  always-on machine (M4.5).
