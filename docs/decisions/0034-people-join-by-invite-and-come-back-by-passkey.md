# 0034. People join by invite, hold a role in the workspace, and come back by passkey

6 September 2026 · Status: accepted

Decided at the start of Phase 5 · People, for M5.1 (invites and passkeys) and M5.2 (membership).
Phase 5 was started before Phase 4 on Arjun's word; see `STATUS.md`, Scope changes.

## Context

Until now a workspace had one person: whoever ran `chips serve`, paired by the code it printed,
plus a dev-mode route that stood in for an invite so a second browser could be tried (M3.3). A
person is identity — a row in `participants`, a registry (ADR 0018) — and their standing exists
only *per space*: owner, member or guest of a room, written by `membership.added` (ADR 0030 reads
those standings to resolve `role:<name>`).

The blueprint's "Multiple people" section fixes the shape: a workspace is a server; whoever runs
it owns it; everyone else joins by an invite link with a role attached, creates an account with a
passkey and no password, and is added to rooms by whoever is already in them. Roles are per
workspace: owner, admin, member, guest, where a guest may be in one space only.

Three questions had to be answered: where a workspace role lives, what an invite is, and what a
passkey is for when every request is already signed by a device key (ADR 0006).

## Decision

1. **A workspace role is a projection of two events.** `person.joined` records that a person
   entered the workspace — by an invite, or as its first person — with their role, their name,
   the invite and who issued it; `role.changed` records an owner or admin changing it. Both are
   workspace events (direction `workspace`, no space), so everyone in the workspace is sent them
   and the client folds them into a people list. The `workspace_members` table is the read model,
   rebuilt by `rebuild` like any other. The person's *existence* — their id and display name —
   stays in the `participants` registry, as ADR 0018 draws the line: identity is not replayed,
   what somebody may do is. Every person who existed before this decision is given a
   `person.joined` by the migration: the oldest person in each workspace is its owner, the rest
   are members, and the event says the migration wrote it.

2. **The roles are owner, admin, member and guest, and the door reads them.** The rules, in
   `domain/roles.ts` and `authorize.ts`:
   - an owner does everything; an admin does everything but touch an owner or make one;
   - only an owner or admin changes roles, and the last owner cannot be demoted;
   - only an owner or admin issues an invite, and an admin issues none for the owner role;
   - a guest opens no space, adds nobody to one, and is in one space at most: the first
     `membership.added` that names them puts them in it as a guest of that room, and a second,
     into another room, is refused;
   - a guest is told only whom they share a space with, as a harness is (`GET /v1/participants`);
   - removing somebody else from a space takes the room's owner, as before, or a workspace owner
     or admin;
   - a harness's tokens are its owner's, as ADR 0023 says, and now a workspace owner's or admin's
     too (M5.2).
   The caller's role travels on the `Principal`, read by the authenticator beside their device,
   so the cheap rules cost no lookup.

3. **An invite is a capability in the registry, and the person it made is an event.** An invite
   is 256 bits of randomness, shown once as a link and stored as a digest, with a role, an
   expiry, whether it is single-use, and who made it. Nothing about it is in the log: a log that
   held invite tokens would be a log that could reconstruct a credential (ADR 0018). What the
   audit records is the outcome, `person.joined`, naming the invite and its issuer. Redeeming an
   invite creates the person, joins them with the invite's role, and pairs the device that
   redeemed it — the invite is the pairing code for the first device — behind the same limiter
   `POST /v1/pair` has.

4. **A passkey is how a person comes back; the device key is still how a request is signed.** A
   WebAuthn credential cannot sign every request — each assertion is a gesture — and a device key
   cannot follow a person to a new phone. So a passkey does one thing: it authorises pairing a
   new device without a code from an old one. Sign in with a passkey is an assertion over a
   challenge, and the answer is a paired device, exactly as `POST /v1/pair` answers. A passkey is
   registered from a device that is already paired (or right after joining), listed and revoked
   by its person and nobody else — not even an owner, who removes a person's devices instead.
   The credential's public key, in COSE, is a registry row beside the device keys.

5. **Verification is Chips' own, and attestation is not checked.** `infrastructure/auth/webauthn.ts`
   parses the client data, the authenticator data and the attestation object (a small CBOR
   decoder), checks the challenge, the origin, the relying-party id hash, user presence and the
   sign counter, and verifies ES256, EdDSA and RS256 signatures with `node:crypto`. The
   attestation statement is ignored: a home server has no list of trusted authenticators and no
   reason to refuse a browser's own. This is one file of the kind the Gate 5 focus reads
   closely, and it has no dependency to audit. The relying-party id is the hostname of the origin
   the browser reports, which must be the server's public hostname, one named in
   `auth.passkeyOrigins`, or loopback; WebAuthn needs a secure context, so a Mac mini reached
   over plain `http://` on a LAN takes passkeys only on the machine itself until a TLS or relay
   address exists (Phase 4, Phase 6). The pairing code remains for everything else.

