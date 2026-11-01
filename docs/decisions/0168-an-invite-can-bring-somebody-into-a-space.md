# 0168. An invite can bring somebody into a space

Date: 15 October 2026
Status: Accepted. Builds on ADR 0034 (joining by invite), ADR 0164 (an invite opens in the apps)
and ADR 0151 (the room sheet). This is Phase 3 of `docs/proposals/people-first-class-review.md`
(G5), on his "A for both, go ahead and build" after the mock
(<https://claude.ai/artifact/TSf4BocHqMepjKDTkkZAbP>).

## Context

An invite brought somebody into the workspace and nowhere else. A guest landed on an empty
welcome until somebody added them to a room, and the room never said how they came. The usual
reason to invite somebody is one room: a client for one job, a friend for one plan.

## Decision

1. **An owner makes a room's link from the room.** On the room sheet's Add page, **Invite someone
   new** is the last row under People. It is shown on the phone, the Mac and the web, and only to
   a workspace owner, since only an owner invites (ADR 0034's addendum). Its form is You's
   Invite someone, with two differences:
   - The role is **Guest** (first) or **Member** (his "A" to Q1). A guest is in that room only; a
     member starts in it and can be added to others.
   - The words are about the room: "Whoever opens it names themselves, joins Demo, and lands in
     Bakery."

   The server refuses (`422`) any role but those two, a direct room or a thread, an archived room,
   and a room the maker is not in.
2. **The link remembers its room.** Migration 0047 adds `invites.space_id`.
   - `POST /v1/invites` takes `space_id`.
   - The list, peek and redeem answer it, and peek adds `space_name`.
   - Core's `InvitePeek`, `Invite` and `IssuedInvite` carry it.
3. **Joining by it puts them in the room, as its maker.** After the person is made, Chips appends
   a `membership.added`:
   - its actor is the link's maker;
   - its role is guest or member, and a workspace guest is a guest, as the door marks one;
   - its idempotency key is the link's and the person's;
   - its `invite_id` names the link. `invite_id` is a `chipsWrites` field: the door strips it from
     anything a client sends, so only a link can say it.
4. **The card names the room, and the joiner lands in it.**
   - The card says "Arjun invited you to Bakery in Demo as a guest." under **Join Bakery**, with
     what a guest of Bakery may do.
   - Joined, the room opens. The phone keeps it in `landing.ts` and Spaces opens it once the
     snapshot has it, since joining rebuilds every screen. The web and the Mac keep it above the
     shell (`App`), which awaits it as it awaits a room the + asked for (ADR 0149).
5. **Somebody already in the workspace is asked, then let in (his "A" to Q2).**
   `POST /v1/invites/enter`, signed by their device, puts them in the room as the maker would, and
   leaves the link unused for whoever it was made for. What they see is core's
   `spaceLinkAsking`, the same on the phone, the Mac and the web:
   - "Join Bakery?", then they are added and the room opens;
   - "You're already in Bakery", and **Open Bakery**;
   - "A guest is in one space", for a guest already in another room (the server says `403`
     too).

   On a phone the join route goes to the room itself. If the room is under the sheet it goes back
   to it, so a link to the room on screen never stacks it twice. The simulator walk found that
   stacking.
6. **The room says how they came.** Core's fold reads `invite_id`:
   - to the maker, "Priya joined by your link";
   - to everybody else, "Priya joined by Arjun's link";
   - to her, "You joined by Arjun's link".

   An older client, which ignores the field, says "Arjun added Priya".
7. **The link goes with its room.** A room's link is checked each time it is peeked at, redeemed,
   entered by or listed. It is withdrawn there if:
   - the room is archived or gone;
   - its maker is no longer in it.

   Nothing hooks archive, delete or leave: every path that ends a room or takes the maker out ends
   the link in the same place. A room locked against changes (ADR 0156) still takes people in.
8. **Open links name their room.** In You's list:
   - the phone reads "Guest · once · Bakery";
   - the web reads "Guest · into Bakery".

## Consequences

- **Nobody is told yet.** "Priya joined Demo" to the maker and "Arjun added you" by push are
  Phase 4.
- **A link made before this has no room**, and works as a workspace's link did.
- **A guest's one room is the link's room.** A guest already in a room can't be let into
  another by a link. Making them a member is the way, and the refusal says so.
- **Tests:**
  - server: the use case and the routes, and the authorization matrix's `POST /v1/invites/enter`;
  - core: `people.test.ts` and `model.test.ts`;
  - phone: `Join.test.tsx`, `landing.test.tsx` and `RoomSheet.test.tsx`;
  - web: `Shell`, `Pairing` and `InviteArrived` tests;
  - e2e: `testing/join-and-remove/room-links.spec.ts` on both projects;
  - a simulator walk against two scratch servers.
- **Going live:**
  - migration 0047, so back up the database and restart 4431;
  - `pnpm build`, for protocol's `dist`, where `invite_id` is a `chipsWrites` field;
  - `pnpm desktop`;
  - `pnpm phone build`.

  An older phone build opening a room's link joins and is put in the room by the server, but
  lands on Spaces.

## Addendum, a room of one agent takes a link too (17 October 2026)

Arjun opened Add in a room on his iPhone and found "Everyone in your workspace is here" and no
**Invite someone new**. Two things were wrong.

- **A room of one agent was refused.** Decision 1 kept links out of a "direct" room. On the wire,
  direct names the room's shape, not who is in it. It is the room the + opens with one agent, every
  room a harness opens under its own key, and each Main room. No room is a private chat between two
  people. Of his 27 open rooms, 22 were direct, and the same Add page already took an existing person
  into any of them. Now a direct room takes a link like any other room. A thread still takes none.
  The rule is the server's `spaceRefusal` and core's `mayInviteToSpace` (`space.parentSpaceId`
  where it read `kind`).
- **The empty People row said the wrong thing.** The row showed whenever the list offered nobody,
  and he was the workspace's only person. Core's `nobodyToAddWords` now picks the line, on the phone,
  the Mac and the web:
  - "Nobody else is in your workspace yet", with the owner's link under it;
  - "Everyone in your workspace is here";
  - "Everyone else is a guest in another space".

Tests: core `people.test.ts`, the server's `routes/invites.test.ts` (a direct room's link
brings Priya in; a thread's is `422`), the phone's `RoomSheet.test.tsx` and the web's
`Shell.test.tsx`. Going live: restart 4431 (no migration), `pnpm build`, `pnpm desktop`,
`pnpm phone build`.
