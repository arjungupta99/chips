/**
 * An agent's Model group on its card (ADR 0141, the phone's on the desktop), above its Heartbeat
 * and its Context: "Model" with its harness's mark and name at the right, and one row saying what
 * it runs on and how hard it thinks, with the bars, opening the dialog that changes both. Under
 * the row, a foot when there is something a row can't say: how many agents follow this one's, and
 * why it can't be changed now.
 *
 * Only for its harness's owner, or an owner or admin of the workspace, and only once the harness
 * has sent its copy (ADR 0140): anybody else's card has no Model group, and never asks.
 *
 * While the harness is away, or keeps the agent's model to itself, the row is quiet: grey, with no
 * chevron, and a press says why in a capsule at the foot of the window rather than opening the
 * dialog (ruling 7). The press also reads the copy again, so a harness that is back opens next
 * time. A save that lands flashes the row gold as the dialog goes.
 */

import {
  type Directory,
  harnessOf,
  MODEL_GROUND_INDEX,
  type ModelReads,
  type ModelRow,
  modelRow,
  nameOf,
  notSharedWords,
  settingLook,
  type WorkspaceModel,
} from "@chipschat/core";
import type { AgentModelView } from "@chipschat/protocol";
import { groundVar, Icon } from "@chipschat/ui";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Glow, HarnessMark } from "../context/rows.tsx";
import { clockOrDay } from "../time.ts";
import { NotShared, useLands, WaitingGroup } from "../Waiting.tsx";
import { RowBars } from "./EffortBars.tsx";
import { ModelDialog } from "./ModelDialog.tsx";
import { useAgentModel, useModelSheet } from "./useAgentModel.ts";

/** How long the capsule stays: in, held, and out (the stylesheet's `model-hint`). */
const HINT_MS = 1900;

export function ModelGroup({
  reads,
  model,
  directory,
  agentId,
  agentName,
  selfId,
  sayMissing = false,
}: {
  readonly reads: ModelReads | undefined;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly agentId: string;
  readonly agentName: string;
  readonly selfId: string;
  /** On an agent's card: a harness that doesn't share models leaves a line that says so. */
  readonly sayMissing?: boolean;
}) {
  const harnessName = nameOf(directory, harnessOf(directory, agentId));
  const said = useModelRow({ reads, model, directory, agentId, agentName, selfId });
  const land = useLands(said.view === undefined && said.waiting);
  if (sayMissing && said.look === "not_shared") {
    return (
      <NotShared
        group="model"
        words={notSharedWords("model", directory, agentId)}
        testID="model-not-shared"
      />
    );
  }
  if (said.view === undefined) {
    if (!said.waiting) return null;
    return (
      <WaitingGroup
        group="model"
        harnessName={harnessName}
        agentName={agentName}
        rows={[{ mark: true, label: 30, sub: 64 }]}
        testID="model-waiting"
        place={land.blank}
      />
    );
  }
  return (
    <section
      ref={land.copy}
      className={land.lands ? "ctx model lands" : "ctx model"}
      aria-label="Model"
      data-testid="model-group"
    >
      <div className="ctx-h">
        <h2 className="agents-h">Model</h2>
        <ReadFrom view={said.view} harnessName={harnessName} />
      </div>
      <ul className="ctx-group">{said.row}</ul>
      {said.foot !== undefined && (
        <p className="ctx-foot" data-testid="model-foot">
          {said.foot}
        </p>
      )}
      {said.overlays}
    </section>
  );
}

/**
 * An agent's Model row, its foot and what stands over it (the capsule's dock and the dialog), apart
 * from the group that holds them: on an agent's card its own group, on a harness's page (ADR 0254)
 * the first row of Set up, as the phone's `inGroup` row is. No row until the copy has come, or for
 * anybody who may not change it.
 */
