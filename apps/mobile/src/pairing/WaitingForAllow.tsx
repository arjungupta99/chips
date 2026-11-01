/**
 * Waiting for an Allow (ADR 0232), over the whole app: a link that went out as the relay's page
 * asks the person who sent it, and until they allow it this phone shows the six digits their
 * screen shows too. Built to the mocks' joining screen (`docs/proposals/allow-with-a-code-mocks.html`).
 * Stop waiting ends the attempt; once allowed, the pairing or join goes on where it started. A
 * modal of its own, since a join can start from a sheet, and a sheet is a modal too: drawn in the
 * app, it would wait behind it.
 */

import { linkWaitingWords } from "@chipschat/core";
import { Modal, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../ui/Button";
import { ChipPulse } from "../ui/ChipPulse";
import { useGround } from "../ui/ground";
import { useColumn } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { useWaitingForAllow } from "./allowWait";

export function WaitingForAllow() {
  const waiting = useWaitingForAllow();
  const palette = usePalette();
  const on = useGround();
  const insets = useSafeAreaInsets();
  const column = useColumn();
  if (waiting === undefined) return null;
  const minutes = Math.max(1, Math.round((waiting.expiresAt - Date.now()) / 60_000));
  const words = linkWaitingWords({ ...waiting, minutes });
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={waiting.stop}
    >
      <View
        style={[styles.page, { backgroundColor: palette.bg, paddingTop: insets.top + SPACE.xl }]}
        testID="waiting-for-allow"
        accessibilityViewIsModal
      >
        <View style={[styles.body, column]}>
          <View style={styles.mark}>
            <ChipPulse gold={palette.gold} ink={palette.ink3} lit={palette.ink} working />
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
            {words.title}
          </Text>
          <Text style={[styles.line, { color: palette.ink2 }]}>{words.line}</Text>
          <Text
            style={[styles.code, { color: palette.ink, backgroundColor: on.fill }]}
            testID="waiting-code"
            accessibilityLabel={`The code: ${words.code.split("").join(" ")}`}
          >
            {words.code}
          </Text>
          <Text style={[styles.foot, { color: palette.ink3 }]}>{words.foot}</Text>
        </View>
        <View style={[column, { paddingBottom: insets.bottom + SPACE.lg }]}>
          <Button label="Stop waiting" onPress={waiting.stop} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: "space-between" },
  body: { alignItems: "center", gap: SPACE.sm, paddingHorizontal: SPACE.lg },
  mark: { width: 72, height: 72, marginBottom: SPACE.sm },
  title: { fontSize: TEXT.xl + 2, fontWeight: "700", textAlign: "center" },
  line: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.4, textAlign: "center" },
  code: {
    alignSelf: "stretch",
    marginTop: SPACE.md,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: 4,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
    fontFamily: "Menlo",
  },
  foot: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4, textAlign: "center", marginTop: SPACE.sm },
});
