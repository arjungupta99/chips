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
 * The icon sheet stands beside You's scroll, not in it (`You.tsx`). Beside the list on an iPad the
 * same picker is a page there instead, which saves letters typed and not yet saved as it goes, as
 * the sheet does as it closes.
 */

import { FACE_PICKER_WORDS, type Store, whyFaceNotSaved } from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { useLayoutEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { FacePicker, type FacePickerHandle } from "../spaces/FacePicker";
import { IconSheet } from "../spaces/IconSheet";
import { Avatar, avatarSide } from "../ui/Avatar";
import { useGround } from "../ui/ground";
import { Icon } from "../ui/Icon";
import { NameInPlace } from "../ui/NameInPlace";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { SheetPage, useSheetPage } from "./pages";
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
  // Your face, which on an iPad the sheet opens beside.
  const self = useRef<View>(null);
  // Why the last pick did not stick: the store puts the old face back and this says why.
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const palette = usePalette();
  const page = useSheetPage("face", () => setChoosing(true));
  const choose = (next: SpaceIcon | undefined) => {
    setFailed(undefined);
    void store.setMyFace(next).catch((error: unknown) => setFailed(whyFaceNotSaved(error)));
  };
  const group = (
    // Chosen while its page is open beside the list, as a row is.
    <View
      style={[styles.me, page.selected === true ? { backgroundColor: palette.surface3 } : null]}
      testID="profile"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={FACE_PICKER_WORDS.yourFace}
        accessibilityHint={FACE_PICKER_WORDS.yourFaceHint}
        accessibilityState={page.selected === undefined ? undefined : { selected: page.selected }}
        onPress={page.onPress}
        ref={self}
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
      from={self}
      onClose={() => {
        setFailed(undefined);
        setChoosing(false);
      }}
      title={name}
      subtitle={standing}
      kind="person"
      chosen={face}
      failed={failed}
      onChoose={choose}
    />
  );
  const pages = {
    face: (
      <FacePage
        name={name}
        standing={standing}
        face={face}
        failed={failed}
        onChoose={choose}
        onGone={() => setFailed(undefined)}
      />
    ),
  };
  return { group, overlays, pages };
}

/**
 * Your face's picker as a page beside the list. The picker scrolls its own marks under the colours,
 * so the page lays it out as the sheet does rather than in a scroll of its own; the head names you
 * where the sheet's did, and the pane's bar says what the page is for.
 */
function FacePage({
  name,
  standing,
  face,
  failed,
  onChoose,
  onGone,
}: {
  readonly name: string;
  readonly standing: string;
  readonly face: SpaceIcon | undefined;
  readonly failed: string | undefined;
  readonly onChoose: (face: SpaceIcon | undefined) => void;
  /** The page has gone: why a pick did not stick is not said the next time. */
  readonly onGone: () => void;
}) {
  const picker = useRef<FacePickerHandle>(null);
  const gone = useRef(onGone);
  gone.current = onGone;
  // Letters typed and not yet saved are saved as the page goes, another row chosen, as the sheet
  // saves them as it closes. As a layout effect's, while the picker's handle is still held: by the
  // time an effect's own clean-up runs, the picker has let it go.
  useLayoutEffect(
    () => () => {
      picker.current?.flush();
      gone.current();
    },
    [],
  );
  return (
    <SheetPage title={FACE_PICKER_WORDS.yourFace} scrolls={false} testID="face-page">
      <FacePicker
        ref={picker}
        title={name}
        subtitle={standing}
        kind="person"
        chosen={face}
        failed={failed}
        onChoose={onChoose}
        inset={SPACE.lg}
        headRoom={SPACE.lg}
      />
    </SheetPage>
  );
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
