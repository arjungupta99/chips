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
   Yes once for a command, so the app left Always out for a command until SDK 1.0.10 and the
   bridges that read `keeps` were out (19 November: acp 1.0.30, OpenCode 1.0.34, Hermes 1.0.34,
   OpenClaw 1.0.21). Since then a command's card offers Always too, on Arjun's "Yes, turn it on".
   An Always the harness keeps lights no words, has no "Where this Always holds", sends no
   `everywhere`, and Approve turns to "Always": the harness says where it holds.
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
- The bridges need SDK 1.0.10 to pass a harness's own always through and to switch modes; the
  mode is shown, not changed. The ACP, OpenCode and Hermes bridges read `Decision.keeps`;
  OpenClaw reads `keeps` off the event, so it needs no new SDK.
- A harness that reads neither `scope` nor `keeps` (Jacobian) answers an Always once while the
  card says it keeps it. The fix is for an ask to say what its harness can keep (the permissions
  review of 19 November, I1), which wants its own decision.
- A spec of Chips's rules starts its harness with them on through `POST /v1/dev/harnesses`
  (`chips_rules: true`), a dev-mode route on loopback only.

## Addendum, 19 November 2026: a pause has its own, shorter list, and the never list loses its holes

Status: Accepted, 19 November 2026, on Arjun's "merge the shorter never list", said to the session
that ran the permissions review and passed on by it, which takes the list as the table has it.

**What was wrong.** The permissions review of 19 November
(`chips-notes/reviews/permissions-review-2026-11-19.md`, findings N2, B4 and B11) replayed the 175
asks Claude Code ever sent through decision 2 above.

- **The guard stops far more than it protects (N2).** Let it work and For an hour answered 148 of
  the 175. With the guard as built, 89 of those 148 would have been cards: 116 cards against the
  27 that happened. The never list was written for an Always, where `cat` remembered alone made
  `cp`, `mv` and `sed -i` dangerous. A pause already lets `python3 build.py` and `make` run, so
  stopping `python3 -c` (36 asks) and `sed -i` (10) under it protects nothing.
- **It matched words, not programs.** 15 of the 89 asked only because a listed word stood in a
  heredoc's text: `dd` from `<dd>` in a Python script that edits HTML, `time` from a comment,
  `env` from CSS.
- **It could be walked past (B11).** In a command Chips can't read, the scan split on quotes, so
  `r''m -rf x > log.txt` named no `rm` and went ahead. So did `bash -lc 'rm -rf x'`, read or not:
  the list names `bash -c`, and `-lc` is another word.
- **The never list has holes (B4).** An Always keeps how a command starts, and for `gh`, `pnpm`,
  `docker` and the like that is two words. An Always on `gh repo view` kept `gh repo`, which let
  `gh repo delete` through; `pnpm exec tsc` kept `pnpm exec`, which let `pnpm exec rm -rf` through.
  And a harness at L2 was still answered "runs and shows up in the receipt" for any command, `rm
  -rf` and `git push` included.

### Decision

1. **Two lists.** The never list (ADR 0239) stays what an Always is never given for, and gains
   the entries in 4. A pause reads a shorter list of its own, below.
2. **A pause reads the program, not the words.** Each command in the line is found the way a
   shell finds it: in a chain, a loop, an `if`, `$(…)`, a function. Only the program and its own
   words are matched. A heredoc's text and quoted text are not, unless a shell runs them.
   - Quotes are taken off first, so `r''m`, `"rm"`, `\rm`, `$'\x72m'`, `RM` (a Mac's disk doesn't
     tell them apart) and `/bin/rm` are all `rm`.
   - A name the line sets once, and touches nowhere else, is read: `U=http://127.0.0.1:4175; curl
     "$U/api"` is a `curl` to this machine. Where the setting might not run (after `&&`, in a
     subshell, in a function) the name may be empty, so it is read only quoted on its own, as
     `"$C"`; a line that sets `IFS` has no names read.
   - A heredoc fed to a shell (`bash <<EOF`, `source /dev/stdin <<<`) is read as commands, and so
     is the `$(…)` in any heredoc whose closing word isn't quoted, since a shell runs both.
