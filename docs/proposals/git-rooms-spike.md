# Spike: a room's project as a git repository

Date: 22 October 2026
Status: Done, thrown away. It answers whether git can be the engine behind
[agents-share-a-project-plan.md](agents-share-a-project-plan.md) instead of the room's files. The
answer is yes. On Arjun's word the same day ("Rewrite the plan around git, with Chips holding each
room's repository"), the plan was rewritten around it, and its calls carry the rest of the ones
below.

His words: "Just brainstorming, should we actually setup git in these situations?", then "ok yes
please proceed. I need this to work very smoothly, this is only of the moats for chips".

## What was built

Everything ran on scratch, and 4431 and the live bridges were never touched.

- **A scratch Chips** on 4551 from nothing, with a CLI device paired to it for `pnpm live`.
- **A git server beside it** on 4552 (`door.mjs`): one bare repository per room, served by git's own
  `git http-backend`. It asks chipsd whether the request's token may read the room
  (`GET /v1/spaces/:id/files`) and refuses anything else with 403. Each repository refuses rewrites
  (`receive.denyNonFastForwards`) and deleting `main` (`receive.denyDeletes`). In a real build this
  is a route of chipsd's.
- **Pull, commit and push in two bridges** (`git-room.ts`): Hermes, and chips-acp running Claude
  Code. Each agent works in a clone, `<its folder>/room`.
  - Before a turn, the bridge fetches and merges, and tells the turn where the copy is and what
    others changed.
  - After the turn, it commits everything under the agent's name and pushes. If someone pushed
    first, git merges and the bridge pushes again. If the merge clashes, the marks stay in the
    agent's copy, nothing is sent, and the agent's next turn is told.
  - The token reaches git only through `GIT_CONFIG_*` in its environment, never its command line or
    a file. An agent that runs `git push` itself has no token and can't get around the bridge.
- **A script playing two agents** (`sim.mts`) through the same `git-room.ts`, with scripted edits in
  place of a model, for the race and the clash.

The code is on branch `spike/git-room` in `chips-hermes` (with `spike/door.mjs` and `spike/sim.mts`)
and in `chips-acp`. Neither branch is for main.

## What worked

1. **The server, behind the token.** Clone, fetch and push worked over HTTP. A request with no
   token, a wrong token, or a token whose harness isn't in the room got 403. A force push was
   refused (`non-fast-forward`), and so was deleting `main` (`deletion prohibited`).
2. **A real agent with no git of its own.** Hale (Hermes, on Claude Opus 5.5) read the note,
   worked in `room/`, ran no git, and said what it made. The bridge committed and pushed, and added
   to its words: "(Sent to the room's project as 6e9bc47: README.md, index.html, src/app.js,
   styles.css.)" One turn, 39 seconds, $0.72.
3. **A second harness picked it up with nothing attached.** Hale's words ended "src/store.js isn't
   in my copy" with no @, so Chips handed them to the room's lead after 20 seconds (ADR 0104). The
   lead was Wren (Claude Code). Wren's copy was cloned with Hale's four files in it, and Wren wrote
   `src/store.js` and `tests/store.test.js` beside them.
4. **A race on different files** (script). Ada and Bo sent at once. Bo's push was refused, git
   merged, and the bridge pushed: "(Sent to the room's project as b4cb8af, merged with Ada's
   changes: styles.css.)"
5. **A clash on one line** (script). Ada's change landed, and Bo's was held back with both sides
   marked in Bo's copy: "(Not sent to the room's project yet: src/app.js clashed with Ada's change.
   Bo settles it next turn.)"
   - Sending with the marks still in was refused, and Bo's next turn was told again.
   - Settled, it was sent, and Ada's next turn said "Changed by others since your last turn:
     src/app.js (by Bo)" and had both changes.
6. **OpenClaw's container can use the copy too.** The container has git 2.39.5 and sees its mounted
   folder as its own user (`node`), so a clone the bridge makes on the Mac side works inside it. A
   full OpenClaw turn wasn't run, because the bridge can't run a second copy without taking OpenClaw
   off 4431.
7. **A harness on another computer** reaches chipsd today over the tailnet's HTTPS, not the relay
   (ADR 0191), so the same route would serve its git. A harness that could only reach Chips through
   the relay would need its bridge to carry git through the SDK.

## What didn't, or wasn't seen

1. **Codex can't take a turn.** Its ChatGPT plan has ended (ACP-7), so Moss answered with the model
   error in 3 seconds. Claude Code took its place.
2. **Claude Code's API key is out of credit.** Wren's run failed with "Credit balance is too low"
   after writing its files. This will stop your live Claude Code agents too, and any other harness
   on the same key.
3. **Wren's work is still unsent**, because the bridge only sends when a turn finishes. Nothing is
   lost: the agent's next turn commits what was left before it merges. The real build should decide
   whether a failed or stopped turn sends what it made.
4. **No real agent settled a clash.** The script shows the bridge's side, but whether Hermes or
   Claude Code settles the marks well when told needs a run with credit.
5. **A permission ask stalls a team.** Claude Code asked before running `node --test`, and the ask
   waited 30 minutes, because my watcher looked for the wrong event name (`approval.requested`
   instead of `approval.request`). The bridge's own git never asks, since it runs outside the
   agent's permissions. But a team build needs someone answering asks, or a mode that allows its
   test commands.
6. **Git on the machine Chips runs on wasn't tested missing.** This Mac has Xcode, so chipsd ran
   Apple's git 2.50.1. A Mac without the Command Line Tools has only the `/usr/bin/git` stub, which
   opens Apple's install prompt instead of running.

## What the real build fixes, from the run

- The commit subject repeats the name ("Ada: Ada: Header comment"), since the author is already
  the agent.
- Merges read as "Merge remote-tracking branch 'origin/main'" and put a fork in the history at every
  race. A clean race should be rebased so the history stays a line, and a merge used only where
  marks are left.
- The marks say `HEAD` and `origin/main`. They should say whose each side is.
- A clash told a second time lost who it clashed with ("another agent's").
- The note's file count counted a clashing file three times (6 instead of 4).
- "still carry clash marks" should be "still carries".

## What it means for the plan

Git holds up as the engine. Rewritten around it, the plan:

- **Drops:** folders in names (planned ADR 0220), our own three-way merge (planned ADR 0221), and
  most of the room-copy code.
- **Adds:**
  - a git route in chipsd, one repository per room, behind the token and room membership;
  - pull, commit and push in the SDK, used by every bridge, with Jacobian doing the same in its own
    code;
  - Files and each turn's diff read from the repository, so a person sees what an agent changed.
- **Keeps:** the `room/` folder, what each turn is told, the rules for agents of one harness, and
  attachments for what's said in chat.

## Your calls before the rewrite

1. **Chips holds code.** A room's repository lives on your Chips server. That makes Chips a small
   code host, and erasing a room has to delete its repository.
2. **Git where Chips runs.** Either Chips needs git installed and its setup checks for it, or Chips
   for Mac ships its own copy (git is GPLv2, and it would run as a separate program).
3. **Credit for the real runs.** A top-up of the Claude Code key, or another key, so a real agent
   can be seen settling a clash, and so the mixed and same-harness team runs can happen.
