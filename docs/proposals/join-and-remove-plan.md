# A person joins, and is removed: plan

14 October 2026. Arjun's ask: "build E2E testing for another user (users) joining my Chips space,
and then being removed. Tests go under Chips/testing, in a separate subfolder. I need this
capability, joining experience to be highly polished and functional."

So this plan has three parts:

1. **The tests**, in `testing/join-and-remove/`: Playwright specs for the web (and the Mac, which
   is the web app), specs for the phone's web target, and the by-hand and live runbook beside them.
2. **The missing capability**: removing a person from the workspace is not built
   ([ADR 0034](../decisions/0034-people-join-by-invite-and-come-back-by-passkey.md), open
   questions). Today an owner can only withdraw devices, and cannot even list somebody else's.
3. **The polish**: the rough edges in joining and in being taken out of a room, which the
   research below found and the tests will hold.

## 1. What is there today (research, 14 October 2026)

**Joining** works end to end and has a spec ([`people.spec.ts`](../../apps/web/e2e/people.spec.ts)):
You → Invite someone (role, Once or Many times) → a link `…/#invite=chips_inv_…` → the invitee's
browser shows "Join Demo", asks a name, **Join** → paired, a person with that role, on "No spaces
yet". A room's owner (or a workspace owner or admin) adds them from the room sheet's Add page.

**Taken out of a room** works on the web (a Remove button on a person's row in the room sheet,
`room/parts.tsx`) and by `/remove @name` and `/leave`. Not on the phone's room sheet.

**Taken out of the workspace**: not built. What an owner can do today is withdraw devices
(`DELETE /v1/devices/:id`), but `GET /v1/devices` lists only the caller's own, so no screen can
find another person's devices.

**What the research found wrong or missing** (each becomes a finding, prefix `JR`):

| Id | Where | What a person meets |
| --- | --- | --- |
| JR-1 | Server, join | Joining takes a name somebody here already has: two "Priya Nair"s, and an @ that cannot tell them apart. Renaming refuses it (ADR 0082); joining does not check (`join-workspace.ts`). |
| JR-2 | Web, You → Invites | A link good for a week reads "until now": `relativeTime` clamps every future time to "now" (`apps/web/src/app/time.ts`). |
| JR-3 | Web, the join screen | A spent, withdrawn or expired link leaves the heading on "An invite", the name field greyed out, and one red line, "That invite is not valid.", with no word on what to do. (One answer for all three is deliberate, so the screen cannot be an oracle; the words can still help.) |
| JR-4 | Web, after joining | A new person lands on "No spaces yet" with **Create a space**, which a guest may not do, and nothing says who let them in or that a room will appear when somebody adds them. |
| JR-5 | Core, rooms | A room says nothing when a person is added, taken out or leaves; only agents get a line. The others just see the count change. |
| JR-6 | Web and phone, a room taken from you | The web silently jumps to another room; the phone's room turns into "This space is not on this phone. It may not have replayed yet." Nobody is told they were taken out, or by whom. |
| JR-7 | Phone, room sheet | A person's row cannot be removed (an agent's can, by swipe); ADR 0111 left it for later. |
| JR-8 | Server, passkeys and codes | A passkey sign-in pairs a new device for a person whatever happened to their devices (`passkeys.ts` `pairFor` checks only that the row exists), and a pairing code minted before a withdrawal still pairs after it. Withdrawing every device does not keep somebody out. |
| JR-9 | Server, sockets | A socket keeps the role its ticket was minted with (`socket-tickets.ts`): a person made a guest, or an admin made a member, may keep their old rights over a socket that stays open. To be probed first; fixed if real. |
| JR-10 | Web and phone, a removed device | A browser whose device was withdrawn goes to "Pair this browser" with "This server does not know this browser. Pair it again." A person who was removed would be told to pair again, which cannot work. |
| JR-11 | Docs | `a-second-person.md` (B6, C4, PP-2) and ADR 0111 still say "Members → Add someone…", a panel that no longer exists. |