3. **What runs another command is read through to it**, and is not on the list itself:
   `timeout`, `env`, `nice`, `nohup`, `time`, `command`, `builtin`, `exec`, `caffeinate`,
   `stdbuf`, `arch`, `setsid`, `xcrun`, `flock`, `script`, `xargs`, `find -exec`, `pnpm exec`,
   `npm exec`, `npx`, `yarn exec`, `uv run`, `git submodule foreach`, `git rebase --exec`,
   `git bisect run`, an `alias` or `hash` set on the line, and a string handed to `sh -c`,
   `bash -c`, `zsh -c`, `eval`, `trap`, `watch` or `mapfile -C`. pnpm runs as a program any word
   that isn't one of its own commands, so `pnpm curl …` is a `curl`. So `timeout 20 pnpm test`
   and `git ls-files | xargs wc -l` go ahead, and `timeout 20 rm -rf x`, `bash -eo pipefail -c
   'rm -rf x'` and `find . -exec rm {} +` ask.
   - **Where Chips can't tell what runs, it asks:** a program held in a name the line didn't
     set (`$CMD x`), spelt with a glob or braces (`/bin/r?`, `{rm,-rf,x}`), a string it can't read
     (`eval "$X"`, `bash -c "$1"`), what `xargs` hands a wrapper (`xargs env`), a `git` or `gh`
     command filled in (`git $(…)`), a git alias set on the line, a shell run on what is piped to
     it (`… | sh`, `bash < <(…)`), and a line nested deeper than it follows.
   - **What it does not try to follow.** It reads what an agent writes; it is not a sandbox. A
     pause already lets `python3 -c` and `node -e` run, so the shell's deliberate back doors to
     running code are not followed either: an array index bash evaluates
     (`$(( a['$(rm …)'] ))`), a prompt string (`PS4='$(…)'; set -x`), zsh's glob qualifiers and
     `(e)` flag, a git setting other than an alias that runs a program (`core.sshCommand`), and a
     settings file written for `curl` in the home folder. An independent check on 19 November
     tried 49 ways past the reader; each is either read now or one of these.
4. **The never list gains** `gh api`, `gh repo delete`, `gh pr merge`, `gh release delete`,
   `pnpm exec`, `pnpm dlx`, `npm exec`, `yarn exec`, `yarn dlx`, `uv run`, `docker run`,
   `docker exec`, `kubectl exec`, `kubectl delete`, `osascript -e`, `awk`, `git checkout`,
   `git restore`, `deno eval`, `node -p`, `node --print`. An entry may now have three words;
   its words after the program match in order, wherever they stand (`gh -R o/x repo delete`).
5. **L2 asks for what a pause would.** A harness at L2 is no longer answered "runs and shows up
   in the receipt" for a command on the pause's list. L3 is unchanged: it is "runs end to end".

### The two lists

| | A pause asks (Stop asking, Let it work, For an hour) | An Always is never given (ADR 0239) |
|---|---|---|
| Deletes | `rm`, `rmdir`, `find -delete`, `dd`, `mkfs` | the same, and `truncate` |
| Acts as someone else | `sudo`, `su`, `doas` | the same |
| Leaves the machine | `ssh`, `scp`, `rsync`, `git push`, `npm publish`, `pnpm publish`, `yarn publish`, `gh api`, `gh repo delete`, `gh pr merge`, `gh release delete`, `kubectl delete`; `curl` and `wget` to anywhere but `localhost`, `127.0.0.1` or `[::1]` | the same, and every `curl` and `wget` |
| Rewrites history | `git reset`, `git clean` | the same, and `git checkout`, `git restore` |
| Stops the machine | `shutdown`, `reboot` | the same |
| Stops or changes other things | not on it (pick 1) | `kill`, `killall`, `pkill`, `chmod`, `chown` |
| Writes over a file | not on it | `cp`, `mv`, `tee`, `sed -i` |
| Runs code it is handed | not on it: a pause already lets `python3 build.py` run | `python3 -c`, `node -e`, `node -p`, `perl -e`, `ruby -e`, `deno eval`, `osascript -e`, `awk` |
| Runs another command | read through (3) | `sh -c`, `bash -c`, `zsh -c`, `eval`, `exec`, `xargs`, `find -exec`, `env`, `command`, `builtin`, `nohup`, `time`, `timeout`, `nice`, `watch`, `pnpm exec`, `pnpm dlx`, `npm exec`, `yarn exec`, `yarn dlx`, `uv run`, `docker run`, `docker exec`, `kubectl exec` |

