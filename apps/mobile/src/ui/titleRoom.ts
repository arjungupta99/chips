/**
 * How wide a room's name may stand in a phone's navigation bar (`app/spaces/[id].tsx`): as wide
 * as the bar leaves between its way back and what stands at its right, so the name's capsule stops
 * short of Universe's rings instead of running under them.
 *
 * The name is a view in the title's place, laid out by react-native-screens and placed by UIKit,
 * and UIKit's idea of the room it has never reaches the layout: the title's shadow node takes
 * UIKit's position and not its size (`RNSScreenStackHeaderSubview`). What the layout gives it is
 * all the room between the two ends' glass, with nothing for the 12 points UIKit keeps either side
 * of the title; UIKit stands the name 12 points after the way back, and the rest of it ran under
 * what stood at the right: "Test lead and builder, bigger j…" under Universe's rings, on Arjun's
 * iPhone 17 Pro on 17 November 2026, given 282 points where 258 were clear. So the name is told.
 *
 * The bar's own numbers, measured on an iPhone 17 Pro under iOS 27.2 (17 November 2026): its ends
 * stand 16 points in from the sides of the safe area; the way back is a round glass 44 across;
 * what the screen puts at the right is given glass 4 points either side of it (Universe's 36 in a
 * glass 44 across, beside the connection's mark 83 in 91), and is never narrower than 36 inside
 * it; and the title keeps 12 points from either end. Where the name is narrower than both ends
 * allow, UIKit stands it in the middle of the bar, and where it is wider than that it moves it
 * over, so the rule is what lies between the two ends, not twice the wider.
 */

/** The bar's ends, in from the sides of the safe area. */
export const BAR_EDGE = 16;
/** The way back, a round glass at the bar's leading end. */
export const BACK_ACROSS = 44;
/** The glass the bar gives what the screen puts at its right, either side of it. */
export const SLOT_GLASS = 4;
/** The narrowest UIKit draws what is put at the bar's right, inside its glass. */
export const SLOT_LEAST = 36;
/** What the title keeps clear of each end. */
export const TITLE_GAP = 12;

/**
 * The widest the title may be, in points, in a bar `across` wide inside the safe area, with the
 * way back at its leading end and `slot` points of the screen's own at its trailing end, or none.
 */
export function titleRoom(across: number, slot: number | undefined): number {
  const leading = BACK_ACROSS + TITLE_GAP;
  const trailing = slot === undefined ? 0 : Math.max(slot, SLOT_LEAST) + 2 * SLOT_GLASS + TITLE_GAP;
  return Math.max(0, across - 2 * BAR_EDGE - leading - trailing);
}
