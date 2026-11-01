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
      carry. One version across the repository.
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
      Gatekeeper takes them. Then `gh release upload v<version> dist/release/Chips.dmg`. The DMG is
      for Apple silicon; an Intel Mac installs with `install.sh`.
- [ ] Publishing the draft is **Arjun's**, and waits on his word that something may be public.
      Once published, it is what `latest/download/` serves.

`workflow_dispatch` runs the same thing without a tag, attaching nothing: the artifacts stay on the
run for seven days.

## Installing one, while releases are private

```sh
gh release download v0.2.0 --repo arjungupta99/chips --pattern 'chips-0.2.0-darwin-arm64.tar.gz' --pattern SHA256SUMS
sh packaging/install.sh --from chips-0.2.0-darwin-arm64.tar.gz
chips up
```

`install.sh` checks the file against the `SHA256SUMS` beside it.

## What a release does not do yet

- **The desktop app** is built on his Mac, not by the workflow, and has no auto-update; an Intel
  Mac has no DMG.
- **The phone app** is a development build until TestFlight (Phase 6).
- **Homebrew** waits for a published release; the formula will install the tarball.
- **Docker** is in the install plan's §3.1 and not built.
