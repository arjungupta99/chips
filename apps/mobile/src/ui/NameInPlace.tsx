/**
 * A name changed where it stands: a room's agent on its page (ADR 0112), your own on You
 * (ADR 0139), and an agent's on its card in the Agents tab (Arjun, 8 October 2026: "rename agents
 * in place on the Agents tab too"). One way of doing it, so the three behave alike.
 *
 * A tap makes the name a field with the keys up, holding the name as it is called. The keyboard's
 * done saves it and keeps the field until the server answers; a name it turns away stays as typed,
 * with the reason in red under it. A tap anywhere else puts the name back. Under the name, a line
 * about it (an agent's harness, your role); under the field, what the name is for.
 *
 * Nothing under it moves when it opens. The name stands on a line of fixed height, the field's
 * frame stands out round that line rather than pushing it, and the words under both sit on one
 * line height (measured on the simulator for You: identical pixel rows open and closed). Where the
 * words under the field take more lines than the line they replace, as an agent's do beside its
 * face on its card, what is under the whole moves on `GROWS` (the card's to do).
 *
 * A name nobody may change while its changes are locked (an agent's, ADR 0199) wears a small
 * padlock where the pen was, so whoever reads it sees why it will not edit; the two swap with a
 * short fade and scale, and simply swap for Reduce Motion.
 */

import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { useGround } from "./ground";
import { Icon } from "./Icon";
import { usePalette, useScheme } from "./theme";
import { RADIUS, SPACE, TEXT } from "./tokens";
import { useReduceMotion } from "./useReduceMotion";

const NATIVE = Platform.OS !== "web";

/** What tests and the walks find each part by. */
export interface NameInPlaceIds {
  readonly name: string;
  readonly field: string;
  readonly hint: string;
  readonly under?: string | undefined;
  /** The padlock a locked name wears in the pen's place. */
  readonly locked?: string | undefined;
}

export function NameInPlace({
  name,
  start = name,
  may,
  locked = false,
  under,
  hint,
  connected,
  onRename,
  label,
  pressHint,
  placeholder,
  size,
  underSize = TEXT.md,
  align = "center",
  lines = 1,
  ids,
  style,
}: {
  /** The name as it is shown. */
  readonly name: string;
  /** What the field opens on, when it differs from what is shown: a fork's own name. */
  readonly start?: string | undefined;
  /** Whether this person may change it; when not, it is only a heading. */
  readonly may: boolean;
  /** Its changes are locked (ADR 0199): a padlock stands where the pen would. */
  readonly locked?: boolean;
  /** The line under the name: an agent's harness, your role. */
  readonly under: string;
  /** What the name is for, under the field, from what is typed. */
  readonly hint: (draft: string) => string;
  readonly connected: boolean;
  /** Saves it; rejects with the server's reason. */
  readonly onRename: (next: string) => Promise<void>;
  /** The field, said to VoiceOver. */
  readonly label: string;
  /** What a tap on the name does, said to VoiceOver. */
  readonly pressHint: string;
  readonly placeholder: string;
  /** The name's type size. */
  readonly size: number;
  /** The type size of the line under it. */
  readonly underSize?: number;
  /** Centred under a face, or at the start of a column beside one. */
  readonly align?: "center" | "start";
  /** How many lines the name may take while it is not a field. */
  readonly lines?: number;
  readonly ids: NameInPlaceIds;
  /** Where the whole stands: its margins, or its share of a row. */
  readonly style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();
  // The words in the field while the name is one.
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const line = lineFor(size);
  const centred = align === "center";

  const close = () => {
    setDraft(undefined);
    setError(undefined);
  };
  const save = (typed: string) => {
    const next = typed.trim();
    if (busy || !connected) return;
    if (next === "" || next === start) {
      close();
      return;
    }
    setBusy(true);
    setError(undefined);
    onRename(next).then(
      () => {
        setBusy(false);
        close();
      },
      (failure: unknown) => {
        setBusy(false);
        setError(failure instanceof Error ? failure.message : "The server did not take it.");
      },
    );
  };

  return (
    <View style={[styles.block, centred ? styles.centred : styles.atStart, style]}>
      {draft === undefined ? (
        <>
          <Pressable
            accessibilityRole={may ? "button" : "header"}
            accessibilityLabel={spoken(name, locked)}
            accessibilityHint={may ? pressHint : undefined}
            disabled={!may}
            onPress={() => setDraft(start)}
            hitSlop={SPACE.sm}
            testID={ids.name}
            style={({ pressed }) => [
              styles.nameLine,
              { minHeight: line },
              pressed ? styles.pressed : null,
            ]}
          >
            <Text
              style={[styles.name, { fontSize: size, color: palette.ink }]}
              numberOfLines={lines}
            >
              {name}
            </Text>
            <NameMark mark={markOf(may, locked)} lockedId={ids.locked} />
          </Pressable>
          <Text
            style={[
              styles.under,
              { fontSize: underSize, color: palette.ink3 },
              centred ? styles.centredWords : null,
            ]}
            testID={ids.under}
          >
            {under}
          </Text>
        </>
      ) : (
        <NameField
          draft={draft}
          error={error}
          label={label}
          placeholder={placeholder}
          hint={connected ? hint(draft) : NOT_CONNECTED}
          size={size}
          line={line}
          centred={centred}
          ids={ids}
          onType={(typed) => {
            setDraft(typed);
            setError(undefined);
          }}
          onSave={() => save(draft)}
          onLeave={close}
        />
      )}
    </View>
  );
}

/** The name as VoiceOver says it: with why it will not edit, while its changes are locked. */
function spoken(name: string, locked: boolean): string {
  return locked ? `${name}, changes locked` : name;
}

/** Which mark stands beside the name: the padlock while locked, the pen while it may change. */
function markOf(may: boolean, locked: boolean): "pen" | "lock" | undefined {
  if (locked) return "lock";
  return may ? "pen" : undefined;
}

/**
 * What stands beside the name: the pen while it may be changed, a padlock while its changes are
 * locked, or nothing. One coming in for the other fades and grows into place.
 */
function NameMark({
  mark,
  lockedId,
}: {
  readonly mark: "pen" | "lock" | undefined;
  readonly lockedId: string | undefined;
}) {
  const palette = usePalette();
  const less = useReduceMotion();
  const shown = useRef(new Animated.Value(1)).current;
  // The mark drawn last, so the first frame's is simply there and only a change moves.
  const was = useRef(mark);
  useEffect(() => {
    if (was.current === mark) return;
    was.current = mark;
    if (less) return;
    shown.setValue(0);
    Animated.timing(shown, { toValue: 1, duration: 220, useNativeDriver: NATIVE }).start();
  }, [mark, less, shown]);
  if (mark === undefined) return null;
  const scale = shown.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <Animated.View
      style={{ opacity: shown, transform: [{ scale }] }}
      testID={mark === "lock" ? lockedId : undefined}
    >
      {mark === "pen" ? (
        <Icon name="pen" size={16} color={palette.ink4} />
      ) : (
        <Icon name="lock" size={14} color={palette.ink3} />
      )}
    </Animated.View>
  );
}

