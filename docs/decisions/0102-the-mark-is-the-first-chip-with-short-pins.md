# 0102. The mark is the first chip, with short pins

Date: 3 October 2026
Status: Accepted, 3 October 2026. Supersedes 0096 point 1 (the mark as a rounder chip with six
pins) and point 4's six steps; keeps the rest of 0096, above all that the logo and an agent's
outline are one drawing. "Rounded square, pins on the sides, one bite out of the corner" (the
blueprint's Brand section) still describes it.

## Context

ADR 0096 made the mark D: corners of 0.42, a bigger bite with eased points, and six short round
pins. It went live on 2 October. Arjun did not like it: "I am not liking the chips logo still. I
need some more variations".

Several rounds were mocked on 2 and 3 October, each as the app icon, the mark at 16 to 48 points,
an agent's face in every state and a moving Agents tab:

- eight new directions beside D (a bite with crumbs and no pins, a crinkle-cut edge, a stack of
  two, a speech bubble, a poker chip, a chip on legs, a pixel chip, a folded corner);
- D with one more pin on each side (ten), then the same with thinner pins;
- that thinner D beside the very first mark, the one from before 0096;
- the first mark in nine sizes, its pins thin, as they were or thick, by short, as they were or
  long, with sliders for anything in between.

He picked the first mark with its pins as thick as they were and short: "let's do the 'bigger
chip'". Short pins leave more of the box to the chip, so at any size the chip itself stands
bigger than the first mark's.

## Decision

1. **The mark is the first mark's body.** A rounded square with corners of 0.25 of its side,
   and a bite of radius 0.281 25 centred 0.0625 inside the top right corner, its two points left
   sharp. Those are the first mark's numbers: a body of 16 in a 24 box, a bite of 4.5 centred 1
   inside the corner. `bittenPath` draws no easing arcs when the easing is nothing.
2. **Ten round pins at quarters of each side,** where the first mark's stood: two on the top
   (0.25, 0.50) and two on the right (0.50, 0.75), since the bite takes the third, and three
   along the foot and three up the left. They are 0.125 of the side thick, as the first mark's
   were, but stand only 0.13 out of the body where the first mark's stood 0.22, and tuck 0.04
   under it. The top's and the right's mirror each other across the diagonal through the bite,
   as the foot's and the left's do.
3. **Still one drawing.** The numbers live in both `outline.ts` files as before, and the web's
   mark, the phone's working mark, every agent's face and the app icons are drawn from them.
   Agents now wear the sharp bite and the first mark's corners too. Before 0096 they wore a copy
   of their own, with eased points and thinner pins; that copy is not coming back.
4. **The pins stand inside the box,** as 0096 has them: the body is 1/1.26 of the box, 19 of 24.
   The mock left the first mark's sliver of air past the pins' ends and drew the body at 18.2 of
   24; the build keeps 0096's rule, so the chip is a touch bigger still.
5. **The light takes a second and a half to go round,** ten pins 150 ms apart (`PIN_STEP_MS`),
   each lit in 130 ms and let go in 260 ms.
6. **The icons are drawn at the size the mock showed:** the chip's body is 528 of the phone
   icon's 1024 (D's was 568), 424 of the Mac icon's 824 tile, 390 in Android's adaptive icon,
   264 of the splash's 512, and still 14 of the menu bar's 22.
7. **The phone's ring round an agent takes its corner from the outline** (`BITE.corner`), which
   its comment already claimed. It had been 0.28, the old agent copy's corner, since before 0096.

## Consequences

- The icons change only with new builds: the iPhone's with `pnpm phone` (after
  `expo prebuild --platform ios --no-install`, since an icon change alone does not remake
  `ios/`), the Mac app's and its menu bar's with `pnpm desktop`.
- The web visual baselines of the mark were regenerated with `pnpm visual:update`.
- A chosen mark, the initials and the bite's dot sit where they did, as fractions of the body.
  The squarer corners give a chosen mark a little more room.
- Nothing was walked on an Android device.

## Alternatives considered

- **Keeping D** (0096), or **D with ten pins, thick or thin.** Rounder and softer. After seeing
  them he asked for the first mark beside the thin one, and then for variations of the first.
- **The first mark exactly as it was,** pins 0.22 out. It reads as a chip at once, but its body
  is only 16 of 24, and an agent wearing it is a small face in a wide fringe of pins.
- **The other seven first-mark sizes.** Not picked. Long pins shrink the chip and every agent's
  face with it; thin pins all but vanish at 16 points.
- **The eight new directions** (no pins, crinkle, stack, bubble, coin, legs, pixel, fold). Not
  picked.
- **Agents keeping a shorter-pinned copy of their own** under a longer-pinned logo. That is what
  0096 ended: two drawings that had already drifted. With short pins it is not needed.

## Addendum, 7 October 2026: the mark's body is lit as an agent's face is

Arjun: "add a gradient on the main chips icon, similar to how we have a mild gradient on the Agent
icons". An agent's face lights its ground from above in OKLCH (`litGround` in
`apps/mobile/src/ui/lit.ts`, `--avatar-top`/`--avatar-foot` in `avatar.css`): lightness +0.075
and the hue 12° cooler at the top, −0.03 and 8° warmer at the foot. The grounds are all deep enough
for white to read on; the gold is far lighter, and the whole light took its top to cream and its
foot to olive. Half of it reads on the gold as mild as the whole does on a ground, so the mark takes
half (`MARK_LIGHT` = 0.5; `#f5c542` runs `#fed17b` to `#ebc339`).

- The web's mark (`mark.tsx`) carries its own gradient down the body's square; `mark.css` works the
  halved sum out from `--mark-body`, so a finished turn's grey, the red of a server out of reach and
  the green of one reached again are lit the same way. Browsers without relative colours draw the
  body flat. The colour changes ease on the gradient's stops instead of the body's fill.
- The phone's working mark (`ChipPulse`) lights whatever body it is handed with `litGround` at
  `MARK_LIGHT`.
- The phone's icon, Android's adaptive icon, the splash and the Mac's icon fill the body with that
  gradient, top to foot of the outline's square; the icon guardrail holds the stops to
  `litGround(#f5c542, MARK_LIGHT)`. The menu bar's stays flat, as a template in one colour.
- The pins and the ink tile are unchanged. The icons change with new builds only, and the iPhone's
  needs `expo prebuild` first.
