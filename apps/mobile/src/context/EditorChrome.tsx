/**
 * The editor's two pieces of chrome (ADR 0135), flat as every control is and moving instead: Save
 * at the bar's right — glass and grey until there is something to save, gold when there is, the
 * chip's running pins while it saves, a green tick once the harness has it — and the status
 * capsule at the foot, which says in a line what the file is doing.
 */

import { type EditorState, editWords } from "@chipschat/core";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { clockTime } from "../spaces/when";
import { Arrive } from "../ui/Arrive";
import { ON_GOLD } from "../ui/Button";
import { ChipPulse } from "../ui/ChipPulse";
import { Capsule } from "../ui/Glass";
import { Icon } from "../ui/Icon";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import type { Editor } from "./useEditor";

export type SaveLook = "off" | "on" | "busy" | "done";

export function saveLook(editor: Editor): SaveLook {
  if (editor.state === "waiting") return "busy";
  if (editor.state === "saved") return "done";
  return editor.maySave ? "on" : "off";
}

const SIDE = 44;

export function SaveButton({
  look,
  onPress,
}: {
  readonly look: SaveLook;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  if (look === "busy" || look === "done") {
    return (
      <View style={styles.slot} testID={`context-save-${look}`}>
        {look === "busy" ? (
          <Arrive key="busy">
            <Capsule style={styles.round}>
              <ChipPulse gold={palette.gold} ink={palette.ink3} lit={palette.ink} />
            </Capsule>
          </Arrive>
        ) : (
          <Arrive key="done" from={0.4} bounce={5}>
            <View style={[styles.round, { backgroundColor: palette.green }]}>
              <Icon name="check" size={20} color="#ffffff" />
            </View>
          </Arrive>
        )}
      </View>
    );
  }
  const on = look === "on";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Save"
      accessibilityState={{ disabled: !on }}
      disabled={!on}
      onPress={onPress}
      hitSlop={SPACE.sm}
      testID="context-save"
      style={({ pressed }) => [styles.slot, pressed ? styles.pressed : null]}
    >
      {on ? (
        <Arrive key="on" from={0.85}>
          <View style={[styles.pill, { backgroundColor: palette.gold }]}>
            <Text style={[styles.word, { color: ON_GOLD }]}>Save</Text>
          </View>
        </Arrive>
      ) : (
        <Capsule style={styles.pill}>
          <Text style={[styles.word, { color: palette.ink4 }]}>Save</Text>
        </Capsule>
      )}
    </Pressable>
  );
}

/** The dot, the pins or the tick before the status line's words. */
function StatusMark({ state }: { readonly state: EditorState }) {
  const palette = usePalette();
  if (state === "waiting") {
    return <ChipPulse gold={palette.gold} ink={palette.ink3} lit={palette.ink} />;
  }
  if (state === "saved") return <Icon name="check" size={17} color={palette.green} />;
  const dots: Partial<Record<EditorState, string>> = {
    edited: palette.amber,
    new: palette.gold,
    theirs: palette.blue,
    changed: palette.amber,
    failed: palette.red,
    missed: palette.red,
  };
  return <View style={[styles.dot, { backgroundColor: dots[state] ?? palette.ink4 }]} />;
}

export function EditorStatus({
  editor,
  harnessName,
  agentName,
  readAt,
  from,
}: {
  readonly editor: Editor;
  readonly harnessName: string;
  /** Whose the file is; absent for the harness's own set. */
  readonly agentName: string | undefined;
  readonly readAt: string;
  /** For giving an agent its own: what it starts as. */
  readonly from?: string | undefined;
}) {
  const palette = usePalette();
  const { state } = editor;
  const at = state === "theirs" ? (editor.theirsAt ?? readAt) : readAt;
  // Away with typing still on: it went away at a save, and the words wait for it to be back.
  const words = editWords(state, harnessName, agentName, {
    readAt: clockTime(at),
    from,
    atSave: editor.mayType,
  });
  const ink = state === "saved" ? palette.greenInk : palette.ink2;
  return (
    <Capsule style={styles.status} testID="context-status">
      <StatusMark state={state} />
      <View style={styles.statusLine}>
        <Arrive key={state} from={1} rise={4} bounce={9}>
          <Text
            numberOfLines={2}
            style={[styles.statusWords, { color: ink }]}
            testID="context-status-words"
          >
            {editor.message === undefined || state !== "failed"
              ? words
              : `${words} ${editor.message}`}
          </Text>
        </Arrive>
      </View>
    </Capsule>
  );
}

const styles = StyleSheet.create({
  slot: { minWidth: 76, height: SIDE, alignItems: "flex-end", justifyContent: "center" },
  pressed: { transform: [{ scale: 0.95 }] },
  pill: {
    height: SIDE,
    minWidth: 76,
    paddingHorizontal: 18,
    borderRadius: SIDE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  word: { fontSize: TEXT.body, fontWeight: "600" },
  round: {
    width: SIDE,
    height: SIDE,
    borderRadius: SIDE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  status: {
    minHeight: 40,
    maxWidth: "92%",
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingLeft: SPACE.md,
    paddingRight: SPACE.lg,
    paddingVertical: SPACE.sm,
    borderRadius: 20,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusLine: { flexShrink: 1 },
  statusWords: { fontSize: TEXT.md - 1, fontWeight: "500" },
});
