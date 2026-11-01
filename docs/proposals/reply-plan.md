# Replying to a message: the build

Date: 22 October 2026
Status: Plan for [ADR 0219](../decisions/0219-a-reply-quotes-the-message-it-answers-in-the-room-and-to-the-agent.md),
on Arjun's word: "Go with your picks: A quote card, Jump, H3 for the harness. Quote messages from
before the agent joined. Write the ADR and plan."

The mocks are [reply-mocks.html](reply-mocks.html) (animated:
<https://claude.ai/artifact/QXzC1bDpDvULtE27MhP3vV>). The scenario that proves it is
[rooms/reply-to-a-message.md](../../testing/scenarios/rooms/reply-to-a-message.md), and its
findings are RP-n.

## His calls (22 October 2026)

1. **A, the quote card**, inside the reply's bubble. Not B, the faded copy with a line.
2. **Jump**: tapping the card takes the room to the message, lit, with a pill back. Focus, the
   thread lifted over the room, is not built.
3. **H3 for the harness**: the quoted message always, and up to three lines said before it when it
   is older than what the agent is handed.
4. **A message from before the agent joined is quoted** all the same.

Everything else on the mocks was drawn as proposed: swipe and the menu to start a reply, the strip
in the composer, the capsule's "by reply", the "1 reply" mark. Two things changed after the mocks,
both from the code:

- **Jump costs less than the mock said.** The phone already goes to a line and lights it, from
  pins, search and the media viewer's "Go to message" (`useViewerAnswers`' `goTo` and
  `useRowScroll` in `SpaceView.tsx`). The web list already lands on a row (`land` in
  `MessageList.tsx`).
- **Agents pointing back is the bridge's job, not the server's.** A turn doesn't record which
  message started it, so the bridge sets `reply_to` from the message it answers (ADR 0219,
  point 9). It stays out of this build.

## What it costs, against what he gets

| Phase | Gets him | Costs |
| --- | --- | --- |
| 1. The wire | The server hands an agent the quoted message and what led to it, and refuses a reply into another room | protocol, server, conformance fake; no migration; a 4431 restart |
| 2. The turn | Every harness writes the quote into its turn | protocol's words, the SDK, four bridges re-vendored, Jacobian's channel (his word to commit) |
| 3. Replies in the room | The quote card, "1 reply" under the message, Jump with its pill back | core, phone, web and Mac; no server |
| 4. Starting a reply | Swipe and Reply on the phone, the arrow and Reply on the web and Mac, the strip, "by reply" | core, phone, web and Mac, `@chips/ui`'s composer |

The phases run in this order so each can go live alone and nothing half-made shows. The server
hands over replies (1), the harnesses read them (2), and the apps draw them (3) before anybody can
send one (4). Phases 1 and 2 change nothing anyone sees until a reply is sent, so the first reply
from Phase 4 already reaches every harness with its quote.

