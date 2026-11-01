/**
 * The Agents tab (ADR 0087, Phase 5; the Harnesses tab until 30 September 2026): the harnesses on
 * a shelf (`HarnessShelf`, ADR 0185), then the workspace's agents in their sections (`Agents.tsx`),
 * and an agent's card and history in the middle column when one is opened. A tile opens its
 * harness's card alone, and View all every harness's card, each as it was on that tab, over the
 * page; until 17 October 2026 the cards stood under the agents, three screens down.
 *
 * The harnesses: every harness in the workspace with its level, its budget, its connection
 * checklist — the rows light as event types arrive (technical-plan M1.6); the rows themselves are
 * the protocol's, shared with `chips conformance` — and its tokens; plus Connect a harness (ADR
 * 0122): a gallery whose ways make a link to run where the harness runs, and under Anything with HTTP →
 * Advanced, Add harness, Custom: a name, a token shown once, and the curl lines.
 * Add harness is a dialog that grows out of its button (ADR 0084): the name, then the token, the
 * lines and the checklist lighting as the first events arrive, all in it, and Escape, the × or a
 * click outside folds it away at either step. It was a panel in the page with only a Cancel at
 * its foot, and after the token only a Done under the curl lines.
 *
 * Tokens are the owner's (ADR 0023). The card shows what a harness holds without ever showing a
 * token, because Chips keeps only digests; it issues another, once, on screen; and it withdraws
 * one, which takes effect at the harness's next request and closes the socket it is holding. A
 * rotation is those two in that order, which is what the card's wording says.
 *
 * The same people may remove a harness from the workspace (ADR 0078), asked first in the phone's
 * words (`removeAsking`). A removed harness is not listed: the directory still names it, for what
 * it said, and the card goes when the directory is read again.
 *
 * And restart one that takes restarts (ADR 0094), asked first in the phone's words
 * (`restartAsking`): in gold while it can't answer, quietly while it can, "Restarting…" while a
 * restart stands, and in words, with no button, while nothing of it is connected.
 *
 * Under it, for the same people, a harness that sends its models shows its Main agent's Model row
 * (ADR 0154), the one on that agent's card: every agent of the harness with no model of its own
 * follows it, so changing it changes the harness's.
 *
 * And, for the same people, a harness that sends the jobs it runs on its own shows them under what
 * its agents share (ADR 0252), each opening a page of its own over the card (`jobs/JobPage.tsx`).
 */

import {
  type AddedHarness,
  type AgentsLook,
  administers,
  agentStateWords,
  agentsTab,
  backFromRestart,
  backWords,
  type ConnectionState,
  type ContextReads,
  connectedNames,
  connectedWords,
  type Directory,
  type HarnessConnection,
  type HarnessToken,
  type HeartbeatReads,
  harnessModelAgent,
  harnessNamed,
  harnessShelf,
  heldNamesFor,
  type IssuedHarnessToken,
  type JoinRequest,
  type ModelReads,
  mayAskFromPage,
  mayRemoveHarness,
  myRole,
  nameOf,
  OFFERED,
  type Participant,
  pageAgentHint,
  pageAgentName,
  removeAsking,
  restartAsking,
  restartOffer,
  type SetRulesInput,
  type Space,
  takesAutonomy,
  type WindowReads,
  type WorkspaceModel,
  workspaceHarnesses,
} from "@chipschat/core";
import {
  type AgentState,
  CONNECTION_CHECKLIST,
  type Connector,
  type SpaceIcon,
} from "@chipschat/protocol";
import { Avatar, Button, Icon } from "@chipschat/ui";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  AgentPage,
  AgentSections,
  type AgentsService,
  AgentsWaiting,
  agentRun,
} from "./Agents.tsx";
import { Asking } from "./Asking.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { ContextFile } from "./context/ContextFile.tsx";
import { HarnessContext } from "./context/HarnessContext.tsx";
import type { ContextPage } from "./context/pages.ts";
import { NotInDemo, useNotInDemo } from "./demo/NotInDemo.tsx";
import type { FileService } from "./files.ts";
import { GrowingDialog } from "./GrowingDialog.tsx";
import { HarnessShelf } from "./HarnessShelf.tsx";
import {
  CapabilityRow,
  type Choice,
  ConnectPage,
  Gallery,
  HereAlready,
  type JoinService,
} from "./Join.tsx";
import { JobPage } from "./jobs/JobPage.tsx";
import { JobsGroup, type JobsReads } from "./jobs/JobsGroup.tsx";
import { ModelGroup } from "./model/ModelGroup.tsx";
import { useAgentPicking } from "./select/agents.tsx";
import { PickBar, PickHint, SelectButton } from "./select/PickParts.tsx";
import { relativeTime } from "./time.ts";

