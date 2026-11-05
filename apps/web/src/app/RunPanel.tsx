/**
 * The right rail: the live run. Its goal, who is running it and since when, the autonomy dial
 * in force for this harness in this room — live, since M1.4 made policy a projection — the
 * budget, the context ring, the timeline, the cost so far, and the controls a person has over
 * it: pause or resume, and stop. The panel goes final when the run ends: what happened stays,
 * the controls go. It says no state in a pill at its head (ADR 0151): Pause and Resume say whether
 * it is paused, and an ended run has no controls; until 11 October 2026 it said Done.
 *
 * The timeline is milestones and stretches, not a row per tool call: a plan's steps when the
 * harness sent one, what it needed a person for, what failed, where it compacted, what it is
 * doing now — and the ordinary calls between those folded into "12 tool calls · 1m 40s". The
 * receipt under the summary keeps the whole list (Arjun, 5 September 2026).
 */

import {
  type Directory,
  goalWords,
  type HarnessPolicyModel,
  hasTimeline,
  nameOf,
  type Run,
  runTimeline,
  type Session,
  type TimelineEntry,
  takesAutonomy,
} from "@chipschat/core";
import type { AutonomyLevel } from "@chipschat/protocol";
import {
  AutonomyDial,
  Button,
  ContextRing,
  contextPercent,
  formatCost,
  formatDuration,
  formatTokens,
  Timeline,
  type TimelineItem,
} from "@chipschat/ui";
import { useState } from "react";
import type { PanelMotion } from "./room/panelMotion.ts";
import { clockTime } from "./time.ts";
import { useNow } from "./useNow.ts";

export interface RunPanelProps {
  readonly run: Run;
  /** Come in the room that is open, or going from it as its run ends (`room/panelMotion.ts`). */
  readonly motion?: PanelMotion | undefined;
  readonly directory: Directory;
  /** The harness's standing across the workspace: its budget and what it has spent. */
  readonly harness?: HarnessPolicyModel | undefined;
  /** A command for this run, or a turn of the dial, is on its way. */
  readonly busy: boolean;
  /**
   * The visits to this space and what each one is running, when there is more than one to
   * choose between (ADR 0024). Two terminals open in one worktree are two runs at once, and
   * the panel would otherwise show whichever of them spoke last.
   */
  readonly sessions?: readonly { readonly session: Session; readonly run?: Run | undefined }[];
  readonly onPickSession?: ((sessionRef: string) => void) | undefined;
  /**
   * What the lanes this run opened have cost, all the way down the chain (ADR 0029). Shown beside
   * the run's own cost, because cost rolls up the trail even though context does not.
   */
  readonly chainCostUsd?: number | undefined;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onStop: (reason?: string) => void;
  readonly onAutonomy: (level: AutonomyLevel) => void;
  /**
   * Whether the reader may turn the dial: an owner or an admin (`mayTurnDial`, SEC-1). Anybody
   * else is shown the level as it stands, as they are once the run has ended.
   */
  readonly turnsDial: boolean;
}

const STATE_TO_STATUS = {
  running: "working",
  waiting: "waiting",
  done: "done",
  failed: "failed",
  cancelled: "failed",
  queued: "thinking",
} as const;

/** One button per visit, saying what that visit is doing. The one on screen is pressed. */
function SessionPicker(props: {
  readonly sessions: readonly { readonly session: Session; readonly run?: Run | undefined }[];
  readonly picked: string | undefined;
  readonly onPick: (sessionRef: string) => void;
}) {
  return (
    <div className="rp-sessions" data-testid="run-sessions">
      {props.sessions.map(({ session, run }) => (
        <button
          key={session.sessionRef}
          type="button"
          className="rp-session"
          aria-pressed={session.sessionRef === props.picked}
          data-live={session.live ? "true" : undefined}
          disabled={run === undefined}
          title={session.where ?? session.sessionRef}
          onClick={() => props.onPick(session.sessionRef)}
        >
          <i className="session-dot" aria-hidden="true" />
          {shortRef(session.sessionRef)}
          <span className="rp-session-word">
            {run === undefined ? "no run" : (ENDED[run.state] ?? STATE_TO_STATUS[run.state])}
          </span>
        </button>
      ))}
    </div>
  );
}

/** `scout:02e79313-8f1a-…` reads as `02e7931`: enough to tell two visits apart. */
function shortRef(sessionRef: string): string {
  const tail = sessionRef.slice(sessionRef.lastIndexOf(":") + 1);
  return tail.length > 8 ? tail.slice(0, 7) : tail;
}

const ENDED: Readonly<Record<string, string>> = {
  done: "Done",
  failed: "Failed",
  cancelled: "Stopped",
};

/** How the panel says it is moving; going, it is nothing to find or to press any more. */
function moving(motion: PanelMotion | undefined) {
  if (motion !== "leaving") return { "data-motion": motion };
  return { "data-motion": motion, inert: true, "aria-hidden": true } as const;
}

