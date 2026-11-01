# 0221. An agent works on the room's project in a copy of its own, and its bridge does the git

Date: 23 October 2026
Status: Accepted, 23 October 2026, on Arjun's word: "Push go live, start phase 2". The plan is
[agents-share-a-project-plan.md](../proposals/agents-share-a-project-plan.md), Phase 2. The project
itself is [ADR 0220](0220-a-rooms-project-is-a-git-repository-chips-holds.md).

## Context

ADR 0220 gives each room a git repository Chips holds. Agents don't reach it yet: each bridge
hands its agent a folder of its own and knows nothing of the room's project. The spike (22 October)
did the git in the Hermes bridge, with merges throughout; it worked, and showed what has to be
settled once for every bridge rather than in each:

- where the agent's copy is, and that the agent never runs git itself;
- what a turn is told of the project, and in what words;
- what happens when two agents change the project at once, and when their changes overlap;
- what is never committed, and what a turn that stopped leaves behind;
- how the token reaches git without the agent, or a person's own git setup, getting in the way.

## Decision

1. **The SDK holds it.** `packages/sdk-ts/src/project.ts`: `chips.project({ spaceId, agentId,
   name, folder })` is one agent's copy of one room's project, at `<folder>/room`. Every bridge on
   the SDK calls `pull()` before a turn and `push({ words })` after it. Jacobian's own channel does
   the same to the same rules (Phase 4). The agent works in the folder and runs no git.

2. **Before a turn, `pull`.**
   - The copy is made on first use and pointed at the room's project, with the leave-out list in
     its own `info/exclude`: `node_modules/`, `.venv/`, `__pycache__/`, `dist/`, `build/`,
     `.DS_Store`, `.env` and `.env.*`, but not `.env.example`, `.env.sample` or `.env.template`
     (`PROJECT_LEAVE_OUT`).
   - What a turn left unsent, a turn that failed or was stopped included, is committed first, as
     "Work left from a turn that didn't finish", so it goes with the next turn and nothing of it is
     lost (the plan's call 3, as recommended).
   - The copy is brought up to the room's `main`, the agent's own unsent commits replayed on top.
   - What others changed since the agent last looked, and who, is what the turn is told, with a
     clash still to settle or a key to take out.

3. **What the turn is told.** `promptFor(message, { taker, project })` adds the project's note
   after the room's note (`renderProjectNote`, in the protocol, so Jacobian's channel says the same):

   > The room's project is a git repository. Your copy is /Users/…/hale/room (12 files), brought up
   > to date just now. Changed since your last turn: src/store.js and tests/store.test.js, by Wren.
   > Work on the project in that folder and leave git to Chips: when your turn ends, what you
   > changed is committed under your name and sent to everyone here. Keep scratch work outside it.
   > Everyone here sees the project's files, so don't send them with your answer as well.

   The last sentence came from a live run (23 October): agents told with every turn that "a file
   reaches this room only when you send it" sent each project file with their answers too, and
   argued over which copy, the room file's or the project's, was current. The note alone didn't
   always hold (AP-9: two of ten replies in a later run), since the sending words come after it, so
   those say it too where the turn has a project: "A file that isn't in the room's project reaches
   this room only when you send it" (`sendingFiles({ project })` in the SDK; Hermes's run
   instructions and OpenClaw's own words the same).

   In a room with other agents it adds: "Split the work by file where you can. Changes to different
   parts of a file are merged, and a clash goes back to whoever sent second." And, his pick on 23
   October after agents with no lead renamed their files to match each other's at once and crossed
   (AP-7): "When your file and another's use different names for the same thing, the one that
   reached the project first keeps its names, and the other changes its names to match." It is
   about names only: nothing anyone wrote is dropped, and a clash on the same lines is still marked
   and settled keeping what both meant. When the project has
   Markdown files: "In Markdown, put each sentence on a line of its own."

