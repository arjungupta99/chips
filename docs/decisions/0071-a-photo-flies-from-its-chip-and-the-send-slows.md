# 0071. A photo flies from its chip to its tile, and the send's spring slows

Date: 25 September 2026
Status: Accepted

## Context

The room's settle (ADR 0070) reached Arjun's phone and came back:
"the animation curve is too quick, and I am noticing frame drops / jerky animation", and
"image sends happen without proper transitions". The spring under everything at the foot —
the words, the room, the thinking bubble, the reply — was the one given to the words on
24 September, 0.42 s at a damping ratio of 0.77, chosen for a one-line copy on its own. A
photo, staged as a chip over the field, went with a fade: the words' flight was for words.

The frame drops were sampled on the simulator before anything was changed, with a scripted
harness landing eight replies in twelve seconds and `sample` on the app's main thread, once
with the settle and once with the list's own ease in its place. The two cost the same: the
settle's `scrollTo` a frame costs what UIKit's scroll animation costs a frame, and the main
thread was busy seven per cent of the time either way. What costs is the mount of a landing:
about fourteen milliseconds on this Mac, over a frame here and several on a phone at 120 Hz,
and the largest single item in every mount transaction — the room's per-frame one for the
colour field included — is the list's clipped-subviews walk, a recursion through every view
the list holds that the scroll view runs after every transaction. The prop that turns
clipping off spares only the detaching; the recursion is React Native's, gated by its
`enableViewCulling` flag, which is native and off. The films of the walk showed the simulator
itself dropping almost no frames; the phone is where the mounts do not fit.

## Decision

The spring slows: a response of 0.55 s at a damping ratio of 0.83 for the words, the room and
everything at the foot, and 0.66 s at 0.94 across (`UP` in `RoomSettle.tsx`, `ACROSS` in
`SendFlight.tsx`; the choice among three is `docs/proposals/send-curve-mocks.html`).

A photo flies. A copy of the picture leaves the chip's thumbnail at its forty points and
corner and goes for the tile the room draws it in, on the same two springs, growing to the
tile's size and corner on the way; the room rises under it as for words, and the tile is held
out of sight until the picture is on it. The copy is laid out at the tile's size and scaled
down to the chip's, and the picture inside is scaled back up by as much and a little more, so
it covers the smaller box as the thumbnail did and the crop opens out rather than stretching.
Words and photos sent together fly together. The room's landing store holds the line's tiles
as it holds its bubble, one watch per tile up to the album's four (`sendLanding.ts`,
`Attachments.tsx`, `Composer.tsx`).

The picture the copy carries is the room's own thumbnail of the photo, not the file the picker
gave (amended the same day, after the phone: "the image bubble appearance needs to have an
animation"). The picker's file is the photo itself, twelve million pixels from the camera, and
the image the copy is drawn with decodes the whole of it before it draws anything, then again
when the copy grows to the tile's size, the second time on the main thread: on the phone, and
on the simulator given such a file, the chip went and nothing flew, and the tile appeared
fully grown four tenths of a second later. The thumbnail is fetched the moment the upload is in
— the same fetch the tile makes, made earlier — and kept warm under the chip's own picture by
the image the tiles are drawn with, so the copy has its picture in the frame the chip goes and
the tile shows the same picture when the copy dissolves into it (`useStaged.ts`, `Composer.tsx`).

The room's list no longer detaches the rows off the glass (`removeClippedSubviews` off). The
walk that remains is the platform's.

## Consequences

- One spring for everything at the foot still, a third slower. It is a number in one place.
- A photo lands the way words do: from where it was, into where it goes. A video's poster
  does not fly; nor does a file's row.
- A picture waits a frame for the room to say where its tile is, where the words set off at
  once for where the field reckons the bubble: a tile's place is the album's to decide.
- The main thread spends a fifth less and JavaScript a quarter less over the same eight
  landings on the simulator with the detaching off; the recursion is still there, at about
  two thirds of its cost. Two native levers would take the rest, and both are Arjun's call:
  React Native's view culling, and Reanimated's synchronous UI props (ADR 0061's caveat about
  Fabric's touch system).
- The settle and the colour field each import the room's field type from `field.ts` rather
  than from each other: the dependency cruiser had a cycle from ADR 0070, unrun then.
- Walked on the simulator (a bundle swapped into the QA simulator's app, a picture added to
  its library, filmed): the picture grows from the chip to its tile in about a third of a
  second and the room rises under it; a one-word send's room rises 70 points in 0.35 s of
  visible motion (0.27 s on the old spring), and a send over the thinking bubble holds the
  bubble in place as before. With the picker's file, the copy was not drawn in the frame the
  chip went — one empty frame for a small picture on the simulator, the whole flight for a
  camera's photo — which is what the thumbnail, fetched early and kept warm, is for: walked
  again with a twelve-million-pixel JPEG in the simulator's library, the picture is in the
  copy from the frame the chip goes, and grows along the whole path.
- Not walked on a device: a message with two or more photos, words and a photo together, a
  photo sent with the keyboard up.
