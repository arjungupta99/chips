# 0239. A standing yes for a command remembers how each part of it starts, and can reach every space

Date: 27 October 2026
Status: Accepted, 27 October 2026. Arjun picked C from the Allowed always mock
(https://claude.ai/artifact/LwgxN9e9P5JgxURXTNw7FV): "Write the ADR for C (an Always on a
command's start, in this space or every space) and show it to me before building." On the
proposal he accepted the three recommended picks: "Build as written" (the never list as written,
every space by default, no "Any command" for a person).

## Context

ADR 0195 made Allowed always the one control a person has over asking. Its addendum of 26
October (option A) made the list readable. Two things still make Always a poor answer for a
command.

**An Always on a command covers every command.** The rule an answer writes is the action's kind
and its flags (`match: acp.bash`, `when: { external, irreversible }`). For a shell the kind is
the same whatever the command is, so an Always given to `node --check game.js` also answers
`rm -rf src`. The harness's flags don't save it: the ACP bridge marks only ACP's `delete` and
`fetch` tool calls as risky (`riskOf` in `chips-acp/src/bridge.ts`), and a shell command arrives
as `execute` with no flags. On 15 October the ACP harness's `rm /Users/ada/chips-acp/claude/second.txt`
came to Arjun as an ordinary ask. Had an Always covered that harness's shell asks, it would have
gone ahead without one. "This session" has the same hole for the rest of the run
(`session_rules` keeps the kind and flags only). Nothing is exposed today, because no Always has
ever been given on 4431.

**An Always only reaches the space it was said in.** The server writes the rule into the ask's
space (`event.space_id`), and a space is one conversation. Claude Code's 12 shell asks were spread
over five spaces, so an Always in any one of them would have saved one or two cards. And a rule
kept for every space wouldn't reach a space that has a policy row of its own: the server reads
the space's row instead of the harness's (`harnessPolicy` in `read-models.ts`), and an Always
in a space makes that row.

**Real commands are chains.** Of the 19 asks on 4431 that carry a command, 2 are a single
command; the rest join commands with `&&`, `;` or `|` (`node --check game.js && echo ok`,
`grep -noE … | sort | uniq -c`, `cd …/room && git log … && git status`). Split into their parts,
17 of the 19 are made only of plain commands. The 2 that are not write into a file with `>`.

Every bridge Chips ships puts the command in the same place: `action.input.command`, a string
(`chips-acp` passes Claude Code's and Codex's `rawInput`, which has it; `chips-opencode`,
`chips-hermes` and `chips-openclaw` build `{ kind: "shell.exec", input: { command } }`).

## Decision

1. **A command is read part by part.** Chips reads `action.input.command` (a string, or an array
   of words). It splits the string at `&&`, `||`, `;`, `|` and new lines outside quotes, and
   splits each part into words as a shell would, quotes removed. A part that redirects (`>`,
   `<`), runs something inside it (`$(`, backticks, `(`), sets a variable first (`FOO=1 node`),
   or runs in the background (`&`) can't be read, and neither can the command it is in. The
   reader lives in the protocol package (`commandParts`), so the server, the conformance fake
   and the apps read a command the same way.

2. **A standing yes remembers the first two words of each part.** Always or This session on a
   command writes one rule per part, `when.starts_with: ["node", "--check"]`, for the harness's
   kind. A part of one word is remembered as that word (`sort`). Parts already covered are not
   written twice. The person does not pick how much to remember: the card shows what it will
   remember, as the commands' own starts, and that is the choice. The mock's `node …` and "Any
   command" chips are dropped: one word lets `node -e` run any code, and any command is the hole
   this closes.

3. **A command goes ahead without a card only when every part is covered.** The policy engine
   allows a command when each of its parts starts with the words of an allow rule that is on.
   One part covered by a deny rule denies it. One part that nothing covers sends the whole
   command to a person, as does a command that can't be read. A rule without `starts_with`
   still answers its kind whole, as before, so a harness's own policy and the CLI keep what they
   can write today; only a person's answer stops writing kind-wide rules for commands. Kinds
   with no command (`file.edit`, `email.send`) are unchanged.

4. **Some commands never get a standing yes.** A command with a part that starts with one of
   these is answered each time, and its card offers Once only, with a line that says so ("Asks
   that use rm are answered each time."): `rm`, `rmdir`, `sudo`, `su`, `doas`, `chmod`,
   `chown`, `dd`, `mkfs`, `kill`, `killall`, `pkill`, `shutdown`, `reboot`, `curl`, `wget`,
   `ssh`, `scp`, `rsync`, `git push`, `git reset`, `git clean`, `find -exec`, `find -execdir`,
   `find -ok`, `find -delete`, and the ones that run whatever command or code they are given:
   `sh -c`, `bash -c`, `zsh -c`, `eval`, `exec`, `xargs`, `env`, `command`, `builtin`, `nohup`,
   `time`, `timeout`, `nice`, `watch`, `node -e`, `node --eval`, `python -c`, `python3 -c`,
   `perl -e`, `ruby -e`. A program is matched by its own name (`/bin/rm` is `rm`), and a
   two-word entry by its second word anywhere after the program (`git -C room push`). The list
   is in the protocol beside the reader. Chips still never sees the tool call itself; it reads
   the words the harness sent in its ask. A shell's own words (`if`, `!`, `for`) can't be read
   either, since they run the words after them.

5. **An Always can reach every space.** Under Always the card offers "In this space" and "In
   every space". Every space writes the rules into the harness's own policy (`policy.rules`,
   no space). The engine reads a space's rules first and the harness's after them, where it
   now reads only the space's row when there is one; the level is still the space's. Only an
   owner or an admin is
   offered it, and the door refuses it from anybody else (`wrong_role`), since it changes what
   the harness may do everywhere (SEC-1). It is picked for them by default, because a space is
   one conversation and an Always kept to one rarely comes up again.

6. **The answer says only how far it reaches.** `approval.resolved` gains `everywhere`, a
   boolean, read with scope `always`. The starts are not sent: the server reads them from the
   ask's own command, so an answer can't remember more than was asked. A standing yes on a
   command that can't be read or that uses a listed program is refused with `invalid`, as This
   session and Always are on an ask that matters.

7. **The harness is answered once.** When Chips's answer to a command is Always or This
   session, each bridge tells its agent Allow once rather than its own "always", so the agent's
   own memory doesn't let through more than Chips remembered. The next ask comes to Chips, and
   the rule answers it on the spot. `chips-acp` picks `allow_once` there; `chips-opencode`,
   `chips-hermes` and `chips-openclaw` answer once.

8. **What a person sees.**
   - The ask card, when Always or This session is picked on a command: a "Remembers" row with
     each start in code (`node --check …` `echo ok …`), and under Always the two Where chips. A
     line under them: "Commands made only of these go ahead without a card in every space.
     Anything else still comes to you." In this space, it names the space.
   - A command that can't be read: Once only, with "This command does more than Chips can read,
     so it's answered each time."
   - Allowed always (the sheet and the harness page): a command rule's row is named by its
     start in code, `node --check …`, over "In every space · by you, 27 October". A kind-wide
     rule on a command kind, which only a harness's policy or the CLI can now make, reads "Any
     command".
   - Asks that matter are unchanged: answered once, waiting for a person.

## Consequences

- The hole closes for every answer from now on: no person's answer writes a rule that lets
  `rm` through. Rules a harness declares in its own policy are unchanged.
- An Always becomes worth giving. With his history, a yes to `grep -noE … | sort | uniq -c`
  remembers `grep -noE`, `sort` and `uniq -c` in every space, and the next search built from
  them stops asking. Rules gather by their starts (`grep -n` and `grep -noE` are two), up to the
  200 a policy holds.
- A command that writes into a file with `>` still asks every time. So does a chain with one
  new part. A later step could treat `cd <the space's folder>` as covered, or read a `>` into a
  file inside the folder; neither is in this decision.
- `cd /…/room` parts are remembered with their folder, so they cover that folder only.

**Cost.** The protocol: `policyRule.when.starts_with`, `approval.resolved.everywhere`,
`commandParts` and the never list, then `pnpm gen:protocol`. The server: the engine's
part-by-part check, the harness's rules read after a space's, the Always and This session paths writing a rule per part, the `wrong_role`
and `invalid` doors, and a `starts_with` column on `session_rules` (a migration, so 4431 is
backed up and restarted). The conformance fake mirrors the engine. Core: what the card offers
and the rows' names. The phone and the web: the card's Remembers and Where rows. Four bridges
answer once, each a release and a reconnect. Tests: the reader against every one of the 19 real
commands, the engine, the server's paths and doors, the fake, the cards, and
`when-it-asks.spec.ts` carried to a chained command and to every space. About three days.

## The three picks, as he took them

1. **The never list in decision 4.** Recommended as written. It is Chips's own judgment of a
   command, which ADR 0195 left to the harness; the bridges don't flag these, so nothing else
   catches them.
2. **Every space by default** (decision 5), as the mock drew it, or this space by default.
   Recommended: every space, since the starts are narrow.
3. **No "Any command" for a person** (decision 2). Recommended. The mock drew it with a red
   warning line.
