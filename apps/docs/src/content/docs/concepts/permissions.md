---
title: Permissions
description: Two gates between a harness and you — its own settings, then Chips's rules — and the mode a harness runs in.
---

Every harness has a Permissions page. It is a row on the harness's own page, and You →
Permissions lists every harness with a line saying how each one asks. On the phone it opens as a
page; on the iPad, the web and the Mac it opens beside the list.

## Two gates

An action meets two gates on its way to you, in this order:

1. **The harness's own settings** decide whether it asks at all. Claude Code reads
   `~/.claude/settings.json` and each agent folder's `.claude/`, Codex runs in a mode, Hermes asks
   only about commands it counts as risky, OpenCode reads its permission rules and OpenClaw its
   exec policy. What they let through runs without
   asking and never reaches Chips.
2. **Chips's rules**, when they are on, answer some of what does arrive: an Always you gave, a rule
   you wrote, a pause. Everything else comes to a person as a card.

Chips only ever sees what the harness asks. Its rules can answer an ask, but they can't make the
harness ask about something its own settings let through. To make the harness ask about more,
change its own settings or its mode.

An agent has no permissions of its own. Its Permissions row opens its harness's.

## The page

The main page draws the two gates and has two rows under **Where it's set**, then **Asks so far**,
a dot for each ask the harness has sent, by how it was answered.