export interface HarnessesProps {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  /**
   * Where the curl lines point: the server this device is paired with. In a browser that is the
   * page's own origin, which serves or proxies `/v1`; in the desktop app, the address it paired at.
   */
  readonly serverUrl: string;
  readonly onOpen: (spaceId: string) => void;
  readonly onAdd: (name: string, options: AddOptions) => Promise<AddedHarness>;
  /** A harness's credentials, for the owner (ADR 0023). Absent on a surface that cannot manage them. */
  readonly tokens?: TokenService | undefined;
  /** Who is reading, so the card knows whether they may hand a harness on (M5.2). */
  readonly selfId?: string | undefined;
  /** Hand a harness to another person: the owner's, or a workspace owner's or admin's. */
  readonly onTransfer?: ((harnessId: string, ownerId: string) => Promise<void>) | undefined;
  /** Remove a harness from the workspace (ADR 0078): the same people's. Rejects with the server's reason. */
  readonly onRemove?: ((harnessId: string) => Promise<void>) | undefined;
  /** Ask a harness to restart (ADR 0094): the same people's. Rejects with the server's reason. */
  readonly onRestart?: ((harnessId: string) => Promise<void>) | undefined;
  /**
   * Send a scope's rules changed (ADR 0195): a rule allowed always switched off or on, removed, or
   * put back. Absent, When it asks you reads its list and changes nothing.
   */
  readonly onSetRules?: ((input: SetRulesInput) => void) | undefined;
  /**
   * A new agent of a harness in a space of its own (ADR 0190, point 4): the store's
   * `askIntoNewRoom`, answering with the space. Rejects with the server's reason.
   */
  readonly onNewAgent?: ((harnessId: string, name: string) => Promise<string>) | undefined;
  /**
   * Say again what a harness takes, the whole list (ADR 0046): the people who may hand it on. Rejects
   * with the server's reason. Absent, its card lists nothing it may do.
   */
  readonly onDeclare?:
    | ((harnessId: string, capabilities: readonly string[]) => Promise<void>)
    | undefined;
  /** The agents' page, through the store (ADR 0087). Absent, the page lists harnesses only. */
  readonly agents?: AgentsService | undefined;
  /** An agent to open on, rather than the list: one a search result opened (ADR 0132). */
  readonly initialAgent?: string | undefined;
  /** Open with Connect a harness's dialog up: You's card opened the page for it (ADR 0185). */
  readonly initialAdding?: boolean | undefined;
  /** How a file a history's line carries is fetched. */
  readonly files?: FileService | undefined;
  /** The faces the person chose for rooms, which a history's dividers wear. */
  readonly faces?: ReadonlyMap<string, SpaceIcon> | undefined;
  /**
   * Join links and requests (ADR 0122): Connect a harness's gallery makes a link, and its card
   * follows it. Absent, or for anybody who is not an owner or admin, it is today's form.
   */
  readonly join?: JoinService | undefined;
  readonly joins?: ReadonlyMap<string, JoinRequest> | undefined;
  /** The docs' cards for the gallery (ADR 0171): none, and it is the two the app carries. */
  readonly cards?: readonly Connector[] | undefined;
  /**
   * Agents' and harnesses' context files, through the store (ADR 0134, 0135). Absent, no card
   * has a Context group.
   */
  readonly context?: ContextReads | undefined;
  /** Agents' heartbeats, through the store (ADR 0143). Absent, no card has a Heartbeat group. */
  readonly heartbeats?: HeartbeatReads | undefined;
  /** Agents' context windows, through the store (ADR 0146). Absent, no card has that group. */
  readonly windows?: WindowReads | undefined;
  /** Harnesses' own jobs and their runs, through the store (ADR 0252). Absent, no card has them. */
  readonly jobs?: JobsReads | undefined;
  /** Agents' models and effort, through the store (ADR 0140). Absent, no card has a Model group. */
  readonly models?: ModelReads | undefined;
  /**
   * Whether the directory is the server's word yet (core's `agentsLook`): until it is, the page
   * stands blank agents, or says why it can't be had, rather than "No agents yet". Absent, listed.
   */
  readonly look?: AgentsLook | undefined;
  /** Where the server is, said while it can't be reached. */
  readonly server?: string | undefined;
  /** The socket's state, for what the page says while it waits for its first list. */
  readonly connection?: ConnectionState | undefined;
  /** Check the connection now: the store's `wake`. */
  readonly onWake?: (() => void) | undefined;
}

/** What the add form asks beyond a name. */
export interface AddOptions {
  /** Declares `autonomy` (ADR 0046): the profile draws the dial. Off for a harness whose permission model is its own. */
  readonly takesDial: boolean;
}

export interface TokenService {
  readonly list: (harnessId: string) => Promise<HarnessToken[]>;
  readonly issue: (harnessId: string, name: string) => Promise<IssuedHarnessToken>;
  readonly revoke: (harnessId: string, tokenId: string) => Promise<void>;
}

const LEVEL_WORDS = ["observe", "ask first", "ask when it matters", "autonomous"] as const;

export function Harnesses(props: HarnessesProps) {
  const { model, directory } = props;
  const [adding, setAdding] = useState(props.initialAdding === true);
  const [agent, setAgent] = useState<string | undefined>(props.initialAgent);
  // The context pages opened over the agent's page or the list, each going back to the one under it.
  const [over, setOver] = useState<readonly ContextPage[]>([]);
  // In the demo, connecting a harness needs a server: the page says so in its place.
  const setUp = useNotInDemo();
  const addButton = useRef<HTMLButtonElement>(null);
  const harnesses = workspaceHarnesses(directory);
  const agents = props.agents;
  // Whose words wait is read with the directory, so it is read again when the page opens.
  useEffect(() => {
    void agents?.refresh();
  }, [agents]);
  const push = (page: ContextPage) => setOver((was) => [...was, page]);
  const pop = () => setOver((was) => was.slice(0, -1));

  // Its Main agent's Model row (ADR 0154): nobody's, and no group, when it has none.
  const modelGroup = (harnessId: string) => {
    const main = harnessModelAgent(directory, harnessId);
    if (main === undefined || props.selfId === undefined) return undefined;
    return (
      <ModelGroup
        reads={props.models}
        model={model}
        directory={directory}
        agentId={main}
        agentName={nameOf(directory, main)}
        selfId={props.selfId}
      />
    );
  };

  // New agent on a card, for whoever may ask that harness for one (ADR 0190, point 4).
  const asksFor = (harnessId: string) =>
    props.onNewAgent !== undefined &&
    props.selfId !== undefined &&
    mayAskFromPage(model, directory, props.selfId, harnessId)
      ? props.onNewAgent
      : undefined;
  const card = (harness: Participant, flash?: string) => (
    <HarnessCard
      key={harness.id}
      harnessId={harness.id}
      name={harness.displayName}
      ownerId={harness.ownerId}
      ownerName={harness.ownerId === undefined ? undefined : nameOf(directory, harness.ownerId)}
      model={model}
      directory={directory}
      space={directSpaceWith(model, harness.id)}
      onOpen={props.onOpen}
      tokens={props.tokens}
      transfer={
        props.onTransfer !== undefined && mayHandOn(model, props.selfId, harness.ownerId)
          ? props.onTransfer
          : undefined
      }
      remove={
        props.onRemove !== undefined &&
        props.selfId !== undefined &&
        mayRemoveHarness(model, directory, harness.id, props.selfId)
          ? props.onRemove
          : undefined
      }
      selfId={props.selfId}
      restart={props.onRestart}
      setRules={props.onSetRules}
      newAgent={asksFor(harness.id)}
      declare={
        props.onDeclare !== undefined && mayHandOn(model, props.selfId, harness.ownerId)
          ? props.onDeclare
          : undefined
      }
      modelGroup={modelGroup(harness.id)}
      context={
        <HarnessContext
          reads={props.context}
          model={model}
          directory={directory}
          harnessId={harness.id}
          selfId={props.selfId}
          flashFile={flash}
          onOpenFile={(name) =>
            push({ kind: "file", owner: { kind: "harness", id: harness.id }, name, own: false })
          }
        />
      }
      jobs={
        <JobsGroup
          reads={props.jobs}
          model={model}
          directory={directory}
          harnessId={harness.id}
          selfId={props.selfId}
          onOpenJob={(jobId) => push({ kind: "job", harnessId: harness.id, jobId })}
        />
      }
    />
  );

  const page = overPage(over, {
    agent,
    model,
    directory,
    selfId: props.selfId,
    context: props.context,
    jobs: props.jobs,
    harnesses,
    shelved: shelfOrder(model, directory, props.selfId),
    card,
    onBack: pop,
  });
  if (page !== undefined) return page;

  if (agent !== undefined && agents !== undefined && props.files !== undefined) {
    return (
      <AgentPage
        agentId={agent}
        model={model}
        directory={directory}
        selfId={props.selfId ?? ""}
        files={props.files}
        faces={props.faces}
        agents={agents}
        onBack={() => setAgent(undefined)}
        onOpenRoom={props.onOpen}
        onOpenAgent={setAgent}
        context={props.context}
        heartbeats={props.heartbeats}
        windows={props.windows}
        models={props.models}
        onOpenContext={push}
      />
    );
  }

  if (props.look !== undefined && props.look !== "listed") {
    return (
      <AgentsWaiting
        look={props.look}
        connection={props.connection ?? "connecting"}
        server={props.server}
        agents={agents}
        onWake={props.onWake}
      />
    );
  }

  return (
    <AgentsHome
      model={model}
      directory={directory}
      selfId={props.selfId ?? ""}
      agents={agents}
      add={
        setUp === undefined ? (
          <Button ref={addButton} onClick={() => setAdding(true)} aria-haspopup="dialog">
            Connect a harness
          </Button>
        ) : (
          <NotInDemo onSetUp={setUp} />
        )
      }
      adding={
        adding && (
          <AddHarness
            from={addButton.current}
            model={model}
            directory={directory}
            selfId={props.selfId ?? ""}
            serverUrl={props.serverUrl}
            join={props.join}
            joins={props.joins}
            cards={props.cards}
            onAdd={props.onAdd}
            onOpen={props.onOpen}
            onOpenHarness={(harnessId) => {
              setAdding(false);
              push({ kind: "harness_page", harnessId });
            }}
            onClosed={() => {
              setAdding(false);
              addButton.current?.focus();
            }}
          />
        )
      }
      cards={harnesses.map((harness) => card(harness))}
      onOpenHarness={(harnessId) => push({ kind: "harness_page", harnessId })}
      onAllHarnesses={() => push({ kind: "harnesses" })}
      onOpenAgent={setAgent}
    />
  );
}

