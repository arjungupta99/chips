/**
 * One harness's page on the desktop, as the phone draws it (ADR 0254, Arjun's B of the mock "Harness
 * page layouts"; ADR 0266 brought it here): what it is now, New agent and Pause, its agents and its
 * own jobs, how it is set up, what it has run, and Restart and Remove at the foot. Until ADR 0266
 * the desktop's page was the old card: the connection checklist first, When it asks you whole, and
 * no agents, runs or Pause at all.
 *
 * The page is kept short. Its agents stop at the first five of the Agents page's own order, with a
 * row that opens all of them; Context files, When it asks you and Recent runs are a row each, whose
 * sections open whole on pages of their own over it (`Parts.tsx`). Model is a row there too, the
 * same row and dialog as an agent's page (ADR 0154), since every agent of the harness with no model
 * of its own follows it. Wide enough, its agents, jobs and History stand on the left and Set up and
 * the desk's Connection group on the right (ADR 0273), as on an iPad beside the Agents list (ADR
 * 0256); narrower, one after the other in the phone's order, Set up before History.
 *
 * The head says what it is now: why it can't answer (ADR 0083), what it is doing, back from a
 * restart this page watched (ADR 0094), or that it is connected and since when. Under it, where it
 * works. Done and Idle say nothing, as on its tile.
 *
 * What only a desk has (who owns it, what it sends, what it may do and its tokens) is passed in as
 * `desk`, a Connection group of rows under Set up (`Desk.tsx`, ADR 0273): the phone leaves these out
 * on purpose, since issuing a credential is a desk job.
 */

import {
  AGENTS_SHOWN,
  agentStateWords,
  agentsTab,
  alwaysRules,
  asksGoTo,
  asksValue,
  backFromRestart,
  backWords,
  budgetWords,
  connectedWords,
  type Directory,
  type FleetHarness,
  fleetDoing,
  harnessRollup,
  harnessRuns,
  nameOf,
  REMOVED_HARNESS_NOTE,
  type RestartOffer,
  type RunState,
  removeAsking,
  restartAsking,
  restartOffer,
  runsWeekWords,
  type WorkspaceModel,
} from "@chipschat/core";
import type { AgentState } from "@chipschat/protocol";
import { Avatar, Button, type HarnessStatus, Icon } from "@chipschat/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AgentListRow } from "../Agents.tsx";
import { ConfirmDialog } from "../ConfirmDialog.tsx";
import { GroupRow } from "../GroupRow.tsx";
import { FleetWord, STATUS_TONE, saysStatus } from "../Sidebar.tsx";
import { Meter } from "./HarnessCards.tsx";
import type { HarnessPart } from "./parts.ts";

/** A run's input for Pause and Resume: its space and its id. */
interface RunTarget {
  readonly spaceId: string;
  readonly runId: string;
}

export interface HarnessPageProps {
  readonly harnessId: string;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string | undefined;
  readonly onOpenAgent: (agentId: string) => void;
  readonly onOpenPart: (part: HarnessPart) => void;
  /** New agent, for whoever may ask this harness for one (ADR 0190, point 4). */
  readonly newAgent?: ReactNode;
  /** Pause and Resume its latest run. Absent, no Pause. */
  readonly run?:
    | {
        readonly pause: (target: RunTarget) => void;
        readonly resume: (target: RunTarget) => void;
      }
    | undefined;
  /** Its Main agent's Model row, its foot and what stands over it (`useModelRow`). */
  readonly modelRow?:
    | { readonly row: ReactNode; readonly foot: string | undefined; readonly overlays: ReactNode }
    | undefined;
  /** The Context files row's value; `null` for a reader who may not see them. */
  readonly contextValue: string | undefined | null;
  /** Its own jobs (ADR 0252), for the people who run it. */
  readonly jobs?: ReactNode;
  /** What only a desk has: its Connection group (ADR 0273). */
  readonly desk?: ReactNode;
  /** Restart (ADR 0094): the server's. Absent, no row. */
  readonly restart?: ((harnessId: string) => Promise<void>) | undefined;
  /** Remove (ADR 0078), for whoever may. Absent, no row. */
  readonly remove?: ((harnessId: string) => Promise<void>) | undefined;
}

