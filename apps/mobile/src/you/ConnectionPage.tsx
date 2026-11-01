/**
 * Connection (ADR 0211): which way this phone reaches its server, drawn and said. Until now it was
 * one row in You's group for this phone, "Relay" or "Direct", which told nobody why one is slower
 * than the other or what the relay can see.
 *
 * The page draws the route — this phone, the relay when the socket goes through it, the server —
 * with traffic running along it, says how long a round trip takes now (a signed read of the
 * server's health every five seconds while the page is open, the middle of the last three), what
 * the path means in plain words, and since when it has gone that way and how it went before.
 *
 * When the phone leaves the relay while the page is open — Tailscale turned on, home again — the
 * relay's stop fades off the line, the line straightens, and a toast says the time now against the
 * time before. The transport does the move itself (`goDirect`, make-before-break); the page only
 * shows it.
 *
 * Phase 2: on the relay, an owner whose server is on a tailnet gets Go direct, a guide that waits
 * on Tailscale (`GoDirectSheet`). A phone with a relay to leave gets Only direct, offered once it
 * has reached its server directly: on, it never uses the relay, and when it cannot connect the page
 * says that is why.
 *
 * Phase 3: somebody who is not an owner gets Go direct too, a guide that asks an owner to share
 * the server with them in Tailscale first (`GoDirectSheet`'s `guest`). Their ask is read again
 * whenever the page comes forward.
 *
 * Phase 4: an owner may turn the server's relay off. A phone that heard it and has lost the server
 * says who turned it off and when, and where the server is still reached, while it is lost and
 * while it tries again; Go direct stays offered then, since going direct is the way back.
 */

import {
  askDirectWords,
  askSeen,
  beforeWords,
  type Device,
  goDirectWords,
  type LinkStretch,
  middleOf,
  myRole,
  onlyDirectFoot,
  onlyDirectLostWords,
  overWhat,
  type RelayState,
  relayOffWords,
  type Snapshot,
  type Store,
  sinceWords,
  tailnetOf,
  tripWords,
  turnedBy,
  type Way,
  wayOf,
  wayTitle,
  wayWords,
  wentDirectWords,
} from "@chipschat/core";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useSnapshot } from "../store/provider";
import { Group, GroupFoot, GroupRow, MARKED_INSET, RowMark } from "../ui/Group";
import { success } from "../ui/haptics";
import { UnderName, useColumn } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { Route } from "./ConnectionRoute";
import { GoDirectSheet, type GuestAsk } from "./GoDirectSheet";
import { hostOf } from "./words";

/** How often the round trip is measured while the page is open. */
export const TRIP_EVERY_MS = 5000;
/** How many measures the number is the middle of. */
const TRIPS_KEPT = 3;
/** How long the toast stays after the phone goes direct. */
const TOAST_MS = 4000;

export function ConnectionPage({
  store,
  device,
}: {
  readonly store: Store;
  readonly device: Device;
}) {
  const snapshot = useSnapshot(store);
  const column = useColumn();
  const machine = useMachine(store, device);
  const way = wayOf(snapshot.connection, snapshot.link);
  const connected = way === "relay" || way === "direct";
  const { trip, before } = useRoundTrips(store, connected, snapshot.link);
  const toast = useWentDirect(snapshot.link, trip, before);
  const tailnet = tailnetOf(device.serverUrl);
  const owner = myRole(snapshot.model, device.participantId) === "owner";
  const guest = useGuestAsk(store, !owner && tailnet !== undefined, trip);
  const relayOff = relayOffOf(snapshot, device.participantId);
  return (
    <UnderName contentContainerStyle={[styles.page, column]} testID="connection-page">
      <WayCard
        way={way}
        machine={machine}
        trip={trip}
        device={device}
        onlyDirect={snapshot.onlyDirect === true}
        relayOff={relayOff}
      />
      {tailnet !== undefined ? (
        <GoDirect
          store={store}
          machine={machine}
          tailnet={tailnet}
          offered={goDirectOffered(way, relayOff)}
          direct={snapshot.link !== undefined && snapshot.link !== "relay"}
          guest={owner ? undefined : guest}
        />
      ) : null}
      {device.relayUrl === undefined ? null : (
        <OnlyDirect
          store={store}
          on={snapshot.onlyDirect === true}
          offered={snapshot.wentDirect === true}
          serverUrl={device.serverUrl}
        />
      )}
      <History
        since={snapshot.linkSince}
        before={snapshot.linkBefore}
        serverUrl={device.serverUrl}
      />
      {/* Said only while it is still so: back on the relay, or lost, within its time, it goes. */}
      {toast === undefined || way !== "direct" ? null : <Toast words={toast} />}
    </UnderName>
  );
}

