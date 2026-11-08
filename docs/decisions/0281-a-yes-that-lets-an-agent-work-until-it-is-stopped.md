# 0281. A yes that lets an agent work until it is stopped, and an hour that covers everything

Date: 6 November 2026
Status: Accepted, 6 November 2026, on Arjun's "Go with B" after the mock "Let it work"
(https://claude.ai/artifact/DHPgLb3RCJztdKeNNktGBG). Amends ADR 0239's addendum of the same day
(For an hour), and builds on ADRs 0195 and 0280.

## Context

In "Chips explain", at 1:50 AM on 6 November, Arjun gave Jiro (Claude Code) an hour. Its next five
commands went ahead on their own, each in under ten milliseconds. The sixth asked anyway: it was a
`for … do … done` loop over four bridge READMEs, and the hour as built covered only commands Chips
reads part by part with nothing on the never list. Nothing was wrong with the hour; it was built
narrower than he meant it. He wrote: "We need an option of full approval, that allows agent to work
without nag".

The mock offered three ways: the hour made to cover everything (A); A and a switch that lets the
agent work until it is stopped, with the room saying so the whole time (B, the pick); and the
harness's autonomy dial shown on Claude Code's page (C), the widest, with nothing in the room
saying it is on. He picked B.

The web and the Mac had a second fault under the first: since 6 November their For an hour sent a
plain yes, because the shell that sends a card's answer dropped `forMinutes`. The one hour the
server ever kept came from the phone.

## Decision

1. **For an hour covers everything the agent asks in that space.** Read or not, `rm` and
   `git push` included, and asks that are not commands. It is kept as a rule for every kind (`*`)
   with no starts and no flags, made by a person's answer, so the policy engine never lets it allow
   an ask that matters (ADR 0195): money, a message to someone outside, anything marked as not
   undoable, a hot risk. The door no longer looks at the command for a yes that holds on; it still
   refuses one for an ask that matters, from a harness, with another scope, or as a no.

2. **Let it work: a yes until stopped.** `approval.resolved` gains `until_stopped: true`, given as
   For an hour is: once, a yes, by a person, never with `for_minutes`. Chips keeps it as the same
   kind of rule with no end: a `session_rules` row with the approval's space and the asker, and
   `until` null. A row with a space is a yes that holds on; a row without one is This session, read
   by its run (`sessionRules` now asks for no space, where it asked for no `until`).

3. **Stop.** A new event, `approval.held_stopped` (workspace, from a person, `asker` and the
   envelope's space), ends every yes still holding there for that asker: the rows' `until` becomes
   the stop. Anybody in the space may send it, since it only brings the asks back to a person; a
   harness may not.

4. **A held yes comes after the harness's own rules.** The engine reads This session, then the
   harness's rules in the space and everywhere, then the held yeses. A no a person set, for a kind
   or for how a part of a command starts, still wins; a cap below L2 still lets nothing through.

5. **The tray.** Over the choices, one switch: "Let Jiro work without asking — In Chips explain,
   until you stop it". On, the choices fold away, a line says what goes ahead and what still asks,
   and Approve says "Approve and let it work"; pressed, it turns to "Until you stop it". It is there
   for every ask but one that matters, as For an hour now is; a command that keeps no Always offers
   Once and For an hour, and under Once says why there is no Always (`There is no Always for asks
   that use rm.`). The phone's switch is the platform's; the web's and the Mac's is the card's own,
   gold when on.

6. **The band.** While a yes holds, the room shows a gold band under its name: `Jiro is working
   without asking`, and for an hour `… until 2:50 AM`, with Stop. Stop says `Stopped. Jiro asks
   again from its next step.` for a moment and folds away. The client folds the held yeses from the
   events it already has (`Space.letWork`, core `lettingWork`), so no new read is needed.

7. **You.** Allowed always lists who works without asking now, in which room and until when, with
   Stop, above the Always rules.

8. **The web's and the Mac's hour is sent.** The shell passes `forMinutes` and `untilStopped` on.

## Consequences

- A yes for an hour now reaches commands it did not before. The never list keeps its meaning for
  Always only.
- An agent let work until stopped holds across runs, restarts and days, until somebody stops it.
  The band and You's row are how it is never forgotten.
- No migration: `session_rules` already had `space_id`, `participant_id` and `until` (0060).
- C, the dial on a harness's page, is not built.

## Addendum, 8 November 2026: a client offers these only to a server that keeps them

The App Store's phone is newer than some servers. A server from before this decision and the
hour's addendum to ADR 0239 reads `approval.resolved` with a schema that drops what it doesn't
know, so `for_minutes` and `until_stopped` went and the answer stood as a plain yes, while the card
had said "Until 12:08". The agent's next ask came to the person anyway.

The server's `hello` now says what it keeps, in `server.takes`: `held_yes`, for those two fields. A
client without it in the hello offers neither: the choices are Once and Always, or the line that
says why an ask is answered once, and there is no switch. Before a hello has come the choices
stand, so a card opened from the cache doesn't lose them for a moment.

By what it says it keeps and not by its version, because a server run from source says `0.0.0`.

An Always on such a server stays offered. It keeps the older, narrower words (`cat README.md` where
the card lights `cat`), so a later command may ask again. It lets nothing through that the card
didn't say.
