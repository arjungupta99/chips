/**
 * About Chips's row on You (ADR 0295), under Send feedback: the chip at rest for its mark, and the
 * version as its value, which is what the Version row under This iPhone used to say. It opens
 * About, pushed on a phone and beside the list on an iPad. A small still dot on the chip says
 * something waits that asks somebody (ADR 0296): an update for this app or for a computer its
 * owner updates, or a bridge that needs the owner. The rule is core's, as on the Mac and the web.
 */

import { ABOUT_ROW } from "@chipschat/core";
import { StyleSheet, View } from "react-native";
import { ChipPulse } from "../ui/ChipPulse";
import { GroupRow, MARK } from "../ui/Group";
import { usePalette } from "../ui/theme";
import { useUpdates } from "../updates/updates";
import { usePage } from "../you/pages";
import { appBuild } from "./build";

export function AboutRow() {
  const palette = usePalette();
  const page = usePage("about");
  // Whether the update dot is lit or not.
  const { rowLit: waits } = useUpdates();
  const version = appBuild().version;
  return (
    <GroupRow
      label={ABOUT_ROW}
      value={version}
      accessibilityLabel={waits ? `${ABOUT_ROW}, ${version}, an update waits` : undefined}
      mark={
        <View>
          <ChipPulse
            gold={palette.gold}
            ink={palette.ink3}
            lit={palette.ink}
            lighting={false}
            size={MARK}
          />
          {waits && (
            <View
              style={[styles.dot, { backgroundColor: palette.gold, borderColor: palette.raised }]}
              testID="about-row-dot"
            />
          )}
        </View>
      }
      accessibilityHint="What Chips is, what's new, and its licences"
      onPress={page.onPress}
      selected={page.selected}
      testID="about-row"
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    position: "absolute",
    top: -2,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
});
