# `@chipschat/mobile`

The Chips phone app: Expo, React Native, and the same `@chipschat/core` the web app runs.

It shares everything above the platform. The socket, the resume, the fold from the event log,
the optimistic sends and the composer's commands are core's; what is here is the four screens,
and three seams where a phone is not a browser.

| Seam | Browser | Phone |
|---|---|---|
| `crypto.subtle` | the browser's | `@chipschat/subtle`, in JavaScript ([ADR 0044](../../docs/decisions/0044-the-phones-webcrypto-is-ours-in-javascript.md)) |
| The device key | a non-extractable `CryptoKey` in IndexedDB | the Keychain, by `keepKey`/`loadKey`, read once the phone is open (`src/device/held.ts`, ADR 0228) |
| The offline cache | IndexedDB | SQLite (`expo-sqlite`) |

Each has a `.web.ts` beside it that hands the browser's version back, because the app has a web
target as well — the one the Playwright suite drives.

## Running it

The target is the **installed build on a real phone, not Expo Go**. `pnpm phone` is that path
end to end — check, build, sign, install, and pair — in one command, run from the checkout on
the Mac the phone is plugged into:

```bash
pnpm phone                 # check, build, install, then pair the plugged-in phone by itself
pnpm phone doctor          # only the checks, each with the command that fixes it
pnpm phone sim             # the same, in a booted simulator: no signing, no cable
pnpm phone connect         # pair an already-installed phone (mints its own code)
pnpm phone server          # chipsd as a launch agent, then pair — run this first on the mini
pnpm phone pods            # link a dependency with a native side, after adding one
pnpm phone fix-chain       # install Apple's missing WWDR intermediate
```

From outside the checkout, `tools/chips/chips` is the same thing: symlink it onto your path and
`chips phone …` reads every one of those lines with `chips` for `pnpm`. `chips build mobile` is
`chips phone` by another name, and `chips build mobile a` is the Android app the same way
(`pnpm phone:android`, below).

`tools/phone/phone.mjs` is the whole of it, and its header comment is the reference: the checks
exist because the first install failed eight times, each for a reason no error named. What a
session needs to know before touching this:

- **The phone must be unlocked** for the pairing launch — `devicectl … process launch` fails
  "not unlocked" when it is locked (install works locked). That is the one manual moment; the
  code is delivered as a `chips://pair?…` link at launch, so nothing is typed or scanned.
- **Pairing survives an app update.** The device key lives in the Keychain, so a rebuild and
  reinstall reopens still paired. You rebuild roughly weekly only because a free Apple team
  signs a build that iOS will launch for seven days; that is a rebuild, never a re-pair.
- **`chipsd` on 4431 is the launch agent `chat.chips.serve`** (since 10 September 2026). Check
  `lsof -nP -iTCP:4431 -sTCP:LISTEN` before believing anything about it; restart it **only on
  Arjun's word** (`pnpm phone server`, or `launchctl kickstart -k gui/$(id -u)/chat.chips.serve`)
  and never `pkill` by pattern. It leaves an operator token at `.chips/operator.<port>.token` so this
  machine can mint a pairing code with no paired device ([ADR 0048](../../docs/decisions/0048-the-machine-that-runs-the-server-can-always-issue-a-pairing-code.md)).
- **A dependency with a native side is not in the build until `pnpm phone pods` runs.** Adding
  one — `expo-haptics`, `react-native-keyboard-controller` — puts its JavaScript in the bundle
  at once and its native half nowhere, so the build succeeds, the app installs, and it aborts at
  launch saying the package "doesn't seem to be linked". The checks compare the pods in the
  build with the app's dependencies and name any that are missing.
- **Two ATS keys cancel out.** An installed build needs exactly
  `NSAppTransportSecurity` = `{ NSAllowsArbitraryLoads: true }` in `app.json`; adding
  `NSAllowsLocalNetworking` makes iOS ignore the first and silently refuse cleartext to the
  tailnet. `pnpm phone doctor` flags the combination.
- **A browser cannot pair over plain HTTP away from loopback** — WebCrypto needs a secure
  context. Pair a browser at `http://127.0.0.1:4431` on the machine that runs chipsd, or behind
  HTTPS; the phone's Camera app opening a QR in Safari hits the same wall.

The other loops, for what a device cannot answer faster than a browser can — Expo Go stays for
a quick look, and `pnpm mobile:dev` is the fastest of all:

```bash
pnpm mobile:start          # Metro + Expo Go; scan the QR with the Camera app (the old way)
pnpm mobile:dev            # the app in a browser at 127.0.0.1:5197, fast refresh, its own chipsd
pnpm mobile:test           # the Jest component suite
pnpm mobile:export         # the iOS and Android bundles, with no device, Xcode or Android SDK
pnpm mobile:e2e            # the web target under Playwright, against a real chipsd
```

