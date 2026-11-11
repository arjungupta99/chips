/**
 * The room sheet's pages off its first page's tiles (ADR 0151, ADR 0202), as the phone has them:
 * Lead (ADR 0104), and Spend per job (ADR 0117) with Save. Files (ADR 0100) is part of Media &
 * files now (`RoomMedia.tsx`).
 *
 * Spend per job says what began the present job and lists the jobs before it that spent, each
 * going to its reply, with what every job here has spent (ADR 0282). Opened from the banner's
 * Raise the limit, it starts on the next amount up and its Save lets the agents carry on too. No
 * cap, across the foot of the amounts, is for a room that lasts (ADR 0292).
 */

import {
  ALL_JOBS,
  allJobsWords,
  ceilingOfChoice,
  ceilingWords,
  type Directory,
  HELD_WORD,
  harnessOf,
  JOBS_BEFORE,
  JOBS_SHOWN,
  jobRowsOf,
  jobStartWords,
  NO_CAP,
  NO_CAP_UNDER,
  nameOf,
  raisedChoice,
  roomAgents,
  roomLeadOf,
  SEE_ALL,
  SPEND_HELP,
  SPEND_PRESETS,
  type Space,
  type SpendChoice,
  type SpentJobRow,
  spendCeilingOf,
  spendChoiceOf,
  spendSave,
  spentJobRows,
  typedHint,
} from "@chipschat/core";
import {
  DEFAULT_SPEND_CEILING_USD,
  dollars,
  NO_SPEND_CEILING,
  type RoomSpend,
  type SpendCeilingSetting,
  type SpentJob,
  type SpentJobsPage,
} from "@chipschat/protocol";
import { Icon } from "@chipschat/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
 * What the room allows a job: five amounts and Other, the default among them, and No cap across
 * their foot (ADR 0292), with what the job has spent so far against the one picked, and Save.
 * Other opens a field for an exact amount, which says when the amount is not one it takes.
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
  /**
   * Whether the server takes No cap and amounts past $100 (ADR 0292); an older one is offered
   * neither. Absent is yes.
   */
  readonly noCap?: boolean | undefined;
  readonly onBack: () => void;
  /**
   * An amount, `null` to follow the default again, or `"none"` for No cap. Resolves true once the
   * server has it; the page stays, its Save saying Saved.
   */
  readonly onSave: (usd: SpendCeilingSetting) => Promise<boolean>;
  /** A job's row: the room, at the reply that closed its run. */
  readonly onGoTo?: ((lineId: string) => void) | undefined;
  /** See all: every job before this one, on a page of its own; nothing to offer, none. */
  readonly onSeeAll?: (() => void) | undefined;
}) {
  const { space, busy } = props;
  const carryOn = props.carryOn === true;
  const [choice, setChoice] = useState<SpendChoice>(() =>
    carryOn ? raisedChoice(space) : spendChoiceOf(space),
  );
  const [typed, setTyped] = useState(() => {
    const now = spendCeilingOf(space);
    return choice === "other" && typeof now === "number" ? now.toFixed(2) : "";
  });
  const field = useRef<HTMLInputElement>(null);
  const noCap = props.noCap !== false;
  const target = ceilingOfChoice(choice, typed, noCap);
  const hint = typedHint(typed, noCap);
  const [saved, setSaved] = useState<{ readonly usd: SpendCeilingSetting } | undefined>();
  const { ready, words } = spendSave({ space, target, carryOn, busy, saved });
  const save = () => {
    if (!ready || target === undefined) return;
    const usd = target;
    void props.onSave(usd).then((done) => {
      if (done) setSaved({ usd });
    });
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
          {noCap && (
            <Amount
              value={NO_SPEND_CEILING}
              label={NO_CAP}
              under={NO_CAP_UNDER}
              on={on(NO_SPEND_CEILING)}
              onPick={pick}
              wide
            />
          )}
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
                maxLength={8}
                placeholder="7.50"
                aria-invalid={hint.wrong ? true : undefined}
                aria-describedby="spend-amount-hint"
                onChange={(event) => setTyped(event.target.value)}
              />
            </label>
            <p
              id="spend-amount-hint"
              className="sheet-hint sheet-field-hint"
              data-wrong={hint.wrong ? "true" : undefined}
              data-testid="spend-amount-hint"
            >
              {hint.words}
            </p>
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
          {words}
        </button>
        <Jobs
          rows={spentJobRows(props.spend, space, props.directory)}
          total={allJobsWords(props.spend)}
          onGoTo={props.onGoTo}
          onSeeAll={props.onSeeAll}
        />
      </div>
    </form>
  );
}

/**
 * The jobs before this one that spent, newest first, the first `JOBS_SHOWN` of them, each with
 * whose runs, when, its steps and what it came to, and Held where Chips held the agents at the
 * ceiling; a click goes to its reply. See all, by the heading, opens the rest (ADR 0292 addendum).
 * Then what every job here has spent. Nothing for a room whose only job is this one.
 */
