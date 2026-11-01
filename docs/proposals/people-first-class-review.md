# People, first class: a review of inviting, adding, taking out and removing

*14 October 2026. On his "I need first class support for inviting and adding person to space,
removing them. This needs to be a highly polished and functional flow e2e. Please do a thorough
review of what we have today and what needs to be built". Read from the code on main `78b0caef`
(server, protocol, core, web, Mac, phone), the ADRs, the proposals, `testing/` and STATUS. Every
claim has a `file:line`; nothing here is built yet.*

## The short answer

On a computer, inside the tailnet, the whole round works today and is tested: an owner or admin
makes a link (You → *Invite someone*), the person joins in a browser, is added to a room from its
sheet, talks, is taken out, is added back, and is removed from the workspace (`testing/join-and-remove`,
26 tests, live since 08:07 today).

It stops being first class in five places:

1. **Nobody outside your tailnet can open the link.** The link is
   `https://adas-mac-mini.tail2f9c1e.ts.net/#invite=…` (4431's `CHIPS_PUBLIC_URL`;
   `server/src/interfaces/http/routes/invites.ts:91-114`). The relay carries the phone app, not a
   browser, and an invite carries no relay details. *(Since Phase 2 it does, so the apps join from
   anywhere; a browser still waits on Phase 5.)*
2. **Nobody but you can install the apps.** No TestFlight, no Developer ID or notarised Mac build
   (`docs/proposals/install-onboarding-plan.md` Phase 6, not started). A second person's only way
   in is a browser, which since JR-15 has a phone layout.
3. **The iPhone can't do the owner's half.** No People, no *Invite someone*, no role change, no
   Remove from the workspace (`apps/mobile/src/you/You.tsx:12-14,109-138`). It can add a person to a
   room and take them out. *(Built: Phase 1.)*
4. **The iPhone (and the Mac app) can't do the joiner's half.** Neither opens an invite: the phone
   reads pairing codes only (`apps/mobile/src/pairing/scanned.ts:38-45`), the Mac's `chips://` links
   know space, approval and pair (`apps/web/src/native.ts:107-140`). Core's `joinByInvite`
   (`packages/core/src/device.ts:482-497`) is called by the web alone. *(Built: Phase 2, ADR 0164.)*
5. **An invite can't name a space, and nobody is told anything.** A guest lands on an empty
   welcome until you remember to add them (`server/src/infrastructure/db/schema.ts:553-566`: no
   space on an invite). Nothing is pushed when somebody joins by your link, when you are added to
   a room, or taken out of one (`server/src/application/use-cases/notify-*.ts`).

Underneath those, a dozen smaller things (§3), three of them server rules worth fixing first.

## 1. The flow as it stands, step by step

✓ built and tested · ◐ built, rough or untested · ✗ missing

| Step | Server | Web / Mac, owner | Web, joiner | Mac app, joiner | iPhone, owner | iPhone, joiner |
| --- | --- | --- | --- | --- | --- | --- |
| Make a link (role, once/many) | ✓ `POST /v1/invites` | ✓ You → Invite someone | – | – | ✗ | – |
| Choose how long it lasts | ✓ 60 s – 31 days | ✗ always 7 days (`apps/web/src/app/you/services.ts:28`) | – | – | ✗ | – |
| Send it | – | ◐ Copy, shown once | – | – | ✗ no share sheet | – |
| See and withdraw open links | ✓ | ✓ | – | – | ✗ | – |
| Open the link off the tailnet | ✗ | – | ✗ | ✗ | – | ✗ |
| See who invited you, as what | ✓ peek | – | ✓ JR-13 | ✗ | – | ✗ |
| Name yourself, join | ✓ redeem | – | ✓ JR-1, JR-14 | ✗ | – | ✗ |
| Open a link in a browser already paired | – | – | ✗ ignored (`App.tsx:118`) | ✗ | – | ✗ |
| Welcome, member vs guest | – | – | ✓ JR-4 | ✓ | – | ◐ shown, but only after pairing from a computer |
| Get onto a second device | ✓ code, passkey | ✓ Pair another device | ✓ passkey | ◐ code only (`You.tsx:39-42`) | ✓ | ◐ code from a computer |
| Be told somebody joined | ✗ | ✗ | – | – | ✗ | – |
| Add a person to a room | ✓ | ✓ room sheet → Add → People | – | ✓ | ◐ untested tap; button reads "Add Agents" | – |
| Invite straight into a room | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Be told you were added | ◐ a room line | – | ✓ room opens, "Arjun added you" | ✓ | – | ◐ no push; room appears |
| See who is in a room, with roles | ✓ | ◐ admins shown as "Member" | ✓ | ✓ | ◐ same | ✓ |
| Take a person out of a room | ✓ | ◐ no confirm | – | – | ◐ swipe, no confirm | – |
| Be told you were taken out | ✓ room line | – | ✓ JR-6 | ✓ | – | ✓ in the room only; no push |
| Leave a room yourself | ✓ | ◐ `/leave` only | ◐ `/leave` only | ◐ | ✗ no row | ◐ `/leave` only |
| Change somebody's role | ✓ (socket only) | ◐ no confirm | – | – | ✗ | – |
| Remove from the workspace | ✓ ADR 0160 | ✓ Remove… with dialog | – | – | ✗ | – |
| Be told you were removed | ✓ 4003 / 401 | – | ✓ JR-10 | ✓ | – | ✓ (Jest only) |
| Leave the workspace yourself | ✗ refused | ✗ | ✗ | ✗ | ✗ | ✗ |
| Come back | ✓ new invite = new person | ✓ | ✓ | – | – | – |

