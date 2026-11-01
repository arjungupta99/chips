/**
 * The phone's other channel. A haptic is the confirmation a thumb gets without the eye: Send
 * happened, the bubble is held, the swipe has gone far enough, the ask is answered. iOS spends
 * them sparingly and so does this — at the moment something is committed, never at the moment
 * something is merely touched, because a buzz under every tap is noise and the phone's own
 * keyboard is already using that budget.
 *
 * Five, named for what they mean here rather than for the generator they reach:
 *
 * - `tap` — a light impact: a message sent.
 * - `lift` — a medium impact: a bubble picked up by a long press, the sheet on its way.
 * - `success` — the notification pattern: an approval given.
 * - `warning` — the other one: a denial.
 * - `tick` — a selection click: a swipe crossing the line where letting go would decide it, or
 *   a picture dragged past the line where letting go closes the viewer.
 *
 * Every one is fire and forget. A platform with no haptics engine answers with a rejected
 * promise or throws outright, and neither is worth a screen's attention: the feeling is the
 * whole of what is being asked for, so where there is nothing to feel there is nothing to
 * report. The browser is the case in hand — `expo-haptics` on the web vibrates where the
 * browser will and does nothing where it will not, which is exactly right for a desktop tab.
 *
 * On Android the same five names reach `performAndroidHapticsAsync`, the platform's own
 * haptic constants, which ask for no permission (the media viewer, Phase 1, 14 September 2026):
 * the iOS generators there are the vibrator played to a pattern, and a click that buzzes like a
 * notification is the wrong feeling at the dismiss line. Each name takes the constant Android
 * means by it — a key pressed for a send, a long press for a lift, confirm and reject for a yes
 * and a no, and a clock's tick for a line crossed. An emulator has no motor, and there is no
 * Android phone here yet, so how they feel there — the viewer's click at the dismiss line among
 * them — is unanswered until one is in a hand (the media viewer, Phase 3, 15 September 2026).
 */

import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/** Ask for a feeling and forget about it, however the platform declines. */
function felt(fire: () => Promise<void>): void {
  try {
    void fire().catch(() => undefined);
  } catch {
    // A platform with no engine at all, which is not a thing a screen can do anything about.
    return;
  }
}

/** On Android, the platform's constant; everywhere else, the generator iOS names. */
function either(android: Haptics.AndroidHaptics, elsewhere: () => Promise<void>): void {
  felt(() =>
    Platform.OS === "android" ? Haptics.performAndroidHapticsAsync(android) : elsewhere(),
  );
}

/** A message sent. */
export function tap(): void {
  either(Haptics.AndroidHaptics.Virtual_Key, () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  );
}

/** Something picked up and held: the bubble under a long press, the sheet behind it. */
export function lift(): void {
  either(Haptics.AndroidHaptics.Long_Press, () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  );
}

/** An approval given. */
export function success(): void {
  either(Haptics.AndroidHaptics.Confirm, () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  );
}

/** A denial. A warning and not an error: the person meant it, and nothing has gone wrong. */
export function warning(): void {
  either(Haptics.AndroidHaptics.Reject, () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  );
}

/**
 * A line crossed under the finger: let go now and the swipe decides, or the viewer closes. A
 * decision card's swipe and the media viewer's drag to dismiss both click here.
 */
export function tick(): void {
  either(Haptics.AndroidHaptics.Clock_Tick, () => Haptics.selectionAsync());
}

/** How many light taps a message breaking into dust is felt as, across the wipe (ADR 0167). */
const CRUMBS = 5;
const CRUMB_MS = 95;

/** A message breaking into dust: a short run of light taps as the wipe crosses it. */
export function crumble(): void {
  for (let at = 0; at < CRUMBS; at += 1) {
    setTimeout(() => {
      either(Haptics.AndroidHaptics.Segment_Frequent_Tick, () =>
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
      );
    }, at * CRUMB_MS);
  }
}
