# 0235. A conversation is a space wherever a person or an agent reads it

Date: 25 October 2026
Status: Accepted, 25 October 2026. Arjun, looking at chipschat.ai: "I think instead of 'room'
should we call it 'Space'? since we have a tab called space". From the list of every word that
changes (`docs/proposals/space-not-room.md`), he chose "Do the whole list with your recommended
picks, in stages."

## Context

The tab is Spaces and the + says New space, but inside the app the same thing was a room: "Remove
from room", "In other rooms", "Empty room", "This job has spent $2.41 of the $3.00 this room
allows." The empty Spaces list even said "A space is a room where you and your agents work on
something together." One thing had two names, and the second appeared only after you had picked the
first.

The code calls it both. The wire and the database say `space` (`space_id`, `spc_`), while the code
that draws one says `room` (`RoomSheet`, `rooms.ts`, the `room` note on `message.new`). Agents read
"room" too: the note at the top of each turn says "In this room: Arjun, and you, Ada", and they said
it back to people.

## Decision

1. **A conversation is a space in every word a person reads**: the phone, iPad, web and Mac, the
   server's refusals and notices, the push notifications, the CLI's printed lines and the films'
   captions. The plain swap is room → space. Where the swap read badly, the sentence was reworded:
   "In no room" became "Not in a space", "Rooms' projects are off on this server." became
   "Projects are off on this server.", and "A space is a room where…" became "A space is where…".
2. **A harness's own space is its Main space**, beside its Main agent and the Main pill
   ([ADR 0087](0087-a-harness-has-agents-and-an-agent-is-in-one-room.md)'s addendum of 8 October
   named it the Main room). "Lead" still means only a space's lead
   ([ADR 0104](0104-a-room-has-a-lead-and-chips-wakes-it.md)).
3. **Agents read "space" too**: the note on each turn ("In this space: …", "You joined this space"),
   the lines under it ("(Ada joined the space)", "Said in this space since you last spoke:"), the
   files list, the spend and referee warnings, and the project's words. The server words the note,
   so it changes when the server does. The lines under it are drawn by `@chipschat/harness`, so a
   bridge says "joined the space" once it takes the new library.
4. **The docs' pages for people say space**: Start, Supervise, Operate and Enterprise. The pages for
   harness builders (Concepts, Connect, Reference) and the protocol's schema descriptions keep
   "room" for now. They use it beside the wire's `space_id` and beside Jacobian's own "Space",
   which is one of J's agents, so they need a careful pass of their own rather than a swap.
5. **"Room" stays where it isn't a conversation**: capacity ("Make room in its context", "room to
   grow") and the demo's private room at Osteria Verde.
6. **Code keeps its names.** `RoomSheet`, `rooms.ts`, test ids like `room-capsule`, the wire's
   `room` and `lead_room`, the database, `chipsd upgrade one-room`, and the agent's copy of a
   project at `<folder>/room` stay as they are, as `lead` stayed in the code after ADR 0087's
   addendum. Comments, ADRs, STATUS and reviews keep the words they were written with.

## Consequences

- Nothing in Chips decides anything by reading these words: a refusal's `kind` (`agent_elsewhere`,
  `lead_room`) says what to offer, and its words are only shown. So the change is copy and the tests
  that check it.
- Until each of the bridges (OpenClaw, Hermes, OpenCode, ACP) takes the new library, its own lines
  keep saying room. The OpenClaw bridge draws "(Ada joined the room)" and "Said in this room since
  you last spoke:" itself, and the bridges' tests check some of Chips's words, so they fail on the
  new library until updated. That is a change in each bridge's repository.
- A phone on an older build keeps its old words until it updates; the server's refusals reach it in
  the new words.
- "spaces" is a letter longer than "rooms", so the tight places (the swipe disc's word, the
  picker's title) were checked on the phone.
- In Jacobian a Space is one of J's agents. J now reads "In this space" for a Chips conversation.
  If J mixes the two up, the note can say "Chips space" there.