Each phase lands on main when its gate is green: the full `pnpm check`, plus the suites below.
Then it goes live (ADR 0219's points are each built once): `pnpm web:build`, `pnpm desktop` and
`pnpm phone ship` for an app change, and a 4431 restart after a `.backup` for a server change.

## Phase 1: the wire (ADR 0219, points 4 and 7)

*Built 22 October 2026 on branch `claude/reply-wire`, fast-forwarded onto main. Four things differ
from the plan below:*

- *The refusal reuses the words feedback already gets: `unknown_message` (`not_found`) for no
  message, and `wrong_message` (`invalid_event`) for one in another room. No `reply_elsewhere`.
  The rule is `refuseOnReply` in `domain/authorize.ts`, beside `refuseOnFeedback`, and runs after
  membership, so only the room learns whether a message exists.*
- *The lines before it also come when the context was cut to fit and the message falls before its
  first line. The protocol decides that in `quotesBefore`, and shapes the quote in `quoteOf`, so
  the server and the fake can't drift.*
- *The quote reads its message with the context's own reader (`linesFor`, split out of `linesIn`),
  so a name as it is now, a person's standing and an agent that took a harness's place all read
  the same. `MessageView` gained `created_at`, for a message taken back.*
- *The fake's `say` takes `{ replyTo }`, for the bridges' tests in Phase 2.*

*Tests: the protocol's `quoteOf` and `quotesBefore`; `submit-event.test.ts` for both refusals and
a reply to a deleted message; six WS delivery cases in `session.test.ts` (the lines before it,
the same quote on a replay after a reconnect, the quote alone, edited and deleted, signed files,
the refusal), checked against the schemas; and the fake's delivery in `fake-chips.test.ts`. Not
written: an agent that took a harness's place and a handed message, which go through the same
`linesFor` and `asHeard` the tests cover.*

*Not live: 4431 was not restarted. Nothing changes for anyone until an app sends a reply (Phase 4),
and a restart now would also put other sessions' unpushed server changes on main live.*

**Protocol** (`packages/protocol/src`):

- `context.ts`: a `replyingTo` schema, `contextLine.extend` with:
  - `attachments` (the signed attachment shape `deliveredMessage` uses);
  - `edited` and `deleted` (booleans, present only when true);
  - `before` (up to three `contextLine`s).

  Exported with its type. `REPLY_QUOTE_CHARS = 2000` goes beside `CONTEXT_BUDGET`.
- `events/chips-to-harness.ts`: `deliveredMessage` gains `replying_to: replyingTo.optional()`,
  described the way `reply_to` is, so `message.new` and `message.overheard` both carry it.
- Then `pnpm gen:protocol` (schemas, `types.ts`, the event docs).

**Server**:

- `application/use-cases/submit-event.ts`: a `reply_to` naming no message in the event's room is
  refused before anything is written: `unknown_message` for no message, `wrong_message` for one in
  another room.
  - `replyAuthorOf` already reads the message, so the refusal goes beside it.
  - A `reply_to` on a post in no room goes with the other room fields (`ROOM_FIELDS`), as now.
- `application/room-context.ts`: `replyingToFor(room, { replyTo, sinceSeq, withBefore })`:
  - It reads the message (`readModels.message`) and returns nothing when it isn't in the room.
  - It builds its line with the same `linesIn` the context uses, one line around its `seq`, so it
    reads the way a context line reads: names as they are now, a person's standing, an agent
    that took a harness's place (`replaced`).
  - The words are cut at `REPLY_QUOTE_CHARS`. `edited` comes from `edited_at`, and `deleted` from
    `deleted_at`, which leaves no words. Files are signed with the room's signer.
  - `before`: when `withBefore` and the message's `seq` is at or under `sinceSeq`, `linesIn` with
    `after: 0, before: seq`, a budget of three lines and the context's character budget.
- `interfaces/ws/session.ts`:
  - `asHeard` adds `replying_to` for a message with a `reply_to`.
  - With a turn (`withTheTurn`), `before` uses the turn's `context.since_seq`. Overheard, there is
    no `before`.
  - Everything a harness is sent of a message passes through `asHeard` (`asAHarnessHearsIt`),
    live or replayed after a reconnect, and a handed message (`asHanded`) does too. So one place
    gives all of them the same `replying_to`.

**Conformance fake** (`packages/conformance/src/fake-chips.ts`): hands over `replying_to` the way
the server does, from the protocol's own helpers, so an adapter tested against it sees what
4431 sends.

**Tests** (Vitest, beside the code):

- `room-context.test.ts`:
  - The quote, from a person and from an agent.
  - `before` only when the message is older than the context, and none overheard.
  - Edited, deleted, a file with its URL, a voice note's transcript, 2,000 characters cut.
  - A message from before the agent joined (quoted), and an agent that took a harness's place
    (named as now).
- `submit-event.test.ts`: refused for another room's message and for an id that is no
  message. A reply in the room still addresses the agent it answers, and `to` still outranks it.
- The WS delivery test that covers `message.new`: one reply delivered live, after a reconnect and
  handed. All three hand over the same `replying_to`.
- Conformance: the fake's delivery against the schema.

**Live:** a 4431 restart, after a `.backup`. Nothing changes for anyone until a reply is sent.

## Phase 2: the turn (ADR 0219, point 8)

*Built 22 October 2026: Chips on branch `claude/reply-turn`, each bridge on its own
`claude/reply-turn`, fast-forwarded onto their mains; Jacobian on `claude/chips-reply`. What
differs from the plan below:*

- *`renderReplyingTo(replying, { sender, taker, at?, zone? })`: `at` is when the reply was said,
  which "today" and "yesterday" count from (`promptFor` passes `message.ts`), so the words don't
  change with the hour a test runs. A zone the host doesn't know falls back to the host's.*
- *A deleted message reads "Arjun is replying to your message from Tuesday at 2:14 PM, which has
  since been deleted." with no quote; the lines before it still come.*
- *`promptFor`'s file line moved to the protocol as `renderAttachment`, so the turn's own files and
  the quote's read alike. The SDK re-exports `renderReplyingTo` beside `renderContext`, and
  `PromptOptions` takes `zone`.*
- *OpenClaw's `replyingIn(event, taker)` calls `renderReplyingTo` itself, with the agent the turn is
  said as, and puts it ahead of the words it hands `withOverheard`.*
- *Jacobian's `replyingIn` in `room-talk.ts` writes the same words, with its own `lineOf` for the
  lines before it; `withRoom` takes `replying`, after what was said since. `Inbound` carries
  `replyingTo` and `at`.*
- *The classifier refused fast-forwarding Jacobian's main (its checkout held another session's
  uncommitted work), so Jacobian's commit `ec14d40` waits on its branch for his merge.*

