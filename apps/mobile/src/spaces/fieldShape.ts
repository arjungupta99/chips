/**
 * A room's composer as numbers (`Composer.tsx`): how tall its field and its + are, and how far over
 * the safe area's foot they stand. Kept apart so that an iPad's bar (`ui/PadBar.tsx`) can stand
 * level with them without loading the composer: the gold + and the composer's + are on one line
 * (Arjun, 5 November 2026: "the + icon alignment is important").
 */

import { SPACE } from "../ui/tokens";

/**
 * The field's own height, and the +'s beside it.
 *
 * It went up on 22 September 2026, and for a reason worth writing down: the mocks were drawn at
 * 330 points wide standing in for a 402-point phone, so everything in them was a fifth larger
 * against the screen than the same number of points is here. Arjun liked the proportions there
 * and found the real one mean beside it — "the proportions in the mock look better… might be
 * having more height". This is that fifth, given back: a fifty-point pill rather than a
 * forty-four. The thumb's minimum (`TOUCH_TARGET`) is still cleared. On 23 September, in the
 * system's glass, "slightly more taller": fifty-four, and then two points back — fifty-two — with
 * Send still centred on one line and the + beside it the same. On 24 September, two more back:
 * fifty.
 */
export const FIELD = 50;

/** Under the field, over the safe area's foot: the composer's own padding. */
export const FIELD_FOOT = SPACE.md;
