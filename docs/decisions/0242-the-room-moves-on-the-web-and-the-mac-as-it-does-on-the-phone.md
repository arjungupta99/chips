# 0242. The room moves on the web and the Mac as it does on the phone

Date: 28 October 2026
Status: Accepted, 28 October 2026. Arjun, on the clip of Chips for Mac on chipschat.ai: "the video
is too jumpy. Have another session fix it. Everything should be polished!" It brings
[ADR 0074](0074-the-room-moves-on-one-transition.md) (the room moves on one transition) and
[ADR 0075](0075-rows-that-move-together-stay-together.md) (rows that move together stay together)
to the web and the Mac, and amends [ADR 0217](0217-the-film-is-a-video-rendered-from-the-app.md)
(the film): a Mac shot is held to the film's jump check.

## Context

The site's clip of the Mac is the Watch film's teamwork chapter shot in the web build, which
Chips for Mac wraps. The film's jump check (`loneJumps`) found four frames in it, 71, 158, 179
and 402, each the whole room moving at once between one frame and the next:

1. **Every new row moved the room in one frame.** Theo's thinking row, Milo's hand-off and Theo's
   card each grew the list, and the list put the reader back at its end in the same breath
   (`MessageList`'s `stick`): the conversation went up by the row's height with no glide. The
   phone moves its rows on Reanimated's layout transitions (ADR 0074, 0075); the web had nothing.
2. **The room opened at the top of its history** and stayed there until the next line came, then
   jumped to its end. On the room's first frame its rows are laid out at the stylesheet's guess
   (`content-visibility: auto`, 60 pixels a row), and the frame's own layout gives them their
   heights. Only a `ResizeObserver` hears that, and the list made its observer after that frame.
   The list was at the end of 675 pixels of guesses and 188 pixels short of the real end.
3. **The film never caught it.** The composer moves the phone's arrivals itself and checks the
   composed film, and the Mac's window in the film is small, behind the phone. Its jumps were
   under the measure.

## Decision

1. **One model, in core** (`packages/core/src/roomMotion.ts`): the room's spring (`ROOM_SPRING`, a
   0.55 s response at a damping ratio of 0.83), its fades (`ROOM_FADE_IN_MS` 200, `ROOM_FADE_OUT_MS`
   160), the steady clock's cap (`STEADY_FRAME_MS`, a frame and a fifth), the room's clock
   (`roomStarted`, `roomTicked`), and a move that keeps its speed when it is sent on
   (`roomMoved`). The phone takes its numbers from there; its worklets are as they were.
2. **The web's room moves on that model** (`apps/web/src/app/room/roomMotion.ts`), on the page's
   own frames. From the frame a change is drawn in, everything in the room is drawn where it was
   and goes to where it is laid out on the room's spring, while the reader is at the end:
   - The list's scroll stays where it was drawn and goes to the end. Most of a change is this: the
     rows over a new line rise as the list scrolls, and the line comes up from under the fold.
   - Each row is drawn where it was, its `translate` taking up whatever the scroll does not. A row
     under a line that landed over it (the thinking rows under a hand-off) holds still on the
     glass; the rows over a row that went close over its place.
   - A move that lands on a move keeps its speed; everything keeps one clock.
   - A row that lands comes in under the row above it, at its speed, and fades up. Where that is
     behind the row after it, it comes out from behind that row: no row is drawn over the row after
     it (a clip off its foot), so its faces and name do not show through the open ground beside
     that row's bubble.
   - What goes from under the lines (a thinking row as its reply lands, a card once answered)
     fades where it stood while the rows close over its place. A line that goes keeps its dust
     (ADR 0167).
   - A reader who scrolls during a glide has the list from where they put it.
   - Up the space, nothing changes: the list keeps the reader's place itself (ADR 0132's addendum,
     ADR 0167). With Reduce Motion, in a hidden tab, and while the room is opening, everything goes
     at once.
3. **A room opens at its end.** The list's observer is made before the rows are first measured, and
   watches the list itself and everything in it, the thinking rows and cards too. On the room's
   first pass, before React has handed over the list's ref, the list is the rows' own parent. So the
   room's first frame is at its end, and a thinking row's call strip opening moves the end with it.
4. **The film holds each Mac shot to its jump check** (`film.mjs`): a Mac shot with a frame that
   jumps fails the render and names the frames. `pnpm --filter @chipschat/film jumps <clip or
   frames>` runs the same check over any clip, the site's included.

ADR 0130's long reply that opens at its start stays the phone's. On the web a reply taller than the
window still ends at the foot, as before.

## Consequences

- **The teamwork shot of the Mac, again:** no frame jumps, in Chromium and in WebKit (Chips for
  Mac's engine), where it had four. The hand-off comes out from behind the thinking rows; Theo's
  thinking row fades as his card rises from behind Milo's.
- **Tests:** core's clock and moves (`roomMotion.test.ts`); the web's arithmetic for each change
  (`room/roomMotion.test.ts`): a hand-off over the thinking rows, a row that goes, a row landing
  under a row on its way, a move sent on, Reduce Motion and up the space; and a browser spec
  (`e2e/the-room-moves.spec.ts`) that opens a room of tall replies and asks that its first frame be
  at its end, that a line glides in over many frames, never much of it in one, and that with Reduce
  Motion it moves at once. On the list as it was, the spec fails at both: the room opened 1,257
  pixels short of its end, and the line moved 71 pixels in one frame.
- **What a change costs:** one read of where the room's rows are (a few dozen), and while anything
  moves, a scroll and the moving rows' translates each frame, with no layout.
- **While a row moves, its translate** makes it the frame for anything fixed inside it, and the
  colour field of your own bubbles (`mine-field`) is the one for where it is laid out. Your own
  bubbles over a new line ride the scroll, so theirs is exact. A translate mostly carries the
  thinking rows and cards under a line, which wear no field; a bubble of yours closing over a row
  that went wears its new place's field for the half second it takes to get there.
- **Not walked by hand** in Chips for Mac on his Mac, nor in Safari. The films were shot frame by
  frame in Chromium and WebKit.
