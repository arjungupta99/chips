/**
 * What stands in place of something the demo cannot do (ADR 0213, point 7): connecting a harness,
 * inviting somebody, pairing a device. The demo's workspace is made up and lives on this phone, so
 * a link, an invite or a code made in it would lead nowhere. A short line says so, with Set up my
 * own Chips beside it, which leaves the demo for the first screen's ways in, as the end card's does.
 *
 * Each of those three puts this where its action would be (`useInDemo`), and nothing else does.
 */

import { isDemo } from "@chipschat/core";
import { StyleSheet, Text, View } from "react-native";
import { useChips } from "../store/provider";
import { Button } from "../ui/Button";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { useHome } from "./home";

/** Whether the workspace in front is the demo's. */
export function useInDemo(): boolean {
  const { paired } = useChips();
  return isDemo(paired?.device);
}

export function NotInDemo({ testID = "not-in-demo" }: { readonly testID?: string }) {
  const palette = usePalette();
  const { demo } = useChips();
  const home = useHome();
  return (
    <View style={styles.row} testID={testID}>
      <Text style={[styles.words, { color: palette.ink2 }]}>Not in the demo</Text>
      <Button
        label="Set up my own Chips"
        variant="gold"
        onPress={() => home(demo.leave(), "ways")}
        testID={`${testID}-set-up`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACE.md,
    paddingVertical: SPACE.md,
  },
  words: { flexShrink: 1, fontSize: TEXT.body, fontWeight: "600" },
});