Tests today: web Playwright covers every ✓ in the web columns at a desk and at 393 px
(`testing/join-and-remove`, `apps/web/e2e/people.spec.ts`, `group.spec.ts`, `outsider.spec.ts`).
The phone has Jest for the welcomes, the removed state, guest filtering on Add, and who is offered
Remove (`apps/mobile/src/spaces/List.test.tsx:965-1043`, `RoomSheet.test.tsx:218-272,675,706`), but
not the tap that adds a person, the taken-out notice, the people lines, or `useForget`. No Maestro
flow touches people. **Part C, a real person, has never been run** (`testing/join-and-remove/README.md:99-102`,
`testing/scenarios/people/a-second-person.md:156`).

## 2. The five gaps, in detail

### G1. Reach: the link opens only inside the tailnet

- The link's base is `CHIPS_PUBLIC_URL` when it is set, and 4431 sets it to the tailnet name
  (`routes/invites.ts:91-114`; `~/Library/LaunchAgents/chat.chips.serve.plist`).
- The relay tunnel reaches the same app, the invite routes included
  (`server/src/interfaces/relay/link.ts:5-14`), but only a native client that holds the relay URL
  and `server_key` can use it, and only a pairing code's answer carries them
  (`routes/pairing-codes.ts:52-61`). A browser can't use the relay at all.
- So today every invitee must first be given access to the tailnet (a Tailscale share of the Mac
  mini), install Tailscale and accept it. That is what `a-second-person.md` does.

**Options (his call, and the first one to make: part C depends on it):**

| | What | Build | Risk |
| --- | --- | --- | --- |
| **A** | Tailscale share per invitee | none; a guide in `testing/` and `operate/people.md` | friction for each person |
| **B** | Tailscale Funnel: 4431 on the public internet at the same name | small: config, a check in `chips doctor`, docs | 4431's open routes (peek, redeem, pair, passkeys, the web app) face the internet; tokens are long and routes rate-limited, but it needs a security pass first |
| **C** | The relay carries browsers too (`https://<server>.relay.chipschat.ai`) | large: an HTTP front on the relay, per-session windows (ADR 0144 says the protocol needs them) | the relay becomes a public web host for every server on its list |

Recommendation: **A** for part C now (no build), **B** after a short security review if he wants
invitees without Tailscale; **C** only when Chips goes public.

### G2. Install: the apps are his alone

- iPhone: `eas.json` has one development profile; no TestFlight (`install-onboarding-plan.md:831-843`,
  `apps/docs/src/content/docs/operate/mobile.md:11`).
- Mac: signed "Apple Development", not Developer ID, not notarised; Gatekeeper refuses it elsewhere
  (`operate/desktop.md:168-170`, `apps/desktop/scripts/build.sh:1-37`). `release.yml` has never run
  (IN-1), and GitHub Actions has refused jobs over billing since 10 October.
- Until this moves, every other person uses the web app. That makes JR-15's phone layout the
  invitee's phone app, and the web the surface to polish hardest.

