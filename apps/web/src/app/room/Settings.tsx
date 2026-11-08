/**
 * The room sheet's pages off its first page's tiles (ADR 0151, ADR 0202), as the phone has them:
 * Lead (ADR 0104), and Spend per job (ADR 0117) with Save. Files (ADR 0100) is part of Media &
 * files now (`RoomMedia.tsx`).
 *
 * Spend per job says what began the present job and lists the jobs before it that spent, each
 * going to its reply, with what every job here has spent (ADR 0282). Opened from the banner's
 * Raise the limit, it starts on the next amount up and its Save lets the agents carry on too.
 */

import {
  ALL_JOBS,
  allJobsWords,
  ceilingOfChoice,
  type Directory,
  HELD_WORD,
  harnessOf,
  jobStartWords,
  nameOf,
  raisedChoice,
  roomAgents,
  roomLeadOf,
  SPEND_HELP,
  SPEND_PRESETS,
  SPEND_RANGE_WORDS,
  type Space,
  type SpendChoice,
  type SpentJobRow,
  saveAndCarryOnWords,
  spendCeilingOf,
  spendChoiceOf,
  spentJobRows,
} from "@chipschat/core";
import { DEFAULT_SPEND_CEILING_USD, dollars, type RoomSpend } from "@chipschat/protocol";
import { Icon } from "@chipschat/ui";
import { useRef, useState } from "react";
import { Back, Face, Group, type Pick, Row, Tile } from "./parts.tsx";

/**
 * Who leads the room: No lead, and the room's agents, with a tick on the one that does. Choosing
 * one says so in the room and puts the sheet away, as on the phone.
 */
export function LeadPage(props: {
  readonly titleId: string;
  readonly space: Space;
  readonly directory: Directory;
  readonly busy: boolean;
  readonly onBack: () => void;
  readonly onChoose: (agentId: string | null) => void;
}) {
  const { space, directory, busy } = props;
  const leads = roomLeadOf(space);
  const choice = (checked: boolean, onPick: () => void): Pick => ({
    type: "radio",
    group: "lead",
    checked,
    disabled: busy,
    onPick,
  });
  return (
    <>
      <Back titleId={props.titleId} title="Lead" onBack={props.onBack} />
      <p className="sheet-hint">
        The lead hands out the work. Chips gives it what is nobody's turn.
      </p>
      <div className="sheet-scroll">
        <Group>
          <Row
            face={
              <Tile>
                <Icon name="x" size={14} />
              </Tile>
            }
            name="No lead"
            under="Words for nobody stay with nobody"
            pick={choice(leads === undefined, () => props.onChoose(null))}
            testId="room-sheet-lead-nobody"
            trailing={leads === undefined && <Picked />}
          />
          {roomAgents(space, directory).here.map((id) => (
            <Row
              key={id}
              face={<Face directory={directory} id={id} />}
              name={nameOf(directory, id)}
              under={nameOf(directory, harnessOf(directory, id))}
              pick={choice(leads === id, () => props.onChoose(id))}
              testId={`room-sheet-lead-${id}`}
              trailing={leads === id && <Picked />}
            />
          ))}
        </Group>
      </div>
    </>
  );
}

/** An amount as the page picks it: the default's own, one of the five, or Other's field. */
function _choiceOfAmount(usd: number): SpendChoice {
  if (usd === DEFAULT_SPEND_CEILING_USD) return "default";
  return SPEND_PRESETS.includes(usd) ? usd : "other";
}

/** The tick on what is chosen now. */
function Picked() {
  return (
    <span className="sheet-picked" aria-hidden="true">
      <Icon name="check" size={15} />
    </span>
  );
}

/**
 * What the room allows a job: five amounts and Other, the default among them, with what the job
 * has spent so far against the one picked, and Save. Other opens a field for an exact amount.
 */
