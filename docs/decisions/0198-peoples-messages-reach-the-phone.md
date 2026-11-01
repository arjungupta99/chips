# 0198. People's messages reach the phone

Date: 18 October 2026
Status: Accepted, 18 October 2026. Built as Phase 5 of
[the invited-people plan](../proposals/invited-people-plan.md), which Arjun asked to be built and
executed ("please build the detailed technical plan with phases and then execute").

## Context

A push came for a decision, for an agent's @ (ADR 0158), for a join request, and for agents
pausing. A person's message never pushed: `notify-mention.ts` returned for anything but an agent.

The guest walk (18 October 2026) found what that means for an invited person. Priya invites a
friend to Japan trip. The friend joins, closes the app, and Priya writes "Can we fit a day in
Nara?". The friend hears nothing. The only question the app ever asked them was "Hear when an
agent needs you?", which is not why a guest came.

## Decision

1. **A word per room.** A person's notification settings gain `spaces`: a level for each room,
   by space id.
   - `all`: every message in it.
   - `mentions`: only what @s them. This is the default, and what a room did before.
   - `none`: nothing from that room. A decision is still the Decide tier's.

   It is optional on the wire. An app older than this saves settings without it, and the server
   keeps what was saved (`PUT /v1/me/notifications`).
2. **One notifier for every message.** `notify-message.ts` replaces `notify-mention.ts` and runs
   on every `message.post`, a person's or an agent's (`messageRecipients`). It pushes each person
   in the room but the speaker who is either:
   - @'d by it, unless that room is `none`; or
   - hearing everything in that room (`all`).

   An agent's words also need its harness's word to be everything, as before (ADR 0158). Quiet
   hours hold it back; a message never breaks through. The claim key is `message:<message id>`,
   so a person hears a message once whichever phone wins. Since one notifier decides, an agent's
   @ of a person who hears everything is still one push.
3. **The words.** The fixed words are "A message for you" for an @, and "A new message" for a room
   heard in full, with "Open Chips to read it." A phone with a key gets the speaker's name, the
   room's and the words sealed to it (ADR 0158), and the data carries `device_id` (ADR 0197).
4. **The phone.**
   - The room's sheet has a Notifications row, under Files: "Every message", "Only @ you" or
     "Off". Its page saves at once and turns back, as Lead's does.
   - A guest is asked "Hear when someone writes?" once they are in their room, in place of "Hear
     when an agent needs you?". Yes turns pushes on and sets that room to `all`. A no from iOS
     changes nothing.
5. **The web: nothing.** Its banners come from what waits, not from messages.

## Consequences

- Nothing changes for anybody who chooses nothing, except that a person's @ now pushes as an
  agent's did.
- A room set to `all` with a talkative agent pushes each of its messages; the harness's word,
  "decisions only", quiets it without quieting the people.
- You has no page of rooms. The room's own sheet is where the choice is made. A list on You can
  come later if people want one place for all of it.