export function HarnessPage(props: HarnessPageProps) {
  const name = nameOf(props.directory, props.harnessId);
  return (
    <section className="harness-page" data-testid="harness-card" aria-label={name}>
      <Head {...props} name={name} />
      <Acts {...props} />
      <div className="hp-cols">
        <div className="hp-col">
          <ItsAgents {...props} />
          {props.jobs}
          <History {...props} />
        </div>
        <div className="hp-col">
          <SetUp {...props} />
          {props.desk}
        </div>
      </div>
      <Foot {...props} name={name} />
    </section>
  );
}

/** A run's state as the ring round the face says it, while it says anything. */
const RING: Readonly<Partial<Record<RunState, HarnessStatus>>> = {
  queued: "thinking",
  running: "working",
  waiting: "waiting",
  failed: "failed",
};

/**
 * The face, and what it is now in a line: why it can't answer, what it is doing, that it is back
 * from a restart this page watched, or that it is connected and since when. Under it, where it
 * works, or that it was removed.
 */
function Head(props: HarnessPageProps & { readonly name: string }) {
  const { harnessId, model, directory, selfId, name } = props;
  const entry = model.fleet.find((each) => each.harnessId === harnessId);
  const trouble = agentStateWords(directory, harnessId, Date.now(), undefined, selfId);
  const busy = trouble === undefined && entry !== undefined && saysStatus(entry);
  const back = useBack(directory[harnessId]?.state);
  const ring = busy ? (entry.paused ? "waiting" : RING[entry.status ?? "done"]) : undefined;
  return (
    <div className="hp-head">
      <Avatar
        name={name}
        kind="harness"
        size="lg"
        cantAnswer={trouble !== undefined}
        {...(ring === undefined ? {} : { status: ring })}
      />
      <div className="hp-head-words">
        <Now
          entry={busy ? entry : undefined}
          model={model}
          trouble={trouble}
          back={back}
          connected={connectedWords(directory, harnessId, Date.now())}
        />
        <p className="hp-note" data-testid="harness-rollup">
          {directory[harnessId]?.removedAt === undefined
            ? harnessRollup(entry)
            : REMOVED_HARNESS_NOTE}
        </p>
      </div>
    </div>
  );
}

/** The head's line: a dot in the state's colour, and its words, the first of these that applies. */
function Now(props: {
  readonly entry: FleetHarness | undefined;
  readonly model: WorkspaceModel;
  readonly trouble: string | undefined;
  readonly back: number | undefined;
  readonly connected: string | undefined;
}) {
  const { entry, trouble, back } = props;
  if (trouble !== undefined) {
    return (
      <Line tone="amber" hollow testId="harness-trouble">
        {trouble}
      </Line>
    );
  }
  if (entry !== undefined) {
    return (
      <>
        <Line tone={entry.paused ? "amber" : (STATUS_TONE[entry.status ?? ""] ?? "neutral")}>
          <FleetWord harness={entry} doing={fleetDoing(props.model.spaces, entry)} />
        </Line>
        {back !== undefined && (
          <Line tone="green" testId="harness-back">
            {backWords(back, Date.now())}
          </Line>
        )}
      </>
    );
  }
  if (back !== undefined) {
    return (
      <Line tone="green" testId="harness-back">
        {backWords(back, Date.now())}
      </Line>
    );
  }
  if (props.connected === undefined) return null;
  return (
    <Line tone="green" plain testId="harness-connected">
      {props.connected}
    </Line>
  );
}

function Line(props: {
  readonly tone: string;
  /** A hollow dot: it can't answer. */
  readonly hollow?: boolean;
  /** The words in the page's ink rather than the tone's: Connected. */
  readonly plain?: boolean;
  readonly testId?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <p
      className="hp-line"
      data-tone={props.tone}
      data-plain={props.plain === true ? "true" : undefined}
      data-testid={props.testId ?? "harness-status"}
    >
      <span
        className="hp-dot"
        data-hollow={props.hollow === true ? "true" : undefined}
        aria-hidden="true"
      />
      <span className="hp-line-words">{props.children}</span>
    </p>
  );
}

/**
 * When a restart this page watched ended with the harness able to answer (ADR 0094). Nothing is
 * kept of it: another window, or the page opened later, says nothing.
 */
