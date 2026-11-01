/**
 * An agent's Heartbeat group on its card (ADR 0143, the mock's layout A): whether its harness wakes
 * it every so often to look over what it is doing, and how often. A switch saves when it is
 * flipped; while it is on, an Every row under it opens the intervals, and a tap there saves. Only
 * the people who run its harness see it, and only for an agent its harness sends a heartbeat for.
 *
 * A change is laid over the copy while it waits, so the rows say "Saving to …" at once, and the
 * harness's answer replaces it. One that fails or isn't answered says so under the switch a moment.
 *
 * The last copy read is kept while the app runs, so the card opened again draws it at once; before
 * the first, the group stands blank in its place (ADR 0238). A harness that sends no heartbeats
 * leaves the heading and a line that says so.
 */

import {
  everyChoices,
  harnessOf,
  heartbeatFoot,
  heartbeatRows,
  heartbeatWords,
  mayChangeHeartbeat,
  nameOf,
  notSharedWords,
  type Snapshot,
  type Store,
  saveHeartbeatChange,
  settingLook,
} from "@chipschat/core";
import type { AgentHeartbeatView, HeartbeatChangeAsk } from "@chipschat/protocol";
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { recall, remember } from "../../context/memory";
import { HarnessMark } from "../../context/rows";
import { Group, GroupFoot, GroupHeading, GroupRow, MARKED_INSET, RowMark } from "../../ui/Group";
import { Lands } from "../../ui/growing";
import { usePalette } from "../../ui/theme";
import { TEXT } from "../../ui/tokens";
import { NotShared, useStood, WaitingGroup } from "../Waiting";
import { EverySheet } from "./EverySheet";

const keyOf = (agentId: string) => `heartbeat:${agentId}`;

/** How long a save's trouble stays under the switch. */
const SAID_MS = 4000;

interface HeartbeatProps {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly agentId: string;
  readonly agentName: string;
  readonly selfId: string;
  /** How many times the card has come to the front: each time, the copy is read again. */
  readonly focus: number;
}

export function HeartbeatGroup(props: HeartbeatProps) {
  const { store, snapshot, agentId, agentName, selfId, focus } = props;
  const look = settingLook(snapshot.model, snapshot.directory, agentId, selfId, "heartbeat");
  const may = mayChangeHeartbeat(snapshot.model, snapshot.directory, agentId, selfId);
  const copy = useHeartbeatCopy(store, agentId, may, focus);
  const stood = useStood(may && copy.view === undefined && copy.reading);
  if (look === "not_shared") {
    return (
      <NotShared
        group="heartbeat"
        words={notSharedWords("heartbeat", snapshot.directory, agentId)}
        testID="heartbeat-not-shared"
      />
    );
  }
  if (!may) return null;
  const { view, setView, reading } = copy;
  if (view !== undefined) {
    return <Heartbeat {...props} view={view} setView={setView} after={stood} />;
  }
  if (!reading) return null;
  return (
    <WaitingGroup
      group="heartbeat"
      harnessName={nameOf(snapshot.directory, harnessOf(snapshot.directory, agentId))}
      agentName={agentName}
      rows={[
        { mark: true, label: 34, sub: 12, trailing: "switch" },
        { label: 22, trailing: "value" },
      ]}
      foot={[94, 90, 58]}
      testID="heartbeat-waiting"
    />
  );
}

/**
 * The harness's copy: kept from before at once, then read when the card opens and each time it
 * comes back to the front; whether the first read is still on its way.
 */
