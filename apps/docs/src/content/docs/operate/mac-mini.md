---
title: A Mac mini
description: The solo server — Chips on a Mac mini in the closet, reachable from your laptop and your phone, started with the machine, with your harnesses beside it.
sidebar:
  order: 2
---

By the end of this page a Mac mini runs Chips from login, the desktop app on your laptop finds
it by itself, your phone reaches it, and the harnesses on the mini are connected to it. One
process, one SQLite file, one folder of attachments; a backup is a command.

## Install it

A release, as in [Install](/start/install/), and `chips up`:

```sh
curl -fsSL https://chipschat.ai/install | sh
chips up --reach lan
```

`--reach lan` lets the laptop and the phone on your Wi-Fi reach it; `--reach tailnet` does the same
over Tailscale, at home and away. `chips up` makes the workspace, starts Chips as a login service,
and prints a QR for the phone. A checkout's `pnpm chips up` runs in its terminal instead, with no
service, so a server that stays up wants a release.

Over SSH, `chips up` opens no browser on the mini's screen. It prints the link, and a line to run
on your laptop, such as `ssh -L 4431:127.0.0.1:4431 mac-mini.local`, which brings the mini's port
to the laptop so the link opens in its browser, already paired.

For video, install ffmpeg too:

```sh
brew install ffmpeg
```

With it, a video sent from a phone gets a poster and a length in the space, and the server makes
a copy that plays in any browser, a transcode that runs after the upload finishes, one video at
a time. Without it, a video is kept and played as it came. The server finds `ffmpeg` in
`/opt/homebrew/bin` even when started by its launch agent, whose `PATH` does not include it;
`CHIPS_FFMPEG` and `CHIPS_FFPROBE` point it elsewhere. Its log says *video tools found* or
*ffmpeg and ffprobe were not found* as it starts.

For voice notes with what was said written down, install whisper and one model for it:

```sh
brew install whisper-cpp
mkdir -p ~/Library/Application\ Support/Chips/models
curl -L -o ~/Library/Application\ Support/Chips/models/ggml-large-v3-turbo-q5_0.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
```

The model is about 550 MB and hears many languages, including more than one in a note. With it,
a voice note from a phone is transcribed as it arrives, before the upload answers, so the message
that carries it carries the words too: a two-minute note takes about ten seconds on an M4 Mac
mini. Nobody's voice leaves the machine. Without whisper or a model, a voice note is kept with its
length and no words. The server looks for a model in the data directory's `models` folder, the
turbo model first; `CHIPS_WHISPER` and `CHIPS_WHISPER_MODEL` name the program and the model
outright. Its log says *whisper found* or *whisper or its model was not found* as it starts, and
*voice note transcribed* with how long it took, for each note.

## Let the network reach it

Chips binds `127.0.0.1` unless told otherwise, and says so: *Only this machine can reach it.* With
`--reach lan` or `--reach tailnet`, `chips up` binds every address, and puts the address on your
network, or the tailnet's, in the QR. Allow incoming connections to port 4431 in the mini's
firewall, if it is on: macOS asks once.

What that exposes, on port 4431, to anyone on the network:

- **The page**, and `GET /v1/health` — the version, the protocol range, the mode, the time.
  Nothing a stranger could not guess.
- **The API**, which answers nothing without a credential: a person's device key, or a harness's
  token. An unknown and a revoked token get the same `401`, so a probe learns nothing.
- **`POST /v1/pair`**, which takes a pairing code. A code is six characters, good for fifteen
  minutes, and works once; it is a capability, printed at the terminal and never written down.
- **mDNS**: the service `_chips._tcp`, its name ("Chips on Arjun's Mac mini") and port, and a TXT
  record with the workspace id, the machine's name, the protocol version and the server version. No secret goes in it, because a broadcast goes to
  the whole segment.

The dev-mode routes — the ones that mint a pairing code with no credential — are not registered
at all when the server is not bound to loopback, whatever the configuration says.

## Start it with the machine

`chips up` writes a launch agent, `~/Library/LaunchAgents/chat.chips.serve.plist`, that starts
Chips when you log in and starts it again if it stops. It carries the `CHIPS_` settings exported
where you ran `chips up`, and `chips up` keeps the ones it already has; export a new one and run
`chips up` again to write it in. It logs to `~/Library/Logs/Chips/chips.log`, with tokens and
signatures redacted.

```sh
launchctl print gui/$(id -u)/chat.chips.serve      # is it running, and with what
launchctl kickstart -k gui/$(id -u)/chat.chips.serve   # restart it
chips down                                         # stop it, until chips up again
```

The agent is in your login session, so it starts when you log in, and the login keychain — where
`chips connect` puts a harness's token — is open to it. A Mac mini that is a server wants
automatic login and *Prevent automatic sleeping* in Energy settings; both are System Settings,
not Chips.

## Pair the laptop and the phone

The machine that runs Chips is paired by construction, so from the mini you can issue a code for
any other device:

```sh
chips pair --issue
```

