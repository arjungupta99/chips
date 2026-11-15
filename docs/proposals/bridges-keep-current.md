# Bridges keep themselves current

12 November 2026; reworked 13 November after a failure review, then again to start smaller. A
proposal, for Arjun's picks. It is the bridges' part of `everything-in-step.md`, which keeps the
phone, the iPad, Chips for Mac, the computer and the bridges in step together. It follows ADR 0218
(a harness connects in one step with its bridge from npm) and sits beside ADR 0296 (the update dot).

## What happens today

- **Publishing.** A bridge release is a version commit pushed to its public repository; the
  repository's workflow tests it and publishes it to npm with provenance.
- **What a machine takes.** A card names a package and its major, `@chipschat/hermes@1`. Chips
  takes the newest release of that major that is not a prerelease and not deprecated, checks it
  against the registry's SHA-512, and unpacks it into the same folder every time
  (`cli/src/bridges.ts`). The card is the one in the machine's own Chips, not the server's. A
  machine on a deprecated release moves to the newest one still listed at its next update, even an
  older one, since the version is compared for equality, not order.
- **What runs.** Each kept bridge is a background service, named `chat.chips.<id>`: a launch agent
  on a Mac, a systemd user unit on Linux. It runs Node on `<data>/bridges/<scope>-<name>/package`,
  starts at login, and starts again whenever it stops (`packages/sdk-ts/src/service.ts`). The
  bridge writes its service file when it keeps itself, at `chips connect`; `--update` only
  restarts it. One package can run several: Claude Code and Codex both run `@chipschat/acp`, each
  listed under `kept` in its `bridge.json`. Each package is one bundled `dist/main.js` that needs
  nothing installed, and all four ask for Node 22.19 or newer. Chips for Mac carries Node 22.23.
- **When it takes it.** Only on `chips connect <id>`, and on `chips connect --update`
  (`cli/src/commands/bridge.ts`). The install line runs `--update` when it upgrades the computer to
  a new version (`packaging/install.sh`). Chips for Mac runs `chips connect <id>` only when someone
  connects from its sheet (`apps/desktop/src-tauri/src/connect.rs`).
- **What that means:**
  - A fix published between computer releases reaches nobody until they type `chips connect
    --update`.
  - Chips for Mac never updates a bridge. ADR 0218 said it would ("phase 5"); it doesn't.
  - A bridge on another computer (a VPS, a second Mac) is never updated unless someone types the
    command there.
  - Nobody can see what a bridge runs. The bridge sends its name and version in every `hello`'s
    `client`, but the server never reads it (`onHello` in `server/src/interfaces/ws/session.ts`).
  - `--update` restarts every kept bridge's service, even when its version didn't change and even
    when its download failed. It has to restart them: the swap deletes the old package's files at
    once, under any service still running on them.
  - Nothing ties a bridge release to the computer it will meet. The card names only the major, so a
    1.x release made for the newest computer reaches someone on an older one too.

## What we want

1. A fix reaches every bridge on the computer's own machine within about a week of being published,
   with nobody typing anything. A bridge on another machine says it is behind, with the one thing
   to do.
2. Nothing is lost: no turn cut short, no message dropped, no message answered twice.
3. A bad release has time to be caught, reaches few machines if it isn't, and can be undone on
   every machine from one place.
4. A bridge that doesn't work after an update is put back as it was.
5. Nobody but Chips's own releases can reach every machine.
6. The owner can see what each bridge runs, what went wrong, and turn this off.
7. An update never breaks a bridge for someone on an older computer.

## Who updates: start with the computer

**A. The computer updates the bridges on its own machine (recommended to start).** Most people run
their bridges on the same Mac as Chips, and for them Chips for Mac is the computer. The computer
already knows when a harness is quiet, since it draws every run and every ask. It outlives the
bridge's restart and starts again after a reboot, so it can watch the bridge come back. And it needs
only a computer release: no new SDK, no bridge releases, and no machine stuck on a bridge too old to
update itself.

**C. Each bridge updates itself (later, if bridges on other machines need it).** This reaches a
bridge on a VPS or a second Mac. It needs a new SDK, a release of each bridge on it, a `busy()` each
bridge answers, and a start guard in each service, and the first update to each machine still comes
by hand. Its design and failure review are kept below, under "Later".

**B. A nightly timer on each machine: no.** It can't tell whether a turn is running, and agents do
work at night.

## How the computer does it (A)

1. **Which bridges are its own.** Those in its own data folder, `<data>/bridges/*/bridge.json`, each
   with the cards kept running on it. Each is matched to its harness through the key the bridge
   kept when it joined (`keptJoin` in `packages/sdk-ts/src/join.ts`), so the computer knows which
   harness's runs and asks to watch.
