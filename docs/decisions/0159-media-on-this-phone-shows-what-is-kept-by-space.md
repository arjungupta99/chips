# 0159. Media on this phone shows what is kept, by space

Date: 14 October 2026
Status: Accepted, 14 October 2026, on Arjun's "go with B" after the mock, with "Delete means off
this phone only: yes" and "go with your recommendations" for the smaller choices. Amends ADR 0085
(You's About group: the Media on this phone row and its Clear). Decision 4 amended by
[0161](0161-a-kept-file-is-found-on-the-phone-first.md), 14 October 2026: a tile flies into the viewer
and back, and what the phone keeps is opened from disk.

## Context

Arjun, 13 October 2026: "You → Media on this phone: I need you to add a way to preview all the
media present (separated sections for space names) and also provide option to delete them from that
section."

Until now the row said how much the phone keeps and offered Clear, which let go of all of it. Every
attachment the phone opens or draws is kept under the app's cache, a file at a time, named for the
attachment's id and what the file is (`keepLocally`): the file itself, its thumbnail, a photo's
viewer's copy, a video's copy that plays everywhere. Nothing on disk says which room a file came
from, and nothing in Chips deletes a file from a space for everyone: the server has no route for it.

The mock (<https://claude.ai/artifact/A7zUN5GiGTya7uCsYGTeEG>) drew the row opening a page with a
section per space, and two ways to delete:
- **A**: each section's Delete, which takes the space's files.
- **B**: A, plus Select, which puts a circle on every tile, and a bar at the foot that deletes the
  picked ones.

He picked B, agreed that Delete takes files off this phone only, and took the mock's smaller choices:
biggest space first, every kept file shown, a photo scrolled past included (its thumbnail is kept),
and an Other section for what the phone cannot place.

## Decision

1. **The row opens a page.** Media on this phone on You says how much is kept, with a chevron, and
   pushes `/media`. It measures again whenever You comes back into view. Clear moves onto the page
   as **Clear all**, beside the total, asking as before.
2. **One section per space, biggest first.** Each kept file is placed in the first room whose lines
   carry it (core's `filesOf`: every file a room draws, a route card's lane files included, a line
   taken back included, each once). A section wears the room's face and name, its size and count,
   and its files as tiles, newest first. What no room on the phone carries (its room erased or left,
   a message not loaded) is **Other**, last, with its own Delete.
3. **One tile per attachment**, whatever the phone holds of it: drawn from its thumbnail, else its
   viewer's copy, else a photo's own file, all from disk with no request. A video wears its length,
   a voice note a microphone and its length, any other file its kind and name. Its size is
   everything kept of it.
4. **A tap opens it where a room would.** A photo or a video opens in the media viewer over its
   section's own deck (`keptDeck`, cut from the room's deck, in the page's order), and Go to message
   lands in its room. Any other file, or one the room's deck leaves out, opens in Quick Look from
   where the phone keeps it.
5. **Delete takes files off this phone only.** A section's Delete asks (*Delete 96 MB from this
   phone? Pomodoro Timer's 7 photos, videos and files stay in the space…*) and lets go of that
   space's files. **Select** in the bar, or a long press on a tile, puts a circle on every tile;
   picked ones go from a glass bar at the foot (*3 selected · 18 MB*, Delete), having asked, and the
   page leaves selecting. While selecting, each section's Delete is Select all (Deselect all when
   all are picked), and Clear all waits. The rows below close up on `GROWS`, through Reanimated's
   list (`GrowingList`).
6. **What is let go is forgotten, and nothing else.** `forgetKept` records the ids it lets go of;
   the file service reads the ones added since it last looked and forgets just those URIs, so the
   next look fetches them again while every other kept file stays where it is. A room erased from
   the server (ADR 0067) goes the same way.

## Consequences

- Phone only, iPhone and Android: no server, wire, Jacobian or bridge change. The phone's web target
  keeps nothing, so its page says nothing is kept. Going live is `pnpm phone`.
- A section is as long as what its space keeps; the list draws its rows as they come into view.
- Deleting a file from a space for everyone would be a server change, and is not this.
- Mocks are out of the repo, as asked on 28 September 2026.
