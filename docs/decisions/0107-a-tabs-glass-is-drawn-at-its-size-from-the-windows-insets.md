# 0107. A tab's glass is drawn at its size, from the window's insets

Date: 3 October 2026
Status: Accepted, 3 October 2026. Amends 0076 (where a tab's name and glass take the status bar's
height) and corrects 0098, whose diagnosis was wrong. The record was removed on 4 October 2026, on
his word.

## Context

Arjun reported the glass under the Spaces, Agents and You names (ADR 0076) staying up while the
list went under it: twice on 2 October, and again on 3 October on You and Agents. Each fix changed
what moves the band: the interpolation made once (`c8dd353f`), then the native band of ADR 0098.
Neither held. He asked for a step back.

Nothing about the fault had ever been observed, only guessed. It had never shown on a simulator,
in some fifty walks. The simulators here run iOS 26.5; his iPhone runs iOS 27.0.1, and Xcode 26.6
has no iOS 27 runtime. So the band was made to keep a record on his phone
(`Documents/band.log`, read off it with `devicectl`). The record notes which list the band
follows, where it is put and where it is shown, the insets and name height React gives it, and
the size of everything it draws with.

What the record showed, at 13:44 and 16:34 that day, with him looking at a stuck band on You:

- **The band was never misplaced.** It followed the right list and went down and up with every
  scroll; its check against the list on screen never failed. Arjun saw what the record could
  not: "the starting blur line generally overlaps with the title text, but in the buggy case it
  starts way above".
- **It was drawn short.** The band was 163 points tall: the status bar's 62, the name's 61 and the
  ramp's 40. Inside it, the gradients that cut the two panes of blur (react-native-svg, as masks
  through `@react-native-masked-view`) and the scrim were still drawn at 101. The glass stopped
  62 points short, above the name, whether the band stood up or down.
- **101 is the band with no status bar.** Each time the app came back from the background (13:53:46
  and 16:10:29), every tab not on screen was told its top inset was 0. That tab's own safe-area
  provider says so: `NativeTabs` wraps each screen in one. When the tab was shown, the real 62
  came a few frames later. The band was drawn at 101 when it came into the window; when it grew
  to 163, its gradients were not drawn again.

Replayed on the simulator, by telling a tab off screen that its top is 0 and the truth 50 ms
after it shows, the same thing happened: band 163, gradients 101, the blur ending halfway down
the profile picture on You.

## Decision

- **A tab takes the status bar's height from the window.** `WindowInsets` (`src/ui/windowInsets.tsx`)
  reads the insets at the root of the app, above the navigators, where the view never leaves the
  window, and `Floating` in `Screen.tsx` reads them from there (`useWindowInsets`). A tab off
  screen being told 0 no longer reaches its name or its glass. This also stops the name standing
  under the status bar for the frames before the real inset arrives.
- **A band is drawn afresh whenever its size changes.** `EdgeBand` is keyed by its height and
  ramp, so a new size makes its masks, blur and scrim again at that size rather than resizing
  them. Being drawn fresh is the path that has always come out right: every launch. A band's size
  changes only with the window, the text size or a bar's height, so remaking it costs nothing seen.
  This covers the room's band (`SpaceView`) as well.
- **ADR 0098's native band stays.** It does what it says, and the record proved it right. But the
  reason it was made was wrong: React Native's `Animated` chain was never shown to fail either, and
  whether to go back to it is a separate question.
- **The record stays until he has seen the fix hold**, then goes: the `BandLog` section of
  `ScrollBandModule.swift`, the `label` prop, and `bandLog` in `ScrollBand.tsx` and `Screen.tsx`.
  It went on 4 October 2026 on his word ("remove the blur diagnostic logging"), with no report of
  the glass stuck since the fix. `ScrollBandModule.swift` and `ScrollBand.tsx` are as ADR 0098
  built them. The two files it wrote, `Documents/band.log` and `band.1.log`, stay in the app's
  container, about 4 MB at most, until the app is deleted.

## Consequences

- Tests: a band remade at a new size and only then (`Glass.test.tsx`); a tab told its top is 0
  under a window that knows it is 59 still sizes its band from the 59 (`Screen.test.tsx`). Both
  fail without the change.
- Walked on the iPhone 17 Pro simulator with the replayed iOS 27 inset: the gradients follow the
  band from 101 to 163, and the blur covers the profile picture as it should.
- Not seen on his iPhone before the record went, where iOS 27 tells a tab 0 for real. If the glass
  ends short again, the record is in this ADR's commits (`53165851`, `bfddc316`) to put back.
- The lesson for this codebase: a fault seen only on one device is measured on that device before
  anything is changed. Two fixes went to the phone on readings of the code, and both were aimed at
  the part that was working.
