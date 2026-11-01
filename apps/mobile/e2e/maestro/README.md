# The flows, on a device

Eight flows — approve, deny, steer, attach, receipt, keyboard, viewer, video — against the same screens
the Playwright suite drives, written for [Maestro](https://maestro.mobile.dev). `attach.yaml` (M4.4)
picks a photo from the library and sends it: the picker and the share sheet are the platform's,
which the web target stands in for with a file input, so a device is the only place the real
sheets are seen. `receipt.yaml` (ADR 0050) presses and holds a reply for what its run did: the
long press is the platform's, which the web target stands in for with a held click.
`keyboard.yaml` types into the room and then drags the keyboard away: a keyboard that animates
is the one thing neither Node nor Chromium has, so whether the field rides the keys or jumps
after them can only be asked here. `viewer.yaml` (the media viewer, Phase 1) swipes between
photos, double-taps to zoom and drags one away: Playwright opens the viewer on the web target and
pages it with the arrows a pointer is given, and the gestures themselves are here — except the
pinch, which one finger cannot make. `video.yaml` (ADR 0163) plays a clip in the viewer upright and
on its side, through to its end, and hands it to the system player and back: where the bars stand
on a phone on its side is read from its screenshots, and `e2e/video.spec.ts` drives the same
controls on the web target.

There is no flow for the haptics (WP4), and there cannot be: Maestro can make the gesture but
nothing on the device can be asked whether it buzzed, and a simulator has no engine to buzz
with. `approve.yaml`'s swipe and `receipt.yaml`'s long press are where they would be felt, and
they are for a hand to judge on a real phone. What Jest holds instead is which feeling each
screen asked for, which is where the bug would be.

**`viewer.yaml` has been run, on the Android emulator, and `video.yaml` on the iOS simulator; the
other six have not.** `viewer.yaml` passed on `chips-pixel-9` on 15 September 2026 (the media
viewer, Phase 3), the first flow run on this machine. `video.yaml` passed on an iPhone 17 Pro
simulator (iOS 26.5, a Release build) against a scratch server on 14 October 2026, 54 steps; it
asserts only on bars that stay, because each step took seconds while a film played
(`testing/scenarios/media/video-in-a-room.md`). The others are written and checked in because the three things they cover are the
three the phone exists for, and because the two things the web target cannot reach are exactly the
two a device does: the swipe on a decision card, and the Keychain the pairing key goes into.
Everything either side of those is covered by `apps/mobile/src/**/*.test.tsx` under Jest and by
`apps/mobile/e2e/*.spec.ts` under Playwright.

Maestro is a JVM tool and is not a dependency of this repo — nothing in `pnpm check` invokes it. On
the Mac mini it is Maestro's release zip, unpacked into `~/.maestro` (CLI 2.10.0, installed on
Arjun's word), and it runs on the Temurin JDK 17 the Android build uses. It does not drive a
physical iPhone; the iOS simulator is where an iPhone flow would run.

Maestro reads `${…}` as JavaScript, so a shell-style default such as `${APP_ID:-chat.chips.app}`
stopped the first run before its first step. Each flow now gives its defaults in `env:` instead,
and `-e` overrides them. The six flows not yet run got the same change.

## What they assume

- A development build or Expo Go on the device, and Metro reachable from it.
- `chipsd` in dev mode with the demo workspace, reachable from the device — over the LAN, or
  over a tailnet (`docs/mobile.md`).
- The phone already paired. Pairing scans a QR, and pointing a simulator's camera at one is a
  thing Maestro cannot do; `pair.spec.ts` covers pairing itself, and `flows/approve.yaml`
  starts from a paired app.
- A harness raising an ask: `node apps/mobile/e2e/maestro/golden.mjs` plays the demo's Scout
  through one golden run and waits on its ask. Approve, deny and steer want it waiting; receipt
  wants a run it finished, which one approved leaves.

## Running one

On the emulator, with the app installed and paired (`apps/mobile/README.md`, *Android*), from the
repo root:

```sh
JAVA_HOME=$(/usr/libexec/java_home -v 17) MAESTRO_CLI_NO_ANALYTICS=1 ~/.maestro/bin/maestro --device emulator-5554 test apps/mobile/e2e/maestro/viewer.yaml
```

The first run installs Maestro's two driver apps on the emulator. Maestro takes some seconds per
step while a video plays, which is why `viewer.yaml` asks whether the clock has moved rather than
whether the video is still playing. In a room with many videos, scrolling up to a photo takes a
minute or two. Elsewhere:

```sh
maestro test apps/mobile/e2e/maestro/approve.yaml
```

`--env` overrides the two things that change between machines:

```sh
maestro test -e APP_ID=chat.chips.app -e SPACE=PO-4471 apps/mobile/e2e/maestro/approve.yaml
```
