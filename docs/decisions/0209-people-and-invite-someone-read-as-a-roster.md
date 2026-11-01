# 0209. People and Invite someone read as a roster

Date: 20 October 2026
Status: Accepted, 20 October 2026, on Arjun's "Go with A · Roster.", picked from three animated
mocks (A Roster, B Who sees what, C On the way). Builds on ADR 0034 (people, roles, invites),
ADR 0085 (You as a settings list), ADR 0160 (removing a person), ADR 0168 (a space's link) and
ADR 0206 (a new phone for somebody already here).

## Context

Arjun, 20 October 2026: "I want this You-->People and You-->Invite someone sections to be cool
looking, delightful and more informative." People was a list of names with a role picker, and
Invite someone three menus and a button. Neither said what a role lets somebody see, which spaces
a person is in, how they came, or what the link about to be sent would show whoever opens it.
Most of that was already known to the app; only another person's devices had to be asked of the
server.

## Decision

1. **Core says who sees what** (`whoSees.ts`), once for the phone, the web and the Mac: the rooms a
   person is in and the people and agents those let them see (`seenBy`, by the rules of ADR 0034's
   addendum of 19 October); what a link's newcomer would see (`inviteSees`); what a person can and
   can't do, a line each (`canDo`); what a role change would stop and start them seeing
   (`roleChangeSees`, which `roleChangeAsking` now says); the link a person came by
   (`cameBy`, `cameByWords`) and who came by each link (`joinedBy`, `usedInvites`); a link's time
   left (`leftWords`, `lifeLeft`, `openLinksWords`); the role counts, filters and row lines of
   People; and the sentences under Invite someone's choices (`inviteSeesWords`, `inviteIntoWords`).
2. **You's rows say what is behind them.** People: "1 owner · 1 admin · 2 members · 1 guest" and a
   few faces. Invite someone: "2 open links · the next runs out in 20 h".
3. **People is a roster.** Each row is the person's face, the spaces the reader shares with them
   and when they joined, and their role as a tag in its own colour: gold an owner, blue an admin,
   green a member, amber a guest. Chips over the list narrow it to those who run the workspace, the
   members or the guests, with how many each, the ink sliding to the one picked; a filter with
   nobody in it is not offered, and with one kind of person there are none.
4. **A person's page says what they can do.** Under their face, name and role: a tick or a cross a
   line, with the faces and spaces each is about; their role, the spaces you share, and for an
   owner the link they came by; their devices and when each was last seen, with Pair a new phone…
   (ADR 0206); and Remove. Changing a role asks first, as before, and now says whom they would
   stop seeing and whom they would start seeing, and on the phone the faces they'd lose. On the
   web and the Mac the same opens under the person's row, and New phone… and Remove… move there.
5. **The server reads a person's devices for an owner or an admin.** `GET /v1/people/:id/devices`
   returns the devices still signed in as them, as `GET /v1/devices` does for oneself: a member is
   refused (`forbidden`), and somebody not here is `not_found`. Nothing else is new at the server.
6. **Invite someone shows what the link will do.** As, then Into: the spaces a link may name
   (ADR 0168), No space first, for a guest or a member, and off for an admin's or an owner's link,
   with a line saying where they land. Under them, What they'll see: everybody's faces, those the
   newcomer would see grown and the rest folded away, changing in place as the role and the room
   change, and a sentence. Then how often and how long, and Make a link.
7. **The link made shows itself whole.** Its QR, always, the link with Share… (phone) or Copy (web,
   Mac) and Withdraw, and the card it opens to, in the join card's words, rising in after it. The
   open links carry a ring of their time left that draws itself in, amber in its last day, the one
   just made lit gold as it lands. Used lists the links somebody joined by, with their faces.
8. **Flat, and moving.** No gradient, highlight or shadow on any control (Arjun's rule): the life
   is in the motion, each part springing or gliding in, and all of it stilled under Reduce Motion.
   On the phone every Reanimated part lives in `people/PeopleMotion.tsx`, which Jest stands plain
   views in for.

## Consequences

- Owners and admins read a person's devices and when they were last seen. They could already sign
  their own out; another person's they still can't, and removing the person signs them all out.
- A space's invite from a room's sheet on the phone shares the form, so it shows What they'll see,
  the QR and the join card too. The web's room-sheet invite (`room/InvitePage.tsx`) was unchanged;
  its addendum below, "the web's room sheet invites as You does", brings it level.
- Not built, since the server does not know them: the spaces a person is in that the reader is not;
  a name on an invite; a link opened but not used; a link to more than one space.
- Mocks, picked and kept out of the repo: the private artifact
  https://claude.ai/artifact/JtgnX8bHeuZev55QgsNx3Y.

## Addendum, 20 October 2026: the spaces you share wear their faces

Arjun, the same morning: "people --> Person --> "Spaces you share" should show icon + space name,
instead of only mini text space name". On a person's page the spaces you share (Your spaces, on
your own) are now their own section, a row each: the room's face as the Spaces list draws it (its
harness with a ring, its letters, or the mark the reader chose, ADR 0064 and ADR 0176) and its
name, and a tap opens the room. With none, "None yet". On the web and the Mac the opened row has
the same, as faces with names that open the room. Core's `sharedSpaces` gives the rooms;
`spacesShared` names them for the People rows.

## Addendum, the web's room sheet invites as You does (20 October 2026)

The phone's room sheet shares You's form, so a room's link there showed What they'll see, the QR
and the join card from the first build; the web's and the Mac's room sheet still said a role's
meaning in a line and the link in a box with Copy. Now they draw from the same parts as You's
Invite someone (`you/PeopleParts.tsx`: `InviteSeesView`, `IssuedInviteView`, moved there out of
`Workspace.tsx`), so the two clients say the same of a room's link.

1. **Under As, What they'll see**: People and Agents as faces that grow in and fold away as Guest
   and Member change, over everybody's faces (so an agent that joined as its harness, as Scout
   does, is among them), and core's `inviteSeesWords` for the room. It replaces the line from
   `roleMeansFor`, which the join card still says.
2. **The link made is You's**: its QR, the link with Copy and Withdraw, how it joins, and the card
   it opens to. The sheet is 420 px wide, so the card stands under the link rather than beside it,
   and the sheet scrolls the link into sight. Withdraw is new on the sheet: it had said to withdraw
   the link from You.
3. **Raised in the sheet**: What they'll see sits on the sheet's raised ground, as its other cards
   do; You's grey would sink into the sheet's in light.
