# 0300. The harness decides what to ask, and Chips's rules are a switch on each harness

Date: 18 November 2026
Status: Accepted, 18 November 2026, on Arjun's "Yes, build it" of the plan "Harness first, Chips's
rules if you want them" (https://claude.ai/artifact/Mr3RWeBe8GbdeQZs2Cc7Qq, source
`chips-notes/mocks/harness-first-permissions/`), with his "only claude bypass permissions should
show yellow banner" and his split of the page into a main page and two pages behind it.
Changes ADR 0299; extends ADRs 0195, 0239 and 0281.

## Context

ADR 0299 drew both gates on one page and gave Chips more of its own: rules you write, rules for
every harness, a snooze and a switch-off, the big ones, Let it work beside them. Arjun found it
confusing ("So we do not have permission at the Agent detail level, but there is setting in the
harness detail page, to set permission for space?") and then asked for less: "The permission
policy should only live with the harness. Chips should just ask what the harness asks." Then:
"I want a new plan, one that combines the previous and this. I want to be able to turning off /
on chips policy."

Two facts shaped it:

- **Chips only ever sees what the harness asks.** Its rules can answer an ask, never make the
  harness ask about something its own settings let through. So with Chips's rules off nothing
  is lost that Chips could have stopped.
- **A Chips pause let `rm -rf` and `git push` through.** A hold and Let it work are `*` allow
  rules, and a command never counts as "matters" (ADR 0195), so the never list (ADR 0239) only
  ever kept standing *rules* off those commands, not a pause.

The live workspace on 18 November: one harness (the Claude Code bridge's) had Chips rules, all
from Always answers, and its agent Builder a Let it work kept on; no harness had a hold; the
workspace had no rules and no hold.

## Decision

1. **Each harness has a Chips's rules switch.** Off, Chips answers none of that harness's asks:
   every ask goes to a person, with routing, expiry (a no) and the record as before. On, the
   engine runs as it does today for that harness: its rules, its pauses, the level.
   - Kept as `chips_rules` on the harness's everywhere policy (`policy.updated`), owners and
     admins only (SEC-1), as a hold is.
   - **When it was never set**, it reads as on for a harness that has a Chips rule, a hold or a
     level above L1 (the trust dial's preset, in any of its rows), or whose workspace has rules or
     a hold, and off otherwise. A new harness starts off, and nothing anyone set stops working. No
     migration writes events for it, so a replay of the log gives the same answer.
   - Off keeps the rules where they are; the engine just doesn't read them. On reads them again.
2. **Stop asking never says yes to the never list.** A pause (a hold, Let it work) no longer
   allows a command any part of which starts with a never-list command or which the protocol's
   reader can't read; that ask goes to a person. Written rules and Always rules were already
   kept off those commands.
3. **A don't-ask-again is kept by whoever has the rules.** With Chips's rules on, an Always is a
   Chips rule as before (a standing yes for how each part starts, never for the never list, for
   all the harness's agents). Off, the server marks the answer `keeps: "harness"` on
   `approval.resolved`, writes no rule, and the SDK hands it to the bridge as `Decision.keeps`;
   the bridge answers with the harness's own always. A bridge on an older SDK sends the harness
   Yes once for a command, so the app leaves Always out for a command
   (`HARNESS_KEEPS_COMMANDS` in core) until SDK 1.0.10 and the bridges that read `keeps` are out;
   for an ask that isn't a command, it offers Always as before.
4. **The page splits in three.** A harness's Permissions is a short main page: the gates, the
   yellow banner only while Claude Code is in Bypass permissions, "Where it's set" with two rows,
   and Asks so far.
   - **<Harness>'s settings** opens its own page: its mode (Claude Code, Codex), the notice, and
     what its settings let through, always ask and never run, each with where it's kept.
   - **Chips's rules** opens its own page: the switch, then Stop asking (1 hour, 8 hours, until
     tomorrow) and the rules, with Add a rule. Turning the rules off ends a hold that is running.
   - On the phone they are pages; on the iPad, the web and the Mac they open beside the list.
5. **Yellow is Bypass's.** The room's band and the gold value show only while Claude Code runs
   in Bypass permissions. A Chips pause is a plain line in the room, with Ask again.
6. **Gone from the apps:** Ask before it acts and its snooze (now the harness's mode, and Stop
   asking), Every harness under You, Approve and snooze on the ask, the big ones, the trust dial
   on the harness page, and Let it work… on an agent's own page. The server still reads workspace
   rules and holds that exist, for a harness whose Chips's rules are on.
7. **An agent's Permissions row opens its harness's.** An agent has no permissions of its own.
   An ask's card still offers Let it work while the harness's Chips's rules are on (ADR 0281), so
   while such a yes holds the agent's card shows a second row, **Working without asking**, which
   opens the agent's own page (ADR 0286): what it is doing, Stop, and its banner. Without that
   row, an agent whose banner was closed could not be stopped from any screen.

## Consequences

- The simplest setup is one gate: the harness's own settings, with every ask it sends brought to
  a person. Chips's rules are there for those who want Chips to answer some asks, and give a
  quiet hour to harnesses with no modes (OpenClaw, Jacobian, Hermes).
- The `rm -rf` gap closes for every harness, on or off.
- `policy` gains `chips_rules`; an approval decision gains `keeps`. `CATALOGUE_LEVEL` is
  unchanged: an older app reads no new event.
- The bridges need SDK 1.0.10 to pass a harness's own always through and to switch modes; until
  they ship, off means "Yes" and "No" for commands, and the mode is shown, not changed. The ACP,
  OpenCode and Hermes bridges read `Decision.keeps`; OpenClaw reads `keeps` off the event, so it
  needs no new SDK.
- A spec of Chips's rules starts its harness with them on through `POST /v1/dev/harnesses`
  (`chips_rules: true`), a dev-mode route on loopback only.
