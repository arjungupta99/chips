# 0224. Your folder is a copy of the room's project on your Mac, and a zip everywhere else

Date: 23 October 2026
Status: Accepted, 23 October 2026: Arjun's option C, "kept current", from the brainstorm on
opening the project from the room's details, and his word on the mock: "Build Your folder as
mocked, with folders in ~/Chips/Projects/<room name>: Open folder, kept up to date, Send my
changes, the clash state, and Download as zip on phone and web." The project is
[ADR 0220](0220-a-rooms-project-is-a-git-repository-chips-holds.md), an agent's copy and its
clash marks [ADR 0221](0221-an-agent-works-on-the-rooms-project-in-a-copy-of-its-own-and-its-bridge-does-the-git.md),
how a person reads it and how their change shows [ADR 0222](0222-a-change-goes-with-the-reply-that-made-it.md),
and the `chips` the Mac app carries [ADR 0173](0173-chips-for-mac-carries-chips-and-runs-it-here.md).

## Context

The room's details have Project, with Files and Changes, but no way to open the files in Finder
or an editor. `chips project clone` makes a git clone a person can push from, and needs a terminal,
a paired CLI and git. The agents already have the hard part, in the SDK: a copy, its changes
replayed onto others', and both sides marked where they overlap.

## Decision

1. **Your folder, on the Mac.** The Project page's Files tab starts with a card, **Your folder**,
   on the Mac app when it carries `chips`. **Open folder** makes a copy of the project at
   `~/Chips/Projects/<room name>` and opens it in Finder; after that it opens it again. The name
   is the room's when the folder was made, with `/` and `:` as `-`, no leading dot, and ` 2`, ` 3`
   after it when another room's folder has it. Chips finds a room's folder by the room's id in the
   folder's git remote, so renaming the room or the folder loses nothing.

2. **Kept up to date while it is untouched.** When the room's project changes, and when the card
   opens, Chips brings the folder up to `main`, but only while the person has changed nothing in
   it: no file changed or added, nothing waiting to be sent, no clash. Then the card says **Up to
   date**, and the last change that came in ("Wynn's change to src/board.js came in 2 min ago.").
   Once they have changed something, nothing in the folder changes: the card says what others
   changed since, and that it comes in when they send theirs.

3. **Send my changes.** The card lists the files they changed, with lines added and taken out, and
   **What you changed**, words for the change, optional. Send commits everything in the folder
   under their name, with those words or "A change to the project", and sends it, as an agent's
   copy sends: replayed on top of what others sent first, then the folder is at the room's `main`.
   The room shows it as ADR 0222 shows a person's push: "Arjun changed 2 files".

4. **The clash.** Where their change and one that reached the room first touch the same lines,
   nothing is sent. Both sides are in the file, marked `<<<<<<< yours` and `>>>>>>> Hazel`; the
   card shows the first marked lines, **Open style.css**, and Send held until the marks are out.
   Settled, Send sends the change and the settling together. A file that looks like it holds a key
   holds the send too, as it does an agent's, and the card says which file.

5. **Open in editor.** The first of Cursor, Visual Studio Code, Zed, Sublime Text, Nova and BBEdit
   that the Mac has, in `/Applications` or `~/Applications`; the button isn't there when it has
   none. A clashed file opens in it too, or in the Mac's text editor.

6. **The Mac app's `chips` does the git, with a token it is handed.** The page asks the server for
   a project token, signed by its device as ever, and the shell runs its carried `chips project
   folder <status|open|update|send|editor|file> --json` with the token, the server's address, the
   room and the person's id and name in its environment, nothing of them among its words, and
   reads back one line of JSON. The shell takes only those six words, a room's id, a token Chips
   made and an address, so the page cannot have it run anything else. The CLI does the git with
   the SDK's `Project`, in its new person mode: the token as a bearer, no `chips-actor`, the
   commits `<person id>@people.chips.invalid`, and the copy the folder itself. No token is written
   into the folder, so `git push` in a terminal there is turned away; `chips project clone` is the
   way to a clone a terminal pushes from.

7. **Download as zip, on the phone and in a browser.** The same card has **Download as zip**: "All
   5 files as they are now, to save to Files or send to your Mac." It is
   `GET /v1/spaces/:id/project/archive`, the files at `main` (or at `?at=`) as `git archive` makes
   a zip, signed by a person in the room, refused past the server's file size limit. The phone
   hands `Sudoku mini.zip` to the share sheet; a browser downloads it.

## Consequences

- git runs on the person's Mac, as it does for an agent's bridge (ADR 0220's note: Apple's
  one-click install of the command line tools has it). Without it the card says so.
- The folder's git reaches the server at the device's own address. A Mac that reaches its server
  only through the relay can't, and the card says it couldn't reach the project.
- A person editing on their phone and on their Mac at once is two people to the project, which is
  right: each has their own copy.
- Nothing is uploaded by watching the folder: a person's change reaches the room only when they
  send it, as they asked.
