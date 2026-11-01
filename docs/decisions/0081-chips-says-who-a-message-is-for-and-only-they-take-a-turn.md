# 0081. Chips says who a message is for, and only they take a turn

Date: 27 September 2026
Status: Accepted. Supersedes ADR 0077's point 4 (the SDK's filter for another harness's words).
Generalises M3.3's "a message that names one harness is that harness's". Resolved at ingest like
ADR 0030's approvers, and drawn with ADR 0050's lane route. Amended by [0087](0087-a-harness-has-agents-and-an-agent-is-in-one-room.md), 29 September
2026: delivery goes to agents, once per connection; who a message is for is unchanged. Extended by
[0088](0088-an-agent-is-handed-what-was-said-since-it-last-spoke.md): a message for an agent carries the room's lines since it last spoke.
Point 4 amended by [0097](0097-the-referee-chips-talks-before-it-stops.md), 2 October 2026: the hold
after four goes; Chips talks first, holds only at 48 or on a person's pause, says so loudly, and
hands the held messages over when a person acts.

## Context

Batch 5 of the OpenClaw test was going to teach Jacobian to tell rooms apart and to hear another
harness (finding 23). Arjun stopped it before it started: "I need the architecture to be well
designed and scalable. We cannot add hacks." He asked what happens when a message is meant for
the other agent.

Today each harness decides for itself whether a message is its business, and each one says yes to
anything a person writes:
- **Chips's delivery.** Chips hands every harness in a room every other participant's
  `message.post` as `message.new` (`asDelivered` in `server/src/interfaces/ws/session.ts`).
- **Jacobian.** It runs a turn for every message from an owner, in any room. Its walk ends in
  mine, hand_down or hand_back, and the fallback is always mine. It has no outcome for "this is
  the other agent's".
- **The OpenClaw bridge.** It answers every person.

So "@OpenClaw is the build green?" in a room with both gets two answers. H2 ("Hi") passed only
because both should answer a hi.

Between harnesses the rules differ by who is listening:
- ADR 0077 made the SDK drop another harness's words unless they name it.
- A harness speaking the wire by hand decides for itself.
- Jacobian drops every harness's message.

Two questions had run together:
- **Which agent in this room is a message for?** This is the room's question, and Chips holds the
  room, its members and the mentions.
- **Which part of the agent handles it?** This is the agent's own question; for Jacobian, it is
  its walk.

Asking each agent's model the first question costs a model call per agent per message. It can end
with both agents answering or neither, and nobody can say why. Every harness would have to build
it again.

He took the recommendations:
- Chips resolves who a message is for.
- An unnamed message goes to whoever the sender last addressed.
- Context reaches the other harnesses as an event of its own.
- A harness hands over to another in the open, by @mention; lanes come later.

From the mock (`docs/proposals/who-a-message-is-for-mocks.html`) he chose A, a capsule above the
field. He asked for the room to show where a message went with the lane's existing route, faces
and arrows.

## Decision

1. **Every message says who it is for, and Chips decides it.**
   - **Where it is decided.** `addressed_to` is resolved at ingest, beside `mentions`
     (`fillMentions`), and recorded in the `message.post` in the log. Nothing works it out again:
     a replay, a catch-up and every screen read the same answer.
   - **What it holds.** Harnesses only: members of the room that have not been removed. People
     read every message, as they do today.
   - **For a person's message**, the first rule that applies decides:
     1. **An @.** When the text @mentions anyone, the message is for the harnesses among them. It
        is for none when it names only people. `@all` is a new handle that names every harness in
        the room.
     2. **The composer's choice.** `message.post` gets an optional `to`: harness ids, or `"all"`.
        It is what the sender picked without typing an @ (the capsule, point 5). Chips keeps only
        the members in it.
     3. **A reply.** A reply to a harness's message is for that harness.
     4. **The only harness.** In a room with one harness, the message is for that harness. Every
        direct room, J's and every Space's, falls here and nothing changes in it.
     5. **The last one.** Otherwise, the message is for whoever the sender's previous message in
        this room was for. Before the sender's first message, that is every harness in the room.
   - **For a harness's message:** the harnesses its text @mentions, or its `to`, or the harness
     whose message it replies to, and otherwise nobody. What an agent says without naming
     another is for the people. An adapter's answer to an agent reaches it only when the model
     @s it (amended 28 September 2026, below; this said adapters answer an agent with `to`).

2. **Only the harnesses a message is for take a turn.**
   - **Delivery.** A harness gets `message.new` when it is in `addressed_to`, and
     `message.overheard` when it is not. Both carry the same payload: who said it, the words, the
     files as signed URLs, `mentions`, `reply_to` and `addressed_to`. An overheard message starts
     no turn; its words are the room's context.
   - **Harnesses connected today.** A harness that does not know `message.overheard` ignores it,
     as it ignores any type it does not know. The SDK emits unknown types only on its `event`
     stream, and the bridge and Jacobian switch on the type. So every harness connected today
     answers only what is addressed to it from the day this ships, with no change of its own.
   - **Receipts** follow `addressed_to` where they followed `mentions` (`liveRunFor`,
     `receiptToHarness`).
   - **Older messages.** A message logged before this ADR has no `addressed_to`. It is read as
     addressed to every harness in the room, which is what it was.

