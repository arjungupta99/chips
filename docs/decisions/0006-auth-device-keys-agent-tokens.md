# 0006. Device keys for people, scoped tokens for agents, no passwords

2 September 2026 · Status: accepted

## Context

Solo mode has no account and no server to sign in to. Agents run on machines the owner does not
watch, so their credential must be narrow and revocable.

## Decision

Solo mode: Ed25519 device keys for people, paired by QR, signing requests. Agent tokens are
256 bits of randomness, stored hashed, scoped to one agent, and revocable from that agent's
profile. Passkeys arrive with invites in Phase 5. No passwords, ever.

## The signed payload

A device signs `METHOD\ntarget\ntimestamp\nsha256(body)`, where `target` is the full request
target — the path **and** the query string, exactly as they appear in the request line. Signing
the path alone let one signature stand in for every query for the length of its five-minute
window; a signature over the target it was made for stands in for nothing else. The window
bounds replay; the body digest binds the content; the method and target bind the route.

## Opening a socket

A browser cannot put a header on a WebSocket handshake, so a person's credential has to travel
in the URL — and a device signature there would be a durable credential in a place URLs get
logged (a proxy log, a `Referer`), good for its whole five-minute window. So a person's client
does not sign the upgrade. It makes one ordinary signed request, `POST /v1/socket-tickets`, and
opens `/v1/ws?ticket=…` with what comes back: a single-use, short-lived (30-second) ticket that
is spent on the upgrade. A logged handshake URL is worthless by the time anyone reads it. An
agent, which can set a header, presents its bearer token — in a header, or in the query where a
browser-hosted harness cannot set one.

## Consequences

- Nothing to phish and no password database.
- Token comparison is constant-time and tokens never appear in logs; the logger redacts
  `token`, `authorization`, `secret`, `signature` and `sig` at every depth.
- Losing every paired device means losing the workspace unless an export exists. Export and
  import are therefore part of the API surface from v0.
- Revoking an agent's token stops that agent and nothing else.
- Socket tickets are held in memory, like pairing codes. Phase 6, with several gateway
  processes behind one address, moves them to a shared store or makes them a signed, single-use
  value; the port is here so that is an adapter swap.

## Addendum, 18 October 2026: a fifth line inside a tunnel

ADR 0191's decision 6 binds a request to the tunnel it crosses. Inside a tunnel — through the
relay, or through the door on the server's own network — a device signs
`METHOD\ntarget\ntimestamp\nsha256(body)\nhandshake_hash`, the fifth line being the Noise
handshake hash of that tunnel as hex, which both ends hold and nothing else does, and says so
with a fourth header, `x-chips-signed: v2`. The server holds the signature to the tunnel the
request arrived on: made for another tunnel it fails as a bad signature; on the plain port it is
refused, since there is no tunnel for it to name. The four-line shape above stays the shape of
the plain port, where the CLI on loopback and a browser the server itself served sign; inside a
tunnel it is refused, since that is what a captured request played back looks like (from 25
October 2026; for one release before that it was tolerated for a phone build from before 18
October, unless the device had signed five). So a signature is good where it was made and nowhere else, a replay has nowhere to go,
and the five-minute window stops mattering for anything inside a tunnel (SEC-9). Socket tickets
are unchanged: the request that mints one is signed like any other, and the ticket is spent on
the upgrade inside the same tunnel.

## Addendum, 31 October 2026: inside a tunnel the open carries the ask

ADR 0253. Inside a tunnel a socket's open can carry headers, so it carries the signed request for
its ticket, made in that tunnel, and the server answers it and spends the ticket as the socket
opens: no ticket crosses the network at all, and the round trip for one is gone. The request is
the same `POST /v1/socket-tickets`, checked by the same route. A browser on the plain link, which
cannot set headers on a WebSocket, asks for a ticket first as above.
