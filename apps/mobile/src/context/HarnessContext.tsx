/**
 * A harness's own context, for its owner (ADR 0135, the mock's OpenClaw and Jacobian pages), on
 * the Context files page its page's row opens (ADR 0254): **Shared by its agents**, the files its
 * agents read from its set, each with a few of how many read it; and **New agents start with**,
 * the files each new agent is given a copy of, or a line saying what it starts with. Whichever has
 * rows comes first. A file opens the editor where the harness lets it be changed, and a page to
 * read where it doesn't.
 */

import {
  type HarnessGroups,
  harnessGroups,
  type SharedRow,
  type Snapshot,
  type Store,
} from "@chipschat/core";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Group, GroupFoot, GroupHeading, MARKED_INSET } from "../ui/Group";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { useLanding } from "./ContextGroup";
import { FileRow } from "./rows";
import { useHarnessContext } from "./useContext";

export function HarnessContext({
  store,
  snapshot,
  harnessId,
  selfId,
  focus,
  flashFile,
  onOpenFile,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  readonly focus: number;
  /** The shared file an agent's page opened this one for, flashed once. */
  readonly flashFile?: string | undefined;
  readonly onOpenFile: (name: string) => void;
}) {
  const { set } = useHarnessContext(store, snapshot, harnessId, selfId, focus);
  const saved = useLanding(`harness:${harnessId}`, focus);
  const pointed = usePointedAt(set?.shared, flashFile);
  if (set === undefined) return null;
  const groups = harnessGroups(set);
  const pulse = (row: SharedRow) =>
    saved?.name === row.name ? saved.at : pointed?.id === row.id ? pointed.at : 0;
  const shared = (
    <Shared
      key="shared"
      groups={groups}
      harnessName={set.harnessName}
      pulse={pulse}
      onOpenFile={onOpenFile}
    />
  );
  const forNew = (
    <ForNew
      key="new"
      groups={groups}
      harnessName={set.harnessName}
      pulse={pulse}
      onOpenFile={onOpenFile}
    />
  );
  return (
    <View style={styles.edge} testID="harness-context">
      {groups.shared.length === 0 ? [forNew, shared] : [shared, forNew]}
    </View>
  );
}

/** The row an agent's page pointed at, once its set has come. */
function usePointedAt(rows: readonly SharedRow[] | undefined, id: string | undefined) {
  const [pointed, setPointed] = useState<{ id: string; at: number } | undefined>(undefined);
  const has = rows?.some((row) => row.id === id) === true;
  useEffect(() => {
    if (has && id !== undefined) setPointed({ id, at: Date.now() });
  }, [has, id]);
  return pointed;
}

function Shared({
  groups,
  harnessName,
  pulse,
  onOpenFile,
}: {
  readonly groups: HarnessGroups;
  readonly harnessName: string;
  readonly pulse: (row: SharedRow) => number;
  readonly onOpenFile: (name: string) => void;
}) {
  const palette = usePalette();
  return (
    <View testID="harness-context-shared">
      <GroupHeading>Shared by its agents</GroupHeading>
      {groups.shared.length === 0 ? (
        <Text style={[styles.line, { color: palette.ink3 }]}>{groups.sharedFoot}</Text>
      ) : (
        <>
          <Group inset={MARKED_INSET}>
            {groups.shared.map((row) => (
              <FileRow
                key={row.name}
                row={row}
                harnessName={harnessName}
                pulse={pulse(row)}
                trailing={<UsedBy count={row.usedBy} />}
                onPress={() => onOpenFile(row.name)}
              />
            ))}
          </Group>
          <GroupFoot>{groups.sharedFoot}</GroupFoot>
        </>
      )}
    </View>
  );
}

/** How many of its agents read a shared file: Chips knows how many, not which (finding AC-4). */
function UsedBy({ count }: { readonly count: number | undefined }) {
  const palette = usePalette();
  if (count === undefined) return null;
  return <Text style={[styles.count, { color: palette.ink3 }]}>{count}</Text>;
}

function ForNew({
  groups,
  harnessName,
  pulse,
  onOpenFile,
}: {
  readonly groups: HarnessGroups;
  readonly harnessName: string;
  readonly pulse: (row: SharedRow) => number;
  readonly onOpenFile: (name: string) => void;
}) {
  const palette = usePalette();
  if (groups.forNew.length === 0 && groups.newLine === undefined) return null;
  return (
    <View testID="harness-context-new">
      <GroupHeading>New agents start with</GroupHeading>
      {groups.forNew.length === 0 ? (
        <Text style={[styles.line, { color: palette.ink3 }]}>{groups.newLine}</Text>
      ) : (
        <>
          <Group inset={MARKED_INSET}>
            {groups.forNew.map((row) => (
              <FileRow
                key={row.name}
                row={row}
                harnessName={harnessName}
                pulse={pulse(row)}
                onPress={() => onOpenFile(row.name)}
              />
            ))}
          </Group>
          <GroupFoot>{groups.newFoot}</GroupFoot>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // The page of its own it stands on since ADR 0254 pads nothing: a group runs from its own inset.
  edge: { paddingBottom: SPACE.xxl * 2 },
  line: {
    fontSize: TEXT.md,
    lineHeight: TEXT.md * 1.4,
    paddingHorizontal: SPACE.lg + SPACE.lg,
  },
  count: { fontSize: TEXT.md, fontVariant: ["tabular-nums"] },
});
