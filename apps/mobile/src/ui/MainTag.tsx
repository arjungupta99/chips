/**
 * "Main", worn by a harness's Main agent and its Main room in the lists (ADR 0145): a soft pill in
 * the colour its face stands on, so Jacobian's is orange and OpenClaw's pink, as their faces are,
 * and neither reads as the room lead's gold "Lead" (`LeadMark`, ADR 0104). The ground is that
 * colour mixed into the page, the word that colour mixed into the ink, more of it in the dark, so
 * the word reads on either. In the Bright face theme (ADR 0176) the pill takes the face's Bright
 * ground, and the word keeps the Soothing one: the same hue, deep enough to read on a light page.
 */

import { StyleSheet, Text, View } from "react-native";
import { useFacePaint } from "./faceTheme";
import { mixHex } from "./lit";
import { usePalette, useScheme } from "./theme";
import { SPACE, TEXT } from "./tokens";

/** How much of the face's colour the pill's ground and its word take, light and dark. */
const MIX = {
  light: { ground: 0.16, word: 0.72 },
  dark: { ground: 0.3, word: 0.55 },
} as const;

export function MainTag({ hue }: { readonly hue: string }) {
  const palette = usePalette();
  const mix = MIX[useScheme()];
  const ground = useFacePaint().ground(hue);
  return (
    <View
      style={[styles.tag, { backgroundColor: mixHex(palette.bg, ground, mix.ground) }]}
      testID="main-tag"
    >
      <Text
        style={[styles.word, { color: mixHex(palette.ink, hue, mix.word) }]}
        maxFontSizeMultiplier={1.3}
      >
        Main
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { borderRadius: 999, paddingHorizontal: SPACE.sm, paddingVertical: 2, flexShrink: 0 },
  word: { fontSize: TEXT.xs, fontWeight: "700" },
});
