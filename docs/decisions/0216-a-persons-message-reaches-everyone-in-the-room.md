# 0216. A person's message reaches everyone in the room, whoever it was for

Date: 20 October 2026
Status: Accepted, 20 October 2026, on Arjun's word: "I think we should send the notification even
when a message was sent to agent". Changes the default of ADR 0198's word per room, and adds a
level to it.

## Context

Arjun, 20 October 2026: "I sent a message in the Foodie space which is shared with my wife. the
message was sent to agent, but my wife did not get any notification. When I sent the message
specifically to my wife, then she got."

Read from the live server: Natalie is a guest in Foodie, with an iOS phone registered and a
sealing key, and she has never saved notification settings. So Foodie was at ADR 0198's default,
`mentions` ("Only @ you"). Arjun's message was for the room's agent (ADR 0081), named nobody, and
pushed nobody. His message picked for her (ADR 0204) counted as an @ and pushed her.

A room shared by people is a group chat to them. What one of them asks the agent is news to the
others, as it would be in any messaging app. ADR 0198 kept `mentions` as the default because it was
what rooms did before, and left a guest to say yes to "Hear when someone writes?" to hear more.
Natalie never saw that ask, and a member is never asked it.

An agent's words are another matter. A room's agent may say several things in one turn, and every
one of them pushing everyone would be noise. ADR 0198 already lets a person hear those with
Every message.

## Decision

1. **A new level, `people`: People's messages.** A room at it pushes a person whatever another
   person writes there, whoever it was for (an agent, the room, somebody else), and what an agent
   says there only when it @s them. An agent's @ still needs its harness's word to be everything
   (ADR 0158).
2. **It is the default.** A room nobody chose for is `people`, on the server (`roomLevel`) and on
   the phone (`levelOf`). A room somebody chose for keeps what they chose: Only @ you still means
   only an @ or a pick, Every message still means agents' words too, and Off is off.
3. **The words.** "A new message" for what a person wrote that did not name you, "A message for
   you" for an @ or a pick, as before.
4. **The phone.** The room's Notifications page offers four: Every message ("Whenever anyone writes
   here, agents too"), People's messages ("When a person writes here, or an agent @s you"), Only @
   you, and Off. The row on the room's sheet says People's messages until one is chosen.
5. **The guest's ask is unchanged.** Yes to "Hear when someone writes?" still sets the room to
   Every message.

## Consequences

- Everyone in a room shared by people hears the others' messages with no setup. A person in a
  room with only agents hears nothing new.
- The change is on the server: Natalie's phone, and any phone on an older build, gets these pushes
  once 4431 runs it. An older build's sheet still calls the default "Only @ you" until it updates.
  It has no name for `people` either, and its room sheet fails to draw for a room saved as
  `people`. Since the default is stored as no word at all, that happens only to a person who picks
  People's messages on a new build and opens the same room on an older one.
- Quiet hours, a hidden room (ADR 0205) and the claim ledger (one push per person per message) work
  as before.
