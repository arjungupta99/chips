# 0219. A reply quotes the message it answers, in the room and to the agent

Date: 22 October 2026
Status: Accepted, 22 October 2026, on Arjun's word: "Go with your picks: A quote card, Jump, H3 for
the harness. Quote messages from before the agent joined." The mocks are
[reply-mocks.html](../proposals/reply-mocks.html) (animated:
<https://claude.ai/artifact/QXzC1bDpDvULtE27MhP3vV>); the build is
[reply-plan.md](../proposals/reply-plan.md).

## Context

Arjun, 22 October 2026: "I think we need ability to 'reply' to a message, like we do in iMessage.
Special use case is around replying to messages sent earlier." He also asked how the reply's context
reaches the harness.

Most of the wire is already there, and nothing uses it:

- `message.post` takes `reply_to`, a message id. The server keeps it (`messages.reply_to`, since
  migration 0001) and uses it to decide who a person's message is for: a reply to an agent's message
  is for that agent (`answered` in `packages/protocol/src/address.ts`, ADR 0081).
- `message.new` and `message.overheard` pass the id on (`heardFields` in
  `server/src/interfaces/ws/session.ts`), and the SDK's `post` takes `replyTo`.
- No app sends it, and core's `Line` has no field for it. The SDK's `promptFor`, the four bridges
  and Jacobian's channel all ignore it.

The case he asked about is where an id alone fails. An agent is handed the room's lines since it
last spoke (ADR 0088, ADR 0105), so a reply to something said two days ago reaches it with words
that point at a message it isn't handed. On the mocks: on Tuesday Jacobian held a table for 6; today
the room talked about a cake; Arjun replies to Tuesday's message with "Make it 8 people". Jacobian
is handed "Order the chocolate one" and then "Make it 8 people", and would most likely change the
cake.

Two facts in the code shape the decision:

- **For a person, the composer's choice outranks a reply.** The rules run @, then `to`, then the
  reply (`personAddress`), and the apps always send the capsule's aim as `to`. Sent as the apps
  send today, a reply to Jacobian in a room aimed at Pilot would go to Pilot.
- **For an agent, a reply addresses an agent's message's author.** `resolveAddress` applies
  `answered` to agents too. A `reply_to` set automatically on every agent's answer would therefore
  address the agent it answered, which is the automatic `to` that ADR 0081's amendment took out
  after Jacobian and OpenClaw traded thanks until the guard held them.

Chips also has threads (M5.4): a child space grown from a line, with `threadId` and `replyCount` on
the line. Neither app offers them. A reply is not a thread: it stays in the room, where everyone in
it sees it.

## Decision

1. **Starting a reply.** On the phone, swipe a message to the right: an arrow grows under it and
   turns gold, with a light haptic, at the point where letting go replies; the bubble springs back.
   Or hold it: Reply is the first button in the lifted menu's capsule (ADR 0200). On the web and the
   Mac an arrow shows beside a message under the pointer, and the line menu has Reply. Any message a
   person or an agent said can be answered, with words or only files. System lines, deleted
   messages and lines still on their way can't.

2. **The composer holds it.** A strip inside the field's glass names whose message it is
   ("Replying to Jacobian"), adds the day when the message is from an earlier day ("· Tuesday"), and
   shows its first line, in plain words. Its × lets go of the reply, and so does Escape on the web
   and the Mac. Starting another reply replaces it, and sending clears it. The reply is kept with
   the words typed in that room.

3. **Who it is for.** A reply to an agent's message is for that agent, by the rule that already
   exists. While the strip is up, the app sends no `to`, as it already does when an @ decides, and
   the capsule reads "Jacobian · by reply". An @ in the words still decides first, and so does an
   agent picked in the capsule after the reply was started. A reply to a person's message, or to
   your own, changes nothing about who it is for.

4. **On the wire from the apps.** `message.post` carries `reply_to`, the message's id. The server
   refuses a `reply_to` that names no message as `not_found` (`unknown_message`), and one that names
   a message in another room as `invalid_event` (`wrong_message`): the refusals feedback on such a
   message already gets. Today it keeps such an id and ignores it. A message taken back can still
   be answered. Nothing needs a migration.

5. **In the room: a quote card (the mock's A).** Inside the reply's bubble, above its words: a bar
   in the author's colour, their name, the day when it was not today ("Yesterday", a weekday within
   the week, else the date), and two lines of the words as they read now. A photo shows small, a
   file by its name, a voice note as "Voice note, 0:12". A deleted message reads "Deleted message"
   and goes nowhere. One deleted only for you (ADR 0167) reads "A message you deleted"; everyone
   else, and the agent, still see it. A message the device doesn't hold, in a room whose history
   was cut short, reads "Earlier message". The card quotes one level only. A message that has
   replies says so under it, "1 reply" or "3 replies", and that goes down to the newest one.

6. **Tapping the card goes to the message (the mock's Jump).** The room goes there the way it
   already goes to a line: `goTo` and `useRowScroll` on the phone (ADR 0130, ADR 0133), the list's
   landing on the web. The line lights up as a landing lights it, with a sweep of gold across it. A
   pill above the composer, "Back to your reply", takes the room back down. The pill goes once
   tapped, once the reader scrolls back to the reply, or when they send. Lifting the thread out of
   the room (the mock's Focus) is not built.

7. **To the harness: the quote, and what led to it (the mock's H3).** `message.new` and
   `message.overheard` gain `replying_to` beside `reply_to`:
   - The quoted message as a context line (`contextLine`: `seq`, `at`, `from`, `message_id`, `text`,
     `transcript`, `files`). The words are as they read now, cut at 2,000 characters with an
     ellipsis.
   - Three more fields: `attachments` (signed URLs, as for the message's own files), `edited`, and
     `deleted`, which leaves no words.
   - `before`: up to three lines said just before it. These come only with a turn (`message.new`,
     handed or not), and only when the quoted message is older than the lines the turn is handed:
     at or under `context.since_seq`, or before the first of them when older lines were left out to
     fit (`quotesBefore`).
   - The quote has its own budget and takes nothing from the context's.
   - A message said before the agent joined the room is quoted all the same. The person chose to
     show it (his call).

8. **The harness writes it into the turn.** The words live in the protocol beside `renderContext`,
   as `renderReplyingTo`, so the SDK's `promptFor` and a bridge that writes its own turn (OpenClaw)
   say the same thing. Jacobian's channel doesn't use the Chips packages, so it writes the same
   words itself, beside `heardIn` in `room-talk.ts`. They go after what was said since and before
   the words:

   ```text
   Arjun is replying to your message from Tuesday at 2:14 PM.
   Said just before it:
   Arjun: Find us a place for Friday dinner, 6 people, …
   Jacobian: Three have a table at 7:30: Foreign Cinema …
   Arjun: Hold Foreign Cinema
   Your message:
   > Held for 6 at 7:30 under your name. They need a card by Thursday noon or it lapses.
   ```

   It reads "Pilot's message" or "their own message" when it is somebody else's, and the time is in
   the zone the harness runs in.

9. **Agents pointing back at what they answer comes later, under two rules.** An answer points
   back only at a person's message, never at an agent's, because `answered` would address that
   agent. And the apps draw its card only when something was said between the question and the
   answer. Turns don't record which message started them (checked 22 October 2026), so the bridge
   sets `reply_to` from the message it answers, through the SDK. The mock's caption said the server
   would; that is how it changes.

## Consequences

- A reply quoting Tuesday costs the agent up to 2,000 characters and three short lines more.
  Messages that aren't replies cost nothing new.
- An older app draws a reply as a plain message. A bridge that hasn't updated ignores
  `replying_to` and hands over the words as it does today. Each bridge gets the quote with an SDK
  bump, and Jacobian once its channel reads the field. Committing in Jacobian needs Arjun's word.
- An agent added to a room late can now be shown, by a person's reply, words from before it joined:
  more than ADR 0088's catch-up hands it. That is his call, and a quote never crosses rooms.
- A harness that sent a `reply_to` naming another room, or no message, is now refused. None does
  today.
- The word "reply" in the apps means this from now on. Core keeps the two apart: a line's `replyTo`
  and `repliedBy` are this ADR's, and `threadId` and `replyCount` stay the threads'.
- The protocol changes, so `pnpm gen:protocol` regenerates the schemas and event docs, and the
  conformance fake hands over `replying_to` the way the server does.

## Addendum, 25 October 2026: the swipe starts on the message, not beside it

Arjun: "in space chat, swipe to go back should work from any empty area. right now, the empty area
on the left of bubbles trigges swipe to reply, that should happen when we swipe on bubble". The
swipe in 1 took the whole row, so a drag on the room's side of a bubble replied to it, where iOS 26
would have gone back. It now starts only on what the message draws: its bubble, and each photo,
voice note and file under it. Beside them, a drag is the screen's swipe back. The bubble and its
face still move together, and a touch within 24 points of the left edge is still the swipe back,
bubble or not. A short bubble of yours stands at the right edge, so its swipe starts on its left
side to reach the gold. Walked on a simulator (RP-10, `testing/scenarios/rooms/reply-to-a-message.md`).

## Addendum, 25 October 2026: both names say a person's standing (SEC-49)

The quote's first line named people bare, "Priya's message" and "Arjun is replying", where every
other line of the turn says a person's standing in the workspace (SEC-15). A guest named "Arjun
(owner)" read as the owner there. Both names now go through `withRole`: "Priya (guest)'s message",
"Priya (guest) is replying". `ReplyReading.sender` takes the sender's `kind` and `workspace_role`
for that, which `promptFor` passes from `message.from`; a bridge that calls `renderReplyingTo`
itself passes them too. An agent's name and "your message" are as they were.

Jacobian writes the same words itself (point 6). Its channel says a person's standing on both
names, on each of the room's lines since it last spoke and on what a working turn overhears
(Jacobian `0c48cff`, live 25 October 2026).