2. **Once a day**, in the sweep that already reads the release feed for the update dot, it reads
   which versions of the four packages may arrive on their own (rules 2, 6) and compares them with
   what each bridge runs. A computer run from source (0.0.0) does none of this, as it reads no
   release feed.
3. **It stages first.** It runs its own CLI, `chips connect --update <id> --stage`, which takes the
   lock, fetches the release, checks it, and unpacks it beside the one running (rule 4). Nothing
   that runs changes.
4. **It waits for quiet.** No run open for that harness, no ask waiting on it, no message for it
   that no run has started for, and nothing said to it in the last minute. For two bridges on one
   package, each harness waits for its own quiet moment (rule 4). A harness at work for days is
   never forced; the harness page says the update is waiting (rule 11). A run that nothing has been
   heard of for six hours is no longer at work (a day, for one paused): nothing closes a run whose
   bridge went away under it, and left to count it would hold every update back for good.
5. **It stops sending, then restarts.** It closes the harness's sockets so nothing more is handed
   to the old process, then restarts that one service (`launchctl kickstart -k`,
   `systemctl --user restart`). The bridge picks up from the last place it saved, and with the SDK
   fix of 13 November (found along the way, 2) a message it heard but hadn't started a run for is
   heard again.
6. **It watches it come back** (rule 3), and puts the old version back if it doesn't.

Nobody is asked: no card, no message, no notification. What anyone sees:

- **During the restart, nothing**, if the bridge is back within 15 seconds. The server goes on
  showing a harness as connected for that long after its last socket closes (`PRESENCE_GRACE_MS`
  in `server/src/infrastructure/store/in-process-presence.ts`).
- **In Chips**, the bridge's version and last update on the harness page, or what went wrong (rule
  11).

A bridge on another machine is compared the same way, from the name and version it sends in its
`hello`, and its harness page says "Bridge 1.0.29 · 1.0.31 is out. On that machine, run
`chips connect --update`" (Run in Terminal).

## The rules

1. **Newer only, except to undo.** A service restarts only when the package is no longer the
   version it started on. The one way down is rule 9.
2. **Wait, then spread.** A release is taken on its own only once it has been out two days,
   reckoned by the registry's clock (its answer's `Date`), not the machine's. Past two days, each
   computer waits a further zero to three days, picked from its own id, so a bad release reaches a
   few machines first and withdrawing it spares the rest. The publisher's own computers take a
   release at once, as the first to find out. A release marked urgent in the signed list (rule 6)
   skips the wait. Someone connecting by hand still gets the newest at once, as now.
3. **Comes back, or goes back.** The computer watches what it can see from outside the bridge:
   - **Done** when the harness has connected again and answered a first probe. A release that
     connects and then fails every turn is not done.
   - **Put back** when the harness doesn't connect again in its own time, or exits more than three
     times in its first day. Its own time is generous for a bridge that starts something first:
     Hermes may spend minutes starting its gateway. Putting back points `package` at the old
     version and restarts the service. A put-back release is skipped until the next release or
     seven days, whichever is first.
   - **Never blamed for the server.** The server is the one watching, and the bridge reaches it on
     the same machine, so a release is never blamed for a server that was down.
   - **A journal** beside the package says where an update got to, so a computer that restarts or
     a Mac that sleeps halfway finishes the check when it is back.
   - **Said, and kept.** What happened is kept with the harness, not in presence, which forgets
     trouble when a harness goes offline (rule 11).
4. **One package, several bridges.** Each release unpacks into a folder of its own
   (`package-1.0.31`), and `package` becomes a link to the current one, so the paths in the service
   files keep working. Node follows the link when a bridge starts, so a bridge still running goes
   on loading its own version's files, which stay until no service runs them, plus one version
   back for rule 3. Each service's working folder is its state folder, not the package. When
   Claude Code's harness is quiet, only its service restarts; Codex's restarts at its own quiet
   moment.
5. **It says what it runs.** The server reads the `client` every bridge already sends in its
   `hello` (`chips-hermes 1.0.30`) and keeps it with the harness: version, when it last changed,
   the last failure. For a bridge on the computer's own machine, `bridge.json` says it too.
6. **Only Chips's releases reach every machine.** A compromised npm account, GitHub account,
   workflow or build dependency would otherwise reach every machine within days. So an update taken
   on its own takes only a release whose checksum is in a list signed with Chips's release key, the
   one the install line already checks (SEC-36, `packaging/install.sh`): `bridges.json` and its
   signature on chipschat.ai, written by a script on the machine that holds the key after each
   bridge release. npm still serves the bytes, and its SHA-512 is checked as now. The list says
   which versions may arrive on their own, which are urgent, and which are withdrawn. A bridge
   publish also waits for a protected-environment approval in its workflow, and npm's "Require 2FA
   and disallow tokens" is on for all four packages before any of this is on. Someone connecting by
   hand takes npm's newest, as now. The provenance check before unpacking comes later.
