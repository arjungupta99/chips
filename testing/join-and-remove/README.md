# A person joins, and is removed

**Why.** [ADR 0034](../../docs/decisions/0034-people-join-by-invite-and-come-back-by-passkey.md)
(people join by an invite link with a role), [ADR 0111](../../docs/decisions/0111-a-person-takes-an-agent-out-of-a-room.md)
and the room sheet (ADR 0151) for taking somebody out of a room, and removing a person from the
workspace (the plan, [`join-and-remove-plan.md`](../../docs/proposals/join-and-remove-plan.md)).
Joining is the only way anybody but the owner gets in, and today a second person does it in
Safari on their phone, or in the Chips app since ADR 0164. Without this folder: a link that says nothing of who sent it, a name
two people share, a phone that gets the desktop crushed into 393 points, a room that vanishes
with no word of why, and somebody shown out who can sign straight back in with a passkey.

**Layer.** Web e2e at a desk and at a phone's width (A, automated), by hand on a scratch server
(B), live with a real person (C, Arjun's word only). The phone app's own screens for this (the
welcome, a room taken from you, a person's row swiped to Remove and the page that asks, Leave,
"You're no longer in Demo", since Phase 1 People, a person's page and Invite someone, and since
Phase 2 the join card and sheets) are its Jest tests in `apps/mobile/src/spaces/`,
`apps/mobile/src/people/` and `apps/mobile/src/pairing/Join.test.tsx`; its web target cannot
swipe, so they are not here. The phone joining is walked on a simulator (below, 14 Oct 2026
Phase 2).
**Cost.** None for A and B; C costs nothing unless an agent in the room answers.

Findings take the prefix **JR**; they are listed [below](#findings), and
[`../findings.md`](../findings.md) points here.

## What is here

| File | What it holds |
| --- | --- |
| [`playwright.config.ts`](playwright.config.ts) | The web suite's servers (relay, dev-mode `chipsd` on a throwaway database, the web app under Vite) on this folder's ports; projects `desk` and `phone` |
| [`ports.ts`](ports.ts) | 4792, 4793, 5594, 5595, 5596 and the push sink's 5597, unless the `CHIPS_E2E_*` variables say otherwise |
| [`push-sink.mjs`](push-sink.mjs) | A push service in Expo's place (`CHIPS_PUSH_URL`): answers each push with a ticket and keeps it, so a spec can say whose phone a message pushed |
| [`support.ts`](support.ts) | The owner (Arjun) at a desk, an invite from You, somebody joining by it, unique names and addresses, a room per test |
| [`wire.ts`](wire.ts) | People on the wire: a device paired by a code or an invite, signed requests, a socket by ticket, rooms, messages, memberships, push tokens and what the sink got |
| [`join.spec.ts`](join.spec.ts) | Joining: the link, the card, the welcome, refusals |
| [`rooms.spec.ts`](rooms.spec.ts) | In and out of a room |
| [`remove.spec.ts`](remove.spec.ts) | Out of the workspace (ADR 0160) |
| [`room-links.spec.ts`](room-links.spec.ts) | A link into a room (ADR 0168) |
| [`a-shared-room.spec.ts`](a-shared-room.spec.ts) | Foodie in the browser: the field, a message for a person, the agent's answer; SH-1 over a stalled link |
| [`roles.spec.ts`](roles.spec.ts) | What each role is offered on the web: the +, Spend, Lead (ADR 0196) |
| `*.wire.spec.ts` | Every flow at its edges on the wire, at the desk only: [`invites`](invites.wire.spec.ts), [`join-requests`](join-requests.wire.spec.ts), [`new-phone`](new-phone.wire.spec.ts), [`shared-rooms`](shared-rooms.wire.spec.ts), [`removal`](removal.wire.spec.ts), [`roles`](roles.wire.spec.ts) ([the scenario](../scenarios/people/every-second-person-flow.md) maps each edge case to its test) |

The specs import Playwright through [`apps/web/e2e/playwright.ts`](../../apps/web/e2e/playwright.ts)
and the web suite's helpers through `apps/web/e2e/support.ts`: nothing above `apps/web` has
`@playwright/test`, so this folder installs nothing of its own. They are type-checked with the web
app (`apps/web/tsconfig.json` includes them) and linted by Biome with every e2e folder.

## Set-up

- **A.** Its ports free (`lsof -nP -iTCP:4792 -iTCP:4793 -iTCP:5594 -iTCP:5597 -sTCP:LISTEN` says nothing)
  and no heavy suite running ([`../README.md`](../README.md#the-rules)). In a fresh worktree,
  `pnpm install --frozen-lockfile` first.
- **B.** A [scratch server](../scratch-server.md) from nothing, and the web app against it
  (`CHIPS_TARGET=http://127.0.0.1:<port> pnpm exec vite --port <port>` from `apps/web`). One
  browser holds two people: the owner at `127.0.0.1`, everyone invited at `localhost`.
- **C.** His word. The person has a browser and is on the tailnet; nothing here pairs a test device
  to 4431.

## Steps

**A. Automated**, from the repo root:

```bash
pnpm e2e:people                    # both projects
pnpm e2e:people --project=phone    # joiners at an iPhone's width only
pnpm e2e:people join.spec.ts       # one spec
pnpm e2e:people --project=desk '.wire.spec.ts'   # the wire's specs alone, in seconds
```

The wire's specs (`*.wire.spec.ts`) play each person's device themselves (`wire.ts`): the owner by
a dev code, everyone else by a real invite, each from an address of their own, so the limits on
wrong answers never meet. They say what the server answered each person at each step, edge cases
included; [`../scenarios/people/every-second-person-flow.md`](../scenarios/people/every-second-person-flow.md)
lists them flow by flow. The table below is the browser's.

| Spec | Test | Checked (and the finding it holds) |
| --- | --- | --- |
| join | A member joins by a single-use link, and the link is spent | "Join Demo", "Arjun invited you … as a member" (JR-13); the name field focused (JR-14); the card inside a gutter (JR-12); the welcome: "You're in Demo", who, what next, and no **Create a space** for a member since ADR 0196 (JR-4); nothing wider than the window (JR-15); You says Member; the owner's People has her, "invited by You"; the link reopened: "This invite can't be used" (JR-3) |
| join | A guest joins, and is offered no space of their own | "as a guest"; no **Create a space** (JR-4); You says Guest |
| join | An open link lets two people in, and says how long it lasts | "until" a date, never "until now" (JR-2); "used 2 times" |
| join | A link lasts 30 minutes and says so, and says what the role may do | Guest's words under the role; no **Invite lasts** to choose (ADR 0232); "after 30 minutes" under Used; "until" on the link |
| join | A name somebody here has is refused, and the link is not spent | Another case of the same name refused with "Somebody here goes by … already" (JR-1); the same link then lets another name in |
| join | A withdrawn link says it can't be used | **Withdraw** beside the link just shown; the row goes; the link: "This invite can't be used" |
| join | On an iPhone, the join page offers to open the invite in the Chips app | Safari's user agent: "Have the Chips app? Open the invite there."; **Open in Chips** is `chips://join?` with the token and the page's origin as `lan` (ADR 0164); the card still works in the browser, name focused |
| join | A browser already in Demo that opens a link to Demo says so, and leaves the link unused | The owner's own tab given the link: "You're already in Demo", "As Arjun, on this browser. The link stays unused"; **Open Demo** closes it; the hash is cleared |
| rooms | Added to a room, she sees it at once, the room says so, and both talk | The room opens on her screen with no reload; "You added …" and "Arjun added you" (JR-5); words both ways; the composer whole at a phone's width (JR-15) |
| rooms | Taken out of a room, she is told by whom, and the room says so | **Remove** asks first ("Take … out of …?", Phase 1); "You removed …" (JR-5); on her screen "Arjun removed you from …" where the room was, until OK (JR-6); then the welcome |
| rooms | Added back, she finds the room whole | The notice goes by itself; the room's name, what was said before she went and while she was out, and again after a reload (JR-16) |
| rooms | She leaves a room, and the room says so | `/leave`; no notice for her; "… left" on the owner's |
| rooms | She leaves from the room's sheet, after it asks | The owner's sheet has **Hide** and no **Leave** (ADR 0204's addendum); **Leave** on hers; "Leave …?"; the welcome; "… left" on the owner's |
| rooms | A guest is offered no Add in their room, and may leave it | No Add on the guest's sheet; Leave there; "Guest" on their row, theirs and the owner's |
| rooms | Only the room's owner and the workspace's admins are offered Remove | A member sees no Remove on anyone; the owner sees it on both |
| remove | Removed, she is told in every tab, the rooms say so, and her way back is closed | **Remove…** in her row, opened (ADR 0209); the dialog: "Remove … from Demo?", signed out everywhere, her harness "becomes yours", the way back; **Remove**; her row goes. Both her tabs: "You're no longer in Demo" (JR-10), and again after a reload. The room: "… was removed from the workspace by you", her words still under her name. **OK**: the welcome (ADR 0213), and under **Set up my own Chips** "Pair this browser", never "does not know this browser" |
| remove | Her name is free, and a new invite makes a new person who starts with nothing | The same name joins again by a new link; a new id, the welcome, none of her old rooms |
| room-links | A guest joins by a room's link and lands in the room, which says whose link | The owner's room sheet: **Add → Invite someone new**, Guest, the link "into" the room. The card: "Join *room*", "Arjun invited you to *room* in Demo as a guest", what a guest of it may do. Joined: the room itself, not the welcome; "You joined by Arjun's link" and "… joined by your link"; Guest in People; no Add on her sheet |
| room-links | Somebody already in Demo is asked, let into the room, and the link stays unused | A member's own tab given a room's link: "Join *room*?", "You're in Demo as …, so it adds you to *room*"; **Join** opens the room; "… joined by your link" on the owner's. The same link then lets the person it was made for in, into the room |
| room-links | A room's link goes with its room | You's open links say "into *room*"; the room archived, the link: "This invite can't be used", and gone from You's list |
| a-shared-room | Foodie: her field lists the agent, the owner and Everyone; for the owner no agent takes a turn, and for the agent it answers on both screens | "To *agent*"; the list: the agent, Arjun, Everyone; Arjun picked: `message.overheard` at the harness, "Went to Arjun"; the agent picked: `message.new` from her as a member, its answer on both screens (ADR 0204, Foodie) |
| a-shared-room | Taken out while the owner's link has stalled | Every frame of the owner's tunnel held: **Take out**, and her row leaves his sheet within 1.5 s with nothing heard; let go, "You removed …" once, and her notice (SH-1) |
| roles | The + is an owner's and an admin's; Spend opens for the owner alone, a member is told who sets it, a guest sees none; a guest's Lead opens nothing | **Create new space** for the admin, not the member or the guest; Spend a button for the owner, a tile saying "Arjun sets it" for the member, absent for the guest; Lead a button for the member, a tile for the guest; no Add for the guest (ADR 0196) |
| remove | Remove… is an owner's or an admin's, never on yourself, and never an admin's on an owner | Each row opened (ADR 0209). The owner: on the admin and the member, not on themselves. The admin: on the member, not on the owner, not on themselves, and no Invite someone (only an owner invites). A member: no People at all |

**B. By hand, on a scratch server.** Pair the owner at `127.0.0.1`; You → name "Arjun". Then, in a
second tab at `localhost` with the viewport at 393 × 852 (the built-in browser's
`resize_window`), and again at a desk's width:

1. **You → Invite someone**: Member, Once, **Make a link**. The link, and "until" a date.
2. The invitee opens it: the card in a gutter, "Arjun invited you to Demo as a member", the
   cursor in the name field. Type a name and press Enter.
3. The welcome. Open the menu: You, Devices, the name.
4. The owner adds her to a room from its sheet (**Add agents or people** → People → her). Her phone opens
   the room; both rooms say who added whom. Talk both ways.
5. The owner takes her out from the sheet (**Remove** on her row, then **Take out**). Her screen
   says so; **OK**.
6. The same link in a third browser: "This invite can't be used".
7. The owner adds her back: the room is whole, with what was said while she was out.
8. **You → People**, her row opened, **Remove…**. Read the dialog; **Remove**. Her tab: "You're no longer
   in Demo"; reload it, the same; **OK**: the pairing screen. The room says she was removed.
9. A new link, her name again: a new person, welcomed, in no room.
10. Look at every screen at the phone's width for anything cut off, overlapping or scrolling
    sideways; each one is a finding.
11. Kill the server by its PID; remove the scratch directory.

**C. Live, with a real person** (his word): [`../scenarios/people/a-second-person.md`](../scenarios/people/a-second-person.md)
part C, then the same with her taken out of the room.

## Pass

- [ ] **A.** Every test passed in both projects.
- [ ] **B.** Steps 1–10 as written; no screen at 393 points scrolls sideways or cuts anything off.
- [ ] **C.** Her words reach the room under her name; taken out, she is told by whom; removed from
  the workspace, every screen of hers says so, and her phone's Spaces too.

## Findings

From the baseline run, the walks on 14, 15 and 18 Oct 2026, and the edge-case suite of 20 Oct. JR-1 to JR-24 are fixed.

| # | What | Fix |
| --- | --- | --- |
| JR-1 | Joining took a name somebody here had: two "Priya Nair"s, and an @ that could not tell them apart | `6cb32555`: refused before the link is spent, "Somebody here goes by … already", the field kept |
| JR-2 | A link good for a week read "until now" | `6cb32555`: "until October 21" |
| JR-3 | A dead link greyed the form with one red line | `6cb32555`: "This invite can't be used", what to do, the code as the other way in |
| JR-4 | A new person landed on "No spaces yet" with Create a space, a guest too | `6cb32555`: the welcome, who and as what; Create only for those who may |
| JR-5 | A room said nothing when a person came or went | `a81401d9`: "You added …", "Arjun added you", "… left", "… was removed from the workspace by …" |
| JR-6 | A room taken from you vanished (web) or said "not on this phone" | `a81401d9`: "You're no longer in …", by whom, until OK, on web and phone |
| JR-7 | The phone's room sheet could not remove a person | `a81401d9`: their row swipes to Remove, for whoever may |
| JR-8 | A passkey or a code minted before a withdrawal let a person back in | `23d48c5a`: the door refuses a removed person whatever they hold |
| JR-9 | A socket kept the role its ticket was minted with | `a81401d9`: each event goes to the door with the role as it is now |
| JR-10 | Somebody shown out was told to pair again | `23d48c5a`: "You're no longer in Demo", and OK |
| JR-11 | Docs sent people to a Members panel that no longer exists | `a81401d9` |
| JR-12 | The join card touched the screen's edges on a phone | `6cb32555` |
| JR-13 | The card did not say who sent the link | `6cb32555`: "Arjun invited you to Demo as a member" |
| JR-14 | The name field was not focused | `6cb32555` |
| JR-15 | The web app had no phone layout | `6cb32555`: one pane under 640 px, the rail behind a menu |
| JR-16 | Added back to a room, a person found it empty and nameless, even after a reload | `5a13c48a`: the room is put away, not dropped, and comes back whole |
| JR-17 | A first person who never named themselves is "You" (what `chips serve` calls them), so whoever they invited read "You invited you" on the card and the welcome | Leaving the default name out: the card says "You have been invited", the welcome "You were invited as a member"; You asks an unnamed owner for a name before they invite (`FIRST_PERSON_NAME`) |
| JR-18 | A link opened in a tab already on the pairing screen did nothing: only the hash changed, so nothing loaded | The pairing screen hears `hashchange` and opens the link |
| JR-19 | On the phone, a room's link to the room on screen stacked it twice: **Open** pushed the room again, so Back showed the same room (walk, 15 Oct) | The join route goes back to the room under the sheet (`dismissTo`), or puts it in the sheet's place; only a wide screen hands it to Spaces (ADR 0168) |
| JR-20 | Joining another workspace alongside, under a name somebody there goes by, left the phone's "Join … too?" sheet (and the web and Mac dialog) at a red refusal with no way on (ADR 0197's walk, 18 Oct) | The refusal is named (`name_taken`); the sheet and the dialog ask for another name in a field holding the one tried, on the same link (ADR 0197's addendum) |
| JR-21 | A phone allowed under **Pair it as** as Natalie, collecting after she had been taken out, was told "denied" and then, asked again, "It was used already", though nothing was paired: the request was spent before whom it pairs as was asked (every-second-person run, 20 Oct) | `join.ts` asks before it spends: denied every time, nothing spent (`join.test.ts`, `join-requests.wire.spec.ts`) |
| JR-22 | NP-1's "You (you)" was fixed under Pair it as only: the phone's People list and an unnamed owner's own page still said it (20 Oct) | Core's `selfLabel` for all three (`people.test.ts`, the phone's `People.test.tsx`) |
| JR-23 | An admin in a room could take the workspace's owner out of it, and his agents then stopped answering there (20 Oct) | His call, "refuse an admin taking the owner out of a room": only an owner takes an owner out (`refuseOwnerOut`, core's `mayRemoveMember`; ADR 0034's addendum; `authorize.test.ts`, `submit-event.test.ts`, `rooms.test.ts`, the phone's `RoomSheet.test.tsx`, `shared-rooms.wire.spec.ts`) |
| JR-24 | A guest whose one room was archived could be put in no other room (20 Oct) | His call, "count only open rooms for a guest": `spaceCountFor`, `guest_of`, a room's link and core's `spaceLinkAsking` count open rooms, and an archived room is not unarchived while its guest is in another (`refuseReopening`; ADR 0034's addendum; the routes' and use case's `invites.test.ts`, `people.test.ts`, `shared-rooms.wire.spec.ts`) |

## Runs

### 20 Oct 2026 — JR-23 and JR-24 fixed, his calls (A: 83 passed)

- His words: "JR-23: refuse an admin taking the owner out of a room. JR-24: count only open rooms
  for a guest." Shared rooms gains the admin refused on the owner, and a guest moved from an
  archived trip to Foodie, the trip opening again only once she is out. Each fix reverted once: the
  two wire tests and the unit tests named under Findings failed; restored, they pass.

### 20 Oct 2026 — every flow with a second person, at its edges (A: 82 passed; JR-21 to JR-24)

- New: `wire.ts` and six `*.wire.spec.ts` (invites 8, join requests 7, new phone 5, shared rooms 6,
  removal 4, roles 4), the push sink, `a-shared-room.spec.ts` (2) and `roles.spec.ts` (1); the
  owner's missing Leave added to rooms' Leave test. [The scenario](../scenarios/people/every-second-person-flow.md)
  maps each edge case to its test.
- Each of 19 October's fixes reverted once, locally: the tests named in the scenario failed, and
  passed again restored.
- Found: JR-21 and JR-22, fixed with tests; JR-23 and JR-24, his call.
- Run on top of ADR 0207 (`eb308514`, an invite link is the relay's page) and of `f574a0c2`, which
  sends the suite's links through the web suite's `openInvite`: 82 passed.

### 18 Oct 2026 — a name taken in the workspace joined (JR-20; phone walked)

- The phone, a Release build of the rebased branch on a simulator of its own, against two scratch
  servers: Bakehouse, and Arjun's workspace, where a Meera was already in (`/v1/dev/people`); each
  owner's link was made by a script signing through the door.
- Bakehouse's link on a phone in no workspace: the card refused "You" with "Somebody here goes by
  You already.", the name kept in the field; "Meera" joined on the same one-use link.
- Arjun's link on that phone: "Join Arjun's workspace too?", "You join as Meera". **Join** was
  refused, and the sheet showed "The name Meera is taken in Arjun's workspace. Join under another
  one." over a field holding "Meera", the cursor at its end. With the software keys up the sheet
  rode above them, field and buttons in view. " Shah" and Return joined as Meera Shah on the same
  one-use link, Bakehouse kept.
- Not walked: the web and Mac dialog (its test drives the refusal, the field, Enter and a blank
  name), Android, iPad.

### 15 Oct 2026 — Phase 3 of the people review, a link into a room (A: 42 passed; phone walked)

- `pnpm e2e:people`: join 16, rooms 14, remove 6, room-links 6, both projects.
- The phone, the Phase 2 Release build with the branch's bundle swapped in, on a simulator of its
  own, against two scratch servers (Studio, where the phone was the owner, and Demo, whose owner
  made links by a script as "Arjun"):
  - Studio's PO-4471: the sheet's Add ends with **Invite someone new**. Its page reads "joins
    Studio, and lands in PO-4471", Guest first. **Make a link** shows "Guest · once · until
    October 22 · into PO-4471".
  - Demo's guest link: "Arjun invited you to PO-4471 in Demo as a guest", "Join Demo?". **Sign out
    of Studio and join** lands in PO-4471, which says "You joined by Arjun's link".
  - A second link to it: "You're already in PO-4471", **Open PO-4471**. Found: from inside the
    room it stacked the room again (JR-19). Fixed and walked again: from the room and from Spaces,
    one Back is Spaces.

### 14 Oct 2026 — Phase 2 of the people review (A: 36 passed; phone walked on a simulator)

- `pnpm e2e:people`: join 16, rooms 14, remove 6, both projects (one rooms test failed once under
  load, then passed alone and on a full re-run). join again after the last lint changes: 16 passed.
- The phone, a Release build on a simulator of its own with the branch's bundle, against three
  scratch servers (Demo, Acme, Studio), each link opened by `xcrun simctl openurl … chips://join?…`:
  - **Welcome to Chips**: Paste asks iOS once, then opens the card.
  - A spent link: "This invite can't be used", Paste another link.
  - A good link: the card, the name focused, Join, "You're in Acme".
  - In Acme, a link to Acme: "You're already in Acme" over Spaces; Open Acme closes it.
  - In Acme, a link to Studio: "Join Studio?" as the mock has it; **Sign out of Acme and join**
    lands on "You're in Studio". Acme's server has the phone's device revoked, and Studio has the
    new one.
  - Found on the way, fixed before this run: the swap of devices remounted the stack, so `/join`
    came back as a sheet for Studio and asked about the spent link ("This invite can't be used").
    Now the sheet closes first, then the old device goes, then the new workspace opens, and a
    route opened again with a link it has joined goes to Spaces.

### 14 Oct 2026 — Phase 1 of the people review (A: 32 passed)

- `pnpm e2e:people`: join 12, rooms 14, remove 6, both projects, after the Phase 1 changes (only an
  owner invites; Remove and Leave on a room's sheet ask first; a guest has no Add; a link lasts a
  day, a week or a month). The web suite's `people`, `group`, `outsider` and `remove` specs pass
  too (4), on this folder's ports.

### 14 Oct 2026 02:20 — B, the finished thing, by hand

- Scratch server at the branch's head, the owner at a desk, Priya at 393 × 852. People shows
  **Remove…** in her opened row only; the dialog reads as written; **Remove**; her row goes, the room's
  last line is "Priya Nair was removed from the workspace by you", her words stay under her name.
  Her tab: "You're no longer in Demo", again after a reload; **OK**: "Pair this browser" with no
  error. Found JR-17 (the scratch owner was still "You") and JR-18 (a new link pasted into that
  tab did nothing); both fixed, and the link then opened "Arjun invited you to Demo as a member."
  OK was made the primary button.

### 14 Oct 2026 01:45 — after the fixes (A: 26 passed)

- `pnpm e2e:people`: join 10, rooms 10, remove 6, both projects, on the branch at `23d48c5a`.
  The web suite's `people`, `group` and `outsider` specs pass too (3), on this folder's ports.
- Unit: server 2378, core 971, web 495, phone 777; the JR-9 probe is a gateway test now.

### 14 Oct 2026 00:40 — baseline, before the fixes (A: 2 passed, 16 failed)

- Branch `claude/chips-join-remove-e2e-tests-0a9b10` on main `60413496`, the specs written to what
  the plan says a person should meet. Every failure is a finding: JR-1 (a taken name joins),
  JR-2 ("until now"), JR-3 (no dead-link screen), JR-4 (no welcome; a guest offered Create),
  JR-5 (no line in the room), JR-13 (who invited), plus the withdrawn link's missing **Withdraw**
  beside the link just made. The two that passed: who is offered Remove.
- B, the same evening, found JR-12 to JR-15: the card has no gutter on a phone, does not say who
  sent the link, does not focus the name, and the whole app has no phone layout (the 640 px rule
  loses to `.shell[data-panel]`, and hiding the sidebar alone would leave no way back).
