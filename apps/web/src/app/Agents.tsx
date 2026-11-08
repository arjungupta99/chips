/**
 * The Agents page's own parts (ADR 0087, Phase 5): the sections of agents under the harnesses'
 * shelf, and an agent's page — its card, as the phone's (ADR 0270) — which takes the middle column
 * with a way back, as the phone pushes it (the desktop pick of 30 September 2026). Its message
 * history opens on a page of its own (`agent/AgentHistory.tsx`). The run pane on the right stays
 * the run's.
 *
 * Which agents, in what order, the words under each, the card's facts and the history's stretches
 * are core's (`agentsTab`, `agentCard`, `agentHistory`), so the desktop and the phone say the same.
 */

import {
  type AgentCard,
  type AgentRow,
  type AgentsLook,
  administers,
  agentArchiveAsking,
  agentCard,
  agentDeleteAsking,
  agentsTab,
  belongsTo,
  type ConnectionState,
  type ContextReads,
  type Directory,
  faceWords,
  guestAgentsWords,
  type HeartbeatReads,
  historyRoomsWords,
  keepLeaving,
  type ModelReads,
  mayOpenSpace,
  myRole,
  patientLook,
  ROOM_PICK_ROW,
  type RoomPick,
  type ShownAgents,
  type StayFact,
  stayFact,
  troubled,
  type WindowReads,
  type WorkspaceModel,
  waitingWords,
} from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { Avatar, ChipMark, Icon, LIBRARY_MARKS } from "@chipschat/ui";
import { type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { Fold, useArrivals } from "./Arrive.tsx";
import { useStays } from "./agent/AgentHistory.tsx";
import { RoomPickDialog } from "./agent/RoomPick.tsx";
import type { AgentsService } from "./agent/service.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { ContextGroup } from "./context/ContextGroup.tsx";
import { type ContextPage, OpenedPage } from "./context/pages.ts";
import { GroupRow } from "./GroupRow.tsx";
import { HeartbeatGroup } from "./heartbeat/HeartbeatGroup.tsx";
import { LockRow } from "./LockRow.tsx";
import { MainTag } from "./MainTag.tsx";
import { ModelGroup } from "./model/ModelGroup.tsx";
import { Swap } from "./Swap.tsx";
import { leavingProps, PickMark, pickProps } from "./select/PickParts.tsx";
import type { Leaving, RowPick } from "./select/usePick.ts";
import { relativeTime } from "./time.ts";
import { usePatience } from "./usePatience.ts";
import { WindowGroup } from "./window/WindowGroup.tsx";
import { reasonOf } from "./you/controls.tsx";

export type { AgentsService };

const RING: Readonly<Record<AgentRow["doing"], "working" | "waiting" | undefined>> = {
  working: "working",
  waiting: "waiting",
  idle: undefined,
};

/**
 * One agent's row: face (ringed while it works), name, where it is, and when its room spoke. While
 * the page picks, a checkbox (ADR 0182). A harness's page lists its first five with it (ADR 0254).
 */
export function AgentListRow({
  row,
  onOpen,
  pick,
  arriving,
  face = "sm",
}: {
  readonly row: AgentRow;
  readonly onOpen: (id: string) => void;
  readonly pick?: RowPick | undefined;
  /** Come into a list already drawn: it grows into its place (`useArrivals`). */
  readonly arriving?: boolean | undefined;
  /** The face's size: the list's 48 in the first column (ADR 0284), a page's own rows smaller. */
  readonly face?: "sm" | "md" | undefined;
}) {
  const waiting = waitingWords(row.held);
  const ring = RING[row.doing];
  const opened = useContext(OpenedPage);
  const chosen = opened?.kind === "agent" && opened.agentId === row.id;
  return (
    <li {...leavingProps(pick)} data-arrive={arriving === true ? "true" : undefined}>
      <button
        type="button"
        className="agent-row"
        data-testid={`agent-${row.id}`}
        data-chosen={chosen ? "true" : undefined}
        aria-current={chosen ? "page" : undefined}
        {...pickProps(pick)}
        onClick={(event) => (pick?.active === true ? pick.onPick(event.shiftKey) : onOpen(row.id))}
      >
        <span className="agent-face">
          <PickMark pick={pick} />
          <Avatar
            name={row.name}
            kind="agent"
            size={face}
            icon={row.face}
            {...(ring === undefined ? {} : { status: ring })}
          />
        </span>
        <span className="agent-who">
          <span className="agent-name">{row.name}</span>
          {/* The harness's Main agent says so, in its face's colour (ADR 0145). */}
          {row.lead && <MainTag name={row.name} icon={row.face} />}
        </span>
        <span className={row.free ? "agent-line agent-free" : "agent-line"}>
          {/* Where it is and what it is doing crossfade as they change. */}
          <Swap id={`${row.doing} ${row.line} ${waiting ?? ""}`} className="agent-line-words">
            {row.doing === "working" && <span className="agent-working">Working · </span>}
            {row.line}
            {waiting !== undefined && <span className="agent-waiting">{waiting}</span>}
          </Swap>
        </span>
        <span className="agent-when">{row.at === undefined ? "" : relativeTime(row.at)}</span>
      </button>
    </li>
  );
}

/** How far behind the row above each blank row's light starts: a wave down the list. */
const ROW_STEP_MS = 140;
const NAMES = ["34%", "26%", "40%", "30%"] as const;
const LINES = ["58%", "70%", "50%", "64%"] as const;

/**
 * The page before this device has ever had the server's list (14 October 2026), as the phone's
 * Agents tab: every launch after the first lists what was kept, at once (core's `agentsLook`).
 *
 * While the list is on its way, rows in the rows' own shape whose faces are blank agents, the light
 * running round their pins one row after another, and the harnesses' tiles blank over them. When
 * the server can't be asked, why, as the space pane says it (`NoRooms`); when it answered and the
 * list didn't come, that, with Try again. "No agents yet" is only ever the server's word.
 */
export function AgentsWaiting({
  look,
  connection,
  server,
  agents,
  onWake,
}: {
  readonly look: Exclude<AgentsLook, "listed">;
  readonly connection: ConnectionState;
  readonly server: string | undefined;
  /** The page's service, whose `refresh` asks for the list again. */
  readonly agents: AgentsService | undefined;
  /** Check the connection now: the store's `wake`. */
  readonly onWake: (() => void) | undefined;
}) {
  // Trouble is said once it has lasted, not for a launch's blip (`patientLook`). The page leaves
  // this behind when the list comes, and the wait with it.
  const shown = patientLook(look, connection, usePatience(false, troubled(look)));
  return (
    <main className="conv harnesses" aria-label="Agents">
      <header className="conv-h">
        <div className="conv-h-t">
          <h1>Agents</h1>
        </div>
      </header>
      <div className="harnesses-body">
        <Waiting
          look={shown === "listed" ? "fetching" : shown}
          server={server}
          agents={agents}
          onWake={onWake}
        />
      </div>
    </main>
  );
}

/** What each of the connection's troubles says, as the space pane says it (`NoRooms`). */
const TOLD: Readonly<
  Record<"connecting" | "closed" | "asleep", { title: string; words: string; retry: boolean }>
> = {
  connecting: {
    title: "Reaching your server",
    words: "Your agents will show here as soon as it answers.",
    retry: false,
  },
  closed: {
    title: "Can't reach your server",
    words: "Your agents will show here as soon as it answers. Chips keeps trying on its own.",
    retry: true,
  },
  asleep: {
    title: "Your server is asleep",
    words:
      "The relay can't find it: the computer Chips runs on is asleep or switched off. Your agents will show here when it wakes.",
    retry: true,
  },
};

function Waiting({
  look,
  server,
  agents,
  onWake,
}: {
  readonly look: Exclude<ShownAgents, "listed">;
  readonly server: string | undefined;
  readonly agents: AgentsService | undefined;
  readonly onWake: (() => void) | undefined;
}) {
  if (look === "reading" || look === "rejected" || look === "removed") return null;
  if (look === "fetching") return <Blank />;
  if (look === "failed") return <Failed onRefresh={agents?.refresh} />;
  const told = TOLD[look];
  return (
    <div className="agents-told none-in" data-testid={`no-agents-${look}`} aria-live="polite">
      <ChipMark size={64} state={look === "connecting" ? "working" : "failed"} />
      <h2 className="none-t">{told.title}</h2>
      <p className="none-w">{told.words}</p>
      {server === undefined ? null : <p className="none-c">{server}</p>}
      {told.retry ? (
        <button type="button" className="none-b" onClick={onWake}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** Blank tiles where the harnesses' shelf will be (ADR 0185), and blank agents where the list will be. */
function Blank() {
  return (
    <div className="agents-sections agents-blank" data-testid="agents-fetching" role="status">
      <span className="ui-visually-hidden">Loading your agents</span>
      <div className="shelf" aria-hidden="true">
        <div className="shelf-tiles">
          {[0, 1, 2].map((at) => (
            <span key={at} className="shelf-tile agents-blank-tile">
              <span className="agents-blank-squircle" />
              <span className="agents-blank-bar" style={{ width: NAMES[at] }} />
              <span className="agents-blank-bar thin" style={{ width: LINES[at] }} />
            </span>
          ))}
        </div>
      </div>
      <BlankRow at={0} />
      <h2 className="agents-h">Agents</h2>
      {[1, 2, 3].map((at) => (
        <BlankRow key={at} at={at} />
      ))}
    </div>
  );
}

function BlankRow({ at }: { readonly at: number }) {
  return (
    <div className="agent-row agents-blank-row" aria-hidden="true">
      <ChipMark size={32} state="blank" delay={at * ROW_STEP_MS} />
      <span className="agents-blank-bar" style={{ width: NAMES[at] }} />
      <span className="agents-blank-bar thin" style={{ width: LINES[at] }} />
    </div>
  );
}

/** The server answered and the list didn't come: say so, and ask again on a tap. */
function Failed({ onRefresh }: { readonly onRefresh: (() => Promise<void>) | undefined }) {
  const [asking, setAsking] = useState(false);
  const retry = () => {
    if (asking || onRefresh === undefined) return;
    setAsking(true);
    void onRefresh().finally(() => setAsking(false));
  };
  return (
    <div className="agents-told none-in" data-testid="no-agents-failed" aria-live="polite">
      <ChipMark size={64} state={asking ? "working" : "done"} />
      <h2 className="none-t">Couldn't load your agents</h2>
      <p className="none-w">
        Your server is connected, but its list of agents didn't come through. Trying again usually
        does it.
      </p>
      <button type="button" className="none-b" onClick={retry} disabled={asking}>
        {asking ? "Trying…" : "Try again"}
      </button>
    </div>
  );
}

/** Which folds of the page's archived agents are open: the page's own, unless it is told. */
export interface Folds {
  readonly archived: boolean;
  readonly elsewhere: boolean;
  readonly onArchived: (open: boolean) => void;
  readonly onElsewhere: (open: boolean) => void;
}

/**
 * Which run of rows an agent stands in on the page: the Main agents, the agents, and the archived
 * ones in rooms the reader can read and in rooms they can't.
 */
export function agentRun(tab: ReturnType<typeof agentsTab>): (row: AgentRow) => string {
  const elsewhere = new Set(tab.archived.elsewhere.map((row) => row.id));
  return (row) => {
    if (row.lead) return "leads";
    if (!row.archived) return "agents";
    return elsewhere.has(row.id) ? "elsewhere" : "here";
  };
}

/** The sections of the page, above the harnesses' cards. */
export function AgentSections({
  model,
  directory,
  selfId,
  onOpen,
  folds: told,
  pickOf,
  held = [],
  harnessId,
  words = "",
  face,
}: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly onOpen: (agentId: string) => void;
  /** The rows' faces: the list's 48 (ADR 0284), or a page's own. */
  readonly face?: "sm" | "md" | undefined;
  /** One harness's agents alone: its page's See all (ADR 0254). */
  readonly harnessId?: string | undefined;
  /** What its field asks for: only the rows whose name or line has it, in any case. */
  readonly words?: string | undefined;
  /** Which folds are open, where the page that picks keeps them (ADR 0182). */
  readonly folds?: Folds | undefined;
  /** What each row is told about picking, drawn in its run, while the page can pick. */
  readonly pickOf?: ((row: AgentRow, run: string) => RowPick) | undefined;
  /** Rows archived, unarchived or deleted, held where they stood until they have gone. */
  readonly held?: readonly Leaving<AgentRow>[] | undefined;
}) {
  const tab = agentsTab(model, directory, selfId, { harnessId });
  const [archivedOpen, setArchived] = useState(false);
  const [elsewhereOpen, setElsewhere] = useState(false);
  const folds = told ?? {
    archived: archivedOpen,
    elsewhere: elsewhereOpen,
    onArchived: setArchived,
    onElsewhere: setElsewhere,
  };
  const asked = words.trim().toLowerCase();
  const shown = (rows: readonly AgentRow[], run: string) =>
    keepLeaving(
      rows.filter(foundBy(asked)),
      held.filter((each) => each.run === run),
    );
  const leads = shown(tab.leads, "leads");
  const agents = shown(tab.agents, "agents");
  const here = shown(tab.archived.here, "here");
  const away = shown(tab.archived.elsewhere, "elsewhere");
  const count = here.length + away.length;
  // A new agent grows into its place; one that moved from one run to another lands there instead.
  const arriving = useArrivals(
    [...tab.leads, ...tab.agents, ...tab.archived.here, ...tab.archived.elsewhere].map(
      (each) => each.id,
    ),
  );
  // A row, drawn in its run (`agentRun`).
  const row = (run: string) => (each: AgentRow) => (
    <AgentListRow
      key={each.id}
      row={each}
      onOpen={onOpen}
      pick={pickOf?.(each, run)}
      arriving={arriving.has(each.id)}
      face={face}
    />
  );
  return (
    <div className="agents-sections">
      {leads.length > 0 && (
        // First, wearing the Main tag rather than under a heading of their own (ADR 0145).
        <section aria-label="Main agents">
          <ul className="agent-list">{leads.map(row("leads"))}</ul>
        </section>
      )}
      {asked !== "" && agents.length === 0 ? (
        // Searching: only what it found, and a line when it found nothing at all.
        leads.length === 0 && (
          <p className="agents-empty" data-testid="all-agents-none">
            {`No agent's name or space has “${words.trim()}” in it.`}
          </p>
        )
      ) : (
        <AgentsSection
          count={asked === "" ? tab.agents.length : agents.length}
          rows={agents.map(row("agents"))}
          empty={emptyWords(
            leads.length > 0,
            mayOpenSpace(myRole(model, selfId)),
            administers(myRole(model, selfId)),
          )}
          foot={guestAgentsWords(model, directory, selfId, tab)}
        />
      )}
      {count > 0 && asked === "" && (
        <ArchivedFolds
          folds={folds}
          here={here.map(row("here"))}
          away={away.map(row("elsewhere"))}
        />
      )}
    </div>
  );
}

/**
 * The archived agents, folded: those in rooms the reader can read, and under them, folded again,
 * those in rooms they're not in.
 */
function ArchivedFolds(props: {
  readonly folds: Folds;
  readonly here: readonly ReactNode[];
  readonly away: readonly ReactNode[];
}) {
  const { folds } = props;
  const { archived, elsewhere } = folds;
  return (
    <section aria-label="Archived agents">
      <button
        type="button"
        className="agents-fold"
        aria-expanded={archived}
        data-testid="archived-agents"
        onClick={() => folds.onArchived(!archived)}
      >
        <span>{`Archived · ${props.here.length + props.away.length}`}</span>
        <span>{archived ? "Hide" : "Show"}</span>
      </button>
      <Fold open={archived}>
        <ul className="agent-list">{props.here}</ul>
        {props.away.length > 0 && (
          <button
            type="button"
            className="agents-fold"
            aria-expanded={elsewhere}
            data-testid="archived-elsewhere"
            onClick={() => folds.onElsewhere(!elsewhere)}
          >
            <span>{`In spaces you're not in · ${props.away.length}`}</span>
            <span>{elsewhere ? "Hide" : "Show"}</span>
          </button>
        )}
        <Fold open={elsewhere}>
          <ul className="agent-list">{props.away}</ul>
        </Fold>
      </Fold>
    </section>
  );
}

/** Whether a row is one a search asks for: its name or where it is, in any case; any, unasked. */
function foundBy(asked: string): (row: AgentRow) => boolean {
  if (asked === "") return () => true;
  return (row) => `${row.name} ${row.line}`.toLowerCase().includes(asked);
}

/**
 * The Agents section: its count, its rows or what an empty one says, and under a guest's agents,
 * whose they are (ADR 0196).
 */
function AgentsSection(props: {
  readonly count: number;
  readonly rows: readonly ReactNode[];
  readonly empty: string;
  readonly foot: string | undefined;
}) {
  return (
    <section aria-label="Agents">
      <h2 className="agents-h">{`Agents · ${props.count}`}</h2>
      {props.rows.length === 0 ? (
        <p className="agents-empty">{props.empty}</p>
      ) : (
        <ul className="agent-list">{props.rows}</ul>
      )}
      {props.foot !== undefined && (
        <p className="agents-empty" data-testid="agents-guest-foot">
          {props.foot}
        </p>
      )}
    </section>
  );
}

/**
 * An agent's page: its card, as the phone draws it (ADR 0087, Phase 5; ADR 0270 brought the
 * phone's card here). The face and the name, edited in place, with its harness under it; then on
 * the left what it is — where it is, since when, what it is doing, Lock changes, its model and its
 * heartbeat — and on the right what it holds — its context window, its files, its history and what
 * may be done with it — or one after the other in a narrow pane. The whole card scrolls. Message
 * history is a row that opens it on a page of its own (`agent/AgentHistory.tsx`); until ADR 0270 it
 * stood under a card that did not scroll, in whatever height the card left it.
 */
export function AgentPage({
  agentId,
  model,
  directory,
  selfId,
  faces,
  agents,
  backLabel = "Agents",
  onBack,
  onOpenRoom,
  onOpenAgent,
  onOpenHistory,
  onOpenFace,
  context,
  heartbeats,
  windows,
  models,
  onOpenContext,
}: {
  readonly agentId: string;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly faces: ReadonlyMap<string, SpaceIcon> | undefined;
  readonly agents: AgentsService;
  /** What its way back says: the page under it. */
  readonly backLabel?: string | undefined;
  readonly onBack: () => void;
  readonly onOpenRoom: (spaceId: string) => void;
  /** Opens another agent's page: the one a copy was forked from. */
  readonly onOpenAgent?: ((agentId: string) => void) | undefined;
  /** Opens its message history on a page of its own. */
  readonly onOpenHistory: () => void;
  /** Opens its face on a page of its own (ADR 0272), for whoever may change it. */
  readonly onOpenFace?: (() => void) | undefined;
  /** Its context files, through the store (ADR 0134). Absent, the card has no Context group. */
  readonly context?: ContextReads | undefined;
  /** Its heartbeat, through the store (ADR 0143). Absent, the card has no Heartbeat group. */
  readonly heartbeats?: HeartbeatReads | undefined;
  /** Its context window, through the store (ADR 0146). Absent, the card has no such group. */
  readonly windows?: WindowReads | undefined;
  /** Its model and effort, through the store (ADR 0140). Absent, the card has no Model group. */
  readonly models?: ModelReads | undefined;
  /** Opens one of its files, or its harness's page (ADR 0135). */
  readonly onOpenContext?: ((page: ContextPage) => void) | undefined;
}) {
  const { stays, failed } = useStays(agents, agentId, directory[agentId]?.room);
  const card = agentCard(model, directory, selfId, agentId);
  // There from the card's first frame, with only its dates waiting on the server (`stayFact`).
  const stay = stayFact(card, stays, stays === undefined && failed === undefined);
  return (
    <main className="conv agent-page" aria-label={card.name}>
      <header className="conv-h">
        <div className="conv-h-t">
          <button type="button" className="agent-back" onClick={onBack}>
            {`‹ ${backLabel}`}
          </button>
          <h1>{card.name}</h1>
        </div>
      </header>
      <div className="harnesses-body">
        <section className="agent-sheet" aria-label="Card" data-testid="agent-card">
          <div className="agent-hero">
            <HeroFace card={card} onOpenFace={card.mayFace ? onOpenFace : undefined} />
            <div className="agent-hero-words">
              <CardName card={card} rename={(next) => agents.rename(agentId, next)} />
              <div className="agent-card-sub" data-testid="agent-sub">
                {card.sub}
              </div>
            </div>
          </div>
          <div className="hp-cols">
            <div className="hp-col">
              <Facts
                card={card}
                stay={stay}
                owner={belongsTo(directory, agentId, selfId)}
                onOpenRoom={onOpenRoom}
                onOpenAgent={onOpenAgent}
              />
              <LockGroup agentId={agentId} card={card} agents={agents} />
              {card.mayFace && onOpenFace !== undefined && (
                <IconGroup name={card.name} face={card.face} onOpen={onOpenFace} />
              )}
              <ModelGroup
                reads={models}
                model={model}
                directory={directory}
                agentId={agentId}
                agentName={card.name}
                selfId={selfId}
                sayMissing
              />
              <HeartbeatGroup
                reads={heartbeats}
                model={model}
                directory={directory}
                agentId={agentId}
                agentName={card.name}
                selfId={selfId}
              />
            </div>
            <div className="hp-col">
              <WindowGroup
                reads={windows}
                model={model}
                directory={directory}
                agentId={agentId}
                agentName={card.name}
                selfId={selfId}
                working={card.doing !== "idle"}
              />
              {onOpenContext !== undefined && (
                <ContextGroup
                  reads={context}
                  model={model}
                  directory={directory}
                  agentId={agentId}
                  agentName={card.name}
                  selfId={selfId}
                  onOpen={onOpenContext}
                />
              )}
              <section className="ctx" aria-label="History">
                <div className="ctx-h">
                  <h3 className="agents-h">History</h3>
                </div>
                <ul className="ctx-group">
                  <GroupRow
                    label="Message history"
                    value={historyRoomsWords(stays)}
                    onClick={onOpenHistory}
                    testId="agent-history"
                  />
                </ul>
                {failed !== undefined && stays === undefined && (
                  <p className="ctx-foot">{failed}</p>
                )}
              </section>
              <CardActs
                agentId={agentId}
                card={card}
                model={model}
                directory={directory}
                selfId={selfId}
                faces={faces}
                agents={agents}
                onOpenRoom={onOpenRoom}
                onDeleted={onBack}
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/**
 * The card's name: the field for anybody who may rename it, the name alone for a guest, and while
 * its changes are locked the name alone with a small padlock beside it, so whoever reads the card
 * sees why it will not edit (ADR 0199).
 */
/**
 * The face at the card's head, which changes it for whoever may (ADR 0089): a click opens its page,
 * as the phone's tap opens its sheet. Anybody else sees it as it is.
 */
function HeroFace(props: {
  readonly card: AgentCard;
  readonly onOpenFace?: (() => void) | undefined;
}) {
  const { card } = props;
  const face = (
    <Avatar
      name={card.name}
      kind="agent"
      size="lg"
      icon={card.face}
      {...(card.doing === "idle" ? {} : { status: card.doing })}
    />
  );
  if (props.onOpenFace === undefined) return face;
  return (
    <button
      type="button"
      className="agent-hero-face"
      aria-label={`${card.name}'s icon`}
      title="Changes its icon"
      data-testid="agent-face"
      onClick={props.onOpenFace}
    >
      {face}
    </button>
  );
}

/**
 * Its Icon section (ADR 0174, Arjun's A: "a special section"): the face at a row's size and what it
 * wears, which opens the same page as the face. Only for whoever may change it.
 */
function IconGroup(props: {
  readonly name: string;
  readonly face: SpaceIcon | undefined;
  readonly onOpen: () => void;
}) {
  return (
    <section className="ctx" aria-label="Icon">
      <div className="ctx-h">
        <h3 className="agents-h">Icon</h3>
      </div>
      <ul className="ctx-group">
        <GroupRow
          label="Icon"
          value={faceWords(props.face, (mark) => mark in LIBRARY_MARKS)}
          face={<Avatar name={props.name} kind="agent" size="sm" icon={props.face} />}
          onClick={props.onOpen}
          testId="agent-icon"
        />
      </ul>
    </section>
  );
}

function CardName(props: {
  readonly card: AgentCard;
  readonly rename: (name: string) => Promise<void>;
}) {
  const { card } = props;
  if (card.mayName) return <AgentName name={card.ownName} rename={props.rename} />;
  return (
    <div className="agent-card-name">
      {card.name}
      {card.locked && (
        <Icon name="lock" size={15} label="Changes locked" className="agent-locked" />
      )}
    </div>
  );
}

/**
 * An agent's name on its page (ADR 0091), edited in place as your own is on You: the name is the
 * field. Enter or leaving it saves, Escape puts back what was there. It is everybody's, and its
 * harness can no longer change it. The directory's word replaces the draft, so a rename elsewhere
 * shows here; a name the server refuses stays in the field with its reason under it, and is not
 * sent again until it is changed.
 */
function AgentName(props: {
  readonly name: string;
  readonly rename: (name: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(props.name);
  const [error, setError] = useState<string | undefined>(undefined);
  const field = useRef<HTMLInputElement>(null);
  /** A name on its way, or the one the server just refused: neither is sent twice. */
  const sent = useRef<string | undefined>(undefined);
  /** Escape was pressed: leaving the field puts the name back rather than saving it. */
  const reverting = useRef(false);
  useEffect(() => setDraft(props.name), [props.name]);

  const save = () => {
    const next = draft.trim().replace(/\s+/g, " ");
    if (next === "") {
      setDraft(props.name);
      return;
    }
    if (next === props.name || next === sent.current) return;
    sent.current = next;
    setError(undefined);
    props.rename(next).catch((failure: unknown) => setError(reasonOf(failure)));
  };

  return (
    <form
      className="agent-name"
      data-testid="agent-name"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <input
        ref={field}
        type="text"
        aria-label="Name"
        maxLength={120}
        spellCheck={false}
        value={draft}
        aria-invalid={error === undefined ? undefined : true}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(undefined);
          sent.current = undefined;
        }}
        onBlur={() => {
          if (reverting.current) reverting.current = false;
          else save();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          reverting.current = true;
          setDraft(props.name);
          setError(undefined);
          field.current?.blur();
        }}
      />
      {error !== undefined && (
        <p className="agent-name-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * Where it is, since when, what it is doing, and what waits, a row each as on the phone: its space,
 * which opens; Since or Was there, whose dates wait on the server; what it was forked from, which
 * opens that agent; Now; whose it is, when not the reader's (ADR 0196); and how many of its words
 * wait, with who said them and where they go under the group (`heldNote`).
 */
function Facts(props: {
  readonly card: AgentCard;
  readonly stay: StayFact | undefined;
  readonly owner: string | undefined;
  readonly onOpenRoom: (spaceId: string) => void;
  readonly onOpenAgent?: ((agentId: string) => void) | undefined;
}) {
  const { card, stay, owner } = props;
  const room = card.room;
  const from = card.forkedFrom;
  return (
    <section className="ctx agent-facts-group" aria-label="Where it is">
      <ul className="ctx-group">
        <GroupRow
          label="Space"
          value={room === undefined ? "None" : `${room.name}${room.archived ? " · archived" : ""}`}
          onClick={room?.readable === true ? () => props.onOpenRoom(room.spaceId) : undefined}
          testId="agent-room"
        />
        {stay !== undefined && (
          <GroupRow
            label={stay.word}
            // Empty while the server is asked, so the row is drawn once and nothing under it moves.
            value={stay.dates ?? ""}
            testId="agent-stay"
            valueTestId="agent-stay-dates"
          />
        )}
        {from !== undefined && (
          <GroupRow
            label="Forked from"
            value={from.name}
            onClick={
              props.onOpenAgent === undefined ? undefined : () => props.onOpenAgent?.(from.agentId)
            }
            testId="agent-forked-from"
          />
        )}
        <GroupRow label="Now" value={card.now} testId="agent-now" />
        {owner !== undefined && (
          <GroupRow label="Belongs to" value={owner} testId="agent-belongs" />
        )}
        {card.held > 0 && (
          <GroupRow
            label="Waiting"
            value={`${card.held} ${card.held === 1 ? "message" : "messages"}`}
            testId="agent-waiting"
          />
        )}
      </ul>
      {card.heldNote !== undefined && (
        <p className="ctx-foot" data-testid="agent-waiting-note">
          {card.heldNote}
        </p>
      )}
    </section>
  );
}

/**
 * Lock changes (ADR 0199), in a group of its own under the facts, for whoever may archive or
 * delete it: while it is on, nobody renames, archives or deletes it. A flip the server turns away
 * goes back, and says why under it.
 */
function LockGroup(props: {
  readonly agentId: string;
  readonly card: AgentCard;
  readonly agents: AgentsService;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  if (!props.card.mayLock) return null;
  const lock = async (locked: boolean) => {
    setFailed(undefined);
    setBusy(true);
    try {
      await props.agents.lock(props.agentId, locked);
      return true;
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "The server would not do it.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="ctx" aria-label="Lock changes">
      <ul className="ctx-group agent-lock">
        <LockRow
          locked={props.card.locked}
          busy={busy}
          onLock={lock}
          testId="agent-lock"
          switchTestId="agent-lock-switch"
        />
      </ul>
      {failed !== undefined && (
        <p className="ctx-foot agent-failed" role="alert">
          {failed}
        </p>
      )}
    </section>
  );
}

/** Whether the card offers Archive or Unarchive: Unarchive for an archived one, locked or not. */
function keepAct(card: AgentCard): "archive" | "unarchive" | undefined {
  if (card.archived) return card.mayUnarchive ? "unarchive" : undefined;
  return card.mayKeep ? "archive" : undefined;
}

/**
 * What may be done with it, as the phone's card ends: Put it in a space, or Move it to another,
 * and Fork it, where its harness makes copies, each opening the room picker grown out of its row;
 * then Archive or Unarchive; and, apart and in red, Delete (ADR 0095). Neither Archive nor Delete
 * while its changes are locked (ADR 0199), which the note under them says. Archive and Delete ask
 * first, in the dialog the room's panel uses; Unarchive only puts it back.
 */
function CardActs(props: {
  readonly agentId: string;
  readonly card: AgentCard;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly faces: ReadonlyMap<string, SpaceIcon> | undefined;
  readonly agents: AgentsService;
  readonly onOpenRoom: (spaceId: string) => void;
  readonly onDeleted: () => void;
}) {
  const { agentId, card, agents } = props;
  const [picking, setPicking] = useState<{ mode: RoomPick; from: HTMLElement } | undefined>();
  const [asking, setAsking] = useState<"archive" | "delete" | undefined>(undefined);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const keep = keepAct(card);
  const moves = card.mayMove ? (card.now === "Not in a space" ? "put" : "move") : undefined;
  if (moves === undefined && keep === undefined && card.note === undefined) return null;
  const unarchive = () => {
    setFailed(undefined);
    agents
      .archive(agentId, false)
      .catch((error: unknown) =>
        setFailed(error instanceof Error ? error.message : "The server would not do it."),
      );
  };
  return (
    <section className="ctx agent-acts-group" aria-label="What may be done">
      <ActRows
        moves={moves}
        fork={card.mayFork}
        keep={keep}
        onPick={(mode, from) => setPicking({ mode, from })}
        onKeep={keep === "unarchive" ? unarchive : () => setAsking("archive")}
      />
      {card.mayKeep && (
        <ul className="ctx-group hp-apart">
          <GroupRow
            label="Delete"
            tone="danger"
            onClick={() => setAsking("delete")}
            testId="delete-agent"
          />
        </ul>
      )}
      {failed !== undefined && (
        <p className="ctx-foot agent-failed" role="alert">
          {failed}
        </p>
      )}
      {card.note !== undefined && <p className="ctx-foot agent-note">{card.note}</p>}
      {picking !== undefined && (
        <RoomPickDialog
          mode={picking.mode}
          from={picking.from}
          agentId={agentId}
          model={props.model}
          directory={props.directory}
          selfId={props.selfId}
          faces={props.faces}
          agents={agents}
          onOpenRoom={props.onOpenRoom}
          onClosed={() => {
            picking.from.focus();
            setPicking(undefined);
          }}
        />
      )}
      {asking !== undefined && (
        <KeepAsking {...props} asking={asking} onDone={() => setAsking(undefined)} />
      )}
    </section>
  );
}

/** Put or Move, and Fork, each opening the room picker; then Archive or Unarchive. */
function ActRows(props: {
  readonly moves: "put" | "move" | undefined;
  readonly fork: boolean;
  readonly keep: "archive" | "unarchive" | undefined;
  readonly onPick: (mode: RoomPick, from: HTMLElement) => void;
  readonly onKeep: () => void;
}) {
  const { moves, keep } = props;
  if (moves === undefined && keep === undefined) return null;
  return (
    <ul className="ctx-group">
      {moves !== undefined && (
        <GroupRow
          label={ROOM_PICK_ROW[moves]}
          tone="accent"
          onClick={(from) => props.onPick(moves, from)}
          testId={`agent-${moves}`}
        />
      )}
      {moves !== undefined && props.fork && (
        <GroupRow
          label={ROOM_PICK_ROW.fork}
          tone="accent"
          onClick={(from) => props.onPick("fork", from)}
          testId="agent-fork"
        />
      )}
      {keep !== undefined && (
        <GroupRow
          label={keep === "unarchive" ? "Unarchive" : "Archive"}
          tone="accent"
          onClick={props.onKeep}
          testId={`${keep}-agent`}
        />
      )}
    </ul>
  );
}

/** Archive or Delete…, asked first in the dialog the room's panel uses (ADR 0095). */
function KeepAsking(props: {
  readonly agentId: string;
  readonly asking: "archive" | "delete";
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly agents: AgentsService;
  readonly onDone: () => void;
  readonly onDeleted: () => void;
}) {
  const { agentId, asking, model, directory, selfId, agents } = props;
  return (
    <ConfirmDialog
      asking={
        asking === "archive"
          ? agentArchiveAsking(model, directory, agentId)
          : agentDeleteAsking(model, directory, selfId, agentId)
      }
      danger={asking === "delete"}
      tooOld={
        asking === "archive"
          ? "Not archived: this server is older than the app, and cannot archive an agent yet."
          : "Not deleted: this server is older than the app, and cannot delete an agent yet."
      }
      onCancel={props.onDone}
      onConfirm={async ({ too }) => {
        if (asking === "archive") await agents.archive(agentId, true);
        else await agents.remove(agentId, { deleteRoom: too });
        props.onDone();
        if (asking === "delete") props.onDeleted();
      }}
    />
  );
}

/**
 * What the empty Agents section says. Under the Main agents listed above it, "No agents yet" said
 * the opposite of the page (the setup audit, 17 October 2026, M3): it says where more come from,
 * and the + only to whoever has one (ADR 0196). With none at all, an owner or admin is pointed at
 * the shelf's Connect tile, as the phone's tab points them (ADR 0261).
 */
export function emptyWords(mainAgents: boolean, opens = true, decides = false): string {
  if (!mainAgents) {
    return decides
      ? "No agents yet. Connect a harness from the shelf, or allow one that asks."
      : "No agents yet. A harness's agents come when it connects.";
  }
  return opens
    ? "None besides the Main agents yet. The + makes more, and so does Add in a space."
    : "None besides the Main agents yet. Add in a space makes more.";
}
