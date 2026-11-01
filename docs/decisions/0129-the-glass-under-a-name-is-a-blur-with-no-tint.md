# 0129. The glass under a name is a blur with no tint

Date: 6 October 2026
Status: Accepted, 6 October 2026. Changes the band of glass under a tab's name and above a room's
bar on iOS ([ADR 0076](0076-a-tabs-name-floats-on-the-rooms-glass.md),
[ADR 0063](0063-the-rooms-chrome-floats-on-glass.md)).

## Context

Arjun, on his iPhone: "this blur view appears to be gray'ish on the black background. Is it
possible to make it non gray? as is proper transparent with just blurring?"

The band (`EdgeBand`, `ui/Glass.tsx`) was two panes from `expo-blur`, `systemUltraThinMaterial`
and `systemChromeMaterial`. Those are UIKit *materials*: a blur with a tint laid over it so that
words on it read. On the dark page the tint is grey. On the simulator in dark mode, with rows
under the name, the band measured (26, 27, 28) against the page's (15, 16, 19). The mock the band
was dialled on (`docs/proposals/chat-glass-ramp-mocks.html`) used `backdrop-filter: blur()` with
no tint at all.

UIKit has no public blur without a material. Two private ways were tried on iOS 26.5:

- **`_UICustomBlurEffect`**, the class this kind of blur used to be made with. It is still there,
  but its setters do nothing: its radius read back 0 after being set, so the band drew the room
  unblurred at saturation nought, sharp and grey.
- **`+[UIBlurEffect effectWithBlurRadius:]`**. This leaves one filter on the backdrop, the
  Gaussian. Set live on the band, it blurred the rows into their own colours over the page's
  own black.

## Decision

1. **The band's two panes blur with no tint where the build can** (`modules/clear-blur`,
   `ChipsClearBlur`; `ui/ClearBlur.tsx`). The view is a `UIVisualEffectView` holding
   `effectWithBlurRadius:`, looked up by name, with its signature checked (`@24@0:8d16`) before
   it is called. An iOS without it gets the thinnest material.
2. **The radius is a radius now**: the thick pane at `GLASS.blur` (12 points, the mock's number)
   and the thin pane that carries the fade at `GLASS.thinBlur` (4). The masks, the ramp and the
   2% scrim are unchanged.
3. **A build without the module keeps the materials.** That covers the JavaScript alone on an
   older build, Android and the web; Reduce Transparency still draws no band.

## Consequences

- Walked on the iPhone 17 Pro simulator (iOS 26.5, Release, a copy of his workspace on a scratch
  server): Spaces scrolled in dark mode measured (18, 19, 22) under the name, the page with the
  blurred rows in it, and the room's bar measured (15, 16, 20) over (15, 16, 19). Light mode
  blurs over the near-white page with no tint.
- The constructor is not in UIKit's headers. That is fine for builds installed on his own
  phones. App Store review could object to it if the app is ever submitted. A future iOS that
  drops it gets the material back, not a broken band.
- Not seen on iOS 27, his phone's, until it is installed there.
- Words over the band have no tint to stand on. The name is 34-point bold over a blur of rows,
  and read clearly in both themes on the simulator.
- `effectWithVariableBlurRadius:imageMask:` exists beside it: one view whose blur fades, which
  could replace the two panes and their masks. Not taken; this change is only the tint.
