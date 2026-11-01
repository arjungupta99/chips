/**
 * The context editor (ADR 0135, the mock's scenes 2, 3 and 5): one file of an agent's, or of its
 * harness's own set, in a card under the bar, its Markdown dimmed as it is typed; Save at the
 * bar's right; a capsule at the foot saying what the file is doing. Saved, it goes back by itself
 * a second later, and the page it goes back to flashes the row. Changed in the harness meanwhile,
 * a sheet asks whose words stay. Away, it reads and does not save. Left with words unsaved, it
 * asks once.
 */

import type { ContextRow, EditorWords } from "@chipschat/core";
import { Stack, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { type ReactNode, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { ConflictSheet } from "./ConflictSheet";
import { EditorStatus, SaveButton, saveLook } from "./EditorChrome";
import { markdownSpans } from "./markdown";
import type { ContextOwner } from "./owner";
import { RoleTile } from "./rows";
import { type Base, type Editor, useEditor } from "./useEditor";

export type { EditorWords };

export function ContextEditor({
  store,
  owner,
  row,
  opened,
  readAt,
  away,
  words,
  face,
  onDone,
}: {
  readonly store: Parameters<typeof useEditor>[0]["store"];
  readonly owner: ContextOwner;
  readonly row: ContextRow;
  readonly opened: Base;
  readonly readAt: string;
  readonly away: boolean;
  readonly words: EditorWords;
  /** Whose file, for the sheet that asks: the agent's face, or its harness's mark. */
  readonly face: ReactNode;
  /** Saved, and its second is up. */
  readonly onDone: () => void;
}) {
  const editor = useEditor({
    store,
    owner,
    name: row.name,
    opened,
    awayAtOpen: away,
    onSaved: onDone,
  });
  useAskBeforeLeaving(editor, row.title);
  const look = saveLook(editor);
  return (
    <>
      <Stack.Screen
        options={{
          title: row.title,
          // On iOS the bar's own item, its glass hidden so Save draws its own; elsewhere, the
          // bar's right-hand slot, which the items replace on iOS.
          unstable_headerRightItems: () => [
            {
              type: "custom",
              element: <SaveButton look={look} onPress={editor.save} />,
              hidesSharedBackground: true,
            },
          ],
          headerRight: () => <SaveButton look={look} onPress={editor.save} />,
        }}
      />
      <Body editor={editor} row={row} words={words} readAt={readAt} />
      <ConflictSheet
        editor={editor}
        name={row.name}
        title={row.title}
        harnessName={words.harnessName}
        face={face}
      />
    </>
  );
}

/** Leaving with words not saved asks once: keep editing, or let them go. */
function useAskBeforeLeaving(editor: Editor, title: string) {
  const navigation = useNavigation();
  usePreventRemove(editor.unsaved, ({ data }) => {
    Alert.alert("Leave without saving?", `Your changes to ${title} aren't saved.`, [
      { text: "Keep editing", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => navigation.dispatch(data.action) },
    ]);
  });
}

function Body({
  editor,
  row,
  words,
  readAt,
}: {
  readonly editor: Editor;
  readonly row: ContextRow;
  readonly words: EditorWords;
  readonly readAt: string;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  // Where the foot is with the keys down; with them up, the capsule rides just above them.
  const foot = Math.max(insets.bottom, SPACE.lg);
  // The words go in once the field has its size. Given them before, iOS scrolled the field to
  // show its start in a field of no height, and the first line opened scrolled out of sight
  // (7 October 2026).
  const [sized, setSized] = useState(false);
  // With the keys up the card stops above the capsule, not under it: iOS keeps the caret inside
  // the field, and the field's foot under the capsule hid the line being typed (8 October 2026).
  const [capsule, setCapsule] = useState(0);
  const field = useRef<TextInput>(null);
  const selection = useRef({ start: 0, end: 0 });
  const pressedAt = useRef({ pageX: 0, pageY: 0 });
  // A drag in the words scrolls them, and only a tap brings the keys up (Arjun, 8 October 2026).
  // React Native's field focuses itself on any press that ends inside it, and its scrolling is
  // native, out of that press's sight, so a swipe ended as a press. Once a touch has moved past
  // the slop the card takes it, the field (which lets go: `rejectResponderTermination`) sees no
  // press, and the words go on scrolling as they were.
  const [drags] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => moved(g.dx, g.dy),
      onPanResponderTerminationRequest: () => true,
    }),
  );
  return (
    // A tap off the words puts the keys away (Arjun, 8 October 2026). The field is offered the
    // touch first, so a tap in the words is still its own; what is left is the name above the
    // card, the margins and the capsule. A swipe there leaves them up: a press ends wherever the
    // finger is let go on the page, so one let go past the slop is not taken for a tap.
    <Pressable
      style={styles.fill}
      accessible={false}
      onPressIn={({ nativeEvent: { pageX, pageY } }) => {
        pressedAt.current = { pageX, pageY };
      }}
      onPress={({ nativeEvent: { pageX, pageY } }) => {
        const at = pressedAt.current;
        if (!moved(pageX - at.pageX, pageY - at.pageY)) Keyboard.dismiss();
      }}
      testID="context-page"
    >
      {/* `automaticOffset`: where the view is on the screen, not in its parent. The page starts
          under the bar, and measured from its parent the card stopped the bar's height behind
          the keys, the caret typed out of sight there (8 October 2026). */}
      <KeyboardAvoidingView
        behavior="padding"
        automaticOffset
        keyboardVerticalOffset={SPACE.sm + capsule + SPACE.md - foot}
        style={styles.fill}
      >
        <View style={[styles.fill, { paddingBottom: foot }]}>
          <View style={styles.meta}>
            <RoleTile row={row} side={26} />
            <Text style={[styles.metaName, { color: palette.ink }]} numberOfLines={1}>
              {row.name}
              <Text style={[styles.metaWhose, { color: palette.ink3 }]}>{` · ${words.whose}`}</Text>
            </Text>
          </View>
          <View style={[styles.card, { backgroundColor: palette.surface }]} {...drags.panHandlers}>
            <TextInput
              ref={field}
              rejectResponderTermination={false}
              // The web's field draws no children: it is given the words plainly there.
              {...(Platform.OS === "web" ? { value: editor.text } : {})}
              multiline
              editable={editor.mayType}
              autoCorrect={false}
              spellCheck={false}
              autoCapitalize="sentences"
              onChangeText={editor.change}
              selectionColor={palette.gold}
              accessibilityLabel={`${row.title}, ${row.name}`}
              style={[styles.text, { color: palette.ink2 }]}
              onSelectionChange={(e) => {
                selection.current = e.nativeEvent.selection;
              }}
              onLayout={() => {
                setSized(true);
                // The keys coming up shrink the field, and iOS leaves the caret where it was,
                // behind them. Setting the selection it has scrolls the field to it; focusing
                // again would not, a field that has the focus is not focused again.
                if (field.current?.isFocused()) {
                  field.current.setSelection(selection.current.start, selection.current.end);
                }
              }}
              testID="context-text"
            >
              {Platform.OS === "web" ? null : (
                <Text>
                  {sized
                    ? markdownSpans(editor.text, {
                        mark: palette.ink4,
                        strong: palette.ink,
                        code: palette.blue,
                      })
                    : ""}
                </Text>
              )}
            </TextInput>
          </View>
        </View>
      </KeyboardAvoidingView>
      {/* Over the words at the foot, and up with the keys when they come: the card gives way to
          them, and the capsule keeps its place just above them. Inside the card's own avoiding
          view it stayed under the keys (7 October 2026), as the card did, before that view
          measured where it is on the screen. */}
      <KeyboardStickyView
        pointerEvents="box-none"
        offset={{ closed: 0, opened: foot }}
        style={[styles.foot, { bottom: foot + SPACE.md }]}
        onLayout={(e) => setCapsule(e.nativeEvent.layout.height)}
      >
        <EditorStatus
          editor={editor}
          harnessName={words.harnessName}
          agentName={words.agentName}
          readAt={readAt}
          from={words.from}
        />
      </KeyboardStickyView>
    </Pressable>
  );
}

/** How far a touch moves before it is a drag and not a tap, in points, as iOS counts it. */
const SLOP = 10;

/** Whether a touch that went this far went past the slop: a drag, not a tap. */
function moved(dx: number, dy: number): boolean {
  return Math.abs(dx) > SLOP || Math.abs(dy) > SLOP;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: SPACE.xxl,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.md,
  },
  metaName: { flexShrink: 1, fontSize: TEXT.md, fontWeight: "600" },
  metaWhose: { fontWeight: "400" },
  card: { flex: 1, marginHorizontal: SPACE.lg, borderRadius: 22, overflow: "hidden" },
  text: {
    flex: 1,
    fontSize: 16,
    lineHeight: 26,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 80,
    textAlignVertical: "top",
  },
  foot: { position: "absolute", left: 0, right: 0, alignItems: "center" },
});
