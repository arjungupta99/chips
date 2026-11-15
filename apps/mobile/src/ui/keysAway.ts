/**
 * The keys put away before something comes up over the field that holds them: a sheet, a menu, a
 * viewer. Every opener that does so calls this, never `Keyboard.dismiss()` alone.
 *
 * iOS keeps the field that holds the caret as a modal comes up over it, and hands the caret back
 * as the modal goes, the keys rising with it. So the field has to have let go before the modal is
 * on the screen, and `Keyboard.dismiss()` cannot promise that here: it is a view command, and in
 * this React Native a view command waits with the frame's mounts until the JavaScript's turn ends
 * (`RuntimeScheduler`'s rendering updates). An opener that draws much in that turn lets a mount
 * reach the screen first, the modal with it. Universe did: its modal came up with the caret still
 * in the composer, UIKit took the keys down in a single frame and kept the composer to give it
 * back (`_preserveInputViewsWithID`, its `restorableResponder`), and the keys jumped back up as
 * Universe went (Arjun, 11 November 2026, on his iPhone; the simulator's log showed it). The room's
 * own sheet, drawing less, had only been winning the race.
 *
 * The keyboard controller's dismiss goes to the main thread at once, ahead of anything drawn after
 * it, so the keys slide down as the modal rises and there is nothing to hand back. React Native's
 * own as well, so its record of the focused field is let go of at once rather than when the
 * field's blur comes back, and a field the controller doesn't count as open still lets go.
 */

import { Keyboard } from "react-native";
import { KeyboardController } from "react-native-keyboard-controller";

export function keysAway(): void {
  void KeyboardController.dismiss();
  Keyboard.dismiss();
}
