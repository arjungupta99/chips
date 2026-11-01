/**
 * An agent's Model group on its card (ADR 0141, the mock's layout B), between its facts and its
 * context: "Model" with its harness's mark and name at the right, and one row saying what it runs
 * on and how hard it thinks, with the bars, opening the sheet that changes both. Under the row, a
 * foot when there is something a row can't say: how many agents follow this one's, and why it
 * can't be changed now.
 *
 * Only for its harness's owner, or an owner or admin of the workspace, and only once the harness
 * has sent its copy (ADR 0140): anybody else's card has no Model group, and never asks.
 *
 * While the harness is away, or keeps the agent's model to itself, the row is quiet: grey, with no
 * chevron, and a tap shows why in a glass hint at the foot of the screen rather than opening the
 * sheet (ruling 7). The tap also reads the copy again, so a harness that is back opens next time.
 * A save that lands flashes the row gold as the sheet goes.
 *
 * The group sits in the card's scroll; the sheet and the hint stand beside it (`overlays`), as the
 * card's other sheets do, so the hint keeps to the foot of the screen.
 */

import {
  harnessOf,
  MODEL_GROUND_INDEX,
  modelRow,
  nameOf,
  notSharedWords,
  type Snapshot,
  type Store,
  settingLook,
} from "@chipschat/core";
import type { AgentModelView } from "@chipschat/protocol";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glow, HarnessMark } from "../../context/rows";
import { clockOrDay } from "../../spaces/when";
import { Capsule } from "../../ui/Glass";
import { Group, GroupFoot, GroupHeading, GroupRow, MARKED_INSET, RowMark } from "../../ui/Group";
import { Lands } from "../../ui/growing";
import { usePalette } from "../../ui/theme";
import { ICON_GROUNDS, SPACE } from "../../ui/tokens";
import { useReduceMotion } from "../../ui/useReduceMotion";
import { NotShared, StandingRow, useStood, WaitingGroup } from "../Waiting";
import { RowBars } from "./EffortBars";
import { ModelSheet } from "./ModelSheet";
import { useAgentModel, useModelSheet } from "./useAgentModel";

const NATIVE = Platform.OS !== "web";
/** How long the hint stays before it goes. */
const HINT_MS = 1600;

export interface ModelCard {
  /** The group, for the card's scroll; nothing for anybody who may not see it. */
  readonly group: ReactNode;
  /** The sheet and the hint, beside the scroll. */
  readonly overlays: ReactNode;
  /**
   * With `inGroup`, the row alone, for a group of the page's own (a harness's Set up, ADR 0254),
   * and what its foot says; `group` is then nothing.
   */
  readonly row?: ReactNode;
  readonly foot?: string | undefined;
}

export function useModelGroup({
  store,
  snapshot,
  agentId,
  selfId,
  focus,
  sayMissing = false,
  inGroup = false,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly agentId: string;
  readonly selfId: string;
  /** How many times the card has come to the front: each time, the copy is read again. */
  readonly focus: number;
  /** On an agent's card: a harness that doesn't share models leaves a line that says so. */
  readonly sayMissing?: boolean;
  /** The row and its foot alone, for a group the page draws itself (ADR 0254). */
  readonly inGroup?: boolean;
}): ModelCard {
  const { directory } = snapshot;
  const agent = directory[agentId];
  const agentName = agent?.displayName ?? nameOf(directory, agentId);
  const harnessName = nameOf(directory, harnessOf(directory, agentId));
  const { view, waiting, reread, took } = useAgentModel(store, snapshot, agentId, selfId, focus);
  const look = settingLook(snapshot.model, directory, agentId, selfId, "model");
  const [pulse, setPulse] = useState(0);
  const [hint, setHint] = useState<{ words: string; at: number } | undefined>(undefined);
  const handlers = useMemo(
    () => ({ took, landed: () => setPulse(Date.now()), closed: reread }),
    [took, reread],
  );
  const sheet = useModelSheet(store, agentId, handlers);
  const stood = useStood(waiting);
  if (sayMissing && look === "not_shared") {
    return {
      group: (
        <NotShared
          group="model"
          words={notSharedWords("model", directory, agentId)}
          testID="model-not-shared"
        />
      ),
      overlays: null,
    };
  }
  if (waiting && inGroup) {
    return {
      group: null,
      overlays: null,
      row: (
        <StandingRow
          row={{ mark: true, label: 30, sub: 64 }}
          label={`Asking ${harnessName} for its model`}
          testID="model-waiting"
        />
      ),
    };
  }
  if (waiting) {
    return {
      group: (
        <WaitingGroup
          group="model"
          harnessName={harnessName}
          agentName={agentName}
          rows={[{ mark: true, label: 30, sub: 64 }]}
          testID="model-waiting"
        />
      ),
      overlays: null,
    };
  }
  if (view === undefined) return { group: null, overlays: null };
  const row = modelRow(view, { harness: harnessName, agent: agentName });
  const press = () => {
    if (!row.quiet) return sheet.open(view);
    const words = row.hint ?? "";
    setHint({ words, at: Date.now() });
    AccessibilityInfo.announceForAccessibility(words);
    reread();
  };
  const overlays = (
    <>
      <ModelSheet
        state={sheet}
        agentName={agentName}
        face={agent?.face}
        harnessName={harnessName}
      />
      {hint === undefined ? null : <Hint key={hint.at} words={hint.words} />}
    </>
  );
  if (inGroup) {
    return {
      group: null,
      overlays,
      // In over the blank row that stood for it, as a group's copy lands over its blanks.
      row: (
        <Lands after={stood}>
          <ModelRow row={row} pulse={pulse} onPress={press} />
        </Lands>
      ),
      foot: row.foot,
    };
  }
  return {
    group: (
      <ModelGroup
        view={view}
        harnessName={harnessName}
        row={row}
        pulse={pulse}
        after={stood}
        onPress={press}
      />
    ),
    overlays,
  };
}