[Building the phone app](../docs/src/content/docs/contribute/phone.md) has the full walk: the
recurring traps, Expo Go's caveats, the simulator, and pairing by hand.

## Android

`chips build mobile a` (`pnpm phone:android`, `tools/phone/android.mjs`) is the Android app end
to end: it checks Java 17, the SDK against React Native's own version catalogue and the
dependencies; takes a phone plugged in with USB debugging on, or boots the emulator when nothing is
connected and waits for its Wi-Fi; builds a release with the JavaScript inside it, so no Metro has
to run; installs it; and pairs it with `chips pair --issue`'s code as a `chips://pair` link, waiting
on the workspace's device registry the way `pnpm phone` does. `--no-pair` stops after the install,
and `--code … --server …` pairs with a code already issued. The steps by hand further down are for
a debug build on Metro, with fast refresh. What a session needs to know:

- **The toolchain is on the Mac mini, and there is no Android phone.** Temurin JDK 17 is in
  `~/Library/Java/JavaVirtualMachines` (not Homebrew's `openjdk@17`, which pulls in a stack of
  X11 and graphics libraries), and the SDK is in `~/Library/Android/sdk`: platform 36,
  build-tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1, the emulator, and the Google Play arm64
  image, which is the kind that can get a push token. The emulator is `chips-pixel-9` (2 GB of
  memory, a 6 GB disk). Nothing sets `JAVA_HOME` or `ANDROID_HOME` in a shell, so set both for a
  build. It reaches the tailnet through the Mac, and the Mac's own loopback as `10.0.2.2`, but
  only about 6 s after Android says it has booted: its Wi-Fi comes up last, and a connection
  before then is *Network is unreachable*.
- **Plain HTTP is allowed, the way ATS allows it on iOS.** Android 9 and later refuse cleartext
  in a release build, and a server on a LAN or a tailnet address is plain HTTP.
  `expo-build-properties` sets `usesCleartextTraffic` in `app.json`; a debug build allowed it
  already.
- **Approve on a push opens the ask** rather than deciding, because Android cannot ask for the
  unlock on a notification's button (ADR 0045's addendum, `approvesFromLockScreen` in
  `src/push/payload.ts`). Deny still decides from the lock screen.
- **Push needs a Firebase project**: its `google-services.json` as `android.googleServicesFile`,
  and its sending key given to Expo with `eas credentials`. Neither is done, and until then the
  switch says *This build cannot receive push* and stays off, as a build without the entitlement
  does on iOS.
- **Prebuild says `userInterfaceStyle` needs `expo-system-ui`.** It can be ignored: the generated
  theme is `Theme.AppCompat.DayNight`, which follows the phone's dark mode by itself, and
  `automatic` asks for no more than that.
- **Building a debug build by hand.** `expo prebuild --platform android`, then in `android/`
  `./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a` with `JAVA_HOME` and
  `ANDROID_HOME` set. The first build took 7½ minutes and left a 101 MB APK and 4.3 GB in
  `~/.gradle`. `adb install -r` the APK from `android/app/build/outputs/apk/debug/`.
- **A debug build on the emulator asks for its bundle at `10.0.2.2:8081`**, the Mac as the emulator
  sees it, not at `localhost:8081`, so `adb reverse tcp:8081 …` does nothing for it. Beside
  `pnpm mobile:dev`, whose Metro is on 8083, write the dev host into the app's preferences once
  (the app stopped):
  `adb shell "run-as chat.chips.app sh -c 'mkdir -p shared_prefs && cat > shared_prefs/chat.chips.app_preferences.xml'"`
  fed `<map><string name="debug_http_host">10.0.2.2:8083</string></map>`.
- **Pair to `chipsd` itself, at `http://10.0.2.2:4434`.** The proxy on 5197 is for a browser, which
  needs one origin; an app does not. Mint a code with `POST /v1/dev/pairing-code` on 4434 and hand
  it over as `pnpm phone connect` does, as a link:
  `adb shell "am start -a android.intent.action.VIEW -d 'chips://pair?pair=…&v=1&lan=…' chat.chips.app"`.
- **Driving it.** `adb exec-out uiautomator dump /dev/tty` lists what is on screen, and a `testID`
  arrives there as `resource-id`. `adb shell input tap`, `input text` (a space is `%s`) and
  `input swipe` do the rest; `adb exec-out screencap -p` is a screenshot. A soft keyboard beside the
  emulator's hardware one needs `settings put secure show_ime_with_hard_keyboard 1`. JavaScript's
  console is in `adb logcat -s ReactNativeJS`, the Runtime report with it.
