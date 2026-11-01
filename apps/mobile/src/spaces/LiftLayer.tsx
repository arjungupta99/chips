/**
 * The layer a lifted message's menu is drawn on (ADR 0200): over everything the window shows, the
 * bar and the status bar too. It stands apart from the menu's motion (`LiftedMotion.tsx`), which is
 * Reanimated's and a plain view under Jest, so that Jest renders this one as it is.
 */

import { type ReactNode, useEffect, useRef } from "react";
import { Modal, type ModalProps, Platform, StyleSheet, View } from "react-native";
import { FullWindowOverlay } from "react-native-screens";

const ORIENTATIONS: NonNullable<ModalProps["supportedOrientations"]> = ["portrait", "landscape"];

/**
 * On iOS the menu is drawn on a layer laid on the window itself (`FullWindowOverlay`), and the room
 * behind it takes a touch the moment the menu is put down (`held` false), while the copy is still on
 * its way back. A modal held the whole screen until the copy had settled and the system had taken it
 * away, well after the menu looked gone, and a press on the same message in that time went to the
 * modal and was lost: the menu would not come up again (Arjun, 18 October 2026; the simulator, 590
 * ms from the tap beside it). With no modal to dismiss, the menu has gone as soon as it is told to
 * go, and a page a choice opened (a sheet, a modal of its own) rises after it without being taken
 * away with it, which waiting for the modal's `onDismiss` was for.
 *
 * Elsewhere there is no such layer, and a modal holds the screen while the copy goes down.
 */
export function LiftLayer({
  shown,
  held,
  onGone,
  onRequestClose,
  children,
}: {
  readonly shown: boolean;
  /** Up: the menu takes every touch. Once false, the room behind takes them (iOS). */
  readonly held: boolean;
  readonly onGone: () => void;
  readonly onRequestClose: () => void;
  readonly children: ReactNode;
}) {
  const gone = useRef(onGone);
  gone.current = onGone;
  useEffect(() => {
    if (!shown) gone.current();
  }, [shown]);
  if (Platform.OS === "ios") {
    return (
      <FullWindowOverlay>
        <View style={StyleSheet.absoluteFill} pointerEvents={held ? "auto" : "none"}>
          {shown ? children : null}
        </View>
      </FullWindowOverlay>
    );
  }
  return (
    <Modal
      visible={shown}
      transparent
      animationType="none"
      statusBarTranslucent
      supportedOrientations={ORIENTATIONS}
      onRequestClose={onRequestClose}
    >
      {children}
    </Modal>
  );
}