*Tests: the protocol's block (the mocks' turn word for word, whose message from where the taker
stands, every day form across two zones, edited, deleted, files, none); `promptFor`'s order; each
bridge's reply case against the fake (Hermes, OpenCode, ACP: the agent's answer replied to, quoted
before the words; OpenClaw: the order in the turn and `replyingIn` itself); Jacobian's
`room-talk.test.ts` (the same words) and a turn in `bot.test.ts`. Not run: the live step 5, which
speaks as him.*

*Not live: no bridge, Jacobian or 4431 was restarted. Nothing changes for anyone until an app sends
a reply (Phase 4).*

**Protocol** `context.ts`: `renderReplyingTo(replying, { sender, taker, zone? })`, beside
`renderContext`. It writes the block from ADR 0219, point 8:

- Whose message it is, from where the taker stands: "your message", "Pilot's message", "their own
  message".
- When it was said, in the zone given, else the host's: "today at 9:12 AM", "yesterday at …",
  "Tuesday at …", else the date.
- `Said just before it:` and the `before` lines, written as `renderContext` writes lines.
- The quote as `> ` lines.
- "(edited)" after an edited message; for a deleted one, "a message that has since been deleted",
  with no quote.
- A file line per attachment, as `promptFor`'s `fileLine` writes them.

**SDK** (`packages/sdk-ts/src/prompt.ts`): `promptFor` puts `renderReplyingTo` between
`renderContext` and the words, from `message.replying_to`, `message.from` and the taker. Its test
holds the turn from the mocks ("Make it 8 people").

**Bridges**: each is re-vendored with `pnpm release:sdk <repo>/vendor` and committed in its own
repo:

- Hermes, OpenCode and ACP call `promptFor`, so the vendored update is the whole change. Each
  one's prompt test gets a reply case.
- OpenClaw (`chips-openclaw/bridge/src/bridge.ts`) writes its own turn with `renderContext`. It
  gets a `renderReplyingTo` call in the same place, and a test.
- Each bridge restarts once it is committed. A bridge restart cuts a run going in a room, so the
  busy sessions are asked first.

**Jacobian** (`~/Work/Jacobian/src/channels/chips/`): `room-talk.ts` gets `replyingIn(inbound,
own)` beside `heardIn`, with the same words. `bot.ts` puts it after `heard` where the turn is put
together (around line 2173). Tests go in the touched suites only, by path, never the full
`npm test` (`testing/jacobian.md`). **Committing and restarting Jacobian are his word.** If the
auto-mode classifier refuses the commit, he gets the commands.

