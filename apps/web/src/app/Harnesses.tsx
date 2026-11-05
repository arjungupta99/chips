/**
 * The Agents tab (ADR 0087, Phase 5; the Harnesses tab until 30 September 2026): the harnesses on
 * a shelf (`HarnessShelf`, ADR 0185), then the workspace's agents in their sections (`Agents.tsx`),
 * and an agent's card and history in the middle column when one is opened. A tile opens its
 * harness's page (`harness/HarnessPage.tsx`, ADR 0254, here since ADR 0266), and View all every
 * harness's card (`harness/HarnessCards.tsx`), each over the page; until 17 October 2026 the cards
 * stood under the agents, three screens down, and until ADR 0266 the page was the old card whole.
 *
 * A harness's page opens pages of its own over it (`harness/Parts.tsx`): all of its agents, its
 * context files, When it asks you and its recent runs; and its jobs (ADR 0252) and files (ADR 0135)
 * open theirs. Each goes back to the one under it.
 *
 * Connect a harness (ADR 0122): a gallery whose ways make a link to run where the harness runs, and
 * under Anything with HTTP → Advanced, Add harness, Custom: a name, a token shown once, and the curl
 * lines. Add harness is a dialog that grows out of its button (ADR 0084): the name, then the token,
 * the lines and the checklist lighting as the first events arrive, all in it, and Escape, the × or a
 * click outside folds it away at either step.
 *
 * Tokens are the owner's (ADR 0023). A harness's page shows what it holds without ever showing a
 * token, because Chips keeps only digests; it issues another, once, on screen; and it withdraws
 * one, which takes effect at the harness's next request and closes the socket it is holding. A
 * rotation is those two in that order, which is what the page's wording says. The tokens stand with
 * what else only a desk has, in the page's Connection group (`harness/Desk.tsx`, ADR 0273): who owns
 * it, what it sends, and what it may do, each a row opening a page of its own.
 */

import {
  type AddedHarness,
  type AgentsLook,
  administers,
  agentStateWords,
  agentsTab,
  type ConnectionState,
  type ContextReads,
  connectedNames,
  contextValue,
  type Directory,
  type HarnessConnection,
  type HeartbeatReads,
  harnessGroups,
  harnessModelAgent,
  harnessNamed,
  heldNamesFor,
  type JoinRequest,
  joinCardOf,
  type ModelReads,
  mayAskFromPage,
  mayReadContext,
  mayRemoveHarness,
  myRole,
  nameOf,
  pageAgentHint,
  pageAgentName,
  RUN_IN_TERMINAL,
  type SetAutonomyInput,
  type SetRulesInput,
  type WindowReads,
  type WorkspaceModel,
  waitingLink,
  workspaceHarnesses,
} from "@chipschat/core";
import type { Connector, SpaceIcon } from "@chipschat/protocol";
import { Avatar, Button, Icon } from "@chipschat/ui";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  AgentPage,
  AgentSections,
  type AgentsService,
  AgentsWaiting,
  agentRun,
  type Folds,
} from "./Agents.tsx";
import { AgentFace } from "./agent/AgentFace.tsx";
import { AgentHistory } from "./agent/AgentHistory.tsx";
import { ContextFile } from "./context/ContextFile.tsx";
import { type ContextPage, pageName } from "./context/pages.ts";
import { useHarnessContext } from "./context/useContext.ts";
import { NotInDemo, useNotInDemo } from "./demo/NotInDemo.tsx";
import type { FileService } from "./files.ts";
import { GrowingDialog } from "./GrowingDialog.tsx";
import { HarnessShelf } from "./HarnessShelf.tsx";
import { Checklist, DeskGroup, type TokenService } from "./harness/Desk.tsx";
import { HarnessCards } from "./harness/HarnessCards.tsx";
import { HarnessPage } from "./harness/HarnessPage.tsx";
import { Part } from "./harness/Parts.tsx";
import { PART_TITLE } from "./harness/parts.ts";
import {
  type Choice,
  ConnectPage,
  Gallery,
  HereAlready,
  type JoinService,
  type KeptLink,
  PageGallery,
} from "./Join.tsx";
import { JobPage } from "./jobs/JobPage.tsx";
import { JobsGroup, type JobsReads } from "./jobs/JobsGroup.tsx";
import { useModelRow } from "./model/ModelGroup.tsx";
import { Swap } from "./Swap.tsx";
import { useAgentPicking } from "./select/agents.tsx";
import { PickBar, PickHint, SelectButton } from "./select/PickParts.tsx";
import { Turns } from "./Turns.tsx";

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
  /** Pause and Resume a harness's latest run, from its page (ADR 0254). Absent, no Pause. */
  readonly onRun?:
    | {
        readonly pause: (target: { readonly spaceId: string; readonly runId: string }) => void;
        readonly resume: (target: { readonly spaceId: string; readonly runId: string }) => void;
      }
    | undefined;
  /** Turn a harness's dial, on its When it asks you (ADR 0046). Absent, the dial is read only. */
  readonly onSetAutonomy?: ((input: SetAutonomyInput) => void) | undefined;
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

