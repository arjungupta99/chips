# 0222. A change to the room's project goes with the reply that made it

Date: 23 October 2026
Status: Accepted, 23 October 2026: Arjun's pick of the mock's way C ("Go with C"), then "proceed
with the full implementation of all remaining phases sequentially and fine to push as well". The
plan is [agents-share-a-project-plan.md](../proposals/agents-share-a-project-plan.md), Phase 5,
"What people see". The project is [ADR 0220](0220-a-rooms-project-is-a-git-repository-chips-holds.md),
the agents' copies [ADR 0221](0221-an-agent-works-on-the-rooms-project-in-a-copy-of-its-own-and-its-bridge-does-the-git.md).

## Context

Since Phase 3 every agent's turn can change the room's project, and Chips records each push
(`project.changed`), but no screen shows it. His words on the mock: "I want to make sure we are not
making things look over complex. At the same time they should be accessible from space detail
page". Of the mock's three ways (a line per change, a card per change, the change with its reply)
he picked the third.

## Decision

1. **A reply carries its change.** A harness's `message.post` may say `change: <commit>`, the
   commit its push left `main` at. chipsd keeps it on the line only when that commit is on the
   room's `main` and is the agent's own (signed `<agent id>@agents.chips.invalid`, asked of git,
   since a push is recorded before git's answer ends); otherwise the message is kept and the change
   left off, and the server logs why. The bridges send it: the SDK's `post` takes `change`, and
   each bridge passes the commit `push` answered with. Jacobian does the same.

2. **The room shows it once, under the reply.** "2 files changed" in small grey words under a reply
   that changed files; none under a reply that changed nothing. On the phone it opens the change in
   the reply's sheet, and What the run did has a row that turns to it too (as built: one tap from
   the words to the diff); on the web and the Mac, "· 2 files changed" ends the receipt line already under the reply,
   and opens the change. What the run did gains the change: the count ends its summary, and under
   it come the files, each with its lines added and removed, and See the change.

3. **A change** shows its files and each one's diff (`GET /v1/spaces/:id/project/changes/:commit`),
   with Undo.

4. **Undo** reverts that one change as a new commit by the person, made on the server (`POST
   /v1/spaces/:id/project/undo {commit}`), in the room's turn for pushes (ADR 0220, point 6). It is
   git's three-way merge of the change taken back onto `main`, with no working tree
   (`git merge-tree --write-tree --merge-base`, git 2.40 or newer). Every later change stays, and the
   agents' next turns are told, as of any change. When a later change builds on the same lines,
   Undo is refused in words naming the files: it is undone by asking the agents. Its
   `project.changed` says `undoes: <commit>`; the reply's line then reads "2 files changed ·
   Undone", and the room gets one line, "Arjun undid Wren's change", with Put it back, which is the
   Undo of the Undo.

5. **A push no reply carries** gets one quiet line: "Wren changed 2 files". A person's push shows
   it at once; an agent's once its run in the room has ended without a reply naming the change, so
   a reply that follows its push a moment later shows no line first.

6. **The room sheet's Project tile**, "6 files" (`project.changed` says how many files `main` has,
   `file_count`), opens the Project page with two tabs: **Files**, the tree at `main`
   (`GET /v1/spaces/:id/project/files`), each file opening as a file does today, with its history;
   and **Changes**, every change newest first, from the room's `project.changed`: who, the files,
   the time, the lines, an undone change saying so and each Undo a row of its own. No tile before
   the room's first change.

7. **Who may.** The reads and Undo are a person's in the room, signed by their device, as the room's
   files are. A guest reads what the room shows them and may not Undo.

## Consequences

- People see each change where they read the reply, and nowhere else unless they open the project.
- A change an agent sent with no words, or a person's push from a clone (Phase 7), is still seen.
- Undo needs git 2.40 on the server; with an older git it is refused in words, and everything else
  works.
- `change` and `file_count` are additive, so older clients and bridges go on as they were.

## Addendum, 23 October 2026: a reply whose change didn't go says so (AP-6)

On Arjun's "Fix ap6". In Phase 8's runs a reply said its change was in the project when the push
had been held by a clash or had failed (Run B's "my section is in `guide.md`", Run E's "I've set
LIMIT to 25" while the project said 40). The reply rightly carried no `change`, and only the
bridge's log said why, so a person reading the room believed the words.

Now a bridge whose push didn't send adds a line in brackets after the reply's words, as a file that
didn't attach already has: the SDK's `heldNote`, Jacobian's own copy of it.

- A clash: "(Not in the room's project yet: src/config.js clashed with Birch's change. Ash is
  asked to settle it next turn.)"
- A key: "(Not in the room's project: config.js looks like it holds an Anthropic key, so nothing
  was sent.)"
- Turned back or not sent: "(Not in the room's project: it couldn't be sent: others kept sending
  first.)"

Words, not a field: every client draws them today, the other agents in the room read them in its
history, and the change mark stays what it was, the change that did go. Nothing is added when the
change went, or when the turn changed nothing.
