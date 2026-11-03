/**
 * The setup card at the top of Spaces on the phone (ADR 0170): the same six steps the Mac and the
 * web show, from what this phone knows (core's `setupSteps`), with the thing to do beside each one
 * left. When the last is done it says "You're set up" for a moment and folds away; the × puts it
 * away on this phone.
 *
 * Flat, as the controls are: what moves is each tick landing and the card folding up.
 */

import {
  type Device,
  isDemo,
  ownsWorkspace,
  type PairedDeviceRecord,
  relaySettled,
  type ServerFacts,
  type SetupStep,
  type SetupStepId,
  type Snapshot,
  type Store,
  setupSteps,
} from "@chipschat/core";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { isPad } from "../device/word";
import { readSetting, SETTINGS, writeSetting } from "../prefs";
import { pushIsOn, turnOnPush } from "../push/turnOn";
import { Arrive } from "../ui/Arrive";
import { Card } from "../ui/Card";
import { Icon } from "../ui/Icon";
import { RiseIn } from "../ui/SwitchMotion";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";

/** How long "You're set up" stands before the card folds, and how long the fold takes. */
export const SET_UP_STANDS_MS = 1800;
export const SET_UP_FOLDS_MS = 520;

const ACTION_WORDS: Partial<Record<SetupStepId, string>> = {
  hello: "Add one",
  notify: "Turn on",
  away: "Set up",
};

/**
 * What each workspace's card last read, by what and whose, for as long as the app is open: a
 * workspace switched back to draws its card in its first frame from what it read last, and reads
 * again. Read afresh from nothing, the card came a beat after the rooms had risen into place, and
 * pushed them down (ADR 0197's addendum, the simulator, 19 October 2026).
 */
const lastRead = new Map<string, unknown>();

/** Something read from the server now and again, while the card can use it, kept as `keep`. */
function useEvery<T>(
  read: () => Promise<T>,
  everyMs: number | undefined,
  keep: string,
): T | undefined {
  const [value, setValue] = useState<T | undefined>(() => lastRead.get(keep) as T | undefined);
  useEffect(() => {
    let live = true;
    const once = () =>
      void Promise.resolve()
        .then(read)
        .then(
          (next) => {
            lastRead.set(keep, next);
            if (live) setValue(next);
          },
          () => undefined,
        );
    once();
    const timer = everyMs === undefined ? undefined : setInterval(once, everyMs);
    const back = AppState.addEventListener("change", (state) => {
      if (state === "active") once();
    });
    return () => {
      live = false;
      if (timer !== undefined) clearInterval(timer);
      back.remove();
    };
  }, [read, everyMs, keep]);
  return value;
}

export interface Setup {
  /**
   * Whether the card is this person's here: the owner's, not put away on this phone, and every
   * step read, so that the steps are what is true and not what hasn't answered yet.
   */
  readonly theirs: boolean;
  /** Everything the card is decided by has been read, mine or not: it is there or not for good. */
  readonly decided: boolean;
  readonly steps: readonly SetupStep[];
  readonly onHide: () => void;
  readonly onTurnOn: () => void;
}

