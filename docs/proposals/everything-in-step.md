# Everything in step

13 November 2026. A proposal, for Arjun's picks. His words: "I need everything to stay updated
together phone / ipad, mac app and bridge. how do we do that smoothly for the user? If anything is
out of sync, we either update automatically, or inform the user."

It builds on ADR 0296 (the update dot and About's Updates group), ADR 0295 (About Chips) and ADR
0218 (bridges from npm). Bridges have their own proposal, `bridges-keep-current.md`; this one
holds the whole and the pieces that aren't bridges.

## The pieces, and how each updates today

| Piece | Comes from | Updates today | Who can update it |
| --- | --- | --- | --- |
| The computer (`chipsd`) | the install line, or inside Chips for Mac | the install line again and `chips up`; Chips for Mac downloaded again | the owner |
| Chips for Mac (the app and the computer in it) | a download from chipschat.ai | downloaded again by hand; no updater | that Mac's user |
| Chips in a browser | served by the computer | follows the computer; a tab left open keeps the old code until it is reloaded | nobody has to |
| iPhone and iPad | the App Store | iOS updates it if that setting is on; otherwise by hand | each person |
| Bridges | npm, through `chips connect` | `chips connect --update` by hand, or the install line at an upgrade | that machine's user |
| The harness behind a bridge (Claude Code, Hermes, OpenCode, OpenClaw) | its own makers | its own way; Claude Code updates itself | the person who installed it |

What's there already: the update dot lights when a release is out, for the app (from the App Store's
version) and for the computer (its owner only), and opens About (ADR 0296). About's Updates group
has a row for this device and one for the computer, and says what waits when the computer is older
than this device ("This iPhone has 1.2.5. Pause, No cap and See all need 1.2.5 on Arjun's Mac mini
too.", `computerBehind` in `packages/core/src/about.ts`). The iPhone and the computers ship as one
release with one number ("1.2.4, match computers").

What's missing:
- **Nobody knows who runs what.** Every app tells the computer it is `chips-core 0.0.0`
  (`packages/core/src/transport.ts`), and the computer doesn't read what bridges say about
  themselves either (`onHello` in `server/src/interfaces/ws/session.ts`).
- **A browser tab never notices the computer was updated.**
- **Chips for Mac can't update itself.**
- **Bridges reach almost nobody** (`bridges-keep-current.md`).
- **An older app shows nothing where something new is.** It skips an event it doesn't know
  (`packages/core/src/model/fold.ts`), so a person on an older phone misses it without a word.

## The rule

The computer is the hub: every app and every bridge connects to it, and nothing connects to
anything else. So the computer is where being in step is known and settled.

1. **Everything says what it runs.** Each app says its platform and version when it connects;
   each bridge already says its name and version. The computer keeps both, per device and per
   harness.
2. **The computer knows what's newest.** It already reads the release feed and the App Store's
   version once a day for the update dot; it reads the bridges' allowed versions in the same sweep.
3. **Anything out of step is updated automatically where Chips can do it safely, without
   interrupting anyone's work. Otherwise the person who can update it is told, in one place, with
   the one thing to do.**
4. **Nothing breaks while out of step.** A newer side uses something new only when the other side
   says it has it, and an older app is sent something it can show.
5. **One release, one number.** iPhone, iPad, Chips for Mac and the computers ship together, as
   now. Bridges ship on their own, each naming the oldest computer it works with.

## Piece by piece

### Browser tabs: automatic

The computer serves the web app, so it is in step the moment the page loads. A tab left open
across an update keeps running the old code against the new computer. The tab already hears the
computer's version in every `hello` (`server.version`). When it changes, the tab reloads itself at
the next quiet moment: nothing typed and unsent, no sheet open. It comes back to the same room and
place. If no quiet moment comes within five minutes, a line says "Chips was updated" with Reload.
Chips for Mac's window is the same web app and does the same.

### Chips for Mac: automatic, installed when you quit or at night

Chips for Mac holds the computer for most people, so updating it updates the computer, and with it
the bridges on that Mac (below).
- The app checks the release feed once a day, downloads a new release in the background, and checks
  its signature before anything else. That uses Tauri's updater and a signing key kept like the
  release key.
- It installs when the app quits. An app that never quits, because it holds the computer, installs
  at night at a quiet moment: no turn running, no ask waiting, no one typing. The restart takes the
  computer away for a few seconds, which phones ride out as they do any reconnect.
- About's row says "Chips 1.2.6 is ready. It installs when you quit, or tonight", with Restart now.
- An update that fails says so in that row, and the app stays as it was.

### A computer from the install line: you're told, and can turn on automatic

On a Linux box, a VPS or a Mac without the app, `chips up` restarts the server, which may be
serving people at any hour.
- The owner is told by the update dot and About's computer row, with the one line to run ("Run in
  Terminal").
- A switch, "Update this computer automatically", off by default, has `chips up --update` run at
  night at a quiet moment.

### iPhone and iPad: you're told, and nothing breaks meanwhile

Only Apple installs an app, so Chips tells.
- **The app is older than its newest release:** the update dot, from the App Store's version, as
  now.
- **The app is newer than the computer:** what needs the computer waits, and About says what waits,
  as now. The computer's owner gets the dot for it. Anyone else is told who can update it: "Ask
  Arjun to update Chips on his Mac mini".
- **The app is older than the computer:** the computer sends it something it can show for anything
  newer (next section). The owner sees in About whose app is behind: "Natalie's iPhone has Chips
  1.1".
- **An app too old to talk to the computer at all**, which happens only when the protocol's major
  changes: a full page says "Update Chips to keep using Arjun's Mac mini", with the App Store
  button. Never otherwise.

### Bridges: automatic on the computer's own machine, you're told elsewhere

Most people run their bridges on the same Mac as Chips. The computer updates those itself when
nothing is running: it fetches only versions the release key signed, restarts the bridge, watches
it come back, and puts the old version back if it doesn't. A bridge on another machine is shown as
behind on its harness page, with the one command to run there. The details and their failure
review are in `bridges-keep-current.md`.

### The harness behind a bridge: you're told

A bridge checks the harness it drives when it starts. When that is too old, it says so as trouble
on the harness page, "Needs Hermes 0.9 or newer", instead of failing turns one by one.

## An older app always sees something

The computer is the one place that sees both sides. Every kind of event an app can be sent goes
through it, and it knows what each app understands. So an older app is handled there, once, rather
than by every bridge and every feature remembering.

1. **A level.** The protocol keeps a number that goes up whenever a kind of event, a field, or a
   value of a list is added. Each addition records the level it came in at. Each app says its level
   when it connects.
2. **A fallback for each addition.** Whatever is added comes with what an app below its level is
   sent instead. Usually that's a line in words, "Hermes made a chart. Update Chips to see it",
   drawn the way that app already draws a line.
3. **Sent per app, never stored.** The log keeps the real event. The computer sends each socket
   what its level shows, at the moment it sends it. An app that updates reads the room again and
   gets the real thing.
4. **A last net in the app.** From the next release, an app draws anything it still doesn't know as
   "Something here needs a newer Chips", with Update, instead of nothing. That catches what slips
   through, and it only helps from that release on.
5. **Bridges stop having to remember.** They use something new once the computer says it takes it;
   the computer looks after older apps. That replaces the "plain message beside anything new" line
   in the bridge proposal.

## One place to see it

- **Everyone:** the update dot and About's Updates group, as now. This device's row says what to do,
  or that it is updating itself. The computer's row says when it is behind, and what waits for it.
- **The owner:** About's Updates group also lists anything else in the workspace that's behind and
  isn't fixing itself: a bridge that needs a command on its machine, an update that failed, people
  whose apps are behind. The harness page says the same for each bridge.
- **The dot lights only when someone has to act.** A bridge or a Mac app updating itself at night
  lights nothing. A failed update, a computer behind your app, or a bridge waiting on a command does.

## What it needs

0. **Checks before building:** which event every app back to 1.0 draws as a plain line, for the
   fallbacks; whether an older app drops a known event that carries a value it doesn't know, or
   only that value; Tauri's updater with the app's notarisation and its Login Items entry; and,
   for bridges, the checks in their proposal.
1. **Everything says what it runs.** Apps send their real platform and version. The server reads
   the `client` of apps and bridges and keeps it per device and per harness, past a disconnect.
   Small, and everything after it leans on it.
2. **Browser tabs reload when the computer changes.**
3. **Bridges on the computer's machine update themselves** (`bridges-keep-current.md`).
4. **Chips for Mac updates itself.** The updater, its signing key, and download entries in the
   release feed.
5. **Older apps see something:** the level, the fallbacks, the computer sending per app, and the
   app's last net.
6. **The install-line computer's switch.**
7. **The owner's list** in About's Updates group, mocked first.

Each phase ships with a release; none waits for the ones after it.

## Built so far, 13 November

- **Phases 1 and 2** (d5fcd039c): every app says its platform and version in its hello, the
  computer keeps what each device and harness last said (`GET /v1/software`), and a browser tab
  reloads at a quiet moment after its computer is updated.
- **Phase 3** (806be8aa2): the computer keeps the bridges in its own data folder current
  (`bridges-keep-current.md`, "Built"). Inert until the signed list is on the site.
- **Phase 6**: `chips update` runs the install line its own release carries (a release now carries
  `install.sh`), with `--no-bridges`, then the new release's `chips up`. The owner's switch, off by
  default, has the computer run it between two and five in the morning when a newer release is out
  and nothing is going on (`PUT /v1/server/self-update`; `self_update` in an owner's
  `GET /v1/server`). On Linux it runs in a unit of its own, since stopping a user service ends every
  process it started. A release from before this carries no install line, so those computers update
  by hand once more. The switch's place in About is phase 7.
- **Phase 4's part people don't see** (91a4adce5): every app says its level in its hello and on
  signed reads; an event newer than an app's level comes to it as the line its addition came with.
- **Phase 5** (ADR 0298): Chips for Mac reads `latest.json` from the newest GitHub release once a
  day, downloads and checks the update against its own key, and puts it in when the app quits, at
  night with nobody at its window, or on Restart now in About. The computer it carries starts again
  on the new release once nothing is going on. Only a build from `pnpm desktop release` updates
  itself; that build now also writes `Chips.app.tar.gz`, its signature and `latest.json` for the
  release.
- **Phase 3's list** is signed and on chipschat.ai (`bridges.json`, 13 November), so a computer from
  the next release keeps its bridges current.
- **Phase 7** (ADR 0297): About's Needs update list for the owner, the night switch under a
  computer from the install line, a bridge's line and the switch "Keep this bridge up to date" on
  its harness page, the owner's update dot for a bridge or a failed night, and one quiet line in a
  room for an event the app doesn't know.

- **Reviewed, 13 November (later)**: every phase was read again, tried, and its gaps in tests
  closed. What changed is in `bridges-keep-current.md` ("Reviewed"), ADR 0297's addendum (the
  screens and `GET /v1/software`) and ADR 0298's addendum (Chips for Mac). For the computer's own
  update: `chips update` puts nothing in again when the computer is on the newest release
  (`install.sh --if-newer`); the install line swaps a release in with two renames, so a failure
  between them changes nothing; an update that stopped halfway, or one whose server didn't start
  again, is said as failed, with why; the night's update holds off for a run only while that run
  was heard of within six hours; and a computer Chips for Mac carries is asked to start again once
  an hour, not once for good. The level wiring is now tried end to end with a later catalogue of
  the test's own, over `GET /v1/events` and the socket.

