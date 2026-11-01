/**
 * The first line of a sheet's inner page: the way back, and the page's name (ADR 0174's addendum).
 *
 * The way back was the chevron alone with eight points round it, a target of 38 points by 38 that
 * a thumb landing on the chevron's left or on the gap before the name missed (Arjun, 15 October
 * 2026: "the touch area of back button feels too small"). It is now a press of a full touch target
 * that reaches from the sheet's edge to where the name starts, and the chevron and the name stand
 * exactly where they stood.
 *
 * The name goes back too, as the name beside a back arrow does on iOS (Arjun, 16 October 2026:
 * "Tapping on the "icon" text should also take nav back"). It is a press of its own sharing the
 * chevron's, so the two dim together and a missed tap is not a silent one; and it is left out of
 * what a screen reader reads, which still hears a button, Back, and the page's name as its heading.
 *
 * Every inner page of the space's sheet draws its line with this, so the target is one thing.
 */

import { type ReactNode, useState } from "react";
import { Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { TOUCH_TARGET } from "./Button";
import { Icon } from "./Icon";
import { CLOSE_ROOM } from "./SheetClose";
import { usePalette } from "./theme";
import { SPACE, TEXT } from "./tokens";

/** The chevron. */
const GLYPH = 22;
/** How far the press reaches out to the left of the chevron, into the sheet's own margin. */
const OUT = 14;
/** The gap between the chevron and the name, which is the press's too. */
const GAP = SPACE.sm;
/** How far past its line the press reaches up and down: the target's height less the line's. */
const RISE = (TOUCH_TARGET - GLYPH) / 2;
/** How far the name's press reaches past the name: up and down to a full target, and on past it. */
const NAME_SLOP = { top: SPACE.sm, bottom: SPACE.sm, right: SPACE.md } as const;

export function PageBack({
  title,
  onBack,
  testID,
  style,
}: {
  readonly title: ReactNode;
  readonly onBack: () => void;
  readonly testID?: string | undefined;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();
  // Either press down dims both: the line is one way back.
  const [pressed, setPressed] = useState(false);
  const press = {
    onPress: onBack,
    onPressIn: () => setPressed(true),
    onPressOut: () => setPressed(false),
  };
  return (
    <View style={[styles.line, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        {...press}
        hitSlop={{ top: SPACE.xs, bottom: SPACE.xs, left: SPACE.xs }}
        testID={testID}
        style={styles.press}
      >
        <Icon name="previous" size={GLYPH} color={pressed ? palette.ink4 : palette.ink2} />
      </Pressable>
      <Pressable
        accessible={false}
        {...press}
        hitSlop={NAME_SLOP}
        style={styles.name}
        testID={testID === undefined ? undefined : `${testID}-name`}
      >
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: pressed ? palette.ink3 : palette.ink }]}
          numberOfLines={1}
        >
          {title}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Short of the sheet's X, which stands at the right of this line (ADR 0169). Over what follows
  // it: the press reaches below the line, and a page's hint starts two points under it, which,
  // drawn later, took the lower third of the target for itself.
  line: { flexDirection: "row", alignItems: "center", marginRight: CLOSE_ROOM, zIndex: 1 },
  // A full target, its margins taking back what it adds round the chevron, so the line is as tall
  // and the chevron and the name stand where they did.
  press: {
    height: TOUCH_TARGET,
    paddingLeft: OUT,
    paddingRight: GAP,
    marginLeft: -OUT,
    marginVertical: -RISE,
    justifyContent: "center",
  },
  // The name gives way to the X before the line does, and is cut short rather than wrapped.
  name: { flexShrink: 1 },
  title: { fontSize: TEXT.xl + 2, fontWeight: "700", letterSpacing: -0.3, flexShrink: 1 },
});
