# 0158. An agent's @ pushes the person, sealed to their phone

Date: 13 October 2026

## Status

Accepted (Arjun, 13 October 2026, two rulings: "When an agent @s you" and "Sealed text"). The
build is `docs/proposals/schedules-plan.md`.

## Context

Today a phone gets a push for three things only:

- an approval (ADR 0045);
- the referee holding the agents (ADR 0097);
- a join request (ADR 0122).

So a 10 am reminder, a scheduled result or "it's done" (ADR 0157) waits silently in the room
until the app is next opened.

ADR 0045 keeps words out of a push: a fixed title, a fixed body and ids. Expo's push service and
Apple's carry everything between the server and the lock screen, so they learn that a decision
exists and nothing about it. That is right for an approval, where the lock screen's Approve opens
the app anyway. It is no use for a reminder, whose whole point is the words on the lock screen.

## Decision

1. **An agent's message that @s a person pushes to that person.** The trigger is a `message.post`
   from a harness or an agent whose `mentions` name a person in the room. Chips resolves the
   `mentions` from the @handles in the text (ADR 0081), so the @ the person sees is the @ that
   pushes. An ordinary reply that @s nobody pushes nothing.

   The person is not told when:
   - they are in their quiet hours, judged by the phone's own zone (mentions don't break through
     them);
   - their word for that harness isn't `all`: `decide` means its decisions only, and `none` means
     nothing;
   - one of their devices has already claimed `mention:<message id>`, the claim key that keeps it
     to one push per person.

   A phone with Chips in front shows no banner, as it already does for every push; the app
   decides that, since only the app knows what is on screen.
2. **The words travel sealed.** When a phone registers for pushes (`PUT /v1/me/push-token`), it
   makes a 32-byte key, keeps it in a keychain group it shares with its notification extension,
   and sends it as `seal_key`. Chips keeps the key on the token's row (`push_tokens.seal_key`,
   migration 0046) and never sends it out again.

   A mention's push is sent like this:
   - **The fixed words, for when the extension can't open it:** title "A message for you", body
     "Open Chips to read it.".
   - **Data:** `space_id` and `message_id`, plus `sealed` when the phone has a key.
     - `sealed` is AES-256-GCM over `{"title": "<agent> · <room>", "body": "<the words>"}`, sent
       as base64 of nonce, ciphertext and tag together.
     - The words are the message as plain text, Markdown taken off, cut to 240 characters.
   - **`mutable-content`, so iOS hands the push to the extension first.**
3. **The extension opens it.** A small iOS notification service extension (Swift, CryptoKit) reads
   `sealed`, opens it with the key from the shared keychain and shows the title and words. A push
   that won't open shows the fixed words; that covers an older app, a phone with no key, and
   Android. Expo and Apple carry ciphertext only. A tap opens the room, and so does a tap on the
   referee's push, which used to open the app where it was.

## What is left out

- A switch for mentions on the Notifications page. They are on for everyone. Quiet hours and a
  harness's `none` are the ways to quiet them.
- Notices in the browser and on the Mac. Those apps raise notices for what they plan
  (`planNotices`), and a mention isn't among them yet.
- Sealed text on Android. Android has no phone to test on; it gets the fixed words.
- A person @ing another person.
- Approvals keep ADR 0045's fixed words.

## Consequences

- A harness decides what is worth a push, the way it decides what to @. Jacobian's reminders and
  scheduled answers @ the person who asked (ADR 0157), and so does what the bridge posts for
  OpenClaw.
- An agent that @s the person in every reply pushes every reply. That is the harness's to fix,
  as an @-happy colleague in a team chat is.
- The phone needs a rebuild for the extension. Until then its pushes show the fixed words.
- Losing the key (a reinstall) makes a new one at the next registration, and the old row goes
  with its token.

## Addendum, 25 October 2026: a push that doesn't open shows the fixed words (SEC-29)

3 said a push that won't open shows the fixed words. The extension left such a push as it came, so
those were the server's words only when the server sent it: anyone who can push to the phone through
Expo could put their own title and words on the lock screen as Chips. Now a push the extension can't
open shows "A message for you" when that was its title and "A new message" otherwise, with "Open
Chips to read it." and no subtitle. Its sound, badge, category and data, and so where a tap opens,
are as they came. The server's own unsealed pushes, to a phone with no key, read as before. A push
sent without `mutable-content` never reaches the extension, and the decision's and the other fixed
pushes are sent that way, so only Expo asking for the server's access token keeps a stranger's words
off the lock screen there; that is Arjun's half of SEC-29.
