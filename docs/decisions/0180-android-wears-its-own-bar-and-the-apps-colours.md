# 0180. Android wears its own bar, and the app's colours

Date: 16 October 2026
Status: Accepted, 16 October 2026, from the Android walk Arjun asked for ("thoroughly test running
chips on Android. Fix any issues and make sure everything is polished"). Changes the phone's tabs
on Android only (`app/(tabs)/_layout.tsx`), the + there (ADR 0084), and Android's theme.

## Context

There is no Android phone. The emulator (`chips-pixel-9`, Android 16) is the only Android the app
has met, and until this walk it had shown little more than that the app ran. On 16 October 2026
it drew iOS's shell through Material's defaults:

- **A sixth tab.** expo-router's `NativeTabs` is Material's bottom bar on Android, and Material
  has no slot for iOS's search tab. The trigger the + stands on became a sixth, empty item at the
  bar's end, with the + over half of it.
- **The wallpaper's colours.** Material's bar takes Android's dynamic colours: a lilac bar, and a
  lilac pill under the chosen tab, beside the app's warm page and amber. Only the chosen tab kept
  its name.
- **Android's teal.** Nothing had given the app's Android theme an accent, so every alert's
  buttons (Sign out, Delete), the time picker under Quiet hours, every switch, and the caret and
  handles in every field were AppCompat's teal.
- **A black window.** The window behind the app was the theme's black. It shows wherever the app
  has drawn nothing yet, and the launch went picture, black, app.
- **A title that dropped.** The native safe-area view measures on a pre-draw pass, and the launch
  picture holds every pre-draw until the app has something to show (`expo-splash-screen`). A tab's
  first frames drew its name under the status bar, and it dropped into place a beat later.

## Decision

1. **Material's bar, in the app's colours.** The bar is `surface2`, a step under the page, as
   Material's surface container is. The pill under the chosen tab is the amber's soft wash
   (`amberSoft`), the chosen icon and name are amber, the rest `ink3`, and the ripple is amber at
   16%. Every tab keeps its name (`labelVisibilityMode: "labeled"`), as Material asks of a bar of
   three to five (`materialLook`).
2. **The + floats above the bar's trailing end**, where Android keeps its floating action button:
   16 points in from the edge (Material's margin) and 16 above the bar's 80. The search slot is left
   out on Android (`hidden`), so the bar has four tabs. The + is the same gold +, opening the same
   sheet (ADR 0084).
3. **Each tab's list ends with room for the +** (`PlusRoom`), since a + floating over a list
   covers its last row. Without it, Archived on Spaces was under the +. On an iPhone the + is in
   the bar, so nothing is kept. `PlusRoom` and the +'s sizes are in `newSpace/plusRoom.tsx`,
   apart from the + itself, so a list and its tests do not load Reanimated.
4. **Android's theme is the palette's**, set at each prebuild by `plugins/with-android-theme.js`
   (`android/` is generated). Its accent is `amber`, light and dark, and its window is the page's
   `bg`, as the launch picture's ground already is. `src/ui/androidTheme.vitest.ts` holds both to
   `tokens.ts`.
5. **On Android a page pads itself with the window's insets** (`Page` in `ui/Screen.tsx`), which
   the root reads and knows from the first frame (`useWindowInsets`). An iPhone keeps the native
   safe-area view.

## Consequences

- Android looks like an Android app that is Chips, not an iPhone app in Android's colours. Nothing
  changes on an iPhone, an iPad, the web or the Mac.
- The plugin is native configuration, so the theme reaches a phone with its next build
  (`pnpm phone:android`). The bar, the +, and the insets are JavaScript.
- `materialLook` is the whole of Android's tab styling. Material's bar takes no blur, so the tabs'
  names do not float on glass there (ADR 0076 is iOS's).
- A debug build still shows black between the launch picture and the app while Metro's JavaScript
  loads, with the window in the page's colour, so the black is not the window. A release build goes
  picture, then app.
- Walked on the emulator, 16 October 2026: all four tabs light and dark, the + over Spaces,
  Agents, Search and You with each list's last row clear of it, a new space made from it, alerts
  and the Quiet hours picker in amber, and a release cold start with the title in place from the
  first frame. The tablet (`chips-pixel-tablet`) was not walked.