## Consequences

- `POST /v1/invites`, `GET /v1/invites`, `DELETE /v1/invites/:id`, and the unauthenticated
  `POST /v1/invites/peek` and `POST /v1/invites/redeem`; `POST /v1/passkeys/options`,
  `POST /v1/passkeys`, `GET /v1/passkeys`, `DELETE /v1/passkeys/:id`, and the unauthenticated
  `POST /v1/passkeys/assertion-options` and `POST /v1/passkeys/assert`; `GET /v1/devices` and
  `DELETE /v1/devices/:id`. The app's first screen reads `#invite=` and offers a passkey beside
  the code; a You screen holds the person's devices, passkeys and, for an owner or admin, invites
  and roles.
- The dev-mode stand-in for an invite (`POST /v1/dev/people`) now joins the person properly,
  so the end-to-end specs that use it fold a role for them.
- `role:<name>` in a policy rule or a harness's `approvers` resolves against workspace roles as
  well as room standings (M5.5 refines routing; ADR 0030 stands).
- The demo bootstrap and `chips serve` make the first person an owner by the same use case an
  invite uses, so nothing else writes a person.
- Open questions left for later: removing a person from a workspace altogether (their devices
  and passkeys revoked, their role ended) is not built; an owner revokes their devices. (Built by
  ADR 0160, 14 October 2026.) Harness
  ownership transfer is M5.2's, on the registry column ADR 0023 chose, recorded by an event.

## Addendum, Gate 5 (6 September 2026)

Four things the gate's probes found, each in the tagged commit (the Phase 5 review, findings 3,
6 and 7, and finding 2 for the guest):

- **An admin does not withdraw an owner's device.** Decision 2 keeps an admin from touching an
  owner's role; the device route let an admin withdraw the owner's every device and lock the
  workspace's owner out. The rank rules there too: a device is withdrawn by its person, or by
  somebody of at least its person's rank (`outranks`, `routes/devices.ts`).
- **Nobody in more than one space is made a guest.** Decision 2's "a guest is in one space at
  most" was enforced on being added and not on being demoted: a member of three rooms made a
  guest was a guest of three rooms. `role.changed` to `guest` is refused while they are in more
  than one, with the count and what to do first (`refuseRoleChange`, rule 11).
