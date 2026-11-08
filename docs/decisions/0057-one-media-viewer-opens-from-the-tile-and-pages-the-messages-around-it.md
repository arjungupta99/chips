# 57. One media viewer opens from the tile and pages the messages around it

Date: 14 September 2026 · Status: accepted

## Context

A photo in a room opened in a modal that knew one attachment. It faded in over the room, drew
nothing until the whole original had come, and could only be pinched. There was no way to the
photo beside it in an album, let alone the next message's. A video was a second modal that
downloaded first. On the web there was no viewer at all: a photo's click opened the blob in a new
tab, which the desktop shell very likely does not allow. The media viewer proposal
(`docs/proposals/media-viewer.md`) reads those faults from the code and sets out one viewer for
every surface. Its §2 is this decision. Arjun answered its first questions on 13 September 2026:
the deck is the media of the last twenty messages, a video plays when it is landed on, and Save is
a row of its own on both platforms.

The phone's viewer was built first, for photos (the proposal's Phase 1, 14 September 2026). The
web's lightbox, video on the stage, the server's view copy and the tablets follow in later phases,
under these same rules.

## Decision

1. **One viewer, on every surface.** The iPhone, the Android phone, the iPad, an Android tablet and
   the web share the words, the deck, the arithmetic and these rules. The deck and the arithmetic
   are `packages/core/src/viewer.ts`, pure, so no two surfaces can disagree on either. What
   differs is the hand, the room there is, and what the platform owns: its back gesture, its share
   sheet, its bars. The stage is black whatever the theme.