**His call:** TestFlight (internal testers first) and a notarised Mac build, i.e. install plan
Phase 6. Not needed for G3–G5 to be built and tested on his own devices.

### G3. The iPhone has no owner's half

Core already has everything (`packages/core/src/store.ts:438` `createInvite`, `473` `changeRole`,
`553` `removePerson`; `removal.ts` `mayRemovePerson`, `removePersonAsking`); the phone calls none of it.
Missing on the phone:

- **People** in You (owners and admins, as on the web): each person, their role, who invited them;
  a person's page with the role (asking first on a demotion) and **Remove…** with the web's words.
- **Invite someone**: role, once or many, how long; the link out through the share sheet
  (`apps/mobile/src/ui/share.ts:19-24`, as Agents already does at `src/agents/Agents.tsx:187-200`);
  the open links with Withdraw.
- The room sheet: **Add** hidden from a guest (`RoomSheet.tsx:752-766` shows it to everyone);
  labelled for both agents and people, not "Add Agents"; a **Leave this space** row
  (today `/leave` only); Remove that asks or can be undone (it is immediate today, `RoomSheet.tsx:213-216`).

### G4. Neither app can be joined by an invite

- Phone: the pairing screen and QR accept `ABC-234` or a `pair=` link only
  (`src/pairing/scanned.ts:38-45,65`; `packages/protocol/src/pairing.ts:104-105`); no handler reads
  `#invite=`; `app.json` has no associated domains. An invitee who has the app must join in a
  browser, then pair the phone with a code from that browser.
- Mac: `chips://` knows `space`, `approval` and `pair` (`apps/web/src/native.ts:107-140`); the Pair
  screen ignores `#invite=` inside the app (`apps/web/src/app/Pairing.tsx:150`); passkeys are not
  offered in the app (`You.tsx:39-42`).
- A browser already paired ignores an invite link (`apps/web/src/app/App.tsx:118`): it shows the
  workspace it knows and says nothing.

