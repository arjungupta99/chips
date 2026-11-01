# 56. Wrong answers are counted by the /64, as they arrive, and a guess from everywhere slows everyone

Date: 13 September 2026 · Status: accepted

## Context

Four doors take an answer with no credential behind it: a pairing code (`POST /v1/pair`), an
invite's peek and redeem, a passkey sign-in, and the operator token (ADR 0048). Each route made
its own limiter with `createLimiter` in `server/src/interfaces/http/limiter.ts`. A limiter allowed
five wrong answers a minute from one address, and `addressOf` said what the address was: the
relay's word for a tunnelled request, the socket's peer, or, from a proxy on loopback, the last
entry of `X-Forwarded-For`.

Only the pairing code is short enough to guess. It is six characters from thirty-two, one of
1,073,741,824. It is good for fifteen minutes and one use (`pair-device.ts`). An invite and the
operator token are 256-bit secrets, and a passkey is a signature. Until 13 September 2026 the
server was reached on a tailnet or through the relay. [Your own domain](../../apps/docs/src/content/docs/operate/own-domain.md)
now puts the pairing door on the internet, and three weaknesses in the limiter matter there.

1. **An IPv6 address counted by itself.** A home line or a rented server is given a /64, and
   whoever holds it can answer from any of its 2^64 addresses. Five a minute on each is no limit.
   One host was held back only by how fast the server answers.
2. **Answers sent at once were all heard.** A route checked the address, awaited the body and
   the use case, and only then counted a wrong answer. Twenty wrong codes sent together from one
   IPv4 address all came back `401`: all twenty were checked against the live codes. So one address
   could make as many guesses a minute as it could open connections.
3. **The limiter never forgot an address.** Its map dropped an address's old failures only when
   that address was checked again, and `check` added an empty entry for every address it saw,
   including the ones that answered right. Rotating addresses grew the map without end.

Two numbers were measured on the Mac mini that runs the live server, at a load average of 5:

- Through a real socket on loopback, 32 connections got 46,139 wrong codes answered in five
  seconds, about 553,000 a minute. That was the whole limit on one host holding a /64. At that
  pace a code's fifteen minutes are 8.3 million guesses: one chance in 129 of hitting a live code.
- 10,000 addresses, each holding five wrong answers, take 3.56 MB of heap.

## Decision

1. **An address is counted as `countedAs` says.** This changes the counting rule, so it is
   written down here.
   - An IPv4 address is itself, as before.
   - An IPv4-mapped IPv6 address, which is how a dual-stack socket reports an IPv4 peer, is the
     IPv4 address it carries.
   - A Tailscale address, anywhere in `fd7a:115c:a1e0::/48`, is itself. Tailscale hands one to
     each device, and a whole tailnet shares one /64. Counted by its /64, one device's typos behind
     Tailscale Serve would make every device on the tailnet wait, which is what reading
     `X-Forwarded-For` was for.
   - Any other IPv6 address is its /64, written like `2001:db8:1:2::/64`. That holds for an
     address from the socket, from a proxy's `X-Forwarded-For`, and from the relay, whose key
     becomes `relay:2001:db8:1:2::/64`.
   - Anything else stays as it was given: `local`, or a proxy's word that is not an address.
2. **An answer holds its place from the moment it arrives.** `Limiter.attempt(address, answer)`
   checks the address, and counts the answer as pending while it runs. If the route calls
   `wrong()`, the place is kept for the minute; if not, it is given back. A pending answer counts
   against the allowance like a wrong one. Five answers from one address may be heard at once, and
   the sixth is refused until one comes back, with `retry_after_seconds` of 1. All four doors use
   it. `check` stays, for the passkey challenge, which holds no place.
3. **The limiter holds only addresses that matter now, and at most 10,000 of them.** An address is
   held while an answer from it is being heard, or while it has a wrong answer less than a minute
   old. A right answer leaves nothing behind. Once a minute, on a wrong answer, every address whose
   last wrong answer is a minute old is dropped. Past `REMEMBERED_ADDRESSES`, 10,000, the address
   whose last wrong answer is oldest is forgotten first. At 3.56 MB for a full limiter, the four
   limiters stay under 15 MB whatever arrives. There is no timer, so there is nothing to stop.