prints a code, good for fifteen minutes and once, and the same code as a QR that carries the
mini's network address. On the laptop, [Chips for Mac](/operate/desktop/) finds the mini on the
network by itself and asks for the code; a phone scans the QR from inside the Chips app
([Get Chips on your iPhone](/start/iphone/)). The QR `chips up` printed works the same way.

It works whether or not the mini's own device is still in the workspace. A running server leaves
an operator token beside its database, owner-only, and `chips pair --issue` uses it when its own
device has been withdrawn ([ADR 0048](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0048-the-machine-that-runs-the-server-can-always-issue-a-pairing-code.md)).

The CLI on the laptop pairs with the mini too, and then `chips connect` runs there against it:

```sh
chips pair --server http://mini.local:4431 ABC-DEF
chips doctor
```

## Harnesses on the mini, and off it

**A harness with a card** (OpenClaw, Hermes, OpenCode, Claude Code or Codex): **Agents → Connect a
harness**, its card, and the line it gives, run on the machine the harness runs on. See
[the gallery](/connect/gallery/).

**Jacobian**, on the mini itself: `chips connect custom --name Jacobian --no-dial` there,
put the four lines it prints into `~/.jacobian/config.yaml` as the `channels.chips` block with
`server_url: http://127.0.0.1:4431` — the two share the machine — and restart Jacobian.
[Jacobian](/connect/jacobian/) has the rest.

**Anything else**: `chips connect custom` wherever a paired CLI is, and give the harness the
four lines with the mini's address in `CHIPS_URL`. [Custom](/connect/custom/).

## What is where, and who can read it

| Thing | Where | Permissions |
| --- | --- | --- |
| The event log and every projection | `~/Library/Application Support/Chips/chips.db` | Yours: whoever can read the file can read the workspace. Tokens are stored as digests; device keys as public halves. |
| Attachments, once by digest | `attachments/` beside it | The same |
| Uploads still arriving, one file each ([in pieces](/reference/http/#uploading-in-pieces)) | `upload-pieces/` beside it | The same. Deleted when the upload finishes or its slot expires. |
| The running server's operator token | `operator.<port>.token` beside it | `0600`. Issues a pairing code for the owner, and nothing else; whoever can read it can read the database beside it. Made at every start, removed when the server stops. The port is in the name so a second server sharing the directory cannot write over it. |
| The server's own log | `~/Library/Logs/Chips/chips.log` | Tokens, signatures and anything called `secret` are redacted at every depth |
| This machine's device key | `~/.config/chips/device.json` | `0600`, in a `0700` directory |
| A harness's token, on the machine that connected it | The login keychain; else `~/.config/chips/secrets.json` | Keychain, or `0600` |
| What was connected | `~/.config/chips/connections.json` | `0600`. Never a token. |
| Each bridge's settings, memory and keys | `~/Chips/.bridges/<bridge>` | `0700`: readable by you alone |
| Each agent's own folder | `~/Chips/Agents/<kind>/<agent>` | Yours: whoever can read it can read the agent's work |

`chips doctor` says which store the token is in, and whether the server still knows this device.

## Backups

The log is the truth, so a backup of the workspace is a backup of everything the server holds:

```sh
chips export ./chips-backup-$(date +%F)
```

writes the log, the registry — people, harnesses, device keys, token digests — and the
attachment files to a folder, owner-only, and `chips import` reads it into an empty database
and rebuilds every projection from the log. **The folder holds credentials**; keep it as you
would a password. A copy of `~/Library/Application Support/Chips` taken while the server is
stopped (`chips down`) is the same thing with less ceremony. See [the chips command](/operate/cli/#chips-export-and-chips-import).

What your harnesses keep on this machine is outside the workspace, and outside an export: each
agent's folder in `~/Chips/Agents`, and each bridge's settings and memory in `~/Chips/.bridges`.
Copy `~/Chips` as well to keep them. `.bridges` holds keys, so keep that copy as you would a
password too.

## From outside your network

A phone on the road reaches a Mac mini through [the relay](/operate/relay/), once you turn it on:
**Relay** in You, in the app, or `chips up --reach relay`. The mini dials out to it, the phone
connects to it, and nothing is forwarded on your router. The relay carries ciphertext it cannot
read, and a phone on the home network never touches it.
The older ways still work: [**Tailscale**](/operate/tailscale/), which also puts the server on
`https://` for your browsers; another VPN, with the mini's private address typed into the app; or
[your own domain](/operate/own-domain/), with Caddy on the mini or a tunnel. Set
`CHIPS_PUBLIC_URL` to the address the world uses when it is not the one the server is bound to, so
the URLs a harness on another machine is given for attachments carry it: run `chips up` again with
it exported, as [Tailscale](/operate/tailscale/#tell-the-server-its-name) shows. Notifications
reach the phone through the Chips push relay, with nothing to set
([what push needs](/operate/mobile/#what-push-needs)).

## Updating

```sh
curl -fsSL https://chipschat.ai/install | sh
chips up
```

The install keeps the version before beside the new one and moves `current`, which the launch
agent runs from, and brings each harness's bridge up to date. The server keeps running the old
version until `chips up`, which finds it older than itself and starts it again on the new one,
as [Install](/start/install/#updating) says.

Migrations run on start. The app reconnects on its own when the server comes back.