7. **It fits the computer it's on.** A bridge talks only to its computer.
   - **The computer's own card names the major,** so a bridge on its own machine always takes the
     major its computer speaks. A bridge on another machine is compared with the major the computer
     names, not that machine's CLI.
   - **Every computer on its major.** A 1.x release works with every computer whose card names
     `@1`. It uses something new only when the computer says it has it, by a name in the server's
     `hello` (`server.takes`, as the apps do since ADR 0281), never by comparing version numbers: a
     computer run from source says 0.0.0. A new value in an existing list (a risk class, a step
     kind) counts as something new, since an older computer may refuse the whole event.
   - **A break is a new major.** A change that can't work with older computers ships as `@2`, and
     only a computer that names `@2` takes it.
   - **A floor, as a safety net.** A release names the oldest computer it needs,
     `"engines": { "chips": ">=1.3.0" }`, which both npm listings carry; the computer takes the
     newest release whose floor it meets.
   - **Older apps** are the computer's to look after, not the bridge's (`everything-in-step.md`,
     "An older app always sees something").
   - **New permissions.** A kept bridge joins with its key and makes no new join request, so what
     it was allowed doesn't grow on its own. A release that wants more works without it and says on
     the harness page what it lacks, for the owner to allow.
   - **Tested at the floor.** Each bridge repository's tests run against the oldest computer its
     `engines.chips` names, not only against main.
8. **It fits the machine.** Before it fetches anything, the CLI checks, and when the machine can't
   take the release it changes nothing and says why (rule 11):
   - **Node.** The release's `engines.node` against the Node the service runs on (Chips's own, or
     the machine's).
   - **Room.** Free space for three copies of the package, since two versions stay on disk.
   - **Permission.** It can write the package's folder (not left owned by root by a `sudo`).
   - **One at a time.** A lock file on the package's folder, with its holder's process id, that
     `chips connect` by hand and `chips disconnect` take too.
   - **Files that survive a full disk.** `bridge.json` is written whole (found along the way, 4, done)
     and so is the journal. What only this needs (the skip list, the version each service started
     on) goes in a file of its own that an older CLI doesn't touch, with a layout version. A newer
     CLI that finds a real `package` folder where its link was, left by an older CLI, takes it back.
   - **The public registry, and the machine's proxy.** It ignores a `CHIPS_NPM_REGISTRY` left in a
     bridge's service from the shell someone joined from, and goes through the machine's proxy.
9. **Withdrawn means go back.** The daily check also leaves a version that has since been
   deprecated on npm or withdrawn from the signed list, for the newest release that is allowed,
   even an older one, with no wait. That keeps what deprecating already does today, and makes the
   signed list the undo for every machine.
10. **Readable by the version before.** Whatever a release writes, its state, its settings, the key
    it joined with, must stay readable by the release before it, since rule 3 may put that one
    back without warning. Each file carries a format number. A change the older release can't read
    goes in a new file, leaving the old one as it was, or is a new major. A put-back never restores
    an older copy of the state: the older release reads the current one, since an older cursor
    would answer messages twice. A machine away for weeks may jump several releases at once, so a
    release reads what any earlier release of its major wrote.
11. **Every state has words**, on the harness page, kept by the server with the harness:
    - "Bridge 1.0.31 · updated 13 Nov"
    - "1.0.32 is ready, waiting for a quiet moment", after a day of waiting
    - "Couldn't update to 1.0.32, still on 1.0.31", with why: it didn't work and was put back, its
      Node is too old, the disk is full, it can't write its folder, npm hasn't answered for a week
    - "Updates are off"
    - "Bridge 1.0.29 · 1.0.31 is out. On that machine, run `chips connect --update`", for a bridge on
      another machine (Run in Terminal, as every command box says)
    The owner also sees, in About's Updates group, any bridge that needs them (`everything-in-step.md`).
12. **Off.** "Keep this bridge up to date", the owner's, on the harness page, on by default.
13. **The harness behind it has a version too.** A bridge release may need something new in Hermes,
    OpenCode, OpenClaw or an ACP adapter, and those update on their own schedule (Claude Code updates
    itself). A release names what it needs (`engines.hermes`), the computer checks it before taking
    the release where it can, and the bridge checks again when it starts and says so as trouble
    (ADR 0083), "Needs Hermes 0.9 or newer", rather than failing turns one by one. The ACP bridge
    fetches its adapter only when it joins with a link, so a release that moves to a new adapter
    major fetches it when it starts.