/**
 * Connect a harness's dialog, open: what it grows out of (nothing, opened from You: the page's
 * middle), and the card it opens at, when one was picked on the empty page (ADR 0261).
 */
interface Adding {
  readonly from: HTMLElement | null;
  readonly way?: Choice | undefined;
  /** Opened on the card whose link waits (ADR 0271): its link again, and back is the gallery. */
  readonly resume?: boolean | undefined;
}

export function Harnesses(props: HarnessesProps) {
  const { model, directory } = props;
  const [adding, setAdding] = useState<Adding | undefined>(
    props.initialAdding === true ? { from: null } : undefined,
  );
  // The pages opened over the list, each going back to the one under it: an agent's page (one a
  // search result opened, ADR 0132, is the first), a harness's and the pages it opens, files, jobs.
  const [over, setOver] = useState<readonly ContextPage[]>(() =>
    props.initialAgent === undefined ? [] : [{ kind: "agent", agentId: props.initialAgent }],
  );
  // In the demo, connecting a harness needs a server: the page says so in its place.
  const setUp = useNotInDemo();
  const agents = props.agents;
  // Whose words wait is read with the directory, so it is read again when the page opens.
  useEffect(() => {
    void agents?.refresh();
  }, [agents]);
  // A page of a harness that was removed is left, as the phone's page leaves: what was under it shows.
  const shown = over.filter((each) => standing(each, directory));
  const push = (page: ContextPage) => setOver([...shown, page]);
  const pop = () => setOver(shown.slice(0, -1));
  const openAgent = (agentId: string) => push({ kind: "agent", agentId });
  // The list's archived folds, kept here so the list is as it was left when a page goes back to it.
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [elsewhereOpen, setElsewhereOpen] = useState(false);
  const folds: Folds = {
    archived: archivedOpen,
    elsewhere: elsewhereOpen,
    onArchived: setArchivedOpen,
    onElsewhere: setElsewhereOpen,
  };

  // A link a card made, kept while the dialog is put away (ADR 0271): the shelf's last tile counts
  // it down, and Connect opens on its card again while it waits, as the phone's does.
  const [kept, setKept] = useState<KeptLink | undefined>(undefined);
  const waiting = waitingKept(kept, props.joins, model, directory);
  const connect =
    setUp === undefined
      ? (from: HTMLElement, way?: Choice) => setAdding(addingFor(from, way, waiting))
      : undefined;
  const dialog = adding !== undefined && (
    <AddHarness
      from={adding.from}
      way={adding.way}
      resume={adding.resume === true}
      kept={waiting}
      onKept={setKept}
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
        setAdding(undefined);
        push({ kind: "harness_page", harnessId });
      }}
      onNewAgent={(harnessId) => {
        setAdding(undefined);
        push({ kind: "harness_page", harnessId, newAgent: true });
      }}
      onClosed={() => {
        setAdding(undefined);
        focusBack(adding.from);
      }}
    />
  );
  const cards = (onConnect?: (from: HTMLElement) => void) => (
    <HarnessCards
      model={model}
      directory={directory}
      selfId={props.selfId}
      onOpen={(harnessId) => push({ kind: "harness_page", harnessId })}
      onConnect={onConnect}
    />
  );

  const page = overPage(shown, {
    model,
    directory,
    selfId: props.selfId,
    context: props.context,
    jobs: props.jobs,
    onBack: pop,
    agentPage: (agentId, backLabel) => (
      <AgentOf
        {...props}
        agentId={agentId}
        backLabel={backLabel}
        onBack={pop}
        onOpenAgent={openAgent}
        onPush={push}
      />
    ),
    historyPage: (agentId, backLabel) =>
      agents === undefined || props.files === undefined ? undefined : (
        <AgentHistory
          agentId={agentId}
          model={model}
          directory={directory}
          selfId={props.selfId ?? ""}
          files={props.files}
          faces={props.faces}
          agents={agents}
          backLabel={backLabel}
          onBack={pop}
          onOpenRoom={props.onOpen}
          onOpenAgent={openAgent}
        />
      ),
    facePage: (agentId, backLabel) =>
      agents === undefined ? undefined : (
        <OverPage
          title="Icon"
          label={`${nameOf(directory, agentId)}: Icon`}
          backLabel={backLabel}
          onBack={pop}
        >
          <AgentFace agentId={agentId} directory={directory} agents={agents} />
        </OverPage>
      ),
    harnessPage: (harnessId, newAgent) => (
      <HarnessOf
        {...props}
        harnessId={harnessId}
        newAgent={newAgent}
        onOpenAgent={openAgent}
        onPush={push}
      />
    ),
    part: (top) => (
      <Part
        part={top.part}
        harnessId={top.harnessId}
        model={model}
        directory={directory}
        selfId={props.selfId}
        context={props.context}
        flashFile={top.flash}
        onOpenAgent={openAgent}
        onOpenSpace={props.onOpen}
        onOpenFile={(name) =>
          push({ kind: "file", owner: { kind: "harness", id: top.harnessId }, name, own: false })
        }
        onSetRules={props.onSetRules}
        onSetAutonomy={props.onSetAutonomy}
        onTransfer={mayOn(props, top.harnessId).transfer}
        onDeclare={mayOn(props, top.harnessId).declare}
        tokens={props.tokens}
      />
    ),
    // Connect a harness at the foot of every harness's card, for whoever may (ADR 0185).
    cards: cards(
      connect !== undefined && administers(myRole(model, props.selfId ?? ""))
        ? (from) => connect(from)
        : undefined,
    ),
  });
  const home = waitsForList(props) ? (
    <ListWaiting {...props} />
  ) : (
    <AgentsHome
      model={model}
      directory={directory}
      selfId={props.selfId ?? ""}
      agents={agents}
      add={<HeaderAdd setUp={setUp} onPress={(from) => connect?.(from)} />}
      onConnect={connect}
      waitsOn={requestOf(waiting, props.joins)}
      connectors={galleryCards(props)}
      cards={cards()}
      folds={folds}
      onOpenHarness={(harnessId) => push({ kind: "harness_page", harnessId })}
      onAllHarnesses={() => push({ kind: "harnesses" })}
      onOpenAgent={openAgent}
    />
  );
  // The page on top, or the list: the blank before it, or the empty page's gallery, which gives way
  // to the list as the first harness comes, each by a turn in place.
  return (
    <>
      <Turns
        at={turnName(props, shown, page !== undefined, connect !== undefined)}
        depth={page === undefined ? 0 : shown.length}
        keeps=".harnesses-body"
      >
        {page ?? home}
      </Turns>
      {/* Connect's dialog stands apart from the pages, so a page turning under it leaves it be. */}
      {dialog}
    </>
  );
}

