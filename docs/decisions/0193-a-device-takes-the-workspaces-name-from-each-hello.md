# 0193. A device takes the workspace's name from each hello

Date: 18 October 2026
Status: Accepted, 18 October 2026, on Arjun's "Do the smallest version: rename my workspace on
4431 and make paired devices pick the new name up when they connect."
Superseded in part by [0194](0194-an-owner-renames-the-workspace-from-you.md), 18 October 2026: an
owner renames the workspace from You, and every device connected is told at once (decision 4).

## Context

Arjun asked why his workspace is called "Demo", and whether it can be renamed.

It is "Demo" because 4431 was first started in dev mode on 5 September, and the dev bootstrap
(`server/src/infrastructure/demo/bootstrap.ts`) names the workspace it makes "Demo". A real
install names its own at first run (`cli/src/first-run.ts`).

Nothing renames a workspace. A database edit alone would not have reached him either: a device
is told the workspace's name once, in the answer to its pairing (or its invite, or its passkey),
keeps it in its stored record, and never asks again. His iPhone, the Mac app and the web would
have gone on saying "Demo" until each was paired again.

Two ways were offered: rename it once and let devices pick the name up as they connect, or a
rename for owners on You with every device told at once. He picked the first.

## Decision

1. **The server's `hello` says what the workspace is called now:** `workspace: { name }`, absent
   when the workspace has no name, or one longer than the wire carries (120 characters, the same
   as an invite's). Every connection gets it, a harness's as well as a person's.
2. **Core takes it at each hello.** The snapshot's `workspaceName` is the hello's word, absent
   until a hello has said. When it differs from the name the device was paired under, the device's
   stored record is changed to it (`rememberWorkspaceName`, beside `rememberRelay`), so the next
   launch is called by it before the socket opens, and so is the list of workspaces a device
   holds.
3. **The screens that show the name read it from the snapshot first:** You and a person's page on
   the phone; on the web and the Mac, You, the narrow bar, the welcome and a room's acts, through
   one `calledNow` in `Shell`, and the workspace picker's name for the one in front (`App`), whose
   list is otherwise read from storage at launch. Everywhere else (pairing, joining, the room
   sheet) reads the stored record, which is right from the next launch.
4. **The rename itself is a database edit, made once, for him.** There is still no route, no
   event and no row on You to rename a workspace.

## Consequences

- An older client drops the new field without a word, as Zod does for anything it does not
  know; an older server sends none, and a device keeps the name it has.
- A rename reaches a device at its next connection, not the moment it is made: a socket that is
  already open is not told. Restarting the server reconnects every device.
- Renaming from You, for owners, with every device told at once, would need a route, a
  `workspace.renamed` event in the log and a row on phone and desktop. It is not part of this.
