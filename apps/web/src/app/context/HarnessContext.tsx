/**
 * A harness's own context, on its card, for its owner (ADR 0135, the phone's harness page on the
 * desktop): **Shared by its agents**, the files its agents read from its set, each with a few of
 * how many read it; and **New agents start with**, the files each new agent is given a
 * copy of, or a line saying what it starts with. Whichever has rows comes first. A file opens the
 * editor where the harness lets it be changed, and a page to read where it doesn't.
 */

import {
  type ContextReads,
  type Directory,
  type HarnessGroups,
  harnessGroups,
  type SharedRow,
  type WorkspaceModel,
} from "@chipschat/core";
import { useEffect, useState } from "react";
import { ReadFrom, useLanding } from "./ContextGroup.tsx";
import { FileRow } from "./rows.tsx";
import { harnessKey, useHarnessContext } from "./useContext.ts";

export function HarnessContext({
  reads,
  model,
  directory,
  harnessId,
  selfId,
  flashFile,
  onOpenFile,
}: {
  readonly reads: ContextReads | undefined;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  /** The shared file an agent's page opened this one for, flashed once. */
  readonly flashFile?: string | undefined;
  readonly onOpenFile: (name: string) => void;
}) {
  const set = useHarnessContext(reads, model, directory, harnessId, selfId);
  const saved = useLanding(harnessKey(harnessId));
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
    <div className="ctx ctx-harness" data-testid="harness-context">
      <div className="ctx-h">
        <h3 className="agents-h">Context</h3>
        <ReadFrom context={set} />
      </div>
      {groups.shared.length === 0 ? [forNew, shared] : [shared, forNew]}
    </div>
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
  return (
    <section aria-label="Shared by its agents" data-testid="harness-context-shared">
      <h4 className="ctx-sub-h">Shared by its agents</h4>
      {groups.shared.length === 0 ? (
        <p className="ctx-line">{groups.sharedFoot}</p>
      ) : (
        <>
          <ul className="ctx-group">
            {groups.shared.map((row) => (
              <FileRow
                key={row.name}
                row={row}
                harnessName={harnessName}
                pulse={pulse(row)}
                trailing={<UsedBy count={row.usedBy} />}
                onOpen={() => onOpenFile(row.name)}
              />
            ))}
          </ul>
          <p className="ctx-foot">{groups.sharedFoot}</p>
        </>
      )}
    </section>
  );
}

/** How many of its agents read a shared file: Chips knows how many, not which (finding AC-4). */
function UsedBy({ count }: { readonly count: number | undefined }) {
  return count === undefined ? null : <span className="ctx-count">{count}</span>;
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
  if (groups.forNew.length === 0 && groups.newLine === undefined) return null;
  return (
    <section aria-label="New agents start with" data-testid="harness-context-new">
      <h4 className="ctx-sub-h">New agents start with</h4>
      {groups.forNew.length === 0 ? (
        <p className="ctx-line">{groups.newLine}</p>
      ) : (
        <>
          <ul className="ctx-group">
            {groups.forNew.map((row) => (
              <FileRow
                key={row.name}
                row={row}
                harnessName={harnessName}
                pulse={pulse(row)}
                onOpen={() => onOpenFile(row.name)}
              />
            ))}
          </ul>
          <p className="ctx-foot">{groups.newFoot}</p>
        </>
      )}
    </section>
  );
}
