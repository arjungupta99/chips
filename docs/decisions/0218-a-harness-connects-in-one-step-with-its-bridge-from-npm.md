# 0218. A harness connects in one step, with its bridge from npm

Date: 22 October 2026
Status: Accepted, 22 October 2026, on Arjun's word, with the newest release in the card's major
for each bridge. The plan is
[connect-a-harness-in-one-step.md](../proposals/connect-a-harness-in-one-step.md). Fixes HS-1,
HS-2 and HS-3. Builds on ADRs 0119–0122 (the release, its places, `chips up`, join links), 0171
(the gallery) and 0190 (Connect a harness). Phase 5, Connect on this Mac, is the first addendum;
phase 6, the bridges on npm, the last.

## Context

Each one-line card in the gallery was a line like
`cd ~/Work/Chips/chips-hermes && CHIPS_JOIN_LINK='{link}' npm run keep`. It worked only on
Arjun's Mac: a fresh install showed no cards (HS-1), the line went into a checkout nobody else
has (HS-2), and it needed npm (HS-3).

Arjun, 22 October 2026: "I do plan to make chips public. Why not keep them separate?", "and
install them based on what harness the person selects?", and "In either case the installation
should be smooth and easy."

## Decision

1. **The bridges stay separate.** Each is published from its own repository as a public npm
   package: `@chipschat/hermes`, `@chipschat/opencode`, `@chipschat/acp` and
   `@chipschat/openclaw`. Each is one bundled file with no dependencies. OpenClaw's bridge bundles
   its OpenClaw client in its own repository, so Chips's source and release still carry nothing
   of OpenClaw (the 27 September rule).

2. **The versions start at 1.0.0.** A bridge's major says which protocol it speaks, and a card
   names that major: `"package": "@chipschat/hermes@1"`. A fix is a minor or a patch and reaches
   everyone with that card the day it is published. A bridge that needs a newer Chips is a new
   major, named by the cards of the Chips that speaks it. We chose 1.0.0 over staying on 0.x and
   reading a 0.x minor as a major, as npm's caret does: nothing depends on the 0.x versions (none
   was published), all four start on the same major, and "the newest 1.x" says what it means.

3. **`chips connect <id> '<link>'`** connects a harness from a card:
   - It looks the id up in the cards this Chips carries (`server.connectors`). A card with a
     `package` is a bridge. Its optional `args` are passed to the bridge first: the ACP bridge's
     config path, `~/.chips-acp/claude-code.json` or `codex.json`, whose name picks the kind and
     the service label `chat.chips.acp.<name>`.
   - It asks the npm registry for the package's versions, and takes the newest release of the
     card's major that is not a prerelease and not deprecated. Deprecating a bad publish takes it
     out of reach at once, which is the guard an exact pin would have given.
   - It downloads the tarball with Chips's own Node, checks it against the registry's
     `dist.integrity` (SHA-512), and refuses it when they differ or the registry gives none. It
     unpacks it into `<data>/bridges/<scope>-<name>/package`, where `<data>` is the platform's
     data folder (ADR 0120). The same version is reused next time and not downloaded again.
   - It runs the package's one `bin` (a `.js` file) with `--keep`. The link travels in
     `CHIPS_JOIN_LINK` and never as a word on the command line, where a service file or `ps`
     would keep it.
   - `chips connect custom` is unchanged. `chips connect` with no id lists what this Chips can
     connect. The CLI's code names no harness: ids, packages and args all come from the cards.

4. **What Chips hands the bridge.** In the environment it sets:
   - `CHIPS_NODE`, the Node to keep it on. This is a path that survives an upgrade:
     `~/.local/lib/chips/current/runtime/node` for an install, or the Node inside Chips.app.
   - `PATH`, starting with that Node's folder. The ACP adapters are `#!/usr/bin/env node`
     scripts, so they run on a machine with no Node of its own.
   - `CHIPS_STOP_COMMAND`, the line that stops it, `chips disconnect <id>`, for the bridge's
     closing sentence.
   - `CHIPS_STEPS=json`, which asks the SDK to report its steps.

   The SDK's keep writes `CHIPS_NODE` into the service where it is set (`keptNode`), or the first
   `node` on the `PATH` as before, and puts that Node's folder first on the service's `PATH`. It
   leaves out the four handed-over names (the link among them), so the kept copy carries none of
   them. A kept bridge runs from the same folder however many times its package is updated, and
   on the same path to Node however many times Chips is upgraded. Keep picks "bundle mode" (run
   the file itself) only for a file named `.js`, which is what a package's `bin` is. Otherwise it
   runs the source through tsx, as in a checkout.