/** The six steps as this phone knows them, and the two things a person does from the card. */
export function useSetup(store: Store, snapshot: Snapshot, device: Device | undefined): Setup {
  const deviceId = device?.deviceId ?? "";
  // The demo's made-up workspace (ADR 0213) has nothing to set up: no card, decided at once.
  const owner = !isDemo(device) && ownsWorkspace(snapshot.directory, device?.participantId);
  const hiddenKey = `${SETTINGS.setupHidden}.${deviceId}`;
  const [hidden, setHidden] = useState<boolean | undefined>(
    () => lastRead.get(hiddenKey) as boolean | undefined,
  );
  const [pushTick, setPushTick] = useState(0);
  useEffect(() => {
    let live = true;
    void readSetting(hiddenKey)
      .catch(() => undefined)
      .then((kept) => {
        lastRead.set(hiddenKey, kept === "1");
        if (live) setHidden(kept === "1");
      });
    return () => {
      live = false;
    };
  }, [hiddenKey]);
  // Read again once an owner turns the relay, when the server has done what the switch says
  // (`relaySettled`), so Away from home follows the switch rather than a read a minute old.
  const relayAt = snapshot.model.relay?.at;
  const facts = useEvery<ServerFacts>(
    useCallback(async () => {
      await relaySettled(relayAt);
      return store.serverFacts();
    }, [store, relayAt]),
    60_000,
    `facts.${deviceId}`,
  );
  const devices = useEvery<readonly PairedDeviceRecord[]>(
    useCallback(() => store.devices(), [store]),
    owner && hidden === false ? 15_000 : undefined,
    `devices.${deviceId}`,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again when turned on from here.
  const readPush = useCallback(() => pushIsOn(), [pushTick]);
  const push = useEvery(readPush, undefined, "push");
  const read = facts !== undefined && devices !== undefined && push !== undefined;
  const steps = setupSteps({
    server: facts,
    here: isPad() ? "ipad" : Platform.OS === "android" ? "android" : "phone",
    devices,
    model: snapshot.model,
    directory: snapshot.directory,
    notifications: push !== false && push !== undefined,
  });
  return {
    theirs: owner && hidden === false && read,
    decided: !owner || hidden === true || (hidden === false && read),
    steps,
    onHide: () => {
      setHidden(true);
      lastRead.set(hiddenKey, true);
      void writeSetting(hiddenKey, "1").catch(() => undefined);
    },
    onTurnOn: () => {
      if (device === undefined) return;
      void turnOnPush(device).then(() => setPushTick((tick) => tick + 1));
    },
  };
}

function Row({
  step,
  action,
  onAction,
}: {
  readonly step: SetupStep;
  readonly action: string | undefined;
  readonly onAction: () => void;
}) {
  const palette = usePalette();
  return (
    <View style={styles.row} testID={`setup-${step.id}`}>
      {step.done ? (
        <Arrive from={0.5} bounce={7}>
          <View style={[styles.tick, { backgroundColor: palette.green }]}>
            <Text style={styles.tickMark}>✓</Text>
          </View>
        </Arrive>
      ) : (
        <View style={[styles.tick, styles.todo, { borderColor: palette.line }]} />
      )}
      <Text style={[styles.words, { color: step.done ? palette.ink : palette.ink2 }]}>
        {step.title}
        {step.detail === undefined ? null : (
          <Text style={{ color: palette.ink3, fontSize: TEXT.sm }}> {step.detail}</Text>
        )}
      </Text>
      {action === undefined ? null : (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.action, { color: palette.blueInk }]}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function SetupCard({
  steps,
  onHide,
  onAction,
}: {
  readonly steps: readonly SetupStep[];
  readonly onHide: () => void;
  readonly onAction: (id: SetupStepId) => void;
}) {
  const palette = usePalette();
  const done = steps.filter((step) => step.done).length;
  return (
    <Card testID="setup-card" style={styles.card}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: palette.ink }]}>
          {done === steps.length ? "You're set up" : "Finish setting up"}
        </Text>
        <Text style={[styles.count, { color: palette.ink3 }]} testID="setup-count">
          {done} of {steps.length}
        </Text>
        <Pressable
          onPress={onHide}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Hide"
          testID="setup-hide"
        >
          <Icon name="x" size={14} color={palette.ink3} />
        </Pressable>
      </View>
      <View style={styles.bar}>
        {steps.map((step, index) => (
          <View
            key={step.id}
            style={[
              styles.segment,
              { backgroundColor: index < done ? palette.green : palette.surface3 },
            ]}
          />
        ))}
      </View>
      <View style={styles.rows}>
        {steps.map((step) => (
          <Row
            key={step.id}
            step={step}
            action={step.done || step.blocked === true ? undefined : ACTION_WORDS[step.id]}
            onAction={() => onAction(step.id)}
          />
        ))}
      </View>
    </Card>
  );
}