/** The way, drawn and said: its title, the route, the round trip and what it means. */
function WayCard({
  way,
  machine,
  trip,
  device,
  onlyDirect,
  relayOff,
}: {
  readonly way: Way;
  readonly machine: string;
  readonly trip: number | undefined;
  readonly device: Device;
  readonly onlyDirect: boolean;
  /** The relay an owner turned off, with their name. */
  readonly relayOff: RelayState | undefined;
}) {
  const palette = usePalette();
  const connected = way === "relay" || way === "direct";
  // A relay to leave: one the device knows of, and Only direct not keeping it from it.
  const relayed = device.relayUrl !== undefined && !onlyDirect;
  return (
    <View style={[styles.card, { backgroundColor: palette.surface }]} testID="connection-card">
      <View style={styles.title}>
        <View style={[styles.dot, { backgroundColor: dotOf(way, palette) }]} />
        <Text style={[styles.titleText, { color: palette.ink }]} testID="connection-path">
          {wayTitle(way, machine)}
        </Text>
      </View>
      <Route
        // With Only direct on, the line to the server's own address is the one there is.
        direct={way === "direct" || onlyDirect}
        moving={connected}
        relayHost={device.relayUrl === undefined ? "the relay" : hostOf(device.relayUrl)}
        machine={machine}
        over={overWhat(device.serverUrl)}
      />
      {connected ? (
        <View style={styles.trip}>
          <Text style={[styles.tripNumber, { color: palette.ink }]} testID="connection-trip">
            {tripWords(trip)}
          </Text>
          <Text style={[styles.tripLabel, { color: palette.ink3 }]}>round trip</Text>
        </View>
      ) : null}
      <Text style={[styles.words, { color: palette.ink2 }]} testID="connection-words">
        {lostWords(way, machine, device, onlyDirect, relayOff) ??
          wayWords(way, machine, device.serverUrl, relayed)}
      </Text>
    </View>
  );
}

/** The relay an owner turned off, with their name: the reason a phone on it cannot connect. */
function relayOffOf(snapshot: Snapshot, selfId: string): RelayState | undefined {
  const relay = snapshot.model.relay;
  if (relay?.on !== false) return undefined;
  return { ...relay, by: turnedBy(relay.by, snapshot.directory, selfId) };
}

/** Go direct is offered on the relay, and with the relay off while not connected, as the way back. */
function goDirectOffered(way: Way, relayOff: RelayState | undefined): boolean {
  return way === "relay" || (way !== "direct" && relayOff !== undefined);
}

/** Why the phone cannot connect, when it knows: Only direct, or the relay turned off. */
function lostWords(
  way: Way,
  machine: string,
  device: Device,
  onlyDirect: boolean,
  relayOff: RelayState | undefined,
): string | undefined {
  if (way === "lost" && onlyDirect) return onlyDirectLostWords(machine, "phone", device.serverUrl);
  // Lost, or trying again: either way it is the relay being off that keeps it from the server.
  if (way === "relay" || way === "direct" || relayOff === undefined) return undefined;
  return relayOffWords(relayOff.by, relayOff.at, machine, device.serverUrl);
}

/**
 * Go direct, for a server on a tailnet: the row while the phone is on the relay, and the guide it
 * opens, which stays up through the move to show every step green. Somebody who is not an owner
 * is guided through an ask (`guest`).
 */
function GoDirect({
  store,
  machine,
  tailnet,
  offered,
  direct,
  guest,
}: {
  readonly store: Store;
  readonly machine: string;
  readonly tailnet: string;
  readonly offered: boolean;
  readonly direct: boolean;
  readonly guest?: GuestAsk | undefined;
}) {
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      {offered ? (
        <Group inset={MARKED_INSET} testID="go-direct">
          <GroupRow
            label="Go direct"
            sub={guest === undefined ? goDirectWords("phone") : askDirectWords("phone")}
            subLines={3}
            mark={<RowMark icon="bolt" tint={palette.green} ink="#ffffff" />}
            onPress={() => setOpen(true)}
            testID="go-direct-row"
          />
        </Group>
      ) : null}
      <GoDirectSheet
        open={open}
        onClose={close}
        store={store}
        machine={machine}
        tailnet={tailnet}
        direct={direct}
        guest={guest}
      />
    </>
  );
}

/**
 * A guest's own ask, read whenever the page comes forward, with who shared it by name, and how
 * to make one with the round trip now.
 */
function useGuestAsk(store: Store, asks: boolean, trip: number | undefined): GuestAsk {
  const snapshot = useSnapshot(store);
  useFocusEffect(
    useCallback(() => {
      if (asks) void store.readMyDirectAsk().catch(() => undefined);
    }, [store, asks]),
  );
  return {
    ask: askSeen(snapshot.myDirectAsk, snapshot.directory),
    onAsk: () => store.askToGoDirect(trip),
  };
}

/** Since when the socket has gone its way, and the way before, once there is a way. */
function History({
  since,
  before,
  serverUrl,
}: {
  readonly since: string | undefined;
  readonly before: LinkStretch | undefined;
  readonly serverUrl: string | undefined;
}) {
  if (since === undefined) return null;
  return (
    <Group testID="connection-history">
      <GroupRow label="Since" value={sinceWords(since)} />
      {before === undefined ? null : (
        <GroupRow label="Before that" value={beforeWords(before, serverUrl)} />
      )}
    </Group>
  );
}