export function RunPanel(props: RunPanelProps) {
  const { run, directory, busy, onPause, onResume, onStop } = props;
  const ended = ENDED[run.state] !== undefined;
  // The step underway says how long it has been at it; that moves without an event arriving.
  const now = useNow(5000);
  const timeline = runTimeline(run).map((entry) => timelineItem(entry, directory, now));
  // A goal that is a message in the room is not its title: the room already shows it.
  const goal = goalWords(run);
  return (
    <aside className="runpanel" aria-label="Run" {...moving(props.motion)}>
      <div className="rp-h">
        <span>Run</span>
      </div>

      {props.sessions !== undefined && props.sessions.length > 1 && (
        <SessionPicker
          sessions={props.sessions}
          picked={run.sessionRef}
          onPick={props.onPickSession ?? (() => undefined)}
        />
      )}

      <div>
        {goal !== undefined && <div className="rp-title">{goal}</div>}
        <div className="rp-meta" data-testid="run-meta">
          {when(run)} · {nameOf(directory, run.harnessId)}
        </div>
      </div>

      {!ended && (
        <div className="rp-controls" data-testid="run-controls">
          {run.paused ? (
            <Button icon="play" onClick={onResume} disabled={busy}>
              Resume
            </Button>
          ) : (
            <Button icon="pause" onClick={onPause} disabled={busy || run.state !== "running"}>
              Pause
            </Button>
          )}
          <Stop busy={busy} onStop={onStop} />
        </div>
      )}

      {/* The dial only for a harness that takes it, and the timeline only when it has a
          milestone (ADR 0046): a control that changes nothing and a rail that is one stretch
          of tool calls are the two things Jacobian's panel was showing for no reason. */}
      {takesAutonomy(directory, run.harnessId) ? (
        <section className="rp-sec">
          <div className="rp-l">Autonomy</div>
          <AutonomyDial
            value={run.policy?.autonomy ?? 2}
            max={run.policy?.maxAutonomy ?? 3}
            readOnly={ended || !props.turnsDial}
            // A turn is on its way: the dial stays a dial, and a second turn waits for the first.
            onChange={(level) => {
              if (!busy) props.onAutonomy(level);
            }}
            label={`Autonomy for ${nameOf(directory, run.harnessId)} here`}
          />
          <Budget harness={props.harness} />
        </section>
      ) : (
        props.harness !== undefined && (
          <section className="rp-sec">
            <div className="rp-l">Budget</div>
            <Budget harness={props.harness} />
          </section>
        )
      )}

      <Context run={run} />

      {hasTimeline(run) && (
        <section className="rp-sec">
          <div className="rp-l">Timeline</div>
          <Timeline items={timeline} />
        </section>
      )}

      <Cost run={run} chainCostUsd={props.chainCostUsd} />
    </aside>
  );
}

/** `$1.47 of $25.00`, when the harness has a budget; what it has spent, when it has not. */
function Budget({ harness }: { readonly harness: HarnessPolicyModel | undefined }) {
  if (harness === undefined) return null;
  const spent = formatCost(harness.spentUsd);
  return (
    <div className="rp-meta" data-testid="budget">
      {harness.budgetUsd === undefined
        ? `${spent} spent`
        : `${spent} of ${formatCost(harness.budgetUsd)} budget`}
    </div>
  );
}

/** The ring, with the numbers behind it and the model whose window it is. */
function Context({ run }: { readonly run: Run }) {
  if (run.contextUsed === undefined || run.contextLimit === undefined) return null;
  const percent = contextPercent(run.contextUsed, run.contextLimit);
  return (
    <section className="rp-sec">
      <div className="rp-l">Context</div>
      <div className="rp-ring">
        <ContextRing percent={percent} size="lg" />
        <div className="rp-meta">
          {formatTokens(run.contextUsed)} of {formatTokens(run.contextLimit)} tokens
          {run.model === undefined ? "" : ` · ${run.model}`}
        </div>
      </div>
    </section>
  );
}

/**
 * `≈$1.47 · 85.5k tokens`, with `(15.4k cached)` when the harness said how many of the tokens in
 * came from the prompt cache; tokens alone when the model could not be priced.
 */
function Cost({
  run,
  chainCostUsd,
}: {
  readonly run: Run;
  readonly chainCostUsd?: number | undefined;
}) {
  const tokens =
    run.inputTokens === undefined && run.outputTokens === undefined
      ? undefined
      : (run.inputTokens ?? 0) + (run.outputTokens ?? 0);
  if (run.costUsd === undefined && tokens === undefined && chainCostUsd === undefined) return null;
  const parts = [
    run.costUsd === undefined ? undefined : formatCost(run.costUsd),
    tokens === undefined ? undefined : `${formatTokens(tokens)} tokens${cachedWords(run)}`,
  ].filter((part) => part !== undefined);
  return (
    <section className="rp-sec">
      <div className="rp-l">Cost</div>
      {parts.length > 0 && (
        <div className="rp-meta" data-testid="cost">
          {parts.join(" · ")}
        </div>
      )}
      {chainCostUsd !== undefined && (
        <div className="rp-meta rp-chain" data-testid="lane-cost">
          + {formatCost(chainCostUsd)} in lanes
        </div>
      )}
    </section>
  );
}

