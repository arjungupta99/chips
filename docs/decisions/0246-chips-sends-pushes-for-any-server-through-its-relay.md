# 0246. Chips sends pushes for any server, through its relay

Date: 30 October 2026
Status: Accepted. Arjun, 30 October 2026: "you have go for fixing notifications from stranger
server". Amends [ADR 0244](0244-a-server-that-cannot-push-says-so-and-claims-no-banner.md) (a
server with no access token sent no pushes) and [ADR 0045](0045-a-push-is-a-claim-the-server-makes-for-the-phone-and-carries-no-words.md)
(where a push is posted). It builds the technical plan's Phase 4 push relay.

## Context

Pushes to the Chips app go through Expo. The app's Expo project has enhanced security on (SEC-29),
so Expo takes a push only with the project's access token. Only Arjun's server has it. Since ADR
0244 every other server says it can't send notifications, and sends none: a new person's phone is
told *your server can't send them yet*, and stays that way.

Turning enhanced security off would let any server push again, and would also let anyone who
learns a phone's push token push anything to it as Chips. The token has to stay with Chips, and
Chips has to send for the servers that don't have it.

## Decision

1. **The hosted relay has a push door, `POST /v1/push`, when it has the access token.** It reads
   `CHIPS_PUSH_ACCESS_TOKEN`, the setting a server reads for the same thing. It takes Expo's
   request (a list of up to a hundred messages), posts it to Expo with the token, and answers
   Expo's answer (one ticket per message, in order). A relay without the token has no push door.
2. **It takes only a Chips push.** Each message is to an Expo push token, has only the fields a
   Chips push has (`to`, `title`, `body`, `categoryId`, `priority`, `ttl`, `sound`,
   `mutableContent`, and `data` of strings), and is at most 4 KiB, the most Apple carries. Any
   other field is dropped. A request that isn't a list of such messages is refused as
   `bad_request`.
3. **It limits.** One place (an address, an IPv6 address by its /64, as the relay counts servers)
   sends at most 300 pushes a minute; past that the request is refused as `busy`. One phone is
   pushed at most 30 times a minute; past that its message comes back with Expo's own
   `MessageRateExceeded` and isn't sent. A server reads that as a push that failed, not as a phone
   that's gone.
4. **It keeps nothing.** It logs no token, word or id. The day's counts (ADR 0208) gain `pushes`,
   how many it sent. When Expo refuses its token, it says so once in its log and answers servers
   `push_unavailable` (503), not a 401 or 403, so a server doesn't take the relay's trouble for its
   own and stop pushing until it restarts.
5. **A server with no access token sends through it.** Unless `CHIPS_PUSH_URL` says otherwise, a
   server posts to Expo itself when it has the token, and to the Chips push relay
   (`https://relay.chipschat.ai/v1/push`) when it doesn't. It is ready to push from the start.
   `CHIPS_PUSH_URL` still points anywhere; pointed at Expo with no token, the server says, as
   before, that it can't push.
6. **There's no switch for it.** The relay (ADR 0245) waits for an owner, because it opens a way
   into the server. The push relay opens nothing: it carries what a server already sent Expo by
   default before ADR 0244, a phone's token, fixed words, ids and sealed words, one hop earlier. The
   person turned notifications on at the phone.

## Consequences

- A new person's phone gets its notifications from their own server, with nothing to set.
- Chips's relay box holds the Chips app's Expo token. Anyone who learns a phone's push token can
  push to it through the relay, but only in a Chips push's shape and a few times a minute. Only a
  server the phone paired with is given that token. Expo itself still takes nothing without the
  token.
- The relay also sees each pushing server's address and how often it pushes. It counts only how
  many, as it does for servers and sessions.
- If the relay is down, pushes from servers without the token fail and are not sent again later,
  as a push Expo failed always was. What needs the person still waits in Chips.
- A self-hosted relay has no push door unless its operator has a token for the app's project, and
  only Chips has that. Servers without the token still send through the Chips push relay.
