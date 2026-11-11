/**
 * Somebody on the phone with nothing set up yet (ADR 0290's addendum; the "Chips From Zero" mock's
 * phone row and hand-off page). The phone runs no Chips and no agent, so its one job is getting the
 * setup page to their computer: the link to copy, which Handoff carries to a Mac's clipboard, or to
 * send to themselves; then the QR their computer shows, scanned here; and Look around meanwhile.
 */

import { START_ON_COMPUTER, START_PAGE } from "@chipschat/core";
import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { success } from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { Screen, useColumn } from "../ui/Screen";
import { shareText } from "../ui/share";
import { usePalette } from "../ui/theme";
import { LEADING_PHONE, RADIUS, SPACE, TEXT } from "../ui/tokens";

/** How long Copied stands before it is Copy again. */
const COPIED_MS = 1600;

export function StartOnComputer({
  onBack,
  onScan,
  onLookAround,
}: {
  readonly onBack: () => void;
  readonly onScan: () => void;
  readonly onLookAround: () => void;
}) {
  const palette = usePalette();
  const column = useColumn();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = () => {
    void Clipboard.setStringAsync(START_PAGE.url).then(() => {
      success();
      setCopied(true);
    });
  };
  return (
    <Screen testID="start-on-computer">
      <ScrollView contentContainerStyle={[styles.body, column]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={SPACE.sm}
          style={styles.back}
          testID="start-back"
        >
          <Icon name="previous" size={18} color={palette.accent} />
          <Text style={[styles.backWord, { color: palette.accent }]}>Back</Text>
        </Pressable>
        <View style={styles.head}>
          <View style={[styles.mark, { backgroundColor: palette.goldSoft }]}>
            <Icon name="laptop" size={26} color={palette.goldDeep} />
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
            {START_ON_COMPUTER.title}
          </Text>
          <Text style={[styles.lede, { color: palette.ink2 }]}>{START_ON_COMPUTER.lede}</Text>
        </View>
        <View style={styles.hand}>
          <View
            style={[styles.address, { backgroundColor: palette.raised, borderColor: palette.line }]}
          >
            <Text
              style={[styles.addressWord, { color: palette.ink }]}
              selectable
              numberOfLines={1}
              testID="start-link"
            >
              {START_PAGE.link}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copied ? "Copied" : `Copy ${START_PAGE.link}`}
              onPress={copy}
              style={({ pressed }) => [
                styles.copy,
                { backgroundColor: pressed ? palette.raisedPress : palette.goldSoft },
              ]}
              testID="start-copy"
            >
              <Icon name={copied ? "check" : "copy"} size={15} color={palette.goldDeep} />
              <Text style={[styles.copyWord, { color: palette.goldDeep }]}>
                {copied ? "Copied" : "Copy"}
              </Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => void shareText(START_PAGE.url)}
            hitSlop={SPACE.xs}
            style={styles.send}
            testID="start-send"
          >
            <Icon name="share" size={16} color={palette.accent} />
            <Text style={[styles.sendWord, { color: palette.accent }]}>
              {START_ON_COMPUTER.send}
            </Text>
          </Pressable>
          <Text style={[styles.fine, { color: palette.ink3 }]}>{START_ON_COMPUTER.handoff}</Text>
        </View>
        <View style={styles.after}>
          <Text style={[styles.afterWord, { color: palette.ink2 }]}>
            {START_ON_COMPUTER.scanAfter}
          </Text>
          <Button
            label="Scan a QR code"
            icon="qr"
            variant="gold"
            onPress={onScan}
            style={styles.big}
            testID="start-scan"
          />
          <Pressable
            accessibilityRole="button"
            onPress={onLookAround}
            hitSlop={SPACE.sm}
            style={styles.wait}
            testID="start-look-around"
          >
            <Text style={[styles.waitWord, { color: palette.accent }]}>
              {START_ON_COMPUTER.wait}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: SPACE.lg, gap: SPACE.xl },
  back: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start" },
  backWord: { fontSize: TEXT.md, fontWeight: "600" },
  head: { alignItems: "center", gap: SPACE.md, paddingTop: SPACE.sm },
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
  hand: { gap: SPACE.sm },
  address: {
    minHeight: 52,
    borderRadius: RADIUS.xxl,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingLeft: SPACE.md,
    paddingRight: SPACE.xs + 2,
  },
  addressWord: { flex: 1, fontSize: TEXT.body, fontWeight: "600", fontVariant: ["tabular-nums"] },
  // As big as the first screen's Type and iOS's Paste.
  copy: {
    height: 36,
    minWidth: 96,
    paddingHorizontal: SPACE.md,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  copyWord: { fontSize: TEXT.md, fontWeight: "600" },
  send: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: SPACE.sm,
  },
  sendWord: { fontSize: TEXT.md, fontWeight: "600" },
  fine: { fontSize: TEXT.sm, textAlign: "center" },
  after: { gap: SPACE.md, paddingTop: SPACE.sm },
  afterWord: {
    fontSize: TEXT.md,
    lineHeight: Math.round(TEXT.md * LEADING_PHONE),
    textAlign: "center",
  },
  big: { minHeight: 52, borderRadius: RADIUS.xxl },
  wait: { alignSelf: "center", padding: 6 },
  waitWord: { fontSize: TEXT.md, fontWeight: "600" },
});