### What phase 0 found for older apps

Read from the 1.0 tree and main:
- Since 1.0, three event kinds were added (`approval.held_stopped`, `approval.held_started`,
  `space.spend_ceiling_lifted`), and no closed list gained a value. New things reached older apps as
  new fields, and as new meanings of fields they had.
- One misrender today: an app before 1.2.4 shows a room with No cap as capped at $3, amber then red
  past it, because `GET /spend` answers `ceiling_usd: null`.
- An app from before today says `chips-core 0.0.0` in its hello, so the computer can't tell 1.0
  from 1.2.4 by it. What a hello `accepts` tells apart only roughly: 1.0, 1.1.0 to 1.2.0, 1.2.1 to
  1.2.4.
- The one event an older app draws as free text is `message.post` as an agent. Sent only on the wire, it
  raises no push and isn't searchable, but it counts as unread. An older app caches it by `seq`, so
  after the person updates, the cached line stays where the real event belongs unless the new app
  knows to read it again.

Built (phase 4, the part people don't see): `CATALOGUE_LEVEL` and `LEVEL_ONE_EVENTS` in the
protocol, with a test that holds every event to a level, so an event added later can't ship
without the line an older app is sent in its place (`LATER_EVENTS`, `atLevel`). An app says its
level in its `hello` and in a `chips-level` header on its reads; the computer applies it on the
socket and on `GET /v1/events`, and only for an app that said one. An app's cache is kept under
its level past level 1, and the caches kept at earlier levels are forgotten, so an app that
updates reads the rooms again. Today every event is at level 1, so nothing anyone is sent
changes. Still to build: the app's last net, "Something here needs a newer Chips", once its
look is picked.

So the plan for older apps, recommended: apps from 1.2.5 say their level in the hello and draw
anything they don't know as "Something here needs a newer Chips" (the last net). The computer sends a
fallback line only to an app that said a level, marked so the next app reads the real event again.
Apps before 1.2.5 get no wire fallbacks: they can't be told apart, and their caches would keep the
fallback. They are told to update by the update dot, and the owner sees who they are (phase 7).

## Picks

1. **Chips for Mac:** updates itself, installing when you quit or at night (recommended); downloads
   it and asks before installing; or stays as now.
2. **A computer from the install line:** you're told, with a switch to update at night, off by
   default (recommended); always updates at night; or told only.
3. **Browser tabs:** reload themselves at a quiet moment (recommended); or a Reload line only.
4. **Whose app is behind:** the owner sees names in About (recommended); a count only; or nothing.
5. **Bridges:** the picks in `bridges-keep-current.md`.
