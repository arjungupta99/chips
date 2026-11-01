# 0229. A slide up from the faces picks who a message goes to

Date: 25 October 2026
Status: Accepted, 25 October 2026. Arjun: "I want quick agent selection ability in spaces. When we
lay finger on the agent selector and drag up, the selector should open up, and we should be able to
continue drag to select / swap the single agent." Then, from the mock
(`docs/proposals/slide-to-pick-mocks.html`): "Go with B, the column of faces. Build it."

## Context

The faces at the front of the field say who a message goes to ([ADR 0081](0081-chips-says-who-a-message-is-for-and-only-they-take-a-turn.md)).
A tap on them opens the field into the list, and a tap on a name picks that one alone and closes
it; the circle at a row's right adds that one to the others ([ADR 0114](0114-several-agents-are-picked-from-the-field-and-kept.md)).
Swapping one agent for another is two taps with the finger lifting between, and the second tap is
on a row the finger has to find.

The mock put three ways side by side, each one you could drive: the two taps as they are; A, the
same list opening under a finger that lands on the faces and picking the row the finger lets go on;
and B, a column of faces rising out of the faces, the face under the finger drawn bigger and its
name in a tag beside the column. A had the smaller cost. Its weakness showed in the mock: a finger
sliding straight up from the faces covers the name of the row it lights. B keeps the name in sight,
and Arjun chose it.

## Decision

1. **On the phone, a slide up from the faces raises a column of them.** A move up past 8 points
   starts it, so a tap is still a tap and opens the list as before; a finger that goes down first is
   not a slide. The column stands over the field, its middle over the first face, one face for each
   agent and person in the room in the list's order, the lead at the top and Everyone at the foot,
   nearest the thumb (`apps/mobile/src/spaces/FaceColumn.tsx`, `faceColumnMath.ts`).
2. **Height alone decides.** The face level with the finger is the one under it, whether the finger
   is over the column or has drifted up to 120 points to its right, where a right thumb goes. That
   face is drawn about two fifths bigger, its neighbours a little, and its name, its @ and its
   harness stand in a tag beside the column. The faces at the front of the field and the empty
   field's words say who the message would go to. Each face the finger comes over ticks.
3. **Letting go on a face picks it alone**, as a tap on its name in the list does: kept for the
   room, and closing the list if it was open. Letting go anywhere else leaves who it goes to as it
   was. The circles stay in the list, for picking several with taps.
4. **A crowded room's column stands no taller than the list may** (half the window, never past the
   room's bar, [ADR 0113](0113-a-crowded-room-is-addressed-by-one-mark.md)). The faces nearest Everyone show first, and
   a finger held at the column's top brings the rest down into sight, faster the further in it is.
5. **The column and the tag are the system's glass**, growing out of the faces on a spring and
   shrinking back into them; they never fade, since glass that comes into being faded is drawn
   without its material ([ADR 0200](0200-pressing-a-message-lifts-it-and-not-right-replaces-the-thumbs.md)). With Reduce Motion they come and go at once.
6. **On the Mac and the web there is no column**: the field's menu takes the same movement from the
   mouse. The list opens as the button goes down on the faces, the row under the pointer lights as it
   slides, and letting go on a row picks it alone. A press let go where it began is a click, and
   leaves the list open; a slide let go off the list closes it and changes nothing.

## Consequences

- One agent is swapped for another in one movement, on the phone and on the Mac.
- The phone and the Mac differ in what the movement shows: a column on the phone, the list on the
  Mac, where a pointer covers nothing.
- VoiceOver keeps the button that opens the list. The slide is a shortcut on top of it, and the
  column is hidden from a screen reader.
- The phone's web target, where its Playwright specs run, has no column; they pick from the list.
- Under Jest the column is a stand-in that keeps what the field told it, so a test slides by calling
  that as the pan would. How it moves, and the glass, are walked on a simulator and on his iPhone.
- The mock is kept as `docs/proposals/slide-to-pick-mocks.html`.

## Addendum, 25 October 2026: the name stands on top of the column

