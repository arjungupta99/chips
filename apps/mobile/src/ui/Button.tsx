/**
 * Buttons. Primary is ink on paper — the one warm colour belongs to the decision card, not to a
 * button — and danger is quiet until pressed, because Deny should be easy to find and hard to
 * hit by accident.
 *
 * Every button is at least 44 points tall whatever its size says. That is Apple's minimum touch
 * target and the reason the phone's buttons are not the web's 30 pixels: a thumb is not a mouse,
 * and the two Approve/Deny buttons on a decision card are the ones it would be worst to miss.
 */

import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import { type Ground, useGround } from "./ground";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { usePalette } from "./theme";
import { type Palette, RADIUS, SPACE, TEXT } from "./tokens";

export type ButtonVariant = "default" | "primary" | "danger" | "red" | "plain" | "gold";

/**
 * The mark on gold, whichever the appearance, because the gold does not change: the new-space +'s
 * own (the desktop's `.side-new`).
 */
export const ON_GOLD = "#231a00";
/** Gold pressed: a tenth toward its mark, the desktop's `.side-new:hover`. */
export const GOLD_PRESSED = "#e0b12d";

/** The smallest a thing you tap may be (Apple's Human Interface Guidelines). */
export const TOUCH_TARGET = 44;

interface Skin {
  readonly backgroundColor: string;
  readonly borderColor: string;
  readonly color: string;
}

const SKINS: Readonly<Record<ButtonVariant, (palette: Palette, pressed: boolean) => Skin>> = {
  primary: (palette, pressed) => ({
    backgroundColor: pressed ? palette.ink2 : palette.ink,
    borderColor: pressed ? palette.ink2 : palette.ink,
    color: palette.bg,
  }),
  danger: (palette, pressed) => ({
    backgroundColor: pressed ? palette.redSoft : "transparent",
    borderColor: "transparent",
    color: palette.redInk,
  }),
  // The one that deletes for good, behind a typed name (ADR 0243): loud once it wakes, as Deny
  // never is. Pressed, it takes a ring of its own ink rather than a colour white reads badly on.
  red: (palette, pressed) => ({
    backgroundColor: palette.red,
    borderColor: pressed ? palette.redInk : palette.red,
    color: "#ffffff",
  }),
  // Flat, as every control here is: the press darkens it toward its own mark.
  gold: (palette, pressed) => ({
    backgroundColor: pressed ? GOLD_PRESSED : palette.gold,
    borderColor: "transparent",
    color: ON_GOLD,
  }),
  plain: (palette, pressed) => ({
    backgroundColor: pressed ? palette.surface2 : "transparent",
    borderColor: "transparent",
    color: palette.ink2,
  }),
  default: (palette, pressed) => ({
    backgroundColor: pressed ? palette.surface2 : palette.surface,
    borderColor: palette.line2,
    color: palette.ink,
  }),
};

function skinOf(palette: Palette, variant: ButtonVariant, pressed: boolean): Skin {
  return SKINS[variant](palette, pressed);
}

export function Button({
  label,
  onPress,
  variant = "default",
  disabled = false,
  busy = false,
  grow = false,
  icon,
  style,
  cancelable,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  readonly disabled?: boolean;
  /** Waiting on the server. The button says so and stops taking presses. */
  readonly busy?: boolean;
  /** Share the row equally with its siblings, which is how Approve and Deny sit together. */
  readonly grow?: boolean;
  /** A mark before the word, in the word's colour: the + on Create a space. */
  readonly icon?: IconName | undefined;
  readonly style?: ViewStyle | undefined;
  /** Whether a scroll that asks for the finger takes the press from it, as Pressable's own. */
  readonly cancelable?: boolean | undefined;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      accessibilityLabel={label}
      disabled={off}
      cancelable={cancelable}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => {
        const skin = skinOf(palette, variant, pressed && !off);
        return [
          styles.button,
          { backgroundColor: skin.backgroundColor, borderColor: skin.borderColor },
          grow ? styles.grow : null,
          off ? styles.off : null,
          style,
        ];
      }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={skinOf(palette, variant, false).color} />
      ) : null}
      {icon === undefined || busy ? null : (
        <Icon name={icon} size={18} color={skinOf(palette, variant, false).color} />
      )}
      <Text style={[styles.label, { color: skinOf(palette, variant, false).color }]}>{label}</Text>
    </Pressable>
  );
}

