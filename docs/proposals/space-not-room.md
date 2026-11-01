# Space, not room: every word that changes

Arjun, 25 October 2026, looking at chipschat.ai: "I think instead of 'room' should we call it
'Space'? since we have a tab called space". This is the list of every word in the product that
says "room" for a conversation, what it becomes, and the few calls that are his. He chose, the
same day: "Do the whole list with your recommended picks, in stages." So the four calls below went
as recommended, and the decision is
[ADR 0235](../decisions/0235-a-conversation-is-a-space-wherever-a-person-or-an-agent-reads-it.md).

The rule: a conversation is a **space** wherever a person or an agent reads it. "Room" stays only
where it means capacity ("Make room in its context", "room to grow") or a real room (the demo's
"private room" at Osteria Verde). Code names (`RoomSheet`, `rooms.ts`, `roomNote`), test ids
(`room-capsule`), the wire (`room` on `message.new`, `lead_room`), the database and file names
stay as they are, as the "Lead" rename on 8 October left `lead` in the code.

## Your calls

1. **Main room → Main space.** It was named on 8 October next to Main agent, so it's yours to
   change. I'd say yes: "Main space" sits beside "Main agent" and the Main pill the same way. Six
   strings say it (the Spaces row's VoiceOver label, the + picker, the details sheet, three
   refusals).
2. **What agents read each turn.** The note at the top of every turn says "In this room: Arjun,
   and you, Ada", and the lines under it say "(Ada joined the room)". Agents repeat these words
   to you, so I'd change them too (26 strings, below). One thing to weigh: in Jacobian a
   "Space" is one of J's agents, so "In this space" could read to J as one of its own. The room
   note goes live with the server; the context lines are drawn by `@chipschat/harness`, so the
   four bridges and Jacobian's vendored copy say "joined the space" only once they take the new
   library.
3. **The films.** Six captions say room. On 22 October you said to leave the videos, so I'm
   asking rather than assuming. Re-rendering (`pnpm film`, after asking the onboarding session)
   would also catch the app's own screens in them, which will say "space" once this lands.
   "People and agents, in one room" is the "X, Y." shape you don't want; I'd make it "People and
   agents work in one space".
4. **The docs.** I'd change the pages written for people (Start, Supervise, Operate: about 100
   mentions) and leave the pages for harness builders (Concepts, Connect, Reference) and the
   protocol's schema descriptions for a later pass. Those use "room" as the plain word beside
   the wire's `space_id`, and sit next to Jacobian's own "Space", so they need more care than a
   swap.

Everything else below is the plain swap, room → space, with a few sentences reworded where the
swap read badly (marked ✎).

## In the apps (phone, web and Mac)

### The Spaces list, a space and its details