- **A guest is never "anyone".** An ask that names nobody, or names `any`, is answered by the
  people in the room but a guest; a guest answers when named by id (ADR 0036's addendum).
- **A blank name spends no invite.** Redeeming a single-use link with a name that is nothing
  spent the link before the name was refused. Everything that can be wrong with the answer is
  now refused before the invite is spent.

## Addendum, a guest's space in the directory (9 October 2026)

A walk with a second person (`testing/scenarios/people/a-second-person.md`, finding PP-2) was
offered a guest who was in a room already, and then refused with decision 2's rule. The directory
said each person's role and not which space a guest was in, so neither app could leave them out.
`GET /v1/participants` now carries `guest_of` on a guest's row: the one space they are in, open,
closed or archived, as the door counts them, or `null` while they are in none. Nobody else's row
has it. Everybody who sees the whole directory, everyone but a guest, sees it, as they already see
the room each agent is in (`room`, ADR 0087); a harness or another guest sees a guest only when
they share that space. The id says that the space exists and nothing of what is in it. Core's
`guestElsewhere` reads it, and the web's Members and the phone's Add leave such a guest out.

## Addendum, who makes somebody a room's owner (14 October 2026)

`membership.added` carries the room role it gives, and the door checked it only for a guest: any
member in a room could add somebody as its **owner**, and an owner of a room takes others out of
it. Now only the room's owner, or an owner or admin of the workspace, adds somebody as owner;
anybody else in the room adds as member, and an owner role from them is refused (`wrong_role`,
"only the owner of a space makes somebody else its owner"). The apps always add as member, so
nothing they do changes. Adding a removed person is refused as "that person was removed from the
workspace", where it said "harness" (`docs/proposals/people-first-class-review.md`, Phase 0).

## Addendum, only an owner invites (14 October 2026)

His call on the people review (`docs/proposals/people-first-class-review.md` §6): "only owner
invites". Decision 2 had an owner or an admin issue invites, an admin none for the owner role. Now
issuing an invite, listing the open ones and withdrawing one are an owner's alone, for any role;
an admin changes roles and removes people (ADR 0160) and lets nobody in (`mayInvite` in
`domain/roles.ts` and in core's `people.ts`, `not_allowed`: "Only an owner of the workspace invites
people."). A link an admin made before stays good until it is used up, lapses or an owner withdraws
it. Taking somebody out of a room now asks first, on the phone and the desktop alike (his call:
they are told the moment it happens, so an undo would flash a notice at them).

## Addendum, a member is told the agents in their rooms (19 October 2026)

Arjun, with Natalie a member in one of his rooms: her Spaces showed that one room, and her Agents
tab every agent of his. "What is the point of not sharing all spaces but sharing all agents?"
Decision 2 told every person but a guest the whole directory, people and agents alike, so they
could add whom they could name (M3.3). Since ADR 0087 moving or copying an agent is its harness's
owner's or an admin's, so a member could do nothing with an agent in another room but read its
name, its harness, whether it was busy, and how many of its words waited. His call: a member sees
only the agents in the rooms they're in, plus any harness they own; the People list stays whole.

- **Who is told every agent:** an owner or admin (`seesEveryAgent`, `domain/roles.ts`). Who is
  told every person is unchanged (`seesWholeDirectory`: anybody but a guest).
- **The directory** (`GET /v1/participants`) gives anybody else every person (a guest: whoever is
  or was in their rooms), the agents that are or were in their rooms (`participantsMet`) and those
  of a harness they own, and the harness behind each. An agent that has left one of their rooms is
  still named, so what it said there keeps its name and not an id; a guest's directory had that
  gap, and no longer does.
- **Live and on replay,** `agent.registered`, `agent.updated` and `agent.deleted` reach a member
  as they reach a guest: when the agent is in a room of theirs now, or of a harness they own (the
  protocol's `Viewer.seesAgents`, the socket's `knowsAgent`, the store's `agentsKnownTo`).
  `agent.lock_set` reaches only whoever is told every agent; anybody else reads a lock the next
  time they read who is who, as a guest did.
- **An agent's history** (`GET /v1/agents/:id/stays`) gives the rooms a member is not in, as dates
  and a count, only for an agent of a harness they own; anybody else reads the rooms they are in.
- **The apps** list, to anybody but an owner or admin, an agent in a room they are in now or of a
  harness they own (core's `showsAgent`): the Agents tab and its harnesses, search, and Add's Free
  and In other rooms. While the reader's role is not yet known, the directory is listed as it came.
- **The invite form** says it under Member: "They see everybody here, and only the agents in their
  spaces."

**Adding, his call the same evening:** "a member adds only agents of a harness she owns, the same
rule as a move. The server should refuse the rest." Until then the door let anybody but a guest put
a free agent, or a harness as its default agent, in a room they were in, by its id, though no list
of a member's offered one of the owner's any more. Now a person puts an agent or a harness in a
room only as they would move it, as its harness's owner or an owner or admin of the workspace
(`refuseAgentNotTheirs`, rule 16; `wrong_role`, "an agent is put in a room by its harness's
owner, or an owner or admin of the workspace"). The apps ask the same (`mayPutIn`, and the
agent card's Put in a room follows `mayMove`, which a free agent's card had offered anybody but
a guest).

## Addendum, an owner stays in a room, and a guest counts open rooms (20 October 2026)

Two findings of the second-person suite (`testing/scenarios/people/every-second-person-flow.md`),
and his calls on them: "JR-23: refuse an admin taking the owner out of a room. JR-24: count only
open rooms for a guest."

- **An owner of the workspace is taken out of a room only by an owner (JR-23).** Rule 11 let an
  owner or admin take anybody out of any room they were in, as the room's owner can, so an admin
  could take Arjun out of a room. His agents answer a room only while he is in it (ADR 0204's
  addendum), so the room went quiet for everybody there: the reason his own Leave was taken away
  on 19 October. The rank that keeps an admin from changing an owner's role, or withdrawing an
  owner's device (Gate 5 above), now reaches a room: a `membership.removed` naming an owner of the
  workspace, from anybody but an owner, is refused (`refuseOwnerOut`, `wrong_role`: "only an owner
  of the workspace takes an owner out of a space"). That covers a member made the room's owner
  too. Leaving stays anyone's. The apps offer nobody else Remove on an owner's row (core's
  `mayRemoveMember`).
- **A guest is in one open room at most (JR-24).** Decision 2's "a guest is in one space at most"
  counted an archived room, so a guest whose trip had ended could be put in no other room without
  being made a member. The door now counts open rooms, threads aside (`spaceCountFor`), as it
  counts an agent's (ADR 0087); so does a role change to guest, a room's link for somebody already
  here (`/v1/invites/enter`, core's `spaceLinkAsking`), and the directory's `guest_of`, which names
  the open room a guest is in and is `null` while they are in none. A guest stays a member of the
  archived room, so what was said there is still theirs to read.
- **An archived room whose guest is in another open room by now is not unarchived.** Unarchived,
  it would make them a guest of two. Of the two smaller rules, refusing, or taking the guest out
  as the room opens (what happens to an agent, ADR 0087's rule 4), refusing changes nothing
  nobody asked for: `space.updated` to `open` is refused (`refuseReopening`, `guest_elsewhere`),
  naming them, and the room says why as it does for any refused change ("Natalie is a guest in
  another space now, and a guest is in one at a time: take them out of one first, or make them a
  member."). Unarchived from the Spaces list, the row stays under Archived, and the words are in
  the room.
