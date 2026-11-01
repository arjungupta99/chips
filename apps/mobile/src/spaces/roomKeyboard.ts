/**
 * How much of the room the keyboard covers, as one number of points.
 *
 * The room used to ask the keyboard controller's `KeyboardAvoidingView` for this, and that
 * component keeps the answer in two halves: a `progress` between nought and one, which every
 * keyboard event writes, and the height to scale it by, which only the *will show* event writes.
 * On iOS that is the single notification the whole library hangs off — it listens to no other,
 * and synthesises the end of the animation on a timer — so a will-show that is missed, or that
 * carries a frame of no height, leaves the two halves disagreeing: fully open, times a height of
 * nought, is a padding of nought while the keys are standing there. The composer is then behind
 * the keyboard and the list runs under it, and nothing corrects it until the next time the
 * keyboard goes down and comes up (Arjun, 20 September 2026: stuck in this odd state from warm
 * start).
 *
 * So the room keeps one number instead of two, and takes it from two independent observers:
 *
 * The keyboard controller's own events give the ride. `onKeyboardMove` carries the keyboard's
 * *measured* frame in the window, frame by frame, rather than what a notification claimed — so
 * the composer follows the keys up, down, and through an interactive drag.
 *
 * React Native's own `Keyboard` gives the truth at rest. It watches `keyboardDidShow` and
 * `keyboardDidHide`, which are different notifications from the one the controller watches, and
 * it reports the settled height. In the ordinary case it says what the ride already ended on and
 * changes nothing; when the controller has missed its notification it is the correction, and the
 * room is right again the moment the keyboard has finished arriving.
 *
 * `roomPadding` is where the arithmetic lives so it can be read and tested on its own. It is what
 * the avoiding view's own sum reduced to: the view's measured place on the screen and the offset
 * handed to it cancelled each other exactly, which is why the room no longer measures what stands
 * above it.
 */

/**
 * What to hold clear at the foot of the room: the keyboard's height, less the band at the bottom
 * of the glass the composer is already holding. While the keys are up that band is the keyboard's
 * and not the home indicator's, so counting it twice would leave a gap under the composer.
 */
export function roomPadding(keyboard: number, bottomInset: number): number {
  "worklet";
  return Math.max(keyboard - bottomInset, 0);
}

/**
 * The keyboard's height as React Native's own observer last saw it, and nought when it is away,
 * measured as the controller measures it: from the foot of the screen.
 *
 * On Android React Native measures from the top of the navigation band instead (`ReactRootView`:
 * the keyboard's inset less the system bars'), so `band` is added back there. Whichever observer
 * spoke last won, and when it was React Native's the band came off twice and the composer sat that
 * far under the keys. It did in landscape, once the status bar stood aside and React Native said
 * its height again: 237 points against the controller's 261 (AN-26, measured 16 October 2026).
 */
export function seenHeight(
  visible: boolean,
  metrics: { readonly height: number } | null | undefined,
  band = 0,
): number {
  if (!visible || metrics === null || metrics === undefined) return 0;
  return metrics.height + band;
}

/**
 * Whether the status bar stands aside for the keys: on Android, in landscape, while they are up
 * (AN-26). A Pixel 9 on its side is 411 points tall, and the status bar (52), the room's header
 * (56) and Gboard (252) left 51 for a composer that needs 75 above the keys, so the keys covered
 * its lower edge, with no room left for the messages. The status bar's 52 give the composer its
 * place. Upright, or on an iPhone, whose keys in landscape are shorter, there is room, and the bar
 * stays.
 */
export function statusBarAside(
  os: string,
  window: { readonly width: number; readonly height: number },
  keysUp: boolean,
): boolean {
  return os === "android" && keysUp && window.width > window.height;
}