/** The mark on a filled circle: white, whatever the theme is doing around it. */
const MARK = "#ffffff";

/** The round buttons in the composer: the one that sends, the one that does not, and the bare one. */
export type IconTone = "send" | "quiet" | "bare";

/**
 * A round button that is a mark to the eye and a word to a screen reader: Send, in the composer.
 * Send is a blue circle with the arrow in the paper's colour, standing inside the right edge of
 * the field it sends — where every phone puts it — and dimmed rather than gone while there is
 * nothing to send, so the place a message goes stays where the thumb expects it. Quiet is the
 * same circle on the quiet surface with the mark in ink: Attach, which sits beside the field and
 * is not Send.
 *
 * The mark is white, in both themes (Arjun, 22 September 2026: "the up arrow in the mocks is also
 * white"). It took the page's own colour until then, for a reason worth keeping on the record:
 * the dark palette's blue is a light blue, so a near-black mark on it clears 6.3:1 where white
 * clears 3.0 — and white in the light theme clears 4.6. Three is the bar a mark has to clear
 * (WCAG 2.2, non-text contrast), so white clears it in both and clears it *just* in the dark. If
 * that ever reads thin on a real screen, the fix is a deeper blue under it rather than a darker
 * mark on it, because the arrow being white is the part that was asked for.
 * The circle is the size the row wants; the target around it is still a thumb's.
 *
 * Bare is the third: a mark with no circle at all, for a button that stands *inside* something
 * else. Attach became one when the composer became a floating capsule — a filled circle inside a
 * pane of glass reads as a button on a button, and the glass is already the surface the mark
 * needs. It keeps the whole of its target, and says it is pressed by the wash it takes rather
 * than by a colour it has.
 */
export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  size = 36,
  tone = "send",
  cancelable,
  testID,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly size?: number;
  readonly tone?: IconTone;
  /** Whether a scroll that asks for the finger takes the press from it, as Pressable's own. */
  readonly cancelable?: boolean;
  readonly testID?: string | undefined;
}) {
  const { ground, pressedGround, faded, mark, scale } = toneColours(
    tone,
    disabled,
    usePalette(),
    useGround(),
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      cancelable={cancelable}
      onPress={onPress}
      hitSlop={Math.max(0, (TOUCH_TARGET - size) / 2)}
      testID={testID}
      style={({ pressed }) => [
        styles.round,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: pressed && !disabled ? pressedGround : ground,
          opacity: faded,
        },
      ]}
    >
      <Icon name={icon} color={mark} size={Math.round(size * scale)} />
    </Pressable>
  );
}

/** What a round button of one tone is painted with, pressed or not, able or not. */
function toneColours(tone: IconTone, disabled: boolean, palette: Palette, on: Ground) {
  if (tone === "bare")
    return {
      ground: "transparent",
      pressedGround: palette.surface2,
      // The unfilled two still fade, because a mark with no circle has nothing else to say it.
      faded: disabled ? 0.55 : 1,
      mark: palette.ink2,
      scale: 0.62,
    };
  // Filled from what it stands on: grey on the paper or a card, white on the grouped ground.
  if (tone === "quiet")
    return {
      ground: on.fill,
      pressedGround: on.pressed,
      faded: disabled ? 0.55 : 1,
      mark: palette.ink,
      scale: 0.55,
    };
  // A filled circle says it cannot be pressed by going grey, not by fading: fading takes the
  // white mark down with it and a pale arrow on a pale circle is the dull thing Arjun kept
  // seeing (22 September 2026). Grey keeps the mark at full white — 3.2:1 in the light theme and
  // 5.1 in the dark, against 2.3 for a faded blue — and it is what Messages does with its own.
  return {
    ground: disabled ? palette.gray : palette.blue,
    pressedGround: palette.blueInk,
    faded: 1,
    mark: MARK,
    scale: 0.55,
  };
}

const styles = StyleSheet.create({
  round: { alignItems: "center", justifyContent: "center" },
  button: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  grow: { flex: 1 },
  off: { opacity: 0.5 },
  label: { fontSize: TEXT.md, fontWeight: "600" },
});