export function useModelRow({
  reads,
  model,
  directory,
  agentId,
  agentName,
  selfId,
}: {
  readonly reads: ModelReads | undefined;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly agentId: string;
  readonly agentName: string;
  readonly selfId: string;
}) {
  const harnessName = nameOf(directory, harnessOf(directory, agentId));
  const { view, waiting, reread, took } = useAgentModel(reads, model, directory, agentId, selfId);
  const look = settingLook(model, directory, agentId, selfId, "model");
  const [pulse, setPulse] = useState(0);
  // The row the dialog grew out of, while it is drawn; none once it has folded back.
  const [from, setFrom] = useState<HTMLElement | null>(null);
  const [hint, setHint] = useState<{ words: string; at: number } | undefined>(undefined);
  // Each time the dialog has folded away: the row takes the keyboard back once the dialog is gone,
  // since everything behind a modal dialog is inert and takes no focus while it is there.
  const [back, setBack] = useState(0);
  const row = useRef<HTMLButtonElement>(null);
  const handlers = useMemo(
    () => ({ took, landed: () => setPulse(Date.now()), closed: reread }),
    [took, reread],
  );
  const sheet = useModelSheet(reads, agentId, handlers);
  useEffect(() => {
    if (back > 0) row.current?.focus();
  }, [back]);
  useEffect(() => {
    if (hint === undefined) return;
    const timer = setTimeout(() => setHint(undefined), HINT_MS);
    return () => clearTimeout(timer);
  }, [hint]);
  if (view === undefined) {
    return { view, waiting, look, row: undefined, foot: undefined, overlays: undefined };
  }
  const said = modelRow(view, { harness: harnessName, agent: agentName });
  const press = (element: HTMLElement) => {
    if (!said.quiet) {
      sheet.open(view);
      setFrom(element);
      return;
    }
    setHint({ words: said.hint ?? "", at: Date.now() });
    reread();
  };
  const overlays = (
    <>
      <div className="model-hint-dock" role="status">
        {hint !== undefined && (
          <span key={hint.at} className="model-hint" data-testid="model-hint">
            {hint.words}
          </span>
        )}
      </div>
      {from !== null && (
        <ModelDialog
          state={sheet}
          from={from}
          agentName={agentName}
          face={directory[agentId]?.face}
          harnessName={harnessName}
          onGone={() => {
            setFrom(null);
            setBack((was) => was + 1);
          }}
        />
      )}
    </>
  );
  return {
    view,
    waiting,
    look,
    row: (
      <li>
        <Row said={said} pulse={pulse} rowRef={row} onPress={press} />
      </li>
    ),
    foot: said.foot,
    overlays,
  };
}

/** The one row: the model tile, its label, the effort and whose, the bars, and a chevron. */
function Row({
  said,
  pulse,
  rowRef,
  onPress,
}: {
  readonly said: ModelRow;
  readonly pulse: number;
  readonly rowRef: RefObject<HTMLButtonElement | null>;
  readonly onPress: (element: HTMLElement) => void;
}) {
  return (
    <button
      ref={rowRef}
      type="button"
      className="ctx-row model-row"
      data-quiet={said.quiet}
      aria-label={`Model, ${said.label}, ${said.sub}`}
      title={said.quiet ? said.hint : undefined}
      onClick={(event) => onPress(event.currentTarget)}
      data-testid="model-row"
    >
      <Glow pulse={pulse} />
      <span
        className="ctx-tile model-tile"
        style={said.quiet ? undefined : { background: groundVar(MODEL_GROUND_INDEX) }}
        aria-hidden="true"
      >
        <Icon name="model" size={19} />
      </span>
      <span className="ctx-row-words">
        <span className="ctx-row-title">{said.label}</span>
        <span className="ctx-row-line" data-testid="model-row-sub">
          {said.sub}
        </span>
      </span>
      <RowBars levels={said.levels} level={said.level} quiet={said.quiet} />
      {!said.quiet && (
        <span className="ctx-row-chev" aria-hidden="true">
          ›
        </span>
      )}
    </button>
  );
}

/**
 * At the heading's right: the harness's mark and its name, and, while it is away, when it last
 * said, since what the row shows is that and may be older than it looks.
 */
function ReadFrom({
  view,
  harnessName,
}: {
  readonly view: AgentModelView;
  readonly harnessName: string;
}) {
  return (
    <span className="ctx-from" data-testid="model-read-from">
      <HarnessMark name={harnessName} side={14} />
      {view.away ? `${harnessName} · ${clockOrDay(view.read_at)}` : harnessName}
    </span>
  );
}
