# Invited people: a guest's Chips, a member's limits, and a phone with two workspaces

Date: 18 October 2026
Status: Plan, built in this order by the session that wrote it (his words: "please build the
detailed technical plan with phases and then execute").

Two mocks led here, both walked first on a fresh iPhone simulator against scratch servers:

- **A guest's Chips** (<https://claude.ai/artifact/3XhgcKYd3TrcApWLPL77eZ>): somebody with no
  Chips and no computer joins Japan trip by a guest link. Ten gaps were found on the walk.
- **Meera's two workspaces** (<https://claude.ai/artifact/8A7BgAn36pv6gBCs7XGMX3>): somebody who
  runs her own Chips on her own Mac mini joins one of Arjun's spaces. Her phone has to sign out of
  her own Chips to do it.

## His calls (18 October 2026)

1. **A member gets no +.** A member works in the spaces they are added to. A space they made would
   be answered by Arjun's agents, on his computer and his model account.
2. **Only the owner sets Spend per job.** A member sees the amount and can't change it. A guest
   doesn't see it.
3. **TestFlight: both.** The public link goes in Share's words, and email invites are sent too.
4. **The phone holds both workspaces** (the people review's Phase 7, his earlier "2B"). He switches
   by tapping the workspace's name over Spaces (option A on the mock): not from You alone, and not
   one merged list.
5. **Pip stays home.** A person's own agents stay in their own workspace: no agent from another
   Chips comes into a space (option A on the mock).

Everything else on the two mocks was drawn as proposed and not questioned. It is built as drawn,
except where a fact the code holds says otherwise; those changes are listed with each phase.

## What it costs, against what he gets

| Phase | Gets him | Costs |
| --- | --- | --- |
| 1. Rules | Members can't open spaces; only he sets spend; the server agrees with the apps | server + core, no migration, a 4431 restart |
| 2. A guest's and a member's screens | No dead ends: no + for them, no Lead picker that refuses, no harness page for a guest, words that fit a guest | phone + web, no server |
| 3. Getting in | Share says how to get Chips; no "Allow Paste?"; the invite comes first; the join card answers a newcomer | phone + core; his steps in App Store Connect |
| 4. Two workspaces on the phone | Meera keeps her own Chips and joins his; each sends her pushes | phone (large), core, a push field on the server, a 4431 restart |
| 5. People's messages reach the phone | A guest hears when Arjun writes, as the guest mock's first question offers | server (new push), protocol, phone; a 4431 restart |

Each phase lands on main when its gate is green, and goes live at once: push, `pnpm web:build`,
`pnpm desktop`, `pnpm phone ship`, and 4431 restarted (after a `.backup`) when the server changed.
He is today the only person in his workspace, so Phases 1 and 2 change nothing he sees on his own
devices; they matter the first time he invites somebody.

## Phase 1: the rules, on the server and in core (ADR 0196)

*Built 18 October 2026, together with Phase 2: with the rules alone, the + would have offered a
member what the server now refuses. What changed from this plan is in
[ADR 0196](../decisions/0196-only-an-owner-or-admin-opens-a-space-and-only-the-owner-sets-spend.md):
the phone's slot is hidden rather than left dead; a harness page's New agent is an owner's or an
admin's only; a guest's agent rows, their list note and the first notifications question are left
for later.*

**A member opens no space.**

- `server/src/domain/roles.ts:49-52`: `mayOpenSpace` today gates two things at once: a person's
  `space.created`, and their `membership.added` (`authorize.ts:367-382`). Split it in two:
  - `mayOpenSpace(role)` becomes `administers(role)`: owner or admin.
  - `mayAddToSpaces(role)` becomes `!isGuest(role)`: members keep Add.
- `refuseByWorkspaceRole` refuses a member's top-level `space.created` with "a member of the
  workspace may not open a space". A thread (`kind: "thread"`) is still judged by rule 13 alone.
  Neither app offers threads (ADR 0035's addendum), so nothing visible changes there.
- `add-harness.ts`'s direct room is left alone. It opens a room for the person's own harness, on
  their own computer, which is not what his call is about. Neither app offers a member Connect a
  harness anyway.
- Core gains `mayOpenSpace(role)`, the same rule, for the apps. Every entry point that makes a
  top-level space reads it:
  - the + on the phone (`app/(tabs)/_layout.tsx:90`) and the web (`Sidebar.tsx:559`);
  - "Create a space" in both apps' empty states;
  - `welcomeFor`'s `mayCreate`;
  - "A new room with it", on the Agents page (`RoomPicker.tsx:91`, `Agents.tsx:998`);
  - a harness page's New agent, which opens a room (`NewAgent.tsx`, `Harnesses.tsx:228`).
- The words change in `ROLE_SHORT`, `ROLE_MEANS` and `THEY_CAN` (`people.ts:28, 36, 175`). They
  become "works in the spaces they're added to", and "adds people and agents to them".

**Only the workspace's owner sets Spend per job.**

- In `set-spend-ceiling.ts:37-50`, after the room check (a member asking about a room they're not
  in still gets 404), anyone who isn't the workspace's owner is refused: "Only the workspace's
  owner sets what a job may spend." The protocol's doc lines change with it
  (`events/workspace.ts:525`, `spend.ts:11`, `routes/spend.ts:6`).
- Core's `maySetSpend` takes the model: the owner of the workspace, in the room. Today it reads
  only the room's roles (`rooms.ts:352`).

**Who chooses the lead.** Core gains `mayChooseLead`: in the room, and not a guest of the room or of
the workspace. This is the rule `set-lead.ts:36-45` already applies. The apps read it in Phase 2.

**Tests.**

- Server:
  - `roles.test.ts` (the table);
  - `authorize.test.ts:494-504`, which flips for a member;
  - `submit-event.test.ts:766, 1682`, plus a member refused and an admin let in;
  - `spend.test.ts` and the HTTP matrix's spend row, which becomes `ownersOnly`.
- Core: `mayOpenSpace`, `maySetSpend` and `mayChooseLead` for each role; the new words.

## Phase 2: a guest's and a member's screens (phone and web)

*Built 18 October 2026 with Phase 1 ([ADR 0196](../decisions/0196-only-an-owner-or-admin-opens-a-space-and-only-the-owner-sets-spend.md)),
all but three lines that followed the same evening: a guest's agent rows name whose they are, the
Agents tab says so under them, and Spaces says why there is one space. Core words them
(`agentByline`, `guestAgentsWords`, `guestSpaceWords`) for both apps. The agent page's line under
the name says "Arjun's agent" too, as the mock draws it. Two things on the mock were left: the
Lead row keeps "Hands out the work" rather than "Arjun chooses it", since a member chooses too;
and the Agents heading stays "Agents · 1" rather than "In Japan trip · 1".*

Each item here is drawn on the guest mock (its screen number in brackets).

- **No + for a guest or a member** [07, 25].
  - Phone: the gold `Plus` is drawn only when `mayOpenSpace`.
  - The iOS tab slot (`_layout.tsx:164`) can't be hidden while the app runs: hiding a tab remounts
    the navigator (the comment at :154). It stays in the bar, but its press does nothing for
    somebody who may not open a space. The gold + that covers it is not drawn either, so the slot
    shows only as the bar's own small + on iPad.
  - A one-line note goes under a guest's list: "You're {inviter}'s guest in {space}, so it's your
    one space here."
  - Web: the + in `Recent` and "Create a space" read `mayOpenSpace`.
- **Room details** [11, 27].
  - Lead opens only for `mayChooseLead`; for anyone else it's a plain row with no chevron.
  - Spend per job is hidden from a guest. A member sees it read-only, and its line reads
    "{owner} sets it · This job so far: …".
  - A guest's agent rows name the owner instead of the harness: "Arjun's agent".
  - The same on the web (`room/Who.tsx:244-281`).
- **Agents tab, for a guest** [16].
  - No harness shelf and no View all, so a guest never reaches a harness page with its dial, its
    runs and Pause.
  - Rows read "Arjun's agent · in Japan trip".
  - A foot line says whose agents they are.
- **An agent's page** [17]. For anybody who isn't its owner, a "Belongs to" row names the owner.
  - The mock said "Runs on: Arjun's computer". Chips doesn't know where a harness runs, only who
    owns it, so the row says that instead.
  - The harness page itself refuses a guest, with "Not here", in case somebody arrives by a link.
- **You** [19, 21].
  - A guest's line under their name: "Guest in Japan trip · invited by Arjun".
  - Notifications are worded for what reaches a guest: @s, never approvals. The Decisions row is
    hidden from a guest.
  - Sign out's foot and its question say how this person really gets back. An owner or admin pairs
    again with a code. A member or guest with no other device needs a new link from whoever invited
    them.
  - The words are core's: `signOutWords`.
- **The first question about notifications** [05]. It shows when something first needs this
  person. A guest is asked about what reaches a guest (@s), until Phase 5 widens it.
- Web parity covers the rules only: the +, Lead, Spend, and the Agents page's "A new room". The web
  has no guest-shaped screens of its own on the mock.

**Tests:**

- Phone (RNTL): Tabs, List, RoomSheet, Agents, AgentCard, You, AskForPush. Each is rendered for an
  owner, a member and a guest.
- Web (Vitest): `Shell.test.tsx`'s spend, lead and + cases for each role.
- A Maestro walk on a scratch server, as a guest and as a member.

## Phase 3: getting in (phone and core)

*Built 18 October 2026, all but the TestFlight link itself: `TESTFLIGHT_LINK` waits on his steps
below, and Share says only how to paste until then. The join card's facts are two, not three: the
role line it already had says what a guest or member sees. "Nothing to set up" names the
workspace rather than the inviter, since an admin may invite to agents that are Arjun's. Walked on
a simulator: Welcome with the invite first, and Paste opening the join card with no question.*

- **Share's words** [01]. `inviteShareWords(url, testflight?)` puts "Get Chips for iPhone:
  {testflight}" first when the public link is known. The URL is a constant in core,
  `TESTFLIGHT_LINK`, left undefined until he turns the public link on.
  - The words must still parse as an invite, since Paste reads them (`people.test.ts:162`).
  - **His steps in App Store Connect:** turn on the Friends group's public link and give me the URL;
    add testers there by email.
- **Welcome** [03]. On `app/pair.tsx`:
  - "Somebody invited you" comes first.
  - Its button is iOS's own paste button: `ClipboardPasteButton` from expo-clipboard 57, when
    `isPasteButtonAvailable` (iOS 16 and later). So iOS doesn't ask "Allow Paste?". Elsewhere the
    current button stays.
  - The camera folds into a "Scan the link's QR code" row that opens the viewfinder.
  - "On this Wi-Fi" and "Your own Chips" follow, unchanged.
  - The jest mock gains the button (`jest.setup.js:354`).
- **The join card** [04]. Under the role line, three lines from core (`joinFacts(invite)`), using
  only what an invite knows:
  - "Everything said in {space} so far is there for you to read."
  - "You see {space} only, and the people and agents in it." (for a guest), or "You start in
    {space}; {inviter} can add you to other spaces." (for a member).
  - "Nothing to set up: the agents there are {inviter}'s."
- **An owner isn't told they'd need an invite** (own-Chips mock, 03). The phone's join sheet tells
  an owner, or an admin, of the workspace being left: "You can pair again from your computer." It
  no longer says a new invite is needed. Phase 4 replaces this sheet anyway; the words are fixed
  first because Phase 3 ships first.

**Tests:** core words, including that the share text still parses; JoinCard; pair.tsx with and
without the paste button. A simulator walk: the Paste with no question; the join card.

## Phase 4: the phone holds several workspaces (ADR 0197; the people review's Phase 7)

*Built 18 October 2026, as [ADR 0197](../decisions/0197-the-phone-holds-several-workspaces.md)
says. Changed from this plan:*

- *The tabs are keyed by the device in front, so a switch rebuilds them at Spaces. `landIn` needs
  no device: it is read by the tabs drawn for the workspace joined.*
- *Drafts and picks are forgotten by the signed-out workspace's room ids, which are unique across
  servers, rather than kept per device.*
- *Join with a link is also on You, where it shows with one workspace, since the switcher over
  Spaces shows only with two.*
- *Walked on the simulator against two scratch servers. Meera paired with her own, joined Arjun's
  Japan trip from You's Paste with hers kept, and switched both ways from the top of Spaces. A
  scripted Jacobian answering behind dropped the banner, and its tap opened Japan trip in Arjun's
  workspace. Signing out of Arjun's left hers. The walk found three things, fixed here: the banner
  was drawn under the screens, it would have announced what was already waiting as a store behind
  loaded, and the thing a banner or push was for was lost in the switch. Sign out also said "this
  this phone". A lock-screen push was not walked (the simulator has no APNs); its routing is in
  `push/route.vitest.ts`.*

The device layer already holds several. `apps/mobile/src/device/storage.ts` implements core's
`DeviceStorage`, so `loadDevices`, `switchDevice` and `forgetDevice` work on the phone unchanged.
What is single is the provider, which loads only `devices[0]`, and a handful of phone-wide things.

- **Provider** (`src/store/provider.tsx`).
  - It holds `devices` and `current`, and `useChips()` gains `devices`, `switchTo(id)` and
    `joined(device)`.
  - `began` keeps its name and meaning: this device in front.
  - `ended()` forgets the device in front and brings the next one forward. It goes to Welcome only
    when none is left.
  - Switching rebuilds the screens on the store in front, as a join does today, and lands on Spaces.
- **Background workspaces.** `useWorkspaces` on the phone, ported from the web's
  (`apps/web/src/app/useWorkspaces.ts`).
  - Each workspace not in front gets a store of its own while the app is in front. It feeds two
    things: what waits in each (`attention`), and a banner when something new waits there.
  - The banner is a new component: a card over the top of the screen, naming the workspace. Tapping
    it switches there and opens the room.
- **Switcher** [09, 10]. Over Spaces, the workspace's name with a ▾ shows once there are two or
  more.
  - Tapping it opens "Workspaces": each one with its role and what waits there, a tick on the one in
    front, and "Join with a link".
  - "Join with a link" reads the clipboard through the paste button and opens the join route. That
    is the signed-in phone's missing place to paste a link.
- **Joining alongside** [08]. `JoinSheet` in another workspace asks "Join {there} too?". The words
  are core's `joinAlongsideAsking`, which gains where to switch (the sidebar, or the top of
  Spaces). It keeps the device it was in, and the new one comes to the front.
  - `usePairingLink`'s "elsewhere" pairing does the same: today it leaves the old device's row, key
    and push token behind and unreachable (found on the map: its pushes still arrive and open "Not
    here").
- **You** [13].
  - A Workspaces group: switch, Join with a link.
  - "Notify me on this phone" for each workspace: it registers or withdraws this phone's push token
    with that workspace's server.
  - "Sign out of {workspace}" leaves the others.
- **Pushes** [12].
  - Every push the server sends gains `data.device_id`. The four notifiers already know the device
    they send to.
  - A tap on a push for a workspace not in front switches to it first, then routes.
  - The decision queue (`push/queue.ts`) gains a `device_id` column, so a lock-screen Approve is
    sent to the right server.
  - The badge sums what waits across workspaces.
  - Every workspace is registered with the same Expo token and seal key. That is how it works today
    for the one.
- **Phone-wide things made per device.**
  - Drafts: `forgetDrafts` clears only the workspace signed out of.
  - `landIn`: carries the device.
  - Kept files: cleared only when no device is left.
  - Setup card: already keyed by device.

**Tests:**

- Provider: several devices, switch, end with one left, end with none.
- `responseTo` with `device_id`; the queue with a device; JoinSheet's alongside branch; the
  switcher; You's group.
- Core: `joinAlongsideAsking` for the phone.
- Server: each notifier's payload carries `device_id`.
- A simulator walk on two scratch servers: Meera's Chips, Arjun's link, both kept, switch, a push
  from the one behind.

## Phase 5: people's messages reach the phone (ADR 0198)

*Built 18 October 2026, as [ADR 0198](../decisions/0198-peoples-messages-reach-the-phone.md)
says. Changed from this plan:*

- *One notifier, `notify-message.ts`, replaces the agent-@ one rather than sitting beside it, so
  there is nothing to dedupe: one rule decides who hears a message, an agent's or a person's.*
- *`spaces` is optional on the wire, and a save without it keeps what was saved, so an older app
  on another phone cannot wipe a person's rooms.*
- *An @'s fixed title stays "A message for you"; a room heard in full says "A new message".*
- *No per-space page on You: the room's own sheet is where it is chosen.*

Today a push comes for a decision, for an agent's @, for a join request, and for agents pausing.
A person's message never pushes (`notify-mention.ts:171`).

- **Settings.**
  - `notificationSettings` gains `spaces: Record<spaceId, "all" | "mentions" | "none">`. It's
    stored in the same JSON row, so there is no migration.
  - The default is `mentions` for everyone, which is today's behaviour, widened to a person's @.
- **The notifier.** `notify-message.ts`, on `message.post`, works out who to push:
  - each person in the room but the speaker whose level for that room is `all`;
  - and anyone the message @s, whoever wrote it.
  - It skips anybody the agent-@ push already reached (same message, same device).
  - It respects quiet hours, and seals the words to the phone as ADR 0158 does.
  - Claim key `message:<msg>`.
- **Phone.**
  - A room's level is set from its details sheet (a Notifications row) and from You's per-space
    page.
  - A guest's first question becomes "Hear when someone writes?". Yes turns on push and sets their
    one space to `all`.
- **Web:** nothing. Its banners come from what waits, not from messages.

**Tests:** the notifier's recipients for each level; dedupe against the agent-@ push; quiet hours;
the settings schema; the room sheet row; the first question.

## Left out, and why

- **Agents from another Chips in a space**: his call 5.
- **A browser holding two workspaces, or reaching his server from outside his network**: Phase 5
  of the people review (the relay carrying browsers), not this plan.
- **Threads for members**: neither app offers threads; the server still judges them by rule 13.
- **Where a harness runs**: Chips knows the owner, not the machine. The agent page says the owner.

## Acceptance

- A member is refused a new space by the server, and neither app offers one. An admin still can.
- A member sees Spend per job and can't change it; the owner can; the server agrees.
- A guest's Spaces, room details, Agents, agent page and You match the guest mock, apart from the
  "Belongs to" row.
- Paste on Welcome raises no question. The join card says the three things.
- Meera's phone keeps her own Chips when she joins his space. She switches from the top of Spaces,
  and a push from either opens the right one.
- A guest who says yes to "Hear when someone writes?" gets a push when Arjun writes in Japan trip.