Found by the walk on a scratch server (14 October 2026, built-in browser, the owner at desktop
width and the invitee at 375 × 812, as Safari on an iPhone):

| Id | Where | What a person meets |
| --- | --- | --- |
| JR-12 | Web, the join and pairing card | At a phone's width the card touches both edges of the screen: no gutter. |
| JR-13 | Web, the join card | It says which workspace and as what, not who asked them: "Join Demo", never "Arjun invited you". |
| JR-14 | Web, the join card | The name field is not focused on arrival; the one thing to do needs a tap first. |
| JR-15 | Web, everything after joining | **The web app has no phone layout.** The 640 px rule that hides the sidebar loses to `.shell[data-panel="false"]` (higher specificity) and to `.side`'s own `display`, so a phone gets the desktop's two columns: a 260 px sidebar and a crushed room ("Create a space" wraps to three lines, the composer is cut off). Hiding the sidebar alone would leave no way back to it. Today a second person's phone *is* the web app. |
| JR-16 | Core, a room added back to | **A person taken out of a room and added back finds it empty**: titled with the owner's name, "1 member", "Nobody's here yet", even after a reload. Core's fold dropped the room on the leaving (`forget`), the store still counted its opening as seen (so it read nothing again), and every replay passed the leaving on its way to the return. |

## 2. Removing a person from the workspace (ADR 0160)

Modelled on removing a harness ([ADR 0078](../decisions/0078-a-harness-can-be-removed-and-its-history-keeps-its-name.md)),
which has the same shape: the registry is the truth, the log says so, the door keeps them out.

**The route.** `DELETE /v1/people/:id`, for a workspace owner or admin. Refused:
- for an admin removing an owner (the rank rule devices and roles already keep);
- for the last owner;
- for yourself (leaving a workspace is not in this plan: an owner who wants out hands it on first);
- for a harness or an agent (they have their own routes).

**What it does, in order** (one use case, `remove-person.ts`):
1. **The registry marks them removed**: `participants.removed_at`, which exists already
   (migration 0029, harnesses). No migration.
2. **Every way back in is closed**: every device of theirs withdrawn (with its push token), every
   passkey of theirs deleted, every pairing code they minted dropped, and every open invite they
   made withdrawn. And the door checks too, in case anything outlived step 2: the authenticator
   refuses a device of a removed person (`person_removed`, 401), and a code or a passkey never
   pairs a device for one.
3. **Harnesses they own are handed to the person removing them**, each by the existing
   `harness.transferred`, so approvals and tokens keep a living owner. The confirm says so first.
4. **Every room they are in says so**: one `membership.removed` per room, with
   `reason: "person_removed"` and `removed_by`, so the members' screens update the way any removal
   does, and each room shows a line.
5. **`person.removed` goes in the log**: who, what they were called then, who removed them, the
   rooms they left and the harnesses handed on. Only Chips writes it; everyone in the workspace
   is sent it, as `harness.removed`.
6. **Their sockets close** with a code of their own (4003 `person_removed`, beside 4001
   `device_revoked`) so their screen can say what happened rather than "pair again".

A second `DELETE` records nothing and answers `already_removed: true`, still withdrawing anything
somehow live.

