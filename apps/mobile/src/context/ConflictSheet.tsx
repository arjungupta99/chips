/**
 * The sheet that asks whose words stay (ADR 0135, the mock's scene 3): the file changed in its
 * harness after the person opened it, so Save stopped. It shows what each side changed since then,
 * line by line, and offers **Keep mine** (save the person's words over the harness's) and **Use
 * theirs** (put the harness's in the editor, to read before anything is saved). Put away without
 * either, the person's words stay in the editor, to save over the harness's when they choose.
 */

import { conflictOf, type LineChanges } from "@chipschat/core";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { clockTime } from "../spaces/when";
import { ON_GOLD } from "../ui/Button";
import { useGround } from "../ui/ground";
import { CLOSE_ROOM, Sheet } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import type { Editor } from "./useEditor";

/** Each side's lines, at most this many: the sheet is a glance, the editor has the whole. */
const LINES = 6;

function Side({ who, changes }: { readonly who: string; readonly changes: LineChanges }) {
  const palette = usePalette();
  const lines = [
    ...changes.added.map((line) => ({ line, added: true })),
    ...changes.removed.map((line) => ({ line, added: false })),
  ];
  const more = lines.length - LINES;
  return (
    <View>
      <Text style={[styles.who, { color: palette.ink3 }]}>{who}</Text>
      {lines.length === 0 ? (
        <Text style={[styles.line, { color: palette.ink3 }]}>Nothing but spacing.</Text>
      ) : null}
      {lines.slice(0, LINES).map(({ line, added }, index) => (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: a line may repeat; its place is its identity.
          key={index}
          numberOfLines={2}
          style={[
            styles.line,
            added
              ? { backgroundColor: palette.greenSoft, color: palette.greenInk }
              : { backgroundColor: palette.redSoft, color: palette.redInk },
          ]}
        >
          {`${added ? "+" : "−"}  ${line}`}
        </Text>
      ))}
      {more > 0 ? (
        <Text style={[styles.line, { color: palette.ink3 }]}>{`and ${more} more`}</Text>
      ) : null}
    </View>
  );
}

export function ConflictSheet({
  editor,
  name,
  title,
  harnessName,
  face,
}: {
  readonly editor: Editor;
  readonly name: string;
  readonly title: string;
  readonly harnessName: string;
  /** Whose file: the agent's face, or its harness's mark. */
  readonly face: ReactNode;
}) {
  const palette = usePalette();
  const on = useGround();
  const theirs = editor.theirs;
  const sides =
    theirs === undefined ? undefined : conflictOf(editor.base.text, theirs.text, editor.text);
  return (
    <Sheet open={theirs !== undefined} onClose={editor.later} testID="context-conflict">
      <View style={styles.head}>
        {face}
        <Text style={[styles.caps, { color: palette.ink3 }]}>
          {`${name}${theirs === undefined ? "" : ` · ${clockTime(theirs.readAt)}`}`}
        </Text>
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
        {`Changed in ${harnessName} while you were editing`}
      </Text>
      <Text style={[styles.body, { color: palette.ink2 }]}>
        {`${title} was changed in ${harnessName} after you opened it. Nothing you typed is lost.`}
      </Text>
      {sides === undefined ? null : (
        <View style={[styles.diff, { backgroundColor: palette.surface }]}>
          <Side who={`In ${harnessName}`} changes={sides.theirs} />
          <Side who="You" changes={sides.mine} />
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={editor.keepMine}
        testID="context-keep-mine"
        style={({ pressed }) => [
          styles.go,
          { backgroundColor: palette.gold },
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={[styles.goWord, { color: ON_GOLD }]}>Keep mine</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={editor.useTheirs}
        testID="context-use-theirs"
        style={({ pressed }) => [
          styles.go,
          styles.second,
          { backgroundColor: on.fill },
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={[styles.goWord, { color: palette.ink }]}>Use theirs</Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // Short of the sheet's X, at the right of this line (ADR 0169).
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    marginTop: SPACE.xs,
    marginRight: CLOSE_ROOM,
  },
  caps: {
    fontSize: TEXT.sm,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: TEXT.xl + 2,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginTop: SPACE.md,
    marginBottom: SPACE.xs,
  },
  body: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.42, marginBottom: SPACE.lg },
  diff: { borderRadius: 18, overflow: "hidden", paddingBottom: SPACE.sm },
  who: {
    fontSize: TEXT.xs,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  line: { fontSize: TEXT.md - 1, lineHeight: 20, paddingHorizontal: 14, paddingVertical: 3 },
  go: {
    minHeight: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACE.lg + 2,
  },
  second: { marginTop: SPACE.sm + 2 },
  pressed: { transform: [{ scale: 0.97 }] },
  goWord: { fontSize: TEXT.body, fontWeight: "600" },
});
