# 0253. A launch reaches the server in fewer round trips

Date: 31 October 2026
Status: Accepted, 31 October 2026, on Arjun's "Do the other fixes, also make sure these fixes are
not leading to any security concerns".

## Context

Arjun asked why a cold start felt slow. Timed on a simulator with marks at each step, against a
relay 120 ms away each way and a server that cannot be reached directly (a phone away from home),
the rooms from the cache were on screen 1.69 s after launch and the server's hello came at 4.49 s.
From asking for the connection to the hello took 2.86 s, nearly all of it waiting:

| Step | ms |
|---|---|
| The door (the server's own address) fails | 77 |
| The relay's socket opens | 335 |
| Waiting for the relay's `connected` | 249 |
| Making the handshake's keys | 126 |
| The handshake's round trip | 524 |
| Asking for a socket ticket | 548 |
| The socket opens on the ticket | 494 |
| Hello, then its answer | 506 |

Four of those waits were each a round trip, or work, that nothing needed to wait for. On his
iPhone a round trip through the relay in Nuremberg is about 650 ms. Moving the relay closer was
the other way to save time; Arjun turned it down for its cost.

## Decision

1. **The handshake goes with the dial.** The handshake's first message is made while the socket
   opens and is sent as soon as it is open: to the relay right behind the `connect` frame, since
   the relay puts the phone through as it reads `connect`, before it says `connected`; at the door
   as the socket opens. A wire holds what arrives before anyone listens for its first listener,
   since the server's answer can now come in the same breath as `connected`.
2. **A tunnel's socket is greeted behind its open.** The hello, the subscribe and the outbox go
   right after the open, without waiting for `opened`. The server's end holds what arrives for a
   socket until it has taken it and never reads it if it does not. A WebSocket of the platform's
   own, which cannot send before it opens, is still greeted when it opens.
3. **Inside a tunnel the open carries its ticket's ask.** The socket's `open` frame carries the
   headers of the request it would have made for a ticket, `POST /v1/socket-tickets`, signed in
   this tunnel. The server puts them to the app as that request and spends the ticket at once,
   so the socket is let in by the same check and the same route, a round trip sooner. A refusal
   closes the socket 4001 `unauthorized`; an answer that is not a ticket closes it 1011. An open
   with no credential at all is refused without asking the app.
   - A phone turned away on an ask before its socket opened asks for a ticket the old way at
     once, on the same tunnel, and uses tickets for the rest of that connection. That is how a
     phone works with a server from before this, and how it hears why it was refused: unknown,
     or removed.
   - The plain link keeps tickets: a browser the server itself served, and a first pairing. A
     browser's WebSocket cannot carry headers (ADR 0006).
4. **The door and the relay race.** The door has 250 ms to itself, the delay RFC 8305 gives one
   kind of address before trying the next; then the relay is dialled beside it, or at once if the
   door fails first. The first tunnel through is the link; the other is closed when it comes,
   having been sent only the handshake. The door is still given up on after 1.5 s, and a device
   on Only direct still dials the door alone.
5. **A launch overlaps its reads.** The store asks for its connection as soon as it has read
   where to resume, and the socket says hello once the history is read and folded, so the replay
   lands on it. The devices the phone holds are read beside the appearance rather than after it.

## Security

Nothing new is trusted, and nothing is read before it was before:

- The tunnel is still Noise NK to the key pinned at pairing. The first message sent before
  `connected` is the one that went a moment later before; to a relay that holds no server by
  that key it goes nowhere (tested against the relay).
- A socket is let in by the same signed request through the same app route as before. Its
  signature names the tunnel's handshake hash (ADR 0191, decision 6), so an ask captured in one
  tunnel is refused in any other, and on the plain port. Tested through a real relay and server:
  the same ask in a second tunnel, an ask signed for another path, a device nobody knows, and no
  credential are each refused, and a message sent behind each never lands.
- What follows an open is held until the socket is taken and dropped if it is not. A tunnel holds
  at most one message's worth of bytes for all its sockets not yet taken together, the message
  still arriving included, and a caller that sends more loses the tunnel. A socket that goes while
  it is being taken still counts against the tunnel's sockets until its handler has answered, and
  everything about it is forgotten then, a message half sent included. An open under an id used
  before closes the tunnel: a caller's ids only rise.
- A handler that fails closes its socket 1011. It closed it 4003 before this, which a phone reads
  as its person removed (ADR 0160), and the handler now does more that could fail.
- An ask with no credential is refused before the app is asked, so opening sockets is no way
  round the cap on requests without a credential (SEC-21).
- The ticket made for an ask never leaves the server.
- A socket closed while it was being taken is told once, so no session in the hub outlives it.
- The tunnel that loses the race is sent the handshake only, as a door that is not this device's
  server always was.
- An independent review of the change found no way past authentication. What it found a tunnel
  could make the server hold, and the 4003, are fixed as the bullets on holding and on 1011 say,
  before this went live. Two things it noted are left as they are. A device revoked in the moment
  between its ask being checked and its session being registered is not closed by the
  revocation; with a ticket that moment was the ticket's thirty seconds. And the relay is now
  dialled whenever the door takes longer than 250 ms, at home too, so the relay sees a phone's
  address a little more often.

## Consequences

Measured on the same simulator, four launches each:

| | Before | After |
|---|---|---|
| Rooms from the cache | 1.69 s | 1.61 s |
| Hello, through the relay | 4.49 s | 2.77 s |
| Hello, through the relay, from a server from before this | 4.49 s | 3.77 s |
| Hello, at the door | | 1.75 s, the relay never dialled |

On his iPhone each step taken out is a round trip of about 650 ms through the relay, so the hello
should come about two seconds sooner away from home. At home the door answers within its head
start and the socket is open before the history is folded.

A phone from before this and a server since: tickets, as before. A phone since and a server from
before: one round trip lost on the first socket of each connection, until the server is updated.
The relay is unchanged.