- **The media viewer on Android** (the media viewer proposal, Phase 3, 15 September 2026).
  The same viewer as on the iPhone, with what the platform owns:
  - It opens from the tile and flies back into it. The back key, and the back gesture from
    either edge, close it that way. A swipe that starts inside pages.
  - The status bar over it has light icons and hides with the bars. Picture in Picture pins the
    video alone, black around it and shaped like it.
    - Both are `apps/mobile/modules/viewer-window`, a local Expo module for Android only: the
      viewer's `Modal` is a dialog window, and those two are the window's to decide, which
      nothing in JavaScript can reach.
    - It is autolinked, so it is in any build from `pnpm phone:android`. It adds no package, and
      the iPhone build does not see it.
  - Save puts the file as it was sent into the gallery, and Share opens Android's share sheet,
    with Quick Share. System player is ExoPlayer's own controls: speed and audio behind the gear,
    captions when there are any, no AirPlay.
  - A video plays the H.264 copy the server makes. An iPhone's HDR original, 10-bit HEVC, does
    not decode on the emulator, whose decoders take HEVC Main only. While its copy is being made
    the poster stays with *This phone cannot play the original*, and Try again fetches the copy
    once it is made.
  - The click at the dismiss line is Android's `Clock_Tick`, and an emulator has no motor to feel
    it: unanswered until there is an Android phone.
  - `e2e/maestro/viewer.yaml` runs on the emulator, the first flow to (its README says how).
- **What the walk found.** Every Runtime check passes, the key store and native AES-GCM included.
  Pairing by link, the room, the composer riding the soft keyboard, the swipe, the back button, the
  Material tab bar with its badge, Android's photo picker over the attach sheet, and dark mode all
  work. Android's photo picker names a picked photo by its media id (`18.jpg`). Not walked: the
  camera, a voice note or a video, Files, a long press for the receipt, and anything on a lock
  screen, which needs push.

## The layout

```
index.ts                  the entry: crypto first, then expo-router's
app/                      the routes — (tabs)/, needs/, spaces/, harnesses/, pair
e2e/                      the web target under Playwright, and the Maestro flows
src/runtime/              installing crypto, the capability checks, the timings
src/device/storage.ts     DeviceStorage over SQLite and the Keychain
src/cache/sqlite.ts       Cache over SQLite
src/prefs.ts              small facts about this phone, in SQLite of their own
src/links.ts              where a chips:// link goes
src/pairing/              the code, the offer, and the link a scan or a launch carries
src/words.ts              what a card says about an ask
src/needs/                the ask's card, the decision, the question form
src/spaces/               the space list, the lines, the composer over core's `act`
src/harnesses/            the fleet and one harness's profile
src/you/                  the notification settings, the devices, the way out
src/store/provider.tsx    one device, one store, for the whole app
src/ui/                   the design system: tokens, vocabulary, primitives
```

## The three suites, and why there are three

**Vitest** runs the pure modules — the tokens, the vocabulary, the words, the links, the space
rules — under the root run, and they are counted in coverage. It cannot host React Native, so
nothing in it may import an `expo-*` module.

**Jest**, on `jest-expo`'s iOS preset, renders every screen. They are told apart by name:
`*.vitest.ts` is the first, `*.test.tsx` the second. `jest.setup.js` mocks gesture-handler's
swipeable, because Reanimated cannot be imported under Node at all — and says what that costs —
along with `needs/Crossing.tsx`, the one file of ours that imports Reanimated, for the same
reason. It takes the keyboard controller's own mock, which draws its provider and its avoiding
view as plain views with the keyboard at rest, and makes the haptics engine a set of spies, so a
test can prove which feeling a screen asked for and never that a phone buzzed.

**Playwright** drives the app's *web target*, end to end against a real `chipsd` and a real
relay. It is not a device and does not pretend to be: `e2e/maestro/` holds the six flows for
one, written and not run, with a README saying why.

## Metro

`metro.config.js` teaches Metro two things. The workspace root is watched, and hierarchical
module lookup stays **on** — pnpm keeps each package's dependencies beside it, so
`@chipschat/subtle` finds `@noble/curves` by walking up from its own source and nowhere else.
Turning it off, which is the usual advice for a Yarn workspace, makes those unresolvable.

And a `resolveRequest` maps a relative `./x.js` inside `packages/*` onto the `x.ts` that is
really there: the shared packages are NodeNext, where a sibling import spells the file `.js`.
Expo SDK 57 does not do this itself — removing the resolver fails the bundle at
`packages/subtle/src/index.ts`, which is how it was checked.
