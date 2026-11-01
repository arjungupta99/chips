# 0127. The share sheet slides up in a sheet of the app's own

Date: 6 October 2026
Status: Accepted, 6 October 2026. Changes how an iPhone shows the share sheet for words: Share
text in a message's menu, Add agent's link, and a pairing code.

## Context

Arjun, on his iPhone (iOS 27): "this share sheet appears with a weird expanding animation. Its
needs to slide in from bottom." The sheet in question comes up from Share text in a message's
menu.

Filmed on the simulator (iOS 26.5), the share sheet grows out of the row that was pressed,
whatever it is told. `UIActivityViewController` always presents through its own popover
presentation controller (`_UIActivityViewControllerPresentationController`, style popover). Each
of these left it growing out of the row:

- React Native's `Share.share`, which asks for a popover with nothing to point at;
- the sheet presented by itself with no style set, and with `.pageSheet` set, which it ignores;
- `preferredTransition = .coverVertical`, which the popover reports it uses;
- a source rect, and then a source view, along the foot of the screen;
- the popover's private `_prefersZoomTransitions` set off (tried to learn, not to ship);
- the message's menu closed before the sheet came up.

The one arrangement that slid up was a page sheet of the app's own with the share sheet inside it
as a child. Apple's documentation asks for the share sheet to be presented modally on an iPhone,
so holding it is outside what Apple supports. Two options were put to Arjun: **hold it in a
sheet**, or **keep iOS's own** animation and remove the module that had not changed it. He picked
"hold it in a sheet, put it on my phone".

## Decision

1. **On an iPhone, words go to the share sheet inside a page sheet of the app's own**
   (`modules/share-sheet`, `ChipsShareSheet.shareText`). The page sheet slides up from the bottom
   with medium and large detents. The share sheet draws its own card in it, with its ✕, its
   actions and More.
2. **It says once that it has gone**, whether the share sheet finished (shared, its ✕, an action
   left half way) or the sheet was swiped down.
3. **`ui/share.ts` is the one way the app shares words.** Where the build has no module (an older
   build, Android, the web target), it uses React Native's `Share.share`, as before.
4. **Files are not changed.** A file still goes to `expo-sharing`'s sheet, or to Quick Look
   (0124).

## Consequences

- Share text, Add agent's link and Send the code slide up on an iPhone.
- If a later iOS draws the share sheet oddly inside the holder, or one of its actions misbehaves
  there, this is where to look. What it should look like: the sheet slides up with the share
  sheet's card in it, and its ✕, a swipe down, or an action done closes it. The way back is to
  present the share sheet itself (`top.present(share, animated: true)`), which brings back the
  growing entrance.
- The module is native, so a phone needs a build with it (`pnpm phone pods`, then
  `pnpm phone build`).
- Not seen on a real device by me: Messages, Mail and AirDrop from inside the holder. The
  simulator has none of them; Copy, Reminders' list, More, the ✕ and a swipe down were walked.