/** A line said for a moment, over the foot of a page: the Relay page's too. */
export function Toast({
  words,
  testID = "connection-toast",
}: {
  readonly words: string;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  return (
    <View
      style={[styles.toast, { backgroundColor: palette.ink }]}
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <Text style={[styles.toastText, { color: palette.bg }]}>{words}</Text>
    </View>
  );
}

/**
 * Only direct, for a phone with a relay to leave: offered once it has reached its server
 * directly, since before then turning it on could only stop it connecting. Kept on the phone.
 */
function OnlyDirect({
  store,
  on,
  offered,
  serverUrl,
}: {
  readonly store: Store;
  readonly on: boolean;
  readonly offered: boolean;
  readonly serverUrl: string | undefined;
}) {
  return (
    <View>
      <Group testID="only-direct">
        <GroupRow
          label="Only direct"
          trailing={
            <Switch
              testID="only-direct-switch"
              accessibilityLabel="Only direct"
              value={on}
              disabled={!offered && !on}
              accessibilityState={{ disabled: !offered && !on, checked: on }}
              onValueChange={(next) => void store.setOnlyDirect(next)}
            />
          }
        />
      </Group>
      <GroupFoot testID="only-direct-foot">
        {onlyDirectFoot(offered || on, "phone", serverUrl)}
      </GroupFoot>
    </View>
  );
}

function dotOf(way: Way, palette: ReturnType<typeof usePalette>): string {
  if (way === "direct") return palette.green;
  if (way === "relay") return palette.gold;
  if (way === "lost") return palette.red;
  return palette.ink4;
}

/** The machine each store's server named last, for a page opened while it cannot be asked. */
const named = new WeakMap<Store, string>();

/** The server's machine, as the server names it ("Arjun's Mac mini"), else its address's name. */
export function useMachine(store: Store, device: Device): string {
  const [machine, setMachine] = useState<string | undefined>(() => named.get(store));
  useEffect(() => {
    let live = true;
    store.serverFacts().then(
      (facts) => {
        if (facts.machine === "") return;
        named.set(store, facts.machine);
        if (live) setMachine(facts.machine);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [store]);
  return machine ?? machineOf(hostOf(device.serverUrl));
}

/** A name's first label ("adas-mac-mini"), or an address whole, which has no name to cut. */
function machineOf(host: string): string {
  if (host === "") return "your server";
  return /^[\d.:[\]]+$/.test(host) ? host : (host.split(".")[0] ?? host);
}

/**
 * The round trip now, measured while the page is in front and connected, and the one before the
 * socket last changed its way, for the toast. A new way starts the count again.
 */
function useRoundTrips(store: Store, connected: boolean, link: string | undefined) {
  const [trips, setTrips] = useState<readonly number[]>([]);
  const [before, setBefore] = useState<number | undefined>(undefined);
  const [seen, setSeen] = useState(link);
  if (seen !== link) {
    setSeen(link);
    setBefore(middleOf(trips));
    setTrips([]);
  }
  // A new way starts again at once: a read still on its way over the old one is dropped, and the
  // toast has the time now rather than five seconds from now.
  useFocusEffect(
    // biome-ignore lint/correctness/useExhaustiveDependencies: a new way measures again at once.
    useCallback(() => {
      if (!connected) return;
      let live = true;
      const measure = () => {
        store.roundTrip().then(
          (ms) => {
            if (live) setTrips((now) => [...now, ms].slice(-TRIPS_KEPT));
          },
          () => undefined,
        );
      };
      measure();
      const every = setInterval(measure, TRIP_EVERY_MS);
      return () => {
        live = false;
        clearInterval(every);
      };
    }, [store, connected, link]),
  );
  return { trip: middleOf(trips), before };
}

/** The toast's words for a few seconds after the socket leaves the relay, with a tap of success. */
function useWentDirect(
  link: string | undefined,
  trip: number | undefined,
  before: number | undefined,
) {
  const [shown, setShown] = useState(false);
  const last = useRef(link);
  useEffect(() => {
    const was = last.current;
    last.current = link;
    if (was !== "relay" || link === undefined || link === "relay") return;
    success();
    setShown(true);
    const hide = setTimeout(() => setShown(false), TOAST_MS);
    return () => clearTimeout(hide);
  }, [link]);
  return shown ? wentDirectWords(trip, before) : undefined;
}

const styles = StyleSheet.create({
  page: { paddingBottom: SPACE.xxl * 2, gap: SPACE.lg },
  card: {
    marginHorizontal: SPACE.lg,
    borderRadius: RADIUS.xxl,
    padding: SPACE.lg,
    gap: SPACE.md,
  },
  title: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  dot: { width: 9, height: 9, borderRadius: 5 },
  titleText: { fontSize: TEXT.lg, fontWeight: "600" },
  trip: { flexDirection: "row", alignItems: "baseline", gap: SPACE.sm },
  tripNumber: { fontSize: 30, fontWeight: "700", fontVariant: ["tabular-nums"] },
  tripLabel: { fontSize: TEXT.md },
  words: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.42 },
  toast: {
    alignSelf: "center",
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
  },
  toastText: { fontSize: TEXT.md, fontWeight: "600" },
});