type RailPhase = "unread" | "left" | "standing" | "gone";

/** The rail's next phase, when what is read or what is done changes. */
function railPhase(now: RailPhase, theirs: boolean, all: boolean): RailPhase {
  if (now === "unread") {
    if (!theirs) return "unread";
    return all ? "gone" : "left";
  }
  if (!all) return "left";
  return now === "left" ? "standing" : now;
}

/**
 * The card while it has something to say: drawn while steps are left, and, once the last is done
 * while it is on screen, "You're set up" for a moment before it folds up. A phone that was set up
 * before it ever drew the card never draws it: what is left is first decided once every step has
 * been read, since a cold start mounts the rail before anything has answered, and a rail that took
 * that as "steps left" stood "You're set up" up on every start as the answers came in.
 */
export function SetupRail({
  setup,
  rising = false,
}: {
  readonly setup: Setup;
  /** The workspace has just taken the front: the card rises first, the rooms after (ADR 0197). */
  readonly rising?: boolean;
}) {
  const router = useRouter();
  const all = setup.steps.every((step) => step.done);
  const [phase, setPhase] = useState<RailPhase>("unread");
  const height = useRef<number | undefined>(undefined);
  const fold = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    setPhase((now) => railPhase(now, setup.theirs, all));
  }, [setup.theirs, all]);
  useEffect(() => {
    if (phase !== "standing") return;
    const timer = setTimeout(() => {
      Animated.timing(fold, {
        toValue: 0,
        duration: SET_UP_FOLDS_MS,
        useNativeDriver: false,
      }).start(() => setPhase("gone"));
    }, SET_UP_STANDS_MS);
    return () => clearTimeout(timer);
  }, [phase, fold]);
  if (!setup.theirs || phase === "unread" || phase === "gone") return null;
  const act = (id: SetupStepId) => {
    if (id === "notify") setup.onTurnOn();
    if (id === "hello") router.push("/agents");
    // The relay switch, where Away from home is done for anybody without Tailscale (ADR 0245).
    if (id === "away") router.push("/relay");
  };
  const rail = (
    <Animated.View
      onLayout={(event) => {
        height.current ??= event.nativeEvent.layout.height;
      }}
      style={[
        styles.fold,
        phase === "standing" && height.current !== undefined
          ? {
              opacity: fold,
              maxHeight: fold.interpolate({ inputRange: [0, 1], outputRange: [0, height.current] }),
            }
          : null,
      ]}
    >
      <SetupCard steps={setup.steps} onHide={setup.onHide} onAction={act} />
    </Animated.View>
  );
  return rising ? <RiseIn order={0}>{rail}</RiseIn> : rail;
}

const styles = StyleSheet.create({
  // In from the list's sides as far as the screen's name above it, as Agents' cards are: it stood
  // edge to edge, its corners against the window and the split's rule (the iPad simulator, 16
  // October 2026).
  fold: { overflow: "hidden", paddingBottom: SPACE.md, paddingHorizontal: SPACE.lg },
  card: { gap: SPACE.sm },
  head: { flexDirection: "row", alignItems: "baseline", gap: SPACE.sm },
  title: { flex: 1, fontSize: TEXT.md, fontWeight: "600" },
  count: { fontSize: TEXT.sm, fontVariant: ["tabular-nums"] },
  bar: { flexDirection: "row", gap: 4 },
  segment: { flex: 1, height: 5, borderRadius: 3 },
  rows: { gap: 7, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 9 },
  tick: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  todo: { borderWidth: 1.5, backgroundColor: "transparent" },
  tickMark: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  words: { flex: 1, fontSize: TEXT.md },
  action: { fontSize: TEXT.md, fontWeight: "600" },
});
