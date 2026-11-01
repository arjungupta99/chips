# 0076. A tab's name floats on the room's glass

Date: 26 September 2026
Status: Accepted. Extends 0063. Amended by 0098 (what moves the band: the list, natively) and 0107 (the status bar's height from the window; a band drawn afresh at each size).

## Context

Arjun, on his iPhone: "update the main sections nav bar to be semi transparent, Spaces,
Harnesses, You", meaning the top of those three screens, not the tab bar.

The top of a tab screen is the app's own large name (`ui/Screen.tsx`), drawn by the app because
UIKit's large title does not work inside the phone's own tab bar with expo-router 57 (WP3,
12 September 2026). It was a shelf: it stood in the page's colour and the list began under it,
cut off hard along its foot. A room's top has had glass since ADR 0063: a band of blur behind
the bar (`EdgeBand`, dialled in `glassDial.ts`), solid at the edge and fading out below it, with
the conversation running under it.

The system's own tab bar was looked at first, on the same request misread. Its glass lives in
private UIKit layers (`_UITabBarPlatterView`), with nothing to switch to UIKit's clear style.
That look is not what this decision is about.

## Decision

- **Spaces, Harnesses and You float their name (`glass` on `Screen`).** On iOS with glass, the
  list runs the whole height of the window, up under the status bar. The name floats over it on
  the room's band: solid behind the status bar and the name, then a 40-point ramp below the name
  where the rows come clear. It is one material, dialled once, for the top of every screen that
  has something passing under it.
- **The list is told where the name ends (`UnderName`).** It is a scroll view that adds the
  name's height above the list's first row, on top of the list's own padding, and keeps its scroll
  bar below the name. The status bar's share is iOS's: these lists already take the window's
  insets (`contentInsetAdjustmentBehavior="automatic"`), and a vertical scroll view always bounces,
  so iOS adjusts its top. A line that is not in a list (`Empty`) clears both itself. The name is
  measured, and laid out from a guess until then (its padding and one 41-point line), so the first
  frame is already right.
- **The ramp is there only once something is under it.** Across the name's lower half, a row's
  words half way up the ramp read through the title. Below the name, the ramp lay over the search
  field before anything had scrolled. So the band does what UIKit's own scroll-edge effect does. At
  rest it stands a ramp's length higher, the ramp tucked into the name. It comes down into place
  over the first 40 points the list scrolls. The scroll drives it on the native side
  (`Animated.event`, native driver), so scrolling costs the JavaScript thread nothing, and the band
  moves by transform: the opacity of a blur is the one thing UIKit asks never to animate.
- **Where there is no glass, the name is the shelf it was.** On the web target, Android, or with
  Reduce Transparency on, the list is told nothing. The web target's specs see the page as before.

## Consequences

- Walked on the iPhone 17 Pro simulator (iOS 26.5) with the JS swapped into main's Release build:
  at rest the three screens lay out exactly as before, the search field crisp under "Spaces". Once
  scrolled, rows show through under the name, blurred (an avatar's colour, a badge), and fade in
  below it. Checked in light and dark. Not seen on a device.
- The Runtime tab (development only) and the pairing screen keep the shelf. They opt in with
  `glass` and an `UnderName` list if they should float too.
- With Reduce Transparency on, the first frame floats and the next is the shelf: the setting is
  read asynchronously (`useGlassy`), as it already is for the room.
- A larger text size moves the list once, when the name has measured itself.