/**
 * The Agents page's list (ADR 0087, Phase 5): its header, the harnesses' shelf over the agents'
 * sections, and, while it picks agents to archive, unarchive or delete together (ADR 0182), the
 * bar of acts. The archived agents' folds are kept here, where what is shown is known, since
 * Select all picks what is shown. Without the agents, the harnesses' cards, as the Harnesses tab
 * was.
 */
function AgentsHome({
  model,
  directory,
  selfId,
  agents,
  add,
  adding,
  cards,
  onOpenHarness,
  onAllHarnesses,
  onOpenAgent,
}: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly agents: AgentsService | undefined;
  /** Connect a harness, and its dialog while it is open. */
  readonly add: ReactNode;
  readonly adding: ReactNode;
  /** The harnesses' cards, for a page without the agents. */
  readonly cards: ReactNode;
  readonly onOpenHarness: (harnessId: string) => void;
  readonly onAllHarnesses: () => void;
  readonly onOpenAgent: (agentId: string) => void;
}) {
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [elsewhereOpen, setElsewhereOpen] = useState(false);
  const tab = agentsTab(model, directory, selfId);
  const picks = useAgentPicking({
    model,
    directory,
    selfId,
    items: [...tab.leads, ...tab.agents, ...tab.archived.here, ...tab.archived.elsewhere],
    visible: [
      ...tab.leads,
      ...tab.agents,
      ...(archivedOpen ? tab.archived.here : []),
      ...(archivedOpen && elsewhereOpen ? tab.archived.elsewhere : []),
    ],
    runOf: agentRun(tab),
    acts: agents,
  });
  const picking = picks.picking;
  return (
    <main
      className="conv harnesses"
      aria-label="Agents"
      data-picking={picking ? "true" : undefined}
    >
      <header className="conv-h">
        <div className="conv-h-t">
          <h1 data-testid="agents-title">{pickTitle(picking, picks.chosen.length)}</h1>
          <span className="pick-head-sub">
            <span className="conv-h-sub" aria-hidden={picking}>
              {countWords(model, directory, selfId)}
            </span>
            <PickHint
              shown={picking}
              words={picks.hint}
              all={picks.all}
              onAll={picks.onAll}
              testId="pick-hint"
            />
          </span>
        </div>
        <div className="conv-h-r">
          {(picks.any || picking) && (
            <SelectButton
              picking={picking}
              onClick={picking ? picks.stop : picks.start}
              testId="select-agents"
            />
          )}
          <span className="pick-aside" inert={picking}>
            {add}
          </span>
        </div>
      </header>
      {adding}

      <div className="harnesses-body">
        {agents === undefined ? (
          // Without the agents, the page is the harnesses' cards, as the Harnesses tab was.
          cards
        ) : (
          <>
            {/* The harnesses step back while the page picks: what can be picked is what reads. */}
            <div className="pick-back" inert={picking}>
              <HarnessShelf
                model={model}
                directory={directory}
                selfId={selfId}
                onOpen={onOpenHarness}
                onAll={onAllHarnesses}
              />
            </div>
            <AgentSections
              model={model}
              directory={directory}
              selfId={selfId}
              onOpen={onOpenAgent}
              folds={{
                archived: archivedOpen,
                elsewhere: elsewhereOpen,
                onArchived: setArchivedOpen,
                onElsewhere: setElsewhereOpen,
              }}
              pickOf={picks.rowOf}
              held={[...picks.leaving.values()]}
            />
          </>
        )}
      </div>
      <PickBar
        shown={picking}
        left={picks.left}
        erase={picks.erase}
        note={picks.note}
        onNoteGone={picks.clearNote}
        place="page"
      />
      {picks.dialog}
    </main>
  );
}

/** The page's name, and while it picks, how many are picked (ADR 0182). */
function pickTitle(picking: boolean, count: number): string {
  if (!picking) return "Agents";
  return count === 0 ? "Select agents" : `${count} selected`;
}

/**
 * The page on top: a file of an agent's or a harness's (ADR 0135); a harness's page — its card
 * alone, the shared file an agent's page opened it for flashing; every harness's card, in the
 * shelf's order (ADR 0185); or one of a harness's own jobs (ADR 0252). Nothing, when there is
 * none, or its harness is gone.
 */
