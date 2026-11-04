# 0122. A harness or a device asks to join, and a person allows it

Date: 5 October 2026
Status: Accepted, 5 October 2026. Phase 2 of `docs/proposals/install-onboarding-plan.md` (§3.3).
Builds on ADR 0046 (a person declares what a harness takes), ADR 0045 (a push carries ids and no
words), ADR 0034 (owners and admins, invites) and ADR 0006 (tokens kept as digests).

## Context

A harness got into Chips one way: a person minted a token (Agents → Add harness, or `chips connect
custom`), copied it with three more lines, and pasted them into a terminal where the harness runs.
The token is shown once; the lines say nothing about whether the harness can reach the address in
them; and what a harness may do beyond the autonomy dial could be said only with `chips declare`,
from the CLI. The OpenClaw test (27 September) took a person and an agent most of an evening to get
through it. A phone was paired with a code typed or scanned, never by asking.

The plan's goal is that no secret is copied by hand: a newcomer runs one line where the harness is,
or pastes one sentence to their agent, and allows what asks.

## Decision

1. **One request, two ways in.** A *join request* is something asking to join — a harness for a key
   and the room it speaks in first, or a device to be paired — and what a person made of it. It is
   OAuth's device flow (RFC 8628) cut to what Chips needs:
   - **The requester starts.** `POST /v1/join`, with no credential, is answered with a secret only
     the requester holds and a six-character code it shows. The people who may decide see the
     request; one compares the code, chooses what to grant, and allows it or not. The requester
     polls `POST /v1/join/:id/redeem` with its secret and is handed its credential once.
   - **A person starts.** An owner or admin makes a link (`POST /v1/join/links`), choosing first what
     the harness may do. The link is `<address>/j/<secret>`; whoever holds it redeems it at
     `POST /v1/join/redeem`, already allowed. "Ask your agent to connect itself" is this link and a
     sentence, and needs nothing more of Chips.

   The code is for comparing on two screens, not a secret: the 192-bit secret is the credential, kept
   as a digest as a token is.
2. **What is handed over is made as it would be by hand, by the person who allowed it.** A harness
   is added by `addHarness`, with its direct room, owned by that person; what it may do is written by
   `declareCapabilities`. A device is paired by `pairDevice` as that person, with a code issued and
   spent in the same breath. So nothing new can be made by a join request that a person could not
   make, and a person demoted since they allowed it lets nothing in.
3. **The harness asks, a person declares (ADR 0046 kept).** A request carries what a harness asks
   for (`wants`); the person grants any of it, and nothing it did not ask for. A link carries what
   the person chose before it existed, and allowing a link again before it is used changes that.
   Capabilities in `hello` stay rejected. The app can now set `new_spaces`, `follows_rooms`,
   `new_agents`, `restarts` and the rest, which only `chips declare` could.
4. **The guards.** A code lasts ten minutes and a link fifteen. Five requests wait at once, at most,
   on one server. One address asks ten times a minute, refused or not. Only owners and admins see or
   decide requests. A request is redeemed once: the state and the expiry are in the predicate of the
   one statement that spends it, so two redeemers, or a redeem and a refusal, are told apart inside
   the database. A device asks only from this machine or its network — loopback, a private range,
   link-local, a tailnet — and never through the relay, so the relay cannot be used to fill a
   stranger's server with requests; away from home, the QR is the way in.
5. **What came of it is in the log, for people.** Allowing is `join.allowed` and refusing (or
   withdrawing a link) is `join.denied`, naming who decided and what was granted. A request a
   requester started is allowed when a person allows it; a link is allowed when it is taken up,
   since that is when Chips learns who it let in, and its line names the harness it made. A request
   nobody decided leaves no line. These have no room, and only people who see the whole directory
   are sent them: never a harness, never a guest.
6. **People hear of requests as they change.** The `join` frame carries the request, never its
   secret, to every owner's and admin's socket that said `join` in its `hello`, each time it changes:
   asked, allowed, refused, expired, redeemed. That opens the request dialog and moves the card that
   follows a link. `GET /v1/join` reads what waits after a reconnect. A request a requester started
   is also pushed to owners' and admins' phones, one each through the claim ledger, as two fixed
   sentences and its id (ADR 0045). Quiet hours are not kept: a request exists because somebody is
   setting something up now, and it is gone in ten minutes.
