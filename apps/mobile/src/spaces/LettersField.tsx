/**
 * A face's letters, typed (ADR 0139): one or two of them, or an emoji or two, in place of a mark,
 * on the icon sheet of every face — a space's, an agent's, and your own. Arjun, 7 October 2026:
 * "we want to be able to add upto two letters as icons as well (like AA, AB, X...). The letters
 * could be emoji as well".
 *
 * The tile at its start is the face the letters will make, on the ground the sheet has chosen:
 * "Aa" in the quiet tone until something is typed, then the letters themselves, lit, as a chosen
 * mark's cell is. The head of the sheet shows the same face at full size as each letter lands.
 *
 * A face is saved when the typing stops for a moment, or at once on the keyboard's Done, on
 * leaving the field, or on closing the sheet; one save for a word, not one for each letter, since
 * every save of an agent's or a person's face is a line in the log. The field never holds more
 * than a face can (`faceLetters`): a third letter or a space does not go in.
 */

import { FACE_PICKER_WORDS } from "@chipschat/core";
import { faceLetters, lettersScale } from "@chipschat/protocol";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFacePaint } from "../ui/faceTheme";
import { Icon } from "../ui/Icon";
import { usePalette, useScheme } from "../ui/theme";
import { ICON_GROUNDS, RADIUS, SPACE, TEXT } from "../ui/tokens";

/** How long the typing has to stop for before the letters are saved. */
const SETTLE_MS = 600;

/** What the sheet asks of the field: to save what is typed now, or to drop it for a mark. */
export interface LettersHandle {
  /** Save what is typed and not yet saved: the sheet is closing. */
  readonly flush: () => void;
  /** Drop what is typed and not yet saved, and empty the field: a mark was chosen instead. */
  readonly discard: () => void;
}

export function LettersField({
  letters,
  ground,
  inset = SPACE.lg,
  onTyping,
  onLetters,
  ref,
}: {
  /** The letters the face wears now, if it wears letters. */
  readonly letters: string | undefined;
  /** The ground the sheet has chosen, which the tile stands on. */
  readonly ground: number;
  /** How far in from what holds it the field stands: the picker's own inset (ADR 0174). */
  readonly inset?: number;
  /** Each change, before it is saved, so the head can wear it; `undefined` once it is. */
  readonly onTyping: (letters: string | undefined) => void;
  /** The letters to save; empty is none, the face back to its colour. */
  readonly onLetters: (letters: string) => void;
  readonly ref?: Ref<LettersHandle> | undefined;
}) {
  const palette = usePalette();
  const scheme = useScheme();
  const [typed, setTyped] = useState(letters ?? "");
  const [focused, setFocused] = useState(false);
  const field = useRef<TextInput>(null);
  // A save waiting for the typing to stop, and the letters it will save.
  const waiting = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(typed);
  // Leaving the field saves, except when a mark took its place: that blur is the mark's.
  const dropped = useRef(false);

  // What the face wears, said again: a save landing, a refusal taking it back, a mark or the
  // default taking its place. Not while a save is waiting, which is the field's own.
  useEffect(() => {
    if (waiting.current === undefined) {
      setTyped(letters ?? "");
      latest.current = letters ?? "";
    }
  }, [letters]);
  useEffect(() => () => clearTimeout(waiting.current), []);

  const save = () => {
    if (waiting.current === undefined) return;
    clearTimeout(waiting.current);
    waiting.current = undefined;
    onTyping(undefined);
    onLetters(latest.current);
  };

  useImperativeHandle(ref, () => ({
    flush: save,
    discard: () => {
      clearTimeout(waiting.current);
      waiting.current = undefined;
      dropped.current = true;
      latest.current = "";
      setTyped("");
      onTyping(undefined);
      field.current?.blur();
    },
  }));

  const change = (text: string) => {
    const next = faceLetters(text);
    setTyped(next);
    latest.current = next;
    onTyping(next);
    clearTimeout(waiting.current);
    waiting.current = setTimeout(save, SETTLE_MS);
  };

  const shown = typed !== "";
  const faces = useFacePaint();
  const tile = faces.ground(ICON_GROUNDS[ground] ?? ICON_GROUNDS[0]);
  return (
    <View style={[styles.row, { paddingHorizontal: inset }]}>
      <Pressable
        accessibilityLabel={FACE_PICKER_WORDS.letters}
        accessibilityHint={FACE_PICKER_WORDS.lettersHint}
        onPress={() => field.current?.focus()}
        style={[
          styles.box,
          {
            backgroundColor: palette.surface2,
            borderColor: focused ? palette.gold : "transparent",
          },
        ]}
      >
        <View
          style={[styles.tile, { backgroundColor: shown ? tile : palette.surface3 }]}
          testID="letters-tile"
        >
          <Text
            allowFontScaling={false}
            style={[
              styles.tileWords,
              shown
                ? { color: faces.ink, fontSize: TILE_LETTERS * lettersScale(typed) }
                : { color: palette.ink3, fontSize: TILE_LETTERS },
            ]}
          >
            {shown ? typed : "Aa"}
          </Text>
        </View>
        <TextInput
          ref={field}
          accessibilityLabel={FACE_PICKER_WORDS.lettersField}
          testID="face-letters"
          value={typed}
          onChangeText={change}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (dropped.current) dropped.current = false;
            else save();
          }}
          onSubmitEditing={save}
          placeholder={FACE_PICKER_WORDS.lettersPlaceholder}
          placeholderTextColor={palette.ink3}
          autoCapitalize="characters"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          returnKeyType="done"
          keyboardAppearance={scheme}
          // The letters bold, as a face draws them; the placeholder in the quiet weight.
          style={[styles.input, { color: palette.ink, fontWeight: shown ? "600" : "400" }]}
        />
        {shown ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={FACE_PICKER_WORDS.clearLetters}
            hitSlop={SPACE.sm}
            onPress={() => change("")}
            testID="face-letters-clear"
            style={({ pressed }) => [
              styles.clear,
              { backgroundColor: palette.ink4, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Icon name="x" size={11} color={palette.surface2} />
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
}

/** The tile's letters, at the size a 32-point face's initials are. */
const TILE_LETTERS = 13;

const styles = StyleSheet.create({
  row: { flexShrink: 0, paddingBottom: SPACE.md },
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    height: 48,
    paddingLeft: SPACE.sm,
    paddingRight: SPACE.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
  },
  tile: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tileWords: { fontWeight: "700" },
  input: { flex: 1, fontSize: TEXT.body, paddingVertical: 0 },
  clear: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
});
