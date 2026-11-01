/**
 * What a swipe on a card decides. Pure, so the one fact it rests on is written down and tested.
 *
 * The card's hint says right approves and left denies, and Approve is the face drawn on the left,
 * uncovered as the card moves right. `ReanimatedSwipeable` hands `onSwipeableOpen` the way the
 * card *moved*, not the side of the face it uncovered: a card dragged right opens with `"right"`.
 *
 * It was read the other way round from the swipe's first commit until 14 September 2026, so every
 * swipe did the opposite of the face under the thumb, and a swipe to deny sent the email. Jest
 * draws the swipeable as a plain view, so nothing under Node could see it; the first walk on an
 * Android emulator did. `swipe.vitest.ts` also reads the gesture handler's own source, so an
 * upgrade that changes what `onSwipeableOpen` is handed fails there rather than in a person's hand.
 */

/** The way the card moved, as `onSwipeableOpen` names it. */
export type Moved = "left" | "right";

export function swipeDecision(moved: Moved): "approved" | "denied" {
  return moved === "right" ? "approved" : "denied";
}