export function SpendPage(props: {
  readonly titleId: string;
  readonly space: Space;
  readonly spend: RoomSpend | undefined;
  readonly busy: boolean;
  readonly directory: Directory;
  readonly selfId: string;
  /** Opened from Raise the limit: Save lets the agents carry on too, the amount kept or not. */
  readonly carryOn?: boolean | undefined;
  readonly onBack: () => void;
  /** An amount, or `null` to follow the default again. */
  readonly onSave: (usd: number | null) => void;
  /** A job's row: the room, at the reply that closed its run. */
  readonly onGoTo?: ((lineId: string) => void) | undefined;
}) {
  const { space, busy } = props;
  const carryOn = props.carryOn === true;
  const [choice, setChoice] = useState<SpendChoice>(() =>
    carryOn ? raisedChoice(space) : spendChoiceOf(space),
  );
  const [typed, setTyped] = useState(() =>
    choice === "other" ? spendCeilingOf(space).toFixed(2) : "",
  );
  const field = useRef<HTMLInputElement>(null);
  const target = ceilingOfChoice(choice, typed);
  // Carrying on, the room's own amount saves nothing new and still lets them go on.
  const ready =
    target !== undefined && (carryOn || target !== (space.spendCeiling ?? null)) && !busy;
  const save = () => {
    if (ready) props.onSave(target);
  };
  const pick = (value: SpendChoice) => {
    setChoice(value);
    if (value === "other") setTimeout(() => field.current?.focus(), 0);
  };
  const on = (value: SpendChoice) =>
    choice === value || (value === "default" && choice === DEFAULT_SPEND_CEILING_USD);
  return (
    <form
      className="sheet-form"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Back titleId={props.titleId} title="Spend per job" onBack={props.onBack} />
      <p className="sheet-hint">{SPEND_HELP}</p>
      <div className="sheet-scroll sheet-spend">
        <fieldset className="sheet-amounts" aria-label="Spend per job">
          {SPEND_PRESETS.map((usd) =>
            usd === DEFAULT_SPEND_CEILING_USD ? (
              <Amount
                key="default"
                value="default"
                label="$3"
                under="Default"
                on={on("default")}
                onPick={pick}
              />
            ) : (
              <Amount key={usd} value={usd} label={`$${usd}`} on={on(usd)} onPick={pick} />
            ),
          )}
          <Amount
            value="other"
            label={choice === "other" && typeof target === "number" ? dollars(target) : "Other"}
            under="An amount"
            on={on("other")}
            onPick={pick}
          />
        </fieldset>
        {choice === "other" && (
          <>
            <label className="sheet-field">
              <span aria-hidden="true">$</span>
              <input
                ref={field}
                aria-label="Amount in dollars"
                data-testid="spend-amount"
                inputMode="decimal"
                value={typed}
                maxLength={7}
                placeholder="7.50"
                onChange={(event) => setTyped(event.target.value)}
              />
            </label>
            <p className="sheet-hint sheet-field-hint">{SPEND_RANGE_WORDS}</p>
          </>
        )}
        <SoFar
          spend={props.spend}
          // Against what is picked, or what the room has while Other's amount is unfinished.
          against={
            target === undefined ? spendCeilingOf(space) : (target ?? DEFAULT_SPEND_CEILING_USD)
          }
          since={jobStartWords(props.spend, props.directory, props.selfId)}
        />
        <button type="submit" className="sheet-go" disabled={!ready} data-testid="spend-save">
          {carryOn ? saveAndCarryOnWords(space, target) : "Save"}
        </button>
        <Jobs
          rows={spentJobRows(props.spend, space, props.directory)}
          total={allJobsWords(props.spend)}
          onGoTo={props.onGoTo}
        />
      </div>
    </form>
  );
}

/**
 * The jobs before this one that spent, newest first, each with whose runs, when, its steps and
 * what it came to, and Held where Chips held the agents at the ceiling; a click goes to its reply.
 * Then what every job here has spent. Nothing for a room whose only job is this one.
 */
function Jobs(props: {
  readonly rows: readonly SpentJobRow[];
  readonly total: string | undefined;
  readonly onGoTo: ((lineId: string) => void) | undefined;
}) {
  if (props.rows.length === 0) return null;
  const { onGoTo } = props;
  return (
    <section className="sheet-jobs" data-testid="spend-jobs" aria-label="Jobs before this one">
      <h4 className="sheet-jobs-head">Jobs before this one</h4>
      <ul className="ctx-group sheet-group">
        {props.rows.map((row) => {
          const { lineId } = row;
          const body = (
            <>
              <span className="sheet-job-words">
                <span className="sheet-job-title">
                  <b>{row.title}</b>
                  {row.held && <span className="sheet-job-held">{HELD_WORD}</span>}
                </span>
                <small>{row.when}</small>
              </span>
              <b className="sheet-job-amount">{row.amount}</b>
            </>
          );
          return (
            <li key={row.key} className="sheet-li" data-testid={`spend-job-${row.key}`}>
              {lineId === undefined || onGoTo === undefined ? (
                <div className="sheet-job">{body}</div>
              ) : (
                <button
                  type="button"
                  className="sheet-job ctx-row"
                  aria-label={row.label}
                  onClick={() => onGoTo(lineId)}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {props.total !== undefined && (
        <div className="sheet-jobs-total" data-testid="spend-total">
          <span>{ALL_JOBS}</span>
          <b>{props.total}</b>
        </div>
      )}
    </section>
  );
}

/** One of the amounts, Default under the default's; the one picked is ink. */
function Amount(props: {
  readonly value: SpendChoice;
  readonly label: string;
  readonly under?: string;
  readonly on: boolean;
  readonly onPick: (value: SpendChoice) => void;
}) {
  return (
    <label className="sheet-amount" data-on={props.on ? "true" : undefined}>
      <input
        type="radio"
        name="spend"
        className="sheet-pick-input"
        checked={props.on}
        onChange={() => props.onPick(props.value)}
        aria-label={props.under === undefined ? props.label : `${props.label}, ${props.under}`}
        data-testid={`spend-${props.value}`}
      />
      <b>{props.label}</b>
      {props.under !== undefined && <small>{props.under}</small>}
    </label>
  );
}

/** What the job has spent so far against the amount picked, and the runs that said no cost. */
function SoFar({
  spend,
  against,
  since,
}: {
  readonly spend: RoomSpend | undefined;
  readonly against: number;
  /** What began the job (ADR 0282). */
  readonly since?: string | undefined;
}) {
  const spent = spend?.spent_usd;
  const share = spent === undefined ? 0 : Math.min(100, (100 * spent) / against);
  const uncounted = spend?.uncounted_runs ?? 0;
  return (
    <div className="sheet-sofar" data-testid="spend-so-far">
      <div className="sheet-sofar-line">
        <span>This job so far</span>
        <b>{spent === undefined ? "…" : `${dollars(spent)} of ${dollars(against)}`}</b>
      </div>
      <div className="sheet-meter" aria-hidden="true">
        <i style={{ width: `${share}%` }} />
      </div>
      {since !== undefined && (
        <p className="sheet-hint sheet-field-hint" data-testid="spend-since">
          {since}
        </p>
      )}
      {uncounted > 0 && (
        <p className="sheet-hint sheet-field-hint">
          {uncounted === 1
            ? "1 run reported no cost and isn't counted."
            : `${uncounted} runs reported no cost and aren't counted.`}
        </p>
      )}
    </div>
  );
}
