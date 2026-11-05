/**
 * Relay (ADR 0211, Phase 4): the owner's switch, from the workspace's group on You. Use the relay,
 * on or off, with why the server isn't connected to it while it is on and isn't, what it does
 * under it, and on Chips's own relay that it counts each day, linking What Chips counts (ADR
 * 0208); every device of the workspace by the way it goes now
 * (through the relay, direct, not connected); and the Tailscale share link kept for the next
 * guest (Phase 3), to forget.
 *
 * Turning it off asks first, in a sheet: how many devices last came through the relay and would
 * lose the server, which they are, and that new invite and pairing links will open only on the
 * tailnet. "Ask them to go direct first" sends their people a push that opens Connection, and the
 * switch stays on; the list here moves as they go direct, read again every five seconds while the
 * page is open. "Turn off now" turns it off: every device connected is told before the relay goes.
 * Turning it back on is one tap.
 */

import {
  askedWords,
  type Device,
  deviceLabel,
  directSince,
  lastWay,
  type RelayDevice,
  type RelayFacts,
  relayFootWords,
  relayLists,
  relayNotConnectedWords,
  type Store,
  turnOffLead,
  turnOffNote,
  WHAT_CHIPS_COUNTS,
  wouldLose,
} from "@chipschat/core";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, Switch, Text, View } from "react-native";
import { LinkedFoot } from "../context/rows";
import { thisDevice } from "../device/word";
import { useSnapshot } from "../store/provider";
import { Button } from "../ui/Button";
import { Group, GroupFoot, GroupHeading, GroupRow } from "../ui/Group";
import { UnderName, useColumn } from "../ui/Screen";
import { Sheet } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { Toast, useMachine } from "./ConnectionPage";
import { SheetHead } from "./SheetHead";
import { hostOf } from "./words";

/** How often the list is read again while the page is in front. */
export const RELAY_EVERY_MS = 5000;
/** How long a toast stays. */
const SAID_MS = 4000;

export function RelayPage({ store, device }: { readonly store: Store; readonly device: Device }) {
  const snapshot = useSnapshot(store);
  const palette = usePalette();
  const column = useColumn();
  const machine = useMachine(store, device);
  const facts = useRelayFacts(store);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (said === undefined) return;
    const gone = setTimeout(() => setSaid(undefined), SAID_MS);
    return () => clearTimeout(gone);
  }, [said]);
  const turn = (on: boolean) => {
    setBusy(true);
    store
      .setRelay(on)
      .then(facts.set, (error: unknown) =>
        setSaid(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => setBusy(false));
  };
  const now = facts.value;
  // The server says which relay, on or off (ADR 0245); a phone never told one has none of its own.
  const relayUrl = now?.url ?? device.relayUrl;
  const relayHost = relayUrl === undefined ? "The relay" : hostOf(relayUrl);
  const here = { deviceId: device.deviceId, word: thisDevice(true) };
  const label = (each: RelayDevice) =>
    deviceLabel(each, snapshot.directory, device.participantId, here);
  return (
    <UnderName contentContainerStyle={[styles.page, column]} testID="relay-page">
      {now === undefined ? null : now.configured ? (
        <>
          <SwitchGroup
            facts={now}
            busy={busy}
            foot={relayFootWords(relayHost, machine, device.serverUrl)}
            onTurn={(next) => (next ? turn(true) : setAsking(true))}
          />
          <Devices facts={now} label={label} />
          {now.keptLink === undefined ? null : (
            <Kept store={store} onForgot={() => facts.set({ ...now, keptLink: undefined })} />
          )}
        </>
      ) : (
        <Text style={[styles.none, { color: palette.ink3 }]} testID="relay-none">
          This server has no relay set up, so Chips is reachable only on its own network.
        </Text>
      )}
      {said === undefined ? null : <Toast words={said} testID="relay-toast" />}
      {now === undefined ? null : (
        <TurnOffSheet
          open={asking}
          onClose={() => setAsking(false)}
          losing={wouldLose(now.devices)}
          label={label}
          selfId={device.participantId}
          serverUrl={device.serverUrl}
          onAsk={() =>
            store.askRelayedToGoDirect().then((asked) => {
              setAsking(false);
              setSaid(askedWords(asked));
            })
          }
          onTurnOff={() => {
            setAsking(false);
            turn(false);
          }}
        />
      )}
    </UnderName>
  );
}

/**
 * The switch, with why the server isn't connected to the relay while it is on and isn't, as the
 * server kept it, and under them what the relay does.
 */
function SwitchGroup({
  facts,
  busy,
  foot,
  onTurn,
}: {
  readonly facts: RelayFacts;
  readonly busy: boolean;
  readonly foot: ReturnType<typeof relayFootWords>;
  readonly onTurn: (on: boolean) => void;
}) {
  const palette = usePalette();
  const notConnected = relayNotConnectedWords(facts);
  return (
    <View>
      <Group testID="relay-switch-group">
        <GroupRow
          label="Use the relay"
          trailing={
            <Switch
              testID="relay-switch"
              accessibilityLabel="Use the relay"
              value={facts.on}
              disabled={busy}
              accessibilityState={{ checked: facts.on, disabled: busy }}
              onValueChange={onTurn}
            />
          }
        />
      </Group>
      {notConnected === undefined ? null : (
        <GroupFoot tone={palette.red} testID="relay-not-connected">
          {notConnected}
        </GroupFoot>
      )}
      <LinkedFoot
        words={foot}
        onLink={() => void Linking.openURL(WHAT_CHIPS_COUNTS)}
        testID="relay-foot"
      />
    </View>
  );
}

