# 0096. The mark is a rounder chip with six pins

Date: 2 October 2026
Status: Accepted. Amends 0089 point 1 (an agent's outline and its ten pins) and the drawing of the
mark in the blueprint's Brand section; "rounded square, pins on the sides, one bite out of the
corner" still describes it. Point 1, the drawing, and point 4's six steps are superseded by 0102 (the
first chip, with short pins), 3 October 2026; the rest stands.

## Context

The mark was a gold rounded square with a sharp-edged bite out of its top right corner and ten
long, thin pins. Agents have worn it as their outline since ADR 0089, in a copy of their own: the
same body with its bite's two points eased, and thinner pins.

Arjun asked for the logo to look "more cute", with mocks of the Agents tab after the change. Four
were mocked on 2 October, each as the app icon, the mark at 16 to 32 pixels, an agent's face in
every state, and a moving Agents tab: **A · Plump** (rounder corners, a softer bite, six short
round pins), **B · Smile** (A with eyes, a smile and cheeks), **C · Buddy** (a squatter body,
feet and arms, a face). He asked for a fourth, **D**: C's body, no face, and A's six pins. He
picked D: "go with D, build it".

## Decision

1. **The mark is D.** A rounded square with corners of 0.42 of its side; a bite of radius 0.28
   centred 0.02 inside the top right corner, its two points eased by circles of 0.10; and six
   round pins, 0.15 wide, standing 0.13 out of the body and tucked 0.05 under it. One stands on
   the top at 0.40 and one on the right at 0.60, since the bite took the other of each pair; two
   stand along the foot at 0.64 and 0.36, and two up the left at 0.64 and 0.36. The top's and the
   right's mirror each other across the diagonal through the bite, as the foot's and the left's
   do. No face.
2. **The logo and an agent's outline are one drawing.** The numbers live in `outline.ts`, kept
   twice as before (the phone's copy and the design system's, held together by
   `outline.vitest.ts`). The web's mark (`mark.tsx`) and the phone's working mark (`ChipPulse`)
   draw themselves from them instead of carrying their own paths. The app icons are literal SVGs,
   since a launcher reads a PNG, and `tools/guardrails/icons-wear-the-outline.test.ts` fails when
   an icon's body or pins are not the outline's for the square it names.
3. **The pins stand inside the mark's box everywhere,** as an agent's already did: the web's mark
   in its 24 box, the working mark in its 20, a face in its side. The body is 1/1.26 of the box,
   so at the same size the mark's body is larger than the old one (19 of 24 where it was 16), and
   an agent's body at 56 points is 44.4 where it was 46⅔.
4. **The light still takes a second and a half to go round,** six pins a quarter of a second
   apart where ten were 150 ms apart (`PIN_STEP_MS`). Each pin lights in 130 ms and lets go in
   260 ms, as before.
5. **Every icon wears it:** the iPhone's (full bleed), Android's adaptive icon, the splash, and
   the Mac app's, which was a black placeholder tile, on the macOS grid. The menu bar's template
   icon, a black blob, is now the mark's silhouette.
6. **The working mark's bite is cut out of the body,** not painted over it in the colour of what
   it stands on, so `ChipPulse` no longer takes a `ground` and `TaskBubble` no longer passes one.

## Consequences

- The icons change only with new builds: the iPhone's with `pnpm phone`, the Mac app's and its
  menu bar's with `pnpm desktop`. An installed app keeps the old icon until then.
- The web visual baselines of the mark (`mark-light`, `mark-dark`) were regenerated in the
  container with `pnpm visual:update`.
- An agent's mark, initials and the dot in its bite sit where they did, as fractions of a body
  that is 5% smaller. The dot sits inside the larger bite.
- Nothing was walked on an Android device.

## Alternatives considered

- **A · Plump.** The same idea with corners of 0.36: softer than today, but still a rounded square
  with bumps. D is A's pins on a rounder body.
- **B · Smile**, the recommendation. A face makes it cute, but agents without a chosen mark would
  either smile alike (five OpenClaws) or keep initials, and a face on the logo beside a face on
  every agent says the same thing twice.
- **C · Buddy.** The cutest, and the furthest from a chip: feet and arms, a bounce at work, and
  new art for every icon.
- **Keeping the logo its own path,** with an agent's outline a softened copy. Two drawings to keep
  alike, and they had already drifted: the logo's bite was sharp and its pins twice as thick.
