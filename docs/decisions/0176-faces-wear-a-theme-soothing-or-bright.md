# 0176. Faces wear a theme, Soothing or Bright

Date: 16 October 2026
Status: Accepted, 16 October 2026, on Arjun's word ("go with A, but I want to see that box merged
with the [system, light, dark] box. remove the "system" explainer", then "build it and put it on my
phone"). Adds to ADR 0085 (You is a settings list): the Appearance group gains the face themes and
loses its line about System. Leaves ADR 0064's grounds and ADR 0089's agent faces as they are, in
Soothing.

## Context

Arjun, 15 October 2026: "I want to have a theme section in the You tab. It should offer the
soothing color theme (current), and a new bright color theme. See image just the square colors."
The image was the Agents first-load mock, whose faces had been given light, lively grounds by hand
— a gold, a blue, a mint, a violet, an orange — with near-black letters on them. The app's own 27
grounds (ADR 0064, 0139) are deep, chosen so that white paper and white initials clear 4.5:1 on
every one.

"Just the square colors" scoped it: the theme is the faces' colours, not the palette. The running
mock (a private artifact, kept out of the repo) offered three layouts for the choice; he took the
two preview cards and asked for them inside the Appearance group, under the light/dark switch, with
the "System follows the phone's own setting" line gone.

## Decision

1. **Two face themes: Soothing, today's grounds, and Bright.** Bright is a second table of 27, each
   the sister of the Soothing ground at the same index (`ICON_GROUNDS_BRIGHT` on the phone,
   `[data-faces="bright"]` in `tokens.css`). Each was worked out once by one sum in OKLCH
   (`brightGround`, `lit.ts`): the hue kept; the lightness folded from Soothing's 0.33–0.58 into
   0.62–0.72, a tenth higher for a yellow; a quarter more chroma and never under 0.13; the greys
   kept grey. The tests prove the table is that sum.
2. **The wire is untouched.** A face is stored as a ground's index, so a face chosen in one theme is
   the same choice in the other and becomes its sister. Nothing is saved again, nothing migrates,
   and the server, the harnesses and the other devices never hear of the theme.
3. **Letters turn dark in Bright; marks keep their white paper.** White on a Bright ground falls
   under 4.5:1, so letters (initials, chosen letters, the picker's tick) are `#16171b` there
   (`FACE_INK`, `--on-avatar`); dark letters clear 4.8:1 on all 27. A Folded mark is decoration and
   stays white paper: drawn in dark ink it read heavy (both were in the mock).
4. **Only faces change.** A space's face, an agent's, a person's, a harness's, and what is drawn in
   a face's own colour beside it: the thinking dots, the Main tag's pill (its word keeps the
   Soothing hue, deep enough to read on a light page). Bubbles, the gold, names in coloured text,
   row marks and swipe colours stay as they are.
5. **Painted at the moment of drawing.** Everything still hands a face its Soothing ground; the
   theme takes over where the colour is painted. On the phone, `useFacePaint()`
   (`ui/faceTheme.ts`) is asked by the painters — `MarkFace`, `AgentFace`, `Avatar`, `MainTag`, the
   picker's swatches and chosen cell, the letters tile, the harness mark, the thinking dots — as
   each surface asks for the palette, so a choice repaints whatever is showing. On web and the Mac
   the faces already read CSS variables, so `data-faces="bright"` on the root redefines them; on
   any element it holds what is inside in a theme, which is how a preview shows its own.
6. **Chosen in You, in the Appearance group, per device.** The group holds the light/dark switch
   and under it a card for each theme: six faces drawn by the same `Avatar` in that card's theme
   (three agents, two rooms and your own face), a gold ring round the one in use and a round tick
   under it. The foot says "Soothing and Bright are the colours every face wears: spaces, agents
   and people." The choice is kept as the appearance is: `prefs` on the phone, `localStorage` on
   web and in Chips for Mac, applied before the first screen. Web's row for light and dark is now
   called "Light or dark", since "Theme" names the faces' choice.

## Consequences

- A third theme is a third table and a third card; the cards lay out two today.
- Adding a ground now means six places, not five: the Bright table and the `[data-faces]` blocks
  join the list in ADR 0064's note, and `tokens.vitest.ts` and `lit.vitest.ts` catch a ground added
  to one table and not the other.
- The app icon and the Chips mark are not faces and keep their gold.
- Android draws the same components and needs nothing of its own; it has not been walked.
