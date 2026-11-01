/**
 * Paste, for an invite link: iOS's own button where there is one (iOS 16 and later), which hands
 * over what was copied without the "Allow Paste?" alert, whose lead button was Don't Allow (the
 * guest walk, 18 October 2026). Its word is iOS's and can't be changed, so on the first screen it
 * stands at the end of a row that says what it pastes. Elsewhere, the app's own
 * button, which reads the clipboard. On Welcome, and in the Workspaces sheet's Join another
 * workspace (ADR 0197), where it shares a row with Scan a QR code.
 */

import * as Clipboard from "expo-clipboard";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import type { PasteInvite } from "./usePasteInvite";

export function PasteAction({
  invites,
  raised = false,
  beside = false,
}: {
  readonly invites: Pick<PasteInvite, "paste" | "pasted">;
  /**
   * The first screen's second way on (ADR 0213), under the gold Watch Chips work: on the raised
   * ground, with a line round it, and "Paste an invite link".
   */
  readonly raised?: boolean;
  /**
   * Beside Scan a QR code in the Workspaces sheet (ADR 0197's addendum of 26 October): half the
   * row, and the word alone, as iOS's own button says it.
   */
  readonly beside?: boolean;
}) {
  const palette = usePalette();
  const ground = raised ? palette.raised : palette.gold;
  const ink = raised ? palette.ink : "#14161b";
  if (!Clipboard.isPasteButtonAvailable) {
    return <OwnPaste paste={invites.paste} raised={raised} beside={beside} />;
  }
  const paste = (
    <Clipboard.ClipboardPasteButton
      onPress={(data) => invites.pasted(data.type === "text" ? data.text : "")}
      acceptedContentTypes={["plain-text", "url"]}
      backgroundColor={raised ? palette.goldSoft : ground}
      foregroundColor={raised ? palette.goldDeep : ink}
      cornerStyle={raised ? "capsule" : "medium"}
      displayMode="iconAndLabel"
      style={raised ? styles.pasteSmall : beside ? styles.pasteHalf : styles.paste}
      testID="paste-invite"
    />
  );
  if (!raised) return paste;
  // iOS's word alone, "Paste", says nothing of what to paste to someone who has just arrived (the
  // demo's walk, 21 October 2026): the row says it, and iOS's button stands at its end.
  return (
    <View
      style={[
        styles.action,
        styles.raised,
        styles.row,
        { backgroundColor: ground, borderColor: palette.line },
      ]}
    >
      <Text style={[styles.label, styles.ask, { color: ink }]}>Have an invite link?</Text>
      {paste}
    </View>
  );
}

/** The app's own button, where iOS has no Paste of its own: it reads the clipboard on the tap. */
function OwnPaste({
  paste,
  raised,
  beside,
}: {
  readonly paste: () => void;
  readonly raised: boolean;
  readonly beside: boolean;
}) {
  const palette = usePalette();
  const words = raised ? "Paste an invite link" : beside ? "Paste" : "Paste the invite link";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={paste}
      testID="paste-invite"
      style={[
        styles.action,
        { backgroundColor: raised ? palette.raised : palette.gold },
        raised ? [styles.raised, { borderColor: palette.line }] : null,
        beside ? styles.half : null,
      ]}
    >
      <Text style={[styles.label, { color: raised ? palette.ink : "#14161b" }]}>{words}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: { borderRadius: RADIUS.md, padding: SPACE.md, alignItems: "center" },
  // As tall as Watch Chips work's neighbour on the mock, and as round.
  raised: { minHeight: 52, justifyContent: "center", borderRadius: RADIUS.xxl, borderWidth: 1 },
  label: { fontSize: TEXT.body, fontWeight: "600" },
  // iOS draws its own Paste control and needs a size: the app's own button's height, full width.
  paste: { height: 48, width: "100%" },
  // Beside Scan a QR code: as tall, and the half of the row it leaves.
  pasteHalf: { height: 48, flex: 1 },
  half: { flex: 1, height: 48, paddingVertical: 0, justifyContent: "center" },
  // On the first screen, at the end of its row.
  pasteSmall: { height: 36, width: 104 },
  row: { flexDirection: "row", gap: SPACE.sm, paddingVertical: SPACE.xs },
  ask: { flex: 1 },
});
