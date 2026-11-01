/**
 * Who you are here, at the top of You (ADR 0085): your face, the name you go by, and your role in
 * which workspace — where a phone's own Settings puts its person, as the first row of a card whose
 * second row is the workspace (ADR 0085, 20 October 2026). It was four rows of facts, one of them
 * "You are · You", and a field with a Save button always showing under it; then the face stood
 * large in the middle of the screen, over the groups, and the words of no card started where its
 * name did.
 *
 * Your face is chosen from here (ADR 0139): a tap on it opens the icon sheet a space's and an
 * agent's are chosen on, with you at its head — a mark, a letter or two, or an emoji, on a colour.
 * It is one face for everybody, beside your words in every room. The pen on it says it can be
 * changed, as the pen beside the name does.
 *
 * The name is changed where it stands (ADR 0082, and in place since ADR 0139, as a room's title and
 * an agent's name are since ADR 0112), as `NameInPlace` does it for an agent's name too. What you
 * go by is what people and every agent call you, and agents read it again the moment it changes.
 *
 * The icon sheet stands beside You's scroll, not in it (`You.tsx`).
 */

import type { Store } from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { IconSheet, whyNotSaved } from "../spaces/IconSheet";
import { Avatar, avatarSide } from "../ui/Avatar";
import { useGround } from "../ui/ground";
import { Icon } from "../ui/Icon";
import { NameInPlace } from "../ui/NameInPlace";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import type { YouSection } from "./section";

export function useProfileGroup({
  store,
  name,
  face,
  standing,
  connected,
}: {
  readonly store: Store;
  readonly name: string;
  /** The face you chose, when you chose one. */
  readonly face: SpaceIcon | undefined;
  /** "Owner · Demo". */
  readonly standing: string;
  readonly connected: boolean;
}): YouSection {
  const [choosing, setChoosing] = useState(false);
  // Why the last pick did not stick: the store puts the old face back and this says why.
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const group = (
    <View style={styles.me} testID="profile">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Your face"
        accessibilityHint="Chooses the face you wear beside your name"
        onPress={() => setChoosing(true)}
        testID="profile-face"
        style={({ pressed }) => (pressed ? styles.pressed : null)}
      >
        <Avatar name={name} kind="person" size="lg" icon={face} decorative />
        <Pen />
      </Pressable>
      <NameInPlace
        name={name}
        may
        under={standing}
        hint={() => "What people and agents here call you."}
        connected={connected}
        onRename={(next) => store.rename(next)}
        label="Your name"
        pressHint="Changes the name you go by"
        placeholder="What you go by"
        size={TEXT.xl}
        underSize={TEXT.md}
        align="start"
        ids={{
          name: "your-name",
          field: "your-name-field",
          hint: "your-name-hint",
          under: "my-role",
        }}
        style={styles.name}
      />
    </View>
  );
  const overlays = (
    <IconSheet
      open={choosing}
      onClose={() => {
        setFailed(undefined);
        setChoosing(false);
      }}
      title={name}
      subtitle={standing}
      kind="person"
      chosen={face}
      failed={failed}
      onChoose={(next) => {
        setFailed(undefined);
        void store.setMyFace(next).catch((error: unknown) => setFailed(whyNotSaved(error)));
      }}
    />
  );
  return { group, overlays };
}

/** The pen on the face, cut out of the card it stands on, which it reads where it is drawn. */
function Pen() {
  const palette = usePalette();
  const on = useGround();
  return (
    <View style={[styles.badge, { backgroundColor: on.fill, borderColor: on.ground }]}>
      <Icon name="pen" size={11} color={palette.ink2} />
    </View>
  );
}

/** The pen on the face, across its lower right, as far round as a person's circle allows. */
const BADGE = 22;
const BADGE_AT = avatarSide("lg") * 0.5 * (1 + Math.SQRT1_2) - BADGE / 2 - 1;

const styles = StyleSheet.create({
  me: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md + 2,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md + 2,
  },
  badge: {
    position: "absolute",
    left: BADGE_AT,
    top: BADGE_AT,
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.7 },
});