function useBack(state: AgentState | undefined): number | undefined {
  const before = useRef(state);
  const [at, setAt] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (backFromRestart(before.current, state)) setAt(Date.now());
    else if (state?.restarting !== undefined) setAt(undefined);
    before.current = state;
  }, [state]);
  return at;
}

/** Whether a run is still going, paused or not: queued, running or waiting on someone. */
const runGoing = (state: RunState | undefined) =>
  state === "queued" || state === "running" || state === "waiting";

/**
 * New agent, and Pause or Resume, in one row under the head. Pause is greyed out while nothing of
 * it is going (Arjun: "Show it greyed out"), so the row keeps its shape between idle and busy; the
 * server refuses to pause a run that has ended.
 */
function Acts(props: HarnessPageProps) {
  const { run } = props;
  if (props.newAgent === undefined && run === undefined) return null;
  const entry = props.model.fleet.find((each) => each.harnessId === props.harnessId);
  const target =
    entry?.spaceId !== undefined && entry.runId !== undefined && runGoing(entry.status)
      ? { spaceId: entry.spaceId, runId: entry.runId }
      : undefined;
  const paused = target !== undefined && entry?.paused === true;
  return (
    <div className="hp-acts">
      {props.newAgent}
      {run !== undefined && (
        <Button
          className="hp-act"
          disabled={target === undefined}
          data-testid="harness-pause"
          onClick={() => {
            if (target === undefined) return;
            if (paused) run.resume(target);
            else run.pause(target);
          }}
        >
          <Icon name={paused ? "play" : "pause"} size={14} />
          {paused ? "Resume" : "Pause"}
        </Button>
      )}
    </div>
  );
}

/**
 * Its agents, as the Agents page lists them, each opening its page: the first five, and a row that
 * opens all of them on a page of their own, where its archived ones are too. With five or fewer,
 * its archived ones have the row instead.
 */
function ItsAgents(props: HarnessPageProps) {
  const { model, directory, harnessId } = props;
  const tab = agentsTab(model, directory, props.selfId ?? "", { harnessId });
  const rows = [...tab.leads, ...tab.agents];
  const archived = tab.archived.here.length + tab.archived.elsewhere.length;
  if (rows.length + archived === 0) return null;
  return (
    <section className="ctx hp-agents" aria-label="Its agents" data-testid="its-agents">
      <div className="ctx-h">
        <h3 className="agents-h">{`Agents · ${rows.length}`}</h3>
      </div>
      <ul className="ctx-group hp-agent-list">
        {rows.slice(0, AGENTS_SHOWN).map((row) => (
          <AgentListRow key={row.id} row={row} onOpen={props.onOpenAgent} />
        ))}
        {rows.length > AGENTS_SHOWN ? (
          <GroupRow
            label={`See all ${rows.length} agents`}
            onClick={() => props.onOpenPart("agents")}
            testId="its-agents-all"
          />
        ) : archived > 0 ? (
          <GroupRow
            label={`Archived · ${archived}`}
            onClick={() => props.onOpenPart("agents")}
            testId="its-archived"
          />
        ) : null}
      </ul>
    </section>
  );
}

/**
 * How it is set up, a row each: its Main agent's Model row, which opens the model's dialog; its
 * context files, for its owner; and When it asks you, for everybody who reads the page. The last two
 * open their sections whole on pages of their own. The Model row's foot stands under the group.
 */
function SetUp(props: HarnessPageProps) {
  const { model, directory, harnessId, selfId } = props;
  const asks = asksValue(
    alwaysRules(model, directory, harnessId, selfId),
    asksGoTo(directory, harnessId, selfId),
  );
  return (
    <section className="ctx hp-set-up" aria-label="Set up" data-testid="harness-set-up">
      <div className="ctx-h">
        <h3 className="agents-h">Set up</h3>
      </div>
      <ul className="ctx-group">
        {props.modelRow?.row}
        {props.contextValue === null ? null : (
          <GroupRow
            label="Context files"
            value={props.contextValue}
            mark={{ icon: "doc", ground: 9 }}
            onClick={() => props.onOpenPart("context")}
            testId="harness-context-row"
          />
        )}
        <GroupRow
          label="When it asks you"
          value={asks}
          mark={{ icon: "lock", ground: 3 }}
          onClick={() => props.onOpenPart("asks")}
          testId="harness-asks-row"
        />
      </ul>
      {props.modelRow?.foot !== undefined && (
        <p className="ctx-foot" data-testid="model-foot">
          {props.modelRow.foot}
        </p>
      )}
      {props.modelRow?.overlays}
    </section>
  );
}