/** An agent's page (`AgentPage`), over whatever opened it, with what this surface gives it. */
function AgentOf(
  props: HarnessesProps & {
    readonly agentId: string;
    readonly backLabel: string;
    readonly onBack: () => void;
    readonly onOpenAgent: (agentId: string) => void;
    readonly onPush: (page: ContextPage) => void;
  },
) {
  if (props.agents === undefined || props.files === undefined) return null;
  return (
    <AgentPage
      agentId={props.agentId}
      model={props.model}
      directory={props.directory}
      selfId={props.selfId ?? ""}
      faces={props.faces}
      agents={props.agents}
      backLabel={props.backLabel}
      onBack={props.onBack}
      onOpenRoom={props.onOpen}
      onOpenAgent={props.onOpenAgent}
      onOpenHistory={() => props.onPush({ kind: "agent_history", agentId: props.agentId })}
      onOpenFace={() => props.onPush({ kind: "agent_face", agentId: props.agentId })}
      context={props.context}
      heartbeats={props.heartbeats}
      windows={props.windows}
      models={props.models}
      onOpenContext={props.onPush}
    />
  );
}

/**
 * One harness's page (`HarnessPage`, ADR 0254) with what this surface gives it: New agent for
 * whoever may ask it for one, Pause, its Main agent's Model row, its context files' count, its own
 * jobs, Restart and Remove for whoever may, and what only a desk has.
 */
