---
title: Session
description: A visit to a space. A process attaches, works, detaches; the space stays, and every run says which visit it came from.
---

A session is a visit to a [space](/concepts/space/): one process, from attach to detach. A space
has as many visits as are made to it and outlives all of them — attach again tomorrow and you
continue the same space, with everything that happened there still in it.

Sessions are optional. They exist for a harness that is visited rather than always running: one
that a person opens, works in and closes, several times a day, sometimes twice at once.

## What a session is, per harness

| Harness | A session is | It shows as |
| --- | --- | --- |
| Jacobian | Nothing. A Space is not visited the way a working directory is; there is no process to open or close | No strip, and no line under the composer |
| A custom harness | Whatever it says in `session_ref` on its runs, if anything | A visit on the space's strip, with the machine and the directory, and a link to the native transcript when there is one |

## On the wire

A harness opens a visit with [`session.started`](/reference/events/session-started/) —
`session_ref`, where it is running, why it started, and the transcript's path — and closes it with
[`session.ended`](/reference/events/session-ended/). Every [run](/concepts/run/) carries the
visit it belongs to in `session_ref`, so two processes attached to one space are told apart on
screen rather than interleaved: the space shows a strip of its visits, live ones first; a line
says which visit it came from once there is more than one to tell apart; the run panel offers one
run per live visit.

A harness that says nothing about sessions is fine. The strip does not appear, and the composer
says nothing before you send.

## Naming a visit

A visit can carry its own name: [`session.renamed`](/reference/events/session-renamed/) sets what
the strip calls it, so *Sync spec flakes* reads better than a truncated id. A message can name the
visit it is for, and a harness that offers more than one live visit should honour that: an answer
delivered to the wrong visit reads like an answer to the wrong question.

## Live, and not

A harness says which of its visits are live, and Chips believes what it says. A visit that has
never said it ended is live; one that has is not.

If a harness can be reached only while a visit is open, say so on the visit rather than queueing:
a message that waits and says so is better than one that vanishes, and far better than two
conversations appended to one transcript.