2. **The deck is the media of the twenty messages around the one that was tapped, in the order it
   was said.** At the foot of the room that is the room's last twenty; further up, the tapped
   message with what was said either side of it. The messages are the lines the room draws
   (core's `visibleLines`), in the space being read — a room, or a thread. The media is every photo
   and every video the server measured that they carry, a route row's lane files among them. A
   message's photos stand together. The window is fixed when the viewer opens: a message taken
   back leaves it, and a line that lands after is seen at the next opening. Voice notes, files and
   videos the server never measured are rows in the room, and are not in the deck.
3. **It opens from where it was tapped, and goes back there.** The tile grows into its place on
   the stage from the frame it had in the room, drawn with the thumbnail it already shows, while
   the stage darkens; the bars arrive last. Closing runs it backwards to the tile of the item that
   is current then, which the room has scrolled on screen under the opaque stage. Where that tile
   cannot be found, the picture shrinks and fades where it is. Reduce Motion takes the travel out
   and leaves a crossfade.
4. **The first movement decides the gesture.** At the fitted size a horizontal pan pages, a
   vertical pan dismisses, a pinch zooms, a double tap zooms to two and a half times at the point
   and back, and a tap hides and shows the bars. Zoomed, a pan moves the picture within its bounds.
   A pinch let go under three quarters closes. The numbers are the proposal's §4.6.
5. **Dragging to dismiss shows the room.** The picture follows the finger and shrinks a little, and
   the stage clears with the distance. Past 120 points, or flicked at 900 points a second, it goes
   back to its tile; short of the line, it springs back. The line is felt as a selection click, as
   a decision swipe's is.
6. **Bytes come in three sizes, and the viewer climbs.** The thumbnail is on the device already and
   is the first frame. The view copy, no longer than 2,048 pixels on its longer side, replaces it
   when it arrives. The original is fetched on request, or when there is no view copy to be had.
   Only the current item's neighbours are fetched ahead of a swipe.
7. **A video plays in the viewer, not in another modal.** It plays when landed on, pauses when
   swiped away, and has the viewer's own controls and Picture in Picture.
8. **What can be done with a picture is one press away.** Share (the platform's sheet), Save (to
   Photos, or to the gallery, a row on both platforms), Copy, Go to message, Details, and Open
   original. On the desktop: Download, Copy image, Open message, Details, Fullscreen, and a key for
   each.
9. **A screen reader gets the same viewer.** The stage is modal and the room behind it hidden; each
   item is announced with its place, its name, who sent it and when; every action is a button;
   paging is the reader's swipe or the arrow keys.
10. **An iPad is the same viewer at the window's size, and so is an Android tablet.** The viewer
    covers the window, never a pane. Where the window is wide, a filmstrip sits under the picture
    and arrows appear for a pointer; a narrow window is a phone.
11. **The platform's back closes it, with the return.** The iPhone's edge swipe, Android's back
    gesture and button, and the Escape key are all `onRequestClose`, and each plays the return.

## Consequences

- On the phone the viewer is `apps/mobile/src/media/`. `Stage.tsx` is its one import of Reanimated
  and gesture handler. It calls core's arithmetic from gesture callbacks on the UI thread, which is
  why those functions are marked `"worklet"`; the worklets Babel plugin transforms them where the
  app bundles `packages/core`, and a development build says so at load if it ever stops. Under
  Jest the stage is mocked, as `Crossing` is, so no unit test proves a gesture: the simulator, the
  emulator and `e2e/maestro/viewer.yaml` do, and Playwright opens the viewer on the web target and
  pages it by the arrows it draws where there is a pointer.
- Every tile in a room joins a registry while it is mounted, so the viewer can ask where it is at
  the moment of release, not at the moment of opening. A tile the list has windowed away is not in
  it, and that is when the shrink-and-fade is seen. How often, the walk on a phone says.
- The room follows the viewer: when the item paged to has no tile on the glass, the room scrolls to
  its line without animation. The viewer's current item lives in the viewer, so paging never
  redraws the room's list.
- Until the server makes a view copy (the proposal's Phase 4), `?variant=view` is answered with the
  original, which the phone recognises by its size and type and keeps once as the file. Open
  original is absent then, because the original is what is showing. A server that refuses the
  variant with a 404 is asked for the file.
- Save asks to add to the library and never to read it. On iOS that is its own prompt, whose words
  are in `app.json`; on Android it asks for photos and videos only, and reads no location.
- A video plays on the stage (Phase 2, 14 September 2026), from one `expo-video` player the viewer
  holds and puts the current video on: it plays when landed on, pauses when left, and goes on from
  where it was when come back to. Only the current item draws the player; a neighbour is its poster.
  The room's own player is gone: a video's tile opens the viewer, and so does the Play of a video the
  server never measured, on a deck of that one video, which closes with the shrink-and-fade.
- A video plays from the whole copy downloaded to the phone until the proposal's Phase 4 streams it.
  While it comes the poster says how much has arrived, read from the response's body as it comes.
  Through the relay that needed the tunnel's caller to hand an answer over at its headers, with its
  body still arriving, where it had held every chunk until the last. Which bytes `?variant=play` gave
  is said by the server in `x-chips-playable`, so the viewer says the original is playing only while
  the copy that plays everywhere is being made.
- The proposal numbered this decision 0056. That number was taken on 13 September 2026 by the
  limiter's, so this is 0057, and the grant the proposal's Phase 4 will write is 0058.

## Addendum, 6 November 2026: the status bar goes only where going moves nothing

Arjun, on his iPad, from You → Media on this iPad: dismissing a photo "causes odd bounces in the
left nav and pretty much the whole screen". The status bar hid with the bars, as the proposal says,
and a drag to dismiss takes the bars away as it starts. On an iPad the window's top inset is the
status bar's 24 points, so hiding it dropped that inset to 0, and every screen under the viewer
rose: the list beside the page and the page both. Then, as the viewer started to leave, the bar
came back and they slid down again. All of it showed through the clearing backdrop. Filmed on the
13-inch iPad simulator, the list stood about 30 points high for the whole drag and took about
230 ms to slide back after the release. A tap on Close moved nothing, since the bars, and with
them the bar, were still up.

1. **On iOS the bar hides with the bars only where a sensor housing holds its band**
   (`hidesInPlace` in `media/ViewerWindow.tsx`): an iPhone whose window reaches 44 points or more
   into a housing, at the top upright or at a side on its side. There the top inset is the
   housing's, bar or no bar. On an iPad, an iPhone with a Home button and the iPhone Duo, the bar
   stays, light over the stage. The same film with this change: the list holds its place in
   every frame of the drag and the flight home. Android is unchanged: the viewer's modal is a
   window of its own there.
2. **Leaving, the bar takes the app's ink at once**, crossfaded as the backdrop clears. It stayed
   light until the modal went, so it stood white over a light page for the flight home and turned
   dark in one frame at the end. `statusInk` in `ui/theme.ts` is the root's rule, now shared.
