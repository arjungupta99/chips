# Agents working on one project

Date: 22 October 2026
Status: Proposed, second version. Rewritten around git on Arjun's word ("Rewrite the plan around
git, with Chips holding each room's repository"), after the spike in
[git-rooms-spike.md](git-rooms-spike.md). The first version, a copy of the room's files synced
through attachments, is replaced. Phases 1 and 2 are built (23 October, ADRs 0220 and 0221); the
rest waits for the calls at the end. ADR numbers start at 0220, since 0219 is the reply-to-a-message ADR.

His words: "how would they work and contribute to a share code / project", "I need plan for
multiple agent - multi harness, and multi agent same harness as well", and "I need this to work
very smoothly, this is one of the moats for chips".

## What it costs

- **Changes:** chipsd, the protocol, the SDK, four bridges (OpenClaw, Hermes, OpenCode, chips-acp)
  and Jacobian, then the room on the phone, the web and the Mac after a mock. A small CLI command
  comes last.
- **No migration.** Repositories live on disk beside the database.
- **Restarts:** the server, each bridge and Jacobian, once or twice each, plus Mac and phone builds
  for the screens.
- **ADRs:** four.

In return, every agent in a room, of any harness, works on the same project with its full history.
Two agents changing one file are merged by git, and a real clash goes back to the agent that sent
second. A person sees each agent's change as a diff, can undo one agent's change without touching
the others, and can clone the project to a laptop.

## How it works today

Each agent works in a folder of its own, on whatever machine its harness runs on. The only thing
they share is the room's files: a file posted in a room is the room's, and the same name posted
again is its next version (ADR 0099). Only Jacobian and the OpenClaw bridge fetch a teammate's file
and say which version theirs was made from. Hermes and OpenCode fetch nothing, and chips-acp only
gets files attached to the message that @s it. File names are flat, a clash means redoing the whole
file, and no team mixing harnesses has been run.

## The shape

**Chips holds one git repository per room.** chipsd serves it over git's own smart HTTP, at
`/v1/spaces/:id/project.git`, behind the same token and room membership as every other route.

**Each agent works in a clone of its own**, `<its folder>/room`, on its own machine. That's a Jacobian
Space's artifacts, an OpenClaw agent's workspace, or the folder Hermes, OpenCode and chips-acp give
each agent.

**The bridge does the git, never the agent:**

1. **Before a turn**, it fetches the room's `main` and brings the clone up to date.
2. **After the turn**, it commits everything the agent changed, under the agent's name, and pushes.
3. **When someone pushed first**, it replays the agent's commit on top (a rebase) and pushes again.
4. **When the two changes overlap**, it stops the rebase, merges instead so that both sides are
   marked in the agent's copy, sends nothing for it, and tells the agent's next turn.

**Each turn is told** where its copy is and what changed:

> The room's project is a git repository. Your copy is /Users/…/agents/hale/room (12 files),
> brought up to date just now. Changed since your last turn: src/store.js and tests/store.test.js,
> by Wren. Work on the project in that folder and leave git to Chips: when your turn ends, what you
> changed is committed under your name and sent to everyone here. Keep scratch work outside it.

**Each push is recorded.** chipsd appends a `project.changed` event after every push it takes,
saying who pushed, the commit, its message and the files it changed. It's how anything outside a
bridge learns of a change. The agent's reply carries the commit, so people see the change with the
reply that made it (What people see, below).

The spike showed all of this working except a real agent settling a clash, because the credit ran
out.

## chipsd

- **The route.** `/v1/spaces/:id/project.git/*` runs `git http-backend` with the room's repository,
  as the spike's door did, inside chipsd. The repository is made on first use, under
  `<data dir>/projects/<space id>.git`, with `main` as its only branch.
- **Who may use it.**
  - A harness's token, for a room one of its agents is in. The bridge names the agent with a
    `Chips-Actor: agt_…` header, and chipsd checks that the agent is the harness's and in the room,
    as it checks the actor on a post (ADR 0087). The push and its event carry that agent.
  - A person's device, through a short-lived token it asks for with a signed request
    (`POST /v1/spaces/:id/project/token`, ten minutes). That's how the CLI clones, since git can't
    sign Chips's requests.
  - Anyone else gets 403.
