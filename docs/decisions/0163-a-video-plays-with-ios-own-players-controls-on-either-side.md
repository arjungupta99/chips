# 0163. A video plays with iOS's own player's controls, upright and on its side

Date: 14 October 2026
Status: Accepted, 14 October 2026, on Arjun's ask. Amends ADR 0057 (point 7: the viewer's own
controls; point 4: what a tap does, for a video) and the media viewer proposal's figure 7.

## Context

Arjun, 14 October 2026: "I need you to add good E2E testing for video media in spaces. Check the
experience, make sure video is playable in landscape as well. Check the player for functionality,
make fixes where needed. It should feel highly polished." And, once the walk had begun: "Player
controls do not look so great, can we match them to look like iPhone's native?"

The walk (a scratch server, a simulator of its own, a portrait clip, a landscape clip and one
recorded sideways) found that a video plays in both orientations and through a turn, the stage
re-fits, and the system player turns with the phone. What was wrong was the bars on a phone on its
side, and, on the phone's web target, the film itself:

1. **The shade stopped a third of the way across.** The scrims were SVG gradients drawn at `100%`,
   and they kept the width they were first drawn at. Opened upright and turned, a phone showed a
   hard edge at 402 points across an 874-point picture, at the top and at the foot.
2. **Close and Play sat under the island.** The bars stood on the safe area's top and bottom only.
   On its side an iPhone's island and corners are at the sides (62 points each), and the bars were
   at 8.
3. **The shade at the foot was a fixed height**, 200 points over the inset: more than half of the
   402 points a phone on its side has.
4. **On the web target the film stood in a corner.** The player's view there is a `<video>`, pinned
   to its edges; a replaced element keeps its own size, and a 320-wide clip drew at 320 in a
   393-wide box. (The new web-target spec found it.)

And the controls were the viewer's own drawing (figure 7): a row of play, a knobbed track, `0:12 /
0:43`, mute, with a bare `▶` glyph over a paused film; and a tap on a hidden-barred video paused it.

## Decision

1. **The controls are iOS's own player's** (AVKit, which *System player* shows, so the two now
   match): in the middle of the stage, ten seconds back, play or pause, and ten seconds on, each a
   disc of the system's glass, the middle one larger; at the foot, a capsule of glass with the time
   gone, a track with no knob that thickens under a thumb, the time left as `−0:31`, sound, and
   Picture in Picture where the platform has it. The glass is always dark, since it stands over a
   film. Where there is no glass (Reduce Transparency, Android, the web target), the same shapes
   in a flat dark wash. A neighbour video, while paging, wears a flat disc of the same size, and a
   video's tile in the room wears it at 44 points, as Messages does (Arjun, the same evening: "give
   the room tile the new play button too"); one component, `media/PlayDisc.tsx`, draws both.
2. **A tap is iOS's own player's too**: it brings the bars or takes them away, and leaves the film
   playing or paused as it was. The middle disc is what plays and pauses. The bars still hide three
   seconds into playing, stay while paused, and come back at the end with Play, which plays from
   the start. This replaces figure 7's tap, which paused a playing video whose bars were hidden.
3. **While a stream starts or a copy comes, the middle is the spinner's or the ring's**, and the
   ten-second discs wait, dimmed. A video that would not play has no transport: the card saying
   why stands there.
4. **The bars stand inside all four safe-area insets.** The top bar, the foot and the arrows take
   the left and right insets as well as the top and bottom.
5. **A scrim is drawn at the window's size, in numbers**, so a turn draws it again at the new one.
   The one at the foot is as tall as what stands there (measured) and a lead above it, the lead at
   most 88 points or an eighth of the window, so a phone on its side is not shaded halfway up.
6. **The film's view says a width and a height of 100% as well as its four edges**, on the stage
   and in the system player, so the web's `<video>` fills its box.

## Consequences

- `apps/mobile/src/media/Controls.tsx` is the transport and the capsule; `Chrome.tsx` places them,
  stands the bars on all four insets and sizes the scrims; `MediaViewer.tsx`'s tap only shows and
  hides; `VideoItem.tsx` draws no paused mark of its own and fills its box; `Stage.tsx`'s neighbour
  mark and the room's tile (`spaces/Attachments.tsx`) are `PlayDisc.tsx`'s disc. Four marks join
  the phone's icons: `playFill`, `pauseFill` (filled), `back10` and `forward10`, which the viewer
  writes `10` inside.
- Tests: the viewer's Jest suite (a tap that leaves it playing, the middle disc, ten seconds either
  way and their ends, the transport gone on a failure, and a phone on its side: the bars within its
  insets, the shade at the whole width and again after a turn, the foot's shade measured);
  `apps/mobile/e2e/video.spec.ts` on the web target (the controls against a real `<video>`, a turn
  mid-play, the end, the system player); `apps/mobile/e2e/maestro/video.yaml` on the simulator,
  both orientations. The scenario is `testing/scenarios/media/video-in-a-room.md`.
- The bars' timing could not be asserted by Maestro while a film plays: each step took four to
  twelve seconds to read the screen, longer than the bars stay. The flow works on bars that stay
  (paused, and at the end) and takes the bars going and coming back as its proof of play.
- Not done: the home indicator still shows over a playing film (a modal's view controller would
  have to ask iOS to hide it, which is native work); the desktop's lightbox keeps the browser's own
  controls.
- Where a disc would crowd a small tile, the triangle stands bare: the viewer's filmstrip wears
  `PlayMark` (the triangle with a thin dark edge, since a view's shadow is iOS's alone), and Media on
  this phone writes a video's length after the `playFill` mark on its pill (Arjun: "swap the glyph
  for the icon in both"). No `▶` glyph is left on the phone.