function overPage(
  over: readonly ContextPage[],
  on: {
    readonly agent: string | undefined;
    readonly model: WorkspaceModel;
    readonly directory: Directory;
    readonly selfId: string | undefined;
    readonly context: ContextReads | undefined;
    readonly jobs: JobsReads | undefined;
    readonly harnesses: readonly Participant[];
    /** The harnesses in the shelf's order, for every harness's card. */
    readonly shelved: readonly Participant[];
    readonly card: (harness: Participant, flash?: string) => ReactNode;
    readonly onBack: () => void;
  },
): ReactNode | undefined {
  const top = over.at(-1);
  const backLabel = backLabelOf(over.at(-2), on.agent, on.directory);
  if (top?.kind === "file") {
    if (on.context === undefined) return undefined;
    return (
      <ContextFile
        reads={on.context}
        directory={on.directory}
        owner={top.owner}
        name={top.name}
        own={top.own}
        backLabel={backLabel}
        onBack={on.onBack}
      />
    );
  }
  if (top?.kind === "job") {
    if (on.jobs === undefined) return undefined;
    return (
      <JobPage
        key={`${top.harnessId} ${top.jobId}`}
        reads={on.jobs}
        model={on.model}
        directory={on.directory}
        harnessId={top.harnessId}
        jobId={top.jobId}
        selfId={on.selfId}
        backLabel={backLabel}
        onBack={on.onBack}
      />
    );
  }
  if (top?.kind === "harnesses") {
    return (
      <main className="conv harnesses" aria-label="Harnesses">
        <header className="conv-h">
          <div className="conv-h-t">
            <button type="button" className="agent-back" onClick={on.onBack}>
              {`‹ ${backLabel}`}
            </button>
            <h1>Harnesses</h1>
          </div>
        </header>
        <div className="harnesses-body">{on.shelved.map((each) => on.card(each))}</div>
      </main>
    );
  }
  const harness = on.harnesses.find((each) => each.id === top?.harnessId);
  if (top === undefined || harness === undefined) return undefined;
  return (
    <main className="conv harnesses" aria-label={harness.displayName}>
      <header className="conv-h">
        <div className="conv-h-t">
          <button type="button" className="agent-back" onClick={on.onBack}>
            {`‹ ${backLabel}`}
          </button>
          <h1>{harness.displayName}</h1>
        </div>
      </header>
      <div className="harnesses-body">{on.card(harness, top.flash)}</div>
    </main>
  );
}

/** What a context page's back button says: the page under it, the agent's, or the list's. */
function backLabelOf(
  under: ContextPage | undefined,
  agent: string | undefined,
  directory: Directory,
): string {
  if (under?.kind === "harness_page") return nameOf(directory, under.harnessId);
  if (under?.kind === "harnesses") return "Harnesses";
  if (under?.kind === "file") return nameOf(directory, under.owner.id);
  return agent === undefined ? "Agents" : nameOf(directory, agent);
}

/** The workspace's harnesses in the order the shelf stands them (`harnessShelf`). */
function shelfOrder(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string | undefined,
): readonly Participant[] {
  return harnessShelf(agentsTab(model, directory, selfId ?? ""), directory)
    .map((tile) => directory[tile.id])
    .filter((each) => each !== undefined);
}

/** Under the page's name: how many agents, archived ones, and harnesses. */
function countWords(model: WorkspaceModel, directory: Directory, selfId: string | undefined) {
  const tab = agentsTab(model, directory, selfId ?? "");
  const agents = tab.leads.length + tab.agents.length;
  const archived = tab.archived.here.length + tab.archived.elsewhere.length;
  const harnesses = tab.harnesses.length;
  if (harnesses === 0) return "No harnesses yet.";
  return [
    `${agents} ${agents === 1 ? "agent" : "agents"}`,
    ...(archived === 0 ? [] : [`${archived} archived`]),
    `${harnesses} ${harnesses === 1 ? "harness in this workspace" : "harnesses in this workspace"}`,
  ].join(" · ");
}

/**
 * A harness across all of its spaces (ADR 0024): how many terminals are open on it, how many
 * places it works in, and how much of what is waiting on you is its. A harness with no spaces at all has not
 * been connected to anything yet, and saying that is more use than three zeroes.
 */
function rollup(model: WorkspaceModel, harnessId: string): string {
  const entry = model.fleet.find((each) => each.harnessId === harnessId);
  if (entry === undefined || entry.spaceCount === 0) return "No spaces yet";
  const parts = [
    entry.liveSessions === 0
      ? "No live sessions"
      : `${entry.liveSessions} live ${entry.liveSessions === 1 ? "session" : "sessions"}`,
    `${entry.spaceCount} ${entry.spaceCount === 1 ? "space" : "spaces"}`,
    ...(entry.needsYou === 0 ? [] : [`${entry.needsYou} waiting on you`]),
  ];
  return parts.join(" · ");
}

function directSpaceWith(model: WorkspaceModel, harnessId: string): Space | undefined {
  return model.spaces.find((space) => space.kind === "direct" && space.members.includes(harnessId));
}

/**
 * Whether the reader may hand this harness on: its owner, or somebody who runs the workspace
 * (M5.2, the same rule as its tokens).
 */
export function mayHandOn(
  model: WorkspaceModel,
  selfId: string | undefined,
  ownerId: string | undefined,
): boolean {
  if (selfId === undefined) return false;
  return ownerId === selfId || administers(myRole(model, selfId));
}