- **What a push may not do.**
  - It may not rewrite `main` or delete it. The repository refuses both, as the spike's did.
  - It may not add a file over the workspace's cap for files (ADR 0047), or take the repository
    past `limits.maxProjectBytes` (1 GB unless set). A workspace can't set its own project cap yet.
  - It may not add a file that looks like a secret: a `.env` file, or a known key shape such as
    Anthropic's and OpenAI's (`sk-ant-…`, `sk-proj-…`), AWS's (`AKIA…`) or a private key block.
    The push is refused, and the bridge tells the agent which file and why. The SDK checks the same
    things before it commits, so a refusal from chipsd is a backstop.
- **What follows the room.**
  - Erasing a room deletes its repository. Archiving keeps it.
  - Chips forks agents, not rooms: an agent's copy works on its room's project like any agent, so
    there is nothing to copy. A thread uses its room's project.
  - A database backup doesn't include the repositories, so the backup notes in `testing/` and the
    install docs say to keep `projects/` with it.
- **Git on the machine.** chipsd needs git 2.31 or newer, the first with `GIT_CONFIG_*`. Its setup
  check says so, and a room's project says it's unavailable rather than failing silently. Call 2
  decides whether Chips for Mac ships git instead.
- **ADR 0220**: a room's project is a git repository Chips holds.

## The SDK and the bridges

`packages/sdk-ts/src/project.ts`, used by every bridge on the SDK:

```ts
const project = chips.project({ spaceId, agentId, folder }); // one per agent
const pulled = await project.pull(); // before the turn: the clone up to date, and what changed
const text = promptFor(message, { taker, sendsFiles: true, project: pulled });
// … the turn runs …
const sent = await project.push({ words: answer }); // after: commit, push, rebase or mark
```

- **The token never reaches git's command line or a file.** It goes through `GIT_CONFIG_*` in git's
  environment, beside the `Chips-Actor` header. An agent that runs `git push` itself has neither,
  so it can't get around the bridge.
- **Leave-out list:** written into the clone's own `info/exclude`. It covers `node_modules/`,
  `.venv/`, `__pycache__/`, `dist/`, `build/`, `.DS_Store`, and `.env` and `.env.*`.
- **Commits.** The author is the agent, and the subject is the first line of its words, with no
  name in front.
- **Clash marks name both sides.** One side is labelled with the agent who sent first, and the note
  explains which side is the agent's own.
- **A turn that fails or is stopped** keeps its changes in the copy, and they go with the agent's
  next turn. They show under that next reply (call 3).
- **An agent moved to another room** (ADR 0087) has its old copy renamed `room-<old room's id>`
  (the id, since two rooms may share a name), and a new clone starts.
- **The bridge checks for git at start.** Without git, or with git older than 2.31, the bridge says
  so in Chips and runs without the project.
- **ADR 0221**: an agent works on the room's project in a copy of its own, and its bridge does the
  git.

| Harness | Where its copy is | Who does the git |
|---|---|---|
| Jacobian | the Space's artifacts, `artifacts/room/` | Jacobian's own Chips channel, to the same rules |
| OpenClaw | the agent's workspace, `chips/<agent>/room/`; the turn names the path inside the container | the SDK, in the bridge on the Mac side of the mount |
| Hermes | `~/chips-hermes/agents/<name>/room/` | the SDK |
| OpenCode | `~/chips-opencode/agents/<name>/room/` | the SDK |
| Codex, Claude Code | `~/chips-acp/<kind>/<name>/room/` | the SDK |

OpenClaw's container has git 2.39.5 and sees its mounted folder as its own user, so an agent there
can read the project's history. It needs no git of its own to work, because the bridge does the git
on the Mac side.

## Agents of one harness

Agents of one harness follow the same rules as agents of different harnesses. Each has its own
clone, and they meet in the room's repository. Agents sharing one folder is how a team's game was
written over Cora's in TT-16. Hand-offs between agents of one harness already work (ADR 0101).

A person can still point all of a harness's agents at one folder of theirs, with Hermes's `folder`,
OpenCode's `directory` or chips-acp's `folder`. Those agents then work in that folder directly, with
no room project, as today. That's how someone points agents at their own repository. Linking that
repository to the room's (pull from it, push to it) is left for later.

## Turns

A team build uses what's already there:

- An @ gives an agent its turn. What was nobody's turn goes to the lead (ADR 0104); in the spike,
  Hale's message that @'d nobody reached the lead with nobody asking. Agents of one harness hand
  work to each other (ADR 0101).
