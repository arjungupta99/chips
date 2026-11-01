/**
 * The model dialog (ADR 0141, the phone's sheet on the desktop): one dialog with the agent's
 * models, a "Same as …" switch and the effort bars, and one Save that sends both. It grows out of
 * the model row and folds back into it (`GrowingDialog`), and the row has the keyboard again after.
 *
 * From the top: the agent's face and "<Name>'s model" over its harness's name; the switch, when
 * the harness gives a default, with what the default runs on under it; the models as a radio
 * group with a gold check; "Effort", the chosen level's name big, the line beside it, and the bars,
 * a radio group too. The arrow keys move along either, Enter saves, Escape closes. While Same is
 * on, the models and the bars show the default's and are dimmed. Save is grey until something
 * changed and gold once it has; while it waits it shows the chip's running pins and "Saving to
 * <harness>", then a green check and "Saved", and the dialog goes on its own. A refusal or a
 * missed answer keeps the dialog, the picks as they were, with the line under Save.
 *
 * Every word about a model is the harness's. Chips' own are "effort", the line beside the bars,
 * and what became of a save.
 */

import {
  defaultWords,
  EFFORT_NOTE,
  modelWords,
  type ModelSheet as Picks,
  shownPick,
} from "@chipschat/core";
import type { ModelChoice, SpaceIcon } from "@chipschat/protocol";
import { Avatar, ChipMark, Icon } from "@chipschat/ui";
import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";
import { GrowingDialog } from "../GrowingDialog.tsx";
import { Switch } from "../you/controls.tsx";
import { DialBars } from "./EffortBars.tsx";
import type { ModelSheetState } from "./useAgentModel.ts";

/** What has the keyboard as it opens: the switch when there is one, else the model picked. */
const FIRST = ".model-same input, .model-choices input:checked";

export function ModelDialog({
  state,
  from,
  agentName,
  face,
  harnessName,
  onGone,
}: {
  readonly state: ModelSheetState;
  /** The row it grows out of, and folds back into. */
  readonly from: HTMLElement | null;
  readonly agentName: string;
  readonly face: SpaceIcon | undefined;
  readonly harnessName: string;
  /** Folded away: the row takes the keyboard back. */
  readonly onGone: () => void;
}) {
  const titleId = useId();
  // What it showed last, drawn while it folds: the picks go the moment it is put away.
  const last = useRef<Picks | undefined>(undefined);
  if (state.sheet !== undefined) last.current = state.sheet;
  const picks = state.sheet ?? last.current;
  if (picks === undefined) return null;
  // Enter saves from anywhere in it but the ×, whose Enter is its own.
  const enter = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    if ((event.target as HTMLElement).closest("[data-own-enter]") !== null) return;
    event.preventDefault();
    state.save();
  };
  return (
    <GrowingDialog
      from={from}
      labelledBy={titleId}
      className="model-dialog"
      testId="model-dialog"
      focus={FIRST}
      leaving={state.sheet === undefined}
      onLeave={state.close}
      onGone={onGone}
    >
      <form
        className="model-card"
        onSubmit={(event) => {
          event.preventDefault();
          state.save();
        }}
        onKeyDown={enter}
      >
        <Head
          titleId={titleId}
          agentName={agentName}
          face={face}
          harnessName={harnessName}
          onClose={state.close}
        />
        <div className="model-body">
          <Body picks={picks} state={state} />
        </div>
        <SaveBar state={state} harnessName={harnessName} />
      </form>
    </GrowingDialog>
  );
}