**Gate:** each repo's own tests. Then one live run (the scenario's step 5) on his word, since it
speaks as him.

## Phase 3: replies in the room (ADR 0219, points 5 and 6)

*Built 22 October 2026 on branch `claude/reply-turn`, fast-forwarded onto main. What differs from
the plan below:*

- *`replyCard(space, line, directory, now)` reads the room and the directory, not the model and a
  reader: "deleted for me" is the room's `hidden`, and `now` is passed so the day word doesn't
  change with the hour a test runs. `repliesTo(space, line)` leaves out the replies the reader
  deleted for themselves. The fold keeps `repliesTo` beside the lines, so a reply that arrives
  before its message (a history read backwards) is still counted.*
- *The card's colour key is the author's face (`faceGround`), as their avatar draws it.*
- *The press goes through `useBackToReply` in each `SpaceView`, which holds the reply for the pill.
  On the phone it watches the list's viewable rows; on the web, the scroller and `halfIn`.*
- *What the walk changed (RP-1 to RP-3, `bcfadeb9`): the phone's sweep is drawn over the line, so
  it crosses the bubble rather than the row behind it; a card whose message is already in view
  lights it where it is, with no pill; and the pill says "Back to the reply" over someone else's
  reply (`backToReplyWords`), "Back to your reply" over yours.*

*Tests: core's fold and card (`replies.test.ts`: both orders, a reply deleted, every state, files,
the day word, the counts); phone Jest (seven: the card, deleted, missing, the press and the pill,
the pill going once the reply is seen again, a quote in view, the mark); web Vitest in
`Shell.test.tsx` (seven, the same and a send letting the pill go); `apps/web/e2e/reply.spec.ts` and
`apps/mobile/e2e/reply.spec.ts`, where the demo harness replies over HTTP and the card goes up and
the pill comes back. The walk: a simulator on a scratch server, light and dark, filmed.*

**Core** (`packages/core/src`):

- `model/types.ts`: `Line` gains:
  - `replyTo`: the line id it answers, from `reply_to` through `eventIdOfMessage`;
  - `repliedBy`: the ids of the lines answering it, oldest first.

  A comment says these are ADR 0219's, and `threadId` and `replyCount` the threads'.
- `model/lines.ts`: `textLine` reads `reply_to`.
- `model/messages.ts`: the `message.post` fold adds the new line to its parent's `repliedBy`. The
  parent may arrive after the reply during a backfill, so each fold looks both ways.
- A new reader, `replyCard(model, space, line, readerId)`, returns what the card draws, for both
  apps:
  - who said the quoted message, and their colour key;
  - the day word (`replyDay`: "" today, "Yesterday", a weekday within six days, else "12 Oct");
  - the plain words (`plainWords`);
  - what it holds (a photo with its thumbnail, a file's name, a voice note's length);
  - its state: `shown`, `deleted`, `deletedForMe` or `missing`.
- `repliesWords(n)`: "1 reply", "3 replies".

**Phone** (`apps/mobile/src/spaces`):

- `ReplyCard.tsx` (new): the card from the mock.
  - A 3 pt bar in the author's colour, the name, the day in `ink3`, two lines of words, and a
    small photo when it holds one.
  - On your own teal it is a darker inset with white words. On an incoming bubble it tints `ink`
    at 6.5%.
  - Pressing it runs `onGoTo(replyTo)`.
- `Line.tsx`: draws `ReplyCard` above the words when `line.replyTo` is set, and the mark ("↳ 1
  reply") under a line with `repliedBy`. The mark goes to the newest reply.
  - The mark sits under the bubble, outside it, so the lift's measure (`placeLift`) and
    `RoomSeen` keep measuring the bubble alone.
- `SpaceView.tsx`: the card's press is `goTo` from `useViewerAnswers`, so the line is reached,
  centred and flashed by the room's one way. The flash gets the gold sweep: a highlight moved
  across the bubble once, on the native driver, beside the pulse that lights it now.
- `BackPill.tsx` (new): "Back to your reply", in glass above the composer.
  - It holds the reply's line id from the press, and its press is `goTo(reply)`.
  - It goes when pressed, when the reply's row is seen again (the list's viewable items), or on a
    send.
  - It rises and falls on the spring the composer's capsule uses.
