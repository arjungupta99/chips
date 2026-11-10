---
title: The chips command
description: up, down, uninstall, serve, pair, connect, disconnect, remove, doctor, conformance, export and import — what each one does and what it changes.
sidebar:
  order: 3
---

One command, and everything it does says what it is about to change to your machine before it
changes it. From a checkout it is `pnpm chips …`; once installed, `chips …`
([Install](/start/install/)). A flag takes its value after a space or an `=`, as in
`--server=http://mini.local:4431`, and a flag `chips` doesn't know is refused rather than ignored.

```
chips up                        start Chips, open it in your browser, show the phone's code
chips down                      stop the login service `chips up` installed
chips uninstall                 remove an installed Chips (your workspace is kept unless you say)
chips serve                     run the server, print a pairing code, advertise it
chips pair <code>               pair this machine with a running server
chips pair --issue              a code for another device, from this one
chips join <link>               join with a link Chips made; eval "$(chips join <link>)" sets the four lines
chips connect                   what this Chips can connect
chips connect <id>              connect a harness from its card, the link in CHIPS_JOIN_LINK: fetch its bridge, join, keep it running
chips connect custom            point a harness of your own at this workspace
chips connect --update          bring each bridge here to the newest of its major, and start it again
chips disconnect <id>           stop a harness's bridge and remove it, or undo what connect custom wrote
chips remove <harness>          remove a harness from the workspace; its history stays
chips doctor                    check everything, and say what to do about it
chips conformance <adapter>     walk an adapter through the golden scenario; print the checklist
chips project clone <space>      the space's project, cloned here: your pushes show in the space
chips export <folder>           write this workspace to a folder
chips import <folder>           read a workspace folder into an empty database
chips --version                 which chips this is
```

## `chips up`, `chips down` and `chips uninstall`

