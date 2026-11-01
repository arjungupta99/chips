# 0160. A person can be removed, and what they said keeps their name

Date: 14 October 2026
Status: Accepted. Answers ADR 0034's open question on removing a person; follows ADR 0078's shape
for a harness. The plan is `docs/proposals/join-and-remove-plan.md`. Deleting your own account,
refused here, is ADR 0243.

## Context

A person could be let in by an invite (ADR 0034), made a guest, and have their devices withdrawn,
and never leave the workspace. Arjun wants other people to join his space and be removed again,
with the joining "highly polished and functional". Withdrawing devices did not keep anybody out:

- A passkey sign-in paired a new device whatever had happened to the old ones (`passkeys.ts`
  checked only that the passkey's row existed).
- A pairing code minted before the withdrawal still paired after it (JR-8).
- A person withdrawn this way was told "This server does not know this browser. Pair it again.",
  which could not work (JR-10).
- A socket kept the role its ticket was minted with, so an admin made a member kept an admin's say
  for as long as the socket stayed open (JR-9).

A person cannot simply be deleted, for the reason ADR 0078 gives for a harness: what they said is
the workspace's history, and a participant row taken away would leave every line of it unnamed.

## Decision

1. **`DELETE /v1/people/:id` removes a person.** It is for a workspace owner or admin. It is
   refused for an admin removing an owner, by the rank that keeps an admin from changing an
   owner's role (Gate 5). It is refused for yourself: leaving a workspace is not built, and an
   owner who wants out hands it on first. A harness or an agent has its own route, and is not
   found here. In order:
   - the registry marks them removed (`participants.removed_at`, the column ADR 0078 added; no
     migration);
   - every way back in is closed: their sockets now, every device with its push token, every
     passkey, every pairing code held for them, and every open invite they made;
   - the harnesses they own are handed to whoever removed them, each by `harness.transferred`, so
     approvals and tokens keep a living owner;
   - every room they are in has its own `membership.removed`, with `reason: "person_removed"` and
     `removed_by`, so the people still there see it as any removal is seen;
   - `person.removed` goes in the log: who, what they were called then, who removed them, the
     rooms and the harnesses. Only Chips writes it, and everyone in the workspace is sent it.
2. **The door keeps them out, whatever outlived the removal.**
   - The authenticator refuses a device of a removed person as `person_removed`.
   - A pairing code pairs no device for them: the registry finds no such person.
   - A passkey signs nobody in for them.
   - The projection deletes their `workspace_members` row, so no role rule finds them and no list
     of the workspace's people has them.
3. **They are told, and only they.** The refusal is said only to a request their own key signed,
   after the signature is checked. The answer is `401` with `refusal: "person_removed"`, so it
   tells nobody else whether a key ever existed. Their sockets close with 4003 `person_removed`,
   beside 4001 `device_revoked`. The clients go to a terminal `removed` state from either:
   - web and Mac: "You're no longer in Demo" in place of the app. OK forgets this browser's key
     and goes on to the next workspace paired there, or to pairing. It never says "pair again".
   - phone: the same words in place of the Spaces list, and in the connection sheet. OK forgets
     the workspace on that phone.
4. **What stays.** Their words stay, under their name, in every room. `GET /v1/participants` still
   lists them with `removed_at`, as it does a removed harness. The People list, the Add page and
   every picker leave them out.
5. **Their name is free, and the way back is a new invite.** Joining takes no name somebody here
   has (JR-1), and a removed person has none any more. A new invite makes a **new person**, who
   may take the same name and sees none of what came before.
6. **Removing them again is not an error.** A second `DELETE` answers with the first removal's time
   and `already_removed: true`. It records nothing, and it still closes anything somehow live.
7. **Asked first, in core's words.** You → People has **Remove…** on each row the reader may
   remove. The dialog says:
   - "Remove Priya Nair from Demo?";
   - signed out on every device now and taken out of every space;
   - which harnesses become yours, and what stays;
   - "To come back, Priya Nair needs a new invite.";
   - **Keep** or **Remove**.

   The rule and the words are core's (`mayRemovePerson`, `removePersonAsking`), so the dialog
   offers what the door allows. The phone has no People list (You.tsx's own rule), so removing
   somebody, as inviting them, stays on the computer.
8. **A socket answers to the role as it is now (JR-9).** Each event a person sends over a socket
   goes to the door with their role read again, one lookup, rather than the role their ticket was
   minted with.

## Consequences

- **There is no way back but a new invite.** A removed person is not restored. Restoring would
  bring back a seat its owner meant to end, and nobody has asked for it. *(Since asked for: his
  call of 14 October, `docs/proposals/people-first-class-review.md` §6, with leaving the
  workspace yourself and a removed screen that names who removed you.)*
- **Rooms with nobody left in them stay.** A room only the removed person was in keeps its agents
  and its words, and nobody can reach it. An owner who wants it gone has no list to find it from
  yet. The same is true of a room a person left before this.
- **An approval routed to them waits.** Approvals already sent to a removed person are not handed
  on. Policy names approvers among the people in the room, so new asks never name them.
  *(Changed 14 October, see the addendum: one only they could answer is handed on.)*
- **The removed person hears no more.** Their sockets close before the rooms' lines are written,
  so their screen says "removed" rather than watching rooms vanish one by one.
- **The phone cannot remove anybody.** As with inviting, that waits on a People list on the phone.
- Going live needs 4431 restarted (no migration), the desktop bundle rebuilt, and the phone
  rebuilt. An older app shown the refusal says "pair again". The server still refuses the person
  everywhere, so nothing it offers works.

## Addendum, an approval only they could answer (14 October 2026)

An approval routed to a removed person waited for somebody who could not come back, and the
person who removed them was never shown it: an owner or admin may hand any approval on, but only
from a card they are not drawn. Removing a person now hands each pending approval whose approvers
were them alone to whoever removed them, as an `approval.routed` written through the door with the
remover's credential, `reason` "<name> was removed from the workspace." So the card, the push and
the audit are a hand-on's, as if the remover had done it. An approval somebody else may also
answer is left to them. `DELETE /v1/people/:id` answers with `approvals`, the ones handed on. Read
by `approvalsAwaiting` (pending, naming the person); a retry hands nothing twice (the idempotency
key is the person and the approval).