A `curl` or `wget` stays on this machine only when every address it names is `localhost`,
`127.x.x.x`, `0.0.0.0` or `[::1]`, every flag is one Chips knows keeps it there, and the line sets
no proxy and no place for its settings (`http_proxy=`, `CURL_HOME=`, `HOME=`). `--proxy`,
`--resolve`, `--connect-to`, `-K` and any flag it doesn't know ask.

Added to the review's list, at no cost in the replay: `dd`, `mkfs`, `shutdown`, `reboot` (they
can't be undone, and a pause now reads them as programs, so `<dd>` no longer trips it), and the
`gh` and `kubectl` entries from 4 that delete or merge somewhere else.

### The replay

The 175 Claude Code asks, in order. "Cards" is how many would have reached a person. Read-only
export of `approvals`; script and reader as in the review's first section.

| Setup | Cards | Of the 148 a pause answered |
|---|---|---|
| As it happened, before any guard | 27 | 0 asked |
| The guard as built on 18 November | 116 | 89 |
| **The pause's list above** | **57** | **30: 24 with `rm`, 4 with `curl`, 2 it can't tell** |
| The same with `kill`, `killall`, `pkill`, `chmod`, `chown` | 63 | 36 |

- The 24 `rm` asks are all in Builder's own scratch folder, its working folder or `/tmp`. They ask
  because `rm` asks.
- The 4 `curl` asks: one to this Mac's Tailscale name; one inside a shell function that takes its
  address as `"$@"`, which Chips can't read; and two to `$U/api`, where `U` was set after `&&`,
  so it may be empty and isn't read. The other `curl`s in those 148 asks are to `localhost` or
  `127.0.0.1` and go ahead.
- The 2 it can't tell run a program from a name: `$S`, set after other commands and used bare;
  and `"$C"`, whose name also stands in the script the line writes.
- 59 commands that asked under the guard as built go ahead. What had tripped it (a command can
  have several): `python3 -c`, `sed -i`, a `curl` to this machine, `kill` or `pkill` of its own
  dev server, and words in a script's text (`time`, `watch`, `env`, `dd`, `zsh -c`). None runs
  `rm`, pushes or reaches another machine.
- No command that goes ahead today would ask under the new list.
- The first build, before the independent check, gave 53. Reading names more carefully after it
  costs 4 of these asks.

### Where it is

- `packages/protocol/src/shell-scan.ts` finds the commands in a line (`scanCommands`).
  `packages/protocol/src/pause.ts` holds the pause's list (`NEVER_FOR_A_WHILE`) and judges each
  command a pause meets (`askedForAWhile`, `neverForAWhile`). `commands.ts` keeps the never list.
