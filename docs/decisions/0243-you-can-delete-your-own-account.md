# 0243. You can delete your own account

Date: 29 October 2026
Status: Accepted. Arjun's B, from the mock of 29 October. Builds on ADR 0160, which made removing a
person and refused it for yourself.

## Context

App Review refuses an app that makes accounts and can't delete them from inside the app
(guideline 5.1.1(v)). Joining a workspace from the iPhone makes a person on that server, and until
now the phone could only sign out: the person stayed on the server, with their face, their devices
listed and their invites live. ADR 0160 removed a person but refused it for yourself, because
leaving the workspace was not built.

Three ways were mocked: A, the system's own question, like Sign out's; B, a sheet that says what
goes and what stays, with Delete woken by typing the workspace's name; and C, B with the name
forgotten too, so what they said reads "Someone who left". Arjun chose B.

## Decision

1. **`DELETE /v1/people/me` deletes the caller's own account.** It is any person's, of
   themselves, guest included, and never a harness's. It is ADR 0160's removal with three
   differences:
   - **They act, and an owner inherits.** The harnesses they own and the approvals only they could
     answer go to an owner who stays: the first other owner the workspace lists. Each
     `harness.transferred` says "Its owner deleted their account.", and each `approval.routed`
     "<name> deleted their account."
   - **Their face goes**, by a `person.face_set` to none, so what they said shows their initials.
   - **Each room says they left**: `membership.removed` with `reason: "person_left"` and no
     `removed_by`, written by them, and "Priya left the workspace" in the room. `person.removed`
     has `removed_by` set to themselves, and the audit reads "deleted their account".

   Everything else is the same: every way back in closed (sockets, devices and their push,
   passkeys, codes, invites they made), the door refusing them as `person_removed`, their name
   free, their words staying under their name, and a new invite the only way back.
2. **The only owner is refused**, `403` with `refusal: "only_owner"`. A workspace with no owner
   would have nobody to run it, and an owner's workspace is on their own computer, made there by
   `chips up`. The refusal and the app say how it is deleted there (`chips uninstall
   --remove-data`), and that making someone else an owner first lets them leave it running. With
   another owner, an owner deletes their account as anybody does.
3. **The sheet says what goes and what stays, in core's words** (`deleteAccountSheet`):
   - Goes: their devices and sign-ins, and push to them, counted once the server has said; their
     face; an owner's invites.
   - Stays: what they said, in its spaces, under their name; the harnesses they connected, and
     which owner they go to (named when there is one other owner, else "an owner").
   - A field, "Type My Spaces to delete": Delete wakes on the workspace's name, case and spaces
     aside (`deleteAccountTyped`). **Keep it** puts it away.
   The phone has it as a red row under Sign out at the foot of You, and a sheet. The web and the
   Mac have a "Your account" card after the person's own cards, and a dialog. The only owner is
   told how instead, in an alert or a dialog with OK. The demo's made-up workspace has no row.
4. **Leaving is said as leaving, where it was done.** The server shuts the device's socket as it
   removes the person, and that close can come before the answer. The store knows it asked: its
   snapshot carries `deletedAccount` with `connection: "removed"`, and nothing the socket says after
   changes it. The web and the Mac say "You've left Home / Your account there is deleted." in place
   of everything, until OK forgets the workspace there. The phone forgets it at once, as a sign-out
   does, and says "You've left My Spaces" in an alert.
5. **Elsewhere the words are true of both.** Another device of theirs hears the same refusal as a
   removal, so its words no longer say who did it: "You're no longer in this workspace", and "Your
   account there was removed, or you deleted it." The server's refusal says "You are no longer in
   this workspace."

## Consequences

- App Review's guideline 5.1.1(v) is met. The review notes' paragraph on deleting the account
  (`docs/app-store-review.md`) describes what the build does, and the demo workspace a reviewer
  joins has to run a server with this route.
- What they said keeps their name, as after a removal (ADR 0160). C, forgetting the name, was not
  chosen: it would rewrite the log's records of that person and change ADR 0160's rule.
- The heir is the first other owner. A workspace with several owners has no say in which one;
  any of them may hand a harness on afterwards.
- An older app doesn't know `person_left`. It reads the room's line as anybody leaving a room by
  their own hand, and says "Priya left", which is true.
- Going live needs 4431 restarted (no migration), the desktop bundle rebuilt, and the phone rebuilt.