function HarnessOf(
  props: HarnessesProps & {
    readonly harnessId: string;
    readonly newAgent?: boolean | undefined;
    readonly onOpenAgent: (agentId: string) => void;
    readonly onPush: (page: ContextPage) => void;
  },
) {
  const { model, directory, harnessId, selfId } = props;
  const main = harnessModelAgent(directory, harnessId);
  const modelRow = useModelRow({
    reads: selfId === undefined ? undefined : props.models,
    model,
    directory,
    agentId: main ?? "",
    agentName: main === undefined ? "" : nameOf(directory, main),
    selfId: selfId ?? "",
  });
  const set = useHarnessContext(props.context, model, directory, harnessId, selfId);
  const may = mayOn(props, harnessId);
  const name = nameOf(directory, harnessId);
  return (
    <HarnessPage
      harnessId={harnessId}
      model={model}
      directory={directory}
      selfId={selfId}
      onOpenAgent={props.onOpenAgent}
      onOpenPart={(part) => props.onPush({ kind: "harness_part", harnessId, part })}
      newAgent={
        may.ask === undefined ? undefined : (
          <NewAgent
            harnessId={harnessId}
            name={name}
            model={model}
            directory={directory}
            selfId={selfId}
            onAsk={may.ask}
            onOpen={props.onOpen}
            opening={props.newAgent === true}
          />
        )
      }
      run={props.onRun}
      modelRow={main === undefined ? undefined : modelRow}
      contextValue={
        may.context ? contextValue(set === undefined ? undefined : harnessGroups(set)) : null
      }
      jobs={
        <JobsGroup
          reads={props.jobs}
          model={model}
          directory={directory}
          harnessId={harnessId}
          selfId={selfId}
          onOpenJob={(jobId) => props.onPush({ kind: "job", harnessId, jobId })}
        />
      }
      desk={
        <DeskGroup
          harnessId={harnessId}
          model={model}
          directory={directory}
          selfId={selfId}
          handsOn={may.transfer !== undefined}
          tokens={props.tokens !== undefined}
          onOpenPart={(part) => props.onPush({ kind: "harness_part", harnessId, part })}
        />
      }
      restart={props.onRestart}
      remove={may.remove}
    />
  );
}

/**
 * What the reader may do to a harness, of what this surface offers: ask it for a new agent (ADR
 * 0190, point 4), remove it (ADR 0078), hand it on and say what it may do (M5.2, ADR 0046), and read
 * its context files (ADR 0135). Each absent for anybody who may not.
 */
function mayOn(props: HarnessesProps, harnessId: string) {
  const { model, directory } = props;
  const self = props.selfId;
  const handsOn = mayHandOn(model, self, directory[harnessId]?.ownerId);
  if (self === undefined) {
    return {
      ask: undefined,
      remove: undefined,
      transfer: undefined,
      declare: undefined,
      context: false,
    };
  }
  return {
    ask: mayAskFromPage(model, directory, self, harnessId) ? props.onNewAgent : undefined,
    remove: mayRemoveHarness(model, directory, harnessId, self) ? props.onRemove : undefined,
    transfer: handsOn ? props.onTransfer : undefined,
    declare: handsOn ? props.onDeclare : undefined,
    context: props.context !== undefined && mayReadContext(model, directory, harnessId, self),
  };
}

