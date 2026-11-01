# 0194. An owner renames the workspace from You, and a new one is named after its person

Date: 18 October 2026
Status: Accepted, 18 October 2026, on Arjun's "Build B, with A's friendly default name at first
run."

## Context

A workspace was named once and never again. `chips serve` called every new one "My workspace"
(`cli/src/commands/serve.ts`), and only a database edit changed it: that is how Arjun's went from
Demo to Primal on 18 October (ADR 0193). ADR 0193 made every device take the name from each
server hello, so an edit reached a device at its next connection, but there was still no route,
no event and no screen to make the edit.

Arjun asked what workspace name other people see when they install Chips. He was shown a running
mock of two ways (https://claude.ai/artifact/BdQ8PDCceY7UZTbr8uBTJ5): A, ask for the name once
on the first-run welcome, with a friendly default; and B, owners rename it from You, with every
device told at once. He picked B, with A's default.

## Decision

1. **A new workspace is named after the person it is made for**: "Arjun's workspace", from the
   same name the first person is given (ADR 0170). "My workspace" only when there is no name to
   take (the first person is "You"), or when the result would be longer than the 120 characters a
   hello carries. The welcome asks nothing more: the name is changed later, on You.
2. **`POST /v1/workspace/name`, `{ name }`, an owner's alone.** An admin, a member, a guest and a
   harness are refused (`403`), as only an owner invites (ADR 0034's addendum). The name is
   cleaned as a person's is (trimmed, its spaces collapsed, one to 120 characters). The
   `workspaces` row is written first, as a person's registry row is (ADR 0082), so every reader of
   the name (the hello, pairing, invites, passkeys) has the new one; the same name again records
   nothing.
3. **`workspace.renamed`** is the change's line in the log: `{ name, previous_name }`, written by
   Chips with the owner as its actor. It has no space, so every socket is sent it, a harness's as
   well as a person's, as every hello says the name. No projection: the name is the registry's,
   and a rebuild leaves the registry alone. The audit says "renamed the workspace from My
   workspace to Primal".
4. **Core takes the name from the event as it takes it from the hello.** One place sets the
   snapshot's `workspaceName` and keeps it with the device (`rememberWorkspaceName`): the hello, a
   `workspace.renamed` the socket brings, and the server's answer to a rename made on this device.
   One folded from the cache does not: the hello has already said what the workspace is called
   now. `store.renameWorkspace(name)` makes the call.
5. **On the web and the Mac, the workspace's heading on You is its name, and an owner's field**,
   edited where it stands as Your name is (ADR 0082): Enter or leaving it saves, Escape puts it
   back, and a refusal stays with its reason under it. The heading was "Primal workspace" in small
   capitals; it is the name alone, in the display face, so the field and the heading are one
   thing. The field is the same component as Your name (`NameField`).
6. **On the phone, an owner's workspace group starts with a Name row**, which opens a sheet with
   one field and Save. An admin, who sees the group, has no Name row: the name is in its heading.

## Consequences

- Renaming no longer needs the database. ADR 0193's fourth decision, that the rename was a
  database edit made once, is superseded.
- Every device that is connected changes its name in the same second; one that is not finds the
  new name in its next hello, as ADR 0193 has it.
- A server older than this one has no route. A phone that asks it says the server is older than
  the app, rather than "No route matches that."; the web says the server's words.
- An existing workspace keeps its name. Only a workspace made from now on is named after its
  person.
