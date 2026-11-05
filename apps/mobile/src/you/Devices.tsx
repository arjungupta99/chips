/**
 * Every device holding a key to this workspace as this person, and a way to take the key back
 * from one (ADR 0085). This phone first, then the rest by when each was last seen; those not seen
 * for a month under one row that opens, with a way to sign them all out at once — twelve names in
 * the order they were paired, five of them "This browser", said nothing a person could act on.
 *
 * A row pushed left shows Sign out, the way Mail's rows show Delete, and a press there withdraws
 * that device's key at the server: it is refused from its next request. The swipe and the press
 * are the two steps; signing out several at once asks first. A screen reader has the act as the
 * row's own action, since it cannot swipe.
 *
 * And Pair a computer, which only a desk could do before: the code a computer types in, from the
 * phone that is already paired (`PairSheet`), which stands beside You's scroll, not in it
 * (`You.tsx`), and beside the list on an iPad is a page there.
 */

import {
  type Device,
  type DeviceKind,
  deviceKind,
  lastSeenOf,
  type PairedDeviceRecord,
  type Store,
  sortDevices,
} from "@chipschat/core";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { isPad, thisDevice } from "../device/word";
import { Group, GroupFoot, GroupHeading, GroupRow, MARKED_INSET, RowMark } from "../ui/Group";
import * as feel from "../ui/haptics";
import type { IconName } from "../ui/icons";
import { usePalette } from "../ui/theme";
import { TEXT } from "../ui/tokens";
import { PairPage, PairSheet } from "./PairSheet";
import { useSheetPage } from "./pages";
import type { YouSection } from "./section";
import { seenWords } from "./words";

/** The mark beside a device, by the kind its name says it is; a person's page wears them too. */
export const DEVICE_MARK: Readonly<Record<DeviceKind, IconName>> = {
  phone: "handset",
  tablet: "tablet",
  computer: "laptop",
  browser: "globe",
  terminal: "terminal",
  other: "chip",
};

/** The mark beside this device's own row: what it is, not what it named itself. */
const HERE_MARK: IconName = isPad() ? "tablet" : "handset";

/** How wide the Sign out behind a row is: a thumb's width and two words. */
const ACT_WIDTH = 96;

function useDevices(store: Store, connected: boolean) {
  const [devices, setDevices] = useState<readonly PairedDeviceRecord[] | undefined>(undefined);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const load = useCallback(() => {
    store.devices().then(
      (found) => {
        setDevices(found);
        setFailed(undefined);
      },
      () =>
        setFailed(`The server did not answer. This list comes from it, not from ${thisDevice()}.`),
    );
  }, [store]);
  // Read each time the connection opens, as the workspace's group is. Read once, when You first
  // drew, the list was asked of a server the phone had not found again yet — back from sleep, on
  // the relay — and said it did not answer for as long as the app stayed open (Arjun's iPhone,
  // 16 October 2026).
  useEffect(() => {
    if (connected) load();
  }, [connected, load]);
  // Sign out: gone from the list at once, and back with the server's reason if it would not.
  const signOut = useCallback(
    async (ids: readonly string[]) => {
      setDevices((now) => now?.filter((each) => !ids.includes(each.deviceId)));
      try {
        for (const id of ids) await store.revokeDevice(id);
      } catch (failure) {
        setFailed(
          `Not signed out: ${failure instanceof Error ? failure.message : "the server did not answer"}.`,
        );
      }
      load();
    },
    [store, load],
  );
  return { devices, failed, signOut, reload: load };
}

export function useDevicesGroup({
  store,
  device,
  connected,
}: {
  readonly store: Store;
  readonly device: Device;
  readonly connected: boolean;
}): YouSection {
  const { devices, failed, signOut, reload } = useDevices(store, connected);
  const [folded, setFolded] = useState(true);
  const [pairing, setPairing] = useState(false);
  const pairPage = useSheetPage("pair", () => setPairing(true));
  const open = useRef<SwipeableMethods | null>(null);
  const now = Date.now();
  const { recent, stale } = sortDevices(devices ?? [], now);
  const palette = usePalette();

  const signOutStale = () =>
    Alert.alert(
      `Sign out ${stale.length} ${stale.length === 1 ? "device" : "devices"}?`,
      "None of them has been seen for a month. Each is refused from its next request, and can pair again with a new code.",
      [
        { text: "Keep them", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => void signOut(stale.map(idOf)) },
      ],
    );

  const row = (each: PairedDeviceRecord) => (
    <DeviceRow
      key={each.deviceId}
      device={each}
      now={now}
      onSignOut={() => void signOut([each.deviceId])}
      onOpen={(methods) => {
        if (open.current !== methods) open.current?.close();
        open.current = methods;
      }}
    />
  );

  const group = (
    <>
      <GroupHeading>Devices</GroupHeading>
      <Group inset={MARKED_INSET} testID="devices">
        {devices === undefined && failed === undefined ? (
          <GroupRow key="reading" label="Reading…" />
        ) : null}
        {recent.map(row)}
        {stale.length === 0 ? null : (
          <GroupRow
            key="stale"
            label={`${stale.length} not seen in a month`}
            mark={<View style={styles.blank} />}
            value={folded ? undefined : "Hide"}
            onPress={() => setFolded(!folded)}
            testID="stale-devices"
          />
        )}
        {folded ? null : stale.map(row)}
        {folded || stale.length === 0 ? null : (
          <GroupRow
            key="stale-out"
            label={`Sign out all ${stale.length}`}
            tone="danger"
            mark={<View style={styles.blank} />}
            onPress={signOutStale}
          />
        )}
        <GroupRow
          key="pair"
          label="Pair a computer"
          tone="accent"
          mark={<RowMark icon="plus" tint={palette.goldSoft} ink={palette.accent} />}
          onPress={pairPage.onPress}
          selected={pairPage.selected}
          testID="pair-computer"
        />
      </Group>
      <GroupFoot tone={failed === undefined ? undefined : palette.red}>
        {failed ?? "Swipe a device left to sign it out."}
      </GroupFoot>
    </>
  );
  const overlays = (
    <PairSheet
      open={pairing}
      onClose={() => setPairing(false)}
      onPaired={reload}
      store={store}
      serverUrl={device.serverUrl}
    />
  );
  const pages = {
    pair: (
      <PairPage
        onClose={pairPage.done}
        onPaired={reload}
        store={store}
        serverUrl={device.serverUrl}
      />
    ),
  };
  return { group, overlays, pages };
}

