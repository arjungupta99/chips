# 0259. The iPhone app opens its window in a scene

Date: 2 November 2026
Status: Accepted, 2 November 2026. Needed by every build made with Xcode 27.

## Context

This Mac went from Xcode 26.6 to Xcode 27.2 on 2 November 2026, for the iPhone Duo's simulator
(ADR 0256, the Duo addendum). The first build made with it opened on the Duo simulator and was
stopped at once, before it drew anything: UIKit traps an app built with the iOS 27 SDK that has not
adopted the scene lifecycle (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`).

Expo 57 and React Native 0.86 still make the window in the app delegate, at launch. The builds on
TestFlight and in App Review were made with Xcode 26.6 and are not affected; every build from now
on is, the iPhone's and the iPad's alike.

## Decision

1. **One window scene.** Info.plist declares one window scene, and no more than one, whose delegate
   is `SceneDelegate` (`plugins/with-scenes.js`). Chips has one window; a second would be a second
   Chips beside it on an iPad, which nothing here is built for.
2. **The window is made in the scene.** `SceneDelegate.swift` makes the window in the scene and
   starts React Native in it, where the app delegate did. The app delegate still makes React
   Native's factory, and no window.
3. **A link reaches React Native where it looks.** Opened by a link, a scene is told it in its
   connection options and the app delegate isn't. React Native looks for the link the app was
   opened by in its launch options, so the scene builds them from what it was opened with: a
   `chips://` link as the launch URL, a link to the relay (`applinks`) as the launch user activity.
   A link opened while the app runs reaches the scene too, and the scene hands it to the app
   delegate's own two handlers, which hand it to Expo and React Native as before.
4. **Made at each prebuild.** `ios/` is made afresh by Expo's prebuild and kept out of git, so the
   plugin writes the scene's delegate, adds it to the target, and takes the window out of the
   template's app delegate. If the template stops making its window where the plugin expects, the
   prebuild fails and says so, rather than building an app with two windows or none.

Notifications, the device token and the app's state still reach the app delegate. The modules that
find the window find it through the scene already.

## Consequences

- Built with Xcode 27.2, Chips opens on the Duo simulator (iOS 27.2) and on the iPhone 17 Pro
  simulator (iOS 26.5).
- A `chips://` link opened while Chips runs goes where it says (`chips://you` opened You). Opened
  cold, the scene is told the link and hands it to React Native as its launch URL (logged on the
  simulator). Where the router then goes is its own affair: `chips://search` opened cold lands on
  Spaces, which nothing here changed and nothing was compared with, since no build without a scene
  will open on iOS 27.
- Not tried: a relay link (`applinks`) and a push's tap, cold and warm, on a phone. Both pass
  through the same two handlers as before.

## Addendum, 2 November 2026: the link that opens the app goes to the app delegate too

Walked on the Duo simulator (iOS 27.2, the demo), the two things left untried above. A push's tap
goes where it says, warm and cold: Chips in the background or quit, the tap opened the room the push
named, beside the list. A relay link (`https://relay.chipschat.ai/join#invite=…`) opened while
Chips ran opened Chips, not Safari, and its join sheet. Opened cold, it opened Chips on Spaces and
the invite was gone.

So was `chips://search` above, and for the same reason: not the router's affair. Expo keeps the link
the app was opened by where the app delegate's two handlers put it (`expo-linking`'s registry), and
the router opens there, not at React Native's launch options. Before scenes, iOS opened the app and
then called one of the two handlers with the link; with a scene it tells the scene alone, so the
registry stayed empty.

**Decision 3, amended.** The scene hands the link it was opened with to the app delegate's handler
for it, the URL's or the user activity's, before React Native starts, as it does a link that comes
while the app runs, and still builds the launch options from it. Expo then has its link where it
had it before scenes.

With that, a relay link opened cold opens Chips on its join sheet, on the Duo simulator (iOS 27.2)
and the iPhone 17 Pro simulator (iOS 26.5). Builds from `release-1.0` have no scene and were never
affected; nothing on TestFlight or in the App Store has this.

**And the router is not given a space's link or an ask's.** Once a link opened cold reached the
router, `chips://space/spc_…` put the router's own "Unmatched Route" page over the room: the router
has no route called `space`, and `useDeepLinks`, which turns the link into `/spaces/spc_…` once there
is a store to open it with, opened the room underneath. Opened while Chips ran it did the same, which
no scene changed: 1.0 has it too, by the code (not run on a 1.0 build). The router's native intent
(`app/+native-intent.tsx`) now answers nothing for a link `routeFor` knows, which the router takes
as a link to leave alone, cold or warm; `useDeepLinks` reads the link from Expo itself and opens it
(`routerPathFor`, `src/links.ts`). Checked on both simulators: cold and warm, `chips://space/…`
opened its room and nothing else, `chips://you` opened You, and the relay link its join sheet.

Seen on the way: an invite whose server can't be reached ended its sentence in Expo's names and a
line of Swift, "(fetch failed: UnexpectedException: Could not connect to the server. (at
ExpoModulesCore/Promise.swift:56))". It now ends "(Could not connect to the server)" (`troubleOf`,
`src/pairing/useInvite.ts`).

Left as it is: a link that opens Chips cold on its join sheet has nothing under the sheet but its
shade, since nothing was open before it; OK and the X go to Spaces.
