# 0098. A tab's glass follows its list natively

Date: 2 October 2026
Status: Accepted, 2 October 2026. Amends 0076 (the bullet "The ramp is there only once something
is under it": what drives the band). Its diagnosis was wrong: the band was never misplaced, it was
drawn short. See [0107](0107-a-tabs-glass-is-drawn-at-its-size-from-the-windows-insets.md).

## Context

ADR 0076 floats the name of the Spaces, Agents and You tabs over their list on the room's band of
blur (`EdgeBand`). At rest the band stands a ramp's length (40 points) higher than its place and
comes down over the list's first 40 points of scroll. A native-driven `Animated.event` carried the
list's offset to an interpolation and on to the band's transform.

On 2 October Arjun reported, twice, that the band sometimes stays up while the list goes under it.
The second time came with a screenshot of the Agents tab: the list well under the name, the band
still at rest. The first report had been answered that morning with a guess (the interpolation made
once rather than on every render, `c8dd353f`); it was on his iPhone, and the band stuck again.

Neither report was reproduced on the simulator, the first time in about forty filmed trials. Reading
React Native 0.86 found the chain sound where it was expected to break. Detach after attach keeps a
value's native node alive, and the band's props node is reused across redraws. The weak points that
remain are in its bookkeeping: a value's native node is dropped and made again under a new tag
whenever it loses its last child, while the scroll view's event mapping keeps the old tag. And the
view's copy of its props, which updates are compared against, can disagree with what its layer
shows (`_propKeysManagedByAnimated_DO_NOT_USE_THIS_IS_BROKEN`). None of them was seen to fail.

## Decision

- **The list moves the band on the native side, and nothing of React Native's stands between
  them.** `ScrollBand` (`apps/mobile/modules/scroll-band`, `src/ui/ScrollBand.tsx`) is a native view
  that holds the band. It is handed the list's React tag (`UnderName` passes it up through the
  screen's context). It watches the scroll view's `contentOffset` by key-value observing. It reads
  where rest is from UIKit's `adjustedContentInset` rather than assuming the status bar's height.
  And it moves what it holds by its layer's `sublayerTransform`, a property neither React Native nor
  Expo writes. The look, the ramp and the 40 points are unchanged.
- **UIKit's own scroll edge effect was tried first and not taken.** iOS 26 lets a custom bar ask
  for it (`UIScrollEdgeElementContainerInteraction`), and it would have needed no offset at all.
  Walked on the simulator against a copy of his workspace: the soft look fades out across the name,
  so a row's title reads through the foot of "Spaces", the same fault 0076 moved the ramp below the
  name to avoid. The hard look is a near-opaque shelf. Reaching 40 points below the name, it blurred
  the search field at rest, since UIKit applies it whether or not anything has scrolled.
- **A build without the module keeps the shelf.** `hasScrollBand()` asks for the native module
  once. The web target, Android and Reduce Transparency keep the shelf, as before.
- **`pnpm phone` checks the app's own modules for pods.** `podsWanted` in `tools/phone/phone.mjs`
  read only `package.json`, so a phone build would have gone out without the module, and the tabs
  would have quietly lost their glass.

## Consequences

- Walked on the iPhone 17 Pro simulator (iOS 26.5, Release, a copy of his workspace on a scratch
  server): at rest Spaces, Agents and You look as before (side by side with main's bundle). The band
  comes down once rows pass under the name, goes back up at the top, and does both again after
  switching tabs while scrolled and after a trip to the background. Not seen on a device: the fault
  never showed on the simulator, so his iPhone is where this is proved.
- The phone needs a native build (`pnpm phone`, which now runs `pod install` for the module); the
  JavaScript alone falls back to the shelf.
- The band moves in the same main-thread pass as the scroll view, with no JavaScript and no
  animated nodes, so a store redraw or a busy JavaScript thread cannot hold it.