const idOf = (each: PairedDeviceRecord) => each.deviceId;

function DeviceRow({
  device,
  now,
  onSignOut,
  onOpen,
}: {
  readonly device: PairedDeviceRecord;
  readonly now: number;
  readonly onSignOut: () => void;
  readonly onOpen: (row: SwipeableMethods) => void;
}) {
  const palette = usePalette();
  const body = (
    <View style={{ backgroundColor: palette.surface }}>
      <GroupRow
        label={device.name}
        sub={device.current ? "Now" : seenWords(lastSeenOf(device), now)}
        // This one is this phone or this iPad, whatever it named itself: a simulator goes by its
        // own name.
        mark={<RowMark icon={device.current ? HERE_MARK : DEVICE_MARK[deviceKind(device.name)]} />}
        trailing={
          device.current ? (
            <Text style={[styles.tag, { color: palette.ink3, backgroundColor: palette.surface2 }]}>
              {thisDevice(true)}
            </Text>
          ) : undefined
        }
        testID={device.current ? "device-current" : `device-${device.deviceId}`}
      />
    </View>
  );
  // This phone signs out from the foot of the screen, where it says what it costs.
  if (device.current) return body;
  return (
    <SignOutSwipe
      label={`${device.name}, ${seenWords(lastSeenOf(device), now)}`}
      onSignOut={onSignOut}
      onOpen={onOpen}
      testID={`device-${device.deviceId}-sign-out`}
    >
      {body}
    </SignOutSwipe>
  );
}

/**
 * A device's row pushed left shows Sign out, the way Mail's rows show Delete: here, and on a
 * person's page for an owner or an admin (ADR 0236). A screen reader has the act as the row's own
 * action, since it cannot swipe, and the row's press as its other.
 */
export function SignOutSwipe({
  label,
  onSignOut,
  onOpen,
  onActivate,
  testID,
  children,
}: {
  readonly label: string;
  readonly onSignOut: () => void;
  /** Told which row opened, so the one open before it closes. */
  readonly onOpen: (row: SwipeableMethods) => void;
  /** What a press on the row does, for a screen reader, which reads the row as one. */
  readonly onActivate?: (() => void) | undefined;
  readonly testID: string;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  const swipe = useRef<SwipeableMethods>(null);
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityActions={[
        ...(onActivate === undefined ? [] : [{ name: "activate" as const }]),
        { name: "signOut", label: "Sign out" },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "signOut") onSignOut();
        if (event.nativeEvent.actionName === "activate") onActivate?.();
      }}
    >
      <ReanimatedSwipeable
        ref={swipe}
        friction={1.4}
        rightThreshold={ACT_WIDTH / 2}
        overshootRight={false}
        dragOffsetFromRightEdge={12}
        onSwipeableWillOpen={() => {
          if (swipe.current !== null) onOpen(swipe.current);
        }}
        renderRightActions={() => (
          <Pressable
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onPress={() => {
              feel.warning();
              swipe.current?.close();
              onSignOut();
            }}
            testID={testID}
            style={({ pressed }) => [
              styles.act,
              { backgroundColor: palette.red, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={styles.actWord}>Sign out</Text>
          </Pressable>
        )}
      >
        {children}
      </ReanimatedSwipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  blank: { width: 30 },
  tag: {
    fontSize: TEXT.xs,
    fontWeight: "600",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  act: { width: ACT_WIDTH, alignItems: "center", justifyContent: "center" },
  actWord: { color: "#ffffff", fontSize: TEXT.md, fontWeight: "600" },
});
