# 0187. The workspace sets when Chips steps in on agents

Date: 17 October 2026
Status: Accepted, 17 October 2026, on Arjun's "yes, build it" for option 2 of the mock "Messages
between agents" (version 5). Amends 0097 (its fixed 8, 16 and 48) and 0092 (the room note's last
sentence).

## Context

The referee (ADR 0097) counts the messages agents send each other in a room since a person last
acted there, or an agent last made something new. It tells them the count from 8, tells them to
stop and say what is done from 16 or on a circle, and holds their messages to each other from 48.
All three were constants in `packages/protocol/src/exchange.ts`.

On 16 October 2026 Arjun asked what the limit was, and whether You should set it or turn it off.
He picked option 2, a workspace setting in the group only owners and admins see, beside
Attachment limits (ADR 0047), then: "the tells them to stop / pause limit needs to be adjustable
as well". Mocked at phone width (private artifact `6bj4scWuxiwUttnndsrDyh`, versions 1 to 5). His
calls, 17 October:

- The count follows the stop: told from half of it, from 8 when there is no stop. No row of its
  own.
- "Keep the circle warning but add a on off switch".
- Workspace only, for now.
- The choices as mocked: stop 8, 16, 32, 64, Other (4 to 500), Never; hold 24, 48, 100, 200,
  Other (10 to 1,000), Never. The stop stays under the hold.
- The sheet says why it is there, and how Chips counts.

He also asked why every turn's room note said the hold ("After 48 messages between agents with no
person acting, Chips holds them until one does"), and agreed ("Yes") it should go: a leftover of
the four-message guard, when the hold came early and often. The warning says the hold when it
matters.

## Decision

1. **One workspace event carries all three**: `exchange.limits_set` with `stop` (4 to 500, or
   null for never), `hold` (10 to 1,000, or null) and `circles` (a boolean), sent by a person, no
   space. The last one in the log is the workspace's word; until there is one, Chips's own
   numbers hold: stop 16, hold 48, circles on (`DEFAULT_EXCHANGE_LIMITS`).
2. **Only an owner or an admin sends it** (`authorize.ts`), and the door refuses a stop at or past
   the hold (`refuseLimits`, by the protocol's `limitsProblem`): Chips would hold the agents before
   it told them to stop.
3. **The referee reads the limits as of each message** (`limitsAsOf` in
   `server/src/infrastructure/store/exchange.ts`; `limitsInLog` in the conformance fake): the
   newest set at or before the message's place in the log. A replay from `since` says what was said
   live, and a change counts from the next message. No projection, no migration: the read is one
   indexed query beside the count's.
4. **The stages take them** (`stageOf`, `holds`, `exchangeFactsOf`): told the count from
   `nudgeAt` (half the stop, at least 2; 8 with no stop); warned at the stop, or on a circle while
   circles count; held at the hold, or on a pause. No stop is never a warning on a count; no hold
   is never a hold on a count; a person's pause still holds them; circles off is never a circle
   (repeats are still told, as facts).
5. **`allowance` can be absent**: the facts, the held ack and the SDK's held report carry the hold
   only where there is one. The warning's last sentence ("Messages between the agents are held
   after N.") goes with it. Connectors that read `allowance?` already (Jacobian, the bridges) need
   nothing; with Chips's own numbers nothing they see changes.
6. **The room note no longer says the hold.**
7. **Every client draws the room's line at the workspace's stop**: core's `exchangeLine` takes the
   limits the model folded (`model.exchangeLimits`), so the phone and the web warn where the
   agents were told to stop.
8. **On the phone**, a row "Messages between agents" with the settings under it ("Stop after 16 ·
   hold after 48", and "circles off" when they are) opens a sheet: why it is here; Tell them to
   stop after, six chips; Stop them when they go in circles, a switch; Hold them after, six chips;
   a ladder of what happens in a room at those numbers; How Chips counts, a disclosure; and Save,
   there once the sheet says something new and whole. Other opens a number field with its range.
   A hold picked at or under the stop takes the stop down to the next choice under it; stops that
   would cross the hold are greyed.
9. **On the web and the Mac**, a card under the workspace's heading with the same parts: two
   segmented choices, Other's field, the switch, the settings as a sentence, Save, and How Chips
   counts behind a `details`.
10. **The words are core's** (`packages/core/src/model/exchange-limits.ts`): the row's, the
   sentence, the ladder, the why, the how, the draft and its rules, so the phone and the web say
   the same.

## Consequences

- A workspace whose agents do long work together can let them go further before Chips steps in,
  or not at all; one that wants them reined in sooner can. Circles can be turned off where agents
  repeat themselves by design.
- With the hold at Never, a room's Spend per job (ADR 0117) still holds agents whose harness
  reports what a run costs; others go on until a person pauses them. The sheet says so.
- Per-room limits are not built; a room's sheet would carry them beside Spend per job.
- The audit says who set what, as a policy entry.
- Tests: `packages/protocol/src/exchange-limits.test.ts` (stages, facts, notes at the workspace's
  numbers), `server/src/interfaces/ws/referee.test.ts` (the referee on the wire at custom numbers,
  Never, circles off, a change mid-stretch), `submit-event.test.ts` (who may set them, refusals),
  the conformance fake's parity, core's fold, line and draft, and the phone's and the web's
  screens.