14. **A restart loses nothing.** Before a bridge's updates are taken on their own, it passes a test:
    restarted while quiet, it loses no message, no outbox entry, no open run, no running cost (the
    Claude Code cost after a restart, 11 November). OpenClaw's bridge keeps no state file today, so
    its outbox and open runs die with its process; it gets one first.

## What could go wrong

Every way found that an update could hurt someone, and what answers it.

**The restart**
- A turn starts while the release downloads: nothing that runs has changed; the restart waits for
  quiet (steps 3–4).
- A message arrives as the bridge restarts: the computer stops sending to it first, and the bridge
  picks up from where it saved; a message it had heard but not started a run for is heard again
  (step 5).
- The agent's own jobs and heartbeats, which Chips didn't start: a harness tells Chips of one only
  once it is over, so the computer can't wait for it, and a restart can cut one short. Not
  answered yet. A Compact now a person asked for is waited for, for up to an hour. Gathering a
  message for a moment is covered by "nothing said to it in the last minute" and by messages being
  heard again.
- An ask waits on someone for days: no update while it waits; after a day the harness page says the
  update is waiting (rule 11). Never forced.
- The people in the room see it go offline: not within the server's 15 seconds (phase 0 checks each
  bridge is back within them).
- Something only a restart breaks (a lost outbox, a cost that starts again): rule 14's test.

**Coming back**
- The new version crashes at start, crash-loops, or never connects: the computer puts the old one
  back (rule 3).
- It needs a newer Node: the Node floor stops it being taken at all (rule 8).
- It connects, then fails every turn: done means its harness answered a probe (rule 3).
- It connects, then falls over hours later: three exits in its first day put it back (rule 3).
- The Mac sleeps, or the computer restarts, halfway: the journal (rule 3). Time asleep isn't
  counted against a bridge coming back, and a watch picked up after a restart doesn't judge the
  bridge by trouble it can't tell from before.
- The old version can't read what the new one wrote, or a put-back replays an old cursor: format
  numbers, and the current state always (rule 10).

**The machine**
- npm or the network is down, slow, or behind a proxy: nothing changes; tried the next day; a week
  of it shows on the harness page (rules 8, 11).
- A download cut short or tampered with: checked against the registry's SHA-512 and the signed list
  before it is unpacked; unpacked in a scratch folder and moved in whole (rule 6).
- The disk is full: checked first; files are written whole or not at all (rule 8).
- The folder isn't writable: checked first; said on the harness page (rules 8, 11).
- `chips connect` by hand, `chips disconnect`, or both acp bridges at once: one lock (rule 8).
- An older CLI on the same machine touches the folder: its fields are left alone, and its plain
  folder is taken back (rule 8).
- The machine's clock is wrong: the registry's clock (rule 2).
- A bridge run by hand, in Docker, or under someone's own service file: the computer only restarts
  services Chips kept, and says so of the rest (rule 11).
- A test registry left in a bridge's service: ignored (rule 8).
- A machine away for weeks: jumps several releases, which every release must read (rule 10).

**Versions**
- A bridge release made for a newer computer: it fits the computer it's on, or isn't taken (rule 7).
- Someone in the room on an older app: the computer's to look after (`everything-in-step.md`).
- A release that needs more permission than the bridge was given: works without, and asks the owner
  on the harness page (rule 7).
- The harness behind the bridge is too old, or updated itself past what the bridge knows: checked,
  and said as trouble (rule 13).

**A bad release, for everyone**
- It slips past the tests: two days, then a few machines first, the publisher's own first of all
  (rule 2).
- It is found after some machines took it: withdrawn from the signed list, or deprecated on npm,
  every machine goes back (rule 9).
- A fix that can't wait: marked urgent in the signed list (rules 2, 6).
- Someone steals the right to publish to npm, or poisons a build dependency: nothing reaches a
  machine on its own without the release key's signature (rule 6).

**Seeing it**
- An older computer: shows nothing new, as today (rule 5).
- A dead bridge after a failed update: what went wrong is kept with the harness, not in presence
  (rules 3, 11).
- A bridge on another machine: its harness page says it is behind and what to run (rule 11).

## Found along the way, wrong today

These hurt people now, with or without automatic updates. Items 1 to 5 are fixed on main (13
November); the SDK ones reach a bridge with the next SDK release and the bridge's release on it.

1. **Fixed: `activeRuns` never let a finished run go.** A run was added at every turn and removed
   only when its start failed, so a bridge held every run it ever had until it restarted. A run is
   now let go once it completes, fails, or has heard a person stop it (`ended` in
   `packages/sdk-ts/src/connect.ts`); a lane keeps the run it worked itself.