function HarnessCard(props: {
  readonly harnessId: string;
  readonly name: string;
  readonly ownerId: string | undefined;
  readonly ownerName: string | undefined;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly space: Space | undefined;
  readonly onOpen: (spaceId: string) => void;
  readonly tokens: TokenService | undefined;
  readonly transfer: ((harnessId: string, ownerId: string) => Promise<void>) | undefined;
  readonly remove: ((harnessId: string) => Promise<void>) | undefined;
  readonly selfId: string | undefined;
  readonly restart: ((harnessId: string) => Promise<void>) | undefined;
  /** When it asks you's switches and removals (ADR 0195); absent, its list is read only. */
  readonly setRules?: ((input: SetRulesInput) => void) | undefined;
  /** For whoever may ask it (ADR 0190, point 4): New agent, in a space of its own. */
  readonly newAgent?: ((harnessId: string, name: string) => Promise<string>) | undefined;
  /** For whoever may hand it on: what it may do, said again (ADR 0046). */
  readonly declare?:
    | ((harnessId: string, capabilities: readonly string[]) => Promise<void>)
    | undefined;
  /** For its owner: its Main agent's model, which the agents with none of their own follow (ADR 0154). */
  readonly modelGroup?: ReactNode;
  /** For its owner: what its agents share, and what a new one starts with (ADR 0135). */
  readonly context?: ReactNode;
  /** For the people who run it: the jobs it runs on its own (ADR 0252). */
  readonly jobs?: ReactNode;
}) {
  const policy = props.model.harnesses[props.harnessId];
  const connection = props.model.connections[props.harnessId];
  const level = policy?.autonomy;
  // The level is said only for a harness that takes the dial (ADR 0046); the budget is money
  // and is said either way.
  const facts = [
    ...(takesAutonomy(props.directory, props.harnessId)
      ? [level === undefined ? "No policy yet" : `L${level} · ${LEVEL_WORDS[level]}`]
      : []),
    ...(policy?.budgetUsd !== undefined
      ? [`$${policy.spentUsd.toFixed(2)} of $${policy.budgetUsd}`]
      : []),
    ...(props.ownerName !== undefined && props.transfer === undefined
      ? [`owned by ${props.ownerName}`]
      : []),
  ];
  // Why it can't answer now, when it can't (ADR 0083): its own words, or offline since when.
  const trouble = agentStateWords(
    props.directory,
    props.harnessId,
    Date.now(),
    undefined,
    props.selfId,
  );
  return (
    <section className="harness-card" data-testid="harness-card" aria-label={props.name}>
      <div className="harness-card-h">
        <Avatar name={props.name} kind="harness" cantAnswer={trouble !== undefined} />
        <div>
          <h2>{props.name}</h2>
          <StateLine
            trouble={trouble}
            state={props.directory[props.harnessId]?.state}
            connected={connectedWords(props.directory, props.harnessId, Date.now())}
          />
          <span className="harness-card-sub">{facts.join(" · ")}</span>
          {props.transfer !== undefined && (
            <OwnerPicker
              harnessId={props.harnessId}
              name={props.name}
              ownerId={props.ownerId}
              model={props.model}
              directory={props.directory}
              onTransfer={props.transfer}
            />
          )}
          <span className="harness-card-sub" data-testid="harness-rollup">
            {rollup(props.model, props.harnessId)}
          </span>
        </div>
        <div className="harness-card-acts">
          {props.newAgent !== undefined && (
            <NewAgent
              harnessId={props.harnessId}
              name={props.name}
              model={props.model}
              directory={props.directory}
              selfId={props.selfId}
              onAsk={props.newAgent}
              onOpen={props.onOpen}
            />
          )}
          {props.space !== undefined && (
            <Button variant="ghost" onClick={() => props.onOpen(props.space?.id ?? "")}>
              Open space
            </Button>
          )}
        </div>
      </div>
      {props.restart !== undefined && props.selfId !== undefined && (
        <RestartHarness
          harnessId={props.harnessId}
          name={props.name}
          model={props.model}
          directory={props.directory}
          selfId={props.selfId}
          onRestart={props.restart}
        />
      )}
      {props.modelGroup}
      {props.context}
      {props.jobs}
      <Checklist connection={connection} />
      <Asking
        model={props.model}
        directory={props.directory}
        harnessId={props.harnessId}
        selfId={props.selfId}
        onSetRules={props.setRules}
        onOpenSpace={props.onOpen}
      />
      <MayDo
        harnessId={props.harnessId}
        capabilities={props.directory[props.harnessId]?.capabilities}
        onDeclare={props.declare}
      />
      {props.tokens !== undefined && <Tokens harnessId={props.harnessId} service={props.tokens} />}
      {props.remove !== undefined && (
        <RemoveHarness harnessId={props.harnessId} name={props.name} onRemove={props.remove} />
      )}
    </section>
  );
}

/**
 * New agent (ADR 0190, point 4): a button, and the dialog it grows: the agent's name, a first name
 * offered (ADR 0150), and a space of its own made with the ask in it. The space opens once the
 * server has the ask, where its line says the harness is making it.
 */
function NewAgent(props: {
  readonly harnessId: string;
  readonly name: string;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string | undefined;
  readonly onAsk: (harnessId: string, name: string) => Promise<string>;
  readonly onOpen: (spaceId: string) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        ref={button}
        variant="primary"
        data-testid="harness-new-agent"
        onClick={() => setOpen(true)}
      >
        New agent
      </Button>
      {open && (
        <NewAgentDialog
          {...props}
          from={button.current}
          onClosed={() => {
            setOpen(false);
            button.current?.focus();
          }}
        />
      )}
    </>
  );
}

function NewAgentDialog(props: {
  readonly harnessId: string;
  readonly name: string;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string | undefined;
  readonly from: HTMLElement | null;
  readonly onAsk: (harnessId: string, name: string) => Promise<string>;
  readonly onOpen: (spaceId: string) => void;
  readonly onClosed: () => void;
}) {
  const titleId = useId();
  const { directory } = props;
  // A first name, held while the dialog is up so it does not change under the person reading it.
  const [offered] = useState(() => {
    const self = props.selfId === undefined ? undefined : directory[props.selfId]?.displayName;
    return (
      heldNamesFor(
        [props.harnessId],
        directory,
        props.model.spaces,
        self === undefined ? [] : [self],
      )[props.harnessId] ?? ""
    );
  });
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [leaving, setLeaving] = useState(false);
  const made = useRef<string | undefined>(undefined);
  const agent = pageAgentName(directory, props.harnessId, typed, offered);
  const leave = () => {
    if (!busy) setLeaving(true);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || agent === "") return;
    setBusy(true);
    setError(undefined);
    try {
      made.current = await props.onAsk(props.harnessId, agent);
      setBusy(false);
      setLeaving(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(false);
    }
  };
  return (
    <GrowingDialog
      from={props.from}
      labelledBy={titleId}
      className="harness-dialog"
      testId="new-agent-dialog"
      focus="input[type=text]"
      leaving={leaving}
      onLeave={leave}
      onGone={() => {
        const spaceId = made.current;
        props.onClosed();
        if (spaceId !== undefined) props.onOpen(spaceId);
      }}
    >
      <div className="harness-dialog-card">
        <form className="harness-add" onSubmit={(event) => void submit(event)}>
          <div className="new-space-head">
            <Avatar name={props.name} kind="harness" size="sm" />
            <h2 id={titleId}>New {props.name} agent</h2>
            <Close onClose={leave} />
          </div>
          <p className="harness-add-how">
            {props.name} makes it for a space of its own, where it starts with nothing from
            elsewhere.
          </p>
          <label className="harness-add-name">
            Name
            <input
              type="text"
              value={typed}
              maxLength={120}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={offered}
              data-testid="new-agent-name"
            />
          </label>
          <p className="harness-add-how" data-testid="new-agent-hint">
            {pageAgentHint(directory, props.harnessId, typed, offered)}
          </p>
          {error !== undefined && (
            <p className="harness-add-error" role="alert">
              {error}
            </p>
          )}
          <div className="harness-add-actions">
            <Button variant="ghost" onClick={leave} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || agent === ""}
              data-testid="new-agent-create"
            >
              {busy ? `Asking ${props.name}…` : `Create ${agent}`}
            </Button>
          </div>
        </form>
      </div>
    </GrowingDialog>
  );
}

