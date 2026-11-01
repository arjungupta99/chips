/**
 * A box to search from: the mark, the words, and a way to clear them.
 *
 * Not a `Field`. A field is a labelled box on a form, and a label above a search box costs a
 * line of the screen to say what the mark and the placeholder already say. This is the shape a
 * phone uses for search everywhere else — one rounded row, the mark inside it.
 *
 * The Search tab's field (ADR 0132): it stands where the tab's name would, the Search key on the
 * keyboard says the search is the one meant (`onSubmit`), and with `onCancel` a Cancel comes in
 * beside it while it is in use — while it has the keyboard, or words in it — which empties it and
 * puts the keyboard away, as a phone's own search does.
 *
 * Cancel comes in as a phone's own does, the box narrowing as it rides in (`SearchCancel`).
 */

import { type Ref, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon } from "./Icon";
import { SearchCancel } from "./SearchCancel";
import { usePalette } from "./theme";
import { RADIUS, SPACE, TEXT } from "./tokens";

export function Search({
  label,
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  inputRef,
  testID,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /**
   * The keyboard's Search key, with the words in the field as it was pressed: a key typed just
   * before it may not have reached `value` yet.
   */
  readonly onSubmit?: ((text: string) => void) | undefined;
  /** Given, a Cancel stands beside the box while it is in use, and this is what it does after. */
  readonly onCancel?: (() => void) | undefined;
  readonly placeholder?: string | undefined;
  /** The field itself, for a screen that puts the keyboard up or away. */
  readonly inputRef?: Ref<TextInput> | undefined;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  const [focused, setFocused] = useState(false);
  const cancelling = onCancel !== undefined && (focused || value !== "");
  return (
    <View style={styles.row}>
      <View style={[styles.box, { backgroundColor: palette.surface2 }]}>
        <Icon name="search" size={17} color={palette.ink3} />
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          testID={testID}
          value={value}
          onChangeText={onChange}
          // On its side, the results stay in sight over the keys (Android's full-screen field).
          disableFullscreenUI
          onSubmitEditing={(event) => onSubmit?.(event.nativeEvent.text)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={palette.ink3}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          // The Search key puts the keyboard away, for the results to be read, as a phone's does.
          submitBehavior="blurAndSubmit"
          style={[styles.input, { color: palette.ink }]}
        />
        {value === "" ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear the search"
            hitSlop={SPACE.sm}
            onPress={() => onChange("")}
          >
            <Text style={[styles.clear, { color: palette.ink3 }]}>✕</Text>
          </Pressable>
        )}
      </View>
      {onCancel === undefined ? null : (
        <SearchCancel
          shown={cancelling}
          onPress={() => {
            onChange("");
            onCancel();
          }}
          testID={testID === undefined ? undefined : `${testID}-cancel`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  box: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    height: 40,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.md,
  },
  input: { flex: 1, fontSize: TEXT.md, padding: 0 },
  clear: { fontSize: TEXT.md },
});
