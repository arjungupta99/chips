# 0278. A phone that asks on the Wi-Fi works its code out with the server

Date: 4 November 2026
Status: Accepted, 4 November 2026, on Arjun's "Do all these for me" for the stranger review's S-1,
which recommended a code worked out on both screens by commit and reveal. Changes ADR 0172
(decision 3: the code is no longer the server's to hand over) and ADR 0191 (decision 5: asking on
the Wi-Fi). Keeps SEC-6: the person types the code the phone shows.

## Context

A phone that found Chips on the Wi-Fi asks to join over the plain link, with no key pinned yet
(ADRs 0172, 0191). The server answered with a random code. The phone showed it, the person typed it
on the computer, and the phone collected its credential and the server's key, which it pinned.

That code proves the person is looking at a phone that holds it. It doesn't prove the phone is the
one in the request. On a shared Wi-Fi, a café's or an office's, somebody who can sit between the
phone and the computer (a spoofed Bonjour answer, or ARP) can:

- pass the phone's request on with their own key in it, hand the phone the code the server
  answered, and collect the credential once the person types that code: their device is paired,
  as the person who allowed it;
- or pass it on unchanged and put their own key in the answer as the server's: the phone pins
  them, and every tunnel it opens from then on is to them.

ADR 0191 accepted this as trust on first use, bounded by one request. The stranger review (S-1, 4
November 2026) judged it worth closing for asking on the Wi-Fi, where nothing is typed but the
code and the screens are already in front of the person.

## Decision

1. **Both ends work the code out; nobody hands it over.** The code is the SHA-256 of both keys
   and a nonce from each end, labelled (`joinCheckText` in `packages/protocol/src/join.ts`): the
   device's public key as it sent it, the server's tunnel key as the server sent it, the device's
   nonce, the server's nonce. Its first thirty bits are six characters of the pairing alphabet,
   `ABC-234`, typed as before.
2. **Commit, then reveal.** The phone makes a nonce and asks with `commit`, the SHA-256 of
   `joinCommitText(nonce)`. The server answers with no code: its key (`server_key`) and a nonce of
   its own (`nonce`). The phone sends its nonce with its first poll, at once, before it shows the
   code, and with every poll after. The server checks it against the commitment and works the code
   out. Until then an Allow is refused ("The device hasn't shown its code yet"); a nonce the device
   didn't commit to is refused outright.
3. **Why that stops somebody between them.** To make the two screens agree they must pick their key
   and nonce before they can know one of the two ends' nonces: the phone's is hidden behind its
   commitment until the server's is known, and the server picks its own after their request is
   in. Each try matches one time in about a billion (2^30), and each is a request on the owner's
   screen that the five-asks cap and the minute's limit count. Swapping the device's key makes the
   server's code not the phone's; swapping the server's key makes the phone's code not the
   server's.
4. **The key pinned is the key the code was worked out from.** A credential that comes with another
   `server_key` is refused, and nothing is kept.
5. **An older phone is answered as before.** An ask with no `commit` gets a random code to show,
   so 1.0.x phones keep joining. A phone with this change refuses a server that answers without
   its halves, an older server or somebody making a newer one look older: "Chips on that computer
   is too old to ask from here. Update it, or scan the QR code it shows." A QR and an invite link
   carry the server's key already and are unchanged.
6. **The server's half ships first.** It is additive (two nullable columns, migration 0059, and
   optional fields) and goes into a 1.0.x release, so that phones with the check find servers
   that answer it. The phone's half goes into the next phone release from main.

## Consequences

- No screen changes. The phone shows a code and the person types it, as SEC-6 has it.
- An owner can't tell an older phone's ask from one whose commitment was taken out on the way. The
  legacy path goes once phones from before this are gone; until then an older phone is as exposed
  as it was.
- A typed pairing code on the Wi-Fi stays trust on first use, as ADR 0191 decided (its open question
  1, answered "no fingerprint beside it"). Closing it needs a comparison step on the code screen or
  a PAKE, and a PAKE is not in CryptoKit (ADR 0277).
- Tests: `packages/protocol/src/join.test.ts` (the code's bits and alphabet, what it changes with),
  `server/src/application/use-cases/join.test.ts` and `server/src/interfaces/http/routes/join.test.ts`
  (no code before the nonce, a wrong nonce, a swapped key), `packages/core/src/device.test.ts`
  (the commitment, the nonce on every poll, an older server, another key at collect),
  `testing/join-and-remove/join-requests.wire.spec.ts` (the code worked out from the ADR's words,
  on a running server).
