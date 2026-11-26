# 0302. A harness's own notice is its harness's, under a small tag

Date: 23 November 2026
Status: Accepted, 23 November 2026, on Arjun's "Keep A". He had chosen "a bubble with a small
tag", as the Heartbeat tag is drawn, over a label in the words. The mock offered two layouts
(<https://claude.ai/artifact/QtuCh4GZ9C5texyKu4LoEu>): A, the name in the bubble, and B, the name
beside the tag. Builds on [0143](0143-an-agents-heartbeat-is-its-harnesss-switched-and-timed-in-chips.md)
(the Heartbeat tag). Amends [0081](0081-chips-says-who-a-message-is-for-and-only-they-take-a-turn.md)
(who a message is for) and [0104](0104-a-room-has-a-lead-and-chips-wakes-it.md) (what the lead is
handed).

## Context

Some of what a harness posts isn't written by any model. Jacobian's code posts notices into rooms:
every morning, "Last night's memory pass retired 5 facts and corrected 1 in 3 Spaces: …". It
posts them as the room's agent, so in [J]'s room they read as [J]'s own words. Arjun replied "Give
me details" to one and couldn't tell who the message was from.

Chips already marks one kind of message a person didn't ask for: a heartbeat's check-in (ADR 0143).
That message is still the agent's words, written on its own. A notice has no agent behind it at
all. On Telegram, Slack and Discord, which draw nothing of their own, Jacobian labels these posts
"Jacobian · <what posted it>". Chips draws its own look.

Nothing here is Jacobian's. Any harness whose code posts into a room can send a notice: a nightly
pass, a sync, a scheduler.

## Decision

1. **The mark.** `message.post` gains `notice`, 1–60 characters. It means the harness's own code
   wrote the words and no agent did. The value says what posted them, in a few words, for example
   "Nightly memory pass". Only a harness credential sends it, as itself or as one of its agents. A
   person's credential is refused with `wrong_direction`, as for a heartbeat's check-in.
2. **Who it is from.** A notice is drawn as the harness's. Core's `saidBy` gives the agent's
   harness for it, from the directory. When the directory doesn't hold the agent yet, it gives
   the author. One function now decides, for the web, the phone and the media viewer, which had
   each kept a copy. It sets the name, the face where faces are drawn, the turn a line joins, and
   the name on the card of a reply that quotes it. So a notice never joins its agent's turn.
3. **How it looks: layout A.** A normal bubble with a tag over it. The tag holds the cog from the
   icon set and the notice's words, on the grey the other tags already use. It never takes the
   Heartbeat tag's gold. The harness's name sits in the bubble's top left, where a name always
   goes, and a notice shows it in every room, a room of two included. Together it reads
   "⚙ Nightly memory pass" over a bubble that starts "Jacobian". The tag keeps the words as sent:
   the web's other tags are in capitals, and sixty characters in capitals would shout.
   - The tag's title on the web and its accessibility label on both say, for example, "Jacobian
     posted this on its own: Nightly memory pass. No agent wrote it." (core's `noticeWords`).
   - Chips for Mac draws the web's room, so it draws the same.
4. **Who it is for.** Chips addresses a notice to nobody, whatever its @s, its `to` or the
   message it replies to name (`resolveAddress`). No agent takes a turn on it. An agent at work
   in the room may still overhear it (ADR 0106). The referee never holds one, as it goes to
   nobody (ADR 0097). When the room goes still, its lead is not handed the notice (ADR 0104).
   When the sweep walks back to see whether an agent's words answer a person, it passes over a
   notice, as it passes over a person's aside.
5. **A reply to it** goes where any reply to an agent's message goes (ADR 0081): to the agent
   the harness sent it as. "Give me details" in [J]'s room reaches [J], so the harness can let
   [J] answer for it. The card over the reply names the harness, as the room does.
6. **An older Chips** takes the post and drops the field. `parseEvent` parses with zod's plain
   object, which strips keys it doesn't know, and the gateway logs the key as dropped. The post
   then shows as the agent's, as it did before. A harness may send `notice` before every computer
   has this. The SDK's `post()` doesn't carry it, as it doesn't carry `heartbeat`; a harness sends
   it with `send`.

## What is left out

- Layout B: the harness's name and the tag together over the bubble, which he passed over.
- A setting to mute notices, or to fold a run of them into one line.
- `notice` on the SDK's `post()`, which would need an SDK release.
- Anything on the agent's page or in search: a notice is found and read as any message is.

## Consequences

- The lines read `notice` from the event. There is no migration: the lead sweep reads it from the
  event's payload, as it reads the mentions.
- In a room of three or more, a notice shows the harness's face, which is otherwise rarely seen in
  a room.
- The phone draws the tag only from an app build that has it. The phone takes no over-the-air
  updates, so it needs a release (or a build installed on a device). Until then a phone shows a
  notice as its agent's words, as now, though the computer already sends it to nobody.
- The web and Chips for Mac draw it once the computer serving them runs this build.
