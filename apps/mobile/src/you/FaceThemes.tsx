/**
 * The two face themes as You offers them (ADR 0176): a card for each, under the appearance switch
 * in the same group, as iOS lays out its own light and dark in Display. Each card shows a face of
 * each kind in its own theme — an agent, a room and you — whichever theme the rest of the screen is
 * in, so what you are choosing is in front of you before you choose it, and that it is every
 * face's colour. A gold ring round the card and a round tick by its name mark the one in use.
 *
 * Until 20 October 2026 each card showed six faces in two rows with its name under it, and was the
 * tallest thing on You, over the settings changed more often; one row, with the name inside the
 * card, is half the height (ADR 0085's addendum of that day).
 *
 * The faces are drawn by the same `Avatar` everything else uses, held in the card's theme by
 * `FacesIn`: a preview cannot drift from what a choice will do.
 */

import type { SpaceIcon } from "@chipschat/protocol";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar, type AvatarKind } from "../ui/Avatar";
import { FACE_THEMES, FacesIn, type FaceTheme } from "../ui/faceTheme";
import * as feel from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";

/** Who the previews show, besides you: an agent with letters, a room with a mark. */
const SAMPLES: readonly {
  readonly name: string;
  readonly kind: AvatarKind;
  readonly icon: SpaceIcon;
}[] = [
  { name: "J", kind: "agent", icon: { icon: "chip", ground: 9, letters: "J" } },
  { name: "Chess", kind: "channel", icon: { icon: "knight", ground: 5 } },
];

/** The gold of the tick and the ring, and the ink on it: the + button's pair. */
const RING = 2;
const ON_GOLD = "#1d1a10";

export function FaceThemes({
  chosen,
  onChoose,
  me,
}: {
  readonly chosen: FaceTheme;
  readonly onChoose: (theme: FaceTheme) => void;
  /** Your own face, the last in each preview. */
  readonly me: { readonly name: string; readonly face: SpaceIcon | undefined };
}) {
  const palette = usePalette();
  return (
    <View style={styles.cards} accessibilityRole="radiogroup" accessibilityLabel="Theme">
      {FACE_THEMES.map(({ value, label }) => {
        const on = value === chosen;
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            accessibilityLabel={label}
            accessibilityHint="Changes the colours every face wears"
            testID={`face-theme-${value}`}
            onPress={() => {
              if (on) return;
              feel.tick();
              onChoose(value);
            }}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: palette.bg, borderColor: on ? palette.gold : palette.line },
              pressed ? styles.pressed : null,
            ]}
          >
            <FacesIn value={value}>
              <View style={styles.row}>
                {SAMPLES.map((sample) => (
                  <Avatar
                    key={sample.name}
                    name={sample.name}
                    kind={sample.kind}
                    icon={sample.icon}
                    size="md"
                    decorative
                  />
                ))}
                <Avatar name={me.name} kind="person" icon={me.face} size="md" decorative />
              </View>
            </FacesIn>
            <View style={styles.named}>
              <View
                style={[
                  styles.radio,
                  on
                    ? { backgroundColor: palette.gold, borderColor: palette.gold }
                    : { borderColor: palette.ink4 },
                ]}
              >
                {on ? <Icon name="check" size={14} color={ON_GOLD} /> : null}
              </View>
              <Text
                style={[styles.label, on ? { color: palette.ink } : { color: palette.ink2 }]}
                maxFontSizeMultiplier={1.4}
              >
                {label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cards: { flexDirection: "row", gap: SPACE.sm, marginTop: SPACE.sm },
  card: {
    flex: 1,
    alignItems: "center",
    gap: SPACE.sm,
    paddingTop: SPACE.md - RING,
    paddingBottom: SPACE.sm + 2 - RING,
    paddingHorizontal: SPACE.sm - RING,
    borderRadius: 14,
    borderWidth: RING,
  },
  pressed: { opacity: 0.7 },
  // Spread across whatever the card's width is: on a narrow phone the faces stand closer, and
  // nothing is cut.
  row: { flexDirection: "row", justifyContent: "space-evenly", alignSelf: "stretch" },
  named: { flexDirection: "row", alignItems: "center", gap: 7 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: TEXT.md, fontWeight: "600" },
});
