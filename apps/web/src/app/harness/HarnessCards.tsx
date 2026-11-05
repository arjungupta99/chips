/**
 * Every harness's card, in a page of its own (ADR 0185): what View all under the shelf opens, as the
 * phone's `harnesses/All.tsx` lists them since ADR 0254 (here since ADR 0266). A card says more than
 * a tile has room for — its level, its sessions and spaces, what waits on you, its context and its
 * budget — and opens its harness's page. Until ADR 0266 this page was every harness's whole card,
 * tokens and checklist and all, one after another. Connect a harness is at the foot, for whoever may.
 *
 * A face with a ring, and the ring is state, with the word beside it always. Idle and Done say
 * nothing, as on the tile; nor does one that can't answer, whose amber line says why.
 */

import {
  agentStateWords,
  agentsTab,
  budgetWords,
  type Directory,
  type FleetHarness,
  fleetDoing,
  harnessRollup,
  harnessShelf,
  nameOf,
  takesAutonomy,
  type WorkspaceModel,
} from "@chipschat/core";
import { Avatar, autonomyLabel, Pill } from "@chipschat/ui";
import { FleetWord, STATUS_TONE, saysStatus } from "../Sidebar.tsx";

export function HarnessCards(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string | undefined;
  readonly onOpen: (harnessId: string) => void;
  /** Connect a harness, grown out of the row. Absent for anybody who may not, and in the demo. */
  readonly onConnect?: ((from: HTMLElement) => void) | undefined;
}) {
  const { model, directory } = props;
  const tiles = harnessShelf(agentsTab(model, directory, props.selfId ?? ""), directory);
  return (
    <div className="hp-cards" data-testid="harnesses-list">
      {tiles.map((tile) => (
        <HarnessSummary
          key={tile.id}
          model={model}
          directory={directory}
          harnessId={tile.id}
          onOpen={props.onOpen}
        />
      ))}
      {props.onConnect !== undefined && (
        <button
          type="button"
          className="agents-fold hp-connect"
          aria-haspopup="dialog"
          data-testid="add-agent"
          onClick={(event) => props.onConnect?.(event.currentTarget)}
        >
          <span>Connect a harness</span>
          <span aria-hidden="true">›</span>
        </button>
      )}
    </div>
  );
}

function HarnessSummary(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly harnessId: string;
  readonly onOpen: (harnessId: string) => void;
}) {
  const { model, directory, harnessId } = props;
  const name = nameOf(directory, harnessId);
  const entry = model.fleet.find((each) => each.harnessId === harnessId);
  const policy = model.harnesses[harnessId];
  const budget = budgetWords(policy);
  const trouble = agentStateWords(directory, harnessId, Date.now());
  const busy = trouble === undefined && entry !== undefined && saysStatus(entry);
  // Named by what it shows, starting with its name, so a voice that says what it sees finds it; the
  // face says the name again and is left out of it.
  return (
    <button
      type="button"
      className="hp-summary"
      data-testid={`harness-summary-${harnessId}`}
      onClick={() => props.onOpen(harnessId)}
    >
      <span className="hp-summary-head">
        <span className="hp-summary-face" aria-hidden="true">
          <Avatar name={name} kind="harness" cantAnswer={trouble !== undefined} />
        </span>
        <span className="hp-summary-words">
          {/* Spaces between the parts, so its name reads as words ("Scout L1 · Ask first"). */}
          <span className="hp-summary-name">{name}</span>{" "}
          {trouble !== undefined && <span className="hp-summary-trouble">{trouble} </span>}
          {/* The level only for a harness that takes the dial (ADR 0046). */}
          {takesAutonomy(directory, harnessId) && (
            <span className="hp-summary-note">
              {policy === undefined ? "No policy yet" : autonomyLabel(policy.autonomy)}
            </span>
          )}
        </span>
        {busy && <Doing model={model} entry={entry} />}
      </span>{" "}
      <span className="hp-summary-note">{harnessRollup(entry)}</span>
      {entry?.workingFor !== undefined && (
        <span className="hp-summary-note">Working for {nameOf(directory, entry.workingFor)}</span>
      )}
      {entry?.contextPercent !== undefined && (
        <Meter
          label="Context"
          caption={`${Math.round(entry.contextPercent)}% used`}
          used={entry.contextPercent}
          of={100}
        />
      )}
      {budget !== undefined && policy?.budgetUsd !== undefined && (
        <Meter label="Budget" caption={budget} used={policy.spentUsd} of={policy.budgetUsd} />
      )}
    </button>
  );
}

/** What it is doing, in a pill in its run's tone: the sidebar's word for it. */
function Doing(props: { readonly model: WorkspaceModel; readonly entry: FleetHarness }) {
  const { entry } = props;
  return (
    <Pill
      tone={entry.paused ? "amber" : (STATUS_TONE[entry.status ?? ""] ?? "neutral")}
      dot="solid"
    >
      <FleetWord harness={entry} doing={fleetDoing(props.model.spaces, entry)} />
    </Pill>
  );
}

/** A bar with its label and what it says, as the phone's `Bar`. */
export function Meter(props: {
  readonly label: string;
  readonly caption: string;
  readonly used: number;
  readonly of: number;
}) {
  return (
    <span className="hp-meter">
      <span className="hp-meter-words">
        <span className="hp-meter-label">{props.label}</span>
        <span>{props.caption}</span>
      </span>
      <meter min={0} max={props.of} value={props.used} aria-label={props.label} />
    </span>
  );
}