| Before | After |
| --- | --- |
| A space is a room where you and your agents work on something together. | ✎ A space is where you and your agents work on something together. |
| *(Spaces row, VoiceOver)* …, Main room | …, Main space *(call 1)* |
| In this room *(details, who's here)* | In this space |
| Remove from room | Remove from space |
| In other rooms *(Add)* | In other spaces |
| Moves here from the room it's in | Moves here from the space it's in |
| An agent is in one room at a time. | An agent is in one space at a time. |
| An agent is in one room at a time. Picking one asks before it moves it here. | An agent is in one space at a time. Picking one asks before it moves it here. |
| An agent is in one room at a time. Ask the owner of … | An agent is in one space at a time. Ask the owner of … |
| It's in one room at a time. *(the notice under a refused add)* | It's in one space at a time. |
| A Main room takes people, and no other agent. | A Main space takes people, and no other agent. *(call 1)* |
| … makes it for this room | … makes it for this space |
| Who makes it. It starts with the room's last lines, and nothing from elsewhere. | Who makes it. It starts with the space's last lines, and nothing from elsewhere. |
| No agent in this room | No agent in this space |
| … is in no room now. | ✎ … isn't in a space now. |
| … is a Main agent, and stays in its Main room. | … is a Main agent, and stays in its Main space. |
| … is the Main agent here, and stays in its Main room. | … is the Main agent here, and stays in its Main space. |
| … is in another room. Move it here from this room's members. | … is in another space. Move it here from this space's members. |
| This room is archived. Unarchive it first. | This space is archived. Unarchive it first. |
| The Main room. People can join it; other agents can't. | The Main space. People can join it; other agents can't. |
| The Main room can't be picked | The Main space can't be picked |
| … is the Main room. It's always here. | … is the Main space. It's always here. |
| What this room sends this phone. The room shows everything either way. | What this space sends this phone. The space shows everything either way. |
| Nothing from this room but decisions | Nothing from this space but decisions |
| Reading the room's files… | Reading the space's files… |
| Back to the room, on this line *(photo viewer)* | Back to the space, on this line |
| said nobody leads this room / leads this room now | said nobody leads this space / leads this space now |
| another room *(where an agent is)* | another space |
| · not in this room *(web, who an ask is for)* | · not in this space |
| , made for this room | , made for this space |
| anyone in the room *(who may answer)* | anyone in the space |
| Its asks come to you on any device, unless it names someone else in the room. *(and its two pieces)* | … unless it names someone else in the space. |
| Its asks go to whoever it names in the room. | Its asks go to whoever it names in the space. |
| Takes it off every screen in the room | Takes it off every screen in the space |
| It leaves every screen in this room, yours too, and a line says it was taken back. | It leaves every screen in this space, yours too, and a line says it was taken back. |
| Looking through the room / … from the room *(thinking bubble)* | Looking through the space / … from the space |
| Take Ada out of Trip? Ada sees that you took them out, where the room was. | … where the space was. |
| You can add them back, and they find the room whole. | You can add them back, and they find the space whole. |
| It goes from your Spaces, and the room says you left. | It goes from your Spaces, and the space says you left. |
| A guest can read the project but can't change it. Ask an agent in the room. | … Ask an agent in the space. |
| … changed the same lines before yours reached the room. Both are in the file now: … | … before yours reached the space. … |
| Nothing of yours is lost, and nothing goes to the room until the marks are out. | … nothing goes to the space until the marks are out. |
| Nothing in your folder was different from the room's. | Nothing in your folder was different from the space's. |
| … is in the room. | … is in the space. |
| Chips couldn't reach the room's project: … | Chips couldn't reach the space's project: … |
| *(web)* This space is archived. Its history stays; unarchive it from the room's sheet to carry on. | ✎ This space is archived. Its history stays; unarchive it from its details to carry on. |

### New space

| Before | After |
| --- | --- |
| Empty room *(the + picker's first row)* | Empty space |
| An empty room · you add agents next | An empty space · you add agents next |
| A room for people, named by what you type | A space for people, named by what you type |

### Agents, and an agent's card

| Before | After |
| --- | --- |
| Room *(card row)* / No room *(web)* | Space / No space |
| 1 room · 3 rooms *(card, its history)* | 1 space · 3 spaces |
| In no room | ✎ Not in a space |
| Put in a room… / Move to another room… / Fork into a room… | Put in a space… / Move to another space… / Fork into a space… |
| *(picker titles)* Put Milo in a room / Move Milo to another room / Fork Milo into a room | … in a space / … to another space / … into a space |
| Choose a room… *(web)* | Choose a space… |
| Your rooms | Your spaces |
| A new room with it / A new room with the copy / A new room with … | A new space with it / A new space with the copy / A new space with … |
| It's in one room at a time. What it said while in none is said there. | It's in one space at a time. What it said while in none is said there. |
| It's in one room at a time, so it leaves the one it's in. | It's in one space at a time, so it leaves the one it's in. |
| A copy joins this room, remembering everything up to now. | A copy joins this space, remembering everything up to now. |
| … makes the copy, and the room says when it joins. | … makes the copy, and the space says when it joins. |
| None besides the Main agents yet. The + makes more, and so does Add in a room. | … and so does Add in a space. |
| None besides the Main agents yet. Add in a room makes more. | … Add in a space makes more. |
| A room you're not in · … / In rooms you're not in · … | A space you're not in · … / In spaces you're not in · … |
| … a room you're not in / Nothing of its in a room you're not in | … a space you're not in / Nothing of its in a space you're not in |
| You're not in its room. Someone in it can add you. | You're not in its space. Someone in it can add you. |
| … lives in the Main room, so it isn't moved. People can join that room; other agents can't. | … lives in the Main space, so it isn't moved. People can join that space; other agents can't. |
| Unarchive puts it back in its room, unless the room has gone. | Unarchive puts it back in its space, unless the space has gone. |
| Unarchive brings it back, free to join a room. | Unarchive brings it back, free to join a space. |
| Archived in their harness or here, or freed when their room was. Unarchive one to put it back in its room. | … freed when their space was. Unarchive one to put it back in its space. |
| What it says while in no room waits, and is said in the next room it's in. | ✎ What it says while it isn't in a space waits, and is said in the next space it's in. |
| … said this while in no room. It's posted in the room it joins next. | ✎ … said this while it wasn't in a space. It's posted in the space it joins next. |
| … said these while in no room. They're posted in the room it joins next. | ✎ … said these while it wasn't in a space. They're posted in the space it joins next. |
| … looks over what it's doing and writes in its room only when something needs you. *(heartbeat)* | … writes in its space only when something needs you. |
| Removed from the workspace. What it said stays in its rooms. | … What it said stays in its spaces. |
| Its tokens are withdrawn, so it can't connect again, and it leaves Harnesses, the + and every room's Add for everyone here. What … said stays in its rooms, under its name. | … every space's Add … stays in its spaces, under its name. |
| Rooms that were its home can be archived or deleted like any other. … | Spaces that were its home can be archived or deleted like any other. … |

### Archive and delete

| Before | After |
| --- | --- |
| … will be free to join another room. Nothing said here is lost. | … another space. … |
| … in another room by then. / Unarchive brings the agents back, unless they're in another room by then. | … in another space by then. |
| …, free to join another room. / …'s changes are locked, so it stays, free to join another room. | … another space. |
| Their agents will be free to join another room, and nothing said in them is lost. | … another space, … |
| its room / Its room *(the rows that say what goes with an agent)* | its space / Its space |
| Delete the room "…" | Delete the space "…" |
| The room and everything said in it are erased from the server. | The space and everything said in it are erased from the server. |
| The room stays, archived, with everything said in it. | The space stays, archived, with everything said in it. |
| It goes from Chips for everyone, and doesn't come back. What it said stays in the rooms it was in, under its name. | … stays in the spaces it was in, under its name. |
| They go from Chips for everyone, … What they said stays in the rooms they were in, under their names. | … the spaces they were in … |
| … of their rooms / They leave their rooms and move to Archived. / …, and the rooms archived with them / … rooms too | … of their spaces / They leave their spaces … / …, and the spaces archived with them / … spaces too |
| The rooms and everything said in them are erased from the server. | The spaces and everything said in them are erased from the server. |
| The rooms stay, archived, with everything said in them. | The spaces stay, archived, with everything said in them. |

### You, notifications, search and joining

| Before | After |
| --- | --- |
| Chips tells you when someone writes in your room, and when an agent there needs you. *(when the space has no title)* | … writes in your space, … |
| Nothing buzzes. They still wait for you in their room | … in their space |
| Nothing buzzes until it's over, not even an approval. It waits in its room. | … It waits in its space. |
| Whatever you choose, its rooms still show everything it says. | … its spaces still show everything it says. |
| *(web)* Nothing: it never notifies you. Its rooms still show everything. | … Its spaces still show everything. |
| Follow the rooms you open / when you ask from a room *(notification choices)* | Follow the spaces you open / when you ask from a space |
| *(push)* Chips paused the agents · Open the room to let them carry on. | … Open the space to let them carry on. |
| In a room *(Agents talking to each other, heading)* | In a space |
| Agents in a room can pass work to each other while you're away. … | Agents in a space can pass work to each other while you're away. … |
| The count starts again when you do anything in the room, or when an agent makes something new: … | … anything in the space, … |
| The room's Spend per job still pauses them, … | The space's Spend per job still pauses them, … |
| For every room in the workspace. | For every space in the workspace. |
| This job has spent $2.41 of the $3.00 this room allows. *(and with "The agents start nothing new until somebody lets them carry on.")* | … this space allows. |
| When a job here has spent this much, Chips holds the agents: … A job starts with the last thing a person did in the room. | … did in the space. |
| Opens spaces, and sets what a room may spend *(who sees what)* | Opens spaces, and sets what a space may spend |
| Can't invite, open a space, or put agents that aren't theirs in a room | … in a space |
| Search looks at the names of spaces and agents, and at everything said in the rooms you're in, voice notes too. | … in the spaces you're in, … |
| Messages are everything said in the rooms you're in, voice notes too. | … in the spaces you're in, … |
| … Photos, videos and files are kept here once they're opened or shown in a room. | … shown in a space. |
| Its made-up rooms go from this phone *(the demo workspace)* | Its made-up spaces go from this phone |
| Every agent can talk in the rooms it's in, and asks you before anything risky. | Every agent can talk in the spaces it's in, … |
| Its room is in Spaces. *(a harness joined)* | ✎ Its space is on your Spaces. |
| Open its room / Open Milo's room *(web)* | Open its space / Open Milo's space |
| Its address, id, key and room, in the environment. *(web, Connect)* | Its address, id, key and space, in the environment. |
| It answers with your harness's id, its key and its room, to call Chips with. | … its key and its space, … |
| It is waiting in its room. / Its Main agent is waiting in its room. / …, is waiting in its room. | … in its space. |

## What the server says back

Refusals a person meets in the apps (through the notice under a refused add, move or fork) and
those a harness builder meets. All the plain swap; the conformance fake that plays the server
gets the same words.

| Before | After |
| --- | --- |
| a Main room takes people, and no other agent / A Main room takes people, and no other agent. | … Main space … *(call 1)* |
| the Main agent stays in its Main room / The Main agent stays in its Main room. / … : it is not archived or deleted. | … Main space … |
| that room is archived: unarchive it first / Unarchive the room first. | that space is archived: unarchive it first / Unarchive the space first. |
| that agent is in another room: move it, or pick another | that agent is in another space: move it, or pick another |
| No room of that id here. / No room by that id here. / No room of that id that you are in. / You are in no room with that id. / … is in no room with that id. | No space of that id here. / No space by that id here. / No space of that id that you are in. / You are in no space with that id. / … is in no space with that id. |
| … is in this room already. / That agent is not in this room. / The agent is no longer in this room. | … space … |
| … is in another room (…), and an agent is in one room at a time. / That key's agent is in another room (…), … | … another space (…), and an agent is in one space at a time. |
| The agent is in another room, and an agent is in one at a time. / The copy is in another room, … | … another space, … |
| … doesn't make new agents for a room. / Nobody asked this harness for an agent in that room. / Nobody asked for a copy of that agent in that room. | … a space. / … that space. |
| That room has its copy already. | That space has its copy already. |
| The room stopped waiting for the agent after a minute, so it is free: a person can put it in a room. *(and "the copy")* | The space stopped waiting … put it in a space. |
| The room was archived while it waited, so the agent is free. *(and "the copy")* | The space was archived while it waited, … |
| … is in no room. Put it in this one instead: nothing is lost. | ✎ … isn't in a space. Put it in this one instead: nothing is lost. |
| It's in no room, so there is no room to delete with it. | ✎ It isn't in a space, so there is no space to delete with it. |
| A room is deleted with its agent only when that agent is the one there. / An agent is deleted with its room only when it is the one there. | A space is deleted … / … with its space … |
| Name what the agent takes the place of: this harness, or one of its agents in the room. | … in the space. |
| Nobody asked this harness for that room, so it is not its to claim. / That room was claimed already, under another key. / This harness was taken out of that room, so it cannot claim it. / … cannot answer. / That key has a room already: … / A room asked for is claimed under a key of this harness's own, not a shared one. | … space … |
| A person locks a room's changes. / A guest does not lock a room's changes. / Say whether the room's changes are locked as `locked`. | … a space's changes … / … the space's changes … |
| A person sets what a room allows a job. | A person sets what a space allows a job. |
| A hidden room is a person's own. | A hidden space is a person's own. |
| A person reads an agent's rooms; a harness has its own. / A harness reads a room's lines here; a person reads the room. | … an agent's spaces … / … a space's lines here; a person reads the space. |
| `space_id` is the room a fork's copy or a new agent was asked for: … / … send the room's `space_id` with it. / Send the room's `space_id`, and in `replacing` … / Send the `space_id` of the room to move the agent into. / … of the room the copy is for. | ✎ `space_id` is the space a fork's copy … / … send the space's id with it. / Send the space's `space_id` … / … of the space … |
| an agent is put in a room by its harness's owner, or an owner or admin of the workspace | … in a space … |
| a thread is its space's; a new room is asked of a harness / a room asked of a harness has no key yet: … | … a new space is asked of a harness / a space asked of a harness … |
| an approval that names nobody is answered in the room: … / … anyone's in the room but a guest's | … in the space … |
| a room asks others as well only when it asks one first / `to` names nobody who can answer this: somebody in the workspace who is not a guest of another room, a role somebody in the room holds, … | … space … |
| That change isn't in the room's project. / No such change, file or page in the room's project. / The room's project has no files yet. / … isn't in the room's project | … the space's project … |
| A guest can't undo a change. Ask the room's owner. | … Ask the space's owner. |
| Rooms' projects are off on this server. | ✎ Projects are off on this server. |
| A room's project answers git's smart HTTP, and nothing else. / A harness reads its room's project with git. / Name the agent this is for in the chips-actor header: a room's project is worked on by an agent. | … a space's project … / … its space's project … |
| *(a refused git push)* … isn't main: a room's project has one branch, main. / … files in a room's project are capped at … | … a space's project … |

## The command line and Chips for Mac

| Before | After |
| --- | --- |
| `chips project clone <room> [folder]`  the room's project, cloned here: your pushes show in the room | `chips project clone <space> [folder]`  the space's project, cloned here: your pushes show in the space |
| Say which room: `chips project clone "<room>" [folder]`. | Say which space: `chips project clone "<space>" [folder]`. |
| … Push to main and the room sees your change. | … Push to main and the space sees your change. |
| 2 rooms are called Trip. Give one's id: … / No room here is called Trip. Give its name as the room shows it, or its id. | 2 spaces are called Trip. … / No space here is called Trip. Give its name as the space shows it, or its id. |
| chips connect <id> … its rooms stay its own | … its spaces stay its own |
| It takes part in rooms as its agents: … *(chips custom)* | It takes part in spaces as its agents: … |
| make its home rooms ordinary rooms, so they can be archived or deleted *(chips remove)* | make its home spaces ordinary spaces, … |
| That isn't a room Chips made. *(CLI and Mac)* / That isn't a room and a token Chips made. | That isn't a space Chips made. / That isn't a space and a token Chips made. |
| Room project *(a project folder's name when the space has no title)* | Space project |
| chipsd upgrade: … give every harness in a room its agent, settle agents in more than one room, … / Nothing to settle: every agent is in one room at most. / follows its rooms: an agent per keyed room / one agent in every room | … space … *(the command keeps its name, `one-room`)* |

## What agents read (call 2)

| Before | After |
| --- | --- |
| In this room: Arjun, and you, Ada (@Ada). | In this space: Arjun, and you, Ada (@Ada). |
| You joined this room … | You joined this space … |
| … and nothing else: the room shows nothing, and nobody needs to hear that you are ready or waiting. *(NO_REPLY)* | … the space shows nothing, … |
| … said it with no @, and nobody in the room has worked since. | … nobody in the space has worked since. |
| The room's files listed with this turn are its current versions: work from them, not from a copy you made in another room. | The space's files … another space. |
| Said in this room since you last spoke: | Said in this space since you last spoke: |
| (Ada joined the room) / (Ada left the room) / (Ada renamed the room "…") / (Ada archived the room) / (Ada unarchived the room) | … the space … *(drawn by the bridges: live once they take the new library)* |
| Files in this room: | Files in this space: |
| … this room allows a job, so Chips holds the agents until a person acts: … / … this room allows a job; at … | … this space allows a job … |
| The agents in this room have sent each other … / A person has this room open now. / No person has this room open now. / … this room began | … this space … |
| The room's project is a git repository. Your copy is … / …, which reached the room first. … | The space's project … / … reached the space first. … |
| (Not in the room's project yet: … / (Not in the room's project: … *(three more)* / A file that isn't in the room's project / … reaches this room only when you send it: … | … the space's project … / … reaches this space … |
| `>>>>>>> the room` *(a merge's label when several changed the file)* | `>>>>>>> the space` |
| an approval card in the room *(the checklist)* | an approval card in the space |
| The room was archived. / The room was deleted. / The agent was moved to another room. / The agent was taken out of the room. *(why a run stopped)* | … space … |

## Films (call 3)

| Film | Before | After |
| --- | --- | --- |
| Watch · Spaces | Each conversation keeps to its own room. A face lights up while its agent works. | Each conversation keeps to its own space. A face lights up while its agent works. |
| Watch · Teamwork | People and agents, in one room | ✎ People and agents work in one space |
| Watch · Decide | Milo asks before paying the deposit. Answer in the room, or from your lock screen. | … Answer in the space, or from your lock screen. |
| Agents · Fork | A copy joins a new room, remembering everything so far. … | A copy joins a new space, … |
| Agents · Move | An agent is in one room at a time. Move Milo, and the room it joins says so. | An agent is in one space at a time. Move Milo, and the space it joins says so. |
| Trouble · Can't answer | If an agent's harness is offline, the room says so under your message. | … the space says so under your message. |

"Make room in its context" stays: there it means capacity.

## Docs (call 4)

The pages written for people, every "room" meaning a conversation: Start (index, install),
Supervise, Operate (mobile 38, people 21, notifications 15, cli 10, desktop 7, mac-mini 1) and
Enterprise (1); and the two SDK samples' words ("a room to say hello in", "In this room: …"),
which follow call 2.

## Staying as it is

- "Make room in its context", "room to grow", "room enough": capacity.
- The demo's "private room" at Osteria Verde: a room in a restaurant.
- Code, test ids, the wire, the database, file and folder names, and the agent's copy of a
  project at `<folder>/room` (renaming it would strand copies that exist).
- `chipsd upgrade one-room`: a command's name.
- Log lines only an operator reads (`gateway.ts`), comments, ADRs, STATUS and reviews: history
  keeps the words it was written with.
- Schema descriptions in `packages/protocol` and the docs' Concepts, Connect and Reference pages
  (call 4).
- The bridges in their own repositories (OpenClaw, Hermes, OpenCode, Codex) and Jacobian: not
  this change; anything they print is a follow-up.
