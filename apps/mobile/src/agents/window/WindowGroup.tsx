/**
 * An agent's Context window group on its card (ADR 0146, the mock's layout B), under its Model and
 * Heartbeat and above its Context: how full its harness says it is, as a big percent and "172k of
 * 272k tokens" over the window drawn as bars (`GaugeBars`), with the limit it compacts itself at as
 * a marker a finger drags along them, and past the fill faint bars up to how full its last long
 * turn got; Compact now, a pill under the bars beside what it last did or
 * is doing, which asks first in a sheet; a Compacts itself row under the gauge, with a switch where
 * the harness lets the limit be turned off; and a foot that says what compacting does.
 *
 * Only for its harness's owner, or an owner or admin of the workspace, and only while the harness
 * declares `context_windows` and has sent a copy (core's `mayChangeWindow`). Away, or kept read
 * only, the limit is quiet and a tap on it shows why in the Model group's hint.
 *
 * The copy is read again when the card comes to the front, when the agent stops working (its turn
 * may have filled or compacted it), and every two seconds while a Compact now is under way, so the
 * fill drains as the harness says it is done. A limit is laid over the copy while it saves, so the
 * marker stays where it was let go and the row says "Saving to …" at once.
 *
 * The last copy read is kept while the app runs, so the card opened again draws it at once. Before
 * the first, the gauge stands blank with a light running along its bars (`Waiting`), and when the
 * copy lands its fill climbs and its number counts up with it (ADR 0238, the mock's B). A harness
 * with no copy of this agent yet, or that sends no windows, leaves the heading and a line that
 * says so.
 */

import {
  compactNow,
  compactSheet,
  compactWords,
  harnessOf,
  limitWhenOn,
  mayChangeWindow,
  nameOf,
  noCopy,
  notSharedWords,
  type Snapshot,
  type Store,
  saveWindowLimit,
  settingLook,
  windowFoot,
  windowGauge,
  windowNotYetWords,
  windowRows,
  windowSaveWords,
} from "@chipschat/core";
import type { AgentContextWindowView, WindowLimitAsk } from "@chipschat/protocol";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { recall, remember } from "../../context/memory";
import { ConfirmSheet } from "../../spaces/ConfirmSheet";
import { Avatar } from "../../ui/Avatar";
import { Group, GroupFoot, GroupHeading, GroupRow } from "../../ui/Group";
import { Lands } from "../../ui/growing";
import * as feel from "../../ui/haptics";
import { usePalette } from "../../ui/theme";
import { type Palette, SPACE, TEXT } from "../../ui/tokens";
import { useReduceMotion } from "../../ui/useReduceMotion";
import { Hint, ReadFrom } from "../model/ModelGroup";
import { NotShared, useStood, WaitingWindow } from "../Waiting";
import { GaugeBars, type GaugeGhost } from "./GaugeBars";

/** How long a save's or a compaction's trouble stays where it is said. */
const SAID_MS = 4000;

const keyOf = (agentId: string) => `window:${agentId}`;

/** Where the copy drawn came from: kept from before, or just read, when the fill climbs to it. */
type Came = "kept" | "read";

export interface WindowCard {
  /** The group, for the card's scroll; nothing for anybody who may not see it. */
  readonly group: ReactNode;
  /** The sheet and the hint, beside the scroll. */
  readonly overlays: ReactNode;
}

type Tone = ReturnType<typeof windowGauge>["tone"];

/** The fill's colour: the context ring's tone. */
function inkOf(tone: Tone, palette: Palette): string {
  if (tone === "hot") return palette.red;
  if (tone === "warn") return palette.amber;
  return palette.ink;
}

/** Its last long turn as the bars draw it: in its own tone, quiet as the fill is. */
function ghostOf(
  gauge: ReturnType<typeof windowGauge>,
  quiet: boolean,
  palette: Palette,
): GaugeGhost | undefined {
  const ghost = gauge.ghost;
  if (ghost === undefined) return undefined;
  const words: Record<Tone, string> = {
    neutral: palette.ink3,
    warn: palette.amberInk,
    hot: palette.red,
  };
  return {
    bars: ghost.bars,
    ink: quiet ? palette.ink4 : inkOf(ghost.tone, palette),
    words: ghost.words,
    percent: `${ghost.percent}%`,
    wordsInk: quiet ? palette.ink4 : words[ghost.tone],
  };
}

