/**
 * A person's devices on their page (ADR 0209): when each was last seen, and for an owner Pair a
 * new phone… (ADR 0206).
 *
 * And, since 26 October 2026 (ADR 0236), what to do about one. Natalie deleted Chips from her
 * phone and put it back; Arjun paired it again with Pair a new phone…, and her page listed two
 * iPhone 17s, the first holding a key that had gone with the old app, with nothing on the phone
 * to take it off. Arjun: "we need to provide a 'reconnect' option or something", then "also I
 * want to be able to remove existing paired Natalie devices". An owner taps one of her phones to
 * reconnect it: a code like a new phone's that names it, and the phone that uses it takes its
 * place, the old one signed out once the new one is allowed. And a row pushed left signs a device
 * out, for an owner or an admin, as You's own Devices does.
 */

import {
  deviceKind,
  lastSeenOf,
  mayPairFor,
  maySignOutDevicesOf,
  myRole,
  type PairedDeviceRecord,
  type Snapshot,
  type Store,
  sortDevices,
} from "@chipschat/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { Group, GroupFoot, GroupHeading, GroupRow, MARKED_INSET, RowMark } from "../ui/Group";
import { usePalette } from "../ui/theme";
import { DEVICE_MARK, SignOutSwipe } from "../you/Devices";
import { seenWords } from "../you/words";
import { NewPhoneSheet, type Reconnecting } from "./NewPhoneSheet";

/**
 * The devices still signed in as them, the most recently seen first (ADR 0209): an owner's or an
 * admin's to read. Nothing while unread or refused, and nothing from a server too old to say.
 * Read again on `again`, and a device signed out goes from the list at once, back with the
 * server's reason if it would not go.
 */