function Head(props: {
  readonly titleId: string;
  readonly agentName: string;
  readonly face: SpaceIcon | undefined;
  readonly harnessName: string;
  readonly onClose: () => void;
}) {
  return (
    <div className="model-head">
      <Avatar name={props.agentName} kind="agent" icon={props.face} />
      <div className="model-head-words">
        <h2 id={props.titleId}>{`${props.agentName}'s model`}</h2>
        <span className="model-head-sub">{props.harnessName}</span>
      </div>
      <button
        type="button"
        className="new-space-close"
        aria-label="Close"
        data-own-enter=""
        data-testid="model-close"
        onClick={props.onClose}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

function Body({ picks, state }: { readonly picks: Picks; readonly state: ModelSheetState }) {
  const shown = shownPick(picks);
  const busy = state.saving?.state === "saving";
  const group = useId();
  return (
    <>
      <Same picks={picks} busy={busy} onSame={state.same} />
      <h3 className="agents-h model-h">Model</h3>
      <Dim off={picks.same}>
        <div className="ctx-group model-choices" role="radiogroup" aria-label="Model">
          {picks.view.choices.map((choice) => (
            <Choice
              key={choice.id}
              group={group}
              choice={choice}
              checked={choice.id === shown.model}
              off={picks.same || busy}
              onPick={state.pick}
            />
          ))}
        </div>
      </Dim>
      {shown.levels.length > 0 && (
        <>
          <h3 className="agents-h model-h">Effort</h3>
          <Effort picks={picks} off={picks.same || busy} onLevel={state.level} />
        </>
      )}
    </>
  );
}

/** The switch: on, the agent has none of its own and runs on the default. */
function Same({
  picks,
  busy,
  onSame,
}: {
  readonly picks: Picks;
  readonly busy: boolean;
  readonly onSame: (on: boolean) => void;
}) {
  const fallback = picks.view.default;
  if (fallback === undefined) return null;
  return (
    <div className="ctx-group model-same">
      <div className="ctx-row" data-testid="model-same">
        <span className="ctx-row-words">
          <span className="ctx-row-title">{fallback.label}</span>
          <span className="ctx-row-line">{defaultWords(picks.view)}</span>
        </span>
        <Switch label={fallback.label} checked={picks.same} disabled={busy} onChange={onSame} />
      </div>
    </div>
  );
}

/** One model: its label, and the gold check that pops in on the one picked. */
function Choice({
  group,
  choice,
  checked,
  off,
  onPick,
}: {
  readonly group: string;
  readonly choice: ModelChoice;
  readonly checked: boolean;
  readonly off: boolean;
  readonly onPick: (modelId: string) => void;
}) {
  return (
    <label className="ctx-row model-choice" data-testid={`model-choice-${choice.id}`}>
      <input
        type="radio"
        className="model-radio"
        name={group}
        value={choice.id}
        checked={checked}
        disabled={off}
        onChange={() => onPick(choice.id)}
      />
      <span className="model-choice-label">{choice.label}</span>
      {checked && (
        <span className="model-check ctx-pop" data-testid="model-check" aria-hidden="true">
          <Icon name="check" size={20} />
        </span>
      )}
    </label>
  );
}

/** "Effort": the chosen level's name big, the line beside it, and the bars. */
function Effort({
  picks,
  off,
  onLevel,
}: {
  readonly picks: Picks;
  readonly off: boolean;
  readonly onLevel: (effortId: string) => void;
}) {
  const shown = shownPick(picks);
  const name = shown.levels[shown.level]?.label ?? "";
  return (
    <div className="model-dial">
      <div className="model-now">
        <span key={name} className="model-big model-rise" data-testid="model-level-name">
          {name}
        </span>
        <span className="model-note">{EFFORT_NOTE}</span>
      </div>
      {/* Only the bars dim: the name and the line are words to read, the default's or not. */}
      <Dim off={picks.same}>
        <DialBars levels={shown.levels} level={shown.level} off={off} onPick={onLevel} />
      </Dim>
    </div>
  );
}

/** Dimmed, and taking no pick, while Same is on: what it shows is the default's. */
function Dim({ off, children }: { readonly off: boolean; readonly children: ReactNode }) {
  return (
    <div className="model-dim" data-off={off}>
      {children}
    </div>
  );
}

type Look = "off" | "on" | "busy" | "done";

function lookOf(state: ModelSheetState): Look {
  if (state.saving?.state === "saving") return "busy";
  if (state.saving?.state === "saved") return "done";
  return state.maySave ? "on" : "off";
}

/**
 * Save, full width at the foot, and what became of it under that. Off, it is `aria-disabled`
 * rather than disabled, so it keeps the keyboard while it waits.
 */
function SaveBar({
  state,
  harnessName,
}: {
  readonly state: ModelSheetState;
  readonly harnessName: string;
}) {
  const look = lookOf(state);
  const saving = state.saving;
  const line =
    saving === undefined || look === "busy" || look === "done"
      ? undefined
      : modelWords(saving.state, harnessName, saving.message);
  const label = { off: "Save", on: "Save", busy: modelWords("saving", harnessName), done: "Saved" }[
    look
  ];
  return (
    <div className="model-save-bar">
      <button
        type="submit"
        className="model-save"
        data-look={look}
        aria-disabled={look !== "on"}
        aria-busy={look === "busy"}
        data-testid="model-save"
      >
        <span key={look} className="model-save-words ctx-arrive" aria-live="polite">
          {look === "busy" && <ChipMark size={20} state="working" />}
          {look === "done" && <Icon name="check" size={18} />}
          <span data-testid="model-save-words">{label}</span>
        </span>
      </button>
      {line !== undefined && (
        <p className="model-save-line" role="status" data-testid="model-save-line">
          {line}
        </p>
      )}
    </div>
  );
}
