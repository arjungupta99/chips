# 0045. A push is a claim the server makes for the phone, and carries no words

8 September 2026 · Status: accepted. Amended by
[ADR 0244](0244-a-server-that-cannot-push-says-so-and-claims-no-banner.md): a server that cannot push
claims no banner for a phone; and by [ADR 0246](0246-chips-sends-pushes-for-any-server-through-its-relay.md):
a server without Expo's access token posts its pushes to Chips's push relay.

Decided in Phase 4 · Mobile and the relay, for M4.3 (push): what reaches a lock screen, who
decides that it should, and what a third party learns on the way.

## Context

Until now a person heard about a decision only if something of theirs was awake and looking. The
desktop app raises a banner because it holds a socket; the phone app does too, while it is open.
A phone in a pocket holds nothing: iOS suspends the process, the socket goes, and the ask sits in
the queue until somebody opens the app — which is the opposite of what the queue is for. An
approval expires and a run is blocked on it.

Push is the only way to reach a suspended app, and it is not a socket: the message goes through
Apple's APNs or Google's FCM, and — because Chips holds neither credential — through Expo's
service on the way. That is a third party in the middle of the most sensitive traffic the
product has. *Scout wants to wire $50,000 to Northwind Traders* is exactly the sentence a lock
screen would like to show and exactly the sentence that must not leave the machine.

There is a second question underneath. ADR 0037 made "exactly one notification per event per
person" true across a person's devices with a claim ledger: a device claims `decision:<id>`
before it raises a banner, and the first to ask gets it. A sleeping phone claims nothing. Somebody
has to claim for it.

## Decision

1. **A push carries ids and two fixed words.** `A decision is waiting` / `Approve or deny from
   here.`, a `categoryId`, and `data` of three ids: the approval, its room, its run. Never the
   action, the preview, the risk classes, the harness's name or the room's title. What Expo,
   Apple and Google see is that somebody has a decision to make and an opaque identifier for it.
   The words come from the log the phone already holds, over its own authenticated socket, when
   the person opens the card. The integration test asserts the absence, by searching the body
   that would actually leave the machine for the words of the ask — the same assertion the relay
   tests make about a capture.

2. **The server claims on the phone's behalf, against the same ledger.** `notify-push` runs after
   an `approval.request` or `approval.routed` lands and claims `decision:<approval id>` — the
   key `planNotices` uses in the browser — before it sends anything. So a laptop that raised the
   banner leaves the phone quiet, a phone that was pushed leaves the laptop quiet, and a person
   with two phones is buzzed on one. This is the ledger doing the job it was built for, with a
   new kind of device asking.

3. **The choosing happens before the claim, not after.** `domain/push.ts` is pure and narrows
   three ways: who may answer (the event's own `approvers`, else the room minus its guests,
   never a harness); what the person asked to hear (the Decide tier on, the word for this
   harness not `none`); and where each phone is. Quiet hours are a person saying "not at night",
   and night is a fact about the phone, so the phone's IANA zone travels with its token and is
   read with `Intl.DateTimeFormat`. Because the filtering comes first, the ledger cannot pick a
   phone where it is three in the morning and leave the same person's phone in daylight untold.

4. **A decision from the lock screen is written down before it is sent.** Approve (with Face ID)
   and Deny answer without opening the app. The response handler writes the decision to a
   `pending_decisions` table on the phone, then hands it to the store; a row is forgotten only
   when the log comes back round showing the ask answered. A decision made in a tunnel is
   delivered when the signal returns, and the door refuses a second answer to an ask already
   decided, so a retry costs nothing.

5. **Expo's service is one `PushSender`, not the design.** The port takes a batch of messages and
   answers a ticket each. `CHIPS_PUSH_URL` points at whatever speaks that shape; a deployment
   that wants APNs directly writes another adapter and changes nothing above it. Expo is the
   default because it holds the credentials so this server does not — and because what it is
   handed is, by decision 1, worth very little.

## Consequences

- Migration 0016 (`push_tokens`, keyed by device), two ports, two adapters, a pure domain module,
  a use case wired as `SubmitEventDeps.notify`, and `PUT`/`DELETE /v1/me/push-token`. A withdrawn
  device's token goes with the device, and the sweep forgets rows whose device was revoked.
- The privacy statement people can check: **what Expo's service sees is a token, two fixed
  sentences and three ids.** Nothing about the action, the money, the harness or the room.
- A push tells a person *that* they are needed and never *what for*, which is a real cost: the
  lock screen cannot be triaged at a glance the way a mail notification can. That is the trade,
  and it is the right way round — a queue of three asks is opened in four seconds, and a preview
  on a lock screen is readable by anybody holding the phone.
- **Expo Go is not enough for the walk on Android**, where SDK 53 removed remote notifications
  and `expo-notifications` throws outright; on iOS it warns, and whether a token can still be got
  there is the first thing the acceptance walk finds out. The fallback is a development build,
  which needs an Apple identity — Gate 3's standing condition.
- `getExpoPushTokenAsync` needs an EAS project id, so this is the first thing in Chips that
  cannot be built or tested without an Expo account. The screen says so in those words rather
  than failing quietly.

## Addendum, 13 September 2026: on Android, Approve opens the ask

Decision 4 says Approve answers from the lock screen *with Face ID*. That holds on iOS only.
`expo-notifications` asks for the unlock through `isAuthenticationRequired`, which it marks as
iOS's, and Android gives a notification's button no such option through it. Built for Android as
written, Approve would have moved money from a locked phone.

Asking the button to open the app is not enough on its own. On Android 12 and later such a button
starts an activity, and Android asks for the unlock before it does. On Android 11 and earlier, which
the app supports back to 7.0, the press still arrives as a broadcast the app hears before the
unlock.

So on Android, and on anything not known to ask first, **Approve decides nothing from a push**. It
opens the app on the ask, behind the unlock that opening an app takes, and the person approves on
the card, which has the preview, the risk and the trail. Its title is *Approve…*, since it asks
for more before it acts. Deny still decides from the lock screen everywhere, because the safe
answer should be the easy one. iOS is unchanged.

The rule is `approvesFromLockScreen` in `apps/mobile/src/push/payload.ts`, which is pure: the
buttons each phone registers and what a press amounts to both come from it, and its tests fail
under the old rule. The cost is one more tap for an approval on Android. A config plugin could
pass Android 12's `setAuthenticationRequired` to the button, but it would still leave Android 7
to 11 open.