5. **Steps.** With `CHIPS_STEPS=json`, the SDK writes a line `chips-step {…}` to standard output
   when `join()` starts (`joining`) and when keep starts a service (`keeping`, with its label).
   `chips connect --json` prints one JSON line per step:
   - `downloading`, with the package and version, and whether it was already here;
   - `checking`, when the bridge starts, since every bridge checks its harness before it joins;
   - `joining` and `keeping`, from the bridge;
   - `connected`, or `failed` with the bridge's own sentence and its exit code.

   Without `--json` it says the download in a line and passes the bridge's own words through.

6. **`chips disconnect <id>`** runs the bridge's `--stop`. Once no other card still keeps that
   package running, it removes the download. Claude Code and Codex share `@chipschat/acp`. Chips
   writes `bridge.json` beside each download, with the version, the checksum and the labels each
   card was kept under.

7. **Upgrades.** `chips connect --update` updates each bridge kept here to the newest release of
   the major its card now names, then restarts each service keep wrote (`launchctl kickstart -k`,
   `systemctl --user restart`). `install.sh` runs it after it upgrades an install that holds
   bridges. A service names the stable Node and the stable folder, so a restart is all it needs.
   The Mac app does the same in phase 5.

8. **`chips uninstall`** stops every kept bridge and removes `<data>/bridges`, whether or not the
   workspace goes too. So J6 still finds nothing left.

9. **The cards ship with Chips (HS-1).** The release carries `connectors/connectors.json`, the
   docs' file. `releaseDefaults` sets `server.connectors` to it, and `CHIPS_CONNECTORS` still wins,
   so 4431 keeps reading the checkout. The card type gains `package` and `args`
   (`gen:protocol`). Each one-line card is now exactly `chips connect <id> '{link}'`, and
   `published` stays false until the packages are on npm.

10. **Another computer.** `curl -fsSL https://chipschat.ai/install | sh -s -- connect <id>
    '<link>'` installs Chips when it isn't there and skips the install when it is, then runs
    `chips connect`. It never suggests `chips up`, which would start a second Chips there.

11. **Tests reach the real download path.** `CHIPS_NPM_REGISTRY` points the CLI at another
    registry. The connect kit serves a bridge's freshly packed tarball from a stand-in registry
    (`tools/connect-kit/registry.mts`) and runs the card's line through this checkout's `chips`.
    So each bridge's `npm run e2e` downloads, checks and runs what it would publish. Journeys J7
    and J8 do the same against the built release on a bare home.

## Consequences

- Nobody needs Node, npm, a clone or a config file to connect a harness. They still need the
  harness itself.
- A bridge fix ships the day it is published, with no Chips release. A bad publish reaches people
  until it is deprecated, which we chose over waiting for a Chips release for every fix.
- What runs is checked against the registry's checksum, not signed by us. Someone with the npm
  account could publish a bad release, so the account needs two-factor sign-in (phase 6).
- Each bridge repository gains `npm run release`: build, test, pack. Publishing is phase 6, on
  Arjun's word, once he has created the `chipschat` npm org and run `npm login`.
- The four bridges are rebuilt on the SDK of this change. Their live copies on Arjun's Mac run
  from their checkouts through tsx and pick it up at their next restart, which is his to say.
