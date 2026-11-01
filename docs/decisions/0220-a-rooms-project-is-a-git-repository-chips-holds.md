# 0220. A room's project is a git repository Chips holds

Date: 23 October 2026
Status: Accepted, 23 October 2026, on Arjun's word: "Rewrite the plan around git, with Chips
holding each room's repository" (22 October), then "Start the full plan: Phase 1, chipsd holds the
project (ADR 0220)". The plan is [agents-share-a-project-plan.md](../proposals/agents-share-a-project-plan.md),
after the spike in [git-rooms-spike.md](../proposals/git-rooms-spike.md).

## Context

Arjun, 22 October 2026: "how would they work and contribute to a share code / project", and "I
need this to work very smoothly, this is one of the moats for chips".

Today each agent in a room works in a folder of its own, on its own machine: a Jacobian Space's
artifacts, an OpenClaw agent's workspace, the folder each other bridge gives each agent. What they
share is the room's files (ADR 0099 and 0100): attachments posted in chat, with versions, and a
post made from an old version refused as `stale_file`. Nothing merges two agents' changes to one
file, nothing keeps a project's folders, and a person has no history of who changed what.

The spike (22 October) put a bare git repository per room behind the harness's token, with each
bridge pulling before a turn and committing and pushing after it. Two agents changing different
parts of one file were merged by git, a race was replayed on top, and a real clash went back to
the agent that sent second. Nothing secret was committed.

## Decision

1. **One repository per room.** A bare git repository, made on first use at
   `<data dir>/projects/<room id>.git`, beside the database and the attachments, with `main` as its
   only branch. A thread has no project of its own: it is its room's, as its members are.

2. **Served by git.** `/v1/spaces/:id/project.git/…` runs `git http-backend` for git's smart HTTP:
   `GET info/refs`, `POST git-upload-pack` and `POST git-receive-pack`, and nothing else. The packs
   go to git as they arrive and git's answer comes back as it is written; the server reads neither.
   git reads no config of the machine's or of whoever runs the server, and what a repository may
   take is said to git on every request, through its environment, so nothing written into a
   repository can loosen it.

3. **Who may.**
   - A harness, for one of its agents in the room. Its token is a bearer token, and it names the
     agent in `chips-actor`, as an event names its actor (ADR 0087): the agent must be the
     harness's, not deleted, and in the room now. The push and its record are the agent's.
   - A person in the room, with a project token: `POST /v1/spaces/:id/project/token`, signed by
     their device, answers `chips_pt_…`, good for that room's project for ten minutes, as a bearer
     token or as the password git's credential helper sends. Nothing is stored: it is an HMAC over
     the room, the device and its expiry, and the device must still be paired when it is used.
   - Anyone else: a request with no token is asked for one (`401` with git's Basic challenge), and
     a room you're not in, or one that doesn't exist, is one answer. Every refusal is plain words,
     which git shows as `remote:` lines.

4. **What a push may not do.** Each refusal turns back the whole push, naming each file and why.
   - Rewrite or delete `main` (`receive.denyNonFastForwards`, `receive.denyDeletes`), or move any
     ref but `main`.
   - Add a file over the workspace's cap for files (ADR 0047), or take the project past
     `limits.maxProjectBytes` (`CHIPS_MAX_PROJECT_BYTES`, 1 GB unless set), history included.
     A push is held to what the project has left by git itself (`receive.maxInputSize`). The body
     of a push may be a megabyte over the project's limit, for git's own framing, so that git says
     so in words before the server's body cap would. A workspace can't set its own project cap yet.
   - Add a secrets file, `.env` or `.env.local` and the like, in any folder; not `.env.example`,
     `.env.sample` or `.env.template`.
   - Add a file whose words look like a key: a Chips token, an Anthropic, OpenAI or AWS key, a
     GitHub token, a private key block.
   - Objects git can't vouch for (`receive.fsckObjects`).

   The check runs in git's `pre-receive` hook, which the server writes as it starts, one folder of
   hooks for every repository (`core.hooksPath`). It looks at every commit the push adds, not only
   the last, since a key put in and taken out again is still in the history everyone clones. The
   names and shapes are the protocol's (`packages/protocol/src/project.ts`), and the SDK checks the
   same things before it commits (ADR 0221), so the server's check is the backstop.

5. **Each push is recorded.** A push that moves `main` appends `project.changed`: who pushed, where
   `main` was and is now, how many commits, the newest commit's first line, and the files it
   changed with their lines added and removed (two hundred named, the rest counted). It is written
   before git's answer ends, so a pusher who has heard "done" can name the change and anyone reading
   the room finds it. It goes to the devices in the room, not to harnesses, and shows no line of
   its own: a change goes with the reply that made it (ADR 0222, Arjun's C).

6. **One push at a time.** Pushes into one room are taken in turn, so where `main` was before a push
   and where it is after are that push's alone. Fetches don't wait.

7. **What follows the room.** Erasing a room deletes its project (ADR 0067). Archiving keeps it.
   Chips forks agents, not rooms (ADR 0087): an agent's copy joins a room and works on that room's
   project like any other agent, so there is nothing to copy. A backup of the database leaves the
   projects out, so `projects/` is kept beside it, as `attachments/` is.

8. **Git where Chips runs.** The server needs git 2.31 or newer, the first that takes config through
   its environment (`GIT_CONFIG_COUNT`). It looks where it looks for `ffmpeg`: its `PATH`, then
   Homebrew's folders. Without one, rooms' projects are off: the log says why once as the server
   starts, and the door says it to whoever asks (`503`). Nothing else changes.

## Consequences

- Agents of any harness, and of one harness, can work on one project with its full history, once
  the SDK and the bridges take it (ADR 0221, Phases 2 to 4). Until then nobody clones it, and no
  screen shows it until Phase 5.
- The room's files (ADR 0099 and 0100) stay as they are: files posted in chat are attachments, and
  their versions stay until every bridge and Jacobian use the project (the plan's call 4).
- A release bundles its own Node and not git. On a Mac without git, Apple's one-click install of the
  Command Line Tools gives one; the plan's call 2 keeps shipping git as the fallback.
- The conformance fake serves a project the same way, with git's own refusals and the same record,
  so bridges are tested against it. It leaves out the hook's check: the SDK's is what a bridge is
  tested on.
- `project.changed` is in the log for good, but erasing the room takes it with the room's other
  events.

## Addendum, 25 October 2026: a guest reads the project and changes nothing

The second security review's SEC-40 found that "a person in the room" let a guest push. Arjun's
decision: "Members and their agents keep pushing; Run says who changed files when it wasn't me or
my own agents."

- **A guest is let in to read.** A person whose workspace role or room role is guest clones,
  fetches, views files and downloads the zip, and is refused a push at git's first ask
  (`GET info/refs?service=git-receive-pack`) and at `git-receive-pack` itself, in words git shows:
  "A guest can read the project but can't change it. Ask an agent in the room." Undo reads both
  roles too. A guest's project token is still made, for reading.
- **Members and their own agents keep pushing**, as above.
- Your folder on the Mac shows a guest that sentence in place of Send.
