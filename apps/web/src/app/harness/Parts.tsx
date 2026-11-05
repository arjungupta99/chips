/**
 * The pages a harness's page opens (ADR 0254, here since ADR 0266), each over it with a way back:
 * every one of its agents, with a field that finds one; its context files; When it asks you whole,
 * with how far it is trusted under it; and its recent runs. Each holds what the page once held
 * whole, so the page itself is short. The phone pushes the same pages (`harnesses/parts/`). The
 * desk's own four, from its Connection group, are in `Desk.tsx` (ADR 0273).
 */

import {
  agentsTab,
  type ContextReads,
  type Directory,
  harnessRuns,
  mayTurnDial,
  nameOf,
  RUN_STATE_WORDS,
  type SetAutonomyInput,
  type SetRulesInput,
  spaceTitle,
  takesAutonomy,
  type WorkspaceModel,
} from "@chipschat/core";
import type { AutonomyLevel } from "@chipschat/protocol";
import { AutonomyDial, Icon } from "@chipschat/ui";
import { useState } from "react";
import { AgentSections } from "../Agents.tsx";
import { Asking } from "../Asking.tsx";
import { HarnessContext } from "../context/HarnessContext.tsx";
import { GroupRow } from "../GroupRow.tsx";
import { relativeTime } from "../time.ts";
import { MayDoPart, OwnerPart, SendsPart, type TokenService, TokensPart } from "./Desk.tsx";
import type { HarnessPart } from "./parts.ts";

export interface PartProps {
  readonly part: HarnessPart;
  readonly harnessId: string;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string | undefined;
  readonly onOpenAgent: (agentId: string) => void;
  readonly onOpenSpace: (spaceId: string) => void;
  /** Its context files' reads (ADR 0134). */
  readonly context?: ContextReads | undefined;
  /** A shared file an agent's page sent the reader here for, flashed once (ADR 0135). */
  readonly flashFile?: string | undefined;
  readonly onOpenFile: (name: string) => void;
  readonly onSetRules?: ((input: SetRulesInput) => void) | undefined;
  /** Turn the dial (ADR 0046). Absent, the dial is read only. */
  readonly onSetAutonomy?: ((input: SetAutonomyInput) => void) | undefined;
  /** Hand it on (M5.2), for whoever may. Absent, Owner says who and does nothing. */
  readonly onTransfer?: ((harnessId: string, ownerId: string) => Promise<void>) | undefined;
  /** Say what it may do (ADR 0046), for the same people. Absent, no page. */
  readonly onDeclare?:
    | ((harnessId: string, capabilities: readonly string[]) => Promise<void>)
    | undefined;
  /** Its tokens (ADR 0023). Absent, no page. */
  readonly tokens?: TokenService | undefined;
}

export function Part(props: PartProps) {
  switch (props.part) {
    case "agents":
      return <AllAgents {...props} />;
    case "context":
      return (
        <HarnessContext
          reads={props.context}
          model={props.model}
          directory={props.directory}
          harnessId={props.harnessId}
          selfId={props.selfId}
          flashFile={props.flashFile}
          onOpenFile={props.onOpenFile}
        />
      );
    case "asks":
      return <WhenItAsks {...props} />;
    case "runs":
      return <RecentRuns {...props} />;
    default:
      return <DeskPart {...props} />;
  }
}

/** The desk's own pages (ADR 0273): nothing where the reader may not have it. */
function DeskPart(props: PartProps) {
  const { harnessId, onDeclare, tokens } = props;
  switch (props.part) {
    case "owner":
      return (
        <OwnerPart
          harnessId={harnessId}
          model={props.model}
          directory={props.directory}
          selfId={props.selfId}
          onTransfer={props.onTransfer}
        />
      );
    case "sends":
      return <SendsPart connection={props.model.connections[harnessId]} />;
    case "may":
      return onDeclare === undefined ? null : (
        <MayDoPart
          harnessId={harnessId}
          capabilities={props.directory[harnessId]?.capabilities}
          onDeclare={onDeclare}
        />
      );
    case "tokens":
      return tokens === undefined ? null : <TokensPart harnessId={harnessId} service={tokens} />;
    default:
      return null;
  }
}

