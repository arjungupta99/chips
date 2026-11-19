/**
 * The pages a harness's page opens (ADR 0254, here since ADR 0266), each over it with a way back:
 * every one of its agents, with a field that finds one; its context files; When it asks you whole,
 * with how far it is trusted under it; and its recent runs. Each holds what the page once held
 * whole, so the page itself is short. The phone pushes the same pages (`harnesses/parts/`). The
 * desk's own four, from its Connection group, are in `Desk.tsx` (ADR 0273).
 */

import {
  agentsTab,
  type Banners,
  type ContextReads,
  type Directory,
  harnessRuns,
  nameOf,
  permissionsRow,
  RUN_STATE_WORDS,
  type SetAutonomyInput,
  type SetRulesInput,
  spaceTitle,
  type WorkspaceModel,
} from "@chipschat/core";
import { Icon } from "@chipschat/ui";
import { useState } from "react";
import { AgentSections } from "../Agents.tsx";
import { HarnessContext } from "../context/HarnessContext.tsx";
import { GroupRow } from "../GroupRow.tsx";
import {
  ChipsRules,
  HarnessPermissions,
  HarnessSettings,
} from "../permissions/HarnessPermissions.tsx";
import { NewRule } from "../permissions/NewRule.tsx";
import type { PermissionsService } from "../permissions/service.ts";
import { useOwnRules } from "../permissions/service.ts";
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
  /** What the reader wants of the banner (ADR 0286), for what the rows say beside the agent. */
  readonly banners?: Banners | undefined;
  /** Its permissions and snooze (ADR 0299). Absent, the page is read only. */
  readonly permissions?: PermissionsService | undefined;
  /** Opens another of its pages over this one: New rule from Permissions. */
  readonly onOpenPart?: ((part: HarnessPart) => void) | undefined;
  /** Back to the page under this one: New rule, once saved. */
  readonly onBack?: (() => void) | undefined;
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
    case "settings":
    case "chips":
      return <PermissionsPart {...props} />;
    case "rule":
      return props.permissions === undefined ? null : (
        <RulePart {...props} service={props.permissions} />
      );
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
        permissionOf={(agentId) =>
          permissionsRow(
            { model: props.model, directory: props.directory, banners: props.banners },
            agentId,
          )
        }
      />
    </div>
  );
}

/**
 * A harness's Permissions (ADR 0300): the short main page, whose two rows open its own settings and
 * Chips's rules beside it. The trust dial is gone from it: no harness declares one.
 */
function WhenItAsks(props: PartProps) {
  return (
    <div className="hp-part" data-testid="when-it-asks">
      <HarnessPermissions
        model={props.model}
        directory={props.directory}
        harnessId={props.harnessId}
        selfId={props.selfId}
        service={props.permissions ?? readOnly(props)}
        onOpenSpace={props.onOpenSpace}
        onOpenPart={(part) => props.onOpenPart?.(part)}
      />
    </div>
  );
}

/** Its own settings, or Chips's rules for it (ADR 0300), each a page of its own. */
function PermissionsPart(props: PartProps) {
  const service = props.permissions ?? readOnly(props);
  return (
    <div className="hp-part" data-testid={`${props.part}-part`}>
      {props.part === "settings" ? (
        <HarnessSettings
          directory={props.directory}
          harnessId={props.harnessId}
          service={service}
        />
      ) : (
        <ChipsRules
          model={props.model}
          directory={props.directory}
          harnessId={props.harnessId}
          selfId={props.selfId}
          service={service}
          onNewRule={() => props.onOpenPart?.("rule")}
        />
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

/**
 * The page's own rules, as `setRules` sends them, where no permissions service was handed in: a
 * server older than ADR 0299 snoozes nothing and keeps no copy of what a harness runs on its own.
 */
function readOnly(props: PartProps): PermissionsService | undefined {
  const setRules = props.onSetRules;
  if (setRules === undefined) return undefined;
  return {
    setRules,
    snoozeHarness: () => undefined,
    resumeHarness: () => undefined,
    setChipsRules: () => undefined,
    setWorkspaceRules: () => undefined,
    readOwnRules: () => Promise.resolve({ own_rules: null, heard_at: null }),
    keepsHarnessRules: false,
    keepsOwnRules: false,
    keepsChipsRules: false,
  };
}

/** New rule (ADR 0299), beside the harness's Permissions, back to it once saved. */
function RulePart(props: PartProps & { readonly service: PermissionsService }) {
  const own = useOwnRules(props.service, props.directory, props.harnessId);
  return (
    <div className="hp-part" data-testid="rule-part">
      <NewRule
        model={props.model}
        directory={props.directory}
        harnessId={props.harnessId}
        own={own}
        service={props.service}
        onDone={() => props.onBack?.()}
      />
    </div>
  );
}
