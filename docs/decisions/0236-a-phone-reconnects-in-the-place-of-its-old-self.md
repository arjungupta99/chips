# 0236. A phone reconnects in the place of its old self, and a person's devices can be signed out

Date: 26 October 2026
Status: Accepted, 26 October 2026. Arjun, after Natalie's phone came back as a second iPhone 17:
"we need to provide a 'reconnect' option or something", then, on the mocks
(`docs/proposals/reconnect-a-phone-mocks.html`), "proceed with B", and "also I want to be able to
remove existing paired Natalie devices". It builds on
[ADR 0206](0206-an-owner-pairs-a-new-phone-for-somebody-already-here.md)'s new phone for somebody
and [ADR 0232](0232-a-link-asks-before-it-lets-anyone-in-and-lives-30-minutes.md)'s links that ask.

## Context

Arjun deleted Chips from Natalie's phone and put it back. The app's key went with it, so the phone
was a stranger. He paired it again with Pair a new phone… (ADR 0206), which works, and her page in
People then listed two iPhone 17s: the new one, and the old one, whose key nobody holds any more.
Nothing on the phone could take the old row off. The web's own Devices lists only your own devices,
and her page listed hers without any action.

A row like that is not harmless. It says a device is signed in as her that isn't, and if the old
key had been copied off the phone before it was wiped, it would still work.

## Decision

1. **Reconnect a device of theirs (the mocks' B).** On a person's page, an owner taps one of their
   phones (on the web and the Mac, Reconnect… on the device's line). It opens the same sheet as
   Pair a new phone…, titled "Reconnect iPhone 17", with a code and its QR, and the words say when
   it's for: "Chips deleted from it, or the phone reset?".
2. **The code names the device it replaces.** `POST /v1/pairing-codes` takes
   `{ "for": "<person>", "replaces": "<device>" }`. The device must be a live one of the person the
   code pairs as, or the answer is `404`; a person may name one of their own. The code remembers it
   in memory, as it remembers whom it pairs as, and a code that asks (ADR 0232) carries it into its
   join request (`join_requests.replaces`, migration 0054).
3. **The old device is signed out when the new one pairs, not before.** Through the Allow, or at
   once where there is no relay, the moment the new device is added the old one is withdrawn, as
   `DELETE /v1/devices/:id` withdraws one: its key refused, its pushes dropped, its sockets closed.
   It is checked again then, so an old device signed out meanwhile, or no longer theirs, is left
   alone and the new one still pairs. A code that is never used signs nobody out.
4. **A person's devices can be signed out from their page.** An owner may sign out anybody's
   device, an admin anybody's but an owner's, and a person their own (`maySignOutDevicesOf`), which
   the server's `DELETE /v1/devices/:id` already allowed. On the phone a device's row is pushed left,
   as in You's own Devices, and VoiceOver offers it as an action. On the web and the Mac it's a Sign
   out button on the device's line. Neither asks first: a device signed out is paired again with a
   code.
5. **Pair a new phone… stays** for a phone the person hasn't used here before. The foot under the
   group says which is which.

## Consequences

- Natalie's page lists one iPhone 17 once a phone reconnects, and the dead one can be signed out
  today without a reconnect.
- A reconnected phone is a new device with a new id and key. The server doesn't carry anything over
  from the old one beyond what the person already has: their spaces, their messages and their role.
  Push tokens and per-device settings are the new phone's own.
- The Allow sheet doesn't yet say that a request replaces a device. The person allowing it made the
  code moments before, for that phone.
- Tests: the route and the Allow in `pairing-codes.test.ts` and `links-ask.test.ts`; who may sign
  out in core's `removal.test.ts`; the phone's page in `People.test.tsx`; the web's in
  `You.test.tsx`; end to end, the web suite's N4 and N5 in `a-new-phone.spec.ts` and the phone
  suite's R1 in `reconnect.spec.ts`. The scenario is `testing/scenarios/people/a-new-phone.md`.