/**
 * The Agents page's list (ADR 0087, Phase 5): its header, the harnesses' shelf over the agents'
 * sections, and, while it picks agents to archive, unarchive or delete together (ADR 0182), the
 * bar of acts. The archived agents' folds are read here, where what is shown is known, since
 * Select all picks what is shown, and kept by the tab, so a page gone back from finds them as they
 * were. Without the agents, the harnesses' cards, as the Harnesses tab was.
 *
 * Connect a harness is the shelf's last tile, as the phone's is, and the header's button only where
 * there is no shelf. A workspace with no harness and no agent is the gallery to pick one from
 * (ADR 0261), for whoever may make a link; everybody else's empty page says where agents come from.
 */
function AgentsHome({
  model,
  directory,
  selfId,
  waitsOn,
  agents,
  add,
  onConnect,
  connectors,
  cards,
  folds,
  onOpenHarness,
  onAllHarnesses,
  onOpenAgent,
}: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly agents: AgentsService | undefined;
  /** The header's Connect a harness, or the demo's line in its place. */
  readonly add: ReactNode;
  /** Open Connect a harness, grown out of what was pressed, at a card picked. Absent in the demo. */
  readonly onConnect: ((from: HTMLElement, way?: Choice) => void) | undefined;
  /** The request of a link a card made that still waits: the shelf's last tile counts it down. */
  readonly waitsOn?: JoinRequest | undefined;
  /** The docs' cards an empty page offers. Absent, it offers none. */
  readonly connectors: readonly Connector[] | undefined;
  /** The harnesses' cards, for a page without the agents. */
  readonly cards: ReactNode;
  /** Which of the archived folds are open, kept by the tab so they outlast a page over the list. */
  readonly folds: Folds;
  readonly onOpenHarness: (harnessId: string) => void;
  readonly onAllHarnesses: () => void;
  readonly onOpenAgent: (agentId: string) => void;
}) {
  const archivedOpen = folds.archived;
  const elsewhereOpen = folds.elsewhere;
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
  const counts = countWords(model, directory, selfId);
  const shelved = agents !== undefined && onConnect !== undefined;
  if (shelved && connectors !== undefined && bareTab(tab)) {
    return (
      <main className="conv harnesses" aria-label="Agents">
        <header className="conv-h">
          <div className="conv-h-t">
            <h1 data-testid="agents-title">Agents</h1>
          </div>
        </header>
        <div className="harnesses-body">
          <PageGallery cards={connectors} onPick={(way, from) => onConnect(from, way)} />
        </div>
      </main>
    );
  }
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
              {/* The counts crossfade as an agent or a harness comes or goes. */}
              <Swap id={counts} className="agents-counts">
                {counts}
              </Swap>
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
          {!shelved && (
            <span className="pick-aside" inert={picking}>
              {add}
            </span>
          )}
        </div>
      </header>

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
                onConnect={onConnect}
                waitsOn={waitsOn}
              />
            </div>
            <AgentSections
              model={model}
              directory={directory}
              selfId={selfId}
              onOpen={onOpenAgent}
              folds={folds}
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

/**
 * The header's Connect a harness, where the page has no shelf to end with it, or in the demo the
 * line in its place.
 */
function HeaderAdd(props: {
  readonly setUp: ReturnType<typeof useNotInDemo>;
  readonly onPress: (from: HTMLElement) => void;
}) {
  if (props.setUp !== undefined) return <NotInDemo onSetUp={props.setUp} />;
  return (
    <Button onClick={(event) => props.onPress(event.currentTarget)} aria-haspopup="dialog">
      Connect a harness
    </Button>
  );
}

/**
 * The cards an empty page offers (ADR 0261): an owner's or an admin's, whose dialog opens on the
 * gallery with links to make. Anybody else's opens on the form, and their page says so instead.
 */
function galleryCards(props: HarnessesProps): readonly Connector[] | undefined {
  if (props.join === undefined || !administers(myRole(props.model, props.selfId ?? ""))) {
    return undefined;
  }
  return props.cards ?? [];
}

/**
 * Which page the tab shows, for the turn to it (`Turns`): the page on top, the blank before the
 * list, the empty page's gallery, or the list.
 */
function turnName(
  props: HarnessesProps,
  shown: readonly ContextPage[],
  onTop: boolean,
  connects: boolean,
): string {
  const top = shown.at(-1);
  if (onTop && top !== undefined) return pageName(top);
  if (waitsForList(props)) return "blank";
  return homeName(props, connects);
}

/** Whether the directory is not yet the server's word, so the page stands blank (`agentsLook`). */
function waitsForList(props: HarnessesProps): boolean {
  return props.look !== undefined && props.look !== "listed";
}

/** The page before its first list: blank agents, or why the list can't be had. */
function ListWaiting(props: HarnessesProps) {
  if (props.look === undefined || props.look === "listed") return null;
  return (
    <AgentsWaiting
      look={props.look}
      connection={props.connection ?? "connecting"}
      server={props.server}
      agents={props.agents}
      onWake={props.onWake}
    />
  );
}

/** The list, or the empty page's gallery (ADR 0261) as `AgentsHome` draws it, for the turn between. */
function homeName(props: HarnessesProps, connects: boolean): string {
  const gallery =
    props.agents !== undefined &&
    connects &&
    galleryCards(props) !== undefined &&
    bareTab(agentsTab(props.model, props.directory, props.selfId ?? ""));
  return gallery ? "gallery" : "agents";
}

/** Whether a page's harness, or its agent, is still in the workspace. */
function standing(page: ContextPage, directory: Directory): boolean {
  const id =
    page.kind === "agent" || page.kind === "agent_history" || page.kind === "agent_face"
      ? page.agentId
      : page.kind === "file"
        ? page.owner.id
        : page.kind === "harnesses"
          ? undefined
          : page.harnessId;
  return (
    id === undefined || (directory[id] !== undefined && directory[id]?.removedAt === undefined)
  );
}

/** Back to what the dialog grew out of, unless the harness that arrived took it away. */
function focusBack(from: HTMLElement | null): void {
  if (from?.isConnected === true) from.focus();
}

/** Whether the workspace has no harness and no agent, archived or not: the gallery's page. */
function bareTab(tab: ReturnType<typeof agentsTab>): boolean {
  const { leads, agents, archived, harnesses } = tab;
  return (
    harnesses.length +
      leads.length +
      agents.length +
      archived.here.length +
      archived.elsewhere.length ===
    0
  );
}

/** The page's name, and while it picks, how many are picked (ADR 0182). */
function pickTitle(picking: boolean, count: number): string {
  if (!picking) return "Agents";
  return count === 0 ? "Select agents" : `${count} selected`;
}

/**
 * The page on top: a file of an agent's or a harness's (ADR 0135); a harness's page (ADR 0254), or
 * one of the pages it opens, its context files flashing the shared file an agent's page opened them
 * for; every harness's card, in the shelf's order (ADR 0185); or one of a harness's own jobs (ADR
 * 0252). Nothing, when there is none, or its harness is gone.
 */
function overPage(
  over: readonly ContextPage[],
  on: {
    readonly model: WorkspaceModel;
    readonly directory: Directory;
    readonly selfId: string | undefined;
    readonly context: ContextReads | undefined;
    readonly jobs: JobsReads | undefined;
    readonly agentPage: (agentId: string, backLabel: string) => ReactNode;
    readonly historyPage: (agentId: string, backLabel: string) => ReactNode;
    /** An agent's face, chosen on a page over its card (ADR 0272). */
    readonly facePage: (agentId: string, backLabel: string) => ReactNode;
    /** A harness's page; with its New agent dialog open, when Connect's card asked for one. */
    readonly harnessPage: (harnessId: string, newAgent: boolean) => ReactNode;
    readonly part: (top: Extract<ContextPage, { kind: "harness_part" }>) => ReactNode;
    /** Every harness's card, for View all. */
    readonly cards: ReactNode;
    readonly onBack: () => void;
  },
): ReactNode | undefined {
  const top = over.at(-1);
  const backLabel = backLabelOf(over.at(-2), on.directory);
  const agent = agentTop(top, backLabel, on);
  if (agent !== undefined) return agent;
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
      <OverPage title="Harnesses" backLabel={backLabel} onBack={on.onBack}>
        {on.cards}
      </OverPage>
    );
  }
  if (
    top === undefined ||
    !("harnessId" in top) ||
    workspaceHarnesses(on.directory).every((each) => each.id !== top.harnessId)
  ) {
    return undefined;
  }
  if (top.kind === "harness_part") {
    return (
      <OverPage
        title={PART_TITLE[top.part]}
        backLabel={backLabel}
        onBack={on.onBack}
        label={`${nameOf(on.directory, top.harnessId)}: ${PART_TITLE[top.part]}`}
      >
        {on.part(top)}
      </OverPage>
    );
  }
  return (
    <OverPage title={nameOf(on.directory, top.harnessId)} backLabel={backLabel} onBack={on.onBack}>
      {on.harnessPage(top.harnessId, top.newAgent === true)}
    </OverPage>
  );
}

