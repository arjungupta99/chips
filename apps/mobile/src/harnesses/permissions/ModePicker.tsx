/**
 * The Mode picker on a harness's settings page (ADR 0300, addendum of 19 November 2026), as the
 * plan "Harness first, Chips's rules if you want them" drew it: the modes the harness offers, a row
 * each in its own words, the one in force ticked, and under it when it goes back. Tapping a mode
 * other than the one it starts in opens For how long under the rows (1 hour, 8 hours, Until
 * tomorrow, Keep it), then Cancel or "Use Auto", red for a mode that never asks. Tapping the one it
 * starts in puts it back at once. A member sees the rows without the choices. The web's
 * (`apps/web/src/app/permissions/ModePicker.tsx`) in the phone's terms; the words are core's.
 */

import {
  CANCEL_WORDS,
  MODE_HEADING,
  MODE_LENGTH_HEADING,
  MODE_LENGTHS,
  type ModeChoice,
  type ModePicker as ModePickerView,
  modeConfirmWords,
  modeLengthWords,
  type SnoozeLength,
  type Store,
  snoozeUntil,
} from "@chipschat/core";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Group, GroupFoot, GroupHeading, MARK } from "../../ui/Group";
import * as feel from "../../ui/haptics";
import { usePalette } from "../../ui/theme";
import { SPACE, TEXT } from "../../ui/tokens";
import { useFold } from "./StopLengths";