- Jest (RNTL): the card in each state, the mark's count, the card's press calling `goTo`, the pill
  appearing and going. Reanimated doesn't run under Jest, so the sweep and the pill's motion are
  walked.

**Web and Mac** (`apps/web/src/app`; the Mac app is this bundle):

- A `ReplyCard` in the bubble, drawn from the same reader, and the mark under the line.
- The card's click lands on the line with `MessageList`'s landing (`land`), lit as a search
  landing lights it, plus the sweep (CSS).
- A back pill over the composer, the same three ways to go.
- Vitest for the card and the pill. An `apps/web/e2e/reply.spec.ts` where a scripted harness's
  message is replied to (by the API until Phase 4), and the card's click lands on it.

**Phone e2e** (Expo web, `pnpm mobile:e2e`): the card and its press, on the same fixture.

**Walk:** a simulator on a scratch server. A room with a long history is replied to from a
fixture event, then you go to the message, sweep it and come back. Film it the way
[recipes.md](../../testing/recipes.md) films a landing.

## Phase 4: starting a reply (ADR 0219, points 1 to 3)

*Built 22 October 2026 on branch `claude/reply-turn`. What differs from the plan below:*

- *`aimOf(text, pick, space, directory, selfId, replying)` takes the line replied to while the
  reply decides, and `replyAgent` mirrors the server's rule 3 (the message's author, if an agent
  still in the room). An @ outranks it, it outranks a pick made before it, and the field stops
  passing it once an agent is picked after it. `aimWordsOf` is unchanged: "by reply" is the
  capsule's accessible name and the reply arrow in place of the chevron, as "@" is.*
- *The swipe's moment at 58 pt is `feel.tick()`, the house's tick for a line crossed under the
  finger (the sheet's pull and a decision card's swipe use it), not a light impact.*
- *Your own message reads "Replying to yourself" in the strip, on both apps.*
- *The web holds a reply per room for as long as the page runs, as it holds the picks. Starting one
  puts the caret in the field once the strip is drawn, since the strip's coming remounts the
  words' box in a room whose field leads with no faces. Escape lets go only while there is a
  reply.*
- *The phone's swipe has a stand-in under Jest (Reanimated doesn't load there), so Jest and the
  phone's e2e start a reply from the lifted menu; the swipe is walked on the simulator.*

*Tests: core (`aimOf` and `replyAgent`, `wireTo`, the store's send and the line on its way, `act`,
`mayReply`); phone Jest (five: Reply first in the capsule, the strip and ×, a send with no `to`
while the reply decides, a pick after it sent as `to`, your own message); web Vitest (seven in
`Shell.test.tsx`, and the composer's Escape and `inputRef`); `apps/web/e2e/reply.spec.ts` (Reply
from the menu and the arrow, Escape, the send, the harness handed `replying_to` with the line
before it, the card on the sent line) and `apps/mobile/e2e/reply.spec.ts` (Reply from the lifted
menu, ×, the send, `replying_to`, the card and "1 reply"). Walked on a simulator at 22:25: the swipe,
the gold, the spring home, the scroll on a diagonal and the swipe back at the edge all hold, and
nothing was found (the scenario's Runs).*

*After it went live (23 October 2026, from his phone, RP-4 to RP-6): `mayReply` takes an agent's
answer that also closed its run (`folded`), which most answers are; Reply in the lifted capsule
waits for the copy to be down before the field takes the line (`After` "reply" in `Line.tsx`), and
the put-down's spring ends at a quarter of a point (`DOWN`'s `energyThreshold`); the strip opens
with the glass (`OPENS` in `ui/growing.tsx`).*

**Core**:

- `store.send` takes `replyTo` (a line id) and sends `reply_to` (`messageIdOf`). The outbox keeps
  it across a reconnect, and the line still on its way carries `replyTo`, so the card draws at
  once.
