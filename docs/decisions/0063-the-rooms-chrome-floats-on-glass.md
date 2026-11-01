# 0063 — The room's chrome floats on glass

**Status:** Accepted, 21 September 2026.

## Context

A room on the phone was a page with two shelves on it: an opaque navigation bar above the lines,
an opaque composer below them, a hairline across the screen at each join, and the conversation in
the window between. Arjun asked for what Messages does instead — the bar and the field translucent
over the conversation, the conversation running the full height of the glass and passing under
both — and then, from the mocks, for the stronger version of it: no bars at all, each piece of
chrome floating as its own capsule, with the blur behind them fading out into the room rather than
stopping at a line.

Three mocks were drawn before any code (`docs/proposals/chat-glass-mocks.html`,
`chat-floating-chrome-mocks.html`, `chat-glass-ramp-mocks.html`). The last one carried a dial, and
the numbers below are the ones he landed on with it rather than anyone's taste here.

iOS 26 has a native answer to the fading blur — `UIScrollEdgeEffect`, which
`react-native-screens` 4.26 exposes as `scrollEdgeEffects: { top: 'soft', … }` and which would
have cost nothing at all. It has one length, Apple's, and it is about four times the one he
picked. A ramp that can be chosen has to be drawn by the app.

## Decision

1. **The room's chrome floats; it is not a bar.** The navigation bar is transparent
   (`headerTransparent`, no blur of its own, no shadow) and the composer has no ground: the list
   runs the full height of the screen and passes under both. iOS 26 gives the chevron and the
   connection's mark their own glass capsules; the room's name is given one by this app, because
   it is the piece the platform leaves bare.
2. **The numbers are five constants in one object** (`GLASS`, `ui/Glass.tsx`), dialled on the
   mock: a 16-point ramp under the bar, 4 above the field, a 12-pixel blur, capsules at 40% and a
   2% scrim. Changing the look is changing these, not the layout.
3. **Each edge's band is one blurred pane masked by a gradient**, its alpha running from full to
   nothing across the ramp — not a stack of panes at rising strengths. At sixteen points and four,
   the stack would be six native views to hide an edge that is already inside the blur's own
   radius. A longer ramp would need the stack, and it would need only this file.
4. **The chrome measures itself and the list holds its height clear.** The bar's height is the
   platform's (measured through `headerBackground`), the composer's is whatever it is carrying,
   and the pinned strip's is its own. The list is inverted, so those become its content padding
   the other way round from the way they read.
5. **Where there is no glass, the shelves come back.** With Reduce Transparency on, on Android,
   and on the web target, a capsule is the page's opaque surface, there is no band, and the
   composer keeps the ground and hairline it always had. The shape floats in all three; only the
   material changes.

## Consequences

- Two native dependencies: `expo-blur` and `@react-native-masked-view/masked-view`. Nothing in
  React Native can blur a view or mask one, and both are needed on the device, so this does not
  reach a phone without a rebuild.
- Nothing about the glass can be proved under Jest: both are mocked to plain views. That the band
  fades rather than stopping, and that a bubble is legible through a capsule at 40%, are the
  phone's to answer and the walk's.
- Android keeps the painted fallback until someone has watched `expo-blur`'s experimental blur
  under a scrolling room on the emulator. That is a decision deferred, not one made.
- Below iOS 26 the chevron and the mark are bare rather than capsuled; the name and the field
  still have their glass, and the bar still floats.
- `scrollEdgeEffects` stays unused. If the ramp ever settles on something near Apple's length,
  deleting the band in favour of one screen option would be a good trade.

## Amended 23 September 2026 — the viewer's flight is clipped to the glass less the chrome

The media viewer flies a picture home into its tile clipped to the room's glass, so a tile the
composer half covers takes the picture back *under* the composer (20 September 2026). This
decision made the glass the whole height of the screen, with the bar and the composer floating
over it, so "the glass" stopped being where a tile is seen: a picture flying home to a tile at
the foot was drawn over the composer for the last of its flight, and then swapped for the tile
under the composer's blur the instant the viewer left (Arjun, 23 September 2026). The room now
hands the viewer what its floating chrome covers at the head and the foot — the measured heights
it already holds clear in the list — and the flight is clipped to the glass less that
(`uncovered`, `apps/mobile/src/media/tiles.ts`). Where there is no glass (consequence 5) the
chrome still floats, so the same numbers apply.

## Amended 23 September 2026 — the system's glass, and no band under the field

Two days on the phone, and the band of blur behind the composer still read as a bar across the
foot of the room: a frosted strip the width of the screen, a hand deep, that the conversation
stopped at. Arjun asked for the foot to be transparent and the field to be glass the way Messages'
field is on current iOS, and picked option B from `docs/proposals/composer-liquid-glass-mocks.html`
— and the room's name with it.

- **On iOS 26 and later every capsule is the system's Liquid Glass**: UIKit's `UIGlassEffect`,
  through `expo-glass-effect`'s `GlassView`, in the regular style and the app's own theme. The
  field and the + are interactive glass. It draws its own rim and shadow and is not clipped, so
  the hairline, the shadow and the 40% wash of decision 2 are the fallback's alone. Below iOS 26
  the capsule is what this decision made it.
- **The band under the field is gone**, with its four-point ramp (`GLASS.rampBottom`). The room
  runs to the bottom of the glass. The band under the bar stays, as it was.
- **The + stands beside the field** as its own round capsule of the field's height — Messages'
  arrangement — where it had been inside the field since 21 September.
- **What stood on the band stands on a capsule of its own** (`Aside`): a refused command's
  sentence, and a closed room's line. A staged file's chip was opaque already.
- **The band under the bar fades over forty points, in two panes** (same night, "the nav bar blur
  needs to fade at bottom"): sixteen read as a line once the name was in the system's glass. The
  bar's chrome material is gone within the first 45% of the ramp and an ultra-thin material
  carries the fade to its end — decision 3's "a longer ramp would need the stack", at two panes.
  The list's scroll indicator is inset to the chrome too, where it had run up under the bar.

The new dependency is a JavaScript one only: `expo-glass-effect` 57.0.1 was already compiled into
the iOS build as a dependency of expo-router (`ExpoGlassEffect` in `Podfile.lock`), and is now
named in `apps/mobile/package.json` at the same version. As with the rest of the glass, Jest sees
a plain view; how the field reads over a photo passing under it is the phone's to answer.