/**
 * Why it can't answer, when it can't (ADR 0083); or, after a restart this card watched, when it was
 * back (ADR 0094). Nothing is kept of that: another window, or the card drawn later, says nothing.
 * Otherwise that it is connected, and since when (ADR 0254), as the phone's page says.
 */
function StateLine(props: {
  readonly trouble: string | undefined;
  readonly state: AgentState | undefined;
  /** "Connected · since 8:02 AM", while it can answer. */
  readonly connected: string | undefined;
}) {
  const before = useRef(props.state);
  const [back, setBack] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (backFromRestart(before.current, props.state)) setBack(Date.now());
    else if (props.state?.restarting !== undefined) setBack(undefined);
    before.current = props.state;
  }, [props.state]);
  if (props.trouble !== undefined) {
    return (
      <span className="harness-card-sub harness-trouble" data-testid="harness-trouble">
        {props.trouble}
      </span>
    );
  }
  if (back === undefined) {
    if (props.connected === undefined) return null;
    return (
      <span className="harness-card-sub harness-connected" data-testid="harness-connected">
        {props.connected}
      </span>
    );
  }
  return (
    <span className="harness-card-sub harness-back" data-testid="harness-back">
      {backWords(back, Date.now())}
    </span>
  );
}

/**
 * Restart, asked first (ADR 0094). What it offers is core's, as on the phone: a button, gold while
 * the harness can't answer; "Restarting…" with nothing to press while a restart stands; or why
 * there is nobody to ask. The dialog waits for the server and says why in red when it will not.
 */
