# `chips`

The command line. One binary, and no state of its own beyond a device key and a note of what it
connected. From the checkout it is `pnpm chips …`.

```
chips serve                     run the server, print a pairing code, advertise it
chips pair <code>               pair this machine with a running server
chips pair --issue              a code for another device, from this one
chips connect <harness>         point a harness at this workspace
chips disconnect <harness>      undo what connect wrote
chips remove <harness>          remove a harness from the workspace; its history stays
chips doctor                    check everything, and say what to do about it
chips conformance <adapter>     walk an adapter through the golden scenario; print the checklist
chips project clone <room>      the room's project, cloned here: your pushes show in the room
chips export <folder>           write this workspace to a folder
chips import <folder>           read a workspace folder into an empty database
```

## What it holds, and where

| Thing | Where | Why there |
|---|---|---|
| The device key | `~/.config/chips/device.json`, `0600` | Node has no non-extractable key store, so this is a real difference from the browser, where the key cannot be read back at all. `doctor` says which you have. |
| A harness's token | The login keychain on macOS, else `~/.config/chips/secrets.json`, `0600` | A token is a credential; the key is not a credential the server would accept on its own. |
| What was connected | `~/.config/chips/connections.json` | Ordinary reading: which harness, which server, which keychain account. Never a token. |
| The workspace | Wherever `CHIPS_DATA_DIR` says, `./.chips` by default | It is the thing you back up, export and move. The CLI's own files are not part of it. |

## Invariants

- **A command that changes somebody's machine says so first.** `connect` lists every change and
  stops unless the answer is yes; `--yes` is for a script that has already decided.
  (`commands/connect.test.ts`, "changes nothing when the answer is no".)
- **A rotation issues before it revokes.** The harness is never without a credential, and a
  rotation that fails halfway leaves it connected rather than mute. (`connect.test.ts`,
  "the new token is stored before the old one is withdrawn"; ADR 0023.)
- **An export carries the log and the registry, never a projection.** The projections on the
  other side exist because `rebuild` replayed the log through the code live traffic uses, which
  is what makes "identical projections" a real check. (`commands/transfer.test.ts`.)
- **Every check `doctor` makes can say what to do about its own failure.** A check that cannot
  is a log line. (`commands/doctor.test.ts`, "prints the fix under every failure".)
- **The pairing QR carries an address another device can reach, and only one the server is
  listening on.** A QR that says `127.0.0.1` works on exactly one device, and it is not the one
  holding the camera; a QR that names a network address the server is not bound to opens
  nothing. (`commands/serve.test.ts`.)
- **The machine that runs `serve` is paired by construction.** Whoever started it can read its
  database, so a code would prove nothing; a device already there is left alone.
  (`commands/serve.test.ts`, "pairs the machine it runs on, once".)
- **A custom harness's token is printed once, for its own environment**, in the four lines
  `chips conformance custom` prints and the Custom guide reads. (`commands/connect.test.ts`.)

## Packaging

`packaging/install.sh` is the curl installer: no sudo, everything under `~/.local`, and it names
its four steps before it takes them. `packaging/chips.rb` is the Homebrew formula, a draft until
there is a release to point it at. `packaging/launchd/` holds the launch agent template for
`chips serve`, with four placeholders the docs' one-line `sed` fills in.
