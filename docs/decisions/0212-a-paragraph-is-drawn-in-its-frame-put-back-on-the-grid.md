# 0212. A paragraph is drawn in its frame put back on the pixel grid

Date: 20 October 2026
Status: Accepted, 20 October 2026, on Arjun's "fix it please" for PH-23. Phone (iOS) only.

## Context

Walking PH-21 and PH-22 on the simulator, one three-paragraph reply came back into view with its
first paragraph wrong: its third line ran past the bubble and was cut ("…and stands ta"), and the
fourth line was empty. It stayed so after the room was opened again, and with the bundle from
before that fix. The other paragraphs, and a dozen identical replies, were right.

A layout probe found it. The paragraph measured four lines of 22 pt, 88 pt, and its frame came
out 87.999756 pt. React Native measures a paragraph's text with TextKit in a container of
unbounded height, then draws it, reads its lines (`onTextLayout`) and finds what a touch is on in
a container exactly the size of its frame (`RCTTextLayoutManager`,
`_textStorageAndLayoutManagerWithAttributesString:paragraphAttributes:size:`). The frame comes
from Yoga, which rounds it to the screen's pixel grid in single precision; a paragraph a few
thousand points down the list can land a ten-thousandth of a point short. TextKit then has no
room for the fourth line, and a paragraph with no line limit is clipped (`NSLineBreakByClipping`),
so the rest of the words are crammed into the third line and cut. `onTextLayout` read three
lines. Any text in the app can meet it, wherever its frame happens to round short: a bubble, a
list item, a page.

React Native ships prebuilt here (`RCT_USE_PREBUILT_RNCORE`), so a patch to its source in
`node_modules` is never compiled. Building React Native from source would let a `pnpm patch` in,
at the cost of every native build and archive. Padding each paragraph in JavaScript would move the
rounding, not end it, and only where it was added.

## Decision

A small native module, `apps/mobile/modules/text-fit` (`ChipsTextFit`), replaces that one method
at launch. Before calling React Native's own, it puts a frame's width and height back on the grid
they were meant to stand on: whole sixths of a point, which hold a pixel on every iPhone (a third)
and every iPad (a half). A size only grows, and by less than a twelfth of a point; a measurement,
asked with unbounded height, is passed on as it came, so no text is measured differently.

It replaces the method only when the method is there and takes the same arguments laid out the
same way (their type encodings match), and otherwise leaves text as React Native draws it and says
so in the log. `src/ui/textFit.vitest.ts` reads React Native's source and fails the gate when an
upgrade changes the method, how it makes its container, or which callers pass a frame.

## Consequences

- A paragraph draws all its lines whatever its frame rounds to, and `onTextLayout` and touches
  read the same lines it draws.
- One more native module: adding it needed `pnpm phone pods` and a full native build, and a React
  Native upgrade must keep the drift test green or drop the module (if React Native fixes this
  itself, delete it).
- The web and the Mac app draw text in the browser and are not touched. Android lays text out
  differently and has not shown it.
