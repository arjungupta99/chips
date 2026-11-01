# Connecting a harness in one step

Date: 22 October 2026
Status: Approved by Arjun on 22 October 2026, with the newest release in the card's major for each
bridge. Fixes HS-1, HS-2 and HS-3 (testing/findings.md). The decision is
[ADR 0218](../decisions/0218-a-harness-connects-in-one-step-with-its-bridge-from-npm.md). Phases 1
to 5 were built on 22 October 2026 and phase 6 on 23 October, once he had published the
bridges (docs/STATUS.md).

His words: "I do plan to make chips public. Why not keep them separate?", "and install them based
on what harness the person selects?", and "In either case the installation should be smooth and
easy."

This replaces the first version of this plan, which carried all four bridges inside the Chips
release. The bridges stay separate. A person gets only the bridge for the harness they pick, and
only when they pick it.

## What a person does

They open **Connect a harness** in Chips and pick a card, say Hermes. What happens next depends on
where Hermes runs.

**Hermes is on this Mac.** The sheet has a **Connect** button. Chips for Mac downloads the Hermes
bridge, checks that Hermes is running, joins, and keeps the bridge running at login. The sheet
shows each step as it happens, and Hermes arrives in the app. There is no terminal.

**Hermes is on another computer**, such as a Linux server. The sheet shows one line to run there:

```sh
curl -fsSL https://chipschat.ai/install | sh -s -- connect hermes '<link>'
```

That line installs Chips on that computer if it isn't there yet, then connects Hermes the same way
the button does. If Chips is already there it skips the install, so running it is quick. Someone
who already has Chips there can also use the short form:

```sh
chips connect hermes '<link>'
```

In both cases:

- Nothing is installed until the person picks a harness, and then only that harness's bridge.
  Claude Code and Codex share one bridge, so whichever comes second reuses it.
- Nobody needs Node, npm, a clone or a config file. The bridge runs on the Node that Chips
  carries.
- If something is missing, such as Hermes's API server being off, the bridge says what to do in
  one plain sentence. The link stays good while they fix it, and running the same line or
  pressing Connect again picks up where it stopped.
- The person still needs the harness itself: Hermes with its API server on, OpenCode installed,
  the Claude Code or Codex adapter installed and signed in, or an OpenClaw gateway.

On a phone, or in a browser on another computer, the sheet shows the line, since the harness is
never on the phone.

## Where the bridges live

Each bridge stays in its own repository and is published from there as a public npm package:
`@chipschat/hermes`, `@chipschat/opencode`, `@chipschat/acp` and `@chipschat/openclaw`. They were
packed for npm on 17 October; nothing has been published yet.

- Each bridge is one file with nothing to install. OpenClaw's bridge today leaves its three
  OpenClaw packages outside its bundle. It will bundle them in, in its own repo, so it is one file
  like the others. Chips's own source and release carry nothing of OpenClaw, and the guardrail
  stays as it is.
- Each bridge ships on its own schedule. When a harness changes, its bridge is fixed and published
  the same day, with no Chips release.
- The bridges are Apache-2.0, and each is a worked example for someone writing their own harness.

## What `chips connect <id> '<link>'` does

1. Looks `<id>` up in the cards this Chips carries. The card names the npm package and the major
   version that speaks this server's protocol.
2. Downloads the newest release of that major from the npm registry, checks it against the
   registry's checksum, and keeps it in Chips's own data folder. It uses Chips's own Node, so no
   npm is needed. A bridge already downloaded is reused.
3. Runs the bridge with the link. The bridge checks its harness, joins, and installs its login
   service, as `npm run keep` does today.

Around that:

- `chips connect custom` stays as it is.
- `chips connect` on its own lists the harnesses this Chips can connect.
- `chips disconnect <id>` stops the bridge's service and removes its download.
- `chips uninstall` removes every bridge and service, so journey J6 still finds nothing left.
- A Chips upgrade updates the bridges it has to the newest of their major and restarts them.
- The CLI reads ids and packages from the cards, so its code names no harness.

Two small changes to the SDK's keep, so the service lasts:

- **It names Chips's Node by a path that survives an upgrade**: `~/.local/lib/chips/current/...`,
  or inside Chips.app for the Mac app. Today it names the real path, and an upgrade would leave
  that behind.