/**
 * Every agent of one harness, from See all on its page, which shows five: a field that finds one by
 * its name or where it is, its Main agent first, then the rest in the Agents page's own order, and
 * its archived ones behind the fold at the foot.
 */
function AllAgents(props: PartProps) {
  const [typed, setTyped] = useState("");
  const tab = agentsTab(props.model, props.directory, props.selfId ?? "", {
    harnessId: props.harnessId,
  });
  const all = tab.leads.length + tab.agents.length;
  return (
    <div className="hp-part" data-testid="all-agents">
      <label className="hp-search">
        <Icon name="search" size={15} />
        <input
          type="search"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={`Search ${all} ${all === 1 ? "agent" : "agents"}`}
          aria-label={`Search ${nameOf(props.directory, props.harnessId)}'s agents`}
          spellCheck={false}
          data-testid="all-agents-search"
        />
      </label>
      <AgentSections
        model={props.model}
        directory={props.directory}
        selfId={props.selfId ?? ""}
        harnessId={props.harnessId}
        words={typed}
        onOpen={props.onOpenAgent}
      />
    </div>
  );
}

/**
 * When it asks you (ADR 0195), whole, as it once stood on the card; and under it, only for a harness
 * that hands its permissions to Chips (ADR 0046), how far it is trusted. The dial turns for an owner
 * or an admin alone (SEC-1); anybody else sees the level, and it does not move.
 */
function WhenItAsks(props: PartProps) {
  const policy = props.model.harnesses[props.harnessId];
  const turns = props.onSetAutonomy !== undefined && mayTurnDial(props.model, props.selfId);
  return (
    <div className="hp-part" data-testid="when-it-asks">
      <Asking
        model={props.model}
        directory={props.directory}
        harnessId={props.harnessId}
        selfId={props.selfId}
        onSetRules={props.onSetRules}
        onOpenSpace={props.onOpenSpace}
      />
      {takesAutonomy(props.directory, props.harnessId) && (
        <section className="ctx hp-trust" aria-label="How far it is trusted">
          <div className="ctx-h">
            <h3 className="agents-h">How far it is trusted</h3>
          </div>
          <div className="hp-trust-card">
            {policy === undefined ? (
              <p className="hp-note">
                No policy yet. It gets one the first time it asks for something.
              </p>
            ) : (
              <AutonomyDial
                value={policy.autonomy}
                max={policy.maxAutonomy}
                readOnly={!turns}
                {...(turns
                  ? {
                      onChange: (level: AutonomyLevel) =>
                        props.onSetAutonomy?.({
                          harnessId: props.harnessId,
                          level,
                          rules: policy.rules,
                        }),
                    }
                  : {})}
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/** As many as are worth scrolling through. */
const RUNS_SHOWN = 100;

/**
 * Its runs: the newest first, a row each with what it was asked, where and when, how it ended and
 * what it cost, each opening its space.
 */
function RecentRuns(props: PartProps) {
  const runs = harnessRuns(props.model.spaces, props.directory, props.harnessId, RUNS_SHOWN);
  const where = (spaceId: string) => {
    const space = props.model.spaces.find((each) => each.id === spaceId);
    return space === undefined ? undefined : spaceTitle(space, props.directory, props.selfId ?? "");
  };
  return (
    <div className="hp-part" data-testid="recent-runs">
      {runs.length === 0 ? (
        <p className="agents-empty">Nothing yet.</p>
      ) : (
        <ul className="ctx-group">
          {runs.map((run) => (
            <GroupRow
              key={run.runId}
              label={run.goal}
              lines={2}
              sub={[
                where(run.spaceId),
                run.startedAt === undefined ? undefined : relativeTime(run.startedAt),
                RUN_STATE_WORDS[run.state],
              ]
                .filter((each) => each !== undefined && each !== "")
                .join(" · ")}
              value={run.costUsd === undefined ? undefined : `$${run.costUsd.toFixed(2)}`}
              onClick={() => props.onOpenSpace(run.spaceId)}
              testId={`run-${run.runId}`}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