/** The name as a field, where it stood, and what it is for (or why it was refused) under it. */
function NameField({
  draft,
  error,
  label,
  placeholder,
  hint,
  size,
  line,
  centred,
  ids,
  onType,
  onSave,
  onLeave,
}: {
  readonly draft: string;
  readonly error: string | undefined;
  readonly label: string;
  readonly placeholder: string;
  readonly hint: string;
  readonly size: number;
  readonly line: number;
  readonly centred: boolean;
  readonly ids: NameInPlaceIds;
  readonly onType: (typed: string) => void;
  readonly onSave: () => void;
  readonly onLeave: () => void;
}) {
  const palette = usePalette();
  const on = useGround();
  const scheme = useScheme();
  return (
    <>
      <TextInput
        accessibilityLabel={label}
        testID={ids.field}
        value={draft}
        onChangeText={onType}
        onSubmitEditing={onSave}
        onBlur={onLeave}
        // Done keeps the keys up until the server has answered, for a refusal to be read.
        submitBehavior="submit"
        autoFocus
        returnKeyType="done"
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={120}
        keyboardAppearance={scheme}
        placeholder={placeholder}
        placeholderTextColor={palette.ink3}
        style={[
          styles.name,
          styles.field,
          centred ? styles.fieldCentred : styles.fieldAtStart,
          {
            fontSize: size,
            height: line + 2 * EDGE,
            color: palette.ink,
            backgroundColor: on.fill,
            borderColor: palette.blue,
          },
        ]}
      />
      <Text
        style={[
          styles.hint,
          centred ? styles.centredWords : null,
          { color: error === undefined ? palette.ink3 : palette.red },
        ]}
        testID={ids.hint}
      >
        {error ?? hint}
      </Text>
    </>
  );
}

const NOT_CONNECTED = "Not connected to the server, so a new name can't be saved yet.";

/** The line a name of this size stands on: 30 for You's 24. */
function lineFor(size: number): number {
  return Math.round(size * 1.25);
}

/** How far the field's frame stands out round the name's line: its padding and its border. */
const BORDER = 1.5;
const EDGE = SPACE.xs + BORDER;
const INSET = SPACE.sm;
/** The line under the name, and the hint's lines in its place. */
const UNDER_LINE = 20;

const styles = StyleSheet.create({
  block: { gap: 2 },
  centred: { alignSelf: "stretch", alignItems: "center" },
  atStart: { alignItems: "flex-start" },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" },
  name: { fontWeight: "700", flexShrink: 1 },
  under: { lineHeight: UNDER_LINE },
  centredWords: { textAlign: "center" },
  // The frame stands out over the line above and below, and is given back, so neither moves.
  field: {
    alignSelf: "stretch",
    flexShrink: 0,
    marginVertical: -EDGE,
    paddingHorizontal: INSET,
    paddingVertical: 0,
    borderRadius: RADIUS.md,
    borderWidth: BORDER,
  },
  fieldCentred: { textAlign: "center", marginHorizontal: SPACE.xl },
  // At the start of a column the frame stands out to the left, so the words stay put, and ends
  // where the column does, in line with what is under it.
  fieldAtStart: { textAlign: "left", marginLeft: -(INSET + BORDER) },
  // Clear of the frame, which stands out over the top of this line; as much given back under it.
  hint: { fontSize: TEXT.sm, lineHeight: UNDER_LINE, marginTop: EDGE, marginBottom: -EDGE },
  pressed: { opacity: 0.7 },
});
