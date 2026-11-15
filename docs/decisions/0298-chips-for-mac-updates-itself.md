# 0298. Chips for Mac updates itself

Date: 13 November 2026
Status: Accepted, 13 November 2026, on Arjun's "yes proceed" to the updater's signing key, after
his picks for `docs/proposals/everything-in-step.md` ("with your recommendations": Chips for Mac
updates itself, installing when you quit or at night). Phase 5 of that proposal; builds on ADR 0173
(the Chips the app carries), ADR 0215 (the login item and the menu bar), ADR 0296 (the update dot)
and ADR 0297 (what needs an update is said where it is).

## Context

Chips for Mac was downloaded again by hand for every release, and nothing told anyone to. It
carries the computer for most people who have one (ADR 0173): the login service `chips up`
installs runs the release inside the app's bundle. So an old app is an old computer, and an old
computer keeps every phone from what a release added.

## Decision

1. **Tauri's updater, with a key of its own.** Soon after it opens, then once a day, the app reads
   `latest.json` from the newest GitHub release (`releases/latest/download/latest.json`), downloads
   the archive it names, and checks it against the public key in `tauri.conf.json` before anything
   else. The private key is `~/.ssh/chips_mac_update.key` on the Mac that makes releases, beside the
   release key. A download that isn't signed by it is thrown away and said in About. One that
   fails for the network is tried again in an hour and tells nobody.
2. **Three moments it goes in.** What is downloaded waits in the app's cache until: the person
   quits; the night, between two and five by the Mac's clock, once, with nobody at the window (it
   isn't shown and in front); or **Restart now** in About. Going in swaps the bundle whole. At night
   and on Restart now the app opens again from the new bundle once the old one has gone, at night as
   the menu bar's icon alone. On its own it goes in only where its person can replace it without a
   password; otherwise About says so and Restart now asks for the password.
3. **The computer starts again on the new release when nothing is going on.** The computer the app
   carries goes on running the release it started on after the swap. Riding the sweep, once a
   minute, it reads the version in the app's `VERSION`; when that is newer and nothing is going on
   anywhere (no run, no ask waiting, no message for five minutes), it starts its login service again
   with `launchctl kickstart -k`, on the new release. Any hour: the files under it are new already.
   Until then its owner's `GET /v1/server` says `self_update.restarts_onto`, and About's computer row
   says "Starts again on 1.2.6 when nothing is going on", with no button.
4. **What About says.** Chips for Mac's row: "1.2.5 · Getting 1.2.6"; "Chips 1.2.6 is ready. It
   installs when you quit, or tonight." with **Restart now**; "Couldn't update to 1.2.6. … Still on
   1.2.5." with **Install**, the download page, as before. While the app gets its update itself, the
   update dot lights for it no more (nobody has to act); a failure lights it as any update does.
5. **Only a build to hand out updates itself.** `pnpm desktop release` builds with
   `CHIPS_MAC_SELF_UPDATE=1` and, beside the DMG, writes `Chips.app.tar.gz` (the notarized, stapled
   app), its `.sig` and `latest.json`, all four uploaded to the release. A build `pnpm desktop`
   installs from a checkout never replaces itself with a release. `CHIPS_MAC_UPDATES` names another
   feed, for a test.

## Consequences

- The release session uploads four files for the Mac where it uploaded one (`docs/releasing.md`).
- Copies before the first release carrying this are downloaded by hand once more.
- The bridges on that Mac follow the computer (`bridges-keep-current.md`), so once the computer runs
  a release that keeps them, a Mac is in step without anyone doing anything.
- The update is for Apple silicon, as the DMG is; an Intel Mac installs with `install.sh`.
- Losing the updater key means no copy can update itself again until people download one carrying a
  new key by hand, as losing the release key would stop `install.sh`.

## Addendum, 13 November 2026, later: after a review

A review of the build changed these. Arjun asked for the review ("make sure everything is working
as expected … fix anything that is broken"); the rules below are its judgement, for him to change.

1. **A Mac asleep every night still updates.** A laptop is asleep from two to five, so the night
   alone never came for it. Once a night has ended with a release waiting, it goes in at any hour
   when nobody is at the Mac, still once a day.
2. **Nobody at the Mac** is: the app's window is away (it then comes back as the menu bar's icon,
   and nobody sees it go), or it is shown and no key or pointer has been touched for ten minutes
   (it then comes back with its window). Before, a window shown behind another counted as nobody
   there, and came back hidden.
3. **Where a password is needed, it waits and says so.** The app's state is `ready` with
   `asks: true`: nothing goes in on its own, About says "Chips 1.2.6 is ready. Restart now to
   install it: this Mac asks for an administrator's password.", and the update dot stays lit,
   since someone has something to do. A password not given leaves the release waiting, to ask
   again. Before, this was said as a failure, with no Restart now.
4. **A copy that can't be swapped is off.** On a read-only disk, or a disk other than this Mac's
   own, the app looks for no update and About sends its person to the download, as for a build
   from a checkout.
5. **The download is read again before it goes in**, and put in only if it is still the bytes that
   were checked against the key (their SHA-256, kept in the app's memory). It may wait for days in
   a folder other programs can write.
6. **Never the same release twice.** A note of the release last put in stays in the cache until
   the app that opens is that release. If the feed still offers it then, About says it didn't take
   ("It was installed, but the one before still opens. Get Chips again from chipschat.ai."), and
   nothing is downloaded or swapped again. The gate also fails when the app's versions disagree
   with the root `package.json`'s, which is how such a release would be made.
7. **The feed is the truth of what goes in.** A release waiting that the feed offers no more
   (taken back, or passed by a newer one) is dropped at the next look.
8. **Once a day is by the clock on the wall**, so a Mac asleep most of the day still looks daily.
9. **A swap that fails** is said in plain words, the release is left alone while the app runs, and
   what the system said goes to the app's own output.
10. **The release tool** writes no feed for an archive signed with a key other than the one in
    `tauri.conf.json`.

Tried on a Mac with two test copies and a feed of their own: the swap at quit, the note settling
in the new copy, a release that didn't take, a download changed while it waited, and a folder that
needs a password. Not tried on a real Mac: Restart now and the app opening again on its own (a
copy opened that way runs as its person, not in a scratch home), a password refused, and whether
a logout or a shutdown leaves the swap at quit enough time.

Looked at again on 13 November, as far as a test may go without opening a copy as its person:

- **Opening again.** The shell the app leaves behind was run as the app runs it, in a process
  group of its own, from a process that then ended, against a stand-in app in a folder with a
  space in its name: `/usr/bin/open -n` opened it once the process before had gone, with
  `--background` handed on at night and nothing handed on after Restart now.
- **A password refused.** The updater's own code (`tauri-plugin-updater` 2.12.0, `install_inner`
  for macOS) asks for the password only when it can't move the app aside itself, and answers a
  prompt cancelled, or the move failing after it, with `Io(PermissionDenied)`: the one answer this
  app reads as "not given", after which the release waits and About still asks.
- **Time at quit.** Checking the download and unpacking it took 1.4 seconds for the app as it is
  released (224 MB, 2,500 files), on a Mac busy with other work; the swap itself is two renames.
  A Mac that is told to stop without the app being asked to quit runs no swap, and the release
  waits. The updater moves the app aside before it moves the new one in, so a Mac that loses
  power between those two renames has no app in its place: a gap of well under a millisecond,
  and the updater's, not this app's.

Still for the first release that carries this to show, on his Mac: Restart now in About brings
the new copy up on its own, and a logout with a release waiting comes back on the new copy.
