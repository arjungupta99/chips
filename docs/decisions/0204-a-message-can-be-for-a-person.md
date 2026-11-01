# 0204. A message can be for a person, and the field says who once a room has two others

Date: 19 October 2026
Status: Accepted, 19 October 2026, on Arjun's "Build as drawn" for the field and his "B · Answer
with everything" for Jacobian. Widens ADR 0081 (who a message is for) from agents to people, and
ADR 0113/0114's list (the mark from four, circles add) to hold them. Jacobian's half is its own
commit (`db00640` in Jacobian).

## Context

Arjun, 19 October 2026, after his first test with Chips on another person's phone: "check the
operation in Foodie space, agent did not reply. I think we need the Agent selector to show up
whenever there are 2+ other people / agents in the room (agent selector can also allow selection of
person) … make sure we do not get these dead responses".

Foodie had one agent, Restaurant Tracking (Jacobian's), Arjun, and Natalie, who had joined by an
invite at 12:17 PDT. Read from the live log and Jacobian's:

- **Her four messages went to the agent and nothing answered.** Chips addressed each to Restaurant
  Tracking (ADR 0081: the room's only agent) and handed it over. Jacobian's Chips channel answers
  its owners only (`isAuthorized`), and logged "Ignored a Chips message from somebody who is not an
  owner" four times. Chips's watch (ADR 0083) said "hasn't picked this up" with no reason. The
  OpenClaw bridge, `chips-acp`, Hermes and OpenCode take anyone's words; only Jacobian gated.
- **She could not say a message was for Arjun.** The field said who a message was for only in a
  room of two agents or more. In a room of one agent and people there was nobody to pick, so
  "How's it going?", meant for Arjun, went to the agent too.
- **The line under her message drew the agent's face over hers** (his "also check this icon
  overlap"): the wait line's words did not shrink, so its face was pushed into the author's column,
  and the author's face was aligned to the bottom of everything under the bubble.

Mock, with the rule table and stills of the open list and the wait line:
https://claude.ai/artifact/4ueKErBMETt7hRRaTQipB1.

## Decision

1. **A message can be for a person.** `resolveAddress` takes the room's people (`people`). A
   person's message is for the people its @s name, or, with no @, those the sender picked in `to`;
   never the sender. They go out as `addressed_people` on `message.post` beside `addressed_to`, and
   the server fills it as it fills `addressed_to`. A message for people alone is for no agent: no
   agent takes a turn, and an agent still hears it as it hears any message in the room. An agent's
   message names no people this way; its @s still tell them (ADR 0198).
2. **A person a message is for is told as an @ tells them**: `notify-message` counts
   `addressed_people` with the mentions (ADR 0198's default, "mentions"), so a pick pushes as an @
   would.
3. **The field says who once the writer has two or more others here, people or agents**
   (`othersIn`), on the phone, the web and the Mac. The list holds the agents first, the lead first
   among them (ADR 0104), then the people, as circles too, and Everyone held at the foot. A circle
   adds, a name picks alone, and a pick is kept for the draft (ADR 0114).
4. **Everyone is everybody here**: its faces are the agents and the people, and it is counted by
   kind ("To Everyone, 1 person, 5 agents"; `countedWords`). It goes as `all`, so every agent takes
   a turn, and it pushes nobody new: people read every message anyway, so its line names no person
   (`aimedAt`). Its row says who answers: "Both agents answer", "Restaurant Tracking answers".
5. **The default is as before for agents, and keeps a person picked.** With nothing said, the field
   aims where the server's rule would (ADR 0081): in Foodie, Restaurant Tracking. Once a message
   went to somebody by name with a person in it, the next goes there too (`nextAim`), as a picked
   agent stays picked.
6. **The route over a message says its people too**, their faces after the arrow; a room of two,
   where nobody has a second to aim at, draws none. Two agents in a room with a person are not
   Everyone: "Went to Scout and Ledger" (Everyone is inferred no longer; it is what the line says,
   `addressed_to_all`).
7. **`to` may name people** (`memberId`: an agent, a harness or a person). A `to` of people alone
   gives no agent a turn and is not "nothing picked"; a removed person is no longer somewhere a
   message can go.
8. **Jacobian answers anyone in a room one of its owners is in, with every tool** (Arjun's B; he
   declined A, which held back mail, calendar, contacts and reminders). The turn runs as that
   owner, so its thread, approvals and bubble are the owner's, and the words it is handed say who
   asked: "Natalie (a person Arjun shares this room with) said this to you". Commands (`/new`,
   `/model` and the rest) stay the owners'. A room no owner is in is still refused, and logged as
   that. Feedback on a reply goes to the owner's session.
9. **The line under a message stands past the speaker's face** (`Line.tsx`, `Waits.tsx`): the
   face sits beside the bubble alone, and what is said under it (tags, heard by, the wait line)
   starts where the bubble starts; the wait line's words shrink, so its face never leaves its line.

## Consequences

- Natalie's four messages from before stay unanswered: Jacobian refused them when they came, and
  Chips does not hand a message over twice. She asks again.
- The field draws in more rooms than before: every room of one agent and one other person. Its
  default there is the agent, as the server's rule was, so a message goes where it went before
  unless somebody is picked.
- A line's people come from the server; the clients draw them from the send until Chips says, as
  they do its agents. Everyone names no person on the line, from the send and from the server alike.
- An agent message from a harness that is not Jacobian's owner's is still ignored by Jacobian's
  channel (`onAgent`). Not seen in Foodie; left as it is.
- The conformance kit's workspace fills `addressed_people` as the server does, so a harness built
  on the kit sees what Chips sends.

## Addendum, the workspace's owner is not offered Leave (19 October 2026)

Arjun, on Foodie's sheet, which offered him **Leave Foodie**: "owner should not be offered to
'leave room', it is fine for guests and members. Maybe we have a 'hide room' option later which
groups these rooms in a special section similar to archived rooms, notification for these rooms
would be suppressed."

- **The sheet offers the workspace's owner no Leave**, on the phone, the web and the Mac
  (`mayLeave` in core, which both sheets ask). The agents in his rooms are his harnesses', and
  Jacobian answers a room only while one of its owners is in it (decision 8): his leaving would
  end the room's answers for everybody else in it. An admin, a member and a guest may still leave,
  where somebody else is in the room to add them back, as before.
- The role is the workspace's (the model's, as the sheet's Owner is), not the room's: a member who
  made a room may still leave it.
- Only the offer goes. `/leave` typed in the field still leaves, and the server still takes it.
- **Hide a room** (a section of its own like Archived, its notifications quiet) is his idea for
  later, not built here.
