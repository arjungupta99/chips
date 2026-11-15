# Releasing Chips

How a version becomes something a person can install. Rewritten 5 October 2026 for ADR 0119 (a
release is one tarball per platform that carries its own Node), ADR 0120 (where an installed Chips
keeps its workspace) and ADR 0121 (`chips up`). The first version of this page, from 6 September,
weighed three ways to ship the natives; option 2 was taken.

## The thing to understand first

**A release on a private repository is private.** Arjun's ruling of 5 October 2026: "I am not
making anything public yet." So a release is workflow artifacts and a **draft** GitHub release that
he and anyone he gives access to can download, and `install.sh --from` installs the file. Nobody
else can install Chips until the repository is public, which is his call (M7.7). Then its published
releases are the download: `curl -fsSL https://chipschat.ai/install | sh` fetches from
`github.com/arjungupta99/chips/releases`, the newest at `latest/download/` and a version asked for
with `--version` at `download/v<version>/` (`CHIPS_DOWNLOAD_BASE` points it elsewhere).

## What a release is

One tarball per platform — `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64` — named
`chips-<version>-<target>.tar.gz`, and one `SHA256SUMS` for all of them. Inside each:

| Path | What it is |
| --- | --- |
| `bin/chips` | A POSIX shim: follows a link back to the install and runs the bundle with the Node beside it |
| `runtime/node` | The Node of `.node-version`, from nodejs.org, checked against its `SHASUMS256.txt` |
| `lib/chips.mjs` | The CLI and server, bundled by esbuild into one file, with the version built in |
| `lib/node_modules` | `better-sqlite3` and `sharp`, installed by that Node's own npm, pruned to this platform |
| `web/` | The web app, without source maps |
| `VERSION`, `LICENSE` | |

About 48 MB on a Mac. `tools/release/release.mjs` says all of this in code, and
`tools/guardrails/release.test.ts` tests it.

## Building one

On the machine whose platform you want:

```sh
pnpm release:build
```

builds the web app, fetches Node (cached in `~/.cache/chips-release`), installs the natives,
bundles, and writes `dist/release/chips-<version>-<target>.tar.gz` and `dist/release/SHA256SUMS`.
`--skip-web` uses `apps/web/dist` as it is. It builds only for the machine it runs on: the natives
are installed by the release's own Node, which has to run here.

Then prove it, from a bare home with no Node on the `PATH`:

```sh
pnpm journeys
```

J1 installs it with `install.sh --from`, starts it with `chips up`, and pairs a browser; J5 runs it
again and restarts it; J6 uninstalls it and finds no file left behind. The times each step took are
written to `dist/release/journeys.json`.

## Cutting one

CI does the building (`.github/workflows/release.yml`):

- [ ] `pnpm check` and the e2e suites pass on the Mac, and CI is green on the public repository.
- [ ] The version is bumped: root `package.json` is the version every tarball and `chips --version`
      carry. One version across the repository: `apps/desktop/package.json`, the Tauri config and
      `Cargo.toml` (with its lock) say the same, and the gate fails while they don't, since Chips
      for Mac compares its own version with the one its update feed names.
- [ ] The new version's entry heads `RELEASES` in `packages/core/src/about.ts` (ADR 0295): its date,
      one sentence, its changes as the App Store's What's New says them, what needs the
      computer too, and `dot: true` when the release adds something new enough to light the update
      dot (ADR 0296; a fix release leaves it out). About's What's new, chipschat.ai/about/ and the
      site's `releases.json` read it, and the gate fails while the newest entry is not the root
      `package.json`'s version.
- [ ] Tag the green commit `v<version>` and push the tag (**Arjun's**: pushing is his).
- [ ] The workflow builds the four tarballs on their own runners, walks the journeys on the macOS
      and Linux ones, runs the installer in clean Debian and Ubuntu containers with no Node, and
      attaches everything to a **draft** release with the `SHA256SUMS`.
- [ ] Signing it is **Arjun's**: `pnpm release:sign` on the draft's files, then
      `gh release upload v<version> SHA256SUMS.sig`. `install.sh` installs nothing from the web
      without that signature.
- [ ] Chips for Mac, on his Mac, where the Developer ID and the App Store Connect key are:
      `pnpm desktop release` builds the app with the release's Chips inside, signs every binary with
      the Developer ID, has Apple notarize the app and then the DMG, staples both, and checks
      Gatekeeper takes them, then packs the same app as `Chips.app.tar.gz`, signs it with the
      updater key (`~/.ssh/chips_mac_update.key`) and writes `latest.json` (ADR 0298). It writes
      no feed when the signature isn't from the key `tauri.conf.json` carries: no copy would take
      that update. Then
      `gh release upload v<version> dist/release/Chips.dmg dist/release/Chips.app.tar.gz
      dist/release/Chips.app.tar.gz.sig dist/release/latest.json`. Chips for Mac reads
      `latest/download/latest.json`, so the published release is what every copy updates to. The DMG
      and the update are for Apple silicon; an Intel Mac installs with `install.sh`.
- [ ] The first release Chips for Mac takes on its own (the one after the release that first
      carries the updater): on his Mac, **Restart now** in About brings the new copy up by itself,
      and a logout with a release waiting comes back on the new copy. Neither can be tried with a
      test copy, which `open` would run as its person (ADR 0298).
- [ ] Publishing the draft is **Arjun's**, and waits on his word that something may be public.
      Once published, it is what `latest/download/` serves.

`workflow_dispatch` runs the same thing without a tag, attaching nothing: the artifacts stay on the
run for seven days.

## After a bridge release

A computer keeps the bridges in its own data folder on the releases a signed list names
(`docs/proposals/bridges-keep-current.md`, rule 6): `bridges.json` and `bridges.json.sig` at
chipschat.ai. Signing it is **Arjun's**, on the Mac that holds the release key, after each bridge
release, and the two files go to the site with his word.

```sh
pnpm release:sign-bridges --out ~/Work/Chips/chips-website/public
```

- `--out` is the folder that holds the list signed before, since the withdrawn and urgent marks
  are kept from it. With no list there the script stops; `--first` is for the very first one.
- `--withdraw @chipschat/acp@1.0.31` takes a release back: computers on it go to the newest still
  allowed. `--urgent @chipschat/acp@1.0.32` skips the two days' wait. A mark that names a package
  the cards don't, or a version npm doesn't list, stops the script before anything is signed.
- The list says when it was signed. A computer never takes a list signed before the one it holds,
  and stops acting on one it couldn't read again for a week.

## Installing one, while releases are private

```sh
gh release download v0.2.0 --repo arjungupta99/chips --pattern 'chips-0.2.0-darwin-arm64.tar.gz' --pattern SHA256SUMS
sh packaging/install.sh --from chips-0.2.0-darwin-arm64.tar.gz
chips up
```

`install.sh` checks the file against the `SHA256SUMS` beside it.

## What a release does not do yet

- **The desktop app** is built on his Mac, not by the workflow; an Intel Mac has no DMG, and no
  update of its own.
- **The phone app** is a development build until TestFlight (Phase 6).
- **Homebrew** waits for a published release; the formula will install the tarball.
- **Docker** is in the install plan's §3.1 and not built.
