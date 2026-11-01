# 0075. Rows that move together stay together

Date: 25 September 2026
Status: Accepted. Amends 0074.

## Context

Arjun, on the build of ADR 0074 on his iPhone: "if I scroll while messages are coming in sometimes
they overlap", and "the animations are more refined now, some more improvements remaining though as
I still see some frame drops".

Two faults were found on the simulator, with the scratch harness posting replies and the room
dragged by the simulator's own touches.

1. **Rows landed on top of rows, and stayed.** Up the history (past `NEAR`) the transition was a
   timing of no length, so the list could keep the reader's place. Reanimated's layout proxy marks
   a view settled when its animation says it has finished, and passes over settled views when it
   sets frames (`addOngoingAnimations`, legacy proxy, 4.5.1). The frame an animation finishes in is
   therefore never drawn, and a timing of no length has no other frame. The rows the landing moved
   stood where they were, the new lines were drawn over them, and the room stayed so until
   something moved them again. Five replies landed up the history on the committed build, then the
   room was scrolled back: two groups of five lines were drawn one over the other. Every other
   transition loses its last frame the same way, which leaves a row up to a fifth of a point short.
2. **Grouped bubbles ran into each other for a moment.** Five replies 350 ms apart, filmed and
   traced by the gaps between bubbles: at each landing, the two-point gap between the newest bubble
   and the one before it closed and the two overlapped for about 130 ms. Three causes, each found
   in the numbers:
   - A move that took over from one still going started again from rest (the steady spring had no
     velocity), while the reply still rising kept its own speed.
   - A reply rose from its own height below its place, not from under the row above it as that row
     was drawn, still short of its own place from the last landing.
   - After the first two were fixed, logs from the UI thread showed the rows of one change starting
     up to 13 ms of the spring apart. Reanimated takes an animation's first step as it starts it,
     inside the mount, and those steps moved the clock.

The frame drops were sampled for eight landings: the main thread was busy 482 samples in 1,662.
Every rendered row, about 80 of them (four screens either side of the glass), was moved on four
springs, one for each of its frame's origins and sizes.

## Decision

- **Every animation in the room says where it rests one frame before it says it has finished**
  (`landed`, `RoomMotion.tsx`). Up the history, a move is the room's spring let go at rest where it
  is going (`still`). It is drawn in the mount that makes it, where the list keeps the reader's
  place in the same pass. There is no timing of no length anywhere in the room.
- **A move that lands on a move keeps its speed.** The room's spring is its closed form from any
  place and speed (`springAt`, in core, tested against the spring stepped through); a spring that
  takes over from one still going starts at that one's speed. The spring is linear, so rows sent on
  by the same changes stay the same distance apart however the changes overlap.
- **One clock for the room.** It moves once a frame, by at most 20 ms (`STEADY_FRAME_MS`). A start
  marks the clock without moving it, so every move of one change starts at the same instant.
- **A line that lands comes in under the row above it, as that row is drawn and at its speed.**
  The rows of a change are started one after another in the mount, and inserts after updates. The
  lowest row the change moves says where it is drawn and how fast it is going (`row`). The line
  landing in the same change starts that far below its place, at that speed (`arrive`). Two lines
  landing together come in as one block. A line that lands where nothing moved over it fades up
  where it stands.
- **The rise is the cell's.** The list draws its own cells (`MovingCell`) and arrival is an entering
  transition on the cell, so a row's place is one frame on one spring, not a cell plus a transform
  inside it. Whether a row has just landed is asked once, as its cell is first drawn (`useArrivals`),
  on the same rules as before: not a line the room opened with, not your own line whose words fly
  to it, not the first words of a room made from the +.
- **Only what changed is moved.** A row carried up a line gets one spring, on its origin, not four.

## Consequences

- Filmed on the simulator: five and six replies 350 ms apart at the foot, the gap tracer finds no
  gap between bubbles in the room under five pixels, where the committed build closed one to
  nothing. Ten replies 450 ms apart with the room dragged up and down through them: none. Five
  replies up the history and back: each group below the last, gaps intact. The reader's view up
  the history does not move while they land; the best match between the first and last frames is
  a shift of 0 px. A reply still comes out from behind the thinking bubble, and a bubble still
  closes as its time fades.
- The same eight landings, sampled again: 374 busy samples in 1,819, against 482 in 1,662. The
  worklet frames are a third lighter and the Core Animation commit 40 % lighter.
- Of what is left on each frame of a landing, some 40 % is Reanimated setting the moving frames,
  and a third of that is React Native's scroll view walking its visible subviews on every mount,
  each frame of a transition included. Its `removeClippedSubviews` does not gate the walk, so
  removing it would mean patching React Native.
- Frame drops on the simulator were single frames, about as often as before. A 120 Hz phone is
  another matter, and what drops frames there is for a trace on the phone itself (Instruments,
  Animation Hitches), not for a guess. Scrolling's colour-field commit is still there.
  Reanimated's `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS` flag is still his call.
- A line that lands where nothing moves over it, such as the first line of a room, fades in
  place rather than rising.
- Not walked on the phone, with Reduce Motion, or on Android.