/** A page over the Agents page: its way back, its name, and what it holds, scrolling. */
function OverPage(props: {
  readonly title: string;
  readonly backLabel: string;
  readonly onBack: () => void;
  /** What a screen reader calls it, when not its title. */
  readonly label?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <main className="conv harnesses" aria-label={props.label ?? props.title}>
      <header className="conv-h">
        <div className="conv-h-t">
          <button type="button" className="agent-back" onClick={props.onBack}>
            {`‹ ${props.backLabel}`}
          </button>
          <h1>{props.title}</h1>
        </div>
      </header>
      <div className="harnesses-body">{props.children}</div>
    </main>
  );
}

/** An agent's own pages over the list: its card, its history and its face; else nothing. */
function agentTop(
  top: ContextPage | undefined,
  backLabel: string,
  on: {
    readonly agentPage: (agentId: string, backLabel: string) => ReactNode;
    readonly historyPage: (agentId: string, backLabel: string) => ReactNode;
    readonly facePage: (agentId: string, backLabel: string) => ReactNode;
  },
): ReactNode | undefined {
  switch (top?.kind) {
    case "agent":
      return on.agentPage(top.agentId, backLabel);
    case "agent_history":
      return on.historyPage(top.agentId, backLabel);
    case "agent_face":
      return on.facePage(top.agentId, backLabel);
    default:
      return undefined;
  }
}