2. **Fixed: the cursor moved when a message arrived, not when it was taken up.** `since` moves as an
   event comes in, so a bridge that stopped while it gathered a message, or queued it behind a turn
   already going, lost it for good, as at every computer upgrade, when the install line restarts
   every bridge. The store now also keeps the messages for the harness that no run has started for
   (`unanswered` in `packages/sdk-ts/src/store.ts`). After a restart they are heard again, and
   nothing else is handed over twice. A message is taken up once a run starts in its room, or the
   harness posts there outside a run, as the agent it was for or as the harness; one never answered
   is let go after an hour.
3. **Fixed in the SDK, each bridge to turn on: a kept bridge's first connect gave up.** When the
   server didn't answer, the first connect rejected and the bridge exited, so its service started it
   again every few seconds. `connect({ waitForServer: true, onWaiting })` now waits and tries again,
   as a reconnect does; a refusal still fails it. Each bridge passes it when it runs as its kept
   copy, which the SDK's `runsKept(label)` tells it: launchd names the job to what it starts, and
   systemd says which process it started. Out on 13 November in SDK 1.0.6, with acp 1.0.25,
   hermes 1.0.28 and opencode 1.0.26 on it; a waiting bridge says so once in its log, and again
   when the reason changes.
4. **Fixed: `bridge.json` was written in place**, so a full disk could leave it empty and drop that
   bridge out of updates, `disconnect` and `uninstall`. It is now written beside, flushed, and
   renamed into place (`writeRecord` in `cli/src/bridges.ts`).
5. **Fixed: `bridge.json`'s `kept.args` went stale when a card's files moved.** On this Mac they
   named `~/.chips-acp/…`, which no longer exists, so `chips uninstall` would have stopped the ACP
   bridges with a config that isn't there. `--update` now brings them to what the cards say, and
   `uninstall` stops each bridge with its card's args as this Chips carries them.
6. **Not a fault: `--update` restarts a bridge whose download failed.** It restarts every kept
   bridge on purpose, so each runs on the Node the upgrade put in place (`updateBridges`); the old
   package is still there to run.
7. **Fixed: a stop during a bridge's start closed nothing.** The ACP, Hermes and OpenCode bridges
   set their stop handler as the last line of their start, after the join, the connect (which
   since SDK 1.0.6 can wait hours for a server that is down) and their own start. A stop before
   then was Node's default: the process died at once, so what the SDK held wasn't saved (the
   last 50 ms of its cursor, tried with a real process), the ACP bridge's agent was left running
   where it ignores its input closing, and OpenCode's own server was left running whenever nothing
   else reaped it. Each now hears a stop from its first line and closes what the start has opened
   so far: the bridge, then the connection, then OpenCode's server, which is stopped even before
   it has answered. A start that was stopped still ends as the signal, as it always has, so
   `chips connect`, which reads an exit of 0 as connected, never takes it for one that worked;
   once the bridge has started, a stop is a clean end as before. OpenClaw's bridge had a narrow
   form (a stop while it looked for git left `bridge.pid` behind), fixed the same way.
8. **Fixed, out in SDK 1.0.7: no bridge was ever kept running on Linux.** The
   systemd unit `keepRunning` writes had its folder in quotes (`WorkingDirectory="/home/…"`).
   systemd takes that setting as the rest of the line, reads a quoted one as a path that isn't
   absolute, and refuses the unit whole, so since `keepRunning` was written (17 October) every
   keep on a Linux machine with systemd has ended with "It couldn't be kept running … It runs
   here instead, while this terminal is open." No test saw it, because none ran a real systemd.
   Found on 13 November by keeping a stand-in bridge under systemd 255 with the published SDK
   1.0.6. The unit now writes each setting as systemd reads that one: the folder and the log with
   no quotes, a `%` doubled everywhere, and a `$` doubled in the command. Tried on the same
   systemd with a folder named `my %h $HOME folder`: the unit is taken and runs there, the kept
   copy is told from one run by hand and from a process it starts (`runsKept`), the count the
   computer reads for a release's first day (`NRestarts`) reads as the number of times it was
   started again, and the SDK's stop removes it. Out on 13 November in SDK 1.0.7, with acp 1.0.27,
   hermes 1.0.30, opencode 1.0.28 and openclaw 1.0.17 on it, and tried again from npm on the same
   systemd. A bridge connected on Linux before then has no unit, so it is kept only once its
   card's line is run again on one of those releases.

## Phases

0. **Checks before building**, each tried on a scratch server, never the live one:
   - matching each bridge in the data folder to its harness through the key it kept;
   - each of the four bridges is back within the 15 seconds after a restart;
   - a message sent while the computer restarts a bridge is answered once, with the 13 November SDK
     fix in the bridge;
   - a bridge still running keeps loading its own version's files after the link moves.