/** ` (15.4k cached)`, or nothing when the harness did not say or nothing came from the cache. */
function cachedWords(run: Run): string {
  const cached = run.cacheReadTokens;
  if (cached === undefined || cached <= 0 || run.inputTokens === undefined) return "";
  return ` (${formatTokens(Math.min(cached, run.inputTokens))} cached)`;
}

/** `Started 10:42`, then `· took 2m 05s` once it has ended. */
function when(run: Run): string {
  if (run.startedAt === undefined) return "Started";
  const started = `Started ${clockTime(run.startedAt)}`;
  if (run.endedAt === undefined) return started;
  const took = new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime();
  return `${started} · took ${formatDuration(took)}`;
}

/** How a decision reads on the rail: `approved by Arjun`, `denied by policy`, `expired`. */
function decided(
  resolution: { readonly decision: string; readonly by: string },
  directory: Directory,
): string {
  if (resolution.decision === "expired") return "expired";
  const who = resolution.by === "system" ? "policy" : nameOf(directory, resolution.by);
  return `${resolution.decision} by ${who}`;
}

/** `12 tool calls · 1m 40s · mostly Bash` */
function stretchTitle(entry: Extract<TimelineEntry, { kind: "stretch" }>): string {
  const parts = [`${entry.count} tool call${entry.count === 1 ? "" : "s"}`];
  if (entry.startedAt !== undefined && entry.endedAt !== undefined) {
    const took = new Date(entry.endedAt).getTime() - new Date(entry.startedAt).getTime();
    if (took >= 1000) parts.push(formatDuration(took));
  }
  if (entry.tool !== undefined) parts.push(`mostly ${entry.tool}`);
  return parts.join(" · ");
}

/** A plan step, a failed one, or the one underway — which says how long it has been at it. */
function stepItem(entry: Extract<TimelineEntry, { kind: "step" }>, now: number): TimelineItem {
  const since =
    entry.status === "now" && entry.since !== undefined
      ? `for ${formatDuration(now - new Date(entry.since).getTime())}`
      : undefined;
  const note = entry.note ?? since;
  return {
    id: entry.id,
    title: entry.title,
    status: entry.status,
    ...(note === undefined ? {} : { note }),
  };
}

function approvalItem(
  entry: Extract<TimelineEntry, { kind: "approval" }>,
  directory: Directory,
): TimelineItem {
  return {
    id: entry.id,
    title: `Needed you · ${entry.actionKind}`,
    status: entry.resolved === undefined ? "now" : "done",
    note: entry.resolved === undefined ? "needs your approval" : decided(entry.resolved, directory),
  };
}

function questionItem(
  entry: Extract<TimelineEntry, { kind: "question" }>,
  directory: Directory,
): TimelineItem {
  const answered = entry.answered;
  const note =
    answered === undefined
      ? "needs your answer"
      : answered.timedOut
        ? "timed out"
        : `answered by ${nameOf(directory, answered.by)}`;
  return {
    id: entry.id,
    title: `Asked you · ${entry.prompt}`,
    status: answered === undefined ? "now" : "done",
    note,
  };
}

function timelineItem(entry: TimelineEntry, directory: Directory, now: number): TimelineItem {
  switch (entry.kind) {
    case "step":
      return stepItem(entry, now);
    case "stretch":
      return { id: entry.id, title: stretchTitle(entry), status: "done" };
    case "checkpoint":
      return { id: entry.id, title: entry.title, status: "done", kind: "tick" };
    case "approval":
      return approvalItem(entry, directory);
    case "question":
      return questionItem(entry, directory);
    default:
      // Why it failed, as the row: the pill already says that it did.
      return { id: entry.id, title: entry.error, status: "failed" };
  }
}

/** Stop is for good, so it asks once: Stop → "Stop for good?" with a way back. */
function Stop({ busy, onStop }: { readonly busy: boolean; readonly onStop: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button icon="stop" variant="danger" onClick={() => setAsking(true)} disabled={busy}>
        Stop
      </Button>
    );
  }
  return (
    <span className="rp-confirm" data-testid="stop-confirm">
      <span>Stop for good?</span>
      <Button
        variant="danger"
        size="sm"
        onClick={() => {
          setAsking(false);
          onStop();
        }}
        disabled={busy}
      >
        Stop
      </Button>
      <Button size="sm" onClick={() => setAsking(false)}>
        Keep going
      </Button>
    </span>
  );
}
