/**
 * A navigation bar's title in two lines: what this screen is, and under it the one thing the
 * name does not say.
 *
 * iOS has no option for a second line — a bar's title is a string — so it is a view in the
 * title's place, which is what every phone app with a subtitle does. Both lines are clipped to
 * one, and the whole thing is as wide as the bar leaves it: a title that wraps pushes the bar
 * taller and takes the room's first message with it.
 *
 * The words are the room's (`spaces/spaces.ts`), not this component's: it only sets them.
 */

import { StyleSheet, Text, View } from "react-native";
import { useLayout } from "./layout";
import { usePalette } from "./theme";
import { TEXT } from "./tokens";

export function BarTitle({
  title,
  subtitle,
  warning,
}: {
  readonly title: string;
  readonly subtitle?: string | undefined;
  /** Said after the subtitle in amber: "1 can't answer" while an agent here can't (ADR 0083). */
  readonly warning?: string | undefined;
}) {
  const palette = usePalette();
  const { roomy } = useLayout();
  return (
    <View style={[styles.stack, roomy ? styles.roomy : null]}>
      <Text numberOfLines={1} style={[styles.title, { color: palette.ink }]}>
        {title}
      </Text>
      {subtitle === undefined && warning === undefined ? null : (
        <Text numberOfLines={1} style={[styles.sub, { color: palette.ink3 }]}>
          {subtitle}
          {subtitle === undefined || warning === undefined ? null : " · "}
          {warning === undefined ? null : (
            <Text style={{ color: palette.amberInk }} testID="bar-warning">
              {warning}
            </Text>
          )}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { alignItems: "center", maxWidth: 260 },
  // What a phone's bar leaves between its buttons is no measure of an iPad's, where "Write a
  // two-line poem about a…" was cut short in a room seven hundred points wide (the iPad simulator,
  // 16 October 2026).
  roomy: { maxWidth: 440 },
  // The bar's own weight and size, since this stands where the bar's own title would: seventeen
  // is what iOS sets a navigation title in, and what the mock's name capsule came to when its
  // 330-point frame was scaled to a real phone (22 September 2026). It was fifteen until then,
  // which read as a caption for the room rather than as its name.
  title: { fontSize: TEXT.body, fontWeight: "600" },
  sub: { fontSize: TEXT.sm },
});
