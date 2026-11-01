# 0231. Run and Open happen only on the Mac where the server runs, for an owner

Date: 25 October 2026
Status: Accepted, 25 October 2026. Arjun, on the second security review's SEC-39: "I want to make
the whole universe-->desktop allow runs and opens on mac on the same server", "and also only allow
owners", then "The universe Run / open function should only run on the mac where the server is
running this will be the rule", and "Start Phase 1 of the security plan". It narrows
[ADR 0225](0225-open-folder-on-the-phone-opens-it-on-your-mac.md),
[ADR 0226](0226-run-on-the-rooms-details-runs-the-project-on-your-mac.md) and
[ADR 0227](0227-universe-opens-what-a-space-made-on-the-phone-and-the-mac.md).

## Context

Open folder (ADR 0225), Run (ADR 0226) and Universe's Desktop tab (ADR 0227) let a person press on
their phone or in a browser and have their Chips for Mac act: open the room's folder in Finder,
open the room's page in its window, or check out the room's project and run its run file in a
login shell. The server carries the ask to the person's own Macs as a `folder.open` or `folder.run`
frame, and the Mac does it without asking again, since the person pressed on another device.

The review found that the Mac believes whichever server it is signed into (SEC-39). A
`folder.run` frame from any server makes Chips for Mac fetch that server's project and run what its
run file says. The one check, that the run file's command is the command the person was shown,
compares two strings the same server supplies. So the server behind any workspace a person opens
in Chips for Mac — somebody who invited them, or whoever takes over that server — can run a
program on their Mac without a click. An unpaired Mac app also pairs at once from any
`chips://pair` link, so a web page can put a Mac in that position with one prompt.

A rule the server keeps cannot help here, since the attacker is the server. The Mac has to know
for itself which server it may act for.

## Decision

1. **Run and Open happen only on the Mac where the workspace's server runs.** Chips for Mac acts
   for a workspace only when its server is the one running on this Mac. It tells by key, not by
   address: the key the device was pinned to at pairing (ADR 0191) must equal the key the server
   on this Mac's loopback answers in `GET /v1/health`. A server elsewhere cannot answer with that
   key without the private key this Mac's server holds.
   - The shell finds that server itself: the port its login service names, else 4431, read over
     `127.0.0.1` (`server_here`).
   - Asks from another device — open the folder, open the page, run, stop — are dropped for any
     other workspace.
   - The Mac's own Universe offers Run and Open in browser only for this Mac's workspace.
   - Run and Open in browser fetch the project from this Mac's server over loopback, never from an
     address the page hands in: the native side refuses either with any other server address. A
     token another server minted is no good there, so even a page that got this wrong could run
     nothing of another server's.
2. **Run and Open are an owner's.** The server refuses `POST …/project/folder/open` and
   `POST …/project/run` from anybody but an owner of the workspace, as it already opens Chips for
   Mac only for an owner's ask. The phone hides Universe's Desktop tab, and the web and the Mac hide
   Run and Open on the Mac, for everybody else. A program's own words on the phone say it runs on
   the owner's Mac.
3. **What stays for everybody.** Your folder (ADR 0224) — the Mac's own copy of a room's project,
   Send, Open folder pressed on that Mac, opening a file in an editor — and Download as zip run
   nothing and are outside the rule. A member who uses Chips for Mac with somebody else's workspace
   keeps them.
4. **The shell's commands are the main window's.** The app's own commands are listed in an app
   manifest and allowed in one capability that names the main window. A page in a frame was
   already kept from them by Tauri's invoke key, which goes to the main frame only; the capability
   keeps any other window, should one ever be made, from them too.

## Options

- **Ask on the Mac every time** a run or open comes from elsewhere, with Run and Not now. Keeps
  every Mac able to act, but puts a press on the Mac in front of every press on the phone, which is
  the feature's point.
- **Ask once per workspace on the Mac** ("Let Japan trip run projects on this Mac?"). Keeps a
  second Mac and a member's Mac, at the cost of a new consent to keep and explain. Arjun chose the
  narrower rule.
- **Trust the server and fix it there.** No good: the attacker is the server.

## Consequences

- An owner's phone, a browser and the Mac itself can Run and Open for a workspace whose server is
  on that Mac. That is Arjun's setup: the server and Chips for Mac on the Mac mini.
- An owner's second Mac, a second owner on their own Mac, admins and members lose Run and Open.
  They can still clone with `chips project clone` and run a project themselves.
- Another server on the same Mac — the demo on 4460, a test server on another port — is not this
  Mac's server, since the login service names one port.
- A Mac signed into the owner's server from another machine still says `folders` in its hello, so
  the phone's "Sent to your Mac" counts it although it will not act. Only an owner with a second Mac
  meets this; the words can follow later if it matters.
- SEC-40's half is separate: an owner pressing Run on code somebody else pushed is answered by
  refusing a guest's push and by Run saying who changed the files.

## Addendum, 25 October 2026: a link in the project is followed before anything opens

The second security review's SEC-55: opening a file in an editor and Open in browser checked the
file's path by its words, which don't follow links. A link the agents committed, `notes.html` to
`~/.ssh/id_rsa`, opened the person's key in their editor or browser when they pressed on it.

- **Both follow links first.** A file whose link leads out of the folder isn't opened: "That file
  isn't in your folder.", as for one that isn't there. A link to another file of the folder opens
  as before.
- **Open in browser opens no program,** as Run's `opens` doesn't (ADR 0226's last addendum): a page
  that is a link to `play.command` says "That file would run as a program, so Chips didn't open
  it." An editor opens a program's file as words, so opening one there stays.