**To build:** the phone's pair screen takes an invite link (pasted, scanned, or opened from a
link) and shows the same card as the web, then joins; the invite's answer carries the relay URL
and `server_key` (as a pairing code's does) so the phone can join from off the tailnet once it has
the app; `chips://invite?…` on the Mac; a paired browser that opens an invite says "This browser
is already in Demo" and offers to open it there or sign out first.

### G5. An invite can't name a space, and nobody is told

- **Invite to this space.** A link made from a room's sheet, tied to the room: the card says
  "Arjun invited you to Bakery in Demo", and joining adds them to the room in the same step, so a
  guest never sees an empty welcome. Needs a migration (`invites.space_id`), redeem writing the
  `membership.added` as the inviter, the row on both sheets, and the card's words.
  (Workspace owners and admins only, as every invite is today; ADR 0034.)
- **Notifications**: push today is approvals, @mentions, exchange warnings and harness join
  requests (`notify-push.ts:39`, `notify-mention.ts:171`, `notify-exchange.ts:98`, `notify-join.ts`).
  To add: "Priya joined Demo" to whoever made the link; "Arjun added you to Bakery" to the person
  added; "Arjun removed you from Bakery" to the person taken out. Tapping opens the room. The phone
  handles only open, join and decisions (`apps/mobile/src/push/usePush.ts:120-130`). The web has no
  web push at all (`apps/web/src/app/useNotifications.ts:1-11`), so in a browser this is a tab
  notification while it is open.

## 3. Smaller things found on the way

**Server rules (fix first, small):**

- `membership.added` carries a room role (`owner`/`member`/`guest`) and nothing checks it but for
  guests: any member in a room can add somebody as the room's **owner**
  (`server/src/domain/authorize.ts:493-494`; `projection.ts:622-636` upserts it). Only the room's
  owner or a workspace owner/admin should make a room owner.
- Adding a removed person is refused as "that harness was removed from the workspace"
  (`authorize.ts:566-567`).
- `authorize.ts:38-39` says an admin removes "anybody from any space"; the rule wants the admin in
  the room (`authorize.ts:446-459,495`). The rule is right (they can't see the room otherwise);
  the comment is not.
- Approvals already routed to a removed person wait for nobody (ADR 0160, open).

**Policy (his calls):**

- **A guest's message restarts the room's spend count.** Every person's act starts a new job with the
  full ceiling again (`packages/protocol/src/exchange.ts:32-44`;
  `server/src/infrastructure/store/exchange.ts:60-77` filters on "a person", not on role), so a guest
  can keep your agents spending, $3 a job by default. Options: keep; a guest's message counts in the
  current job rather than starting one; a guest's message needs a member's go before agents spend.
- Who may invite: owners and admins only (ADR 0034). Many tools let a member invite a *guest* into a
  room they are in. Keep, or allow that?
- Leaving the workspace yourself (refused today, `remove-person.ts:104-106`); a removed screen that
  says who removed you (needs a `removed_by` column); restoring a removed person. All left open by
  ADR 0160.

**Polish:**

- Rooms: admins and owners of the workspace show as "Member" in a room's list (`Adding.tsx:208`,
  `RoomSheet.tsx:711-713`); the Spaces list drops a room you were taken out of with no word
  (the notice is only inside the room).
- You → People: a role changes the moment it is picked (`Workspace.tsx:125`); the link is shown once
  and can't be copied again (by design: only its hash is kept), so it should say so; no expiry choice.
- Stale words: "members panel" in `SpaceView.tsx:2145,2162`, `NewSpace.tsx:14`, `core/src/spend.ts:4`,
  `core/src/rooms.ts:5`; "add-a-member" in `removal.ts:33`; ADR **0159** where 0160 is meant in
  `remove-person.ts:2`, `Removed.tsx:2` and `testing/join-and-remove/remove.spec.ts:2` (mine).
- Docs: `reference/http.md:65` and `operate/people.md:106` say an owner lists and withdraws anybody's
  devices (the route lists only your own, `routes/devices.ts:47-58`); `people.md` says nothing of
  taking a person out of a room or `/leave`; `a-second-person.md` still says the relay isn't
  running, "Members → Add … Done", and removal "not built".

## 4. What to build, in order

| Phase | What | Size | Needs |
| --- | --- | --- | --- |
| **0** | §3's server rules, words and docs; the stale 0159s. **Built 14 October** (§7) | S | nothing |
| **1** | The iPhone's owner half (G3): People, a person's page, Invite someone with the share sheet, Withdraw; room sheet Add/Leave/Remove polish. Web: expiry choice, role change asks first, Remove from a room asks first, admins named as such in a room | M | a phone-width mock first |
| **2** | Joining from the apps (G4): the phone takes an invite link, card and join, relay details on the invite; `chips://join` on the Mac; a paired browser opening an invite. **Built 14 October** (§7, ADR 0164) | M | a server change to the link only (no migration) |
| **3** | Invite to this space (G5). **Built 15 October** (§7, ADR 0168) | M | migration; a mock of the sheet row and the card |
| **3b** | Leave the workspace yourself; the removed screen names who removed you; an owner restores a removed person (his call 5) | M | a migration (`removed_by`); a mock; an ADR 0160 addendum |
| **4** | Being told (G5): three pushes, the phone's handlers, tab notifications on the web, the Mac's | M | — |
| **5** | Reach (G1): **C**, the relay carries browsers (his call 1). Then **1B**: the `https://` invite link opens the app directly (universal links; Apple checks the domain from the open internet, so it needs this phase's public address) | L | its own ADR and design first |
| **6** | Install (G2): **TestFlight** (his call 2), and a notarised Mac | M | his Apple accounts; install plan Phase 6 |
| **7** | **2B**: the phone holds several workspaces, switched from You as the Mac does; an invite to another then joins alongside ("Join Studio too?") instead of signing out (his call 7) | M | a mock; the phone's device store and every hook that reads one device |

Phases 0–4 can be built and tested on his devices and on scratch servers without 5 or 6.
Part C with a real person needs reach: until C is built, a Tailscale share (A) gets one person there.

## 5. How it will be tested end to end

- **Web** (Playwright, `testing/join-and-remove`, both projects): invite to a space; how long a link
  lasts; a paired browser opening an invite; Leave; Remove from a room asking first; role change
  asking first; the joined, added and taken-out notifications as tab notices.
- **Phone** (Jest beside each new screen): People, a person's page, Invite someone, the pairing
  screen with an invite, the tap that adds a person, the taken-out notice, the people lines,
  `useForget`.
- **Phone, driven** (new): Maestro flows on a simulator against a scratch server, owner and joiner
  each a simulator in turn (one booted at a time; the Mac has 16 GB): make a link and share it,
  join with it, be added, be taken out, be removed. Maestro is in `~/.maestro`; the flows go in
  `testing/join-and-remove/maestro/`.
- **Mac**: the web specs cover its screens; `chips://invite` is walked by hand (B).
- **Live (C)**: a real person, on his word, after phase 5.

## 6. His calls (answered 14 October 2026)

1. **Reach: C.** The relay carries browsers too, so a link opens anywhere. Its own ADR and design
   first (an HTTP front on the relay, per-session windows, what a public web host on the relay
   means for its terms), then Phase 5.
2. **Install: TestFlight.** Phase 6; his Apple accounts.
3. **A guest's message and the spend count: as is.** A guest is free to use the space they are in;
   no special limits.
4. **Who invites: "only owner invites".** A member does not invite. Whether an admin still may (today
   they can, ADR 0034) is asked with the Phase 1 mock.
5. **Leaving and removal: all three.** Leave the workspace yourself; the removed screen names who
   removed you; an owner can restore a removed person. A new phase, **3b**, after invite-to-space.
6. **Start with Phases 0 and 1.** Phase 0 is built (below); Phase 1 starts with a phone-width mock.
7. **Phase 2: "A for both … But I want 1B and 2B later"**, after the mock
   (<https://claude.ai/artifact/EHEgKszLHzhAb3JdyM2qUb>). 1A: Safari's join page offers **Open in
   Chips** (`chips://join`); 1B, a universal link, goes with Phase 5. 2A: a phone already in a
   workspace asks, then signs out and joins; 2B, the phone holding several, is Phase 7.
8. **Phase 3: "A for both, go ahead and build"**, after the mock
   (<https://claude.ai/artifact/TSf4BocHqMepjKDTkkZAbP>). Q1 A: a room's link makes a Guest or a
   Member, Guest first. Q2 A: somebody already in the workspace is asked, then added to the room,
   and the link stays unused.

## 7. Built

- **Phase 0** (14 October): the room-owner rule (ADR 0034 addendum); "that person was removed";
  an approval only a removed person could answer handed to whoever removed them (ADR 0160
  addendum, `approvals` in `DELETE /v1/people/:id`'s answer); `authorize.ts`'s rule 11 and rule 7
  words; the 0159s; "members panel" and "add-a-member"; `reference/http.md` and `operate/people.md`
  on devices; `people.md`'s *In and out of a room*; `a-second-person.md`'s relay, Members and
  removal lines.
- **Phase 1** (14 October), on his "A for both, go ahead and build" after the mock
  (<https://claude.ai/artifact/4WRJAk2KTTvY2t8Q111M96>):
  - **Only an owner invites** (ADR 0034's addendum): `mayInvite` on the server and in core;
    creating, listing and withdrawing a link are an owner's; an admin keeps People.
  - **Core `people.ts`**: role words and what each may do, `INVITE_LASTS` (a day, a week, a month),
    live links, `rolesOffered` (moved from the web), `roleChangeAsking`, `standingInRoom`,
    `spacesShared`, `guestRefusal`, `takeOutAsking`, `leaveAsking`, `mayLeave`, `mayAddToRoom` and
    `addWords`.
  - **Phone**:
    - You's workspace group has **People** (a count) and **Invite someone** (an owner's; how many
      links are open).
    - `/people` lists everyone. `/people/[id]` shows a person's role, from a sheet that asks first,
      with Guest off for somebody in two spaces; the spaces you share; and **Remove from …**, through
      `ConfirmSheet` in the desktop's words.
    - `/invite` sets the role, uses and how long the link lasts, shows the link once with Share…
      and Copy, and lists the open links with a swipe to Withdraw.
    - The room sheet asks before taking a person out and before Leave, both on pages of its own.
      Leave is not offered to somebody alone in a room. A guest has no Add, and Add reads "Add
      agents or people". Owners and admins are named as such.
  - **Web and Mac**:
    - Invite someone is owner-only and has **Lasts**, with what the role may do under it.
    - A role change asks first.
    - The room sheet asks before taking a person out, has **Leave** at its foot, hides Add from a
      guest, and names admins.
  - **Tests**:
    - core `people.test.ts`;
    - phone `people/People.test.tsx` and the room sheet's;
    - web Shell tests;
    - e2e: a one-day link, Leave from the sheet, a guest's sheet, an admin with no invites, and
      Remove asking first. `pnpm e2e:people` 32 passed.
- **Phase 2** (14 October), on his "A for both, go ahead and build" (ADR 0164):
  - **The link carries the way there**: `POST /v1/invites` answers `#invite=TOKEN&relay=…&key=…`
    when the server has a relay. Protocol's `invite-link.ts` makes and reads both forms, and
    `chips://join?invite=…&lan=…&relay=…&key=…` (not `chips://invite`: the phone's `/invite` is
    Invite someone). Core's `peekInvite` and `joinByInvite` go over a link, so the apps reach the
    server on its network or through the relay, and the device keeps the way it came in.
  - **Core `people.ts`**: `invitedWords`, `DEAD_INVITE`, `alreadyInAsking`, `joinInsteadAsking`,
    `joinAlongsideAsking`.
  - **Phone**:
    - The first screen is **Welcome to Chips**, with **Paste**, the camera (which reads invites
      too), and "Your own Chips" for pairing.
    - `/join` opens from `chips://join`, a paste or a scan. In no workspace it is the join card:
      who, workspace, role and what it may do, name, Join, and a "Through the relay" line when it
      went that way. A dead link offers Paste another link.
    - In a workspace, `/join` is a sheet: "You're already in Acme" (Open Acme), or "Join Studio?"
      (Sign out of Acme and join / Stay in Acme). The join goes first, then the sheet closes, then
      the old device is withdrawn and forgotten.
    - Invite someone has **Show QR code** (`qrcode`, drawn with react-native-svg).
  - **Web and Mac**:
    - The join page offers **Open in Chips** on an iPhone, iPad or Mac.
    - The Mac's Pair screen takes a pasted invite; `chips://join` opens the card in the app, on
      the link's server.
    - A paired tab or the Mac app given an invite asks: "You're already in Demo" (Open Demo) or
      "Join Studio too?" (joins alongside under your name and switches).
  - **Tests**:
    - protocol `invite-link.test.ts`; the server's invite link with a relay; core's device test
      through the relay and `people.test.ts`;
    - phone `pairing/Join.test.tsx` and `ui/QrCode.vitest.ts`;
    - web `Pairing.test.tsx`, `InviteArrived.test.tsx` and `native.test.ts`;
    - e2e: Open in Chips on an iPhone, and a paired tab given its own workspace's link. `pnpm
      e2e:people` 36 passed;
    - the phone walked on a simulator against three scratch servers
      (`testing/join-and-remove/README.md`).
- **Phase 3** (15 October), on his "A for both, go ahead and build" (ADR 0168):
  - **Server**: migration 0047 (`invites.space_id`). `POST /v1/invites` takes `space_id` for
    `guest` or `member` in an open group room the maker is in. Redeem appends `membership.added` as
    the maker with `invite_id` (a `chipsWrites` field). `POST /v1/invites/enter` lets somebody
    already in the workspace into the room, leaving the link unused. A room's link is withdrawn
    when it is next used or listed once its room is archived or gone, or its maker is out of it.
  - **Core**: `InvitePeek.spaceName`, `store.enterByInvite`, `joinTitle`, `roleMeansFor`,
    `mayInviteToSpace`, `inviteSomeoneNew`, `inviteToSpaceHint`, `inviteRowWords` and
    `spaceLinkAsking`. The fold's "joined by your link" lines.
  - **Phone**: Add's **Invite someone new** (an owner's) opens the shared `InviteForm` on the
    sheet. The card names the room, and joining lands in it (`landing.ts`). In a workspace, the
    sheet asks "Join Bakery?", or says "You're already in Bakery", or tells a guest elsewhere.
  - **Web and Mac**: the same row and an **Invite to Bakery** page on the room sheet. The join page
    names the room. A paired tab or the Mac asks about the room, and the shell opens it once it is
    here.
  - **Tests**:
    - server: the use case, the routes and the matrix;
    - core: `people.test.ts` and `model.test.ts`;
    - phone: `Join.test.tsx`, `landing.test.tsx` and the room sheet's;
    - web: `Shell`, `Pairing` and `InviteArrived`;
    - e2e: `room-links.spec.ts`. `pnpm e2e:people` 42 passed;
    - the phone walked on a simulator against two scratch servers. The walk found a room stacked
      twice by a link to the room on screen, now fixed.
