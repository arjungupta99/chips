# 0206. An owner pairs a new phone for somebody already here

Date: 19 October 2026
Status: Accepted, 19 October 2026, on Arjun's "Please fix the whole flow. We can install a new
build if needed". Builds on ADR 0034 (invites, passkeys, a person comes back by passkey), ADR 0038
(the pairing payload), ADR 0122 (join requests) and ADR 0160 (removing a person).

## Context

Natalie deleted Chips from her phone and put it back, the evening of 19 October 2026. Her device
key went with the app, she had no passkey, and she had no other device to make a pairing code
with. Her phone opened on Welcome, and each of its doors was shut or wrong:

- **Paste invite.** Arjun sent her a new member invite. It was refused: "Somebody here goes by
  Natalie already." She was, and still is, that somebody.
- **Ask to join**, on the Wi-Fi. A device a person allows is paired as the person who allows it
  (ADR 0122, rule 2). Arjun allowing her phone would have made it his.
- **Scan a QR, type a code.** A code pairs a device as whoever made it, and only she could make
  one for herself.

The only way back was to remove her from Primal and invite her as somebody new. Everything she
had said would stay under a person who was gone, and she would be in none of her rooms.

## Decision

1. **An owner may make a pairing code for somebody else here.** `POST /v1/pairing-codes` takes an
   optional `{ "for": "<person>" }`. The code then pairs a device as that person: the same
   participant, with every room and everything they said. Only an owner may: an owner already lets
   people in and takes them out. An admin may not, since a phone paired as a member reads as that
   member. The person must be a person still in the workspace (`not_found` otherwise). The code is
   the one every door hands out (900 seconds, single use, kept in memory, dropped when its person
   is removed), and the server's log says for whom and by whom.
2. **The person's page has Pair a new phone…** (phone) and **New phone…** (web and Mac), an owner's,
   on everybody but themselves. It shows a QR that Welcome's Scan a QR code reads, the code and how
   long it has, and the app's own link (`chips://pair?…`). The QR and the link carry the relay and
   the server's key, so a phone away from home reaches the server too. On the phone the link goes
   out through Send the link. On the web and Mac it is shown to copy.
3. **Welcome's Paste takes that link as well as an invite.** The pairing link in a pasted message
   pairs the phone (`pairingLinkIn`). A bare code in a message still does not: six characters say
   nothing about where the server is. Welcome's first section says, in one more sentence, where a
   new phone's code comes from.
4. **A device that asks to join may be paired as somebody already here.** An owner allowing a
   device chooses under **Pair it as**: themselves, first and picked, then everybody else here by
   name. `POST /v1/join/:id/allow` takes `as`. The request keeps it (`join_requests.pair_as`,
   migration 0050), the view and the `join` frame carry it as `pair_as`, and `join.allowed` names
   it. It is asked again when the device collects its key, so a person removed meanwhile, or an
   owner demoted meanwhile, lets nothing in. A harness is added as the person who allows it, as
   before. Anyone but an owner sees no choice, and the words under it say whose the device becomes.
5. **An invite refused by a person's name says the way back.** "Somebody here goes by Natalie
   already. If that's you on a new phone, ask Arjun to choose Pair a new phone on your page in
   People." It names whoever made the invite. An agent's name is refused as before, with nothing
   added.

## Consequences

- A person on a new phone comes back as themselves by three doors: a QR scanned beside the owner,
  a link sent and pasted when apart, and Ask to join on the home Wi-Fi. A passkey (ADR 0034) still
  lets them back with nobody's help, and a person paired again might be nudged to add one. That is
  not built.
- The owner can now pair a device as anybody else in the workspace. The device shows under that
  person's Devices, where they can sign it out. The server's log and `join.allowed` say who did
  it. An owner runs the server and could read its database anyway; an admin gains nothing.
- The phone's join sheet drops the keyboard once a whole code is typed, so Pair it as and Allow
  are in sight. The keyboard used to stand over Allow with nothing to put it away but return.
- Clients older than this send no `for` and no `as`, and the server answers them as before.
  Natalie's own phone needs no new build to come back: its Scan a QR code and Ask to join already
  speak to these doors. Only the owner's app and the server do.