3. **The SDK drops its own filter.** ADR 0077's point 4 is now the server's rule, for every
   sender. That point had the SDK pass on another harness's words only when they named this
   harness, and `hearHarnesses` heard them all. `hearHarnesses` goes. An SDK harness keeps context
   with `chips.on("message.overheard")`. The conformance fake delivers the same way.

4. **Harnesses talking to each other stop at four.** *Superseded by ADR 0097: the referee.*
   - **The count.** Chips counts, per room, the messages harnesses have addressed to harnesses
     since a person last spoke there.
   - **After four.** The fifth and later are still posted and shown. They are addressed to nobody
     and carry `held: true`.
   - **The line.** The room draws one line in the margin under the fold, where the first held
     message lands: *Jacobian and OpenClaw have sent each other 4 messages. They'll pick up when
     you say something.*
     - It looks like the room's other system lines ("You added Jacobian and OpenClaw"), not a
       bubble.
     - It is not a message in the log. Each client draws it from `held`, so a replay draws it in
       the same place.
     - It sends no notification.
     - The harness that sent the held message is told nothing. The other harnesses hear the
       message as `message.overheard`, with `held: true`.
   - **The reset.** A person's next message resets the count.
   - **Four is a constant**, not a setting.

5. **The composer says where the next message goes.** In a room with more than one harness, a
   capsule sits above the field, on the phone and on the desktop.
   - **What it shows.** An arrow, the face or faces, the name ("Everyone" for all), and a chevron.
   - **Its default** is what rule 5 would give: where your last message here went, or Everyone
     before your first.
   - **Typing an @ or replying** changes it for this draft, marked "by @", and it changes back if
     the @ goes. An @ naming only people shows *No agent*.
   - **A tap** opens a menu: each harness, and Everyone.
   - **What it sends.** The client sends the choice as `to`.
   - **In a room with one harness** there is no capsule, and the placeholder stays *Message, or
     /command*.