function RestartHarness(props: {
  readonly harnessId: string;
  readonly name: string;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly onRestart: (harnessId: string) => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const offer = restartOffer(props.model, props.directory, props.harnessId, props.selfId);
  if (offer === undefined) return null;
  if (offer.kind === "unreachable") {
    return (
      <p className="harness-restart-note" data-testid="restart-unreachable">
        <strong>{offer.title}.</strong> {offer.body}
      </p>
    );
  }
  return (
    <div className="harness-restart">
      <Button
        className="harness-restart-go"
        data-loud={offer.kind === "offer" && offer.loud ? "true" : undefined}
        disabled={offer.kind === "going"}
        onClick={() => setAsking(true)}
        data-testid="restart-harness"
      >
        {offer.label}
      </Button>
      {asking && (
        <ConfirmDialog
          asking={restartAsking(props.name)}
          danger={false}
          tooOld="Not restarted: this server is older than the app, and cannot restart a harness yet."
          onCancel={() => setAsking(false)}
          onConfirm={async () => {
            await props.onRestart(props.harnessId);
            setAsking(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Remove harness…, asked first (ADR 0078). The dialog waits for the server and says why in red
 * when it will not; once it has, the directory is read again and this card is gone with it.
 */
function RemoveHarness(props: {
  readonly harnessId: string;
  readonly name: string;
  readonly onRemove: (harnessId: string) => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="harness-card-foot">
      <Button
        size="sm"
        variant="danger"
        onClick={() => setAsking(true)}
        data-testid="remove-harness"
      >
        Remove harness…
      </Button>
      {asking && (
        <ConfirmDialog
          asking={removeAsking(props.name)}
          danger
          tooOld="Not removed: this server is older than the app, and cannot remove a harness yet."
          onCancel={() => setAsking(false)}
          onConfirm={async () => {
            await props.onRemove(props.harnessId);
            setAsking(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Who owns a harness, as a picker of the people who may — everyone in the workspace who is not
 * a guest (M5.2). Choosing somebody hands it on; the change lands when the directory is read
 * again, and the picker is busy until then.
 */
function OwnerPicker(props: {
  readonly harnessId: string;
  readonly name: string;
  readonly ownerId: string | undefined;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly onTransfer: (harnessId: string, ownerId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const people = Object.values(props.model.people).filter((person) => person.role !== "guest");
  const choose = async (ownerId: string) => {
    if (ownerId === props.ownerId) return;
    setBusy(true);
    setError(undefined);
    try {
      await props.onTransfer(props.harnessId, ownerId);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="harness-card-sub harness-owner" data-testid="owner-picker">
      owned by{" "}
      <select
        aria-label={`${props.name}'s owner`}
        value={props.ownerId ?? ""}
        disabled={busy}
        onChange={(event) => void choose(event.target.value)}
      >
        {people.map((person) => (
          <option key={person.participantId} value={person.participantId}>
            {nameOf(props.directory, person.participantId)}
          </option>
        ))}
      </select>
      {error !== undefined && (
        <span className="harness-add-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

/**
 * What a harness holds, and the two things an owner can do about it. The list is fetched when
 * the section is opened rather than with the tab: a workspace of twenty harnesses should not make
 * twenty requests to draw a page nobody has asked a question of yet.
 */
/**
 * What a harness may do, said again (ADR 0046): every capability Chips draws something for, a
 * switch each, as a link offers them. A flip sends the whole list, keeping whatever else the
 * harness declared that is no switch here (its tools); the card follows the directory read after.
 */
function MayDo(props: {
  readonly harnessId: string;
  readonly capabilities: readonly string[] | undefined;
  /** Absent for somebody who may not hand the harness on: then there is nothing to draw. */
  readonly onDeclare:
    | ((harnessId: string, capabilities: readonly string[]) => Promise<void>)
    | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const { onDeclare } = props;
  const capabilities = props.capabilities ?? [];

  if (onDeclare === undefined) return null;
  if (!open) {
    return (
      <div className="harness-tokens">
        <Button variant="ghost" onClick={() => setOpen(true)} data-testid="may-do-open">
          What it may do
        </Button>
      </div>
    );
  }

  const flip = async (name: string, on: boolean) => {
    const others = capabilities.filter((each) => each !== name);
    setBusy(true);
    setError(undefined);
    try {
      await onDeclare(props.harnessId, on ? [...others, name] : others);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="harness-tokens" data-testid="may-do">
      <div className="harness-tokens-h">
        <h3>What it may do</h3>
        <span className="harness-card-sub">
          Chips draws a control only for what a harness takes. One that is connected hears a change
          when it next connects.
        </span>
      </div>
      {error !== undefined && (
        <p className="harness-add-error" role="alert">
          {error}
        </p>
      )}
      <fieldset className="join-switches">
        {OFFERED.map((name) => (
          <CapabilityRow
            key={name}
            name={name}
            on={capabilities.includes(name)}
            disabled={busy}
            onChange={(on) => void flip(name, on)}
          />
        ))}
      </fieldset>
      <div className="harness-add-actions">
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Close
        </Button>
      </div>
    </div>
  );
}

function Tokens(props: { readonly harnessId: string; readonly service: TokenService }) {
  const { harnessId, service } = props;
  const [open, setOpen] = useState(false);
  const [tokens, setTokens] = useState<readonly HarnessToken[] | undefined>(undefined);
  const [issued, setIssued] = useState<IssuedHarnessToken | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      setTokens(await service.list(harnessId));
      setError(undefined);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }, [harnessId, service]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const act = async (what: () => Promise<void>) => {
    setBusy(true);
    try {
      await what();
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="harness-tokens">
        <Button variant="ghost" onClick={() => setOpen(true)} data-testid="tokens-open">
          Tokens
        </Button>
      </div>
    );
  }

  return (
    <div className="harness-tokens" data-testid="tokens">
      <div className="harness-tokens-h">
        <h3>Tokens</h3>
        <span className="harness-card-sub">
          Chips keeps only a digest, so a token cannot be shown again. To rotate: issue a new one,
          point the harness at it, then revoke the old.
        </span>
      </div>
      {error !== undefined && (
        <p className="harness-add-error" role="alert">
          {error}
        </p>
      )}
      {issued !== undefined && (
        <dl className="harness-new-facts" data-testid="issued-token">
          <dt>New token, shown once</dt>
          <dd>
            <code>{issued.token}</code>
          </dd>
        </dl>
      )}
      <ul className="token-list">
        {tokens?.map((token) => (
          <li key={token.id} data-testid="token-row" data-revoked={token.revokedAt !== undefined}>
            <b>{token.name}</b>
            <span className="token-life">
              {token.revokedAt === undefined
                ? `made ${relativeTime(token.createdAt)}${
                    token.lastUsedAt === undefined
                      ? ", never used"
                      : `, last used ${relativeTime(token.lastUsedAt)}`
                  }`
                : `revoked ${relativeTime(token.revokedAt)}`}
            </span>
            {token.revokedAt === undefined && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void act(() => service.revoke(harnessId, token.id))}
              >
                Revoke
              </Button>
            )}
          </li>
        ))}
        {tokens?.length === 0 && <li className="token-life">None. This harness cannot connect.</li>}
      </ul>
      <div className="harness-add-actions">
        <Button
          disabled={busy}
          data-testid="issue-token"
          onClick={() =>
            void act(async () => {
              setIssued(await service.issue(harnessId, "rotated"));
            })
          }
        >
          Issue a new token
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Close
        </Button>
      </div>
    </div>
  );
}

/** Which rows have lit: a harness that has sent the event type has earned that part of the UI. */
export function Checklist({ connection }: { readonly connection: HarnessConnection | undefined }) {
  const seen = new Set(connection?.seen ?? []);
  return (
    <ul className="checklist" aria-label="Connection checklist">
      {CONNECTION_CHECKLIST.map((row) => {
        const lit = row.types.some((type) => seen.has(type));
        return (
          <li
            key={row.label}
            data-lit={lit ? "true" : "false"}
            data-testid={`check-${row.types[0]}`}
          >
            <span className="checklist-mark" aria-hidden="true">
              {lit ? "●" : "○"}
            </span>
            <b>{row.label}</b>
            <span className="checklist-gives">
              {lit ? `sent ${row.types[0]}` : `send ${row.types[0]} for ${row.gives}`}
            </span>
          </li>
        );
      })}
      {connection?.lastSeenAt !== undefined && (
        <li className="checklist-seen">Last heard {relativeTime(connection.lastSeenAt)}</li>
      )}
    </ul>
  );
}

/** The three curl lines: see who you can talk to, say something, read what happened. */
export function curlLines(
  serverUrl: string,
  token: string,
  harnessId: string,
  spaceId: string,
): string {
  return [
    `export CHIPS_URL=${serverUrl} CHIPS_HARNESS_TOKEN=${token}`,
    `curl -s "$CHIPS_URL/v1/participants" -H "Authorization: Bearer $CHIPS_HARNESS_TOKEN"`,
    `curl -s -X POST "$CHIPS_URL/v1/harnesses/${harnessId}/events" -H "Authorization: Bearer $CHIPS_HARNESS_TOKEN" -H "Content-Type: application/json" -d '{"type":"message.post","space_id":"${spaceId}","text":"Hello from my harness","idempotency_key":"hello-1"}'`,
  ].join("\n");
}

/**
 * Where Connect a harness is: the gallery, a card for a harness here already, a way's link and card,
 * or the form under Advanced.
 */
type AddPage =
  | { readonly kind: "gallery" }
  | { readonly kind: "here"; readonly way: Connector; readonly harnessId: string }
  | { readonly kind: "connect"; readonly way: Choice }
  | { readonly kind: "advanced" };

/** The page a card picked opens: one for a harness here already asks first, as the phone's does. */
function pickedPage(way: Choice, directory: Directory): AddPage {
  const here = typeof way === "string" ? undefined : harnessNamed(directory, way.name);
  return here === undefined || typeof way === "string"
    ? { kind: "connect", way }
    : { kind: "here", way, harnessId: here };
}

/**
 * Connect a harness (ADR 0122), in a dialog that grows out of its button (or, opened from You, out
 * of the page's middle): the gallery's two ways, each making a link and following it to the
 * harness's hello; and under Anything with HTTP → Advanced, today's Add a harness, unchanged — a
 * name and whether it takes the dial, then the token shown once, the three curl lines and the
 * checklist. Somebody who may not make links is shown that form
 * at once. It folds away any way out, but not while a harness is being made, so a token is never
 * made and never seen.
 */
function AddHarness(props: {
  readonly from: HTMLElement | null;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly serverUrl: string;
  readonly join?: JoinService | undefined;
  readonly joins?: ReadonlyMap<string, JoinRequest> | undefined;
  /** The docs' cards for the gallery (ADR 0171): none, and it is the two the app carries. */
  readonly cards?: readonly Connector[] | undefined;
  readonly onAdd: (name: string, options: AddOptions) => Promise<AddedHarness>;
  readonly onOpen: (spaceId: string) => void;
  /** A harness's page, from the card for one here already. */
  readonly onOpenHarness: (harnessId: string) => void;
  readonly onClosed: () => void;
}) {
  const titleId = useId();
  const join = administers(myRole(props.model, props.selfId)) ? props.join : undefined;
  const [page, setPage] = useState<AddPage>(
    join === undefined ? { kind: "advanced" } : { kind: "gallery" },
  );
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<AddedHarness | undefined>(undefined);
  const leave = () => {
    if (!busy) setLeaving(true);
  };
  return (
    <GrowingDialog
      from={props.from}
      labelledBy={titleId}
      className="harness-dialog"
      testId="add-harness-dialog"
      focus={page.kind === "advanced" ? "input[type=text]" : ".join-card"}
      leaving={leaving}
      onLeave={leave}
      onGone={props.onClosed}
    >
      <div className="harness-dialog-card">
        {page.kind === "gallery" && (
          <Gallery
            titleId={titleId}
            cards={props.cards}
            connected={connectedNames(props.directory)}
            onPick={(way) => setPage(pickedPage(way, props.directory))}
            onClose={leave}
          />
        )}
        {page.kind === "here" && (
          <HereAlready
            titleId={titleId}
            card={page.way}
            harnessId={page.harnessId}
            model={props.model}
            directory={props.directory}
            selfId={props.selfId}
            onAnother={() => setPage({ kind: "connect", way: page.way })}
            onBack={() => setPage({ kind: "gallery" })}
            onOpenHarness={props.onOpenHarness}
            onClose={leave}
          />
        )}
        {page.kind === "connect" && join !== undefined && (
          <ConnectPage
            titleId={titleId}
            way={page.way}
            model={props.model}
            directory={props.directory}
            selfId={props.selfId}
            joins={props.joins}
            join={join}
            onOpen={props.onOpen}
            onAdvanced={page.way === "http" ? () => setPage({ kind: "advanced" }) : undefined}
            // A listed harness's card asks for what that harness needs: its eleven switches, in
            // Chips's own words, opened under the line, were the first thing it showed (the setup
            // audit, 17 October 2026, M5). They wait behind What it may do, as the welcome's do.
            foldSwitches={typeof page.way !== "string"}
            onCancelled={() => setPage({ kind: "gallery" })}
            onClose={leave}
          />
        )}
        {page.kind === "advanced" && added === undefined && (
          <AddForm
            titleId={titleId}
            busy={busy}
            onBusy={setBusy}
            onAdd={async (name, options) => setAdded(await props.onAdd(name, options))}
            onCancel={leave}
          />
        )}
        {page.kind === "advanced" && added !== undefined && (
          <Added
            titleId={titleId}
            added={added}
            serverUrl={props.serverUrl}
            connection={props.model.connections[added.harnessId]}
            onOpen={() => {
              props.onOpen(added.spaceId);
              leave();
            }}
            onDone={leave}
          />
        )}
      </div>
    </GrowingDialog>
  );
}

/** The dialog's ×, the same as New space's. */
function Close(props: { readonly onClose: () => void }) {
  return (
    <button
      type="button"
      className="new-space-close"
      aria-label="Close"
      data-testid="add-harness-close"
      onClick={props.onClose}
    >
      <Icon name="x" size={14} />
    </button>
  );
}

function AddForm(props: {
  readonly titleId: string;
  readonly busy: boolean;
  readonly onBusy: (busy: boolean) => void;
  readonly onAdd: (name: string, options: AddOptions) => Promise<void>;
  readonly onCancel: () => void;
}) {
  const { busy, onBusy } = props;
  const [name, setName] = useState("");
  const [takesDial, setTakesDial] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "" || busy) return;
    onBusy(true);
    setError(undefined);
    try {
      await props.onAdd(name.trim(), { takesDial });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      onBusy(false);
    }
  };
  return (
    <form
      className="harness-add"
      onSubmit={(event) => void submit(event)}
      data-testid="add-harness"
    >
      <div className="new-space-head">
        <h2 id={props.titleId}>Add a harness</h2>
        <Close onClose={props.onCancel} />
      </div>
      <p className="harness-add-how">
        <b>Custom</b> — any harness. You get a harness token and three curl lines; the checklist
        lights as the events arrive. A harness with an adapter of its own reads the same address, id
        and token from its config. Add one for each harness you run.
      </p>
      <label className="harness-add-name">
        Name
        <input
          type="text"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          placeholder="Scout"
        />
      </label>
      <label className="harness-add-dial">
        <input
          type="checkbox"
          checked={takesDial}
          onChange={(event) => setTakesDial(event.target.checked)}
        />
        <span>
          <b>Takes the autonomy dial</b>
          <small>Off for a harness whose permission model is its own.</small>
        </span>
      </label>
      {error !== undefined && (
        <p className="harness-add-error" role="alert">
          {error}
        </p>
      )}
      <div className="harness-add-actions">
        <Button variant="ghost" onClick={props.onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={name.trim() === "" || busy}>
          {busy ? "Adding…" : "Create and get a token"}
        </Button>
      </div>
    </form>
  );
}

/** A button that copies, and says so for a moment. */
function Copy(props: { readonly text: string; readonly label: string; readonly testId: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      data-testid={props.testId}
      onClick={() => {
        void navigator.clipboard?.writeText(props.text).then(
          () => setCopied(true),
          () => undefined,
        );
      }}
    >
      {copied ? "Copied" : props.label}
    </Button>
  );
}

function Added(props: {
  readonly titleId: string;
  readonly added: AddedHarness;
  readonly serverUrl: string;
  readonly connection: HarnessConnection | undefined;
  readonly onOpen: () => void;
  readonly onDone: () => void;
}) {
  const { added } = props;
  const lines = curlLines(props.serverUrl, added.token, added.harnessId, added.spaceId);
  const copy = useRef<HTMLDivElement>(null);
  // The token is what this step is for: the keyboard goes to its Copy.
  useEffect(() => copy.current?.querySelector("button")?.focus(), []);
  return (
    <section
      className="harness-new"
      data-testid="new-harness"
      data-harness-id={added.harnessId}
      aria-label={`${added.displayName}, just added`}
    >
      <div className="new-space-head">
        <Avatar name={added.displayName} kind="harness" />
        <h2 id={props.titleId}>{added.displayName} is added</h2>
        <Close onClose={props.onDone} />
      </div>
      <div className="harness-new-token" ref={copy}>
        <code data-testid="harness-token">{added.token}</code>
        <Copy text={added.token} label="Copy" testId="copy-token" />
      </div>
      <p className="harness-new-how">
        The token is shown once; Chips keeps only its digest. {added.displayName}'s card can issue
        another. Its space is <code data-testid="dm-id">{added.spaceId}</code>.
      </p>
      <div className="harness-new-lines">
        <b>Paste these into a terminal</b>
        <Copy text={lines} label="Copy all" testId="copy-lines" />
      </div>
      <pre className="curl-lines" data-testid="curl-lines">
        {lines}
      </pre>
      <Checklist connection={props.connection} />
      <div className="harness-add-actions">
        <Button variant="ghost" onClick={props.onOpen}>
          Open space
        </Button>
        <Button variant="primary" onClick={props.onDone}>
          Done
        </Button>
      </div>
    </section>
  );
}
