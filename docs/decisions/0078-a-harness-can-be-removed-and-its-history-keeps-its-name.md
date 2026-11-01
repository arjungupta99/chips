# 0078. A harness can be removed, and its history keeps its name

Date: 27 September 2026
Status: Accepted. Extends 0023 and its M5.2 addendum; amends 0069 for a removed harness's home.

## Context

A harness could lose its tokens (ADR 0023) and change hands (`harness.transferred`), and never
leave the workspace. Arjun wants to connect OpenClaw to test Chips with a second real harness and
take it away afterwards, leaving nothing listed on his server (`docs/proposals/openclaw-test-plan.md`,
decision 4b, Phase 5a). Withdrawing its tokens stops it speaking, but it stays on the Harnesses tab,
in the + and in add-a-member for good, and any home it named stays a room nobody can archive or
delete.

A harness cannot simply be deleted. What it said is the workspace's history: its messages, its
runs, its receipts and its lanes name it, the log is the record of all of them (ADR 0004), and a
participant row taken away would leave every one of those lines unnamed.

## Decision

1. **`DELETE /v1/harnesses/:id` removes a harness.** It is for the harness's owner, or a workspace
   owner or admin: the people who hold its tokens and may hand it on. In order:
   - the registry marks it removed (`participants.removed_at`, migration 0029);
   - every live token is withdrawn with the revoke its card uses, so the sockets it holds close now;
   - `harness.removed` goes in the log.
2. **The registry is the truth, and the log says so.** As with a handing-on, the row is what the
   door reads and `harness.removed` is the line for the audit and the screens. The event carries
   what the harness was called then (`display_name`), so the audit needs no lookup. Only Chips
   writes it; the door refuses it from anybody.
3. **A removed harness is kept out everywhere a harness gets in.** The door refuses to:
   - give it a token;
   - add it to a room (`membership.added`, rule 8);
   - ask it for one from the + (`asked_of`, rule 15);
   - route a lane to it;
   - resolve a mention to it.

   Authentication refuses a token of its that somehow outlived the removal.
4. **Its homes stop being homes.** A home is the room a harness's lead speaks in (ADR 0069), and
   nobody's lead speaks there any more. `harness.removed` names those rooms (`homes`), and the
   server's projection and every client clear `home` from the event. So a rebuild agrees with the
   live server, and a person may archive the room, or delete it if it is one a harness opened
   under a key.
5. **Its name stays.** `GET /v1/participants` still lists it, with `removed_at`, and its
   memberships stay. So every room it was in reads as it did. The clients mark it removed and
   leave it out of the lists a person picks from: Harnesses, the +, add-a-member and `/add`.
   Mentions are the server's (point 3). A profile opened on it says it was removed.
6. **Removing it again is not an error.** A second `DELETE` answers with the first removal's time
   and `already_removed: true`. It records nothing, and it still withdraws any token that is
   somehow live. That lets `chips remove` clean a harness off a machine after it was removed from
   an app.
7. **Every surface can do it, asked first.**
   - The desktop has *Remove harness…* on the harness's card.
   - The phone has it on the profile, on the sheet Delete uses.
   - The CLI has `chips remove <harness>`, which asks first too, calls the route, and then
     forgets the keychain secret and the record, as `disconnect` does.

   The rule and the words are core's (`mayRemoveHarness`, `removeAsking`), so both apps offer the
   same thing to the same people.

## Consequences

- **There is no way back.** A removed harness is not restored. To use it again, connect it as a
  new harness, with a new id and none of the old one's history. Restoring would mean new tokens
  for a harness whose adapter has likely been uninstalled; nobody has asked for it.
- **The removed harness hears nothing about it.** Its sockets close before the event is written,
  and it could not act on the news anyway. Its own records, and anything it kept of its rooms, are its
  to clean up: for OpenClaw that is the test plan's uninstall script.
- **Its rooms are left as they were.** No `membership.removed` is written for them, so no room
  gets a line saying it left. Someone who wants a room gone deletes it, now that it is no longer a
  home.
- A removed harness's spend stays on its account and in the rooms' costs, as history.
- Going live needs 4431 on migration 0029 (a restart runs it), the desktop bundle rebuilt, and the
  phone rebuilt. An app older than this build lists a removed harness until it is updated. The
  server still refuses it everywhere, so nothing it offers works.