- In a room with two or more agents, the note adds: "Split the work by file where you can. Changes
  to different parts of a file are merged, and a clash goes back to whoever sent second."
- When the project has Markdown files, the note also says: "In Markdown, put each sentence on a
  line of its own." Git compares whole lines, and a paragraph is one line, so two edits anywhere in
  the same paragraph always clash, even when they touch different sentences. A sentence per line
  looks the same when the file is shown, and edits to different sentences then merge.
- When an agent makes a web page for the project, the note says: "A page opens on the phone with
  the files it names: link them with tags and imports, and don't fetch them while it runs." See A
  page from the project runs on the phone, below.
- The referee tells agents to stop after 16 messages between them and holds them at 48 (ADR 0187).
  The live runs will show whether a build needs more.
- A permission ask stops a turn until someone answers it. In the spike, Claude Code's ask to run
  `node --test` waited 30 minutes. The bridge's own git never asks, since it runs outside the
  agent's permissions. But a team build needs a person answering, or a mode that allows its test
  commands.
- Each agent runs code in its own copy on its own machine: OpenClaw's in a Linux container, the
  others on this Mac. When an agent says the tests pass, they passed there.

## What people see

Your pick on 23 October, from the mock's three ways, is C: the change goes with the reply that made
it, and the room gets no line of its own for it. His words: "I want to make sure we are not making
things look over complex. At the same time they should be accessible from space detail page".

- **Under a reply that changed files**, one small grey line: "2 files changed". A reply that
  changed nothing has none, so talk about a design stays plain talk. On the phone, tapping it opens
  What the run did. On the web and the Mac, "· 2 files changed" ends the receipt line already
  under the reply, and opens the change.
- **What the run did** gains the change: "2 files changed" ends its summary line, and under it come
  the files, each with its lines added and removed, and See the change.
- **A change** shows its files and their diffs, with Undo.
- **Undo** reverts that one change as a new commit by the person. Every later change stays, and the
  agents' next turns are told. The reply's line then reads "2 files changed · Undone", and the
  room gets one line, "Arjun undid Wren's change", with Put it back.
- **A push with no reply to carry it**, such as a turn that ended without words or a person's push
  from a clone, gets one quiet line in the room: "Wren changed 2 files".
- **Changes that weren't sent**, after a clash or a failed turn, go with the agent's next turn and
  show under that reply.
- **The room sheet gets a Project tile**, "6 files", beside Lead and Spend per job. It opens the
  project, with two tabs:
  - **Files**: a tree of folders at `main`. Each file opens as files do today (a page, Quick Look
    or the share sheet), with its history under it.
  - **Changes**: every change, newest first, with who made it, its files, the time and its lines.
    An undone change says so, and the person's Undo is a row of its own.
- **Files posted in chat** stay attachments, shown with the message, as today.

How the reply carries it: `project.push` returns the commit, and the bridge sends the answer with
`change: <commit>`. chipsd checks that the commit was that agent's push to this room, and keeps it
on the line. The clients draw the count from it.

This is ADR 0222, or an addendum to ADR 0100.

## A page from the project runs on the phone