export function useTheirDevices(
  store: Store,
  personId: string,
  may: boolean,
): {
  readonly devices: readonly PairedDeviceRecord[] | undefined;
  readonly failed: string | undefined;
  readonly signOut: (deviceId: string) => void;
  readonly again: () => void;
} {
  const [devices, setDevices] = useState<readonly PairedDeviceRecord[] | undefined>(undefined);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const [reads, setReads] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `reads` asks for the list again
  useEffect(() => {
    if (!may || typeof store.personDevices !== "function") return;
    let live = true;
    store.personDevices(personId).then(
      (found) => {
        if (!live) return;
        const { recent, stale } = sortDevices(found, Date.now());
        setDevices([...recent, ...stale]);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [store, personId, may, reads]);
  const again = useCallback(() => setReads((n) => n + 1), []);
  const signOut = useCallback(
    (deviceId: string) => {
      setFailed(undefined);
      setDevices((now) => now?.filter((each) => each.deviceId !== deviceId));
      store.revokeDevice(deviceId).then(again, (failure: unknown) => {
        const why = failure instanceof Error ? failure.message : "the server did not answer";
        setFailed(`Not signed out: ${why}.`);
        again();
      });
    },
    [store, again],
  );
  return { devices, failed, signOut, again };
}

/**
 * The group on a person's page, and the two sheets it opens: Pair a new phone… and Reconnect. An
 * owner or an admin reads somebody's devices; an owner pairs and reconnects phones for them; an
 * owner, or an admin for anybody but an owner, signs one out. Your own are in You.
 */
export function PersonDevices({
  store,
  snapshot,
  personId,
  selfId,
  name,
  serverUrl,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly personId: string;
  readonly selfId: string;
  readonly name: string;
  readonly serverUrl: string | undefined;
}) {
  const { model } = snapshot;
  const other = personId !== selfId;
  const reads = snapshot.connection === "open" && other && myRole(model, selfId) !== undefined;
  const { devices, failed, signOut, again } = useTheirDevices(store, personId, reads);
  const pairs = mayPairFor(model, personId, selfId);
  const signsOut = other && maySignOutDevicesOf(model, personId, selfId);
  const [newPhone, setNewPhone] = useState(false);
  // The phone a reconnect code is for, from its row; kept while the sheet goes down.
  const [reconnecting, setReconnecting] = useState<Reconnecting | undefined>(undefined);
  const [reconnectOpen, setReconnectOpen] = useState(false);
  const closed = (close: (open: boolean) => void) => () => {
    close(false);
    again();
  };
  return (
    <>
      {devices === undefined && !pairs ? null : (
        <DevicesGroup
          devices={devices}
          name={name}
          failed={failed}
          onPair={pairs ? () => setNewPhone(true) : undefined}
          onReconnect={
            pairs
              ? (device) => {
                  setReconnecting(device);
                  setReconnectOpen(true);
                }
              : undefined
          }
          onSignOut={signsOut ? signOut : undefined}
        />
      )}
      <NewPhoneSheet
        open={newPhone}
        onClose={closed(setNewPhone)}
        store={store}
        personId={personId}
        name={name}
        serverUrl={serverUrl}
      />
      <NewPhoneSheet
        open={reconnectOpen}
        onClose={closed(setReconnectOpen)}
        store={store}
        personId={personId}
        name={name}
        serverUrl={serverUrl}
        replacing={reconnecting}
      />
    </>
  );
}

/** "Seen 2 h ago", "Seen yesterday", "Last seen Oct 3": when a device of theirs last asked. */
function seenLine(device: PairedDeviceRecord): string {
  const words = seenWords(lastSeenOf(device), Date.now());
  if (words === "Now") return "Seen just now";
  if (words === "Yesterday") return "Seen yesterday";
  return words.endsWith(" ago") ? `Seen ${words}` : `Last seen ${words}`;
}

/**
 * Their devices, each a row that an owner taps to reconnect and an owner or an admin pushes left
 * to sign out, then Pair a new phone… for an owner, and what each is for.
 */
export function DevicesGroup({
  devices,
  name,
  failed,
  onPair,
  onReconnect,
  onSignOut,
}: {
  readonly devices: readonly PairedDeviceRecord[] | undefined;
  readonly name: string;
  readonly failed: string | undefined;
  readonly onPair: (() => void) | undefined;
  readonly onReconnect: ((device: Reconnecting) => void) | undefined;
  readonly onSignOut: ((deviceId: string) => void) | undefined;
}) {
  const palette = usePalette();
  const open = useRef<SwipeableMethods | null>(null);
  const onOpen = (row: SwipeableMethods) => {
    if (open.current !== row) open.current?.close();
    open.current = row;
  };
  const foot = footWords(name, onReconnect !== undefined, onSignOut !== undefined);
  return (
    <>
      <GroupHeading>Devices</GroupHeading>
      <Group inset={MARKED_INSET} testID="person-devices">
        {(devices ?? []).map((device) => (
          <DeviceRow
            key={device.deviceId}
            device={device}
            onReconnect={onReconnect}
            onSignOut={onSignOut}
            onOpen={onOpen}
          />
        ))}
        {devices !== undefined && devices.length === 0 ? (
          <GroupRow label="No device signed in" testID="person-no-devices" />
        ) : null}
        {onPair === undefined ? null : (
          <GroupRow
            label="Pair a new phone…"
            tone="accent"
            onPress={onPair}
            testID="pair-new-phone"
          />
        )}
      </Group>
      {failed === undefined ? null : (
        <GroupFoot tone={palette.red} testID="person-devices-failed">
          {failed}
        </GroupFoot>
      )}
      {foot === "" ? null : <GroupFoot>{foot}</GroupFoot>}
    </>
  );
}

/** What the group's rows do, for whoever is reading: nothing said when they do nothing. */
function footWords(name: string, reconnects: boolean, signsOut: boolean): string {
  const pair = `Pair a new phone… is for a phone ${name} hasn't used here before.`;
  if (reconnects) {
    return `Tap a phone of ${name}'s to reconnect it, when Chips was deleted from it or it was reset. Push one left to sign it out. ${pair}`;
  }
  if (signsOut) return `Push a device of ${name}'s left to sign it out.`;
  return "";
}

/** One device: a press reconnects it and a swipe signs it out, where the reader may. */
function DeviceRow({
  device,
  onReconnect,
  onSignOut,
  onOpen,
}: {
  readonly device: PairedDeviceRecord;
  readonly onReconnect: ((device: Reconnecting) => void) | undefined;
  readonly onSignOut: ((deviceId: string) => void) | undefined;
  readonly onOpen: (row: SwipeableMethods) => void;
}) {
  const palette = usePalette();
  const reconnect =
    onReconnect === undefined
      ? undefined
      : () => onReconnect({ deviceId: device.deviceId, name: device.name });
  const row = (
    <View style={{ backgroundColor: palette.surface }}>
      <GroupRow
        label={device.name}
        sub={seenLine(device)}
        mark={<RowMark icon={DEVICE_MARK[deviceKind(device.name)]} />}
        onPress={reconnect}
        accessibilityHint={reconnect === undefined ? undefined : "Reconnects this phone"}
        testID={`person-device-${device.deviceId}`}
      />
    </View>
  );
  if (onSignOut === undefined) return row;
  return (
    <SignOutSwipe
      label={`${device.name}, ${seenLine(device)}`}
      onSignOut={() => onSignOut(device.deviceId)}
      onOpen={onOpen}
      onActivate={reconnect}
      testID={`person-device-${device.deviceId}-sign-out`}
    >
      {row}
    </SignOutSwipe>
  );
}
