---
title: Building the phone app
description: The Chips app for iPhone and Android, built from a checkout and put on your own phone, a simulator or TestFlight, and the loops for working on it.
sidebar:
  order: 3
---

Most people get the app from the App Store ([Get Chips on your iPhone](/start/iphone/)). This page is
for building it yourself from a checkout: on your own iPhone with one command, in a simulator, in
Expo Go for a quick look at the screens, in a browser for the fastest loop, and onto TestFlight.
**Expo Go** needs no Xcode and no Apple account, but runs without the native parts a build
carries; it is [further down](#in-expo-go-instead).

## On your own iPhone

What you need, once: a Mac with Xcode, an Apple ID added to it, and the phone plugged in with
Developer Mode on (Settings → Privacy & Security → Developer Mode). A free Apple ID will do, without
push and without invite links opening the app ([a free team](#a-free-team)), and signs a build that
lasts seven days. A checkout builds Chips' own app, signed by Chips' team, so first name your team
and a bundle id of your own ([under your own Apple team](#under-your-own-apple-team)). Then, from
the checkout:

```sh
pnpm phone
```

It checks everything that has ever gone wrong here — the signing certificate and its chain, the
keychain's willingness to let `codesign` at the key, whether the team can sign push, the Babel
preset Xcode has to find, the network permissions an installed build needs, the web build the
server serves, the phone, and the server. Then it builds, installs, and **pairs the phone by
itself**: the server's own machine issues a code, the app is launched with it, and the tool waits
for the server to say the phone is in. Nothing is typed and nothing is scanned.

**What it can put right, it puts right.** A web build older than its source is rebuilt, a
dependency with an unlinked native side is linked, a missing Babel preset is installed, Apple's
intermediate certificate is imported, an empty port gets the launch agent, and `sim` with nothing
booted boots a simulator. It says every failure first, mends what it can, and runs the checks
again, so what you see at the end is the state of things and not a list of chores. It stops only for what needs *you*: a cable, Developer
Mode on the phone, a team added in Xcode, `sudo xcode-select`, a keychain dialog answered, or a
second server on the port that is somebody's to stop and not the tool's.

A few more, each for one job:

```sh
pnpm phone doctor      # the checks, and nothing changed: it mends nothing
pnpm phone sim         # build, install and pair in a booted simulator
pnpm phone connect     # pair a phone that already has the app
pnpm phone server      # this checkout's chipsd as a launch agent, for a build to pair with
pnpm phone pods        # link a dependency with a native side, after adding one
pnpm phone ship        # a new build onto a phone that has the app: direct when in reach, else TestFlight
```

`pnpm phone doctor` is the one that only looks. It is the same pass without the mending and
without the build, so it is safe to run at any time and against any state; when it names
something `pnpm phone` would have fixed on its own, it says how many.

`pnpm phone sim` is the one to reach for when there is no phone to hand, and the one to remember
when there is: a simulator keeps whatever build was last put on it, and nothing else here ever
builds for one, so a simulator left alone for a week is a week behind. It needs no signing
certificate, no Apple team and no cable, and not even a simulator already running: with none
booted it boots this Mac's newest iPhone and waits for it, because `simctl boot` returns long
before a device can take an install. It downloads nothing — a runtime is a gigabyte and your
decision — so a Mac with no iPhone simulator at all is one of the things it stops for.

**One thing it will not do for you: restart your server.** `chipsd` is a long-lived process
running the code it was started with, so a server changed since then goes on serving the old
behaviour — quietly, and for as long as it stays up. The checks say when the running one started
before your last change to `server/`, `@chipschat/core` or `@chipschat/protocol`, and hand you the line
that restarts it. They do not run it: that is a daemon with sessions on it, and when it may go is
yours to decide.

`pnpm phone pods` is for the one thing adding a dependency does not do by itself. A package with
a native side is two halves: Metro puts its JavaScript in the bundle the moment it is installed,
and CocoaPods has to be told about the other half separately. Until it is, everything looks
right — the build succeeds, the app installs and opens — and then it aborts at launch saying the
package "doesn't seem to be linked", which sounds like the package's fault and is nobody's. The
checks read the pods in the build against the app's dependencies and name any that are missing,
so `pnpm phone doctor` says it in a second rather than a build saying it in a quarter of an hour.

### From anywhere, not only the checkout

`pnpm` needs to be run in the repository, which is a nuisance when the phone is the thing you
are changing and the terminal is somewhere else. The checkout carries a launcher for that, at
`tools/chips/chips`: put it on your path once, and the same commands work from any directory.

```sh
ln -s "$PWD/tools/chips/chips" ~/bin/chips   # any directory on your PATH
```

Then `chips phone` is `pnpm phone`, `chips phone doctor` is `pnpm phone doctor`, and so on — the
launcher finds its own checkout through the symlink, so there is nothing to configure. Bare
`chips` opens the web app in your browser, and any other word goes to the CLI: `chips serve`,
`chips pair --issue`.

`chips build mobile` is `chips phone` by another name, and `chips build mobile a` is the Android
app, [below](#on-android).

Bare `chips` holds to the same rule as `chips phone`. A browser shows whatever is on disk, and a
build older than the source it came from looks exactly like a working one — the page opens and
quietly behaves like the day it was built — so it is rebuilt before the browser is pointed at it.
And an empty port is the one case with a single right answer, so it starts the server as a launch
agent rather than printing two commands to choose between. A port held by something that does not
answer as Chips is left alone: that is somebody's, and it says so. If your shell already searched your path in this window, it has the
directory's contents remembered; `rehash` in zsh makes it look again.

`pnpm phone server` starts this checkout's `chipsd` bound to the network, advertising the address
the phone should dial — the tailnet's, when there is one, so the same address works at home and
away — and keeps it running as a launch agent. It is for a build of the app to pair with while you
work on it; a server you use every day is the one `chips up` installs
([a Mac mini](/operate/mac-mini/)). `pnpm phone connect --code ABC-234` sends a code the desktop
app issued to the phone instead of asking for one.

A free Apple team cannot sign push notifications or a link domain, and when the team is free the
tool takes both out of the build rather than let Xcode fail four hundred lines later ([a free
team](#a-free-team)). The signature lasts seven days, and `pnpm phone` again renews it.

With the phone plugged in, `pnpm phone connect` pairs it with the server on this Mac. Without a
cable, pair it as any phone does, from the QR inside the app ([Pair
it](/operate/mobile/#pair-it)).

## Under your own Apple team

A checkout builds the Chips app as Chips publishes it: signed by Chips' team, as the bundle id
`chat.chips.app`, with Chips' Expo project. Apple lets one team sign a bundle id, so a build signed
by anyone else needs a team and a bundle id of their own. `apps/mobile/app.config.js` reads them
from the environment, and Expo, Xcode's build and `pnpm phone` all go by what it reads. Each one
left unset is Chips' own.

| Variable | What it says |
| --- | --- |
| `CHIPS_APPLE_TEAM_ID` | Your team's ID, ten letters and digits. |
| `CHIPS_IOS_BUNDLE_ID` | A bundle id of your own, such as `com.yourname.chips`. The notification extension's is the same with `.notifications` after it. |
| `CHIPS_IOS_FREE_TEAM` | `1` when the team is a free one. The build then leaves out what a free team cannot sign. |
| `CHIPS_IOS_LINK_DOMAIN` | The domain whose invite links open the app: `relay.chipschat.ai` unless set. Set it empty for none. |
| `CHIPS_EAS_OWNER` | The Expo account that owns the app's Expo project. Set it empty for none. |
| `CHIPS_EAS_PROJECT_ID` | That project's ID, which push tokens are issued for. Set it empty for none. |

1. Add your Apple ID in Xcode → Settings → Accounts. A free one gets a Personal Team.
2. Find your team's ID in the teams Xcode lists:

   ```sh
   plutil -p ~/Library/Preferences/com.apple.dt.Xcode.plist | grep -E '"team(ID|Name)"'
   ```

   `pnpm phone doctor` names it too, when the team the build is signed as is not one of Xcode's.
3. Put the variables in your shell profile (`~/.zshrc`), so that every terminal has them:

   ```sh
   export CHIPS_APPLE_TEAM_ID=ABCDE12345
   export CHIPS_IOS_BUNDLE_ID=com.yourname.chips
   export CHIPS_IOS_FREE_TEAM=1    # a free team only
   ```

4. In a new terminal, run `pnpm phone`. It makes `ios/` again whenever these have changed since
   it last made it.

Build from a terminal that has them, with `pnpm phone` or `expo run:ios`. Xcode opened from the
Dock does not read your shell profile, and a build there carries Chips' Expo project in place of
yours.

### A free team

A free team, Xcode's Personal Team, cannot sign two of the app's entitlements, and
`CHIPS_IOS_FREE_TEAM=1` leaves both out of the build:

- **Push.** *Notify me on this phone* stays off and says the build cannot receive push. What needs
  you still waits in Chips, and your computer still shows its banner.
- **Invite links opening the app.** An invite link opens the relay's page in Safari instead, and
  **Open in Chips** there opens the app at the invite.

Everything else works. If the variable is missing, `pnpm phone` finds the team is free and takes
both out itself, and says so. TestFlight needs a paid team.

### Push, with a paid team

Your build needs an Expo project of its own for push, since Chips' holds the push key for Chips'
app alone. Once, with an [Expo account](https://expo.dev) and its command line
(`npm install -g eas-cli`):

1. Make the project. `eas init` refuses a config that names Chips' project, so leave the owner and
   the project ID out while it runs:

   ```sh
   cd apps/mobile
   CHIPS_EAS_OWNER= CHIPS_EAS_PROJECT_ID= eas init
   ```

   It cannot write the new project's ID into `app.config.js`, which is code rather than JSON, so it
   prints it. Add both to your shell profile:

   ```sh
   export CHIPS_EAS_OWNER=your-expo-account
   export CHIPS_EAS_PROJECT_ID=the-id-eas-init-printed
   ```

2. Give Expo your app's APNs key, as under [push on a build of your
   own](#push-on-a-build-of-your-own).
3. Give the server your phone pairs with an access token from that Expo account (expo.dev →
   Account settings → Access tokens), as `CHIPS_PUSH_ACCESS_TOKEN` ([configuration](/start/install/#configuration)).
   It then posts to Expo itself. Without it the server sends through the Chips push relay, which
   holds Chips' token, for Chips' app.

**Invite links** open the app only from a domain whose association file names the app.
`relay.chipschat.ai`'s names Chips' app, so from your build an invite link opens the relay's page,
as on a free team. For links that open your app directly, run [a relay of your
own](/operate/relay/#run-one) with `APP_ID` in `relay/src/join-page.ts` set to
`<your team ID>.<your bundle id>`, and set `CHIPS_IOS_LINK_DOMAIN` to its domain.

## In Expo Go instead

Expo Go is Expo's own app, from the App Store or Google Play; it needs no Xcode, no simulator and
no developer account, and it runs this project from the machine it is checked out on. It is a
way to look at the screens, not the app: what the development build carries natively, Expo Go
does not, and the differences are listed [below](#what-expo-go-does-not-have).

```sh
pnpm mobile:start
```

That starts Metro and prints a QR code. Scan it with the Camera app (iOS) or from inside Expo
Go (Android), and the app builds and opens on the phone.

If the phone and the machine are on **different networks** — which is the normal case with a
tailnet — Metro has to advertise an address the phone can reach, and it guesses the wrong one
by default:

```sh
REACT_NATIVE_PACKAGER_HOSTNAME=100.x.y.z pnpm mobile:start
```

Use the machine's address *on the network the phone is on*: its Tailscale address, or its LAN
address. Every URL Metro hands out — the bundle, the reload socket, the log channel — is built
from that name, so getting it right is the difference between the app loading and the app
sitting on a spinner.

Its pairing is the QR from inside the app, or the code typed by hand: `pnpm phone connect` cannot
reach it.

### What Expo Go does not have

**The keyboard.** The composer rides the keyboard rather than being told about it, and what does
that is `react-native-keyboard-controller` — a native module. Expo Go does not carry it, so in
Expo Go the field stays where it is and the keys come up over it.

**A `chips://` link.** The app handles `chips://space/<id>`, `chips://approval/<id>`,
`chips://join?…` (an invite) and `chips://pair?…` — the last is how `pnpm phone connect` hands it
a code — but Expo Go cannot
register a custom scheme for somebody else's project. Inside Expo Go a link looks like
`exp://<your-machine>:8081/--/space/<id>` instead, and the app takes that shape too.

**Push that is the app's own.** Expo removed remote notifications from Expo Go on Android in
SDK 53, and the library throws there outright. On iOS, Expo Go still carries Expo's push
entitlement and warns rather than refusing, and a push arrives branded as Expo Go. Neither is
the lock screen the development build gets.

### If Expo Go refuses to open the project

> You're signed in to Expo Go as "…", but not signed in to Expo CLI.

Sign **out** of Expo Go on the phone. A signed-in Expo Go will only open projects from an
account it recognises; a project served from your own machine belongs to no account. Running the
app needs no Expo account.

## Push on a build of your own

A push reaches a lock screen only through Apple, and Apple delivers only to a build that carries
the push entitlement, sent with a key for that app. So, once:

- **A paid Apple Developer Program membership** for the team that signs the build. A free
  personal team cannot sign the entitlement, so `pnpm phone` takes it out and says so —
  `pnpm phone doctor` shows *Entitlements: push and the link domain taken out: a free team cannot
  sign them*. Add the paid team in Xcode and the next `pnpm phone` puts them back.
- **The app's APNs key, with Expo.** Your server holds no Apple credentials; Expo's service holds
  the app's and sends with them. `eas credentials` in `apps/mobile`, signed in to the Expo account
  that owns the project, sets up the push key for the app's bundle id — it can create one under
  your Apple account or take one you already have.

The Expo project ID push also needs is Chips' own in `app.json`; a build under your own team has
its own ([push, with a paid team](#push-with-a-paid-team)). With both in place, whether Approve and
Deny on the lock screen reach the app while it is suspended is the first thing to check on the
phone.

For Chips' own app your server needs nothing more: [what push
needs](/operate/mobile/#what-push-needs) is the same for every build of it.

## On Android

`chips build mobile a` is the same path for Android, and `pnpm phone:android` in the checkout. It
checks Java 17 and the Android SDK, builds a release with the JavaScript inside it, installs it,
and pairs it with your server by the same kind of link. It installs on a phone plugged in with USB
debugging on, or, when nothing is connected, on the emulator this Mac already has, which it starts
and leaves running. An emulator reaches the Mac's own loopback as `10.0.2.2`, and the server's
address is handed to it that way.

```sh
chips build mobile a                        # check, build, install, and pair
chips build mobile a --no-pair              # build and install only
chips build mobile a --code ABC-234 --server http://100.64.0.1:4431
                                            # pair with a code the desktop app issued
```

Two things differ from the iPhone. On a lock screen, **Approve…** opens the ask once the phone is
unlocked, because an Android notification's button cannot ask for the unlock first ([Being
told](/operate/mobile/#being-told)). And push needs a Firebase project, which is not set up: until it is, *Notify
me on this phone* says the build cannot receive push.

## Onto TestFlight

A build reaches the phone through TestFlight, wherever the phone is, with one command:

```sh
pnpm phone testflight
```

runs the same checks as `pnpm phone` (with no phone and no server), wants a paid team, stamps a
build number from the clock (TestFlight takes each number once), archives the app with Xcode for
any iPhone, and uploads it to App Store Connect, signed and sent as the Apple ID signed in under
**Xcode → Settings → Accounts** (no API key or password to keep). Without that Apple ID the
command says so before it archives. `pnpm phone testflight --export` sends the last archive
again without making a new one.

`pnpm phone ship` picks the quicker of the two for a phone that already has the app. When
CoreDevice can reach the phone (on this Mac's Wi-Fi, or plugged in) the build is installed from
this Mac, minutes after it compiles, and is not opened, since the phone may be in use. Otherwise it
goes through TestFlight as above. The run's first line says which way it went and why. A direct
build is numbered from the clock too, so it is newer than every TestFlight build before it and
older than the next one. It is signed for development, so the phone is on the development push
service until a TestFlight build replaces it. A TestFlight build installed over a direct one has
kept the app's data and its pairing, since both are signed by the same team for the same bundle.

App Store Connect takes a build only for an app it has a record of, and Xcode does not make one:
the account holder makes it once, under **Apps → + → New App** with the app's bundle ID,
`chat.chips.app` or your `CHIPS_IOS_BUNDLE_ID` (the command says so when it is missing). Apple then processes each build for
five to thirty minutes. Also once, the account holder adds a group under **TestFlight → Internal
Testing** with themselves in it and automatic distribution on, and installs TestFlight on the
iPhone; every build after that reaches the phone by itself.

## Without a phone

Most of the work is not a swipe or a push; it is what a screen says. That has a faster loop than
a build:

```sh
pnpm mobile:dev
```

It starts a `chipsd` of its own, Metro, and a proxy in front of both, then prints an address and
a pairing code. Open the address in any browser and narrow the window to a phone: the same
React, the same store, the same core, a save away from the screen. Everything it runs is its
own — ports 5197, 8083 and 4434, and a database under `.chips/phone-dev/` — so the `chipsd` your
phone is paired with carries on untouched.

The proxy is the point of it. `chipsd` sends no CORS headers, deliberately, so an app served
from Metro's origin could not call the server's at all; here they are one origin, and the app
pairs with the address it was served from.

A code is single use and lasts fifteen minutes. Another one:

```sh
curl -sX POST http://127.0.0.1:5197/v1/dev/pairing-code
```

A browser is not a phone, and the difference is the list under [What is not there
yet](/operate/mobile/#what-is-not-there-yet), plus the swipe, the Keychain and the camera. Those want a simulator, below, or the installed build on a
real phone.

## On a simulator

A browser cannot swipe, cannot reach the Keychain, and has no `chips://`. An iOS simulator can,
and it is the loop to reach for when the question is about the phone rather than about a screen.
One thing neither has is a taptic engine: the app answers a send, a held bubble, a swipe past
its line and a decision in the hand, and the only place to judge any of that is a phone you are
holding.

It is the most expensive one to set up — a one-off, and most of it is a download:

```sh
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

```sh
xcodebuild -downloadPlatform iOS
```

That second one is the iOS runtime, and it is measured in gigabytes; Xcode → Settings →
Components shows the size before you commit to it. `xcrun simctl list runtimes` says whether it
landed. Then CocoaPods, which the native build needs and which nothing else here does:

```sh
brew install cocoapods
```

And the app:

```sh
pnpm --filter @chipschat/mobile exec expo run:ios
```

The first build takes ten to twenty minutes and writes `apps/mobile/ios/` from `app.json` and
its plugins. That directory is generated and ignored — anything that has to be true of the
native project belongs in the config or in a plugin, so that the simulator, a phone and CI all
read the same answer.

A simulator shares your Mac's network stack, which makes pairing easier than on a phone: no
tailnet, no QR, no LAN address. Point it at the browser loop's server —
`http://127.0.0.1:4434` — and take a code from the curl above.

What it proves that nothing else here does: a swipe, the Keychain and `expo-sqlite` for real,
the `chips://` scheme, native layout, and — with `xcrun simctl push <device> chat.chips.app
payload.apns` — a notification with the Approve and Deny buttons on it, which is most of the
phone's half of a decision.

What it still cannot: there is no camera, so pairing is **Type a pairing code instead**; and there is
no APNs registration, so `getExpoPushTokenAsync` refuses and **Notify me on this phone** will
not turn on. A push that travels — your server, Expo, Apple, a lock screen — is still a real
phone's to prove, and always will be.

### If the last step ends in an osascript error

> osascript … tell app "System Events" … exited with non-zero code: 1

The build worked. That is the step where Expo asks System Events to bring the Simulator window
forward, and macOS refuses it until Terminal is allowed to control other apps. The app is
installed and running either way; open **Simulator** yourself, or grant it under System Settings
→ Privacy & Security → Automation.

## Testing it

The app's screens are covered three ways, and it is worth knowing which is which:

| | What it covers | How to run it |
| --- | --- | --- |
| Jest | Every screen, rendered, with a recording store | `pnpm mobile:test` |
| Playwright | The app's web target, end to end against a real `chipsd` and relay | `pnpm mobile:e2e` |
| Maestro | The swipe and the Keychain, on a simulator | by hand, against `pnpm phone sim`'s build; see `apps/mobile/e2e/maestro` |

By hand, `pnpm mobile:dev` above is the fourth: the same web target the Playwright suite drives,
with fast refresh and a browser you can poke at.

`pnpm mobile:e2e` shares ports with the web suite, so never run the two at once.