1. **What's wrong today** (found along the way, 1–5): fixed on main 13 November (e04242fd6). The
   CLI's reach people with the next computer release. The SDK's are out: SDK 1.0.6 on npm on
   13 November, and the ACP, Hermes and OpenCode bridges released on it the same day, each with
   `waitForServer` on for its kept copy. The OpenClaw bridge keeps its own place in the log and
   its own reconnect, and stays on the SDK it had.
2. **The computer updates its own bridges** (one computer release): the server's daily read of the
   allowed versions and its quiet watch, the CLI's staging, the versioned folders behind the link,
   the journal and the put-back, the waits, the floors, withdrawn means go back, the lock and the
   other checks, the signed list and the script that writes it, and the server reading every
   bridge's `client` and keeping its version and last failure.
3. **What people see** (mocks first): every state's words on the harness page, the switch, and the
   owner's rows in About's Updates group.
4. **Later, if needed: bridges on other machines update themselves** (C, below).
5. **Provenance**: the check before unpacking.

## Built, 13 November (phase 2)

Built and tested, not yet in a release, and nothing changes on any computer until the signed list
is on the site:

- **The CLI's hands, in the server's own process.** A release's `chips serve` hands its server the
  bridges in its data folder (`cli/src/bridge-hands.ts`): list them with the harness each kept key
  joined as (asked of the key store once an hour), stage an exact release, switch one service, and
  write the journal. No CLI subcommand is spawned, so no path to the CLI has to be found.
