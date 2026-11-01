/**
 * Scan a QR code (ADR 0217's addendum of 26 October): the camera, in a sheet over the page, dark in
 * both appearances, as a camera is. One camera reads every code a newcomer is handed: an invite
 * someone sent (ADR 0164), the pairing code a computer shows (M4.1, ADR 0038), or the new-phone
 * code from a person's page in People (ADR 0206). An invite closes the sheet for its join card; a
 * pairing code pairs here, and says so while it does, or what went wrong.
 *
 * The camera is asked for as the sheet opens, since opening it is asking to scan. Refused, the
 * viewfinder says how to allow it. Type a pairing code instead is for a code that won't scan.
 *
 * The Workspaces sheet opens it too, on a phone in a workspace already (ADR 0197's addendum of 26
 * October), to read the invite on the screen of somebody beside you. There it reads an invite
 * alone, says only that under the viewfinder, and has no pairing code to type.
 */

import { inviteFromLink } from "@chipschat/protocol";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../ui/Icon";
import { dark, SPACE, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";
import type { Join } from "./useJoin";

/** What reads a code the camera sees, and what it has to say: a whole join's, or an invite's alone. */
export type Reader = Pick<Join, "scanned" | "working" | "failure">;

/** A camera's dark before it shows anything, in either theme. */
const CAMERA_DARK = "#1b1d22";
/** The viewfinder's side, and its corners'. */
const FINDER = 280;
const CORNER = 46;

/** What the camera reads, and where each is found. */
const KINDS = [
  ["An invite", "the code someone sent you"],
  ["Your computer", "in Chips: You → Devices → Pair another device"],
  ["A new phone", "the code from your page in People"],
] as const;
/** What the Workspaces sheet's camera reads. */
const INVITE_ONLY = [["An invite", "the code on the other person's screen"]] as const;

export function ScanSheet({
  visible,
  reader,
  onClose,
  onType,
}: {
  readonly visible: boolean;
  readonly reader: Reader;
  readonly onClose: () => void;
  /** Type a pairing code instead. Left out, the camera is the Workspaces sheet's, for an invite. */
  readonly onType?: (() => void) | undefined;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotion();
  const [permission, ask] = useCameraPermissions();
  useEffect(() => {
    if (visible && permission?.granted === false && permission.canAskAgain) {
      void ask();
    }
  }, [visible, permission, ask]);
  const read = (text: string) => {
    // An invite opens its own card, which the sheet would stand over.
    if (inviteFromLink(text) !== undefined) onClose();
    reader.scanned(text);
  };
  const said = reader.working ? "Pairing…" : reader.failure;
  return (
    <Modal
      visible={visible}
      animationType={reduced ? "none" : "slide"}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View
        style={[styles.sheet, { paddingTop: insets.top + SPACE.xs, paddingBottom: insets.bottom }]}
        testID="scan-sheet"
      >
        <StatusBar style="light" />
        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={SPACE.sm}
            style={styles.close}
            testID="scan-close"
          >
            <Icon name="x" size={16} color={dark.ink} weight={2} />
          </Pressable>
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          Scan a QR code
        </Text>
        <Text style={styles.line}>Point the camera at the code.</Text>
        <View style={styles.finder}>
          {permission?.granted === true ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={({ data }) => read(data)}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (permission?.canAskAgain === false) void Linking.openSettings();
                else void ask();
              }}
              style={styles.allow}
            >
              <Text style={styles.allowWords}>
                {permission?.canAskAgain === false
                  ? "Allow the camera in Settings"
                  : "Allow the camera to scan"}
              </Text>
            </Pressable>
          )}
          <View pointerEvents="none" style={[styles.corner, styles.topLeft]} />
          <View pointerEvents="none" style={[styles.corner, styles.topRight]} />
          <View pointerEvents="none" style={[styles.corner, styles.footLeft]} />
          <View pointerEvents="none" style={[styles.corner, styles.footRight]} />
        </View>
        {said === undefined ? null : (
          <Text
            style={[styles.said, { color: reader.working ? dark.ink2 : dark.red }]}
            testID="scan-said"
          >
            {said}
          </Text>
        )}
        <View style={styles.kinds}>
          {(onType === undefined ? INVITE_ONLY : KINDS).map(([kind, where]) => (
            <View key={kind} style={styles.kind}>
              <Text style={styles.kindName}>{kind}</Text>
              <Text style={styles.kindWhere}>{where}</Text>
            </View>
          ))}
        </View>
        {onType === undefined ? null : (
          <Pressable
            accessibilityRole="button"
            onPress={onType}
            hitSlop={SPACE.sm}
            style={styles.type}
            testID="scan-type"
          >
            <Text style={[styles.typeWord, { color: dark.accent }]}>
              Type a pairing code instead
            </Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: SPACE.xxl + SPACE.xs,
    backgroundColor: dark.bg,
  },
  top: { alignSelf: "stretch", alignItems: "flex-end", height: 44, justifyContent: "center" },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  title: {
    marginTop: SPACE.lg,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: dark.ink,
  },
  line: {
    marginTop: SPACE.sm,
    marginBottom: SPACE.xxl,
    fontSize: TEXT.body,
    lineHeight: 22,
    textAlign: "center",
    color: dark.ink2,
  },
  finder: {
    width: FINDER,
    height: FINDER,
    maxWidth: "100%",
    borderRadius: 30,
    overflow: "hidden",
    backgroundColor: CAMERA_DARK,
  },
  allow: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  allowWords: { color: dark.ink, fontSize: TEXT.md, fontWeight: "600" },
  corner: { position: "absolute", width: CORNER, height: CORNER, borderColor: dark.gold },
  topLeft: {
    top: 18,
    left: 18,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 18,
  },
  topRight: {
    top: 18,
    right: 18,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 18,
  },
  footLeft: {
    bottom: 18,
    left: 18,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 18,
  },
  footRight: {
    bottom: 18,
    right: 18,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 18,
  },
  said: { marginTop: SPACE.lg, fontSize: TEXT.md, textAlign: "center" },
  kinds: { alignSelf: "stretch", marginTop: SPACE.xxl, gap: SPACE.sm + 2 },
  kind: { flexDirection: "row", gap: SPACE.md },
  kindName: { width: 116, fontSize: TEXT.md, fontWeight: "600", color: dark.ink },
  kindWhere: { flex: 1, fontSize: TEXT.md, lineHeight: 20, color: dark.ink2 },
  type: { marginTop: "auto", marginBottom: SPACE.xxl, padding: SPACE.sm },
  typeWord: { fontSize: TEXT.body, fontWeight: "600" },
});