Arjun, on his iPhone: "One minor issue, for person using right hand thumb, the names get hidden
behind the thumb, need to figure out a good solution for that." A right thumb reaching the column
lies almost flat from the screen's right edge, across the tag beside the face it is on. The mock
(`docs/proposals/name-clear-of-thumb-mocks.html`) drew a thumb over four places for the name and
measured how much of it the thumb covered: beside the face, as built, from a fifth of it on the top
face to all of it on Everyone; A, beside the column but a face and a half higher; B, on top of the
column; C, in the room's name at the top. A, B and C kept all of it in sight, with either thumb.
Arjun: "Go with B, the name on top of the column. Build it."

- The tag stands on top of the column, its left edge on the column's and 12 points over its top,
  in place of beside the face (decision 2). It no longer follows the finger: it comes up with the
  column as the column grows, and its words change as the finger moves from face to face.
- The column keeps 60 points over its top for the tag (`CROWN` in `faceColumnMath.ts`), so in a
  crowded room, or with the keys up, the name stays under the room's bar and the column shows a
  face fewer.

Arjun, the same evening: "also when this selector is up, the remaining screen should slight animate
dim, and animate dim out when it dismisses."

- While the column is up, everything else on the screen is a little dimmer: black at 14% in light
  mode and 30% in dark, fading in over 220 ms as the column rises and out over 200 ms as it goes.
  A fade, so Reduce Motion keeps it.
- The room's bar is the navigator's and stands over the room, so on iOS the dim and the column are
  drawn on a layer over the window (`FullWindowOverlay`, as a lifted message's menu is). A stand-in
  where the column stood in the field's row is measured as a slide starts, and the column is drawn
  there. The layer takes no touches and does not keep VoiceOver in it. On Android the column stays
  in the field's row and the dim reaches the room under it, not its bar.

Then, on his iPhone: "increase dimming by 20%". The dim is a fifth darker: 17% in light mode and
36% in dark.
Then "another 30% darker please": 22% and 47%.

Then: "when the selector is up. The detector area should extend all the way to right, so that
dragging on the right side of selector should also switch the agent selection." Decision 2's 120
points to the right of the column are gone: while the column is up, the finger goes by height
anywhere to its right, out to the screen's edge, and the faces grow and the top band scrolls there
too. To its left it still reaches 40 points, short of the +.

## Addendum, 25 October 2026: the film shows the slide

Arjun: "we have a new way to select agent / person to send message to, by press drag up on the
agent selector. Can we include that in the onboarding?" From a probe of the film's render: "Yes:
add it as its own part after Teamwork, picking Theo and sending him a message that only he
answers. Render, check and take it live."

- **Watch Chips work has a part of its own for it, after Teamwork** ([ADR 0217](0217-the-film-is-a-video-rendered-from-the-app.md)'s
  film): in Birthday dinner a finger slides up the faces past Everyone and Rosa, lets go on Theo,
  and You sends him "Can you keep this design for the thank-you notes?". Theo alone takes a turn
  and answers; Milo goes on as he was. Its caption: "Slide up to choose who answers", and under it,
  "Lay a finger on the faces and slide up. Let go on Theo, and only Theo takes a turn." The
  script's chapter is `pick`, the seventh; the send it waits for names Theo (`to`), so a pick that
  lands on anyone else fails the render.
- **The film's render slides the web target's faces.** The film is shot from the phone's web
  export, which had no column (Consequences). In the render's build (`FILM_SOURCE`) it has one,
  and the render's `slide` step (`tools/film/shoot.mjs`, `acts.json`) presses the faces, moves up
  a frame at a time and lets go. The column is the one Android draws, not iOS's glass, as the
  film's phone is drawn throughout.
- **On the web the press is the faces' wrapper's.** The browser keeps the pointer for the element
  it went down on, and a face in the field is drawn afresh as the faces change under the slide
  (Milo alone, all three, Rosa alone): once it went, the slide heard no more moves and no release,
  and the column and the dim stood on. In the render the faces take no touches of their own, so
  the pointer stays with the view the slide is on. Nothing changes on the phone.
- On the web the heights the faces answer to sit about a face higher than where the column draws
  them; the film shows no finger, only the face drawn bigger and its name, which agree, so the
  render's path is measured from what the field says.

Then, from the part as it went live: "Yes the slide looks fast". The column was up for about two
seconds of the film. The slide now glides more slowly between faces and stays on each name longer,
Theo's the longest: the column is up for about three and a half seconds, and the part runs about
eleven and a half.

