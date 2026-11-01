# 0161. A kept file is found on the phone first, and Media on this phone opens like a room

Date: 14 October 2026
Status: Accepted, 14 October 2026, on Arjun's ask to polish opening from Media on this phone.
Amends ADR 0159 (point 4: how a tile opens) and the file service's caching under ADR 0057 and
ADR 0058.

## Context

Arjun, 14 October 2026, after Media on this phone (ADR 0159) went onto his iPhone: "When I try to
open a media from the section it takes a delay. What is the reason for it? Can you polish the media
opening experience with the media viewer? I want to see a smooth zoom animation. Also please make
sure videos work well too."

There were two reasons for the delay:

1. **The page opened the viewer with nothing to show.** A tile handed `DeckViewer` a deck and
   nothing else: no rectangle to fly from and no picture for the first frame. The viewer faded in
   over black and waited for a picture.
2. **The file service fetched what the phone already kept.** It remembered kept files only for the
   life of the process, and `keepLocally` fetches first and writes after, so after each launch the
   thumbnail and the viewer's copy came from the server again, though both were on disk. Rooms paid
   for this too: every thumbnail was fetched again after a launch. A video whose playable copy was
   kept was streamed or downloaded again.

## Decision

1. **What is kept is found before anything is fetched.** `local.ts` keeps an index of the kept
   files, read from the disk the first time it is asked and kept in step as files are kept and let
   go (a file the system took from the cache in the meantime counts as gone). `findKept(id, part)`
   answers from it. The file service looks there first for a thumbnail, a viewer's copy (or a
   photo's own file), a file, and a video's playable copy (its MP4 over an original kept while the
   copy was being made). **Try again** on a video still asks the server. `keptNames.ts` holds how a
   kept file is named, so the names written and the names read back are tested against each other.
2. **The page hosts the media viewer as a room does.** Each tile registers with the viewer
   (`useViewerTile`) and hands it the tile's own picture and the section's deck. The photo or video
   zooms out of its tile and back into it on close, and the tile hides while it is away. Paging to a
   tile scrolled off screen scrolls the page to it, so the close lands where the picture is. A video
   the server never measured opens on a deck of its own (`deckOfOne`) in its place, as in a room.
3. **The flight lands on the tile's own corners** (Arjun, 14 October 2026, once it was on his
   iPhone: "when we dismiss media, it zooms out back to the item in the scrolling list, the
   corners however do an abrupt jump from curved to right angle"). The flight rounded every
   corner as a room tile's (`RADIUS.md`), and this page's tiles are square but for a section's
   outer four, so the picture landed round and the square tile took its place. A tile now says
   its corners (`useViewerTile`'s third argument, read when the viewer asks, since a delete
   reflows the list); the opening and the closing carry them, and the stage rounds each corner of
   the flight from the tile's own to square. The page's tiles draw their corners themselves
   (`rowsOf` gives each its corners) instead of the row clipping them, so what the tile draws and
   what the flight lands on are one value. A room's tiles say nothing and keep `RADIUS.md`.
4. **Anything else is unchanged.** Other files still open in Quick Look from disk; Go to message
   still lands in the room.

## Consequences

- Walked on a simulator against a scratch server, five photos and videos in one room: the photo
  zooms out of its tile in about a quarter of a second, and flies back on close. The video zooms
  from its poster, shows its spinner about 0.9 seconds while the stream starts (a local server),
  plays to the end, and hides its controls while playing. With the server stopped and the app
  relaunched, a photo opened earlier opens at full detail from disk.
- Walked again for the corners: closing onto a section's top-right tile keeps that corner round
  and the other three square to the last frame, and onto a square video tile all four stay
  square; nothing changes at the swap but the picture itself (a played video lands on the frame
  it stopped at, then shows its poster, as in a room).
- After a launch, rooms draw kept thumbnails from disk with no request.
- Phone only, iPhone and Android: no server, wire, Jacobian or bridge change. The phone's web
  target keeps nothing, so `findKept` there finds nothing. Going live is `pnpm phone`.
- A video never played on this phone still streams, through the grant (ADR 0058): its first frames
  wait on the network.
