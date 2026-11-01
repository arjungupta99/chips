# The second security review's fixes, as a plan

This is the order the fixes of `docs/reviews/security-review-2026-10-25.md` are built in, with
Arjun's decisions of 25 October folded in. Phases 1 to 8 are live.

Each phase lands on its own: signed commits on main, `pnpm check` and the e2e suites green before
it lands, nothing pushed, restarted or redeployed until he says so. Where a phase changes what a
person sees, a phone-width mock comes first.

## Phase 1 · Run and Open happen only on the Mac where the server runs, for an owner (SEC-39)

**Live 25 October, 12:00 PDT, and pushed:** `34b19c15` (ADR 0231), `f81eed99` (server and core),
`f577e4de` (Chips for Mac and the web), `80cabf4f` (the phone), `354697d4` (the shell's commands).
4431 restarted, the web bundle rebuilt, Chips for Mac installed, phone build 202610251901 on
Arjun's iPhone. Run on Sudoku mini, pressed on the phone at 12:34, ran on the Mac mini.

The rule Arjun set: Universe's Run and Open work only on the Mac where the server runs, and only
for an owner. It applies to a press on the phone, in a browser and in Chips for Mac's own Desktop
tab. New ADR 0231 says the rule and amends 0225, 0226 and 0227.

- **Chips for Mac checks the server is its own, by key.** A new native command hands the shell
  the server this Mac runs (from `here::serving`): its loopback address and its key. The shell's
  `createFolders` (`apps/web/src/app/folders.ts`) takes a `folder.run` or `folder.open` only when
  the workspace's pinned server key equals that key, and drops it otherwise. The Desktop tab shows
  no Run or Open for any other workspace.
- **The native side never runs another server's project.** `project_folder` for run and open talks
  to the local server's loopback address it found itself, not to a server address handed in by the
  page, so a mistake in the shell cannot point it elsewhere.
- **The server checks the person is an owner.** It refuses a run or open ask from anyone else, and
  core's Universe rule hides Desktop for them. Your folder's copy and Download as zip stay for
  everybody; they run nothing.
- **Chips for Mac's commands are kept to its main window.** A Tauri capability names the main
  window and its origin, so a page frame can never reach `project_folder` or `run_here`, whatever
  is added later.
- Tests: a `folder.run` from a server that isn't this Mac's is ignored, and one from this Mac's
  runs; a member's ask is refused at the server; Universe shows no Desktop to a member.
- Live: 4431 restarted; web bundle, Chips for Mac and the phone built.

## Phase 2 · The relay stays up (SEC-41, SEC-17)

**Live 25 October, 13:18 PDT, and pushed:** `8deec616` (the relay's `pathOf` and its 400),
`cb0dfe3e` (`exitOnUncaught` in chipsd, the relay and the CLI's servers). The socket's receive
needed nothing: the hub already catches a frame's failure for its own session. The hosted relay
runs 0.0.0+462f3a40, and 4431 was restarted.

- One guarded "path of this request" helper for the relay's HTTP and upgrade handlers; a target
  `new URL` refuses is a 400.
- Process-level handlers in the relay and in chipsd that log and exit, so the service manager
  restarts a clean process; the socket server's `session.receive` gets a `.catch` that fails only
  that session.
- Test: `GET //` and a bad upgrade target answer 400 and the relay keeps serving.
- Live: the hosted relay redeployed; 4431 restarted.

## Phase 3 · A guest reads a project, and Run says who changed it (SEC-40)

**Live 25 October, 14:23 PDT, and pushed:** `b5802fd4` (the door and Undo), `c64c0077` (the run's
commit, the Run bar's words, and a guest's Your folder). ADR 0220 and 0226 have addenda. 4431
restarted, the web bundle rebuilt, Chips for Mac installed, phone build 202610252125.

- **Guests can't push.** The project door refuses `git-receive-pack` to a person whose workspace
  role or room role is guest, in words git shows ("A guest can read the project but can't change
  it. Ask an agent in the room."). Clone, fetch, viewing files and the zip still work. `undoRefused`
  reads both roles. Your folder's Send is hidden for a guest.
- **Members and their own agents keep pushing**, as ADR 0220 has it.
- **Run names who changed the files.** The commit last run is kept beside the command. When the
  project moved since, and any change in between was made by someone other than the person or the
  agents of their own harnesses, the Run bar says so: "changed by Dana", "changed by Dana's agent".
  It never refuses a run for it.
- Tests: a guest's fetch works and push is refused; a member's push works; a member who is a guest
  in that room is refused; Run's words for a change by somebody else, and none for one's own.
- Live: 4431 restarted; web, Mac and phone built.

## Phase 4 · Links ask before they let anyone in, and live 30 minutes (SEC-42)

**Live 25 October** (pushed `90711bfb..bdc3bb98`, 4431 restarted 16:49): ADR 0232 (`3b6803e0`), the server and
protocol (`74819485`), and the apps (`8237d3ca`, with its end-to-end specs in `35a97c1b`). His pick from the mocks
(`docs/proposals/allow-with-a-code-mocks.html`): "Go with A: the Allow sheet shows the code and I
compare. Six digits, inviter's phones only." "Phones" is read as the inviter's own devices, the
web and the Mac included, since a first phone paired from the Mac would have no phone to allow it.

New ADR 0232 says the rule and amends 0207 and 0210. Mocks first: the Allow sheet with its code,
and the joining screen showing its own.

- **An Allow with a matching code.** A pairing code or an invite handed out as a relay-page link —
  which, when a relay is configured, is every one, the QR included — no longer lets anyone in by
  itself. Using it makes a request that waits, like the join requests SEC-6 gave device joins.
  The device that made the code (for an invite, the inviter's devices) shows "Priya is asking to
  join Japan trip" with a short code made from the joining device's key; the joining device shows
  its own. They must match before Allow does anything, and until then the person sees nothing of
  the workspace.
- **Links live 30 minutes at most.** An invite's default and limit become 30 minutes
  (`DEFAULT_INVITE_TTL_SECONDS`, `MAX_INVITE_TTL_SECONDS`); Invite someone's Lasts choice goes
  (`INVITE_LASTS` in `packages/core/src/people.ts`), and its words say 30 minutes. The limit is
  checked when a link is used too, so invites made before the change stop. Pairing codes (15),
  harness join links (15) and join codes (10) already fit.
- **What stays is written down.** SECURITY.md and the ADRs say that a dishonest relay page can
  still send a person to another server dressed as this one, which only trusting the relay, or not
  opening links in its page, prevents.
- Tests: a redeemed link waits; a wrong code allows nothing; a link older than 30 minutes is
  refused at use; a QR join waits as a sent link does.
- Live: 4431 restarted; web, Mac and phone built.

## Phase 5 · The old signature is refused in a tunnel (ADR 0191)

**Live 25 October** (pushed `346aea33..7829c7c3`, 4431 restarted 17:57): `2052f51f` (the authenticator, its tests, ADR
0191's addendum, ADR 0006 and the HTTP reference). The live log holds the old-signature warning
once, for a Chips for Mac build since replaced, and never for a phone.

- The server refuses a four-line signature inside a tunnel, and the in-memory "signed v2" set goes.
  The plain port keeps the four-line form for the CLI on loopback and the browser.
- Before it goes live: every phone on a build from 18 October or later. Arjun's and Natalie's are
  on 24 October's.
- Live: 4431 restarted.

## Phase 6 · The tunnel's acks and two dependencies (SEC-43, SEC-44, SEC-45, SEC-20)

**Live 25 October** (pushed `7ef74723..98d2df29`; 4431 restarted 18:48, the hosted relay on Node 22.23.4 at 18:50): `eada5814` (the tunnel's pace, ADR 0153's
addendum), `be6b6f83` (markdown-it 15.0.3, zod 4.6.6), `126f2d7c` (Node 22.23.4), and `fa363bec`
(the relay bench, which Phase 5's refusal broke). The Foodie photos walk waits for his
phone, now that 4431 runs it.

- `mux.ts`'s pacing marks kept in a bounded ring; acks for answers that ended are ignored; a
  finished answer's count dropped after a while. Then the tunnel tests, a big page through the
  relay and the Foodie photos walk again, since this code fixed a deadlock on 24 October.
- `markdown-it` 15.0.3 and `zod` 4.6.6, both added to the lockfile guardrail; SEC-3's timing test
  gains the unclosed link reference. The protocol's generated schemas regenerated and the
  conformance kit run.
- Node bumped from 22.22.2 to the current 22 release.
- Live: 4431 restarted; the relay redeployed for Node; web, Mac and phone built.

## Phase 7 · The Lows

**Live 25 October** (pushed `d5dd25eb..6ccc6773`; 4431 restarted 20:20, the hosted relay 20:21): SEC-54 `dbd7a3c6`, SEC-12 `530a3560`, SEC-48
`33c3d4d4`, SEC-53 `201e5a65`, SEC-13 `8f5c6b78`, SEC-49 `7d6e52ec`, SEC-52 `2a83cc74`, SEC-29's
code half `a8e54f62`, SEC-46 `02dd5bdc`, SEC-55 `1d7d3ecf`, SEC-50 `150d7e9b`, SEC-51 `8272efa3`,
and `3ea8798e`, a file handle the blob store could leave to the collector, which Node 26 and
SEC-17's handler turned into a crash. Jacobian's halves of SEC-49 (`0c48cff`) and SEC-52 (`9090d69`)
live 25 October, 22:43 PDT.

One commit each: SEC-46 (`opens` tested on its last segment, again on the Mac, and part of the
compared command), SEC-48 (an agent's restore reopens only rooms its archive closed, and keeps the
guest rule), SEC-49 (a reply's quote says the author's standing; Jacobian's copy of those words
since), SEC-50 (the join link in `CHIPS_JOIN_LINK`, not argv), SEC-51 (the Connect sheet drawn
from the local cards), SEC-52 (the bridge fetches and pushes by URL, `core.fsmonitor` overridden),
SEC-53 (project page tickets for a person with a device, capped), SEC-54 (the relay tally capped),
SEC-55 (Open and View resolve links before opening). With them: SEC-29's code half (the phone shows
neutral words for a push it can't open; its Expo half, a token on both servers and Enhanced Security, live 26 October), SEC-12 (relay sessions capped per key and address,
generously, since a household shares one), SEC-13 (passkey challenges counted and capped).

## Phase 8 · Shared spaces and other people's agents say so

**Live 25 October** (pushed `83b8eb73..3221bff3`; web, Mac and phone built, no restart needed), `2d7284bc`
([ADR 0234](../decisions/0234-a-room-somebody-else-reads-says-shared-and-an-agent-says-whose.md)).
The mock is `shared-and-whose-agent-mocks.html`. Arjun chose B, a tag at the start of the row's
second line, in violet, a colour pair new to the palette. He chose to show it on the web and Mac
too, and to count a harness with no recorded owner as nobody else's. Room details wear the same
tag. "Dana's agent" goes before the harness in the field's list, the column of faces and room
details, for every reader; a guest still reads it without the harness. No server change.

- A space shared with somebody else shows a person icon and "shared" on its row in the Spaces tab.
  Shared means a person besides the reader is in the room, or an agent whose harness is somebody
  else's is, even without that person. The reader's own agents don't count.
- An agent whose harness is somebody else's says whose it is, "Dana's agent", in the agent selector
  (the column of faces) and on the space's details page, for every reader. Today only a guest sees
  that line, on room details (`agentByline`).
- To settle at the mock: whether the web and Mac lists show the label too, and how an old harness
  with no recorded owner counts.

## Arjun's to do

Nothing. The last item, an Expo robot user for SEC-29, is done (26 October, 22:07 PDT): the robot
"Chips push", a Viewer, holds the token 4431 and the demo server send with, and his personal token is
deleted. Checked after: a push without the token is refused (403), one with it reached his phone.

## Left as they are

SEC-47 (a page on the iPhone opening Safari by itself), on Arjun's word. On his word too, 26
October: SEC-19, since he doesn't use GitHub Actions (`pnpm check` and the e2e suites run on the Mac
before anything lands), and SEC-16, since the scrubbed commits hold only dummy harness data and the
dev-mode token in them is dead.

The review's Info items: a bridge's version floating within its major, presence of every harness
shown to members, a message's newlines inside the agent's prompt, and `feedback.from` without the
workspace role.