**What stays.** Their words, under their name, in every room. `GET /v1/participants` still lists
them with `removed_at` (as a removed harness), so history reads the same; the People list, the
Add page and every picker leave them out (core's `addableTo` already leaves out anything with
`removedAt`). Their name is free again: a new invite makes a **new person**, who may take the
same name (JR-1's check ignores removed people) and sees none of what came before.

**Who sees what.**

| Who | Where | What |
| --- | --- | --- |
| The owner or admin | Web and Mac, You → People | **Remove…** on a person's row (only where the rule allows). A confirm: "Remove Priya Nair from Demo?", then what happens (signed out everywhere now, out of N spaces, Ledger becomes yours, what she said stays, a new invite is the only way back), **Keep** / **Remove**. The row goes. |
| Everyone else in a room she was in | Web, Mac, phone | A line: "Priya Nair was removed from Demo by Arjun". The member count drops. |
| The removed person | Web and Mac | Every open tab, within a second or two: "You're no longer in Demo", "Arjun removed you on 14 October. What you said there stays. To come back, ask for a new invite." One button, **OK**, which forgets this browser's key and goes to the pairing screen (or, with several workspaces paired, to the next one). |
| The removed person | Phone | The same words on the Spaces list (in place of "This phone isn't paired anymore") and in the connection sheet, with **Forget Demo**. |
| Not on the phone | | Removing somebody from the workspace, as inviting them, stays on the computer: the phone has no People list (You.tsx's own rule). |

**Protocol, server, core, apps: the files.** Protocol: `person.removed` in `events/workspace.ts`,
its fixture, the catalogue test, `pnpm gen:protocol` (schemas, generated types, docs reference).
Server: `remove-person.ts`, the people registry's `markRemoved`, devices/passkeys/invites/codes
"of a person" methods, the hub's `closeParticipant`, the authenticator's check, pairing's and the
passkey assertion's checks, the route and its row in `authorization-matrix.test.ts`, the
projection (`workspace_members` row deleted), `replay.test.ts`. Core: the fold (`removedAt` on the
person), `REREAD_DIRECTORY`, `mayRemovePerson` and the confirm's words (beside `removal.ts`), the
store's `removePerson`, and a terminal `removed` connection state carrying the server's sentence.
Web: People row, confirm, the removed screen. Phone: the removed words in `NoRooms` and
`Connection`. Docs: ADR 0160 (ADR 0034's open question answered there), `operate/people.md`,
`reference/http.md`, `server/README.md`.

## 3. The polish (Phases 1 and 2 below)

- **JR-1** Joining refuses a name somebody here has, before the invite is spent ("Somebody here
  goes by Priya Nair already."), and the join screen keeps the field for another try.
- **JR-2** An invite says how long it lasts: "until 21 Oct" (and "expired" once it has).
- **JR-3** A dead link gets a screen of its own: "This invite can't be used", "It was used
  already, withdrawn, or has expired. Ask whoever sent it for a new link.", and the pairing code
  as the other way in. Still one answer for all three.
- **JR-4** A new person lands on a welcome: "You're in Demo", who let them in and as what, "When
  somebody adds you to a space, it appears here." **Create a space** only for those who may (not
  a guest). Where a passkey can be made, one line offers it, so a lost browser is not a lost seat.
- **JR-5** Rooms get lines for people: "Arjun added Priya Nair", "Arjun took Priya Nair out",
  "Priya Nair left", "Priya Nair was removed from Demo by Arjun" (core's fold, as agents' lines;
  web and phone draw them already).
- **JR-6** A room taken from you says so: the web keeps a notice ("You're no longer in PO-4471",
  "Arjun removed you from PO-4471") where the room was, until OK; the phone's open room shows the
  same and OK goes back, instead of "not on this phone". Core keeps who and which room
  (`model.takenOut`), so both apps say the same words.
- **JR-7** The phone's room sheet: a person's row swipes to **Remove**, as an agent's does, for
  whoever `mayRemoveMember` allows.
- **JR-8** Closed by Phase 3's door checks.
- **JR-9** Probed with a server test (demote an admin, then send `role.changed` over the socket
  they already had). **It was real**: the demoted admin's promotion of Dana was acked. Fixed in
  the session, not the hub: each event a person sends over a socket goes to the door with their
  role as it stands now (one read), so no socket keeps rights its person has lost. Removal closes
  the sockets (Phase 3).
- **JR-10** Closed by the removed screen.
- **JR-11** The stale steps rewritten.
- **JR-16** A room the reader leaves is put away, not dropped: the fold keeps it out of sight
  with its threads and runs, and being added back brings it back as it was; a replay that passes
  the leaving keeps it; the store reads the room again on a live return for what was said while
  they were out.
- **JR-12, JR-13, JR-14** The join card: a gutter at a phone's width, "Arjun invited you to Demo
  as a member" (the peek answers with the inviter's name), the name field focused.
- **JR-15** A phone layout for the web app, the smallest that works: under 640 px one pane at a
  time. The sidebar is the first screen; choosing a room or a page shows it full width under a
  thin bar with a way back. Then each screen a joined person meets (the welcome, a room, its
  sheet, You) is checked at 375 px for anything cut off or overflowing.

Anything the by-hand walk (Phase 0) finds joins this list as JR-12 onward.

## 4. The tests: `testing/join-and-remove/`

A folder of its own, as asked. Playwright specs live there, not in `apps/web/e2e`; they run with
the web suite's servers through a config that extends `apps/web/playwright.config.ts`, and import
`@playwright/test` only through the web suite's helpers, so nothing new is installed.

```
testing/join-and-remove/
  README.md               the scenario: why, set-up, how to run, pass marks, runs (prefix JR)
  playwright.config.ts    the web suite's servers on this folder's own ports (5494, 5495, 4692, 4693)
  support.ts              people helpers: invite, join as, open You, People row, remove, two origins
  join.spec.ts            joining
  rooms.spec.ts           in and out of a room
  remove.spec.ts          out of the workspace
  phone/                  the phone's web target (its own config, extending apps/mobile's)
    room-sheet.spec.ts
    removed.spec.ts
```

Run: `pnpm e2e:people` (web) and `pnpm e2e:people:phone` (phone), from the root. Never beside
another heavy suite; the phone's shares the web suite's way of starting servers, so one at a time.

**The specs** (each test names the JR finding it holds):

| Spec | Test | Checked |
| --- | --- | --- |
| join | A member joins by a single-use link | "Join Demo", "as a member"; the welcome names who invited her; People lists her as Member, "invited by You"; the link is then dead (JR-3's screen) |
| join | A guest joins | "as a guest"; the welcome has no **Create a space** (JR-4); You says "Guest of Demo" |
| join | An open link lets two people in | Both join; the invite row says "used 2 times" and its expiry as a date (JR-2) |
| join | A name somebody has is refused | "Somebody here goes by … already"; the link still works for another name (JR-1) |
| join | A withdrawn link | **Withdraw** in You; the invitee's screen says it can't be used (JR-3) |
| rooms | Added to a room, she sees it and talks | The room appears with no reload; "You added Priya Nair" on both screens (JR-5); words both ways |
| rooms | Taken out of a room | Owner's Remove; her room goes with "You took … out" on her side as a notice (JR-6), a line on the owner's (JR-5); her composer is gone; the server refuses her events there |
| rooms | She leaves | `/leave`; "Priya Nair left" on the owner's screen |
| rooms | Only those allowed see Remove | A member who does not own the room sees no Remove on another person |
| remove | Removed from the workspace | Priya with two browsers, a passkey, an open invite of her own (an admin), a harness she owns, two rooms: the owner removes her; both her browsers show "You're no longer in Demo" within 3 s; People no longer lists her; both rooms say she was removed; the harness is the owner's; her invite is dead; her passkey signs nobody in; her old key gets 401 |
| remove | Who may | An admin sees no Remove on an owner (and the route says 403); nobody sees it on themselves; the last owner cannot be removed |
| remove | She comes back | A new invite; she joins as "Priya Nair" again, a new person, in no rooms, seeing nothing from before |
| remove | Twice | The route answers `already_removed` and records nothing |
| phone/room-sheet | A person's row swipes to Remove | The row goes; the room's line (JR-7, JR-5) |
| phone/removed | The phone of a removed person | "You're no longer in Demo" on Spaces; **Forget Demo** goes to pairing |

**Beside the code** (run by `pnpm check`, listed in the README with a command to run them alone):
the use case and the route (every refusal, the order of the steps, idempotence), the
authenticator, pairing and passkey refusals, the hub closing a participant's sockets, the
projection and replay, the fold and the lines, `mayRemovePerson`, the web's People row and removed
screen, the phone's room sheet and removed words, the JR-1 and JR-9 probes.

**By hand (B)** on a scratch server, in the built-in browser, at desktop width and at a phone's
(Safari on an iPhone is how a second person joins today): the whole story, looking for what a
spec cannot see. **Live (C)**, his word only: a real second person over Tailscale, then removed.

## 5. Phases

Each phase ends with its touched suites green, a commit on this branch, and the README's Runs
updated. Main is shared: before any fast-forward, `ListAgents` and main's reflog.

| Phase | What | Done when |
| --- | --- | --- |
| 0 | The folder, its config and helpers; `join.spec.ts` and `rooms.spec.ts` written against **today's** app; run them; the by-hand walk at both widths; findings recorded | The baseline run is recorded (some tests marked as the findings they hold); JR-12+ listed |
| 1 | Joining polished: JR-1, JR-2, JR-3, JR-4, JR-12 to JR-14; the phone layout, JR-15 | `join.spec.ts` green at desktop and phone widths; unit tests for each |
| 2 | Rooms polished: JR-5, JR-6, JR-7, the JR-9 probe (and its fix if real), JR-11 | `rooms.spec.ts` and `phone/room-sheet.spec.ts` green |
| 3 | Removal on the server and in core: ADR 0160, protocol, use case, door, route, fold | Server and core tests green; `pnpm check:protocol` clean |
| 4 | Removal in the apps: People row and confirm, the removed screens (web, Mac, phone) | `remove.spec.ts` and `phone/removed.spec.ts` green |
| 5 | The whole run: `pnpm check`, the folder's suites, the old `people`/`group`/`remove` specs; docs, findings, STATUS; a walk by hand of the finished thing with screenshots | All green, recorded in the README's Runs |
| Live | Fast-forward main, push, restart 4431, rebuild the web app, his iPhone and the Mac app; run C | **His word.** |

## 6. Decisions taken here (his to overturn)

1. **Removed means out of the workspace**, not only out of a room (that exists), with both tested.
2. **Their harnesses go to whoever removed them**, rather than refusing the removal until they
   are handed on.
3. **A removed person's words stay under their name**; they are left out of every list. Coming
   back is a new invite and a new person.
4. **Removing from the workspace asks first; taking out of a room does not** (as agents, ADR 0111),
   but now leaves a line.
5. **Removing somebody from the workspace is on the computer only**, as inviting them is. The
   phone shows a removed person what happened, and removes people from rooms.
6. **Leaving a workspace yourself** is not in this plan.

## 7. Built (14 October 2026)

On `claude/chips-join-remove-e2e-tests-0a9b10`: `177cebbd` (Phase 0), `5a13c48a` (JR-16),
`6cb32555` (Phase 1), `a81401d9` (Phase 2), `23d48c5a` (Phases 3 and 4), `6ac9e7c6` (docs),
`5052898f` (the walk's JR-17 and JR-18). Where it went otherwise than written above:

- **ADR 0160, not 0159.** Another session took 0159 on main while this was built.
- **No `phone/` Playwright specs.** The phone app's web target cannot swipe, and its screens for
  this are covered by its Jest tests: a person's row in the room sheet (JR-7), the room taken
  from you (JR-6), the welcome (JR-4), and the Spaces list when you were removed. Building the
  Expo web export for two specs that could not drive the gesture was not worth it on a nearly full
  disk.
- **`remove.spec.ts` runs in both projects**: the owner removes at a desk, and whoever is removed
  is wherever they joined from, a phone's width included.
- **The removed screen does not say who removed you or when.** The live close and the refusal
  at the next open would have to carry it, and the server keeps no `removed_by` beside
  `removed_at` without a migration. The words are the same either way: "You're no longer in
  Demo", "You were removed from it. What you said there stays where it was said. To come back,
  ask for a new invite."
- **JR-9 was real**, and is fixed in the socket session rather than the hub: each event a person
  sends is judged on their role as it is now.
- **Found on the way**: `dev.test.ts` added a second "Dana" to a workspace that has one, which
  JR-1 now refuses; the test uses another name.

