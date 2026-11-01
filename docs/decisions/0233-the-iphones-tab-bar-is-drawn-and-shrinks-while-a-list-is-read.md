# 0233. The iPhone's tab bar is drawn, and shrinks while a list is read

Date: 25 October 2026
Status: Accepted, 25 October 2026. Arjun: "when we scroll up in chips, I want the bottom tab bar and
+ button shrink slightly, tab bar will hide the tab text wen it is shrunk. This should be animated,
smooth and look very polished. Mocks first". Then, from the mock
(`docs/proposals/tab-bar-shrink-mocks.html`): "Build B (Slim), sprung."

## Context

Since 11 September 2026 the tab bar on a phone has been UIKit's own (`NativeTabs`): a bar of this
app's own making had read as Android's. On iOS 26 that bar has one behaviour as a list goes up
(`minimizeBehavior="onScrollDown"`): it folds down to the tab in front, and the other tabs go. The
gold + stood over the round slot UIKit keeps for a search tab, 62 points across, and did not change.

UIKit has no setting for a bar that gets a little smaller and hides its names. The mock put four
side by side: today's fold; A, the + folding with it (cheapest, but still iOS's fold); B, Slim, the
bar 14 points shorter with every tab where it was, the names gone and the + shrinking with it; and
C, the bar and the + scaled down together toward the middle. B and C both need the bar to be drawn.
It offered two drives: sprung, one spring once the list has clearly moved, as iOS's own fold does;
and following the finger over 52 points, as Safari's toolbar does. Arjun chose B, sprung.

## Decision

1. **On an iPhone the bar is drawn by this app, over UIKit's, which is hidden** (`ui/PhoneBar.tsx`,
   `app/(tabs)/_layout.tsx`). It stands where UIKit's stood and is the size it was (measured on an
   iPhone 17 Pro under iOS 26.5): a capsule 62 points tall, its middle 18 above the foot of the safe
   area, 21 in from the leading edge, the + 21 in from the trailing edge with 10 between. It is made
   of the phone's parts: the system's glass, each tab's SF Symbol (expo-image draws them), and the
   tab in front in the accent on a pill. UIKit's tab controller still does the switching: a press
   on the drawn bar chooses the tab as a finger on UIKit's bar would (`modules/phone-bar`), so UIKit
   shows it at once and the navigator hears of it after. Asked through the router instead, a tab
   came up a quarter of a second after the press, once React had drawn it (the simulator). Without
   the glass (Reduce Transparency) the bar is the page's surface with a hairline and a soft shadow,
   as the + is.
2. **While a list is read it shrinks, on one spring shared with the +** (`ui/barShape.ts`). The
   bar is 48 points tall and 4 lower, every tab where it was; the names fade first and the marks
   settle into the middle; the pill shrinks round the mark; the + shrinks to 48 about its middle.
   Back, the names return last. Each part moves by transform and opacity, and only the glass's
   height is set, on the UI thread. The spring settles in a little over half a second with the
   faintest overshoot. With Reduce Motion there is no spring: a quick change of size and a fade.
3. **The list says when, from the native side** (`modules/phone-bar`, `ui/phoneBarNative.tsx`).
   A view at the foot of each tab's list (`PlusRoom`) finds the scroll view it stands in and watches
   its offset. It says the list is being read once it has gone 24 points down in one movement past
   the first row (40 points), and not read when it comes 16 points back up or reaches 24 points from
   the top. A bounce past either end is not a movement. It speaks only when that changes, so no
   offset comes to React.
4. **It comes back for another tab**, when the bar returns from stepping aside for a screen's own
   bar ([ADR 0181](0181-spaces-are-picked-to-archive-or-delete-together.md)), and when the tab in
   front is pressed again, which also takes its list to the top, as UIKit's bar did.
5. **A finger on a tab brings the pill under it**, a little swollen, in place of UIKit's lens.
   Lifted there, the tab is chosen; lifted elsewhere, the pill goes back.
6. **The lists keep room for the bar.** UIKit's bar was in the safe area and the lists cleared it
   by themselves. The drawn one is over the list, so each tab's list keeps the bar's top half and
   its lift (49 points) below its last row, and its scroll bar stops there.
7. **An iPad and Android keep their own bars.** An iPad's stands at the top of the window ([ADR
   0177](0177-an-ipad-is-an-ipad.md)) and its + is the bar's own search slot; Android's is
   Material's ([ADR 0180](0180-android-wears-its-own-bar-and-the-apps-colours.md)). The web target
   keeps the bar it draws, and the Mac its rail.

## Consequences

- The bar does what was asked, and the + goes with it, on a spring this app controls.
- The bar is this app's to keep right. UIKit's press lens that slides between tabs is gone; the pill
  does the same work on our spring. Tab names don't grow with Dynamic Type. A change Apple makes to
  its own bar does not reach this one.
- A tab whose list is shorter than the screen never shrinks, since it never moves.
- A new native module means a build with it: `pnpm phone pods` before the next phone build.
- Under Jest the watcher draws nothing (no native module); the bar's numbers are tested on their own
  (`barShape.vitest.ts`). How it moves is walked on a simulator and on his iPhone.
- The mock is kept as `docs/proposals/tab-bar-shrink-mocks.html`, with its still
  `tab-bar-shrink-bars.png`.

## Addendum, 25 October 2026: on its side

Arjun, the same day: "in phone landscape the bar should not take up the whole width. in phone
landscape it should also just go in slim mode." On its side the bar had run the width of the window
less the +, 760 points on an iPhone 17 Pro, its four tabs spread along it, at full height on a
screen with little height to spare.

1. **On its side the bar is the size it is upright, at the left, and the + at the right.** The
   bar is as wide as it would be across the phone's short side. It stands 21 points in from the
   safe area's leading edge and the + 21 points in from its trailing edge, as both stand upright,
   where the safe area runs to the window's edges (`barFrame`). They first stood together in the
   middle of the window; Arjun, on his iPhone: "in landscape the + goes on right and tab bar goes
   on left. Right now they look off in the center".
2. **On its side it stands where UIKit stands its own bar.** UIKit's bar on its side (the Files app
   on an iPhone 17 Pro under iOS 26.5) is a capsule 44 points tall in the middle of the window, its
   foot on the safe area's, 21 points up. Ours stood 10 points lower, over the home bar. Now the
   shrunk bar's foot is on the safe area's, and the + with it (`barLift`).
3. **On its side it is always shrunk.** The shrink rests at 1 rather than 0: what a list says
   about being read, a press on the tab in front, another tab and the bar's return from stepping
   aside all leave it there. Turned upright, it comes back to full size, as for another tab.
4. **A phone opened on its side starts shrunk**, rather than shrinking as it opens.

The lists keep the same 49 points of room: on its side the shrunk bar's top stands 48 points above
the safe area's foot. Walked on the simulator, 25 October 2026: opened on its side, a list read and
pulled back, another tab, Select and Done, turned upright and back.
