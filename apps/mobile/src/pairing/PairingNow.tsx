/**
 * A pairing link being followed, said over whatever is on screen (the onboarding audit, Part 2,
 * item 4). The camera's QR opens the app at its link (`applinks:chipschat.ai`), and the phone then
 * tries the server on its network and its relay for up to ten seconds, under the first screen's film,
 * with nothing to say it was doing anything. `usePairingLink` says which server it is trying here,
 * and the layout draws it.
 */

import { useSyncExternalStore } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "../ui/Card";
import { usePalette } from "../ui/theme";
import { LEADING_PHONE, SPACE, TEXT } from "../ui/tokens";

let now: string | undefined;
const listeners = new Set<() => void>();

/** The server a pairing link is being followed to, by its host, or nothing once it has answered. */
export function setPairingNow(host: string | undefined): void {
  if (now === host) return;
  now = host;
  for (const listener of listeners) listener();
}

export function usePairingNow(): string | undefined {
  return useSyncExternalStore(
    (changed) => {
      listeners.add(changed);
      return () => listeners.delete(changed);
    },
    () => now,
  );
}

/** "Pairing with Chips at …", at the foot of the screen, while a link is followed. */
export function PairingNow() {
  const host = usePairingNow();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  if (host === undefined) return null;
  return (
    <View
      style={[styles.foot, { bottom: insets.bottom + SPACE.md }]}
      pointerEvents="none"
      testID="pairing-now"
    >
      <Card>
        <View style={styles.row}>
          <ActivityIndicator color={palette.ink3} />
          <Text
            style={[styles.words, { color: palette.ink }]}
          >{`Pairing with Chips at ${host}…`}</Text>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  foot: { position: "absolute", left: SPACE.md, right: SPACE.md },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  words: { fontSize: TEXT.md, lineHeight: Math.round(TEXT.md * LEADING_PHONE), flexShrink: 1 },
});