/** What a page's back button says: the page under it, or the list's. */
function backLabelOf(under: ContextPage | undefined, directory: Directory): string {
  switch (under?.kind) {
    case undefined:
      return "Agents";
    case "agent":
      return nameOf(directory, under.agentId);
    case "agent_history":
      return "Message history";
    case "agent_face":
      return "Icon";
    case "harness_page":
    case "job":
      return nameOf(directory, under.harnessId);
    case "harness_part":
      return PART_TITLE[under.part];
    case "harnesses":
      return "Harnesses";
    case "file":
      return nameOf(directory, under.owner.id);
  }
}

/**
 * Under the page's name: how many agents, archived ones, and harnesses. Nothing on a page with none
 * of them, whose body says so once (ADR 0261).
 */
function countWords(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string | undefined,
): string {
  const tab = agentsTab(model, directory, selfId ?? "");
  const agents = tab.leads.length + tab.agents.length;
  const archived = tab.archived.here.length + tab.archived.elsewhere.length;
  const harnesses = tab.harnesses.length;
  if (harnesses + agents + archived === 0) return "";
  return [
    `${agents} ${agents === 1 ? "agent" : "agents"}`,
    ...(archived === 0 ? [] : [`${archived} archived`]),
    ...(harnesses === 0
      ? []
      : [
          `${harnesses} ${harnesses === 1 ? "harness in this workspace" : "harnesses in this workspace"}`,
        ]),
  ].join(" · ");
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
  /** Open at once, grown out of the button: Connect's card for one here already asked for it. */
  readonly opening?: boolean | undefined;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const opening = props.opening === true;
  useEffect(() => {
    if (opening) setOpen(true);
  }, [opening]);
  // Gold while the harness can answer; quiet while it can't, since the ask waits on it.
  const answers =
    agentStateWords(props.directory, props.harnessId, Date.now(), undefined, props.selfId) ===
    undefined;
  return (
    <>
      <Button
        ref={button}
        className="hp-act"
        variant={answers ? "primary" : "default"}
        data-testid="harness-new-agent"
        onClick={() => setOpen(true)}
      >
        <Icon name="plus" size={14} />
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

/**
 * What the dialog focuses as it opens, on the page it opens at: the gallery's first card, the form's
 * first field, or, at a card picked on the empty page (ADR 0261), its ×, since the link it shows is
 * still being made.
 */
const FOCUS: Readonly<Record<AddPage["kind"], string>> = {
  gallery: ".join-card",
  here: ".new-space-close",
  connect: ".new-space-close",
  advanced: "input[type=text]",
};

/** The page a card picked opens: one for a harness here already asks first, as the phone's does. */
/**
 * The link a card made, while it still waits to be used (core's `waitingLink`): read as the page
 * draws, so a link that was used, ran out or was withdrawn is not opened again.
 */
function waitingKept(
  kept: KeptLink | undefined,
  joins: ReadonlyMap<string, JoinRequest> | undefined,
  model: WorkspaceModel,
  directory: Directory,
): KeptLink | undefined {
  const request = requestOf(kept, joins);
  if (request === undefined) return undefined;
  const nowMs = Date.now();
  return waitingLink(request, joinCardOf(request, model, directory, nowMs), nowMs) === undefined
    ? undefined
    : kept;
}

/** The kept link's request, as the store holds it. */
function requestOf(
  kept: KeptLink | undefined,
  joins: ReadonlyMap<string, JoinRequest> | undefined,
): JoinRequest | undefined {
  return kept === undefined ? undefined : joins?.get(kept.id);
}

/** Where Connect opens: the card picked, else the card whose link waits, else the gallery. */
function addingFor(
  from: HTMLElement,
  way: Choice | undefined,
  waiting: KeptLink | undefined,
): Adding {
  return way === undefined && waiting !== undefined
    ? { from, way: waiting.choice, resume: true }
    : { from, way };
}

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
  /** Its page with New agent open, from the card for one here already (ADR 0190, point 1). */
  readonly onNewAgent: (harnessId: string) => void;
  readonly onClosed: () => void;
  /** The card picked on the empty page (ADR 0261): it opens there, and going back closes it. */
  readonly way?: Choice | undefined;
  /** Opened on the card whose link waits (ADR 0271): back from it is the gallery. */
  readonly resume?: boolean | undefined;
  /** The link a card made that still waits, and where each new one is kept. */
  readonly kept?: KeptLink | undefined;
  readonly onKept: (kept: KeptLink | undefined) => void;
}) {
  const titleId = useId();
  const join = administers(myRole(props.model, props.selfId)) ? props.join : undefined;
  const [page, setPage] = useState<AddPage>(() => {
    if (join === undefined) return { kind: "advanced" };
    if (props.way === undefined) return { kind: "gallery" };
    return props.resume === true
      ? { kind: "connect", way: props.way }
      : pickedPage(props.way, props.directory);
  });
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
      focus={FOCUS[page.kind]}
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
            onNewAgent={props.onNewAgent}
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
            kept={props.kept}
            onKept={props.onKept}
            // Picked on the page, the gallery to go back to is the page's own. A withdrawn link is
            // kept no more.
            onCancelled={() => {
              props.onKept(undefined);
              if (props.way === undefined || props.resume === true) setPage({ kind: "gallery" });
              else leave();
            }}
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
        <b>{RUN_IN_TERMINAL}</b>
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