Today a page has to be one self-contained file: it runs its own inline script under `HTML_POLICY`,
with no network (ADR 0059's addendum, ADR 0201). A game the agents build is several files, so
`index.html` opened from Files would show its grid with no script and no styles.

**A project page is built into one document before it opens.** Opening an HTML file from the
project, from Files, from a change, or from a link in an agent's words:

1. chipsd reads the page and every file it names by a relative path from the room's repository, at
   `main`, or at that change for an older version.
2. It folds them in: stylesheets as `<style>`, scripts as inline `<script>`, pictures and fonts as
   `data:` URLs, and `url()` inside the CSS the same way.
3. Scripts that import each other (`game.js` importing `./puzzle.js`) are bundled into one module.
4. Then the page opens exactly as a page does today: the same policy, the same sandbox, the same
   page door on the web and the Mac, the same document on the phone. It opens no network, so
   nothing about what a page can reach changes.

**The route:** `POST /v1/spaces/:id/project/page {path, at?}`, signed by a device whose person is in
the room. It answers with the page door's ticket for a frame that can follow it (ADR 0201), or the
document itself for the phone and a device behind the tunnel. It is built on the server, since only
the server holds the repository.

**Limits:**
- A page that fetches its own files while it runs (`fetch('levels.json')`) doesn't find them. Only
  files it names in tags and imports are folded in, which is why the note asks for that.
- Files outside the project, and addresses on the internet, are left as they are, and the policy
  keeps them from loading.
- The built page is held to the upload limit.

**Bundling needs esbuild in the server.** Today Chips has it only as a development dependency,
through `tsx`. This is call 6. Without it, only pages whose scripts don't import each other would
run.

This is ADR 0223.

## Phases

Each phase is committed to main and fast-forwarded when it's done. Pushing and going live wait for
your word, and I do the restarts.

1. **chipsd holds the project** (ADR 0220). Built 23 October: the route, who may use it, the
   refusals, the `project.changed` event, erase, and the git check. The conformance fake serves a
   project the same way, since bridges test against it. Server restart.
2. **The SDK's project** (ADR 0221). Built 23 October: pull, push, rebase or mark, the notes, the
   leave-out list, the secret check, and the git check. Tested with real git against chipsd and the
   fake.
3. **The bridges take it:** Hermes, OpenCode, chips-acp and OpenClaw. Built and live 23 October,
   each in its own repository and restarted. Agents of all four share a project; people see only
   the agents' words until Phase 5. Only agents with a folder of their own get a copy: in chips-acp
   not those the config puts in one folder of the person's, and in OpenClaw only the agents the
   bridge made, told the path inside the gateway's container. OpenClaw's words steer into a running
   turn, so its copy is brought up to date and sent only between the session's turns.
4. **Jacobian takes it** in `~/Work/Jacobian`. Built and live 23 October (Jacobian `58a31c7`):
   its Chips channel's `project.ts` is the SDK's in Jacobian's own code, the copy `room/` in the
   artifacts of the Space taking the turn, sent before each answer and once more as the turn ends.
   Its lead claiming hand-offs it never @s (TT-12) is checked in Phase 8's run. Jacobian restarts.
5. **People see it** (ADR 0222): way C, picked on 23 October. Built and live 23 October (Chips
   `c22c77d7`): a reply carries `change`, kept when it is the agent's own commit on `main`; "2 files
   changed" under it opens the change with its diffs and Undo (Put it back is the Undo of an Undo);
   the room sheet's Project tile has Files, Changes and a file's history. The four bridges and
   Jacobian (`39c4e30`) send `change`. Server, bridges and Jacobian restarted 03:54, the web
   rebuilt, Chips for Mac installed, the phone's build 202610231058 installed over Wi-Fi.
6. **A page from the project runs on the phone** (ADR 0223). The page builder in chipsd (parse5,
   and esbuild for modules, installed beside the release's bundle as SQLite and sharp are), its
   two routes (the document, and a page door ticket holding it), and Open page on an HTML file of
   the project on each client. The note asks a project with a page to name every file it needs.
   Server restart, and Mac and phone builds.
7. **A person clones it.** `chips project clone <room> [folder]` gets a short-lived token through a
   signed request, with a git credential helper, so the project opens on a laptop and a person's
   own push shows in the room like an agent's. Built 23 October: the room by its name, its id or a
   link with the id; the clone's git config names the CLI itself as its only credential helper
   (`chips project credential`), which asks the paired device for a new token each time, so no
   token is kept; the person's name and `<person id>@people.chips.invalid` sign their commits.
8. **Live runs**, below, with findings in `testing/findings.md` under AP-. Run 23 October: a Sudoku
   by Jacobian, OpenClaw and Hermes; a guide by three Hermes agents; research with a Jacobian lead,
   OpenCode and Claude Code; a memory game by three Claude Code agents, twice; a clash on purpose;
   an Undo. Three fixes went live with them (AP-2 to AP-4); AP-7 and AP-9 were fixed after, AP-7 on his pick (call 8); AP-5, AP-6 and AP-8 are open.

The room-file versions of ADR 0099 and 0100 (`replaces`, `stale_file`, Files' versions of
attachments) stay until every bridge and Jacobian use the project, and are retired after it has been
live a while (call 4).

## Tests

- **chipsd:** who may fetch and push (a harness with and without the agent in the room, a device's
  short token, anyone else); rewrites, deletes, caps and secrets refused; the event after a push;
  erase deletes and fork copies.
- **The SDK**, with two clones against the fake: a race rebased; a clash marked and held back;
  sending refused while marks remain; settled and sent; the leave-out list; a secret refused before
  commit; a failed turn's work kept for the next; a move to another room.
- **The page builder:** a page's stylesheets, scripts, pictures and fonts folded in; scripts that
  import each other bundled; a fetched file left out; a file outside the project left out; an older
  version built from its own change; the upload limit held; the built page under the same policy.
- **An e2e spec** in `apps/web/e2e`: two stand-in harnesses build one project; after Phase 5, people
  see each changed reply's file count, What the run did with its files, the diff and Undo; after Phase 6, its `index.html` opens and its script
  runs.
- **Live**, in `testing/scenarios/harnesses/agents-share-a-project.md`:
  1. A mixed team: Jacobian, OpenClaw, Hermes and Claude Code in one room with a lead, on a small
     to-do web app split by file.
  2. Teams of one harness: three agents each of Jacobian, OpenClaw, Hermes, OpenCode and Claude
     Code, on the same brief.
  3. A clash on purpose, with real agents: two asked at once to change one function in
     `src/store.js`, and the second seen settling the marks.
  4. A small Sudoku game built by three agents of three harnesses, opened from Files on the phone
     and played there.
  5. A Markdown document two agents edit at once, checked for one sentence per line and for
     clashes only where they changed the same sentence.
  6. Undo of one agent's change from the phone, and the next turns working from it.
  7. A clone on a laptop, a person's push, and the agents picking it up.

  A run passes when every agent's copy ends at the room's `main`, nothing an agent sent is lost, the
  app runs from a fresh clone, and each room's cost is written down.

## What this leaves out

- **Codex**, until it can take a turn again (ACP-7: the ChatGPT plan ended).
- **Linking a room's project to an outside repository** such as GitHub, in either direction.
- **Branches and pull requests.** Every agent works on `main`, and Undo is the person's control.
- **Holding a change until someone approves it.** Your call on 23 October: "I do not want to add
  some hard coding for holding stuff". Changes land after each turn. A reviewer reviews after they
  land and asks for fixes in words, and a person can Undo.
- **One shared running copy of the app**, such as a dev server everyone uses.
- **Locks or claims on a file.** Git's merge and the note's "split by file" should be enough, and
  the live runs will show whether they are.

## Your calls

1. **Chips holds each room's repository.** Decided by you on 22 October.
2. **Git where Chips runs.** Either Chips requires git and checks for it at setup, or Chips for Mac
   ships its own copy (git is GPLv2, and it would run as a separate program). I recommend requiring
   it with a clear check. A Mac without git gets Apple's one-click install of the Command Line
   Tools, people who run coding agents nearly always have git already, and a copy we ship is one we
   have to keep patched. Ship it only if the first installs show people stopping there.
3. **A failed or stopped turn's changes** stay in the agent's copy and go with its next turn, or are
   sent at once. I recommend keeping them, since a turn that broke halfway may have left a file
   half-written.
4. **Room-file versions for agents** (ADR 0099's `replaces` and `stale_file`) retire once every
   harness uses the project. I recommend yes, after it's been live a while, keeping attachments for
   chat.
5. **Undo from the phone** comes in Phase 5, or later. I recommend Phase 5: it's the control that
   makes letting agents change a project feel safe.
6. **esbuild in the server**, so a page whose scripts import each other runs on the phone. I
   recommend it: agents write scripts as modules that import each other, as the Sudoku example
   does, and esbuild is small and widely used. Without it, only pages with no imports between their
   scripts would run.
7. **Credit for the live runs:** a top-up of the Claude Code key, or another key. Without it,
   Phases 3, 4 and 7 can't be checked with real agents.
8. **Who gives way when agents with no lead disagree** (AP-7, from Phase 8's runs). Decided by you
   on 23 October: the sentence, not a lead. Live in Chips `ab75c4df`; Run D3 settled with no name
   crossed. Three agents
   writing files that must agree each changed theirs to match the others' at once, and the names
   crossed two or three times before settling. Either the note for a room with several agents says
   "When two files disagree, change yours to match the one that reached the project first", which
   every copy's history agrees on, or a room whose agents share a project gets a lead. I recommend
   the sentence: it costs nothing, and it works with or without a lead.