4. **After a turn, `push`.** Everything the agent changed is committed under its name (author and
   committer, `<agent id>@agents.chips.invalid`), with the first line of its words for the subject
   and no name in front, and sent to `main`.
   - **Somebody sent first.** The agent's commits are replayed on top of theirs (a rebase) and
     sent again, up to four times. History stays a line.
   - **The two overlap.** The replay is undone and the two are merged instead, so both sides are
     marked in the agent's copy. The marks are relabelled for a person: `<<<<<<< yours` and
     `>>>>>>> Wren`, or `the room` when several sent. Nothing of the agent's is sent until the
     marks are gone, and its next turn is told which files and whose change. Once settled, the
     merge is committed and sent like any change.
   - **What `push` answers:** `sent` with the commit and its files and whose changes it went over;
     `nothing`; `clash`; `keys`; `refused` in the server's words; or `failed`. A bridge logs it.
     People see a change with the reply that made it in Phase 5 (ADR 0222, Arjun's C).

5. **What is never committed.** The leave-out list, and any change in which a file's name says it
   holds secrets or its words look like a key, by the protocol's shapes: then nothing of the change
   is committed, it stays in the copy, and the next turn is told which file and whose key it looks
   like. The server refuses the same (ADR 0220), as the backstop.

6. **git runs apart from the machine's.** The token goes through `GIT_CONFIG_*` in git's
   environment, never its command line or a file, beside the agent in `chips-actor`; an agent that
   runs `git push` itself has neither. git reads no system or global config and runs no hooks
   (`GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_GLOBAL=/dev/null`, `core.hooksPath=/dev/null`), so a person's
   signing key, hooks or `pull.rebase` change nothing, and it never prompts.

7. **An agent moved to another room** (ADR 0087) has its old copy kept beside the new one, renamed
   `room-<that room's id>`, and a new copy starts. The id, not the name: two rooms may share a name.

8. **No git, no project.** `checkGit()` says whether the machine has git 2.31 or newer, on the `PATH`
   the project's git runs with. A bridge without it says so in its log as it starts and works
   without the project (Phase 3): its harness is not in trouble, since every agent still answers.
   `pushedInWords` says what each push did, the same way in every bridge's log.

## Consequences

- Agents of any harness on the SDK, and of one harness, can share a project once their bridges call
  `pull` and `push` (Phase 3). Nothing changes for a bridge that doesn't.
- History is a line except where a clash was settled, which leaves one merge commit.
- A clash costs the second agent a turn. The referee's limits (ADR 0187) count it like any other.
- The words of the note are the protocol's, so a change to them reaches every bridge with the SDK,
  and Jacobian's channel when it is re-vendored.
- Each agent keeps a full copy. For a large project on one machine, a shared history between the
  machine's copies is left for later (the plan's open offer).

## Addendum, 25 October 2026: the copy's config is the agent's, so git doesn't follow it (SEC-52)

6 said an agent that runs `git push` itself has neither the token nor `chips-actor`. Its own push
hasn't, but the agent can write its copy's `.git/config`, which the bridge's git reads: pointed
elsewhere, `origin` took the bridge's next push, token and all, to the agent's server, and
`core.fsmonitor` names a program git runs with the token in its environment. Now the bridge fetches
and sends by the project's URL rather than `origin` (and sets `origin/main` itself after a push),
turns `core.fsmonitor` off with an empty value (git before 2.36 would run "false" as a program), and
leaves an agent's copy alone while its config holds anything besides what `git init` and the bridge
write: a rewritten URL, a proxy, a filter or another program. A branch's upstream and a name for
commits are let through, since git run by URL ignores them. The turn is told which settings, and a
push is held with the same words. A person's folder (ADR 0224) is their own config, so it gets the
URL and `core.fsmonitor` but not the refusal. Jacobian's channel keeps its own copy of the bridge's git, and does the
same (Jacobian `9090d69`, live 25 October 2026); it has no person's folder.