/** The switch's facts, read when the page comes forward and every five seconds while it is. */
function useRelayFacts(store: Store) {
  const [value, set] = useState<RelayFacts | undefined>(undefined);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      const read = () => {
        store.readRelay().then(
          (facts) => {
            if (live) set(facts);
          },
          () => undefined,
        );
      };
      read();
      const every = setInterval(read, RELAY_EVERY_MS);
      return () => {
        live = false;
        clearInterval(every);
      };
    }, [store]),
  );
  return { value, set };
}

/** Every device, by the way it goes now. A list with nobody in it is not drawn. */
function Devices({
  facts,
  label,
}: {
  readonly facts: RelayFacts;
  readonly label: (device: RelayDevice) => string;
}) {
  const { relayed, direct, away } = relayLists(facts.devices);
  return (
    <>
      <DeviceGroup
        title="Through the relay now"
        devices={relayed}
        label={label}
        value={(device) => directSince(device)}
        testID="relay-relayed"
      />
      <DeviceGroup
        title="Direct now"
        devices={direct}
        label={label}
        value={() => "direct"}
        testID="relay-direct"
      />
      <DeviceGroup
        title="Not connected"
        devices={away}
        label={label}
        value={(device) => lastWay(device)}
        testID="relay-away"
      />
    </>
  );
}

function DeviceGroup({
  title,
  devices,
  label,
  value,
  testID,
}: {
  readonly title: string;
  readonly devices: readonly RelayDevice[];
  readonly label: (device: RelayDevice) => string;
  readonly value: (device: RelayDevice) => string;
  readonly testID: string;
}) {
  if (devices.length === 0) return null;
  return (
    <View>
      <GroupHeading>{title}</GroupHeading>
      <Group testID={testID}>
        {devices.map((device) => (
          <GroupRow key={device.deviceId} label={label(device)} value={value(device)} />
        ))}
      </Group>
    </View>
  );
}

/** The share link kept for the next guest, which an owner forgets from here. */
function Kept({ store, onForgot }: { readonly store: Store; readonly onForgot: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <View>
      <GroupHeading>Guests go direct</GroupHeading>
      <Group testID="relay-kept">
        <GroupRow
          label="Tailscale share link"
          value="kept"
          trailing={
            <Button
              label="Forget"
              variant="plain"
              busy={busy}
              onPress={() => {
                setBusy(true);
                store
                  .forgetKeptShareLink()
                  .then(onForgot, () => undefined)
                  .finally(() => setBusy(false));
              }}
            />
          }
        />
      </Group>
      <GroupFoot>
        The next guest who asks gets this link, filled in for whichever owner answers.
      </GroupFoot>
    </View>
  );
}

/**
 * Before the relay goes: how many devices would lose the server and which, what happens to links,
 * and the two ways on.
 */
function TurnOffSheet({
  open,
  onClose,
  losing,
  label,
  selfId,
  serverUrl,
  onAsk,
  onTurnOff,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly losing: readonly RelayDevice[];
  readonly label: (device: RelayDevice) => string;
  readonly selfId: string;
  readonly serverUrl: string | undefined;
  readonly onAsk: () => Promise<unknown>;
  readonly onTurnOff: () => void;
}) {
  const palette = usePalette();
  const [busy, setBusy] = useState(false);
  const others = losing.some((device) => device.participantId !== selfId);
  return (
    <Sheet open={open} onClose={busy ? () => undefined : onClose} testID="relay-off-sheet">
      <SheetHead title="Turn the relay off?" />
      <View style={styles.sheet}>
        <Text style={[styles.lead, { color: palette.ink2 }]} testID="relay-off-lead">
          {turnOffLead(losing.length)}
        </Text>
        {losing.length === 0 ? null : (
          <View style={[styles.list, { backgroundColor: palette.surface }]}>
            {losing.map((device, index) => (
              <View
                key={device.deviceId}
                style={[
                  styles.row,
                  index === 0
                    ? null
                    : { borderTopColor: palette.line2, borderTopWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <Text style={[styles.rowLabel, { color: palette.ink }]} numberOfLines={1}>
                  {label(device)}
                </Text>
                <Text style={[styles.rowValue, { color: palette.ink3 }]}>
                  {directSince(device)}
                </Text>
              </View>
            ))}
          </View>
        )}
        <Text style={[styles.note, { color: palette.ink3 }]}>{turnOffNote(serverUrl)}</Text>
        {others ? (
          <Button
            label="Ask them to go direct first"
            variant="gold"
            busy={busy}
            onPress={() => {
              setBusy(true);
              onAsk()
                .catch(() => undefined)
                .finally(() => setBusy(false));
            }}
          />
        ) : null}
        <Button label="Turn off now" variant="danger" disabled={busy} onPress={onTurnOff} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // The switch opens the page, with no heading over it: the gap between groups stands above it
  // too, or it sat on the bar's hairline (the Duo simulator, 2 November 2026).
  page: { paddingTop: SPACE.lg, paddingBottom: SPACE.xxl * 2, gap: SPACE.lg },
  none: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.4, paddingHorizontal: SPACE.xl },
  sheet: { gap: SPACE.md, paddingHorizontal: SPACE.lg },
  lead: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.4, textAlign: "center" },
  list: { borderRadius: RADIUS.lg, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm + 2,
  },
  rowLabel: { flex: 1, fontSize: TEXT.md },
  rowValue: { fontSize: TEXT.sm },
  note: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4 },
});
