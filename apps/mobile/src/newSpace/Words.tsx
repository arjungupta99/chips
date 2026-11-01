/**
 * What the new-space window says and takes: its name, who will be asked, and the field. The
 * window (`Window.tsx`) moves these about; nothing here moves but a face as it is picked, so a test
 * can render it as it is.
 */

import { NEW_SPACE_NAMED, type Participant } from "@chipschat/core";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Path, Svg } from "react-native-svg";
import { usePalette, useScheme } from "../ui/theme";
import { LEADING_PHONE, TEXT } from "../ui/tokens";
import { Pick } from "./Pick";

/** The words' size and leading, the room's. */
const LINE = Math.round(TEXT.body * LEADING_PHONE);
/** Four lines, and the field scrolls rather than grows. */
const FIELD_MAX = LINE * 4;
const SEND = 32;
/** Between the card's edge and what it holds; the faces' row runs out to the edge through it. */
export const CARD_INSET = 16;

/** Dark on the gold, whatever the appearance, because the gold does not change. */
export const INK = "#231a00";

export interface HeadProps {
  readonly harnesses: readonly Participant[];
  /** Who will be in the room: the first is asked for it, and the rest are added beside it. */
  readonly picked: readonly Participant[];
  /** Empty is picked: nobody is asked, and the room is made by its name (ADR 0148). */
  readonly empty: boolean;
  readonly onChoose: (harnessId: string) => void;
  /** The lead's name tapped, with several picked: the next one picked leads. */
  readonly onLead?: (() => void) | undefined;
  readonly onClose: () => void;
}

/**
 * "New space", the ×, and who joins: every agent that takes new spaces, one face each, even when
 * there is only one, so the window always says who will be in the room (`Pick.tsx`). Several make
 * a room of agents that all hear the first message (ADR 0081: Everyone, before your first
 * message), and none says anything before it (ADR 0149); the first picked leads, and a tap on its
 * name hands the lead on. Empty leads the row (ADR 0148).
 */
export function Head({ harnesses, picked, empty, onChoose, onLead, onClose }: HeadProps) {
  const palette = usePalette();
  return (
    <View>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
          New space
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          hitSlop={8}
          style={[styles.close, { backgroundColor: palette.surface2 }]}
          testID="new-space-close"
        >
          <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
            <Path
              d="M5 5l14 14M19 5L5 19"
              stroke={palette.ink3}
              strokeWidth={3.4}
              strokeLinecap="round"
            />
          </Svg>
        </Pressable>
      </View>
      <Pick
        harnesses={harnesses}
        picked={picked}
        empty={{ on: empty }}
        onChoose={onChoose}
        onLead={onLead}
        inset={CARD_INSET}
      />
    </View>
  );
}

export interface FieldProps {
  readonly draft: string;
  readonly onDraft: (text: string) => void;
  /** Nobody to ask: nothing is made, unless the room is to be empty. */
  readonly asked: Participant | undefined;
  /** Empty is picked: the room is made with nobody asked (ADR 0148). */
  readonly empty: boolean;
  readonly onSend: (text: string) => void;
  readonly input: React.RefObject<TextInput | null>;
}

/**
 * The field: the room's name, whoever is picked (ADR 0149), sent on Enter or the arrow. It grows to
 * four lines and then scrolls, for a long name typed on a narrow phone.
 */
export function Field({ draft, onDraft, asked, empty, onSend, input }: FieldProps) {
  const palette = usePalette();
  const scheme = useScheme();
  // The words' height, from a twin that is laid out and never seen: a multiline field on Fabric
  // cannot measure itself (`spaces/Composer.tsx`).
  const [measured, setMeasured] = useState(LINE);
  const ready = draft.trim() !== "" && (asked !== undefined || empty);
  const asks = NEW_SPACE_NAMED;
  const send = () => {
    if (ready) onSend(draft);
  };
  return (
    <View style={[styles.field, { backgroundColor: palette.surface2 }]}>
      <Text
        style={[styles.input, styles.twin]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={(event) => setMeasured(event.nativeEvent.layout.height)}
      >
        {draft === "" ? " " : draft.endsWith("\n") ? `${draft} ` : draft}
      </Text>
      <TextInput
        ref={input}
        accessibilityLabel={asks}
        testID="new-space-field"
        value={draft}
        onChangeText={onDraft}
        // On its side, the window stays in sight over the keys (Android's full-screen field).
        disableFullscreenUI
        placeholder={asks}
        placeholderTextColor={palette.ink3}
        selectionColor={palette.gold}
        keyboardAppearance={scheme}
        multiline
        submitBehavior="submit"
        returnKeyType="send"
        onSubmitEditing={send}
        onKeyPress={(event) => {
          // The web's field is a text area, where Enter is a new line unless it is told otherwise.
          if (Platform.OS !== "web") return;
          const key = event.nativeEvent as { key: string; shiftKey?: boolean };
          if (key.key !== "Enter" || key.shiftKey === true) return;
          event.preventDefault();
          send();
        }}
        style={[
          styles.input,
          { color: palette.ink, height: Math.min(FIELD_MAX, Math.max(LINE, measured)) },
        ]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send"
        accessibilityState={{ disabled: !ready }}
        disabled={!ready}
        onPress={send}
        style={[styles.send, { backgroundColor: ready ? palette.gold : palette.ink4 }]}
        testID="new-space-send"
      >
        <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
          <Path
            d="M12 19V5M5.5 11.5L12 5l6.5 6.5"
            stroke={ready ? INK : palette.bg}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { flex: 1, fontSize: TEXT.xl, fontWeight: "700", letterSpacing: -0.3, lineHeight: 25 },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  field: {
    marginTop: 12,
    borderRadius: 23,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 16,
    paddingRight: 52,
    minHeight: 46,
    justifyContent: "center",
  },
  input: { padding: 0, fontSize: TEXT.body, lineHeight: LINE },
  twin: { position: "absolute", top: 12, left: 16, right: 52, opacity: 0 },
  send: {
    position: "absolute",
    right: 7,
    bottom: 7,
    width: SEND,
    height: SEND,
    borderRadius: SEND / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
