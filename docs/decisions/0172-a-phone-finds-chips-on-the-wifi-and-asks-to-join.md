# 0172. A phone finds Chips on the Wi-Fi and asks to join

Date: 15 October 2026
Status: Accepted, 15 October 2026. Phase 3 of the [install plan](../proposals/install-onboarding-plan.md)
(§3.2, "the phone, from the Wi-Fi"), built to the [first-run build plan](../proposals/first-run-build.md).
Uses [ADR 0122](0122-a-harness-or-a-device-asks-to-join-and-a-person-allows-it.md)'s device request,
which the server and the computer's request dialog already took.

## Context

A phone in no workspace offered an invite link, a camera for a QR, and a code typed with the
server's address. Each needs the computer in front of you first. A server bound to the network
already advertised itself over Bonjour (`_chips._tcp`), and the Mac app's finder listed it, but the
phone had no way to look. The same advertisement was named "Chips" whoever's it was.

## Decision

1. **The server advertises "Chips on Arjun's Mac mini"**, with `machine` in its record beside
   `workspace`, so that two on one network are told apart and a phone lists each as its owner
   named the machine. Still only when it is bound to a network, never on loopback.
2. **The phone looks for three seconds** with a module of its own (`modules/chips-finder`,
   `NetServiceBrowser`), and lists what it resolved, by machine, with its IPv4 address. The app
   lists `_chips._tcp` in `NSBonjourServices`, and the first look asks for local network access.
   Android and the web have no such module and show nothing there.
3. **A tap asks to join** (core's `askToJoin`): a device request with this phone's new key; the
   phone shows the code the server gave it, the computer's request dialog shows the same one, a
   person allows it there, and the phone collects its credential. Nothing is typed. Cancel stops
   asking; a refusal or the code running out says so.
4. Away from home, the QR is still the way in: a device request is only taken from the network
   (ADR 0122).

## Consequences

- His live server's name on the network changes from "Chips" at its next restart.
- The phone learns the relay its server has from `/v1/health` after it is in, as one paired on the
  network always has (ADR 0038).
- A new build is needed for the module and the Info.plist key: `pnpm phone build` after a prebuild.

## Addendum, 16 October 2026: Android looks too (AN-27)

The Android walk found no "Chips on this Wi-Fi" on Android (testing/findings.md AN-27). On his word
("Fix the Android 'Chips on this Wi-Fi' finding"), `modules/chips-finder` has an Android half,
`ChipsFinderModule.kt`. It runs the same `_chips._tcp` browse through Android's `NsdManager` and
answers `find` in the same shape: name, IPv4 host, port, `machine`, `workspace`. Services are
resolved one at a time, since before Android 14 a second resolve while one runs fails. Android asks
for no permission to browse, and the app already allows cleartext to the address it finds. A browse
Android refuses answers with nothing found, and the screen offers the other ways in. `finder.ts`
asks for the module on Android as on iOS (`finder.test.tsx`).

Not yet seen to find a server. The emulator's network cannot see the Mac's Wi-Fi, and there is no
Android phone here. The module compiles (`:chips-finder:compileReleaseKotlin`), and a phone on the
Wi-Fi is its first real test. Going live is an Android build (`pnpm phone:android`); iOS is
unchanged.

## Addendum, 4 November 2026: the code is worked out, not handed over (ADR 0278)

Decision 3's code no longer comes from the server. The phone asks with a commitment to a nonce,
the server answers with its key and a nonce of its own, and both ends work the code out from both
keys and both nonces ([ADR 0278](0278-a-phone-that-asks-on-the-wifi-works-its-code-out-with-the-server.md)).
The screens are as they were. A phone with this change says so and asks no further of a server
that doesn't answer that way.
