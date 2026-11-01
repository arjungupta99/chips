/**
 * The moment a swipe has gone far enough, felt rather than seen.
 *
 * A swipe to approve is a decision made without looking — in a queue, one-handed, the phone
 * half out of a pocket — and the one thing it needs to say is *let go now and it is done*. The
 * colour coming up under the card says it to an eye that is watching; this says it to a thumb
 * that is not. It is a selection click, the same one a picker gives at each notch, and it fires
 * once per crossing: back under the line and out past it again is a second click, which is the
 * point, because a thumb that overshoots and pulls back has to be told it is safe again.
 *
 * It draws nothing. It exists as a component because the value it watches is the swipeable's
 * own, handed to the render callback that draws the face behind the card, and the only way to
 * read that on the UI thread is a hook — so this mounts beside the face and watches. One of
 * them, not one per face: the offset it reads is the card's, signed by the direction, and both
 * faces are handed the same one.
 *
 * It is also the one file in the app that imports Reanimated directly, which is why it is a
 * file: under Jest, Reanimated reaches for a native module while it is still being imported
 * and throws, so `jest.setup.js` mocks this away exactly as it mocks the swipeable itself. No
 * test here can prove the click; the phone can, and nothing else can.
 */

import { runOnJS, type SharedValue, useAnimatedReaction } from "react-native-reanimated";
import { tick } from "../ui/haptics";

export function Crossing({
  translation,
  at,
}: {
  /** The card's offset from its closed place, after friction — what the release is judged on. */
  readonly translation: SharedValue<number>;
  /** The distance past which letting go decides it. */
  readonly at: number;
}) {
  useAnimatedReaction(
    () => Math.abs(translation.value) >= at,
    (past, before) => {
      // `before` is null on the first run: a card that mounts already open has crossed nothing.
      if (past && before === false) runOnJS(tick)();
    },
  );
  return null;
}