export function ModePicker({
  picker,
  harnessId,
  store,
}: {
  readonly picker: ModePickerView;
  readonly harnessId: string;
  readonly store: Store;
}) {
  const palette = usePalette();
  const fold = useFold();
  const [choosing, setChoosing] = useState<ModeChoice | undefined>(undefined);
  const [length, setLength] = useState<SnoozeLength>("1h");
  const ticked = choosing?.id ?? picker.current.id;

  const pick = (choice: ModeChoice) => {
    if (!picker.may) return;
    feel.tick();
    fold();
    if (choice.base) {
      setChoosing(undefined);
      if (!picker.current.base) store.setMode(harnessId, null);
      return;
    }
    setLength("1h");
    setChoosing(choice);
  };
  const use = () => {
    if (choosing === undefined) return;
    feel.tap();
    fold();
    store.setMode(harnessId, {
      id: choosing.id,
      name: choosing.name,
      backTo: picker.base.name,
      everything: choosing.everything,
      until: snoozeUntil(length),
    });
    setChoosing(undefined);
  };

  return (
    <View>
      <GroupHeading>{MODE_HEADING}</GroupHeading>
      <Group inset={ROW_INSET} testID="perms-modes">
        {picker.choices.map((choice) => (
          <ModeRow
            key={choice.id}
            choice={choice}
            on={ticked === choice.id}
            may={picker.may}
            back={choosing === undefined && !choice.base ? picker.back : undefined}
            onPress={() => pick(choice)}
          />
        ))}
        {choosing === undefined ? null : (
          <View style={styles.long} testID="perms-mode-long">
            <Text style={[styles.label, { color: palette.ink3 }]}>
              {MODE_LENGTH_HEADING.toUpperCase()}
            </Text>
            <View style={styles.chips} accessibilityLabel={MODE_LENGTH_HEADING}>
              {MODE_LENGTHS.map((each) => (
                <LengthChip
                  key={each}
                  length={each}
                  on={length === each}
                  onPress={() => {
                    feel.tick();
                    setLength(each);
                  }}
                />
              ))}
            </View>
            <View style={styles.acts}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  feel.tick();
                  fold();
                  setChoosing(undefined);
                }}
                style={({ pressed }) => [styles.cancel, { opacity: pressed ? 0.6 : 1 }]}
                testID="perms-mode-cancel"
              >
                <Text style={[styles.cancelWords, { color: palette.ink2 }]}>{CANCEL_WORDS}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={use}
                style={({ pressed }) => [
                  styles.use,
                  {
                    backgroundColor: choosing.everything ? palette.red : palette.accent,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
                testID="perms-mode-use"
              >
                <Text style={styles.useWords}>{modeConfirmWords(choosing.name)}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </Group>
      {picker.differs === undefined ? null : (
        <GroupFoot tone={palette.amberInk} testID="perms-mode-differs">
          {picker.differs}
        </GroupFoot>
      )}
      <GroupFoot testID="perms-mode-foot">{picker.foot}</GroupFoot>
    </View>
  );
}

/** One mode, a radio row in its own words, and when it goes back while it is in force. */
function ModeRow({
  choice,
  on,
  may,
  back,
  onPress,
}: {
  readonly choice: ModeChoice;
  readonly on: boolean;
  readonly may: boolean;
  readonly back: string | undefined;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  const lit = choice.everything ? palette.red : palette.accent;
  const ring = on ? lit : palette.ink4;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled: !may }}
      accessibilityLabel={
        choice.words === undefined ? choice.name : `${choice.name}. ${choice.words}`
      }
      disabled={!may}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? palette.surface2 : palette.surface },
      ]}
      testID={`perms-mode-${choice.id}`}
    >
      <View style={styles.dotPlace}>
        <View style={[styles.dot, { borderColor: ring, opacity: may ? 1 : 0.55 }]}>
          {on ? (
            <View style={[styles.dotIn, { backgroundColor: ring }]} testID="perms-mode-on" />
          ) : null}
        </View>
      </View>
      <View style={styles.words}>
        <Text style={[styles.name, { color: palette.ink }]}>{choice.name}</Text>
        {choice.words === undefined ? null : (
          <Text style={[styles.sub, { color: palette.ink3 }]}>{choice.words}</Text>
        )}
        {on && back !== undefined ? (
          <Text style={[styles.back, { color: palette.accent }]} testID="perms-mode-back">
            {back}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** One length under For how long. */
function LengthChip({
  length,
  on,
  onPress,
}: {
  readonly length: SnoozeLength;
  readonly on: boolean;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  const rest = (pressed: boolean) => (pressed ? palette.surface2 : palette.surface);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${MODE_LENGTH_HEADING}: ${modeLengthWords(length)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: on ? palette.accent : palette.line2,
          backgroundColor: on ? palette.accent : rest(pressed),
        },
      ]}
      testID={`perms-mode-len-${length}`}
    >
      <Text style={[styles.chipWords, { color: on ? "#ffffff" : palette.ink }]}>
        {modeLengthWords(length)}
      </Text>
    </Pressable>
  );
}

/** The dot stands in a mark's place, so the words start where a marked row's do. */
const ROW_INSET = SPACE.lg + MARK + SPACE.md;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACE.md,
    minHeight: 52,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm + 4,
  },
  dotPlace: { width: MARK, alignItems: "center", paddingTop: 2 },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dotIn: { width: 9, height: 9, borderRadius: 5 },
  words: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: TEXT.body },
  sub: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4 },
  back: { fontSize: TEXT.sm, fontWeight: "600", marginTop: 3 },
  long: {
    gap: SPACE.sm,
    paddingLeft: ROW_INSET,
    paddingRight: SPACE.lg,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.md,
  },
  label: { fontSize: TEXT.xs, fontWeight: "600", letterSpacing: 0.6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.xs },
  chip: {
    minHeight: 36,
    paddingHorizontal: SPACE.md,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chipWords: { fontSize: TEXT.sm, fontWeight: "600" },
  acts: { flexDirection: "row", justifyContent: "flex-end", gap: SPACE.xs },
  cancel: { paddingHorizontal: SPACE.md, paddingVertical: 9 },
  cancelWords: { fontSize: TEXT.md, fontWeight: "600" },
  use: { borderRadius: 999, paddingHorizontal: SPACE.lg, paddingVertical: 9 },
  useWords: { color: "#ffffff", fontSize: TEXT.md, fontWeight: "700" },
});
