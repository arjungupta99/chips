/**
 * A workspace this phone can't open any more (ADR 0228's addendum). Its record is here and the key
 * that let the phone in is not, as after a phone is set up from a backup: the Keychain keeps each
 * key this-device-only (ADR 0044), so a backup brings back the record and leaves the key behind.
 *
 * The first screen opens on this in place of the film, rather than another workspace or the kept
 * demo standing in for it as if it had never been there (Arjun, 13 November 2026: "when I opened
 * the app I directly saw the demo server. It was a bit confusing why that happened"). It names the
 * workspace, says how to get back in, and offers the camera for the code an owner gets, the other
 * ways in, and taking the workspace off this phone. Pairing again with the same server replaces the
 * record, so the page goes once the phone is back in.
 */

import { type LostDevice, workspaceLabel } from "@chipschat/core";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { thisDevice } from "../device/word";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Screen, useColumn } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { LEADING_PHONE, RADIUS, SPACE, TEXT } from "../ui/tokens";

/** What the page says of `workspace`, on this device. */
export function keyGoneWords(workspace: string) {
  return {
    title: `${thisDevice(true)} can't open ${workspace} any more`,
    why:
      `The key that let ${thisDevice()} into ${workspace} isn't on it now. Keys stay on the ` +
      "device they were made on, so a phone restored from a backup or moved to a new one comes " +
      "back without them.",
    how:
      "To get back in, ask an owner to reconnect you: they choose Reconnect or Pair a new phone on " +
      "your page in People, and you scan the code they get. If Chips runs on your own computer, " +
      "open it there and choose You → Devices → Pair another device.",
    remove: `Remove ${workspace} from ${thisDevice()}`,
  };
}

export function KeyGone({
  lost,
  onScan,
  onWays,
  onRemove,
}: {
  readonly lost: LostDevice;
  readonly onScan: () => void;
  /** The first screen's other ways in: an invite, a pairing code, Look around. */
  readonly onWays: () => void;
  readonly onRemove: () => void;
}) {
  const palette = usePalette();
  const column = useColumn();
  const insets = useSafeAreaInsets();
  const words = keyGoneWords(workspaceLabel(lost));
  return (
    <Screen testID="key-gone">
      <ScrollView
        contentContainerStyle={[
          styles.body,
          column,
          { paddingTop: insets.top + SPACE.xl, paddingBottom: insets.bottom + SPACE.xl },
        ]}
      >
        <View style={styles.head}>
          <View style={[styles.mark, { backgroundColor: palette.goldSoft }]}>
            <Icon name="lock" size={26} color={palette.goldDeep} />
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
            {words.title}
          </Text>
          <Text style={[styles.lede, { color: palette.ink2 }]}>{words.why}</Text>
        </View>
        <Text style={[styles.how, { color: palette.ink2 }]}>{words.how}</Text>
        <View style={styles.ways}>
          <Button
            label="Scan a QR code"
            icon="qr"
            variant="gold"
            onPress={onScan}
            style={styles.big}
            testID="key-gone-scan"
          />
          <Pressable
            accessibilityRole="button"
            onPress={onWays}
            hitSlop={SPACE.sm}
            style={styles.quiet}
            testID="key-gone-ways"
          >
            <Text style={[styles.quietWord, { color: palette.accent }]}>Other ways in</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onRemove}
            hitSlop={SPACE.sm}
            style={styles.quiet}
            testID="key-gone-remove"
          >
            <Text style={[styles.quietWord, { color: palette.ink3 }]}>{words.remove}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // In the middle of the screen, as the Spaces list says what it cannot show (`NoRooms`).
  body: { flexGrow: 1, justifyContent: "center", paddingHorizontal: SPACE.lg, gap: SPACE.xl },
  head: { alignItems: "center", gap: SPACE.md },
  mark: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  title: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "700",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  lede: {
    fontSize: TEXT.body,
    lineHeight: Math.round(TEXT.body * LEADING_PHONE),
    textAlign: "center",
  },
  how: {
    fontSize: TEXT.md,
    lineHeight: Math.round(TEXT.md * LEADING_PHONE),
    textAlign: "center",
  },
  ways: { gap: SPACE.md, paddingTop: SPACE.sm },
  big: { minHeight: 52, borderRadius: RADIUS.xxl },
  quiet: { alignSelf: "center", padding: 6 },
  quietWord: { fontSize: TEXT.md, fontWeight: "600", textAlign: "center" },
});
