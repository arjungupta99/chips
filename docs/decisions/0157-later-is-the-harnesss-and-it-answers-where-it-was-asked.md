# 0157. Later is the harness's, and it answers where it was asked

Date: 13 October 2026

## Status

Accepted (Arjun, 13 October 2026: "Proceed with plan and execution", after the readings below).
The build is `docs/proposals/schedules-plan.md`.

## Context

Arjun asked whether schedules work with Chips: "remind me about an event at 10am", "message me
when XYZ task completes", "perform a certain task at 2 o'clock or after 50 minutes".

Chips is ready for them on the wire. A harness may `message.post` into a room with no run and no
person's turn before it (`requiresRun: false`), or open a run of its own with `run.started` and
no `goal_from`. The heartbeat (ADR 0143) is exactly that, timed by the harness. Nothing at the
door asks why a harness speaks.

Both harnesses keep real clocks, and both lose what they say when a clock fires (readings,
13 October 2026):

- **Jacobian.** `create_reminder`, `create_watch` and `create_schedule` send to the first Telegram
  user, which is hard-coded, so a reminder asked in Chips arrives on Telegram. A `worker_schedule` turn
  has no person, so its answer is stored and said to nobody. "10am" does not parse, and the model
  is told the date but never the time.
- **OpenClaw.** Its automations run, but the bridge maps no `cron:` session to a room and ignores
  what a `current` job commits to the room's conversation. An `at` time with no offset is read as UTC.

Chips, for its part, tells an agent nothing about the person's clock. The only zone it holds is
the phone's, kept for quiet hours.

## Decision

1. **Chips keeps no clock of anyone's.** A reminder, a schedule or a watch belongs to the harness.
   The harness keeps it, fires it, and when it fires speaks **in the room it was asked in, as the
   agent that was asked**:
   - words that need no turn, such as a reminder, as a `message.post`;
   - work as a run of its own: `run.started` with no `goal_from`, its steps and messages, then
     `run.completed`.

   Nothing is added to the wire.
2. **What it says is for the person who asked, so it @s them.** The handle comes from the room
   note. The @ does two things:
   - it keeps the words from being handed to the room's lead as nobody's turn (ADR 0104);
   - it pushes to the person's phone (ADR 0158).

   A `NO_REPLY` says nothing, as it does in any turn (ADR 0105).
3. **The note gives each person's clock.** Each person in `room.members` gets `time_zone`, the
   IANA zone of the phone they registered most recently for pushes. The note says the time there
   as Chips sends the turn, after the room line:

   > Arjun's time now: 9:12 am, Tuesday 13 October 2026 (2026-10-13T09:12-07:00,
   > America/Los_Angeles).

   Several people get one line, each by name. A person with no registered phone has no zone, and
   the note says nothing of their clock. The note is part of the turn, not of a harness's cached
   system prompt, so a clock that changes every minute costs no cache.
4. **A harness writes times with their offset.** Chips's guide for harnesses ("Speaking later")
   says how to speak on one's own, and that a time given without a zone is the harness's
   machine's, not the person's.

## What is left out

- Seeing or cancelling a harness's schedules in Chips. That would be a registry of copies, as the
  heartbeat's is (ADR 0143), and comes when it is asked for.
- Chips waking a harness that is down. The harness fires late, or not at all, by its own rules.
- A zone for someone with no phone. When asked for, the browser and the Mac can send theirs.
- A person @ing another person. ADR 0158 covers agents' @s only.

## Consequences

- Most of the work is in the harnesses (the plan's Phases 2 and 3). Chips's own part is the clock
  and the guide.
- A run nobody started counts toward the job begun at the person's last act (ADR 0117). A
  recurring schedule in a room nobody writes in reaches the room's ceiling and is held, which
  bounds a schedule that runs away. A person's message starts a new job.
- The zone travels with the phone. On a trip, the note says the time where the phone is once it
  next registers, which it does at each start.
