---
title: Speaking later
description: Reminders, schedules and "tell me when it's done". The harness keeps the clock; Chips takes what it says, in the room it was asked in.
sidebar:
  order: 6.5
---

A person asks an agent for something later: "remind me about the call at 10am", "check again in
50 minutes", "tell me when the build is done". Chips keeps no clock of anyone's. Your harness
keeps the schedule and fires it, by its own rules, and when it fires your agent speaks as it
would in any turn. Chips takes it with nothing in front of it
([ADR 0157](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0157-later-is-the-harnesss-and-it-answers-where-it-was-asked.md)).

## Speak in the room it was asked in

Remember the room (`space_id`), the agent that was asked, and the person who asked, when the
schedule is made. When it fires:

- **Words that need no turn**, like a reminder, are one `message.post` as that agent into that
  room. It needs no run and no person's message before it.
- **Work** is a run of your own: `run.started` with no `goal_from`, its steps and messages, and
  `run.completed`. The room shows it working like any turn. Use a new `run_id`, since a run that
  has ended takes nothing more.
- **Nothing to say** is `NO_REPLY`, or no post at all. A check that finds nothing new is silent.

## @ the person it is for

Write the person's handle in the text, `@Arjun`, from the room's `members`. That does two
things:

- The room's lead doesn't take it as nobody's turn. Words that name no agent and @ no person are
  handed to the lead once the room goes still
  ([ADR 0104](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0104-a-room-has-a-lead-and-chips-wakes-it.md)).
- The person's phone gets a push, with your words sealed so that only the phone can read them
  ([ADR 0158](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0158-an-agents-at-pushes-the-person-sealed-to-their-phone.md)).
  An ordinary reply that @s nobody pushes nothing, so @ the person only when they should look.

## Times

The room's note gives each person's time now, with its offset:

> Arjun's time now: 9:12 am, Tuesday 13 October 2026 (2026-10-13T09:12-07:00, America/Los_Angeles).

The same zone is on the member as `time_zone`. "10am" means 10:00 there, so write
`2026-10-13T10:00:00-07:00`. A time written without a zone is your machine's, or UTC, depending
on your scheduler, and neither need be the person's. A relative time ("in 50 minutes") needs no
zone.

## What it costs

A run no person started counts toward the room's job that began with the person's last message
([ADR 0117](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0117-a-room-has-a-spend-ceiling-per-job.md)).
A recurring schedule in a room nobody writes in reaches the room's ceiling and is held there,
until a person acts. If your harness chains turns itself, honour the `budget.warning`'s `pause`
by skipping a run in a paused room.

## What Chips doesn't do

- It doesn't list, change or cancel your schedules. The person asks the agent.
- It doesn't wake your harness. A schedule that fires while your socket is down is sent when it
  is back, and the outbox in the SDK resends what was not acknowledged.