`chips up` asks who should be able to reach Chips, starts it — as a login service when it is an
installed release, in the terminal from a checkout — opens your browser already paired, and shows
a QR for the phone. Run again, it only opens the browser and shows the QR. Its flags, and where a
release keeps things, are on [Install](/start/install/#chips-up).

`chips down` stops that service and keeps it from starting at login. `chips uninstall` removes
the service, the install and the link on your `PATH`, and asks separately before it removes the
workspace (`--remove-data` answers yes). Neither touches a launch agent `chips up` did not write,
or `~/Chips`, where the bridges keep their settings and the agents their folders.
Run through the link Chips for Mac makes, `chips uninstall` removes the service and the link but
nothing inside the app, which goes to the Trash ([Chips for Mac](/operate/desktop/#removing-chips-for-mac)).

## `chips serve`

Starts the server, and on a clean machine makes the workspace it serves: one workspace, one
person, and nothing else. It pairs the machine it is running on — whoever started it can read
its database, so a code would prove nothing, and it is this machine `chips connect` is about to
be run on. Then it prints a pairing code and the same code as a QR — the pairing screen takes
either, and a phone camera takes only one of them — and advertises itself as `_chips._tcp` over
mDNS as "Chips on" the machine's name, which is how the desktop app and a phone on the same Wi-Fi
find it without being told an address.

The QR carries an address another device on your network can reach, and only when the server
is bound to one: by default it listens on `127.0.0.1`, says *Only this machine can reach it*,
and the QR says the same. `CHIPS_HOST=0.0.0.0` opens it to the network; see
[A Mac mini](/operate/mac-mini/).

A pairing code is a capability: it is short-lived, single-use, and printed rather than written
anywhere. If you lose it, `chips pair --issue` prints another.

## `chips pair <code>`

Gives this machine a credential of its own, against a server somewhere else — `--server
http://mini.local:4431` when it is not on this machine, before or after the code; an address
without `http://` gets it. A wrong code, one that has run out, or a server that doesn't answer is
said in a line. It generates an Ed25519 key, sends the
public half with the code, and keeps the private half in `~/.config/chips/device.json` with
owner-only permissions.

That file is the one real difference from the browser, where the private key is generated
non-extractable and cannot be read back by anything, including the page holding it. Node has no
equivalent store. `chips doctor` tells you which you have.

### `chips pair --issue`

From a machine that is paired, a code for the next device: the desktop app on a laptop, a phone,
another CLI. It asks the server for one — good for fifteen minutes, once, and for the person
this machine is paired as, since that is who the new device will speak as — and prints it, with the
phone's QR, which carries the server's network address when the server is here. Where only this
machine can reach the server, it draws no QR, since no phone could use it, and says how to let one
in. A harness's token cannot
issue one: a token is not a person.

On the machine that runs the server there is a second door. The server leaves an operator token
beside its database at every start, owner-only, and when this machine's device has been withdrawn
— or it never had one — `chips pair --issue` uses the token instead, for the workspace's first
person, and says so in one line. Whoever can read the token can read the database beside it, which
is the same reasoning by which `chips serve` pairs its own machine ([ADR 0048](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0048-the-machine-that-runs-the-server-can-always-issue-a-pairing-code.md)).

## `chips join <link>`

For a harness written in anything but TypeScript, the way `join()` from `@chipschat/harness` is for one
on the SDK ([Join requests](/connect/join/), ADR 0122). Given a link a person made in Chips —
**Agents → Connect a harness** — it takes it up and prints the four lines the harness reads, as
`export`s and nothing else, so a shell can take them in:

```
eval "$(chips join http://100.64.0.7:4431/j/chips_j_…)"
```

Given the server's address in place of a link, it asks: the code to compare goes to standard
error, and it waits until an owner or admin allows it in Chips. `--name <n>` is what to call the
harness (*Harness on* this machine's name, unless said). What it is handed is kept, as `join()`
keeps it, so running it again with the same name prints the same lines and asks nothing. A
refusal — the link used already, expired, refused — is said on standard error, with nothing to
evaluate, and it exits 1.

## `CHIPS_JOIN_LINK='<link>' chips connect <id>`

Connects a harness from its card in the gallery (ADR 0218). In Chips, **Connect a harness**, then
the harness's card, gives this line with a link in it; run it on the machine where the harness runs:

```sh
CHIPS_JOIN_LINK='https://…/j/chips_j_…' chips connect hermes
```

The link can follow the id instead, as `chips connect hermes 'https://…/j/chips_j_…'`, but then
anybody else on that machine can see it in the process list until it is used.

The card names the harness's bridge, an npm package and the major version that speaks this
Chips's protocol (`@chipschat/hermes@1`). `chips connect` asks the npm registry for the newest
release of that major, leaving out prereleases and anything deprecated. It downloads the release
with Chips's own Node, so no npm is needed, and checks it against the registry's SHA-512. It
unpacks the bridge into the workspace's folder under `bridges/`, and the next connect reuses it.
Then it runs the bridge on Chips's Node with the link in its environment, never on its command
line. The bridge checks its harness, joins, and keeps itself running from login: a launch agent on
a Mac, a systemd user unit on Linux. Anything missing, such as the harness's server being off,
stops it with one sentence saying what to do. The link stays good, so the same line runs again once
that's fixed.

`--json` prints a line of JSON for each step: `downloading` (the package and version, whether it
was here already, then `received` and `total` bytes as they come), `checking` the harness (with
the bridge's own `detail` once it says one), `checked`, `joining`, `keeping` it running (the
service's label), then `connected`, or `failed` with the bridge's `sentence`. A bridge that says
where it stopped adds a few words for the step (`detail`), its sentence (`says`), what to do
(`doing`) and a line to copy (`copy`); Chips for Mac's Connect shows them. With no link on the line,
`chips connect <id>` takes it from `CHIPS_JOIN_LINK`, which is how Chips for Mac hands it over, so
the process list never shows it. Chips for Mac also hands over `CHIPS_CARD_NAME`, the name its
sheet showed, and `chips connect` connects nothing when that isn't the name of its own card for
that id.

With no link at all, `chips connect <id>` joins with the key already kept for that harness, under
the card's name at the server it finds (`CHIPS_URL`, else the one `chips up` runs here). Its spaces
stay its own, where a new link would make it a new harness with a space of its own. This is how a
harness you connected by hand moves onto its bridge from npm: run it in the same environment the
harness ran in, `CHIPS_URL` and `CHIPS_NO_KEYCHAIN` included, and it replaces the service that
bridge kept before. With no key kept there, it says a link is needed before downloading anything.
The `joining` step's `detail` says it used the key it already had.

`chips connect` on its own lists what this Chips can connect. `chips connect --update` brings each
bridge kept running here to the newest release of the major its card names, and starts each of
its services again. `install.sh` runs it after an upgrade. On another computer,
`curl -fsSL https://chipschat.ai/install | CHIPS_JOIN_LINK='<link>' sh -s -- connect <id>`
installs Chips first when it isn't there.

`chips disconnect <id>` runs the bridge's own `--stop`, then removes the download once no other
card runs on it (Claude Code and Codex share one bridge). `chips uninstall` stops and removes every
bridge.

## `chips connect custom`

Points a harness at this workspace. It lists every change first — the harness it will register,
where the token will go, which files it will write — and does none of it unless you say yes.
`--yes` skips the question for a script that has already decided; `--name <n>` is what to call
the harness; `--no-dial` declares no autonomy dial, for a harness whose permission model is its
own ([ADR 0046](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0046-a-harness-declares-that-it-takes-the-dial.md));
`--capabilities agents,new_spaces` declares what else it takes as it registers, so `chips
declare` isn't needed straight after ([what each one is](/connect/#what-it-may-do)).

```
chips connect custom --name Scout
```

The token goes into the login keychain on macOS, and into `~/.config/chips/secrets.json` with
owner-only permissions everywhere else. What is written down in
`~/.config/chips/connections.json` is which harness, which server, and which keychain account —
never the token itself.

Each `connect` makes a harness of its own and writes its record beside the others, so connect
as many as you run: `chips connect custom --name Jacobian`, then `chips connect custom --name
OpenClaw`. Connecting a second under a name already here says so first, and makes a second
harness; `--rotate` is what renews the first. `rotate`, `disconnect`, `remove`, `declare` and
`doctor` go by the harness's name, or its id when two share a name, and that is the word they
print. The adapter's word still works while it made only one harness here; once it made two,
`custom` alone means neither, and they say which names would do.

What a harness needs beyond that is its adapter's to say, read from the manifest in
`cli/src/harnesses.ts` rather than from a branch on its name
([ADR 0051](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0051-a-harnesss-adapter-lives-with-the-harness.md)):
a custom harness gets its address and token printed once, in the four environment variables the
guides use ([Custom](/connect/custom/)). Jacobian is one of those, with the dial off
([Jacobian](/connect/jacobian/)). A record an older build wrote under `jacobian` still reads:
`doctor` says the adapter is gone, and `--rotate` and `disconnect` treat it as custom.

### Rotating a token

```
chips connect custom --rotate       # the only custom harness here
chips connect Jacobian --rotate     # one of several, by name
```

A new token is issued and stored **before** the old one is revoked, so the harness is never
without a credential, and a rotation interrupted halfway leaves it connected rather than mute.
Revoking closes any socket the old token is holding, immediately. The new token is printed
again, because it lives in the harness's environment, not here.

A harness's tokens belong to the person who owns it — whoever added it. You can do the same
thing from the harness's card under Agents in the app.

## `chips disconnect <harness>`

Undoes what `connect` wrote, from the record it kept: takes the Chips entries out of the files
it edited, withdraws the harness's tokens on the server, and forgets the secrets in the keychain
and the record of the connection. It says all of that first, and stops unless you say yes. The
harness itself stays, with its spaces, its runs and its receipts — that is the workspace's
history, not this machine's; what goes is this machine's end of the connection. `<harness>` is
the adapter it was connected with while it is the only one, or its name or id.

## `chips remove <harness>`

Takes the harness out of the workspace, for everyone. The server withdraws every token it has,
so its sockets close and nothing can speak for it; it leaves Harnesses, the + and every space's Add in
the apps; its home spaces stop being homes, so they can be archived or deleted like any other space;
and the log records the removal. What it said stays, under its name. When this machine connected
it, the secret in the keychain and the record of the connection are forgotten too, once the server
has said yes; a refusal leaves them as they were.

It says all of that first, and stops unless you say yes; `--yes` skips the question. `<harness>`
is what `disconnect` takes, or the `hrn_` id of a harness connected from somewhere else. Removing
one that is removed already is not an error: it says so and forgets this machine's end, so a
harness removed from the app can be cleaned off here the same way. Only the harness's owner or a
workspace owner or admin can remove it.

The difference from `disconnect`: `disconnect` forgets this machine's end and keeps the harness
in the workspace; `remove` takes the harness itself out, for everyone, and keeps only its history.

## `chips doctor`

Every check can say what to do about its own failure, with a link. A check that cannot is a log
line, not a check. On a machine that runs a server it starts with the machine itself: which chips
this is and on which Node, whether a server answers here, whether it has its page, who else
can reach it, whether it can push to phones, and what it can do with video and voice notes.

```
  2 to fix
  ────────
    · pairing         Paired with http://127.0.0.1:4431 as You.
    x server          http://127.0.0.1:4431 is not answering (fetch failed).
    ! clock           Could not read the server's time.
    · token:Scout     Scout's token is in the keychain.
    x harness:Scout   Every token for Scout has been revoked.
    · disk            35 GB free.

  server: Start it with `chips serve`, or point this machine at the right address.
  harness:Scout: Run `chips connect Scout --rotate` to mint another.
```

Each harness's checks carry its name, or its id when two share a name: the word to type to mean
that harness and no other. It exits non-zero when anything is wrong, so it can gate a script. A
warning (`!`) prints its fix too, and doesn't fail it.

| Check | What it catches |
| --- | --- |
| `chips` | A checkout on a Node older than 22. |
| `server here` | Nothing answering on this machine, when this machine's device belongs to a server here. |
| `web app` | A server with no page to show: from a checkout, `pnpm web:build` was never run. |
| `reach` | A server only this machine can reach, with no relay, so no phone can pair with it. Or a relay the server is set to use and is not connected to, so a phone away from home cannot reach it. A server connected to its relay is reachable from anywhere. |
| `video` | No ffmpeg where the server looks for it, so a video is kept as it came, with no poster and with its location. A warning: video is optional. |
| `voice notes` | No whisper, or no model for it in the workspace's `models` folder, so a voice note has no words. A warning too. |
| `pairing` | No credential on this machine. |
| `server` | Nothing answering, or answering with an error. |
| `credential` | The server no longer accepts this device key: it was revoked, or the workspace was replaced. |
| `clock` | A clock far enough out that a signature would be refused as a replay. |
| `token:<harness>` | The token is gone from the keychain. |
| `harness:<harness>` | The harness is unknown, every token it had has been revoked, or — for a harness that runs elsewhere — it has never used its token, which is the block or the four lines not having reached it. |
| `<harness> now` | The harness is not connected right now, or is connected and says it is in trouble. |
| `disk` | Not enough room for the log and the attachments to grow. |

## `chips conformance custom`

Walks an adapter through the golden scenario against a fake Chips that speaks the wire, and
prints the connection checklist a harness's page under Agents shows — the same rows, lit by the same events.
It exits zero when Messages, Runs, Steps, Approvals, Cost and Finished are lit and nothing was
refused; `--json` prints the report for a script, `--timeout <s>` sets how long each step of the
scenario is waited for, `--capabilities new_spaces,forks` declares what the harness takes so the
kit asks it for what those promise afterwards, and `custom` prints where the fake is so you can
point your own harness at it. [Conformance](/connect/conformance/) has the report and what each note means.

## `chips project clone`

```
chips project clone "Sudoku mini"
chips project clone spc_01M5M82961AB2TETFXT2RJ0DB0 ./sudoku
```

Clones a space's project, the git repository the space's agents work on, into a folder named after
the space (or the one you give). The space is found by its name, its id, or a link with its id in.
Commit and push to `main` as you would anywhere: the space shows your change as it shows an agent's,
"Arjun changed 2 files", and the agents' next turns are told what you changed.

The clone keeps no password. This machine has to be paired (`chips pair`), and its git config names
the CLI as its credential helper: each time git asks, the CLI asks the server for a short project
token with its device's key, and no other helper is asked to store it. Your commits are signed with
your name and `<your id>@people.chips.invalid`, so the space's history names you.

## `chips export` and `chips import`

```
chips export ./my-workspace
chips import ./my-workspace
```

An export carries the event log and the registry — the workspace, the people and harnesses, the
device keys and the token digests — plus the attachment files. It does not carry a single
projection row: every read model is rebuilt from the log on the way in, through exactly the code
live traffic uses, which is what makes the round trip a proof rather than a copy.

An export therefore holds credentials. It is written owner-only, and the command says so. Treat
the folder as you would a password.

An import into a database that already holds the workspace is refused rather than merged. Two
logs with the same ids are not one log.

## Where things live

| Thing | Where |
| --- | --- |
| The device key | `~/.config/chips/device.json`, `0600` |
| A harness's token | The login keychain, or `~/.config/chips/secrets.json`, `0600` |
| What was connected | `~/.config/chips/connections.json`, `0600` |
| The workspace | `CHIPS_DATA_DIR`: from a release, the [platform's place](/start/install/#where-a-release-keeps-things); from a checkout, `./.chips` |
| The harnesses' bridges | `bridges/` in the workspace's folder, one folder each, with `bridge.json` saying its version |
| What each bridge keeps | `~/Chips/.bridges/<bridge>`, and its agents' folders in `~/Chips/Agents/<kind>` |
| The cards `connect` reads | `CHIPS_CONNECTORS`: from a release, the `connectors/connectors.json` it carries; from a checkout, the docs' own |
| The npm registry | `CHIPS_NPM_REGISTRY`, else `https://registry.npmjs.org` |

`CHIPS_CONFIG_HOME` and `XDG_CONFIG_HOME` both move the first three. The workspace is the thing
you back up and move between machines; the CLI's own files and `~/Chips` are not part of it and
are not in an export.
