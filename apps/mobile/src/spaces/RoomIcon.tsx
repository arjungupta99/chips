/**
 * The Icon page of a space's sheet (ADR 0174, Arjun's A): the room's face chosen where its name is
 * changed, rather than only from a long press on its row on Spaces that nothing points to. Arjun,
 * 15 October 2026: "I want to be able to edit the Space icon / color and Agent icon / color from
 * their detail pages. Make a special section in the sheets".
 *
 * Its Icon row, under the title on the sheet's first page, says what the room wears; this page is
 * the same picker the long press opens (`FacePicker`), under a way back. The face is your own
 * setting (21 September 2026), so a teammate still sees theirs, and anybody in the room has the
 * row, a guest too. Each tap saves at once, as it does there, and a refusal is said in the
 * picker's banner.
 */

import type { SpaceIcon } from "@chipschat/protocol";
import type { Ref } from "react";
import { StyleSheet, View } from "react-native";
import type { AvatarKind } from "../ui/Avatar";
import { PageBack } from "../ui/PageBack";
import { SPACE } from "../ui/tokens";
import { FacePicker, type FacePickerHandle } from "./FacePicker";

export function IconPage({
  title,
  hint,
  kind,
  chosen,
  failed,
  onChoose,
  onBack,
  picker,
}: {
  /** The room's name, and what its first page says under it: the preview is its row. */
  readonly title: string;
  readonly hint: string;
  readonly kind: AvatarKind;
  readonly chosen: SpaceIcon | undefined;
  readonly failed: string | undefined;
  readonly onChoose: (icon: SpaceIcon | undefined) => void;
  readonly onBack: () => void;
  /** Held by the sheet, which saves letters typed and not yet saved when it closes. */
  readonly picker: Ref<FacePickerHandle>;
}) {
  return (
    <View style={styles.page}>
      <PageBack title="Icon" onBack={onBack} testID="room-sheet-icon-back" style={styles.back} />
      {/* The head is the picker's second line, under the way back: nothing to keep clear of. */}
      <View style={styles.picker}>
        <FacePicker
          ref={picker}
          title={title}
          subtitle={hint}
          kind={kind}
          chosen={chosen}
          onChoose={onChoose}
          failed={failed}
          inset={0}
          headRoom={0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A page of the room sheet: its grid gives, scrolling in what the sheet leaves it.
  page: { flexShrink: 1, minHeight: 0 },
  back: { marginBottom: SPACE.md },
  picker: { flexShrink: 1, minHeight: 0 },
});