- Phase 5 (the Mac's Connect button, the `chips` link, a mock first) uses `--json` as it stands.

## Addendum, 22 October 2026: phase 5, Connect on this Mac

His words: "Build the Connect sheet as mocked: the Connect button with its steps on this Mac, the
curl line on another computer, and the Try again state." The mock is the three boards of the
"Connect sheet mock" canvas: On this Mac, On this Mac when the harness isn't answering, and On
another computer.

1. **Where a bridge's card runs.** In Chips for Mac, whose shell carries `chips`, a bridge's card
   (a one-line card naming a `package`) opens on a toggle, On this Mac or On another computer,
   on this Mac first. In a browser and on the phone there is only the other computer.

2. **On this Mac.** One sentence says what Connect does. The four steps (getting the bridge,
   checking the harness, joining Chips, keeping it running) stand greyed from the first frame, so
   the dialog keeps its height (ADR 0190). Connect, flat gold, runs the card's line here and reads
   `chips connect <id> --json`: each line ticks a step, in the bridge's own words where it gives
   them, and the download counts its kilobytes. While it runs the button says Connecting… with a
   small turning arc. Once connected, the hello brings today's arrival. The welcome has no arrival, so
   there Open its room comes once there is a room. Under the button, the
   card's new `needs` field: "You need Hermes running with its API server on."

3. **Try again.** Where the bridge stops, its step stops in amber with its few words ("Nothing
   answers on port 8642"). Under the steps, a box holds its sentence, what to do, and the line it
   gives to copy. The button becomes Try again, which runs the same line with the same link: a
   bridge stops before it uses the link, and the note says how many minutes it still works. A
   link that has run out is made again first.

4. **The step lines.** The SDK's step names gain `checking`, `checked` and `failed`, and its
   `StopWords` (`detail`, `says`, `doing`, `copy`). Each bridge reports its own check of its
   harness with a few words, and each `SetupError` carries its words for the sheet while its
   whole sentence still goes to standard error for a terminal. `chips connect` holds a bridge's
   `failed` step and says it once, with the sentence, as its last line. With `--json`, the
   download says `received` and `total` bytes as they come.

5. **The shell.** `connect_here` runs the carried `chips connect <id> --json` with the link in
   `CHIPS_JOIN_LINK`, never among its words: `chips connect <id>` with no link takes it from there.
   Each line goes to the page on `chips://connect-line`, tagged with the page's name for the run,
   then the run's end. A run that ends without saying where it stopped has its last words said as
   a failed step. `cancel_connect` stops its whole process group, the bridge with it; closing the
   dialog does that. It refuses under App Translocation, as `run_here` does, and runs only a card's
   id and a link Chips made.

6. **The `chips` command (3A).** When the app runs Chips here (`run_here`, `connect_here`), it links
   `~/.local/bin/chips` to the `chips` it carries, as `install.sh` links its own: made where there
   is none, moved from another copy of the app, and left alone where something else is there.
   "Run Chips on this Mac?" says so. `install.sh` leaves a link into an app as it is.

7. **The background-item notice (looked into, not changed; built in the addendum below).** A bridge kept from the app runs
   `Chips.app/Contents/Resources/chips/runtime/node`, which keeps Node's own signature (team
   `HX7739G8FX`), while the app is signed by team `W9K648WB82`. The server's service from
   `chips up` runs `bin/chips`, a shell script, which no team signs. Neither plist names
   `AssociatedBundleIdentifiers`. macOS credits a background item to an associated app only when
   the item's program is signed by the app's team, so the notice and Login Items will likely name
   Node (or the script) rather than Chips. The fix, for his word: `pnpm desktop` signs the carried
   `node` with the app's identity; the server's service runs that `node` directly; and both plists
   name `AssociatedBundleIdentifiers` `chat.chips.desktop`. It can only be proved by installing a
   real launch agent and reading the notice and Login Items, which a test must not do.

8. **Found walking it.** Chips for Mac's page could not pair with a scratch server on 4471: the
   app's `connect-src` names `http://*` and `ws://*`, which match only the default ports, so the
   request never left the page. A walk build with `http://*:*` and `ws://*:*` paired at once. The
   installed app has the same policy, so a direct pairing to 4431 likely fails the same way and only
   the relay gets through (MAC-4 in testing/findings.md). Fixed the same evening on his word:
   `connect-src` names `http://*:*`, `https://*:*`, `ws://*:*` and `wss://*:*`.

## Addendum, 22 October 2026: what Chips for Mac keeps running is named Chips

Point 7's fix, built on a branch for his word. macOS credits a launch agent to an app it names in
`AssociatedBundleIdentifiers` only when the agent's program is signed by that app's team.

1. **The carried Node is signed as the app is.** `pnpm desktop` copies the release it builds to
   `apps/desktop/src-tauri/target/chips` and signs that copy's `runtime/node` with the identity it
   signs the app with, under the hardened runtime, with Node's own entitlements less
   `get-task-allow` (`NodeEntitlements.plist`: JIT, unsigned executable memory, executable page
   protection off, library validation off for the native modules, dyld variables). Tauri then seals
   the app around it and leaves it as it is. The build ends by checking that the app and its Node
   name the same team. The release and its tarball keep Node's own signature. With no certificate
   on the Mac, Node keeps its own and the build says Login Items will name Node.
2. **The server's service runs Node itself.** `chips up` writes `runtime/node lib/chips.mjs serve`
   under the install's stable link, where it wrote `bin/chips serve`, a shell script nobody signs.
   On Linux the unit runs the same.
3. **Both plists name the app.** Where the program a launch agent runs is inside an app
   (`Chips.app/Contents/Resources/chips/runtime/node`), the SDK's keep and `chips up` name that
   app's `CFBundleIdentifier`, from its `Info.plist`: `chat.chips.desktop`, or a walk build's own.
   An install from `install.sh`, or a bridge on a Node of its own, names none.
4. **Where it reaches.** A plist already written keeps what it says until it is written again. A
   bridge carries the SDK it was built with, so a kept bridge names the app once each bridge is
   built on this SDK and published.
5. **Proved, and not.** Tests write plists into a scratch home and run no `launchctl`. A copy of the
   installed app's `chips`, signed with his Apple Development identity, names team `W9K648WB82`,
   loads better-sqlite3 and sharp, and serves on a scratch port. What the notice and Login Items
   say needs a real install and a real launch agent, his to run (`testing/mac.md`).

## Addendum, 23 October 2026: phase 6, the bridges on npm

His words: "I ran it and all four are published. Check them and turn the cards on."

1. **Published.** `@chipschat/hermes`, `@chipschat/opencode`, `@chipschat/acp` and
   `@chipschat/openclaw` are on npm at 1.0.0, Apache-2.0. Each was packed from its own repository's
   pushed head after its tests passed, and published by him.
2. **The cards say so.** The five bridge cards say `published: true`, so neither note says "Not
   published yet". The gallery's guardrail lists the four packages as ours, and a card may say it
   is published only when the package it fetches is.
3. **Checked against npm itself.** A release from this change ran on a bare home, with nothing but
   `/usr/bin:/bin` on its `PATH`, against a scratch server, with `CHIPS_KEEP=off`. Each card's line
   from the scratch gallery fetched 1.0.0, matched npm's SHA-512, ran on the Node the release
   carries, and stopped at its harness's own check: OpenClaw isn't set up, the ACP adapter isn't
   installed (Claude Code, then Codex reusing the same download), Hermes has no key for its API
   server, and OpenCode isn't installed. None joined, since that home holds no harness.
4. **And with the harness there.** The same release, on a scratch home and against a scratch
   server, with `CHIPS_KEEP=off`: Hermes's card, with a copy of this Mac's `~/.hermes/.env`,
   checked that its API server answers on 8642, joined and said hello. OpenCode's card, with the
   real `opencode` on its `PATH`, started its own `opencode serve`, joined and said hello. Each was
   stopped with all it started; the live bridges and 4431 were not touched.

## Addendum, 24 October 2026: `chips connect <id>` with no link keeps the harness's rooms

His words: "Do B: add `chips connect <id>` without a link that reuses the harness's kept key, move
Hermes and OpenCode onto the npm bridges with it (ask the busy sessions first), and check OpenClaw,
Claude Code and Codex from npm against a scratch Chips."

1. **Why.** A new link makes `join()` take it up as a new harness, with a new key and a new room.
   A harness he connected by hand, from a bridge's checkout, would leave its rooms on the old
   harness if moved to the bridge from npm with a new link.
2. **What.** `chips connect <id>` with no link, and none in `CHIPS_JOIN_LINK`, fetches and runs the
   card's bridge as with a link, and the bridge joins with the key kept for its harness: the
   card's name, at the server `join()` finds (`CHIPS_URL`, then `server.json`). `join()` asks
   nothing then, and no hello is said again. The SDK's `keptJoin(name)` says whether such a key
   is kept. Where none is, `chips connect` says a link is needed, made from Connect a harness,
   before it downloads anything.
3. **Its environment.** The caller's environment reaches the bridge as before, and the service it
   keeps carries every `CHIPS_` setting (`keepEnvironment`), so `CHIPS_URL` and `CHIPS_NO_KEYCHAIN`
   find the same key again after a restart. Keep replaces a service it wrote before in place, by
   label.
4. **Its steps.** With `--json`, the `joining` step says "With the key it already has".
5. **The other three from npm, against a scratch Chips.** Each on a scratch home, with
   `CHIPS_KEEP=off`, from the `chips` Chips for Mac carries. OpenClaw, against a scratch OpenClaw
   2026.9.6 on 18790 (2026.10.7 needs Node 24.22.1 or 26.12.1, and this Mac has 22 and 26.11):
   `@chipschat/openclaw` 1.0.1, its gateway answers, joined, hello said, OpenClaw its Main agent.
   Claude Code and Codex, with the adapters installed here on their `PATH`: `@chipschat/acp` 1.0.1
   started each adapter and stopped at its sign-in, "Claude Code isn't signed in" and "Codex isn't
   signed in". Their sign-in lives in his keychain and `~/.codex`, which a token refresh writes
   to, so it was not pointed at.

## Addendum, 25 October 2026: the pasted line keeps the link off the command line too

The second security review's SEC-50: decision 3's "never as a word on the command line" held only
for Chips for Mac. The line for another computer was `curl … | sh -s -- connect <id> '<link>'`, so
`sh` held the link among its words through the download and handed it to `chips connect` the same
way, and anybody else on that computer could read it with `ps` and redeem it first.

- **The line is `curl -fsSL https://chipschat.ai/install | CHIPS_JOIN_LINK='<link>' sh -s --
  connect <id>`.** `install.sh` hands its environment on to `chips connect`, which takes the link
  from `CHIPS_JOIN_LINK` when none follows the id. The id is the card's own, not read from its
  command.
- **The card's own line,** for a computer with Chips already, is `CHIPS_JOIN_LINK='<link>' chips
  connect <id>`, shown once the link is made.
- A quote in a link is written so that the shell keeps it inside the link.
- `chips connect <id> '<link>'` still works, for lines copied before this.

## Addendum, 25 October 2026: Connect on this Mac runs the card the sheet named

The second security review's SEC-51: Chips for Mac's Connect sheet draws a card's name and words
from the workspace's server (`/v1/connectors`), and `connect_here` passed only the card's id, so
the carried `chips connect` ran its own card of that id. A server could call `claude-code`
"Calendar helper", and the person would connect their Claude Code to that workspace.

- **The sheet's name goes with the id.** `connect_here` takes the card's name as the sheet showed
  it and hands it to `chips connect` in `CHIPS_CARD_NAME`, as Run hands over the command the person
  saw. `chips connect` refuses, before it downloads anything, when that isn't its own card's name:
  "This workspace's card says Calendar helper, but claude-code here connects Claude Code, so Chips
  didn't connect it." The variable goes no further than that check: the bridge, and the service it
  keeps, don't get it.
- **Why not draw the sheet from the local cards.** That needs a new command for the page to read
  the carried cards, and every part of the sheet to take them in place of the server's. The check
  uses the card `chips connect` already looks up. The words under the name still come from the
  server; the name says which harness connects.