function Jobs(props: {
  readonly rows: readonly SpentJobRow[];
  readonly total: string | undefined;
  readonly onGoTo: ((lineId: string) => void) | undefined;
  readonly onSeeAll: (() => void) | undefined;
}) {
  if (props.rows.length === 0) return null;
  const { onGoTo, onSeeAll } = props;
  return (
    <section className="sheet-jobs" data-testid="spend-jobs" aria-label={JOBS_BEFORE}>
      <div className="sheet-jobs-headline">
        <h4 className="sheet-jobs-head">{JOBS_BEFORE}</h4>
        {onSeeAll !== undefined && (
          <button
            type="button"
            className="sheet-jobs-all"
            aria-label={`${SEE_ALL}, ${JOBS_BEFORE}`}
            data-testid="spend-see-all"
            onClick={onSeeAll}
          >
            {SEE_ALL}
          </button>
        )}
      </div>
      <ul className="ctx-group sheet-group">
        {props.rows.slice(0, JOBS_SHOWN).map((row) => (
          <JobRow key={row.key} row={row} onGoTo={onGoTo} />
        ))}
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

/** One job before this one, as the list and See all's page draw it. */
function JobRow(props: {
  readonly row: SpentJobRow;
  readonly onGoTo: ((lineId: string) => void) | undefined;
}) {
  const { row, onGoTo } = props;
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
    <li className="sheet-li" data-testid={`spend-job-${row.key}`}>
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
}

/**
 * Every job before this one, newest first, from See all (ADR 0292 addendum): read from the server
 * a page at a time as the list's foot scrolls near, so a room that has run for months is never read
 * whole. A read that fails says so, with Try again.
 */
export function AllJobsPage(props: {
  readonly titleId: string;
  readonly space: Space;
  readonly directory: Directory;
  readonly read: (before?: number) => Promise<SpentJobsPage>;
  readonly onBack: () => void;
  readonly onGoTo?: ((lineId: string) => void) | undefined;
}) {
  const { space, directory, read } = props;
  const [jobs, setJobs] = useState<readonly SpentJob[]>([]);
  // The `before` of the page still to read; `null` once the last has come.
  const [next, setNext] = useState<number | null | undefined>(undefined);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const reading = useRef(false);
  const foot = useRef<HTMLDivElement>(null);
  const page = useCallback(
    async (before: number | undefined) => {
      if (reading.current) return;
      reading.current = true;
      setFailed(undefined);
      try {
        const got = await read(before);
        setJobs((now) => (before === undefined ? got.jobs : [...now, ...got.jobs]));
        setNext(got.next ?? null);
      } catch (error) {
        setFailed(error instanceof Error ? error.message : "The server would not say.");
      } finally {
        reading.current = false;
      }
    },
    [read],
  );
  useEffect(() => {
    void page(undefined);
  }, [page]);
  // The foot in sight, or near it, reads the next page.
  useEffect(() => {
    const at = foot.current;
    if (at === null || typeof next !== "number" || typeof IntersectionObserver === "undefined") {
      return;
    }
    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void page(next);
      },
      { rootMargin: "240px" },
    );
    seen.observe(at);
    return () => seen.disconnect();
  }, [next, page]);
  const rows = useMemo(() => jobRowsOf(jobs, space, directory), [jobs, space, directory]);
  return (
    <>
      <Back titleId={props.titleId} title={JOBS_BEFORE} onBack={props.onBack} />
      <div className="sheet-scroll sheet-spend" data-testid="jobs-page">
        {rows.length > 0 && (
          <ul className="ctx-group sheet-group">
            {rows.map((row) => (
              <JobRow key={row.key} row={row} onGoTo={props.onGoTo} />
            ))}
          </ul>
        )}
        <div ref={foot} className="sheet-jobs-foot" data-testid="jobs-foot">
          {failed !== undefined ? (
            <button
              type="button"
              className="sheet-jobs-all"
              onClick={() => void page(typeof next === "number" ? next : undefined)}
            >
              {failed} Try again
            </button>
          ) : next !== null ? (
            typeof next === "number" ? (
              <button type="button" className="sheet-jobs-all" onClick={() => void page(next)}>
                More
              </button>
            ) : (
              "…"
            )
          ) : rows.length === 0 ? (
            "No jobs before this one."
          ) : null}
        </div>
      </div>
    </>
  );
}

/** One of the amounts, Default under the default's; the one picked is ink. No cap is wide. */
function Amount(props: {
  readonly value: SpendChoice;
  readonly label: string;
  readonly under?: string;
  readonly on: boolean;
  readonly onPick: (value: SpendChoice) => void;
  readonly wide?: boolean;
}) {
  return (
    <label
      className="sheet-amount"
      data-on={props.on ? "true" : undefined}
      data-wide={props.wide === true ? "true" : undefined}
    >
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
  /** The amount picked, or No cap, against which nothing is measured (ADR 0292). */
  readonly against: number | typeof NO_SPEND_CEILING;
  /** What began the job (ADR 0282). */
  readonly since?: string | undefined;
}) {
  const spent = spend?.spent_usd;
  const capped = against !== NO_SPEND_CEILING;
  const share = spent === undefined || !capped ? 0 : Math.min(100, (100 * spent) / against);
  const uncounted = spend?.uncounted_runs ?? 0;
  return (
    <div className="sheet-sofar" data-testid="spend-so-far">
      <div className="sheet-sofar-line">
        <span>This job so far</span>
        <b>
          {spent === undefined
            ? "…"
            : capped
              ? `${dollars(spent)} of ${ceilingWords(against)}`
              : dollars(spent)}
        </b>
      </div>
      {capped && (
        <div className="sheet-meter" aria-hidden="true">
          <i style={{ width: `${share}%` }} />
        </div>
      )}
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