export function useWindowGroup({
  store,
  snapshot,
  agentId,
  selfId,
  focus,
  working,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly agentId: string;
  readonly selfId: string;
  /** How many times the card has come to the front: each time, the copy is read again. */
  readonly focus: number;
  /** Whether the agent is working now: when it stops, the copy is read again. */
  readonly working: boolean;
}): WindowCard {
  const palette = usePalette();
  const { directory } = snapshot;
  const may = mayChangeWindow(snapshot.model, directory, agentId, selfId);
  const look = settingLook(snapshot.model, directory, agentId, selfId, "window");
  const agent = directory[agentId];
  const agentName = agent?.displayName ?? nameOf(directory, agentId);
  const harness = nameOf(directory, harnessOf(directory, agentId));
  const [view, setView] = useState<AgentContextWindowView | undefined>(() =>
    may ? recall<AgentContextWindowView>(keyOf(agentId)) : undefined,
  );
  /** The first read on its way, and what it found: a copy, none yet (`404`), or no answer. */
  const [reading, setReading] = useState<"asking" | "read" | "none_yet" | "failed">("asking");
  const came = useRef<Came>(view === undefined ? "read" : "kept");
  /** Under the Compacts itself row, a limit's trouble; beside the pill, a compaction's. */
  const [said, setSaid] = useState<{ readonly limit?: string; readonly compact?: string }>({});
  const [asking, setAsking] = useState(false);
  const [hint, setHint] = useState<{ words: string; at: number } | undefined>(undefined);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const read = useCallback(() => {
    store.readAgentContextWindow(agentId).then(
      (now) => {
        remember(keyOf(agentId), now);
        if (!alive.current) return;
        setView(now);
        setReading("read");
      },
      // Not sent yet: say so. No answer: the last copy stands, or the group goes.
      (error: unknown) => {
        if (!alive.current) return;
        setReading(noCopy(error) ? "none_yet" : "failed");
        if (noCopy(error)) setView(undefined);
      },
    );
  }, [store, agentId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `focus` and `working` are when to read it again.
  useEffect(() => {
    if (!may) {
      setView(undefined);
      return;
    }
    read();
  }, [may, read, focus, working]);

  const say = (words: { limit?: string; compact?: string }) => {
    setSaid(words);
    setTimeout(() => alive.current && setSaid({}), SAID_MS);
  };

  const saveLimit = async (ask: WindowLimitAsk) => {
    setSaid({});
    setView((was) =>
      was === undefined
        ? was
        : {
            ...was,
            change: {
              change_id: "chg_asking",
              state: "waiting",
              at: ask.at,
              asked_at: new Date().toISOString(),
            },
          },
    );
    const outcome = await saveWindowLimit(store, agentId, ask, { alive: () => alive.current });
    if (!alive.current) return;
    const now =
      outcome.view ?? (await store.readAgentContextWindow(agentId).catch(() => undefined));
    if (!alive.current) return;
    if (now !== undefined) {
      remember(keyOf(agentId), now);
      setView(now);
    }
    if (outcome.state !== "saved")
      say({ limit: windowSaveWords(outcome.state, harness, outcome.message) });
  };

  const compact = async () => {
    setAsking(false);
    setSaid({});
    setView((was) =>
      was === undefined
        ? was
        : {
            ...was,
            compaction: {
              change_id: "chg_asking",
              state: "waiting",
              asked_at: new Date().toISOString(),
            },
          },
    );
    const outcome = await compactNow(store, agentId, {
      alive: () => alive.current,
      onView: (now) => alive.current && setView(now),
    });
    if (!alive.current) return;
    const now =
      outcome.view ?? (await store.readAgentContextWindow(agentId).catch(() => undefined));
    if (!alive.current) return;
    if (now !== undefined) {
      remember(keyOf(agentId), now);
      setView(now);
    }
    if (outcome.state === "done") feel.success();
    else say({ compact: compactWords(outcome.state, harness, now, outcome.message) });
  };

  const stood = useStood(may && view === undefined && reading === "asking");
  if (look === "not_shared") {
    return {
      group: (
        <NotShared
          group="window"
          words={notSharedWords("window", directory, agentId)}
          testID="window-not-shared"
        />
      ),
      overlays: null,
    };
  }
  if (!may) return { group: null, overlays: null };
  if (view === undefined) {
    if (reading === "asking") {
      return {
        group: <WaitingWindow harnessName={harness} agentName={agentName} />,
        overlays: null,
      };
    }
    if (reading === "none_yet") {
      return {
        group: (
          <NotShared
            group="window"
            words={windowNotYetWords(directory, agentId)}
            testID="window-not-yet"
            after={stood}
          />
        ),
        overlays: null,
      };
    }
    return { group: null, overlays: null };
  }
  const rows = windowRows(view, agentName, harness, Date.now());
  const quietly = () => {
    const words = rows.hint ?? "";
    setHint({ words, at: Date.now() });
    AccessibilityInfo.announceForAccessibility(words);
    read();
  };
  const sheet = compactSheet(view, agentName, working);
  return {
    group: (
      <WindowGroup
        climb={came.current === "read"}
        after={stood}
        view={view}
        agentName={agentName}
        harness={harness}
        rows={rows}
        said={said}
        onPick={(at) => {
          if (at !== view.limit?.at) void saveLimit({ at });
        }}
        onSwitch={(on) => void saveLimit({ at: on ? limitWhenOn(view) : null })}
        onCompact={() => setAsking(true)}
        onQuiet={quietly}
      />
    ),
    overlays: (
      <>
        <ConfirmSheet
          open={asking}
          onClose={() => setAsking(false)}
          onGone={() => undefined}
          room={{
            face: <Avatar name={agentName} kind="agent" size="row" icon={agent?.face} decorative />,
            name: agentName,
            last: sheet.sub,
          }}
          confirming={{
            asking: { title: sheet.title, body: sheet.body, note: sheet.after, confirm: "Compact" },
            tone: palette.gold,
            // The mark on gold, whichever the appearance: gold does not change (`Button`'s gold).
            ink: "#14161b",
            busy: false,
          }}
          onConfirm={() => void compact()}
        />
        {hint === undefined ? null : <Hint key={hint.at} words={hint.words} />}
      </>
    ),
  };
}

function WindowGroup({
  view,
  agentName,
  harness,
  rows,
  said,
  onPick,
  onSwitch,
  onCompact,
  onQuiet,
  climb,
  after,
}: {
  /** Just read, not kept from before: the fill climbs to it and the number counts up. */
  readonly climb: boolean;
  /** Whether a blank stood for it: then what is under its heading comes in (`Lands`). */
  readonly after: boolean;
  readonly view: AgentContextWindowView;
  readonly agentName: string;
  readonly harness: string;
  readonly rows: ReturnType<typeof windowRows>;
  readonly said: { readonly limit?: string; readonly compact?: string };
  readonly onPick: (at: number) => void;
  readonly onSwitch: (on: boolean) => void;
  readonly onCompact: () => void;
  readonly onQuiet: () => void;
}) {
  const palette = usePalette();
  const gauge = windowGauge(view);
  const ink = inkOf(gauge.tone, palette);
  const big = useCountUp(gauge.percent, climb);
  return (
    <View testID="window-group">
      <GroupHeading
        trailing={<ReadFrom view={view} harnessName={harness} testID="window-read-from" />}
      >
        Context window
      </GroupHeading>
      <Lands after={after}>
        <Group>
          <View style={[styles.gauge, { backgroundColor: palette.surface }]} testID="window-gauge">
            <View style={styles.top} accessible accessibilityLabel={gauge.label}>
              <Text
                style={[styles.big, { color: gauge.tone === "neutral" ? palette.ink : ink }]}
                testID="window-percent"
              >
                {big === gauge.percent ? gauge.big : `${big}%`}
              </Text>
              <Text style={[styles.tokens, { color: palette.ink3 }]} testID="window-tokens">
                {gauge.tokens}
              </Text>
            </View>
            <GaugeBars
              lit={gauge.lit}
              ink={rows.quiet ? palette.ink4 : ink}
              marker={gauge.marker}
              choices={view.limit?.choices ?? []}
              drags={rows.drags}
              quiet={rows.quiet}
              compacting={rows.compact.busy}
              end={gauge.end}
              ghost={ghostOf(gauge, rows.quiet, palette)}
              climb={climb}
              onPick={onPick}
              onQuiet={onQuiet}
            />
            <View style={styles.act}>
              <Text style={[styles.note, { color: palette.ink3 }]} testID="window-note">
                {said.compact ?? rows.note}
              </Text>
              <CompactPill
                compact={rows.compact}
                hint={rows.compact.quiet ? (view.why_not ?? rows.hint) : "Asks first"}
                onPress={onCompact}
              />
            </View>
          </View>
          {rows.auto === undefined ? null : (
            <AutoRow auto={rows.auto} quiet={rows.quiet} said={said.limit} onSwitch={onSwitch} />
          )}
        </Group>
        <GroupFoot testID="window-foot">{windowFoot(view, agentName, harness)}</GroupFoot>
      </Lands>
    </View>
  );
}

/** How long the number takes to count up to the fill: the bars' sweep. */
const COUNT_MS = 1100;

/**
 * The number over the bars, counting up from none as the fill climbs on the copy's first draw, and
 * where it is at once for a copy kept from before, under Reduce Motion, or when it moves later.
 */
function useCountUp(percent: number, climb: boolean): number {
  const less = useReduceMotion();
  const [shown, setShown] = useState(climb && !less ? 0 : percent);
  const counted = useRef(!climb || less);
  useEffect(() => {
    if (counted.current) {
      setShown(percent);
      return;
    }
    counted.current = true;
    const start = Date.now();
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / COUNT_MS);
      setShown(Math.round(percent * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [percent]);
  return shown;
}

/** Compact now, in the gauge: working while it is on its way or under way, quiet when it can't. */
function CompactPill({
  compact,
  hint,
  onPress,
}: {
  readonly compact: ReturnType<typeof windowRows>["compact"];
  readonly hint: string | undefined;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  const off = compact.busy || compact.quiet;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={compact.label}
      accessibilityState={{ disabled: off, busy: compact.busy }}
      accessibilityHint={hint}
      disabled={off}
      onPress={onPress}
      testID="window-compact"
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: pressed ? palette.surface3 : palette.surface2 },
        pressed ? styles.pressed : null,
      ]}
    >
      {compact.busy ? <ActivityIndicator size="small" color={palette.ink2} /> : null}
      <Text
        style={[
          styles.pillWords,
          { color: compact.quiet && !compact.busy ? palette.ink4 : palette.ink },
        ]}
      >
        {compact.label}
      </Text>
    </Pressable>
  );
}

/** Compacts itself, under the gauge: what the marker means, with a switch where it may go off. */
function AutoRow({
  auto,
  quiet,
  said,
  onSwitch,
}: {
  readonly auto: NonNullable<ReturnType<typeof windowRows>["auto"]>;
  readonly quiet: boolean;
  readonly said: string | undefined;
  readonly onSwitch: (on: boolean) => void;
}) {
  return (
    <GroupRow
      label="Compacts itself"
      sub={said ?? auto.sub}
      tone={quiet ? "off" : "plain"}
      trailing={
        auto.switch ? (
          <Switch
            testID="window-switch"
            accessibilityLabel="Compacts itself"
            value={auto.on}
            disabled={quiet || auto.saving}
            onValueChange={onSwitch}
          />
        ) : undefined
      }
      testID="window-auto"
    />
  );
}

const styles = StyleSheet.create({
  gauge: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.lg, paddingBottom: 14 },
  top: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: SPACE.md,
  },
  big: { fontSize: 34, fontWeight: "700", letterSpacing: -0.7, fontVariant: ["tabular-nums"] },
  tokens: { fontSize: TEXT.sm, fontVariant: ["tabular-nums"] },
  act: { flexDirection: "row", alignItems: "center", gap: SPACE.md, marginTop: 14 },
  note: { flex: 1, fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.35 },
  pill: {
    height: 40,
    paddingHorizontal: SPACE.lg,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
  },
  pressed: { transform: [{ scale: 0.96 }] },
  pillWords: { fontSize: TEXT.md, fontWeight: "600" },
});
