# 0148. A space can be made empty and filled before it starts

Date: 10 October 2026
Status: Accepted, 10 October 2026, on Arjun's "go with A, build it". Amends ADR 0084 (decision 5:
nobody picked) and the new-space proposal (`docs/proposals/new-space.md`). Changes the room sheet's
Add (ADR 0087, Phase 4; ADR 0108) so it stays up while several are added.
Point 5's desktop opens the room sheet on Add since ADR 0151.

## Context

Arjun, 10 October 2026: "Right now we force to ask 'what is this space for' before creating the
space. There are situations where we want to create a space where we plan to add more agents,
before starting anything."

The + made a room only by asking a harness to start on something. On the phone, nobody picked said
"Pick who to ask" and sent nothing. The desktop made a room of people when nobody was picked, but
nothing said so. A room, once made, already took agents in through its sheet's Add (new, free, in
other rooms, people). But Add closed after one pick, so adding several meant opening it again
for each.

Mocks at phone width, today's window beside three options:
<https://claude.ai/artifact/5tsP2114TcJ7RNeEa7aUNu>.
- **A**, an Empty face in the row: about a day, with no server change.
- **B**, a name field on the card and an optional brief: needed a rule that a harness's claim
  keeps a name the person gave.
- **C**, a setup page inside the +: a second agent picker beside the room sheet's.

He picked A.

## Decision

1. **Empty leads the row of faces.** On the phone and the desktop, the + window's first face is
   Empty: a face's outline in dashes. Picked, it is alone. A tap on a harness's face while Empty
   is picked chooses that face instead, and a tap on Empty again leaves nobody picked. The rule
   is core's `newSpacePicks`, with `EMPTY_ROOM` among the ids.
2. **With Empty picked, the field asks for a name.** It says "Name the space", and the line under
   the faces says "An empty room · you add agents next". The words become the room's name, on one
   line. Nobody is asked and nothing is sent. The room is `space.created` with its title, made by
   the person alone, as the desktop's room of people always was. Nobody picked sends nothing, on
   both apps.
3. **It opens on whoever was asked last, Empty included.** The phone remembers it across launches
   (`remembered.ts`), as `lastAsked: "empty"`. Where no harness takes new spaces, Empty is all
   there is and no faces are drawn.
4. **Nothing flies.** On the phone the window fills the screen as for any send. Once it has, it
   dissolves into the room, with the name already in the room's capsule. There is no first
   bubble to fly to (`Window.tsx`, the `named` send).
5. **The room opens on its Add.** On the phone, the room's sheet comes up on its Add page once the
   window has gone. On the desktop, the members panel opens once the dialog has gone, and its add
   list takes the keyboard. While the modal dialog fades, the page behind it is inert and takes no
   focus, so the keyboard would go back to the + instead.
6. **Add stays up while several are put in.** A free agent's or a person's row ticks where it
   stands. A tick taken off takes it out again where the person may remove it (`mayRemoveMember`).
   A move from another room, and an ask for a new agent, turn back to Add. The ask shows ticked
   under New agent, by the name it is to have. Done puts the sheet away. This holds in every room,
   not only one just made. Core's `addableKept` keeps the ticked rows in their place. The
   desktop's add list already stayed up.
7. **A room of people alone says so.** Where its lines would be, an open room with nobody in it
   but people, no agent that left it, and nothing said shows "Nobody's here yet" and "Add agents,
   then say what this space is for", with an Add agents button that opens Add (`awaitsAgents`,
   `AWAITING_AGENTS`). A room an agent has left keeps its own notice (ADR 0087, rule 10). The
   notice's "Add an agent" opens Add too.
8. **The first message is the brief.** In a room with agents where nobody has said anything, the
   field asks "What's this space for?", the +'s own words (`startWords`), until a pick in the
   field says who the message is for.

## Consequences

- No server, protocol or harness change. Jacobian and OpenClaw meet the room's agents the way they
  meet any room's: added, asked for, or moved in.
- A room made Empty has no lead until somebody picks one (ADR 0104). Only a + room's claiming agent
  becomes its lead.
- The phone's + still shows only where a harness takes new spaces. It could now show everywhere,
  since an empty room needs nobody's say. That is left for later.
- On the phone, adding one agent now takes a Done as well. Before, Add closed by itself.
- Mocks are out of the repo, as asked on 28 September 2026.

## Addendum, 10 October 2026: the + shows whoever there is to ask

On his "make the + show even without a harness". The phone's + over the tab bar's slot
(`app/(tabs)/_layout.tsx`, and the web build's floating one) is drawn whether or not a harness
takes new spaces, as the desktop's always was. With nobody to ask, the window draws no faces and
says "A room for people, named by what you type" (core `NEW_SPACE_ALONE_LINE`, the desktop's
words), and its send makes the room empty, which opens on its Add. The phone's No spaces yet offers
Create a space whoever there is to ask, as the desktop's does; its "Connect an agent and it can
start one with you" and See agents (ADR 0131) are gone.

## Addendum, 11 October 2026: every room from the + is named

ADR 0149 makes every pick ask for a name, not only Empty. A room asked of a harness carries the
person's name and nothing is said in it. Decision 8 is withdrawn: with agents in it and nothing
said, the room's middle asks "What would you like to do?" and the field says what it says in any
room. `startWords` and `NEW_SPACE_FOR` are gone.
