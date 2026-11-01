/**
 * Lock changes: a padlock standing open while anybody may rename, archive or delete the thing,
 * closed once nobody may, and the switch. A room's sheet has it (ADR 0156) and an agent's card
 * (ADR 0199), in the same words, so the two read alike.
 *
 * A row and not a button: iOS's own Settings rows with a switch turn on the switch alone, and a
 * row that was one would hide the switch from a screen reader inside it. Flipped, it stands as it
 * was put until the thing's own lock changes, which is the server taking it, or for a moment; one
 * the server turned away goes back at once.
 *
 * Opened from a Locked button (an agent's row on the Agents tab, ADR 0199), the row glows once,
 * gold fading back to its own ground, so the eye finds the switch it came for.
 */

import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  type StyleProp,
  StyleSheet,
  Switch,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Icon } from "./Icon";
import { usePalette } from "./theme";
import { RADIUS, SPACE, TEXT } from "./tokens";
import { useReduceMotion } from "./useReduceMotion";

const NATIVE = Platform.OS !== "web";

/** How long a flip stands on the switch, waiting for the thing's own lock to say it. */
const HELD_MS = 3000;

/** The glow: after the card has come in, a quick rise to gold, then back to the row's ground. */
const GLOW = { delay: 350, rise: 150, fade: 1200 } as const;

export function LockRow({
  locked,
  onLock,
  hint,
  ids,
  glow = false,
  style,
}: {
  /** Whether its changes are locked, as the server last said. */
  readonly locked: boolean;
  /** Lock or let go; whether the server took it. */
  readonly onLock: (locked: boolean) => Promise<boolean>;
  /** What the switch does, said to VoiceOver. */
  readonly hint: string;
  readonly ids: { readonly row: string; readonly switch: string };
  /** Glow once, as the page it is on comes in. */
  readonly glow?: boolean;
  /** Where the row stands in what holds it: its padding in a group of rows. */
  readonly style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();
  const { on, flip } = useLockFlip(locked, onLock);
  return (
    <View style={[styles.row, style]} testID={ids.row}>
      <Glow on={glow} testID={`${ids.row}-glow`} />
      <View style={[styles.mark, { backgroundColor: palette.surface3 }]}>
        <Icon name={on ? "lock" : "unlock"} size={20} color={palette.ink3} />
      </View>
      <View style={styles.words}>
        <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
          Lock changes
        </Text>
        <Text style={[styles.under, { color: palette.ink3 }]} numberOfLines={1}>
          Rename, archive, delete
        </Text>
      </View>
      <Switch
        value={on}
        onValueChange={flip}
        trackColor={{ true: palette.green, false: palette.surface3 }}
        accessibilityLabel="Lock changes"
        accessibilityHint={hint}
        testID={ids.switch}
      />
    </View>
  );
}

/**
 * A lock's switch: a flip shows at once and holds until the thing's own lock says it, or goes back
 * when the server turns it away. The row here and the room sheet's tile (ADR 0202) flip by it.
 */
export function useLockFlip(
  locked: boolean,
  onLock: (locked: boolean) => Promise<boolean>,
): { readonly on: boolean; readonly flip: (next: boolean) => void } {
  // The switch just flipped, and the lock it was flipped over.
  const [held, setHeld] = useState<{ readonly on: boolean; readonly over: boolean } | undefined>(
    undefined,
  );
  useEffect(() => {
    if (held === undefined) return;
    const gone = setTimeout(() => setHeld(undefined), HELD_MS);
    return () => clearTimeout(gone);
  }, [held]);
  const on = held !== undefined && held.over === locked ? held.on : locked;
  const flip = (next: boolean) => {
    const flipped = { on: next, over: locked };
    setHeld(flipped);
    void onLock(next).then((taken) => {
      // Back to the thing's own, unless it has been flipped again since.
      if (!taken) setHeld((now) => (now === flipped ? undefined : now));
    });
  };
  return { on, flip };
}

/** The gold under the row, lit once when `on` comes true. Still for Reduce Motion: no glow. */
function Glow({ on, testID }: { readonly on: boolean; readonly testID: string }) {
  const palette = usePalette();
  const less = useReduceMotion();
  const lit = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on || less) return;
    const glowing = Animated.sequence([
      Animated.delay(GLOW.delay),
      Animated.timing(lit, { toValue: 1, duration: GLOW.rise, useNativeDriver: NATIVE }),
      Animated.timing(lit, { toValue: 0, duration: GLOW.fade, useNativeDriver: NATIVE }),
    ]);
    glowing.start();
    return () => {
      glowing.stop();
      lit.setValue(0);
    };
  }, [on, less, lit]);
  if (!on) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: palette.goldSoft, opacity: lit }]}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  // A room sheet's row (`RoomSheet`), whose tile and words these are.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: 58,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
  },
  mark: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  words: { flex: 1, gap: 1 },
  name: { fontSize: TEXT.body, fontWeight: "500" },
  under: { fontSize: TEXT.sm },
});