4. **A pairing door under a guess from everywhere is strained, and a strained door slows every
   address without closing to any.** When 30 wrong pairing codes (`WRONG_CODES_BEFORE_STRAIN`)
   have arrived in a minute from all addresses together, each address is allowed one wrong code a
   minute, not five, until the rate falls back under. Every address's first answer is still
   heard, so a person typing a code they were just given is never refused. A person who mistypes
   waits a minute, and is told the server is getting wrong codes from many places. The server logs
   *wrong pairing codes from many addresses* once each time the door is strained. Thirty is six
   addresses' whole allowance: more than the people pairing with one server mistype, and far less
   than a guess spread over many addresses. The invite, passkey and operator doors are not
   strained, because nothing behind them can be guessed.

   A global ceiling was the other way to read "a limit for everyone", and it was turned down:
   - **A lock**, refusing every pairing for a minute past the ceiling, is a denial of service.
     With five a minute per address, holding it closed costs six addresses and 30 requests a
     minute, and the owner can then not pair from anywhere, not even from the sofa.
   - **Refusing at random past the ceiling, or queueing**, is the same lock by chance, or the owner
     waiting behind every guess.
   - **Shortening live codes while strained**, say to two minutes, would cut a guesser's window
     sevenfold. But it spends a code a person already holds: the one `chips serve` prints at start,
     or one read aloud across a room. It is the next lever if the log shows strain. It is not
     taken now.
   - **A second limit on the /48** would catch a guesser with a tunnel broker's /48. But a mobile
     carrier puts many customers' /64s in one /48, so one guesser there would slow them all. Strain
     does the same job across every address, without choosing a block size.

## Consequences

- What a guesser gets against one pairing code's fifteen minutes:

  | Who | Before | Now |
  | --- | --- | --- |
  | One IPv4 address | a burst a minute, as many as it opens connections | 75: one chance in 14 million |
  | One host with a /64 | the server's pace, about 8.3 million: one chance in 129 | 75: one chance in 14 million |
  | A /48, 65,536 /64s | the server's pace, about 8.3 million: one chance in 129 | 983,040, one a minute each while strained: one chance in 1,092 |

  Without strain the /48 would get five a minute each, one chance in 218. While the door is not
  strained, every address together has fewer than 30 wrong codes a minute, fewer than 450 over a
  code's life: under one chance in 2.4 million.
- **Strain does not bound a guesser with very many addresses.** Such a guesser gets one guess a
  minute per address, up to the server's pace. Six characters are as much as a limiter can defend.
  The answer for a server on the internet is a longer secret. A QR is scanned, so it can carry far
  more than six characters; only a code typed by hand needs to be short. That is written down for
  later, not decided. Until then, the advice in *Your own domain* stands: issue a code when you are
  about to use it.
- A code is only worth guessing while one is live. `chips serve` issues one at every start
  (ADR 0028), so on a server on the internet each restart leaves one open for fifteen minutes,
  whether or not anyone pairs.
- A household on IPv6 is one address, as a household behind one IPv4 router already was. Their
  typos share five a minute.
- Forgetting an address past the cap gives it its allowance back early. That takes more than
  10,000 addresses answering wrong inside one minute, which is a guesser who already has those
  addresses, and it strains the door. Strain's own count is one list of the last 30 wrong answers,
  and forgets nothing.
- A double-tapped submit while the door is strained is refused for a second.
- The relay's own `addressOf`, in `relay/src/server.ts`, takes the *first* `X-Forwarded-For` entry
  from a proxy on loopback. Behind a proxy that appends, as Cloudflare does, that entry is the
  caller's own claim, and it becomes `relay:<from>` on the server. This decision does not change the
  relay; a relay run for strangers is Phase 6's.
- Tests: `limiter.test.ts` covers `countedAs`, and the limiter's allowance, pending answers,
  forgetting and strain against a clock the test moves. `routes/pair.test.ts` covers a /64 over
  the socket and through a proxy, twenty codes at once, and a right code while strained. The last
  three fail against the limiter as it was.
- Docs: *Your own domain* and *Tailscale* say how an address is counted, and *The relay* says the
  relay's address is counted the same way.

## Addendum, 13 September 2026: the relay reads the entry its proxy wrote

*This decision does not change the relay*, above, is superseded.

The relay's `addressOf` took the first entry of `X-Forwarded-For` from a proxy on loopback. The
server takes the last. The difference matters because of how a proxy writes the header. Caddy
replaces it, so its one entry is both first and last. Cloudflare and nginx append, so the entries
before theirs are whatever the phone sent. Behind them, a phone could send its own
`X-Forwarded-For` on every tunnel, and the server would count its wrong pairing codes against
`relay:<whatever it said>`: a fresh five a minute each time, and around both the /64 rule and
strain's per-address allowance.

1. **The relay takes the last entry, trimmed**, as the server does. When that entry is empty, it
   takes the socket's address, and never an entry before it. A header sent twice is read as the
   entries joined in order.
2. **It still reads the header only from a loopback peer.** From any other peer, the header is the
   phone's own claim, and the relay uses the socket's address.

The server counts that address as decision 1 says, so an IPv6 phone through the relay is still
its /64. A proxy in front of the relay belongs on the relay's machine, for the same reason one in
front of the server belongs on the Mac. From anywhere else, every phone would count as the proxy.
`relay/src/server.test.ts` covers a forged leading entry, an empty last entry and a header sent
twice. *The relay* in the docs says where the proxy goes.