- **Versioned folders** (`package-1.0.31` behind a `package` link, a plain folder an older Chips
  left taken back), the journal `updates.json` (in use, the one before, what each service started
  on, staged checksums, skips, `trying`, each service's last outcome), and the lock `bridge.lock`
  that `chips connect` by hand takes too. Phase 0's last check is a test: a bridge still running
  goes on loading its own release's files after the link moves.
- **Staging** checks the signed SHA-512 against npm's listing and the bytes, the release's
  `engines.node` against Chips's Node, room for three copies, and that the folder can be written.
- **The server** reads `bridges.json` and its signature once a day (`CHIPS_BRIDGES`; a release
  sets chipschat.ai's, a checkout none), verified in TypeScript against the key `install.sh`
  carries, in the namespace `chips-bridges`. It picks the release (rules 1, 2, 7's floor, 9), waits
  two days plus zero to three picked from the first workspace's id (`CHIPS_BRIDGES_WAIT=now` for
  the publisher's computers), stages, and waits for quiet: connected ten minutes, no run of the
  harness not over, no ask or question of its runs pending, no message in a room it or its agents
  are in for two minutes. Then it closes the harness's sockets (1012), switches, and watches: done
  once the harness says hello as the new release and stays connected for a minute without trouble
  it didn't already have; put back after five minutes without that, the release skipped a week.
  A watch a server restart interrupted starts over when it is back.
- **Said**: each harness's state in `GET /v1/software`, as `bridge_update`.
- **The signing script**, `pnpm release:sign-bridges` (`tools/release/sign-bridges.mjs`): the four
  packages' releases from npm, deprecated ones withdrawn, `--withdraw` and `--urgent` marks kept
  between runs, signed and checked as a computer checks it.

Not then, and built since (see "Built, 13 November (night)" below): the first probe of rule 3 and
the three exits in a day; rule 8's proxy; rule 13's `engines.hermes`. Rule 12's switch and rule
11's words came in phase 3. Running the signing script needs Arjun's release key, and the two
files go on the site with his word.

## Reviewed, 13 November (later)

A review of what was built found these, each fixed with a test. Where a rule above reads
differently, this is what the build does.

**Waiting and switching**
- **What a bridge says is what it runs.** Its last hello names the release, ahead of the journal
  and the link, so a service that restarted on its own onto a staged release isn't switched again.
- **A staged release is checked again.** A `package-<v>` folder counts only when it was unpacked
  against the checksum the signed list names now; otherwise it is fetched and checked afresh.
- **Nothing is noted before it can happen.** The journal's `trying` is written only once the
  release is known to be unpacked, so a switch that is refused leaves no put-back to make and no
  release skipped for a week. A switch refused because the folder is busy closes no sockets twice,
  and is tried again ten minutes on.
- **The five minutes start at the switch**, not before the download.

**Coming back**
- **Back means settled.** A bridge is back once it has said hello as the new release and stayed
  connected a minute since its newest hello: one that crashes and says hello again each time never
  settles, and is put back.
- **A put-back waits for quiet too**, where the bridge is connected and at work, and closes its
  sockets first. One that can't be made is tried three times, then the bridge is left on the new
  release and said to run it. A put-back the folder's lock refuses doesn't count as a try.
- **A switch let go.** When the link no longer points where the watch expects (someone ran
  `chips connect --update` by hand meanwhile), the watch ends without putting anything back or
  skipping the release, and the service is said as it is.
- **Asleep isn't late.** A gap of more than two minutes between two looks is the machine asleep,
  and is taken off the time a bridge has to come back.
- **After the server restarts**, a watch is picked up from the journal with or without the signed
  list read yet, counts from the later of the switch and the server's start, and doesn't judge
  trouble (it can't tell new trouble from old).
- **A service that is gone** (its card disconnected, or no harness joined) lets its `trying` go, so
  it holds the package back no longer.
- **Two services on one package** are each decided on their own: one waiting doesn't stop the
  other being looked at in the same pass.

**The folder**
- **The release before stays** while a switch is being watched (`prune` keeps `trying.from` and
  `trying.to`).
- **The lock** is another process's while its holder lives and the lock is under thirty minutes
  old; a lock with no holder written yet is waited on two seconds. `chips disconnect` takes it
  too, and `chips connect` writes its record under it.
- **A second card on a package** notes what the first service started on before the link moves,
  so the first is never read as running the link's release.
- **Node's range is read in full**: `>= 22.19`, `>=22.19 <25`, `^22.19 || >=24` and the like.

**The signed list**
- **It says when it was signed** (`signed`), and a computer never takes one signed before the one
  it holds. One it couldn't read again for a week is acted on no more, until the site answers.
- **The signing script** refuses a `--withdraw` or `--urgent` that names a package the cards don't
  or a version npm doesn't list, and needs the list signed before in `--out` (the marks live
  there), or `--first` for the very first.

**Quiet, in full** (`server/src/infrastructure/store/harness-quiet.ts`): a run of the harness not
over and heard of within six hours (a day, paused); a Compact now asked or taken up within the
hour; an ask or a question of its runs pending; a message in a room it or its agents are in since
the time asked. For the computer's own update: any run not over and heard of within six hours
(a paused run doesn't hold the computer: it stays paused through the restart), any ask or question
pending, any message.

**The SDK** (reaches people with SDK 1.0.6 and the bridge releases on it): a message a working
turn already took in is not answered again after a restart, and one that has waited more than an
hour for its turn is let go when the bridge starts, not only when it saves.

What was still not built then (the first probe and the three exits in a day, the proxy,
`engines.hermes`, a harness's own jobs seen while they run) is in the next section.

## Built, 13 November (night): the rest of rules 3, 8 and 13, and jobs seen while they run

Where a rule above reads differently, this is what the build does.

**Its first probe (rule 3).** A bridge is back once it has said hello as the new release *and*
said how the harness behind it is: `PUT /v1/harnesses/:id/status`, which every bridge sends once it
has started and checked (the ACP bridge when its agent runs, Hermes's and OpenCode's when their
server answers and every half minute after, OpenClaw's at its gateway's hello). Its minute counts
from the later of its newest hello and that first word. A bridge that connects and never gets as
far as checking is put back as one that didn't come back. The word counts once for a release: said
again every half minute it doesn't move the minute; said by the release before as it is stopped,
or left from an earlier try at the same release, it isn't the new one's. A server that started
after the switch doesn't wait for it, since the bridge may have said it to the server before.

**Its first day (rule 3).** When a bridge is back, the journal keeps its first day on the release
(`proving`, by service: the release it left, the one it is on, when it was switched), and the
release it left stays on disk through it. For a day the computer looks every ten minutes, and puts
the release before back when:
- its service has stopped and been started again more than three times. launchd counts a job's
  `runs`, systemd how many times it started the unit again itself (`NRestarts`); the count is
  taken from when the bridge came back, and again from nothing when this server starts or the
  count itself begins again (a new login), so a bridge that gave up on a server that was down is
  never blamed for it. Where neither says, only turns are judged;
- or its first three turns begun since the switch that are over all failed, where the newest turn
  over before the switch hadn't. A turn a person stopped is neither. A harness that was failing
  already (an account out of credit) is not put back for it.

A put-back from a first day waits for a quiet moment and for any other switch on the package, closes
the harness's sockets first, skips the release for a week, and is said with why: "It kept
stopping" or "Its first turns failed" where the watch's own says "It didn't come back". While one
is owed the computer looks every half minute. One that can't be made is tried three times, then
the release stays. The day ends with nothing done when the service runs another release (someone
started it by hand), when it is no longer kept, or when a later release is taken and begins a day
of its own.

**The harness behind it (rule 13), the computer's half.** A bridge release names the oldest
release of its harness it works with in `engines`, by the card it is kept for and written one way:
`"engines": { "hermes": ">=0.9.0" }`, or `"claude-code"` and `"codex"` on the ACP bridge. The
signing script lists it (`needs`), and stops before signing when it is written any other way, or
names a card that isn't kept on that package. The computer asks the harness's own command (the
card's `program`, with `--version`, in the environment the bridge's service runs in), once an hour
and only while a listed release names a floor for that card. A harness too old for the newest
release takes the newest it is new enough for, and the page says what the one beyond needs: "It
needs Hermes 0.9.0 or newer." It is taken on its own once the harness has been updated. A harness
whose command can't be found, or doesn't say its release, is taken as new enough. Today that is
Hermes, whose command answers "vunknown". The other half, the bridge checking at its own start and
saying so as trouble, is not built: no release names a floor yet, and it belongs in the first one
that does, tested against the harness it is for.

**It fits the machine (rule 8): the proxy.** What Chips fetches on its own goes through the
machine's proxy where it has one (`cli/src/proxy.ts`): the site's list of releases, the signed
list of bridge releases, and a bridge release from npm, fetched by the computer or by
`chips connect` by hand. The proxy is the environment's (`HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY`
and `NO_PROXY`, in either case), which `chips up` carries from the shell it is run in into the
service's file; on a Mac with none of those, the one in System Settings. A proxy chosen by a
script (a PAC file) isn't read, nor a SOCKS proxy, and this machine itself is never reached
through one. With no proxy nothing changes: the fetch is Node's own. Tried on the Node a release
carries (22.23.4), through a local proxy: the live signed list read and checked against the
release key, and a bridge release staged from npm against its signed checksum. As for
`CHIPS_NPM_REGISTRY`: the computer stages with its own setting and never reads a bridge's service
for it, so one left there changes nothing.

**A harness's own jobs, seen while they run.** A job in the copy a harness sends
(`PUT /v1/harnesses/:id/jobs`, ADR 0252) may say a run of it is going, with when it began
(`running_since`); the copy comes again without it when the run is over. While it does, the
harness isn't quiet, and neither is the computer for its own update, for up to six hours. An older
computer drops the field unread. OpenClaw's bridge says it from its gateway's `cron` events, for
the Main agent's check-ins, Dreaming and the skill reviews: a check-in that ended while the bridge
was being started again reached no room.

Still not built:
- the bridge's own check of its harness at its start (rule 13's other half, above);
- rule 6's approval before a bridge publish: the four publish workflows name no protected
  environment today, and npm's "Require 2FA and disallow tokens" is a setting on each package.
  Both are settings on GitHub and npm rather than code;
- rule 7's test of each bridge against the oldest computer it names: none names one
  (`engines.chips`) yet, so there is nothing to test against;
- phase 5's provenance check before unpacking.

## Later: each bridge updates itself (C)

Kept for when bridges on other machines need it. The failure review of 13 November shaped it.

1. **It knows it is kept.** The SDK updates only a bridge its own service started: launchd's and
   systemd's own variables name the service (`XPC_SERVICE_NAME`, `INVOCATION_ID`).
2. **It finds the CLI itself, every time,** from the Node it runs on (`<chips>/runtime/node`, the CLI
   beside it at `<chips>/bin/chips`), else the `chips` on the service's PATH. Nothing is written
   into the service file. An older CLI refuses a flag it doesn't know, so no CLI, or one too old,
   means no update, said on the harness page.
3. **Once a day** by the wall clock, kept on disk, never within ten minutes of waking.
4. **Only when quiet and connected:** no open run (`openRuns`; `activeRuns` never emptied, found
   along the way, 1), nothing the bridge says it is busy with (a `busy()` it answers), no ask
   waiting, and connected for the last ten minutes, since a bridge that can't reach its server
   looks quiet.
5. **The CLI stages, the bridge restarts itself.** Once staged, the bridge waits for quiet, holds
   what arrives without moving its cursor, saves and exits; its service starts the new version.
6. **A start guard** Chips writes (`start.mjs`) runs first in the service, counts starts, watches
   what the bridge says it reached, and puts the old version back. It survives a reboot, a sleep
   and a power cut, and it is never blamed for a server that doesn't answer its open `/v1/health`.
7. **The server names the major and floor** in its `hello`, since the bridge's machine may have a
   newer or older CLI than the server.

## Picks

1. **Who updates**: the computer, for bridges on its own machine, with others told (recommended to
   start); each bridge itself (C); or a nightly timer.
2. **How long a release waits**: two days, then zero to three more per computer (recommended); two
   days for everyone; or a week.
3. **What may arrive on its own**: only versions in a list signed with the release key, one script
   run per bridge release (recommended); or anything on npm, with 2FA and no tokens.
4. **Where it shows**: the harness page, plus the owner's rows in About's Updates group when
   something needs them (recommended); or the harness page only.
5. **Ask first or not**: no, it updates on its own (recommended); or an ask card for the owner
   before each update ("Hermes bridge 1.0.31 is out. Update now?").