- **Its `PATH` starts with that Node**, so the ACP adapters, which are `#!/usr/bin/env node`
  scripts, run on a Mac with no Node installed.

All four bridges pick up the new SDK. OpenClaw and ACP are still on the 17 October SDK, and every
bridge's build is stale (made before ADRs 0200 and 0214), so all four are rebuilt anyway.

## The cards ship with Chips (HS-1)

- The release carries `connectors/connectors.json`, the same file as
  `apps/docs/public/connectors.json`. `releaseDefaults` points the server at it, so a server
  started by `chips up` or by the Mac app has cards from its first start. `CHIPS_CONNECTORS` still
  wins when set, so 4431 keeps reading the checkout's file.
- Each one-line card gains a `package` (the npm name and major), and its command becomes
  `chips connect <id> '{link}'`. The sheet builds the curl line and the Connect button from that.
  This changes the protocol's card type, so `gen:protocol` runs.
- The cards say "published" only once their packages are on npm. Until then the app keeps today's
  note on them.

## Chips for Mac

- **The Connect button** runs the Chips that the app carries, with `chips connect <id> '<link>'
  --json`. The CLI reports each step as a line of JSON (downloading, checking the harness, joining,
  keeping it running), and the sheet shows them in the ticking steps it already has (ADR 0190).
  A failure shows the bridge's own sentence and a Try again button.
- **The `chips` command in Terminal.** The app links `~/.local/bin/chips` to the Chips it carries
  when it runs Chips on this Mac, the way `install.sh` does, and says so. Then the short line works
  in Terminal too. `install.sh` sees that link and leaves it alone, so a Mac never ends up with two
  copies.
- The sheet's new layout (this Mac or another computer) gets a running mock first, for your look
  before it is built.

## Tests

- **CLI**: connect with a stand-in registry (download, checksum, reuse, a wrong checksum refused),
  an unknown id, `custom` unchanged, disconnect, uninstall, and `--json` steps.
- **connect-kit** (`tools/connect-kit/kit.mts`) accepts `chips connect <id> '{link}'` in place of
  `cd <folder> && ...`. It serves a bridge's freshly packed tarball from a stand-in registry, so
  each bridge's `npm run e2e` goes through the real download path.
- **gallery-runs-only-ours**: a one-line card is exactly `chips connect <its id> '{link}'` and
  names an `@chipschat` package.
- **A new journey, J7**, from a bare home with no Node: install, `chips up`, check the gallery has
  the five cards, then connect each from the stand-in registry. Each bridge must start on Chips's
  Node and stop at its own "can't find the harness" check.
- **J8**: the curl line with `connect` on a bare home installs Chips and connects in one go.
- **The Mac app**: the Connect button walked on this Mac against a scratch server, as the
  menu-bar walk was.
- After publishing, the harness setup scenario walked again by hand, all five cards, on a scratch
  home.

## Phases

1. **Bridges**, in their four repos: the keep change in the SDK, vendor it again, OpenClaw bundles
   its client, rebuild, and add `npm run release`. Ready to publish, not published.
2. **`chips connect <id>`** in Chips: download, check, run, disconnect, uninstall, upgrade, and
   `--json`, with their tests.
3. **The cards ship with Chips** (HS-1): the cards in the release, `package` on each card,
   `gen:protocol`, the kit and gallery tests.
4. **Another computer**: `install.sh` takes `connect`, and journeys J7 and J8.
5. **This Mac**: the mock for the sheet, then on your word the Connect button and the `chips` link.
6. **Publish** on your word, then turn the cards on and walk the scenario.

Phases 1 to 4 need nothing from you. Before phase 6 you create the `chipschat` npm org and run
`npm login`. The one-time password at publish is yours. No GitHub token is needed any more.

## Your calls, already made

- Bridges separate, fetched only for the harness the person picks.
- Chips will be public. The bridges go out with it as npm packages.
- The Mac app links the `chips` command (3A), and gets the Connect button (3B) now rather than
  later, so connecting on the same Mac needs no terminal.

My one pick inside this, which you can overrule: `chips connect` takes the newest bridge release
within the card's major version. That lets a bridge fix reach people the same day. Pinning an exact
version would guard against a bad publish, but every bridge fix would then wait for a Chips release.
