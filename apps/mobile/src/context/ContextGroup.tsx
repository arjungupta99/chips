/**
 * An agent's Context group on its card (ADR 0135, the mock's scenes 1, 4 and 6): the files its
 * harness builds it from at every turn, as the harness named them, between its facts and its
 * history. Only its harness's owner sees it (ADR 0134); for anybody else, and for a harness that
 * doesn't send its files, the card has no Context group at all.
 *
 * A row opens the editor, the harness's page for a file the agent reads from its harness's set,
 * or a page to read for one the harness keeps read only. Past the eighth file a quiet last row
 * names the rest, and the foot says Chips doesn't show them. A shared file the harness lets an
 * agent have its own of offers "Give it its own" under the foot.
 *
 * Since ADR 0238, before the first copy the group stands blank in its place, and for a harness
 * that doesn't send its files its heading stays with a line that says so; the foot says when the
 * agent reads its files where its harness tells Chips.
 */

import {
  type AgentContext,
  type ContextRow,
  contextFoot,
  type HarnessContext,
  harnessOf,
  nameOf,
  notSharedWords,
  notShownWords,
  type Snapshot,
  type Store,
  settingLook,
} from "@chipschat/core";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { NotShared, useStood, WaitingGroup } from "../agents/Waiting";
import { clockOrDay } from "../spaces/when";
import { Group, GroupHeading, GroupRow, MARKED_INSET } from "../ui/Group";
import { Lands } from "../ui/growing";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { takeLanding } from "./memory";
import { FileRow, HarnessMark, LinkedFoot, NotShownRow } from "./rows";
import { useAgentContext } from "./useContext";

export interface ContextOpeners {
  /** A file of this agent's: the editor, or the page that reads it. `own` gives it its own. */
  readonly onOpenFile: (name: string, mode: "open" | "own") => void;
  /** Its harness's page, flashing the shared file it reads there, if one is named. */
  readonly onOpenHarness: (harnessId: string, fileId?: string) => void;
}

export function ContextGroup({
  store,
  snapshot,
  agentId,
  agentName,
  selfId,
  focus,
  onOpenFile,
  onOpenHarness,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly agentId: string;
  readonly agentName: string;
  readonly selfId: string;
  /** How many times the card has come to the front: each time, the files are read again. */
  readonly focus: number;
} & ContextOpeners) {
  const { context, set, waiting } = useAgentContext(store, snapshot, agentId, selfId, focus);
  const pulse = useLanding(`agent:${agentId}`, focus);
  const stood = useStood(context === undefined && waiting);
  const look = settingLook(snapshot.model, snapshot.directory, agentId, selfId, "context");
  if (look === "not_shared") {
    return (
      <NotShared
        group="context"
        words={notSharedWords("context", snapshot.directory, agentId)}
        testID="context-not-shared"
      />
    );
  }
  if (context === undefined) {
    if (!waiting) return null;
    return (
      <WaitingGroup
        group="context"
        harnessName={nameOf(snapshot.directory, harnessOf(snapshot.directory, agentId))}
        agentName={agentName}
        rows={[
          { mark: true, label: 30, sub: 66 },
          { mark: true, label: 44, sub: 58 },
          { mark: true, label: 28, sub: 52 },
        ]}
        foot={[84]}
        testID="context-waiting"
      />
    );
  }
  const open = (row: ContextRow) => {
    if (row.opens === "harness_page") onOpenHarness(context.harnessId, row.readsShared);
    else onOpenFile(row.name, "open");
  };
  return (
    <View testID="context-group">
      <GroupHeading trailing={<ReadFrom context={context} />}>Context</GroupHeading>
      <Lands after={stood}>
        <Files context={context} agentName={agentName} pulse={pulse} onOpen={open} />
        <LinkedFoot
          words={contextFoot(context, set, agentName)}
          onLink={() => onOpenHarness(context.harnessId)}
          testID="context-foot"
        />
        <GiveOwn context={context} set={set} agentName={agentName} onOpenFile={onOpenFile} />
      </Lands>
    </View>
  );
}

/** Which row to flash, and a new number each time a file comes back saved. */
export function useLanding(key: string, focus: number): { name: string; at: number } | undefined {
  const [landed, setLanded] = useState<{ name: string; at: number } | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `focus` is when to look.
  useEffect(() => {
    const name = takeLanding(key);
    if (name !== undefined) setLanded({ name, at: Date.now() });
  }, [key, focus]);
  return landed;
}

/** At the heading's right: the harness's mark, its name, and when its copy was read. */
function ReadFrom({ context }: { readonly context: AgentContext | HarnessContext }) {
  const palette = usePalette();
  return (
    <View style={styles.from} testID="context-read-from">
      <HarnessMark name={context.harnessName} side={14} />
      <Text style={[styles.fromWords, { color: palette.ink3 }]} numberOfLines={1}>
        {`${context.harnessName} · ${clockOrDay(context.readAt, Date.now())}`}
      </Text>
    </View>
  );
}

function Files({
  context,
  agentName,
  pulse,
  onOpen,
}: {
  readonly context: AgentContext;
  readonly agentName: string;
  readonly pulse: { name: string; at: number } | undefined;
  readonly onOpen: (row: ContextRow) => void;
}) {
  const leftOut = notShownWords(context.notShown, context.harnessName, agentName);
  return (
    <Group inset={MARKED_INSET}>
      {context.rows.map((row) => (
        <FileRow
          key={row.name}
          row={row}
          harnessName={context.harnessName}
          pulse={pulse?.name === row.name ? pulse.at : 0}
          onPress={() => onOpen(row)}
        />
      ))}
      {leftOut === undefined ? null : <NotShownRow title={leftOut.title} line={leftOut.line} />}
    </Group>
  );
}

/** For each shared file the harness lets this agent have its own of: an act to give it one. */
function GiveOwn({
  context,
  set,
  agentName,
  onOpenFile,
}: {
  readonly context: AgentContext;
  readonly set: HarnessContext | undefined;
  readonly agentName: string;
  readonly onOpenFile: ContextOpeners["onOpenFile"];
}) {
  const ownable = context.rows.filter(
    (row) => row.replaces !== undefined && set?.shared.some((each) => each.id === row.replaces),
  );
  if (ownable.length === 0 || context.away) return null;
  return (
    <View style={styles.give}>
      <Group>
        {ownable.map((row) => (
          <GroupRow
            key={row.name}
            label={`Give ${agentName} its own ${row.title}…`}
            tone="accent"
            onPress={() => onOpenFile(row.name, "own")}
            testID={`context-give-${row.name}`}
          />
        ))}
      </Group>
    </View>
  );
}

const styles = StyleSheet.create({
  from: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  fromWords: { fontSize: TEXT.sm, fontWeight: "500" },
  give: { paddingTop: SPACE.md + 2 },
});