6. **The room draws where a message went with the lane's route.**
   - **What is drawn.** The room reuses the route the lane's task caption already draws
     (`LaneChain`'s `Trail`, ADR 0050): the sender's face, an arrow, and the face or faces the
     message went to, on the bubble's side.
   - **When.** Over a person's message whose `addressed_to` differs from their previous message in
     the room: the first message, and every change. A message that went where the last one did
     gets no route. It changed nothing, and the capsule said so. The routes therefore mark exactly
     the places where the default moved.
   - **On a send**, the capsule's arrow and face fly up with the words and become the route, and
     the sender's face joins it.
   - **Rooms with one harness** draw no routes.
   - **Source.** A route is drawn from `addressed_to` and never worked out by the screen.

7. **Harnesses talking to each other fold, on the phone as on the desktop.**
   - **What folds.** A harness's message addressed to harnesses is agent-to-agent, and so is one
     the guard held (its `addressed_to` is empty, but it is still their exchange).
     `betweenHarnesses` reads `addressed_to` and `held` where it read `mentions`.
   - **How it folds.** A run of such messages is one row: their faces with a two-way arrow, the
     count, and the latest line under it. It opens on a tap.
   - **Where.** The desktop has had the fold since M3.3; the phone gets it now.

8. **Hand-over is in the open, for now.** A harness passes work to another by addressing it
   ("@OpenClaw is main green?"). The answer comes back addressed to it, and the exchange folds.
   Lanes (`handoff` → `run.requested`, ADR 0029) stay the tracked, budgeted way. They come later,
   for pairs of harnesses that speak them.

## Consequences

- **Jacobian and the bridge are correct on the first day**, because they get `message.new` only
  when a message is addressed to them. Their own changes (batch 5) are in their own repositories,
  and Chips depends on neither.
  - **Jacobian:**
    - It keeps a thread per room.
    - It notes each `message.overheard` into that room's thread, so J knows what OpenClaw said
      when it is next asked.
    - It accepts a harness's addressed `message.new` when both harnesses share an owner. Approvals
      still go to the owner.
    - It tells a turn who else is in the room.
    - Its walk does not change. By the time the walk runs, the message is already Jacobian's.
  - **The bridge** gives OpenClaw overheard messages as context in the same way.
- **An unnamed message goes to one harness, not all.** A person who names nobody, in a room with
  two harnesses, reaches the one they last spoke to. The capsule says so before the send, the route
  says so after it, and Everyone is one tap away.
- **A new room with several harnesses starts at Everyone**, so its first "Hi" still gets an answer
  from each, as H2 did.
- **Two fields, two meanings.** `to` is what the sender chose; `addressed_to` is what Chips
  decided. An `addressed_to` the sender writes is replaced, as `mentions` is.
- **`@all` is a handle now**, so it no longer reaches a participant whose name is All.
- **The projection keeps each message's `addressed_to`**, so rule 5 and the routes read it
  without walking the log.
- **Protocol changes are additive:**
  - `message.post` gains `to` and `addressed_to`.
  - `message.new` gains `addressed_to`.
  - `message.overheard` is new (Chips to harness).
  - `pnpm gen:protocol` regenerates the pages.
  - The WebSocket and custom connect guides say what to do with each.
  - `concepts/space.md`'s "Mentions address a harness" becomes the rule above.
- **Tests:**
  - Ingest: each rule, the guard, and an old message replayed.
  - Delivery: new or overheard per recipient, and the receipts.
  - The SDK and the conformance fake.
  - Core's readers: route changes and the fold.
  - The phone's and the desktop's components.
  - End to end with two harnesses: "@Plain" reaches Plain only, the capsule's pick reaches the
    other, and a loop between them stops at four.
- **Not decided here:**
  - Several agents on one connection (open decision 8).
  - A room drawing each harness's run in full (ADR 0077).
  - Lanes between different harnesses' spaces.
  - A person addressing another person. Their words reach everyone, as today.

## Amended 28 September 2026 — Everyone stays everyone, and a route starts at the arrow

Arjun's calls on three things the live build showed:
- **Everyone is a choice, not a list.** A person's message for every harness is recorded as that:
  `message.post` gains `addressed_to_all: true` beside `addressed_to` (migration 0031 keeps it on
  the row). Rule 5 reads it back as everyone, so after a harness joins the room the next unnamed
  message reaches it too, and the capsule says *Everyone* with its face in the group. Harnesses
  picked by name stay those harnesses. Everyone then everyone is no move, so no route is drawn
  between them. The flag is set by `@all`, a `to` of `all`, the default before a person's first
  message, the default when none they addressed is left, and a room with no harness yet. That
  last case fixes a gap: a message in a room with no harness was for nobody, so the first message
  after two harnesses joined went to nobody too.
- **Another person's route starts at the arrow.** Their bubble has their face beside it already,
  so the route over it is the arrow and the faces it went to. Your own keeps your face, which the
  send's flight lands on.
- **The desktop field is named for where the capsule aims** ("Message Everyone", "Message
  Ledger") in a room of several harnesses. An untitled room is named after whichever harness has
  a run, which said the wrong thing there. A room with one harness keeps the room's name.

## Amended 28 September 2026 — an answer to an agent goes to the room

This ADR said adapters answer an agent with `to`, so the answer reaches it even when the model
writes no @. In the live test Jacobian asked OpenClaw for a number. OpenClaw's answer went back
to Jacobian by `to`, and Jacobian's "Thanks!" went back to OpenClaw the same way. They traded
"You're welcome!" and 👍 until the guard held the fifth: two turns each, spent on nothing, after
every question one agent asks another. Arjun's call: no automatic `to`. An adapter posts its
answer to the room, and another agent takes a turn on it only when the model's words @ it. Each
adapter tells its model, when an agent's words arrive, that the agent acts on the answer only if
addressed by its @name. What an answer loses: one that forgets the @ reaches the asking agent as
`message.overheard`, context for its next turn, and the people read it either way. `to` stays on
the wire for a client's pick and for an adapter that means it.


## Amended 28 September 2026 — who it goes to is in the field

Point 5 put a capsule over the field and a menu over the capsule. On his phone Arjun found them
three separate things: "this pill and the list look disconnected from the rest". He picked A from
`docs/proposals/address-in-the-bar-mocks.html`, and point 5 now reads:

- **The faces lead the field.** An arrow, the face or faces and a chevron sit at the front of the
  field, inside it, on the phone and on the desktop. The name is in the field's own words: the
  empty field says *Message Everyone*, *Message Ledger*. An @ in the draft puts an @ where the
  chevron was.
- **A tap on the faces opens the field upward into the list**: each harness, then Everyone, over
  a hairline, above the words, in the same glass or box. The field grows in 190 ms of ease-out
  and the room rises after it, as it does for a line typed. A pick, a tap on the room, a key typed
  or a send closes it. The keys, if they are up, stay up.
- **Nothing else changes**: the default, the @, the `to` a pick sends, and the flight of the faces
  up to the route.

The capsule's menu had also come up with no glass on iOS, every time, and had taken the keyboard as
it opened. The first was a menu faded in from nothing, which UIKit draws no glass behind; the
second was the menu being a window of its own. The list in the field has neither: it is the
field's own glass, and in the room's own window.