- **Its own settings** (the row is named after the harness: Claude Code's settings) shows its mode
  where it has one, and what its settings let through: what it runs without asking, what always
  asks and what never runs, each with where it is kept. The harness sends Chips a copy of these;
  Chips decides nothing from it. A harness that sends nothing reads "Doesn't say yet what it runs on
  its own". One that sends a list with nothing in it reads "Its own settings decide what asks".
- **Chips's rules** shows the switch, Stop asking, and the rules, with Add a rule.

When what a harness runs on its own covers a command Chips would never keep an Always for (`git
push`, `curl`, `rm` and the like), its settings page says so, names them, and gives the line to add
to the harness's own settings to make them ask, with a Copy button. Chips doesn't write that file
for you: it belongs to the harness, and your own copy of it may read the same file.

## The mode a harness runs in

Every harness's settings page but Jacobian's has a **Mode** picker. The modes are the harness's
own, as its bridge offers them; OpenCode's are made of its own rules (below).

| Mode | What it does |
| --- | --- |
| **Claude Code** | |
| Default | Where it starts. Asks before edits and commands its settings don't allow. |
| Accept edits | Edits files without asking. Commands still ask. |
| Auto | Claude Code judges each step and asks only when one looks risky. |
| Bypass permissions | Never asks. Offered only where Claude Code allows it: not to a root user outside a sandbox, and not when its settings turn Bypass off. |
| **Codex** | |
| Read-only | Reads on its own. Changes nothing without a yes: it may ask, or say it can't. |
| Workspace access | Where it starts. Edits and runs commands in the agent's folder. Asks before the network or anything outside it. |
| Auto review | Codex judges each step and asks only when one looks risky. |
| Full access | Never asks. Reaches the network and any file on the computer. |
| **Hermes** | |
| Manual | Asks before every command Hermes counts as risky. |
| Smart | Where it starts. A second model checks each risky command and asks only when it can't clear it. |
| Off | Never asks. Risky commands just run; its hard blocks and your deny list still hold. |
| **OpenClaw** | |
| Default | Where it starts. Runs as its settings say, and the line says what they say, such as "Yours ask before every command." |
| Read only | Reads its folder. Changes nothing and runs no commands. |
| Ask me | Edits in its folder. Commands not on its allowlist ask first. |
| Auto-review | OpenClaw judges each step and asks only when one looks risky. |
| Full access | Never asks. Any file, any command, the network. |
| **OpenCode** | |
| Default | Where it starts. Runs as your OpenCode settings say. Out of the box it asks almost nothing. |
| Ask before changes | Edits and commands wait for a yes. Reads run on their own. |
| Read-only | Reads on its own. Edits are refused, and commands ask first. |

- **For how long.** Picking any mode but the one it starts in asks for how long: 1 hour, 8 hours,
  Until tomorrow (9:00 AM, your time), or Keep it. Picking the mode it starts in switches back at
  once.
- **When the time is up**, each of that harness's sessions goes back to the mode it starts in, at
  that moment, even in the middle of a turn: the turn's next step asks as that mode does. A
  harness that was off at the time starts its sessions in that mode.
- **Yellow** means nothing asks. While Claude Code is in Bypass permissions, Codex or OpenClaw in
  Full access, or Hermes in Off, the Permissions page has a yellow banner, the mode's row is gold,
  and each space the harness has an agent in has a band at the top ("Claude Code asks nothing until
  10:41 AM") with a button back to the mode it starts in.
- **Your own harness keeps its own mode.** The pick is for what Chips starts, and no settings file
  of yours is touched. Where a harness's Main agent is also your own, it keeps your mode, and its
  settings page says so: Hermes's Main agent runs on your Hermes's default profile, and OpenClaw's
  speaks in Home, your own conversation on every channel.
- When a harness can't use the mode picked, the settings page says the mode it is really running
  in: Claude Code's Auto, on a model that can't use it, runs in Accept edits, and a session
  OpenClaw won't switch keeps its mode.
- Owners and admins pick a mode. A member sees the mode and when it ends.

How each harness takes a pick:

- **Hermes** only ever asks about commands it counts as risky; edits and other commands don't ask,
  in any mode. Smart's check is a short call to the agent's own model. The bridge writes the mode
  into the config of each profile Chips made for an agent, and when the pick ends puts back exactly
  what was there; Hermes reads it at its next risky command.
- **OpenClaw** takes the mode on each session Chips opens in your spaces. When a session's mode
  changes, OpenClaw cancels the asks still open in it, and their cards end.
- **OpenCode** has rules, not modes, so its modes are rules Chips adds to the sessions it opens,
  read after your settings so they win: Ask before changes asks for edits and commands, and
  Read-only refuses edits and asks for commands. Your settings aren't touched. None of them never
  asks, because a rule that allows everything would beat deny rules of your own.

- **Goose** starts in Auto, which never asks, so Chips puts each session in Approve, which asks
  before every tool call its own permission list doesn't settle. Smart approve lets reads through
  and has Goose judge the rest; Auto never asks.
- **Antigravity** starts each session in Default, with Accept edits and Auto to pick. Auto is there
  only where Antigravity offers it: a personal Google account with its terminal sandbox on. In
  Auto it runs every command in that sandbox without asking, deleting a file in its folder
  included, and asks only before a command outside it that it can't undo. None of its modes never
  asks.
- **Cursor, Copilot and Grok** have no mode Chips can put a session in: Cursor's and Copilot's
  modes are ways of working (Agent, Plan, Ask; Agent, Plan, Autopilot), not how much they may do,
  and Grok's sessions have none. Each asks as its own settings say: Cursor's `approvalMode`, which
  never asks about edits in the agent's folder; Copilot's Allow all, off unless you turn it on;
  Grok's mode, which it takes from Claude Code's `defaultMode` where your
  Claude Code settings have one, else from its own config, else Ask. So a Grok on a Mac where Claude
  Code runs in Auto runs in Auto too.

Each one's Permissions page shows what its own settings let through, as Claude Code's does:
- **Copilot**: its Allow all, each "don't ask again" it saved for an agent's folder, and the URLs
  its settings always allow or deny.
- **Grok**: its mode, the file that set it, and its rules with the Claude Code rules it follows too.
- **Antigravity**: its mode and the `permissions` lists in `~/.gemini/antigravity-cli/settings.json`.
- **Goose**: its mode and the tools its `permission.yaml` always allows, asks before or never allows.
- **Cursor**: its `approvalMode` and the `permissions` in `~/.cursor/cli-config.json` and each
  agent folder's `.cursor/cli.json`.

Chips reads these files and never writes them. Change a rule where it's kept, and the page shows it
the next time the agent starts a session.

The picker needs a computer on Chips 1.4 or later and a bridge that offers it: ACP 1.0.34 or later
for Claude Code and Codex, ACP 1.0.36 for Goose and Antigravity, Hermes 1.0.37, OpenClaw 1.0.24
and OpenCode 1.0.37 or later. An older
bridge offers no mode to pick. Jacobian has no modes Chips can switch, so it shows none: what still
asks in it is there for safety, and Stop asking is its quiet hour.

## Chips's rules: one switch on each harness

**Off**, Chips answers none of that harness's asks. Every ask comes to a person, with
[who may answer](/concepts/approval/#who-may-answer), its expiry and the record as before. An
Always is kept by the harness itself, as its own always: the card's Approve turns to "Always" and
the harness says where it holds.

**On**, Chips answers the asks its rules cover, and brings the rest to a person:

- an **Always** you gave on a card, which Chips keeps as a rule for how each part of a command
  starts ([Approval](/concepts/approval/#this-session-and-always-are-kept-by-chips));
- a **rule you wrote** with Add a rule: Allow, Ask me or Never, for a kind of action and, for
  commands, how each part starts, in every space or in one. New rule shows how many of the
  harness's past asks it would have answered;
- **Stop asking**, for 1 hour, 8 hours or until tomorrow (9:00), when Chips says yes for that harness
  in every space and for all its agents. Each of those yeses is still in the log, as a gold dot. A
  Never you wrote still says no, and the room shows a plain line with Ask again;
- **For an hour** and **Let it work without asking** on an ask, for the agent that asked, in that
  space ([A yes that holds on](/concepts/approval/#a-yes-that-holds-on)).

A new harness starts with the switch off. One that had something of Chips's before the switch
existed reads as on: a rule, a pause, or a level above L1, or rules or a pause for the whole
workspace. Turning the switch off keeps the rules where they are, and Chips just doesn't read them;
turning it on reads them again. Turning it off ends Stop asking and every yes that holds on for that
harness. Owners and admins turn it on and off.

What a rule or a pause never does:

- **Allow what matters.** Money, a message to someone outside, a deletion and anything marked as
  not undoable come to a person whatever the rules say.
- **Keep an Always for a command on the never list.** A rule you write can't Allow one either, nor
  allow any command at all with a wildcard: that is the switch's job.
- **Say yes, in a pause, to a command on the pause's list** (below).

## What a pause still brings you

A pause is Stop asking, Let it work and For an hour. While one holds, a command that does any of
these still comes to a person:

| | Commands |
| --- | --- |
| Deletes | `rm`, `rmdir`, `find -delete`, `dd`, `mkfs` |
| Acts as someone else | `sudo`, `su`, `doas` |
| Leaves the machine | `ssh`, `scp`, `rsync`, `git push`, `npm publish`, `pnpm publish`, `yarn publish`, `gh api`, `gh repo delete`, `gh pr merge`, `gh release delete`, `kubectl delete`, and `curl` or `wget` to anywhere but this computer |
| Rewrites history | `git reset`, `git clean` |
| Stops the machine | `shutdown`, `reboot` |

So does a command when Chips can't tell what it runs: a program held in a name the line didn't set
(`$CMD x`), a string it can't read (`eval "$X"`), or a shell run on what is piped to it (`… | sh`).

Chips finds each command in a line the way a shell does, in a chain, a loop, `$(…)` or a function,
and matches the program, not the words: `"rm"`, `\rm` and `/bin/rm` are all `rm`, and an `rm` in a
heredoc's text is not. What runs another command is read through to it, so `timeout 20 pnpm test`
goes ahead and `timeout 20 rm -rf x`, `bash -c 'rm -rf x'` and `find . -exec rm {} +` ask. This
reads what an agent writes; it is not a sandbox. A pause already lets `python3 build.py` run, so
it doesn't try to follow code handed to `python3 -c` or `node -e`.

## What an Always is never kept for

The never list is longer than the pause's, because an Always outlives the moment. A command that
uses any of these gets no Always, from Chips or from a rule you write:

- everything on the pause's list, and every `curl` and `wget`, even to this computer;
- what writes over a file: `cp`, `mv`, `tee`, `truncate`, `sed -i`;
- what stops or changes other things: `kill`, `killall`, `pkill`, `chmod`, `chown`;
- what rewrites files from git: `git checkout`, `git restore`;
- what runs code it is handed, or another command: `python3 -c`, `node -e`, `awk`, `sh -c`,
  `bash -c`, `eval`, `xargs`, `env`, `timeout`, `find -exec`, `pnpm exec`, `pnpm dlx`, `uv run`,
  `docker run`, `kubectl exec`, and the like.

The card says when a command has no Always, and why. The lists are in
[ADR 0300](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0300-the-harness-decides-and-chipss-rules-are-a-switch.md)
and its addenda, and in `packages/protocol/src/pause.ts` and `commands.ts`.

## Where it is kept

- What a harness runs on its own is a report it sends (`PUT /v1/harnesses/:id/own-rules`, the SDK's
  `chips.settings.ownRules`), kept as the latest copy. See
  [Say what you run on your own](/connect/sdk/#say-what-you-run-on-your-own).
- The switch, a pause and a mode are on the harness's policy for every space, each change a
  [`policy.updated`](/reference/events/policy-updated/) in the log, with who made it. So the
  workspace's log says "put Claude Code in Auto until 10:41 AM", and a replay of the log gives the
  same answers.
- The [policy engine](/concepts/policy/) is what reads them when an ask arrives.