function ModelGroup({
  view,
  harnessName,
  row,
  pulse,
  after,
  onPress,
}: {
  readonly view: AgentModelView;
  readonly harnessName: string;
  readonly row: ReturnType<typeof modelRow>;
  readonly pulse: number;
  /** Whether a blank stood for it: then what is under its heading comes in (`Lands`). */
  readonly after: boolean;
  readonly onPress: () => void;
}) {
  return (
    <View testID="model-group">
      <GroupHeading trailing={<ReadFrom view={view} harnessName={harnessName} />}>
        Model
      </GroupHeading>
      <Lands after={after}>
        <Group inset={MARKED_INSET}>
          <ModelRow row={row} pulse={pulse} onPress={onPress} />
        </Group>
        {row.foot === undefined ? null : <GroupFoot testID="model-foot">{row.foot}</GroupFoot>}
      </Lands>
    </View>
  );
}

/** The row: what it runs on and how hard it thinks, with the bars, opening the sheet. */
function ModelRow({
  row,
  pulse,
  onPress,
}: {
  readonly row: ReturnType<typeof modelRow>;
  readonly pulse: number;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <GroupRow
      label={row.label}
      sub={row.sub}
      subLines={1}
      mark={
        <RowMark
          icon="model"
          tint={row.quiet ? undefined : ICON_GROUNDS[MODEL_GROUND_INDEX]}
          ink={row.quiet ? palette.ink3 : "#ffffff"}
        />
      }
      trailing={<RowBars levels={row.levels} level={row.level} quiet={row.quiet} />}
      tone={row.quiet ? "off" : "plain"}
      under={<Glow pulse={pulse} />}
      onPress={onPress}
      accessibilityLabel={`Model, ${row.label}, ${row.sub}`}
      accessibilityHint={row.quiet ? row.hint : "Changes its model and effort"}
      testID="model-row"
    />
  );
}

/**
 * At the heading's right: the harness's mark and its name, and, while it is away, when it last
 * said, since what the row shows is that and may be older than it looks.
 */
export function ReadFrom({
  view,
  harnessName,
  testID = "model-read-from",
}: {
  readonly view: Pick<AgentModelView, "away" | "read_at">;
  readonly harnessName: string;
  readonly testID?: string;
}) {
  const palette = usePalette();
  const words = view.away
    ? `${harnessName} · ${clockOrDay(view.read_at, Date.now())}`
    : harnessName;
  return (
    <View style={styles.from} testID={testID}>
      <HarnessMark name={harnessName} side={14} />
      <Text style={[styles.fromWords, { color: palette.ink3 }]} numberOfLines={1}>
        {words}
      </Text>
    </View>
  );
}

/**
 * Why a quiet row did nothing: glass at the foot of the screen, up for a moment and gone. The
 * Context window group's quiet limit says why here too (ADR 0146).
 */
export function Hint({ words }: { readonly words: string }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const less = useReduceMotion();
  const shown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const fade = (to: number, delay = 0) =>
      Animated.timing(shown, { toValue: to, duration: 300, delay, useNativeDriver: NATIVE });
    const run = Animated.sequence([fade(1), fade(0, HINT_MS)]);
    run.start();
    return () => run.stop();
  }, [shown]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.hint,
        {
          bottom: insets.bottom + SPACE.sm,
          opacity: shown,
          transform: [
            {
              translateY: less ? 0 : shown.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
            },
          ],
        },
      ]}
      testID="model-hint"
    >
      <Capsule style={styles.capsule}>
        <Text style={[styles.hintWords, { color: palette.ink2 }]}>{words}</Text>
      </Capsule>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  from: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  fromWords: { fontSize: 13, fontWeight: "500" },
  hint: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  capsule: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  hintWords: { fontSize: 14, fontWeight: "500" },
});
