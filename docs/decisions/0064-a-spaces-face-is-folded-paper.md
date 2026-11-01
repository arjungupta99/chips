# 0064 — A space's face is folded paper

**Status:** Accepted, 22 September 2026. Extended by 0089 (an agent wears the same marks, in its own outline).

## Context

On 21 September 2026 a person could give a space a face: a mark from Chips' own library of 84 on
one of twelve grounds, chosen by a long press in the Spaces list and kept per person on the server
(`/v1/me/space-icons`). The marks were 1.75-point outlines, white on a flat ground: the idiom of
most off-the-shelf icon sets, so a room's face did not look like Chips. At 28 points, the size a
face is in the chat, the lines went thin. And the chat did not draw the chosen face at all: a
lane's routing row and its caption drew initials.

Arjun asked for "more unique designs, they should be beautiful", and for the chosen faces in the
chat's routing (*J → Space A*). The mocks (`docs/proposals/space-faces-mocks.html`) offered four
styles over his own six picks: A Lit (the same outlines on a lit ground), B Solid (redrawn filled),
C Folded, D Shapes (abstract compositions). He chose **C**, and asked for **twice the marks**.

## Decision

**A mark is folded paper lit from the upper left.** Each is a list of layers, back to front, in a
24-point box. Each layer is painted with one of six paints, and every paint is worked out from the
ground, so no mark has a colour of its own:

| paint | what it is |
|---|---|
| face | white: the side facing the light |
| shade | the ground mixed 26% into white: the side turned away, the fold |
| deep | the ground mixed 55% into white: detail laid on a white face |
| far | white at 45%: things behind, never over paper |
| air | white at 16%: a halo, drawn first |
| cut | the ground itself: a hole through the paper |

A layer may be a round-capped stroke, may be softened at its corners, may be transformed, and may
be clipped to one side of a line or of the diagonal (the fold) or to a path. Below 36 points a face
drops its halo and any stroke under 1.05, which blur to grey at chat size.

**The ground a chosen face sits on is lit**: a little lighter and cooler at the top and deeper at
the foot, worked out in OKLCH (lightness +0.075 and −0.03, chroma ×1.06 and ×1.02, hue −12° and
+8°) so the twelve grounds take the light alike. The mark is drawn in its own coordinates and the
view box is the whole face expressed in them. The ground and the cut paint are then one gradient
in one space, and a hole shows exactly what is behind it. A face chosen as a colour alone keeps
its initials on the lit ground. Faces nobody chose are unchanged.

**The library is 189 marks in nine families of 21.** It keeps the 84 names it had, so every
saved face keeps its mark, now redrawn, and adds 84, then a ninth family, **People** (asked for
the same evening): 21 figures, roles and moments built from one bust — a head of radius 4.3 over a
dome of shoulders, each folded down its own middle — so every person in it is the same shape at a
different size. People are faceless, told by a hat, a tool or a pose; only `smile` and `baby`
have features. A name is the wire's, so a mark is redrawn,
never renamed. Names are letters only, as `spaceIcon` requires.

**It lives twice, literal for literal**, as the line library did: `apps/mobile/src/ui/marks.ts`
and `packages/ui/src/components/face/library.ts`, because the phone may not import `@chipschat/ui`.
The phone's `marks.vitest.ts` evaluates the design system's two tables from its source text and
fails on any difference. The phone draws with `react-native-svg` (`MarkFace`), computing the lit
stops in `lit.ts`. The desktop draws with SVG and CSS (`SpaceMark`): `color-mix` for the paints,
and `oklch(from …)` for the stops where the browser has relative colour, a flat ground where it
does not. The palette stays in `tokens.css`.

**A lane's row wears the faces of the rooms it names.** The route row's face is the room it
crosses to. The caption's ends are the lead's room and this one. A hop is drawn as a room only
where core already names it after one (`LaneHop.spaceId`, `Lane.leadSpaceId`, set only with the
label), so a harness working in somebody else's room keeps its own face.

## Consequences

- A new mark is a drawing in both tables and a place in a family. The six paints and the one light
  are the style; a mark that needs a seventh colour is outside it.
- Neither the wire nor the server changes, and a client older than this draws a name it does not
  know as initials on the chosen ground, as before.
- D, the compositions, is not built. They were offered as a family of their own and as a
  default for rooms nobody chose; neither was asked for.
- The agent's own messages in its room still wear its initials. The mocks offered its room's face
  instead, and that is a separate decision.

## Amendment: twenty-seven grounds (26 September 2026)

Arjun asked for more colours. Twelve grounds left gaps round the wheel (no red, nothing between
ochre and green, no indigo, no greys) and put three teals within 32° of each other. The mocks
(`docs/proposals/space-colours-mocks.html`) offered the fifteen below in a longer strip (A) or
all at once in a grid (B), and he chose **B**.

**Fifteen grounds go after the twelve**: a red, an orange, a slate, a brick, an olive, a
graphite, then a deep shade of every hue (maroon, espresso, bronze, forest, deep teal, navy,
aubergine, wine) and an ink. Each is worked out in OKLCH at the most chroma sRGB holds, with its
lightness stepped down until white clears 4.6:1, so the paper, the fold and the initials read on
every one as they do on the twelve. The ink sits at lightness 0.33 rather than lower: darker, and
its swatch disappeared into the dark sheet. No pastels, because a light ground cannot carry white
paper; they would need a dark-paper version of the style, which would be a separate decision.

**The indices hold.** The wire stores a ground as an index, so the twelve keep 0–11, the fifteen
take 12–26, and every face already chosen keeps its colour. `SPACE_ICON_GROUNDS` is 27. A client
older than this draws an index past its list on its first ground (the phone) or its last (the
desktop), and a server older than this refuses the new ones, so the server went live with it.

**The picker lays them out by hue and depth**: nine across (red, orange, gold, green, teal, blue,
violet, pink, grey), three down (bright, mid, deep), every colour in view and each one's darker
sister under it (`ICON_GROUND_ROWS`, a display order only). The strip is gone. The grid is about
80 points taller than it was, and the marks scroll under it as before. VoiceOver reads each by its
name. The desktop draws the fifteen as `--icon-ground-5` to `-19`, and `tokens.vitest.ts` checks
the phone's list against them and against the wire's count.