function useHeartbeatCopy(store: Store, agentId: string, may: boolean, focus: number) {
  const [view, setView] = useState<AgentHeartbeatView | undefined>(() =>
    may ? recall<AgentHeartbeatView>(keyOf(agentId)) : undefined,
  );
  const [reading, setReading] = useState(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `focus` is when to read it again.
  useEffect(() => {
    if (!may) {
      setView(undefined);
      return;
    }
    let current = true;
    store
      .readAgentHeartbeat(agentId)
      .then(
        (read) => {
          remember(keyOf(agentId), read);
          if (current) setView(read);
        },
        // Not sent yet, or not declared any more: the last copy stands, or there is no group.
        () => undefined,
      )
      .finally(() => current && setReading(false));
    return () => {
      current = false;
    };
  }, [store, agentId, may, focus]);
  return { view, setView, reading };
}

function Heartbeat({
  store,
  snapshot,
  agentId,
  agentName,
  view,
  setView,
  after,
}: HeartbeatProps & {
  readonly view: AgentHeartbeatView;
  readonly setView: Dispatch<SetStateAction<AgentHeartbeatView | undefined>>;
  /** Whether a blank stood for it: then what is under its heading comes in (`Lands`). */
  readonly after: boolean;
}) {
  const palette = usePalette();
  const harness = nameOf(snapshot.directory, harnessOf(snapshot.directory, agentId));
  const [said, setSaid] = useState<string | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const rows = heartbeatRows(view, harness);
  const busy = rows.quiet || rows.saving !== undefined;

  const ask = async (change: HeartbeatChangeAsk) => {
    setSaid(undefined);
    setView((was) =>
      was === undefined
        ? was
        : {
            ...was,
            change: {
              change_id: "chg_asking",
              state: "waiting",
              on: change.on,
              every: change.every ?? was.every,
              asked_at: new Date().toISOString(),
            },
          },
    );
    const outcome = await saveHeartbeatChange(store, agentId, change, {
      alive: () => alive.current,
    });
    if (!alive.current) return;
    const now = outcome.view ?? (await store.readAgentHeartbeat(agentId).catch(() => undefined));
    if (!alive.current) return;
    if (now !== undefined) {
      remember(keyOf(agentId), now);
      setView(now);
    }
    if (outcome.state !== "saved") {
      setSaid(heartbeatWords(outcome.state, harness, outcome.message));
      setTimeout(() => alive.current && setSaid(undefined), SAID_MS);
    }
  };

  const lit = rows.on && !rows.quiet;
  return (
    <View testID="heartbeat-group">
      <GroupHeading trailing={<From harness={harness} />}>Heartbeat</GroupHeading>
      <Lands after={after}>
        <Group inset={MARKED_INSET}>
          <GroupRow
            label="Heartbeat"
            sub={said ?? rows.sub}
            mark={
              <RowMark
                icon="pulse"
                tint={lit ? palette.red : undefined}
                ink={lit ? "#ffffff" : palette.ink3}
              />
            }
            trailing={
              <Switch
                testID="heartbeat-switch"
                accessibilityLabel="Heartbeat"
                value={rows.on}
                disabled={busy}
                onValueChange={(on) => void ask({ on })}
              />
            }
            testID="heartbeat-row"
          />
          {rows.every.shows ? (
            <GroupRow
              label="Every"
              value={rows.every.value}
              tone={rows.quiet ? "quiet" : "plain"}
              onPress={busy ? undefined : () => setPicking(true)}
              accessibilityHint="Shows how often it can check in"
              testID="heartbeat-every"
            />
          ) : null}
        </Group>
        <GroupFoot testID="heartbeat-foot">{heartbeatFoot(view, agentName, harness)}</GroupFoot>
      </Lands>
      <EverySheet
        open={picking}
        agentName={agentName}
        choices={everyChoices(view)}
        onClose={() => setPicking(false)}
        onPick={(minutes) => {
          setPicking(false);
          if (minutes !== rows.every.minutes) void ask({ on: true, every: minutes });
        }}
      />
    </View>
  );
}

/** At the heading's right: the harness the heartbeat is kept by. */
function From({ harness }: { readonly harness: string }) {
  const palette = usePalette();
  return (
    <View style={styles.from} testID="heartbeat-from">
      <HarnessMark name={harness} side={14} />
      <Text style={[styles.fromWords, { color: palette.ink3 }]} numberOfLines={1}>
        {harness}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  from: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  fromWords: { fontSize: TEXT.sm, fontWeight: "500" },
});