- `server/src/domain/policy.ts`: a pause and the L2 preset both ask `leftToAPerson`.
- The conformance kit's fake has no policy engine, on purpose (`packages/conformance/src/
  workspace.ts`, its first comment), so there is nothing to mirror there.
- The row under Stop asking now reads "never to `rm`, `sudo`, `git push` or what reaches another
  computer" (`NEVER_PAUSED` in `packages/core/src/permissions.ts`).
- The protocol's wire is unchanged: no event, schema or frame moved, and `pnpm gen:protocol`
  writes the same files.

### What else changes

- One of the 175 asks loses its Always: `uv run … python -c …`, now on the never list as
  `uv run`.
- A harness's own settings page lists what its settings let through that Chips never would (ADR
  0299). With the longer never list, Claude Code's page in the live workspace gains `git
  checkout`, `git restore` and `npm exec`, beside the 11 it lists today.

### Picks

1. **`kill`, `killall`, `pkill`, `chmod`, `chown` under a pause.** Recommended: off the pause's
   list. In the history every one is Builder stopping its own dev server or making its own script
   runnable, and they cost 8 cards. They stay on the never list, so no Always is kept for them.
   **Taken: off**, on Arjun's "Go with your recommendations on the review's decisions", said to
   the session that ran the review and passed on by it, 19 November.
2. **The pause's list as the table has it.** Recommended: yes. It differs from the review's
   recommendation in two places: what runs another command is read through where the review
   listed `sh -c`, `eval` and `xargs`; and `dd`, `mkfs`, `shutdown`, `reboot` and the `gh` and
   `kubectl` entries stay on it. **Taken**, with both, on his "merge the shorter never list".

## Addendum, 19 November 2026: a yes that holds on lives only while the rules are on

The permissions review of 19 November (`chips-notes/reviews/permissions-review-2026-11-19.md`,
findings B2, B6 and B9) found that For an hour and Let it work did nothing while a harness's
Chips's rules were off, and the apps still said the agent was working without asking. The engine
answers "ask" before it reads a held yes; the door took one all the same; nothing ended one when
the switch went off; and the apps read one without the switch. It was live for Builder, and the
App Store's 1.3.0 offers both on every ask.

There were two ways out: let a held yes answer with the rules off, or keep decision 1 as written
("Off, Chips answers none of that harness's asks"). This keeps it as written: the review's
recommendation, which Arjun took on 19 November ("Go with your recommendations on the review's
decisions").

1. **The door refuses a yes that holds on while the asking harness's Chips's rules are off.** An
   `approval.resolved` with `for_minutes` or `until_stopped`, and an `approval.held_started`, are
   refused as `invalid`: "a yes holds on only while the harness's Chips's rules are on: answer this
   once, or turn them on in the harness's Permissions first".
   - It is rule 18 in `authorize.ts` (`refuseHeldRulesOff`), fed by `chipsRules` on the context,
     which the use case reads the way the engine reads the switch. It is asked last, so somebody
     who may not answer, or whose agent it isn't, is told that first.
   - The harness is the one whose run asked, read off the ask, not the run the answer was posted
     to.
   - An app from before the switch now gets a refused answer where it got a yes that did nothing.
     The phone draws the server's words on the ask.
2. **Rules going off end the yeses still holding.** When a `policy.updated` for a harness leaves
   its rules off, or found them off, Chips writes `approval.held_stopped` itself, once for each
   space and asker, for the harness and each of its agents. The actor is `system`, and
   `stopped_by` is the person who made the change.
   - Every app takes its band down from that event, one from before the switch too, and a replay
     of the log agrees. Nothing new is on the wire.
   - "Found them off" is for a yes left from before this addendum: it ends when the rules are next
     turned on, so it does not come back to life with them.
   - A switch never set that turns itself off with its last rule ends them the same way.
3. **The apps draw no held yes for a harness whose rules are off.** Core's `lettingWork` asks for
   the model and the directory and reads the switch, so the band, the agent's page, its Working
   without asking row and You's list cannot read one without it. This covers a yes not yet ended,
   and one on a server from before this addendum.
4. **The words say what still comes.** For an hour and Let it work said "Everything Jiro asks here
   goes ahead … commands Chips can't read too", which decision 2 made untrue. They now say "Jiro's
   asks here go ahead without a card until you stop it. Commands like `rm` and `git push` still
   come to you, and so does anything that moves money, messages someone outside or can't be
   undone."
   - With the rules off, the phone asks no Where for an Always and Approve turns to "Always". That
     came with the change that offers a command's Always to the harness (`662d96f81`, the same
     day), which also makes "This command does more than Chips can read, so there is no Always for
     it" true again with the rules off: a command Chips reads has one, and that one doesn't. So the
     line stays.
5. **A switch never set is set by the first change to its rules or hold** (B6, the app's half).
   The app sends `chips_rules` with what it read, on the harness's everywhere row, and before a
   change to one space's rules. So taking away the last rule no longer turns the switch off, and
   the rules page no longer folds as the rule goes.
   - Not before a space's change for a harness with nothing set everywhere. The app shows L2 for
     such a harness where the server holds L1 (B6), and sending the switch would send that level
     with it. Its switch can still turn itself off with its last rule.

Left as they were, each for its own decision:

- The server's half of B6: an Always that writes a rule does not set the switch, and rules that
  are all switched off still count as "has a rule".
- A change to the rules for every harness (`policy.workspace_updated`) that turns a switch never
  set off stops no yes. The engine reads none and the apps draw none; it ends at the harness's
  next policy change.
- **Coming from 1.3.0.** A workspace with a Let it work on a harness that has no rule, no hold
  and no level above L1 reads off after migration 0067, so that yes goes quiet and is not drawn.
  Counting a yes that holds as something "of Chips's" for a switch never set would keep it
  working. That changes how decision 1 reads a switch never set, so it is Arjun's.
- The protocol's description of `for_minutes` still says "commands Chips can't read too".
  Changing it means `pnpm gen:protocol` and the next SDK snapshot.

What it takes to go live: a restart of the server, for the door and the stop. No migration. A yes
left in a live database from before (Builder's, on 19 November) is not touched by the restart: the
new apps stop drawing it, and it ends the next time that harness's rules or hold are changed.

## Addendum, 19 November 2026: a person picks the mode Chips runs Claude Code and Codex in

Status: Accepted, 19 November 2026, on Arjun's "Yes, both recommendations" (A and B below). It
builds the Mode picker the plan drew on "Claude Code's settings"
(`chips-notes/mocks/harness-first-permissions/src/screens.js`, `settings`), which the
Consequences above left for later ("the mode is shown, not changed").

**What was missing.** SDK 1.0.10 went out with no way to change a mode: no field, no SDK call, no
bridge handling. The settings page shows one row that can't be tapped, and the ACP bridge puts
every Claude Code session in `default` and every Codex session in `workspace-write`. That also
beats a person's own `defaultMode` in `~/.claude/settings.json`, which is why Arjun asked on 19
November where Claude's Auto was.

### Decision

1. **The modes are the harness's own, as its adapter offers them.** The bridge says which modes a
   person may pick, with each one's name and a line in plain words, in what it runs on its own
   (`own_rules.modes`). The apps draw what it says, in its order, and nothing else.
   - **Claude Code:** Default (where it starts), Accept edits, Auto, Bypass permissions. Plan is
     left out: it is a way to work on one task, not how much it may do, and Claude Code asks
     before it leaves it. Bypass permissions is offered only where Claude Code's adapter offers
     it: not to a root user outside a sandbox, and not when its settings turn Bypass off.
   - **Codex:** Read-only, Workspace access (where it starts), Auto review, Full access.
   - The other harnesses (OpenCode, Hermes, OpenClaw, Jacobian) offer no modes Chips can switch,
     so they show none, and Stop asking in Chips's rules stays their quiet hour.

   | Mode | Its line on the page |
   | --- | --- |
   | Default | Asks before edits and commands its settings don't allow. |
   | Accept edits | Edits files without asking. Commands still ask. |
   | Auto | Claude Code judges each step and asks only when one looks risky. |
   | Bypass permissions | Never asks. Whatever it does just happens. |
   | Read-only | Reads on its own. Asks before it changes a file or runs anything else. |
   | Workspace access | Edits and runs commands in the agent's folder. Asks before the network or anything outside it. |
   | Auto review | Codex judges each step and asks only when one looks risky. |
   | Full access | Never asks. Reaches the network and any file on this computer. |

2. **Every mode but the one it starts in has a length.** Tapping one opens "For how long" under
   it: 1 hour, 8 hours, Until tomorrow (9:00 AM, the reader's time), Keep it. Then Cancel, or
   "Use Auto", which is the confirm. For Bypass permissions and Full access that button is red.
   Tapping the mode it starts in switches back at once, with no length.
3. **When the time is up**, the bridge puts each of that harness's sessions back in the mode it
   starts in, at that moment, whether or not a turn is running; the turn's next step asks as that
   mode does. Nothing is written when it ends, as with Stop asking: the server, the SDK and the
   apps each compare the end with the clock. A bridge that was off at the time starts its
   sessions in the starting mode. "Back to Default" switches back before then.
4. **Who may change it:** owners and admins, as with the rest of a harness's policy (SEC-1). A
   member sees the mode and when it ends, without the choices.
5. **Where it's kept:** `policy.mode` on the harness's everywhere policy (`policy.updated`):
   `{ id, until?, by, at }`, with `by` and `at` filled in by the server. `null` puts it back in
   its starting mode, and absent leaves it as it was, as a hold is kept. One new column,
   `harness_policy.mode`. The harness's hello carries it in `policy`, and each change reaches it
   as the `policy.updated` it already hears.
   - The SDK hands a bridge `chips.mode`, the mode in force now (nothing once its time is up),
     and a `mode` event when that changes, its end included.
   - The picker shows only where the server keeps the field (`harness_mode` in its hello's
     `takes`) and the harness says what it offers. Anywhere else the row reads as it does today.
6. **What the bridge does:** each session it opens, and each one open now, goes into the picked
   mode (ACP `session/set_mode`) where the adapter offers it, else the starting mode, and the
   bridge logs why. It says the mode it runs in through what it runs on its own (`mode`), so the
   page can say when that differs from the pick: Auto on a model that can't use it runs in
   Accept edits, Claude Code's own fallback, and once the bridge has said so after the pick, the
   settings page says "Claude Code is running in Accept edits: it couldn't use Auto."
7. **Yellow** shows while a harness is in a mode that never asks: the main page's banner ("Nothing
   asks · Bypass permissions · back to Default at 10:41 AM", with Back to Default), the gold value
   on its settings row and its agents' Permissions rows, and a band at the top of each space it
   has an agent in ("Claude Code asks nothing until 10:41 AM", with Back to Default for owners
   and admins). Chips's rules page says they have nothing to answer until it's back.
8. **The record:** the `policy.updated` is the record, in the workspace's log as "put Claude Code
   in Auto until 10:41 AM", "put Claude Code in Bypass permissions until you change it" or "put
   Claude Code back in Default", with who did it. A put-back names the mode the pick before it
   said it went back to.
9. **Your own Claude Code keeps its own mode.** The settings file isn't touched. The line under the
   picker: "Chips starts each of its Claude Code sessions in this mode, and switches it back when
   the time is up. Your own Claude Code keeps its own mode."

### Picks

- **A. Codex's Full access wears yellow too** (recommended): it never asks, as Bypass doesn't.
  Or yellow for Claude Code's Bypass alone, as "only claude bypass permissions should show
  yellow banner" said before Codex could be switched.
- **B. The first mode is "Default"** (recommended), as the plan drew it. Or "Manual", the name
  Claude Code itself has used for it since 2.1.200.

### Consequences

- The server and the apps can land and go live first: until a bridge says what modes it offers,
  every harness's row reads as it does now.
- The switch itself needs **SDK 1.0.11** (`chips.mode`, the `mode` event, `own_rules.modes`) and
  **chips-acp on it**. Both publishes wait for Arjun's word.
- An older app leaves `mode` as it was when it sends a harness's policy, since absent changes
  nothing. `CATALOGUE_LEVEL` is unchanged: no new event.
