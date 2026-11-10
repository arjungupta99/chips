---
title: Install
description: Two lines from a release, or a checkout, and every setting.
sidebar:
  order: 2
---

## From a release

A release is one file per platform with everything inside it: Chips, its own Node, and the web
app. Nothing else needs to be on the machine — no Node, no compiler, no checkout — and nothing
asks for your admin password. The one exception is Linux over SSH, where keeping Chips running
after you log out can take one `sudo` line ([below](#chips-up)).

```sh
curl -fsSL https://chipschat.ai/install | sh
chips up
```

`install.sh` works out the platform (macOS or Linux, Apple silicon, Intel or ARM), checks that
`SHA256SUMS` is signed with Chips's release key and that the file matches its SHA-256, unpacks it
into `~/.local/lib/chips/<version>`, and points `~/.local/bin/chips` at it. The signature is checked
with OpenSSH's `ssh-keygen` (8.1 or later, on macOS and every current Linux); a release downloaded
without one is not installed, and a file you already have says so when no signature is beside it. If `~/.local/bin` is not on your `PATH` it offers to add it to your shell's profile, once, for the
next terminal; `--no-path` leaves the profile alone and prints the line instead. Either way the
line it prints to run next, `~/.local/bin/chips up`, works in the terminal you're in. Installing a newer version keeps the older
one beside it and moves `current`.

### `chips up`

`chips up` is the first run, and every run after it. A phone away from home reaches Chips through
[the relay](/operate/relay/): Chips's own, which is off until you turn it on, or one you set with
`CHIPS_RELAY_URL` before `chips up`. Once the relay is on, the phone's QR carries it and the
server's key beside the address, and the phone reaches Chips from anywhere, with nothing forwarded
on your router. Until then the QR carries the address alone, and works where that address does.

`chips up` asks one question: who should be able to reach Chips?

- **Your devices, over Tailscale**, offered first when this machine is on a tailnet. Devices on
  the tailnet reach Chips directly, at home and away. Chips also answers on the home network.
- **Your devices, anywhere, through the Chips relay**, offered first when there is no tailnet,
  and after the Wi-Fi when there is. A phone reaches Chips from anywhere through
  `relay.chipschat.ai`, encrypted end to end, and directly on this Wi-Fi when it's home. You can
  also turn the relay on later, from the app.
- **Devices on this Wi-Fi.** A phone in the house reaches it directly. Allow incoming
  connections to Chips's port, 4431 unless you chose another, in this machine's firewall. macOS
  asks once when its firewall is on. On Linux, `sudo ufw allow 4431/tcp` with ufw, or
  `sudo firewall-cmd --permanent --add-port=4431/tcp && sudo firewall-cmd --reload` with
  firewalld.
- **Only this machine.** Nothing else reaches it directly. With a relay, a phone still pairs and
  reaches it through the relay. Without one, no phone can pair.

Then it makes your workspace if there is none, starts Chips as a login service — a launch agent on
a Mac, a systemd user unit on Linux — opens your browser already paired, and prints a QR for the
phone ([Get Chips on your iPhone](/start/iphone/)). Run it again and it only opens the browser and
shows the QR.

Over SSH it opens no browser. It prints the link instead, and a line to run on the computer you're
at, such as `ssh -L 4431:127.0.0.1:4431 my-server`. That brings Chips's port to your computer, so
the link opens there in your own browser, already paired.

```
  ✓ Made your workspace  ~/Library/Application Support/Chips
  ✓ Reachable over Tailscale at http://100.64.0.7:4431, and on this Wi-Fi
  ✓ Starts when you log in (`chips down` stops it)
  ✓ Opened in your browser, already paired

  Get Chips on your phone: scan this with its camera

  No Chips on it yet? The code leads to the App Store first.
  Or type it in Chips: the code KMR-M3P, the address http://100.64.0.7:4431
```

| Flag | What it does |
| --- | --- |
| `--reach tailnet\|lan\|relay\|local` | Answers the question, so nothing is asked. With a new answer, a running service of its own is rewritten. |
| `--yes` | Takes the first answer offered other than the relay, which waits for you to choose it. With nobody at the terminal and no flag, it is *only this machine*. |
| `--no-service` | Runs in this terminal instead of as a login service. Ctrl-C stops it. |
| `--no-open` | Prints the browser's link instead of opening it. |
| `--port <n>` | Another port than 4431. |
| `--json` | One line of JSON — `url`, `pair_link`, `phone_link`, `data_dir`, `log_file`, `service`, `reach`, `already_running`, `created` — and nothing else on stdout. |

The service runs with the `CHIPS_` settings that were set where you ran `chips up` (the
[table below](#configuration)), such as `CHIPS_PUSH_ACCESS_TOKEN` or `CHIPS_FFMPEG`, because
launchd and systemd read no shell profile. A later `chips up` keeps the ones the service has. To
change one, set it and run `chips up` again, as in `CHIPS_FFMPEG=/opt/ffmpeg/bin/ffmpeg chips up`.
To take one out, set it empty: `CHIPS_FFMPEG= chips up`. The service's file is readable by you
alone.

On Linux, a user's services run only while that user is logged in, unless systemd keeps them
running from boot. `chips up` turns that on (`loginctl enable-linger`) and says so. Where it isn't
allowed, as over SSH on most systems, it says to run `sudo loginctl enable-linger $USER` once.
Without it, Chips and your harnesses' bridges stop when you log out. A harness's bridge kept on a
Linux machine that doesn't run Chips turns lingering on the same way when it is kept, or says the
same line.

`chips down` stops the service and keeps it from starting at login until `chips up` runs again.
`chips uninstall` removes the service, the install, the link and the `# Chips` PATH line the install
added to your shell profile; it asks separately before it removes your workspace, and
`--remove-data` says yes, which on a Mac also removes the keys Chips kept in your login keychain. A launch agent `chips up` did not write — one
a checkout installed — is never replaced, stopped or removed.

### Where a release keeps things

| | macOS | Linux |
| --- | --- | --- |
| Your workspace: the database, attachments, spaces' projects and keys | `~/Library/Application Support/Chips` | `~/.local/share/chips` |
| Logs | `~/Library/Logs/Chips` | `~/.local/state/chips` |
| The install | `~/.local/lib/chips/<version>`, linked from `~/.local/bin/chips` | same |
| This machine's own credential, and what `chips connect` wrote | `~/.config/chips` | same |
| Each bridge's settings and memory | `~/Chips/.bridges/<bridge>` | same |
| Each agent's own folder (OpenClaw keeps its agents' folders in its own place) | `~/Chips/Agents/<kind>/<agent>` | same |
| Your folder, the copy of a space's project that Chips for Mac makes when you open it | `~/Chips/Projects/<space>` | |

`CHIPS_DATA_DIR` moves the workspace, and the database with it. `~/Chips` is not part of the
workspace: `chips export` does not write it, and `chips uninstall` leaves it, even with
`--remove-data`. A bridge from before 7 November moves its old folders (`~/.chips-acp`,
`~/chips-hermes` and the like) here itself, the first time a newer one starts.

A space's project is a git repository the server keeps under `projects/` in the workspace, beside
`attachments/`. Back up both with the database: a copy of the database alone leaves them out. Spaces'
projects need git 2.31 or newer on the machine the server runs on, found as `ffmpeg` is. Without it
the server says so as it starts, and everything else works. On a Mac, `xcode-select --install`
gives you one.

## From a checkout

### What a checkout needs

A release needs none of this: it carries its own Node.

| What | For | How to get it |
|---|---|---|
| Node 22.22.2 or newer | Everything. `pnpm install` refuses an older one | [nodejs.org](https://nodejs.org), or `brew install node` |
| pnpm 10.34.5 | Everything | On Node 22 or 24, `corepack enable`. On Node 25 or newer, which has no corepack, `npm install -g pnpm@10.34.5` |
| Python 3 and a C++ compiler | `pnpm install`, which builds `better-sqlite3` from source | On a Mac, `xcode-select --install`. On Debian or Ubuntu, `sudo apt install build-essential python3` |
| ffmpeg, if you want it | A video's poster and length, and a copy that plays in any browser | `brew install ffmpeg`, as [A Mac mini](/operate/mac-mini/) says |
| whisper.cpp and a model, if you want them | The words of a voice note | `brew install whisper-cpp` and one model, as [A Mac mini](/operate/mac-mini/) says |
| Rust 1.77 or newer, if you build the Mac app | [Chips for Mac](/operate/desktop/) | [rustup.rs](https://rustup.rs) |
| Xcode, if you build the phone app | [Building the phone app](/contribute/phone/) | The Mac App Store |

### Get it running

```sh
git clone https://github.com/arjungupta99/chips.git
cd chips
pnpm install
pnpm web:build
```

`pnpm web:build` builds the web app once. `chips serve` serves it at the server's own address —
which is what the QR it prints points at — so a browser, a phone and the server share one origin
and nothing needs a second port. Build it again after you pull.

Then:

```sh
pnpm chips serve
```

`pnpm chips` is the `chips` command, run from the checkout. Every command in these pages is
written as `chips …`; from a checkout, read `pnpm chips …`. If you would rather type `chips`,
from the repository's directory:

```sh
alias chips="pnpm --silent --dir \"$PWD\" chips"
```

`pnpm chips up` works from a checkout too. It runs Chips in the terminal rather than as a login
service, and keeps the workspace in `./.chips`.

## What `chips serve` does

It brings the database up to date, makes a workspace when there is none — one workspace and one
person, you — pairs the machine it is running on, prints a pairing code and the same code as a
QR, and advertises itself on the local network as `_chips._tcp` unless it is bound to loopback,
where nothing else could reach it. Then it serves: people, harnesses and the page, on one port.

From a checkout the workspace lives in `./.chips` — the database, the attachments beside it — in
whichever directory you started it from; a release keeps it in the place above. That directory is
the thing you back up; see
[the chips command](/operate/cli/#where-things-live).

By default it listens on `127.0.0.1`, so only the machine it runs on can reach it, and it says so
when it starts. To pair a phone or another computer — or to run it on a Mac mini that everything
else talks to — see [A Mac mini](/operate/mac-mini/).

## For development

`pnpm dev` runs the server in dev mode and the web app with hot reload on
`http://127.0.0.1:5173`, proxying to the server. Dev mode makes a demo
workspace with a person, a harness called Scout and a space, prints a pairing code, and writes
`.chips/demo.json` — Scout's token and the ids, mode `0600`, never to be committed — which the
end-to-end suites read to play Scout's side. Nothing runs as Scout by itself: to talk to a
harness, connect one as [Start here](/start/) does, with `pnpm chips connect custom` or
**Connect a harness** in the app. Dev mode is a laptop convenience, and the configuration refuses it
anywhere the server is not bound to loopback.

## Updating

**A release.** Run the install line again, then `chips up`. The line puts the new version beside
the old one and brings each harness's bridge kept here up to date; `chips up` starts the server
again on the new version, which keeps running the old one until then. Once it runs on the new one,
`chips up` removes the versions older than the one before it, which stays so you can go back with
`--version`. With Chips for Mac installed, the line installs nothing: `chips` is the app's own.

**Chips for Mac** doesn't update itself yet. Download it again from
[chipschat.ai/download](https://chipschat.ai/download), quit Chips, and replace the copy in
Applications. Then bring each harness's bridge up to date in Terminal:

```sh
~/.local/bin/chips connect --update
```

**A checkout.**

```sh
git pull
pnpm install
pnpm web:build
```

and start the server again. Migrations run on start. A database made before 4 September 2026 is
not readable by anything since: delete `.chips` and start again.

## Configuration

Every setting has a default, a place in a configuration file, and an environment variable. The
defaults are the numbers the plan fixes: a twenty second heartbeat, a sixty second idle close, a
thousand unacknowledged frames, a ten minute signed URL.

| Variable | What it sets | Default |
| --- | --- | --- |
| `CHIPS_HOST` | Address to bind. `0.0.0.0` for a server other machines reach. | `127.0.0.1` |
| `CHIPS_PORT` | Port | `4431` |
| `CHIPS_PUBLIC_URL` | How clients and harnesses reach this server from outside, when that is not the bound address: through a tunnel, a name, or a tailnet. Also the address a [pairing QR](/operate/mobile/#pair-it) carries. A harness on the server's own machine that connects at `127.0.0.1` is told that address instead. | — |
| `CHIPS_WEB_DIR` | The built web app to serve at `/`. | A release's own `web/`; from a checkout, `apps/web/dist` |
| `CHIPS_CONNECTORS` | Where the gallery's cards come from, when a person brings an agent ([ADR 0171](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0171-the-gallery-is-docs-content-the-server-hands-out.md)), and where `chips connect <id>` looks a harness up: a file, or an `https:` URL, of the docs' `connectors.json`. | A release's own `connectors/connectors.json`; from a checkout, the docs' `apps/docs/public/connectors.json` |
| `CHIPS_DATA_DIR` | Where the database, attachments and keys live | [The platform's place](#where-a-release-keeps-things); from a checkout, `./.chips` |
| `CHIPS_DATABASE_URL` | The database | `chips.db` in the data directory |
| `CHIPS_LOG_LEVEL` | `fatal` to `trace`, or `silent` | `info` |
| `CHIPS_LOG_PRETTY` | Human-readable logs for a terminal | `false` |
| `CHIPS_DEV_MODE` | Bootstrap a demo workspace on start and write its credentials beside the database. A laptop convenience, never on anywhere else. | `false` |
| `CHIPS_ATTACHMENT_SECRET` | Signs the URLs a harness gets for an attachment, and the grants a device hands its video player. Set it, and a URL outlives a restart; leave it, and the server makes one per process, and a video playing from a grant stops at a restart until it is tried again. | — |
| `CHIPS_PASSKEY_ORIGINS` | The web origins a [passkey](/operate/people/#passkeys) may be made and used from, comma-separated, besides the server's own public address and loopback. | — |
| `CHIPS_RELAY_URL` | The [relay](/operate/relay/) this server dials out to, so a phone away from home reaches it: `wss://relay.example`. Leave it, and the server has the Chips relay behind its owner's switch, off until an owner turns it on; until then it is reachable on its own network and nowhere else. | — |
| `CHIPS_RELAY_HOST`, `CHIPS_RELAY_PORT` | Where `chips relay` listens, when this machine is the relay. | `127.0.0.1`, `4440` |
| `CHIPS_RELAY_MAX_SESSIONS_PER_SERVER` | How many phones the relay holds open for one server at once. | `32` |
| `CHIPS_RELAY_ALLOW_KEYS` | The servers `chips relay` serves, by their relay keys (`relay.key` in a server's `GET /v1/health`, asked on its own machine), comma-separated. Others are turned away. | any server |
| `CHIPS_RELAY_COUNTS_FILE` | Where `chips relay` appends each day's counts, a line of JSON per UTC day: how many servers, sessions and bytes, never which. Unset, the day is only logged. | — |
| `CHIPS_PUSH_URL` | Where a push to a phone is posted. Unset, it goes to Expo's service with `CHIPS_PUSH_ACCESS_TOKEN`, and through the Chips push relay without it ([ADR 0246](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0246-chips-sends-pushes-for-any-server-through-its-relay.md)). Expo holds the APNs and FCM credentials so this server does not; what leaves here is a token, two fixed words and two ids, never the ask itself. | Expo's, or the Chips push relay |
| `CHIPS_PUSH_ACCESS_TOKEN` | The Chips app's Expo access token. Its Expo project has enhanced security on, so Expo takes its pushes only with one. A server with it posts to Expo itself; a server without it sends through the Chips push relay, which has it, and needs nothing set ([ADR 0246](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0246-chips-sends-pushes-for-any-server-through-its-relay.md)). On a relay, it opens the push door. | — |
| `CHIPS_HEARTBEAT_SECONDS` | How often the server pings a socket | `20` |
| `CHIPS_IDLE_TIMEOUT_SECONDS` | When a silent socket is closed | `60` |
| `CHIPS_MAX_UNACKED_FRAMES` | How far behind a consumer may fall | `1000` |
| `CHIPS_SWEEP_SECONDS` | How often approvals past their expiry and questions past their timeout are resolved by their fallback | `15` |
| `CHIPS_MAX_MESSAGE_BYTES` | The longest message | `65536` |
| `CHIPS_MAX_ATTACHMENT_BYTES` | The largest upload the server takes. A workspace caps photos, videos and files under it from **You → Attachments**. | `104857600` |
| `CHIPS_MAX_PROJECT_BYTES` | The most a space's project may hold, its history included. A push past it is refused, and so is a file in it over the workspace's cap for files. | `1073741824` |
| `CHIPS_FFMPEG` · `CHIPS_FFPROBE` | Where `ffmpeg` and `ffprobe` are, for a video's poster and a copy that plays in any browser. Unset, the server looks on its `PATH`, then in `/opt/homebrew/bin` and `/usr/local/bin`; found nowhere, a video is kept as it came. | found |
| `CHIPS_WHISPER` | Where `whisper-cli` is, which writes down what was said in a voice note. Looked for as `ffmpeg` is; found nowhere, a voice note is kept with no words. | found |
| `CHIPS_WHISPER_MODEL` | The whisper model, a `ggml-*.bin` file. Unset, the best known one in the data directory's `models` folder, `ggml-large-v3-turbo-q5_0.bin` first. | found |
| `CHIPS_MAX_PENDING_APPROVALS_PER_HARNESS` | How many asks one harness may have open | `50` |
| `CHIPS_SIGNED_URL_TTL_SECONDS` | How long a harness's attachment URL holds, and a device's grant for a photo; a grant to play a video holds for its length and this, an hour at most | `600` |

A boolean reads `true`, `1`, `yes` or `on` as on and `false`, `0`, `no` or `off` as off, in any
case; anything else is a configuration error that names the variable, and the server does not
start.

The full list is in `packages/platform/src/config/load.ts`, which is also the only file in Chips
that reads the environment.