- `act`: `sendMessage` passes `replyTo`. While a reply decides, `wireTo` gives no `to`, as it gives
  none when an @ decides. The aim's own word for it is `by: "reply"`.
- `aimWordsOf`: "Jacobian · by reply".
- `mayReply(line)`: a person's or an agent's message with words or files. Not a system line, not
  deleted, not still on its way.

**Phone**:

- `Line.tsx` `quickFor`: Reply first, a hairline, then Copy, Select, Share or Edit, Pin. `icons.ts`
  gets `reply` (the arrow turning back up-left, drawn as the others are). Its press puts the line
  down and hands it to the composer.
- Swipe: a pan on each row that `mayReply`, from react-native-gesture-handler.
  - It is active only past 10 pt to the right, and fails on 12 pt of vertical movement, so the
    list's scroll wins.
  - It starts no nearer than 24 pt to the screen's left edge, which is the stack's back swipe.
  - The bubble and face move together. The arrow disc behind them scales from 0.4 to 1 by 58 pt,
    and turns gold there with `Haptics.impactAsync(Light)`.
  - Letting go past 58 pt replies. The spring back is the room's spring.
  - All of it on the UI thread, in a new `ReplySwipe.tsx`. `SwipeRow.tsx` swipes rows in lists
    and sheets, not messages, so it isn't reused.
- `Composer.tsx`: the strip inside the field's glass, from the mock.
  - A bar in the author's colour, "Replying to Jacobian", "· Tuesday" when earlier, the first
    line, and ×.
  - It opens on the field's height spring, and the room rises with it (`useSendFoot`).
  - It is held with the room's draft words. × or a send clears it.
- `AddressInField.tsx`: the capsule says "by reply", and picking an agent in it after the reply
  started sends that agent as `to`.
- Jest: the menu's order, the strip's words and ×, a send carrying `replyTo` and no `to`, a pick
  after the reply carrying `to`.

**Web and Mac**:

- `LineMenu.tsx`: Reply first.
- A reply arrow beside the More button on a line under the pointer, the same `mayReply`.
- `packages/ui` composer: the strip, as on the phone; Escape lets go of it.
- The route words: "by reply".
- `reply.spec.ts` grows:
  - reply from the menu and from the arrow;
  - the strip, Escape, the send;
  - the scripted harness receives `replying_to` with `before`;
  - the card lands.

**Walk:** the swipe on the simulator, filmed:

- the arrow, the gold and the haptic call;
- the spring back with no snap;
- the room's scroll still wins on a diagonal;
- the back swipe at the edge still goes back.

Then the scenario's live steps with Jacobian and one bridge, on his word.

## Left out, and why

- **Focus**, the thread lifted over the room: his call 2.
- **Agents pointing back at what they answer**: ADR 0219, point 9. It needs the SDK to set
  `reply_to` on an answer to a person's message, and the apps to draw that card only when
  something was said between. It is a plan of its own.
- **Threads (M5.4)**: untouched. A reply is not a thread.
- **Replying to a system line, a run's card or an approval**: they aren't messages anybody said.

## Acceptance

- Swiping a message right on the phone, or Reply in its menu, puts the strip in the composer. The
  arrow turns gold with a haptic at the point where letting go replies.
- On the web and the Mac, the arrow beside a message, or Reply in its menu, does the same, and
  Escape lets go of it.
- In a room aimed at Pilot, a reply to Jacobian's message is for Jacobian, and the capsule says
  "by reply". An @ in the words still decides.
- The reply's bubble carries the card. Tapping it takes the room to the message, lit with a sweep
  of gold, and "Back to your reply" brings it back. The message says "1 reply".
- An edited message is quoted as it reads now. A deleted one reads "Deleted message". One deleted
  for you reads "A message you deleted".
- Jacobian, and an agent on each bridge, is handed the quote, and the three lines before it when
  the message is older than its context. Replying "Make it 8 people" to Tuesday's booking changes
  the booking, not the cake.
- A `reply_to` naming another room's message is refused as `invalid_event` (`wrong_message`), and
  one naming no message as `not_found`.