7. **A refusal says which rule.** An HTTP error may carry `refusal` beside its `code`, as a socket
   error already could: `spent`, `expired`, `denied`, `too_many`, `too_fast`, `not_here`, `decided`.
   A connector says "ask for a new link" or "a person said no" without parsing prose. A wrong secret
   is a bare `401`, counted against the address as a wrong pairing code is.

## Consequences

- Migration 0038 adds `join_requests`, a registry table beside `invites`. A request past its expiry
  reads expired at once; the sweep marks it, and the frame tells the people who could have decided.
- The plan's `join.waiting` frame is `join`: one frame for every change, so the card that follows a
  link and a dialog open on another device both hear what happened.
- The plan's three routes are eight: the link is made by its own route, and allowing is a route of
  its own rather than a field on `DELETE`.
- The secret is collected by polling every three seconds: twenty a minute, under the thirty a relay
  lets through one tunnel without a credential.
- `@chipschat/harness` gains `join()`, and `chips join <link>` prints the four lines a script can `eval`
  for a harness written in anything else. Today's token and lines stay, under Anything with HTTP →
  Advanced and as `chips connect custom`.
- Join requests are answered for the server's one workspace, the first person's, as the operator's
  pairing code is (ADR 0048). Several workspaces on one server would name theirs in the link.
- In dev mode the requests' clock can be moved on (`POST /v1/dev/join-clock`), so a test sees a code
  expire without waiting ten minutes. Nothing else's time moves.
- Phase 3 builds on this: the phone with no server asks to join over the Wi-Fi as a device, and the
  computer shows the same code.

## Addendum, 16 October 2026: a new link, the first words, and the setup first

From the connect-path survey (testing/findings.md ON-4 to ON-6), so a connector started from a
gallery link reaches "Said hello":

1. **A new link replaces a kept key.** `join()` took any key it had kept for the name at the
   address before it read a link, so a harness removed, or a Chips started afresh, never came back
   from a fresh link. It now takes up a link it wasn't handed its key by, keeps the new key, and
   notes the link beside it by its hash. The same link again, or one already used or lapsed, gives
   the kept key back, so a command run again as it was first written still starts.
2. **A harness says its first words once.** The card's last step waits for a line from the harness
   or its agents in the room the link made, and the connectors only answered. `helloOnce()` says
   them when `join()` was handed the key, noted beside it, so a restart says nothing, a new link
   says them in its new room, and a key kept from before says none.
3. **The setup is checked before the link is spent.** Each connector checks what it needs (a
   config, a key filled in rather than the command's `…` (`filledIn()`), its backend answering)
   before `join()`, and stops with what to do while the link is still good.


## Addendum, 20 October 2026: a harness on the server's machine is told the address it used

A server with `CHIPS_PUBLIC_URL` set answered every `POST /v1/join` with that address, and signed
every harness's attachment links with it. On the owner's Mac mini that is a tailnet name. So a
harness beside the server, which asked at `http://127.0.0.1:4431`, kept the tailnet name as where
Chips is, and with Tailscale down on the mini it could fetch no file it was sent.

Now a request or a socket that came from this machine straight to the port is told the address it
arrived at: the join answer, the room's file links (`GET /v1/spaces/:id/files` and the context
read), and the attachment links on its socket. Straight to the port means a loopback peer, a
loopback host asked for, and no `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto` or
`Forwarded` header. Tailscale Serve reaches the port from loopback too, and writes those headers,
so a device behind it is still told the public address. So is anything through the relay or the
tunnel door, and any other machine. A link a person makes (`POST /v1/join/links`) still names the
public address, since it is for a harness somewhere else. The rule is in
`server/src/interfaces/http/arrived-at.ts`.

## Addendum, 4 November 2026: an ask nobody handed a link for pushes once in ten minutes

Anybody on the Wi-Fi can tap "Ask to join", and anybody holding the server's key can ask through
the relay. Each ask pushed every owner and admin, with quiet hours not kept: five at a time, and
five more as each ran out, all night if somebody wanted. The stranger review of 4 November 2026
found this.

Now a request nobody handed a link for pushes at most once in a request's ten minutes, for each
workspace (`notify-join`).

- The rest are still told on the socket.
- They wait in the list with the first.
- A link's request is asked of the person who handed the link out (ADR 0232), and always pushes.
