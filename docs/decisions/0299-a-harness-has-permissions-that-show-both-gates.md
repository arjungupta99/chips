# 0299. A harness has Permissions that show both gates, take rules you write, and can be snoozed

Date: 18 November 2026
Status: Accepted, 18 November 2026, on Arjun's "Build B" of the mock "Every harness gets a
Permissions page that shows what it runs on its own and takes rules you write"
(https://claude.ai/artifact/XcXucD4LY73GWUufvJ9VfK, source `chips-notes/mocks/harness-permissions/`),
with its second round, snooze and switch off, and his "Yes, off by default" for the big ones.
Extends ADRs 0195, 0239, 0281 and 0286.

## Context

Arjun asked how permissions work at the harness level and how to set them for Claude Code,
OpenCode and OpenClaw as a whole. There are two gates and Chips showed only the second:

1. **The harness's own settings decide whether it asks at all.** Claude Code reads
   `~/.claude/settings.json` and each agent folder's `.claude/`; OpenCode its `permission`
   config; OpenClaw its exec policy. What they allow never reaches Chips. The ACP bridge also puts
   every session in its config's `mode` (Claude Code's `default`, Codex's `workspace-write`), so a
   person's own Auto or bypass is overridden there.
2. **Chips's policy decides who answers what does arrive** (ADR 0008, 0195): workspace rules,
   then the harness's rules and holds, then the level.

What the live workspace showed on 18 November: Claude Code's settings let `git`, `curl`, `cp`,
`mv` and `find` run with no card, which covers `git push`, `curl` and `find -exec`, commands
Chips never gives a standing yes (ADR 0239); the harness page said "Asks every time". Claude Code
had sent 177 asks in four weeks, all answered Once; Chips could read 126 of them as nothing.
No rule existed, because a rule could only come from answering an ask. The bridges don't declare
`autonomy`, so no dial is drawn and they all sit at L1. The engine reads the workspace's rules
before any harness's, and nothing writes them.

He then asked for a way to snooze asking, and for switching a harness's asks off to be easy.

## Decision

1. **Every harness gets a Permissions page.** From the harness page's "Permissions" row (it takes
   the place of When it asks you, which it contains), from You → Permissions, and from the band.
   On the phone it is a page; on the iPad, the web and the Mac it opens beside the list, and New
   rule opens beside it (ADR 0284, Arjun's "minimise popups"). It says, top to bottom:
   - **Ask before it acts**, the switch (decision 5);
   - **both gates**, drawn as the harness, its settings, Chips and you;
   - a **notice** when what the harness runs on its own covers a command on Chips's never list,
     with the line to put in the harness's own settings to make those ask, and a Copy button;
   - **Runs without asking**, in plain words, from its own settings (decision 2);
   - **Chips answers**: the rules a person wrote or an Always made, each with its switch, and
     Add a rule;
   - **Always comes to you**: the promise that what matters waits, unless the switch-off includes
     it (decision 5);
   - **Asks so far**, the dots.

2. **A harness says what it runs on its own.** A new harness-only route,
   `PUT /v1/harnesses/:id/own-rules`, takes `ownRules` (protocol): where it was read from, the
   mode the bridge runs it in, whether it runs everything without asking, the entries it lets
   through (each a kind of work, the tool or program as the harness names it, and for commands
   the words it covers), and how to write an entry that asks instead, as a template. The server
   keeps the latest in the harness's registry row; `GET /v1/harnesses/:id/own-rules` reads it for
   its owner and the workspace's owners and admins. It is a report, not policy: Chips never
   decides anything from it. The SDK gains `chips.ownRules(rules)`; the ACP bridge sends Claude
   Code's and Codex's, OpenCode's bridge sends its `permission` config, OpenClaw's its exec
   policy. A harness that sends nothing reads "Doesn't say yet what it runs on its own". Core
   turns the entries into words and finds the never-list commands they cover
   (`ownRulesView`, `ownConflicts`), so Chips still names no harness (ADR 0051).

3. **A person writes rules.** Allow, Ask me or Never, for a kind of action and, for commands,
   for how each part starts; in every space or one space. They travel in `policy.updated` as
   Always rules do. The server now stamps `made_by` and `made_at` on every rule a person adds,
   whatever the client sent, so a written Allow never allows an ask that matters (ADR 0195). It
   refuses a person's new Allow that names a never-list start, an Allow on a command kind with no
   start ("Any command" stays out for a person, ADR 0239), and an Allow whose match is a
   wildcard: letting everything through is the switch's job. Ask me and Never take any match. New
   rule shows how many of the harness's past asks the rule would have answered, refused or still
   asked, as dots over those asks, read with the protocol's own command reader.

4. **Every harness has rules too.** A new event, `policy.workspace_updated`, carries the
   workspace's rules (owners and admins). The engine already reads them first. You →
   Permissions lists them under "Every harness". The same stamping and refusals apply.

5. **Ask before it acts is one switch with four lengths.** Turned off, it asks how long: 1 hour,
   8 hours, until tomorrow morning (9:00), or until it is turned back on. The first three are the
   snooze, the last the switch-off. While it isn't asking, Chips says yes for that harness in
   every space and for all its agents; each yes is still an answer in the log (gold dots). A
   Never a person wrote still holds. When the time is up asks come back with no notification.
   - Kept as `hold` on the harness's everywhere policy (`policy.updated`): `{until, matters,
     by, at}`, `until` absent for until turned back on. Snooze every harness is `hold` on the
     workspace (`policy.workspace_updated`). The engine reads both after held yeses, so a Never
     still wins, as a hold rule `*` → allow.
   - **The big ones** (Arjun, "Yes, off by default"): a hold leaves asks that matter to a person
     unless it says `matters: true`, which only owners and admins can set. Off by default; turned
     on, the page says in red what it lets through and the button reads "Stop asking about
     everything". The hold rule then carries no `made_at`.
   - Only owners and admins change a harness's policy (SEC-1), so only they snooze. A harness
     owner who isn't one still has Let it work for one agent in one space.
   - From the ask: "Approve and snooze all of <harness>" with 1 hour, 8 hours or until tomorrow.
   - Rooms show the gold band (ADR 0281, 0286) in the harness's words: "Claude Code isn't asking
     until 10:41 AM", with Ask again for those who may and ×.

6. **An older server keeps none of this.** Its hello doesn't take `harness_rules` (written rules,
   workspace rules, holds) or `own_rules`, so the apps leave out Add a rule, Every harness, the
   switch and the Runs without asking list against it.

## Consequences

- The page now says what Claude Code runs on its own, and when that covers what Chips would
  never let a rule allow. Chips still can't stop it: the line to paste goes in the harness's own
  settings. Writing it for the person (direction C in the mock) was weighed and left out: three
  rule languages, files shared with the person's own tools, and no record of what moves there.
- A rule can be made before the first ask, for one harness or every harness, and every written
  rule keeps the promise an Always keeps.
- Switching a harness off is two taps, and the record stays: Chips answers, so nothing is lost
  from Asks so far.
- `policyRule` gains nothing; `policy` gains `hold`; one new event; `CATALOGUE_LEVEL` goes to 2
  with `policy.workspace_updated` sent to an older app as nothing.
- Migration 0066 adds `harness_policy.hold` and `workspace_policy.hold`, and a table
  `harness_own_rules` (one row a harness, what it last said and when).
- The bridges need SDK 1.0.10 to send their own rules. Until it is published they say nothing,
  and the page says so.
- On both apps the old When it asks you section, You's Allowed always and the workspace-wide
  list of asks it opened are gone: each harness's Permissions holds its own asks, and You →
  Permissions takes Allowed always's place.
