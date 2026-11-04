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

## Addendum, 2 November 2026: the relay's health says whether pushes go

Arjun, 2 November 2026: "do 1 and 3 now, then 2", to the options after ADR 0244's addendum.

Nobody was told when the push door stopped sending. The relay said it once in its log, and the
day's `pushes` count dropped. So the relay's `GET /health` now carries `pushes`, to anybody:

- `ready`: Expo took the last pushes, or none have failed since the relay started;
- `refused`: Expo turned down the relay's token;
- `failing`: Expo didn't answer, or didn't take them;
- `no_access_token`: the relay has no push door.

It says what became of the last pushes the door sent on, and changes only when Expo answers. A
request the door turns away itself (`bad_request`, `busy`, a phone's limit) changes nothing.
The door doesn't ask Expo on its own, so a relay nobody pushes through stays `ready`. Whether
pushes go says nothing about any server or phone, so it isn't kept to the box as the counts are
(SEC-28).

A keyword monitor on `https://relay.chipschat.ai/health` alerts when the page doesn't hold
`"pushes":"ready"` (`packaging/relay/README.md`, step 6). That covers the relay being down too.

## Addendum, 4 November 2026: the push door sends only Chips's own words

The stranger review of 4 November 2026 found that decision 2 checked a push's fields but not its
words. `title` and `body` had only to be strings. Anyone who has a phone's push token could post
`{"to": …, "title": "Chips", "body": "Your key ran out. Pair again at evil.example"}` to the door,
and it went out under the Chips app's token. With no `mutableContent` the notification extension
never runs, so the phone showed those words as they were sent. With `categoryId: "decision"` it
showed Approve and Deny under them. Every server a phone has registered with holds its token,
including one the person has since left. Before this door, Expo's enhanced security stopped such a
push (SEC-29). The door had handed that token to anyone.

Three smaller gaps came with it:

- one bad entry in a request turned away the whole request, so one made-up token registered by a
  member of a room failed every push to that room's phones;
- once a minute's table held 100,000 places or phones, every new phone was refused, so a stranger
  with enough IPv6 addresses could stop every server's pushes for the minute;
- any web page could make its visitors' browsers post to the door as plain text.

So:

1. **A push's words in the clear are one of Chips's fixed pairs.** The ten sentence pairs servers
   send are `PUSH_WORDS` in `@chipschat/protocol`. Each server push takes its words from there.
   The door sends on a push only when its `title`, `body` and `categoryId` are exactly one of
   them, and the decision's buttons go only with the decision's words. Sealed words are unchanged:
   only a phone that holds the key opens them. Every server since 1.0.0 already says exactly these
   words, so no server is refused for its words.
2. **Each entry gets its own answer.** A request that isn't a list of up to a hundred pushes is
   still `bad_request`. Inside a list, an entry that isn't a Chips push gets an error ticket of its
   own, and the rest are sent:
   - a token that isn't an Expo push token is answered `DeviceNotRegistered`, so the server that
     holds it deletes the row;
   - a push over 4 KiB is answered `MessageTooBig`.

   A server now takes only an Expo push token at `PUT /v1/me/push-token`.
3. **A full minute forgets its oldest count.** It no longer refuses the next phone. A minute
   filled with made-up tokens costs a real phone its count, not its pushes. A request the door
   can't read counts as one push against its place.
4. **Pushes come from a server.** The door takes only `application/json` with no `Origin` header.
   That is what a server's sender sends and what a page can't send without a preflight the relay
   never answers. Anything else gets 403.
5. **Expo gets six seconds, not ten.** A server gives the relay ten. At the same ten, a slow Expo
   meant the server gave up and gave the banner to the computer while the phone buzzed too.

Left as it was: anyone with a phone's token can still send it Chips's fixed sentences, 30 a minute.
An attacker with many IPv6 /64s can still spend the relay's Expo quota with made-up tokens. Each
workspace a phone joins is given the same seal key (ADR 0158), so a workspace the person joined can
seal words that read as if another workspace sent them. That needs a key per device and a phone
build, and is left for a later change.