/**
 * What it has run: Recent runs, a row opening the list, with how many began this week; and its
 * budget, for a harness that has one. Nothing for a harness that has never run.
 */
function History(props: HarnessPageProps) {
  const { model, directory, harnessId } = props;
  const policy = model.harnesses[harnessId];
  const budget = budgetWords(policy);
  const runs = harnessRuns(model.spaces, directory, harnessId);
  if (runs.length === 0 && budget === undefined) return null;
  return (
    <section className="ctx hp-history" aria-label="History" data-testid="harness-history">
      <div className="ctx-h">
        <h3 className="agents-h">History</h3>
      </div>
      {runs.length > 0 && (
        <ul className="ctx-group">
          <GroupRow
            label="Recent runs"
            value={runsWeekWords(runs, Date.now())}
            mark={{ icon: "list", ground: 10 }}
            onClick={() => props.onOpenPart("runs")}
            testId="harness-runs-row"
          />
        </ul>
      )}
      {budget !== undefined && policy?.budgetUsd !== undefined && (
        <div className="hp-budget" data-testid="harness-budget">
          <Meter label="Budget" caption={budget} used={policy.spentUsd} of={policy.budgetUsd} />
        </div>
      )}
    </section>
  );
}

/**
 * The page's foot: Restart harness… in a group of its own and, apart and in red, Remove harness…,
 * as an agent's page ends with Archive and, apart, Delete. Each asks first, in the phone's words.
 */
function Foot(props: HarnessPageProps & { readonly name: string }) {
  const { harnessId, model, directory, selfId, name } = props;
  const [asking, setAsking] = useState<"restart" | "remove" | undefined>(undefined);
  const offer =
    props.restart === undefined || selfId === undefined
      ? undefined
      : restartOffer(model, directory, harnessId, selfId);
  if (offer === undefined && props.remove === undefined) return null;
  return (
    <div className="hp-foot">
      {offer !== undefined && (
        <ul className="ctx-group">
          <RestartRow offer={offer} onPress={() => setAsking("restart")} />
        </ul>
      )}
      {props.remove !== undefined && (
        <ul className="ctx-group hp-apart">
          <GroupRow
            label="Remove harness…"
            tone="danger"
            onClick={() => setAsking("remove")}
            testId="remove-harness"
          />
        </ul>
      )}
      {asking === "restart" && props.restart !== undefined && (
        <ConfirmDialog
          asking={restartAsking(name)}
          danger={false}
          tooOld="Not restarted: this server is older than the app, and cannot restart a harness yet."
          onCancel={() => setAsking(undefined)}
          onConfirm={async () => {
            await props.restart?.(harnessId);
            setAsking(undefined);
          }}
        />
      )}
      {asking === "remove" && props.remove !== undefined && (
        <ConfirmDialog
          asking={removeAsking(name)}
          danger
          tooOld="Not removed: this server is older than the app, and cannot remove a harness yet."
          onCancel={() => setAsking(undefined)}
          onConfirm={async () => {
            await props.remove?.(harnessId);
            setAsking(undefined);
          }}
        />
      )}
    </div>
  );
}

/**
 * Restart as a row: "Restart harness…", gold while it can't answer; "Restarting…" while one
 * stands; or, while nothing of it is connected, why there is nobody to ask, which the head already
 * says is offline.
 */
function RestartRow(props: { readonly offer: RestartOffer; readonly onPress: () => void }) {
  const { offer } = props;
  switch (offer.kind) {
    case "offer":
      return (
        <GroupRow
          label="Restart harness…"
          tone="accent"
          loud={offer.loud}
          onClick={props.onPress}
          testId="restart-harness"
        />
      );
    case "going":
      return <GroupRow label={offer.label} tone="off" testId="restart-harness" />;
    case "unreachable":
      return (
        <GroupRow
          label="Restart harness"
          tone="off"
          sub={offer.body}
          testId="restart-unreachable"
        />
      );
  }
}
