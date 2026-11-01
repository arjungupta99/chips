# 0165. A space shows its own media from its details, and lets it go from this phone

Date: 14 October 2026
Status: Accepted, 14 October 2026, on Arjun's ask and his pick of the second option. Extends ADR
0159 (Media on this phone) and ADR 0161 (opening from it) to one space, from the room sheet of ADR
0087. The Media row is the Media & files card since ADR 0202, and the space's own Media opens
from its page's See all.

## Context

Arjun, 14 October 2026: "I want a media section shown in the space details as well. Which allows
viewing and deleting." Asked what it should show and what Delete should do, he picked "All media,
delete off phone": every photo and video ever sent in the space, with Delete freeing this phone's
copies only, and: "We already have a way to view delete from you->Media on this phone section.
follow similar."

The space's details (the room sheet) had Files, the room's working files (ADR 0100), and no media.
Media on this phone shows what the phone keeps, by space; a photo nobody has opened on this phone
is not there. Nothing in Chips deletes a file from a space for everyone, and this is not that.

The phone reads every space from its beginning (`readSpace` in core's store), so a room's lines
already name every file it carries (core's `filesOf`): no server route is needed to list them.

## Decision

1. **A Media row on the sheet's first page, over Files.** Its face is the photo mark, its count is
   how many photos and videos the room's albums carry (core's `inAlbum`, the tiles the room draws),
   and its line the newest's name and when, as Files says of its newest; "None yet" where nothing
   has been sent. A tap closes the sheet and, once it has gone, opens the space's own Media, as an
   agent's row opens its card (ADR 0111's addendum).
2. **The space's own Media is Media on this phone's page for one space** (`/media?space=<id>`,
   titled Media): every photo and video of the space, newest first (`spaceMedia` in `kept.ts`),
   with no section head. Its head says how much of it is on this phone, over "On this phone · 34
   photos and videos", and offers Delete where the phone keeps any of it.
3. **A tile is drawn from what the phone keeps, or fetched as a room's tile is.** A photo or a video
   the phone has nothing of asks the file service for its thumbnail, and again after each Delete.
   A tap opens the viewer over the space's photos and videos in the page's order, flying from the
   tile (ADR 0161).
4. **Delete takes them off this phone only**, as Media on this phone's does (ADR 0159, decision 5):
   the head's Delete asks (*Delete 11 MB from this phone? Pomodoro Timer's photos and videos stay in
   the space. They come back the next time they're opened.*), and Select, a long press, the circles
   and the bar at the foot are the same, the head's Delete turning Select all while selecting. The
   tiles stay: they are still the space's.
5. **Go to message goes back to the room under the page**, at the line (`dismissTo`), rather than
   pushing a second copy of the room.

## Consequences

- Phone only, iPhone and Android: no server, wire, Jacobian or bridge change, and no 4431 restart.
  Going live is `pnpm phone build`. The phone's web target keeps nothing, so its head says 0 KB.
- `MediaPage.tsx` takes `spaceId`; `kept.ts` has `spaceMedia`; `words.ts` has `spaceMediaWords`
  and `spaceMediaAsk`; `RoomSheet.tsx` has `MediaRow` and `onOpenMedia`, which the room screen
  points at `/media?space=<id>`.
- Tests: `kept.vitest.ts` (the space's media, what is kept of each, a video never measured left
  out), `words.vitest.ts`, `MediaPage.test.tsx` (every photo and video shown, a fetched thumbnail
  opened, Delete and Select, Go to message back to the room, a space with none),
  `RoomSheet.test.tsx` (the row's count and line over Files, opening once the sheet has gone, None
  yet). Seen on the web target; not walked on a simulator or his iPhone before going live.
- Voice notes and other files sent in a message are in neither Media nor Files' list of the room's
  working files; they stay in the room and in Media on this phone once opened.
- A space with many photos asks for each tile's thumbnail as it comes into view; the list draws its
  rows as they come, as Media on this phone's does.

## Addendum: voice notes and files too (14 October 2026, later)

Arjun, once it was on his iPhone: "add voice notes and files to the Media page too". The space's
own Media now holds every file the space's lines carry (core's `filesOf`), not only its albums:

- **A voice note** is a tile with the microphone and its length, and **a document** a tile with its
  kind and name, as Media on this phone draws them (ADR 0159, decision 3). Both open in Quick Look:
  from the phone where it keeps the file, else from the server (`files.preview`). Only a photo or
  a measured video asks the file service for a thumbnail.
- **The Media row counts them all**, and its line names the newest of any kind. Its head says "On
  this phone · 40 photos, videos and files" ("1 file"), and Delete asks that the space's "photos,
  videos and files" stay in the space.
- A video the server never measured, which a room draws as a row, is a tile marked by what it is,
  and opens on the viewer alone (`deckOfOne`), as on Media on this phone.

This replaces decision 2's "every photo and video" and the consequence that voice notes and other
files were in neither Media nor Files.
