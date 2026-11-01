# 0119. A release is one tarball per platform that carries its own Node

Date: 5 October 2026
Status: Accepted, 5 October 2026. Phase 1 of `docs/proposals/install-onboarding-plan.md`. Settles
`docs/releasing.md`'s open decision ("how the two native modules get their binaries") as its
option 2. A single executable (Node SEA or Bun) stays M6.7's.

## Context

Nothing could be installed. The CLI's `bin` was `./bin/chips.ts`, run through tsx; every
workspace package exported its `src/index.ts`; `packaging/install.sh` downloaded a `chips.tar.gz`
that had never been built and expected a `bin/chips.js` that did not exist; the Homebrew formula
ran `npm install --ignore-scripts`, which would have skipped the prebuilds of `better-sqlite3` and
`sharp` and left a server that cannot open its database. The only way in was a checkout, Node 22,
pnpm and a build (`docs/proposals/install-onboarding-plan.md` §2).

Arjun asked for "an extremely easy installation flow". His ruling of 5 October: "I am not making
anything public yet", so the release is private for now: workflow artifacts and a draft release.

## Decision

1. **One tarball per platform**: `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`, named
   `chips-<version>-<target>.tar.gz`, with a `SHA256SUMS` beside them. Inside:
   - `bin/chips`, a POSIX shim that follows a link back to the install and runs
     `runtime/node lib/chips.mjs`;
   - `runtime/node`, the Node of `.node-version`, from nodejs.org, checked against its sums;
   - `lib/chips.mjs`, the CLI and server bundled by esbuild into one ESM file for Node 22, with
     `__CHIPS_RELEASE__` set to the version;
   - `lib/node_modules`, `better-sqlite3` and `sharp` installed by that Node's own npm, so their
     binaries are built for its ABI, with other platforms' builds and sharp's wasm fallback pruned;
   - `web/`, the web app without source maps;
   - `VERSION` and `LICENSE`.
2. **Built natively**, one runner per platform (`tools/release/build.mjs`; CI's
   `release.yml`). The natives are installed by the release's own Node, which has to run on the
   machine building it.
3. **Pretty logs are a stream, not a transport.** A pino transport loads its target by name in a
   worker, which a bundle has no module for. `createLogger` formats pretty lines on its own thread.
4. **`install.sh` installs a tarball**, from `--from <file>` or from `CHIPS_DOWNLOAD_BASE`, checks
   its SHA-256, unpacks it into `~/.local/lib/chips/<version>`, points `current` and
   `~/.local/bin/chips` at it, and offers to add `~/.local/bin` to the shell's profile. No Node,
   no compiler, no sudo. musl is refused with a sentence.
5. **`chips --version`** says `chips <version>`, or `chips 0.0.0 (from a checkout)`.

## Consequences

- A release is about 48 MB on a Mac (Node is 108 MB of the 135 MB unpacked). It installs in about
  2 s and starts in under half a second (`journeys.json`, 5 October 2026).
- `chips conformance scout` needs a checkout: Scout runs from `examples/scout` through tsx, which
  a release does not carry. The other commands are in the bundle.
- The Homebrew formula and a public download base wait for anything to be public; the formula
  installs the tarball, not `npm install`, when it does.
- `install.sh` is tested for real (`tools/guardrails/install-script.test.ts`): layout, an upgrade,
  a bad sum, another platform's tarball, no sums at all.

## Addendum, 26 October 2026: SHA256SUMS is signed, and install.sh checks it (SEC-36)

The first security review's SEC-36: `install.sh` took its sums from the same host as the
tarballs, so whoever held that host could hand out a release of their own with sums to match. On
Arjun's word, 26 October ("Use an SSH signing key kept on this Mac"), a release's `SHA256SUMS` is
signed with a release key, and `install.sh` checks the signature before it trusts a sum.

- **The key** is an Ed25519 SSH key, `~/.ssh/chips_release`, on the Mac releases are made on.
  Its public half is written once, as `SIGNER` in `packaging/install.sh`, in the allowed-signers
  shape `ssh-keygen` reads: principal `release@chipschat.ai`, namespace `chips-release`.
- **`pnpm release:sign [folder]`** (`tools/release/sign.mjs`) signs `SHA256SUMS` into
  `SHA256SUMS.sig` with `ssh-keygen -Y sign`, refuses a key that isn't the one `install.sh`
  carries, and checks the signature as the installer will before it is uploaded. CI's draft
  release is unsigned until it is run, since the key never leaves this Mac.
- **`install.sh`** downloads `SHA256SUMS.sig` beside `SHA256SUMS` and installs nothing unless
  `ssh-keygen -Y verify` holds it to `SIGNER`; then the tarball is checked against its sum as
  before. A file you already have (`--from`) is checked the same way when the signature is beside
  its `SHA256SUMS`, and is installed with a line saying so when it isn't: a build of your own is
  the case it is for.
- The natives under the release were pinned the same day, by a lock (SEC-36's other half).

What it leaves: `install.sh` itself still comes from chipschat.ai over TLS, so whoever holds that
site can hand out a script that carries another key. The signature covers the download host,
where the tarballs live; the script is short so that it can be read before it runs. Losing the
key means a new one in `SIGNER`, and a release signed with it; the old releases stay checkable
only by an `install.sh` that carries the old key.

Tests: `tools/guardrails/install-script.test.ts` installs from a download host on `file://` with a
copy of the script that trusts a test key, and refuses an unsigned release, one signed by another
key, and one whose sums changed after signing; `release.test.ts` holds `SIGNER` to the principal
and namespace signing uses.
