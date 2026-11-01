/**
 * The Agents page's own parts (ADR 0087, Phase 5): the sections of agents over the harnesses'
 * cards, and an agent's page — its card and its message history — which takes the middle column
 * with a way back, as the phone pushes it (the desktop pick of 30 September 2026). The run pane on
 * the right stays the run's.
 *
 * Which agents, in what order, the words under each, the card's facts and the history's stretches
 * are core's (`agentsTab`, `agentCard`, `agentHistory`), so the desktop and the phone say the same.
 */

import {
  type AgentCard,
  type AgentRow,
  type AgentStay,
  type AgentsLook,
  agentArchiveAsking,
  agentCard,
  agentDeleteAsking,
  agentHistory,
  agentsTab,
  awayWords,
  belongsTo,
  type ConnectionState,
  type ContextReads,
  type Directory,
  forkRoomTitle,
  guestAgentsWords,
  type HeartbeatReads,
  keepLeaving,
  type Lane,
  type Line,
  type ModelReads,
  mayOpenSpace,
  myRole,
  patientLook,
  type Run,
  roomName,
  type ShownAgents,
  type StayFact,
  type Stretch,
  stayFact,
  stretchDates,
  troubled,
  type WindowReads,
  type WorkspaceModel,
  waitingWords,
} from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { Avatar, Button, ChipMark, Icon } from "@chipschat/ui";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { ContextGroup } from "./context/ContextGroup.tsx";
import type { ContextPage } from "./context/pages.ts";
import type { FileService } from "./files.ts";
import { HeartbeatGroup } from "./heartbeat/HeartbeatGroup.tsx";
import { LockRow } from "./LockRow.tsx";
import { MainTag } from "./MainTag.tsx";
import { ModelGroup } from "./model/ModelGroup.tsx";
import { ReadOnlyRow } from "./SpaceView.tsx";
import { leavingProps, PickMark, pickProps } from "./select/PickParts.tsx";
import type { Leaving, RowPick } from "./select/usePick.ts";
import { relativeTime } from "./time.ts";
import { usePatience } from "./usePatience.ts";
import { WindowGroup } from "./window/WindowGroup.tsx";
import { reasonOf } from "./you/controls.tsx";

/** What the page asks the store for, and does through it. */
export interface AgentsService {
  readonly stays: (agentId: string) => Promise<readonly AgentStay[]>;
  /** Move an agent in a room to another; rejects with the server's reason. */
  readonly move: (agentId: string, spaceId: string) => Promise<void>;
  /** Ask its harness for a copy of it in a room (ADR 0087, Fork); rejects with the reason. */
  readonly fork: (agentId: string, spaceId: string) => Promise<void>;
  /** A new room, named as the copy will be, with a fork asked for in it; its id once asked. */
  readonly forkRoom: (agentId: string, title: string) => Promise<string>;
  /** Put a free agent in a room: any member's (rule 4). */
  readonly put: (agentId: string, spaceId: string) => void;
  /** A new room with a free agent in it, named after it; its id. */
  readonly newRoom: (agentId: string, title: string) => string;
  readonly refresh: () => Promise<void>;
  /** Rename an agent, for everybody (ADR 0091); rejects with the server's reason. */
  readonly rename: (agentId: string, name: string) => Promise<void>;
  /** Archive an agent, or bring it back (ADR 0095); rejects with the server's reason. */
  readonly archive: (agentId: string, archived: boolean) => Promise<void>;
  /** Delete an agent, and its room with it when asked (ADR 0095); rejects with the reason. */
  readonly remove: (agentId: string, options: { readonly deleteRoom: boolean }) => Promise<void>;
  /**
   * Lock an agent's changes, or let them go (ADR 0199): while they are locked, nobody renames,
   * archives or deletes it. Rejects with the server's reason.
   */
  readonly lock: (agentId: string, locked: boolean) => Promise<void>;
}

const RING: Readonly<Record<AgentRow["doing"], "working" | "waiting" | undefined>> = {
  working: "working",
  waiting: "waiting",
  idle: undefined,
};

/**
 * One agent's row: face (ringed while it works), name, where it is, and when its room spoke. While
 * the page picks, a checkbox (ADR 0182).
 */
function Row({
  row,
  onOpen,
  pick,
}: {
  readonly row: AgentRow;
  readonly onOpen: (id: string) => void;
  readonly pick?: RowPick | undefined;
}) {
  const waiting = waitingWords(row.held);
  const ring = RING[row.doing];
  return (
    <li {...leavingProps(pick)}>
      <button
        type="button"
        className="agent-row"
        data-testid={`agent-${row.id}`}
        {...pickProps(pick)}
        onClick={(event) => (pick?.active === true ? pick.onPick(event.shiftKey) : onOpen(row.id))}
      >
        <span className="agent-face">
          <PickMark pick={pick} />
          <Avatar
            name={row.name}
            kind="agent"
            size="sm"
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
          {row.doing === "working" && <span className="agent-working">Working · </span>}
          {row.line}
          {waiting !== undefined && <span className="agent-waiting">{waiting}</span>}
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
}: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly onOpen: (agentId: string) => void;
  /** Which folds are open, where the page that picks keeps them (ADR 0182). */
  readonly folds?: Folds | undefined;
  /** What each row is told about picking, drawn in its run, while the page can pick. */
  readonly pickOf?: ((row: AgentRow, run: string) => RowPick) | undefined;
  /** Rows archived, unarchived or deleted, held where they stood until they have gone. */
  readonly held?: readonly Leaving<AgentRow>[] | undefined;
}) {
  const tab = agentsTab(model, directory, selfId);
  const [archivedOpen, setArchived] = useState(false);
  const [elsewhereOpen, setElsewhere] = useState(false);
  const folds = told ?? {
    archived: archivedOpen,
    elsewhere: elsewhereOpen,
    onArchived: setArchived,
    onElsewhere: setElsewhere,
  };
  const { archived, elsewhere } = folds;
  const shown = (rows: readonly AgentRow[], run: string) =>
    keepLeaving(
      rows,
      held.filter((each) => each.run === run),
    );
  const leads = shown(tab.leads, "leads");
  const agents = shown(tab.agents, "agents");
  const here = shown(tab.archived.here, "here");
  const away = shown(tab.archived.elsewhere, "elsewhere");
  const count = here.length + away.length;
  // Under a guest's agents, whose they are (ADR 0196).
  const foot = guestAgentsWords(model, directory, selfId, tab);
  // A row, drawn in its run (`agentRun`).
  const row = (run: string) => (each: AgentRow) => (
    <Row key={each.id} row={each} onOpen={onOpen} pick={pickOf?.(each, run)} />
  );
  return (
    <div className="agents-sections">
      {leads.length > 0 && (
        // First, wearing the Main tag rather than under a heading of their own (ADR 0145).
        <section aria-label="Main agents">
          <ul className="agent-list">{leads.map(row("leads"))}</ul>
        </section>
      )}
      <section aria-label="Agents">
        <h2 className="agents-h">{`Agents · ${tab.agents.length}`}</h2>
        {agents.length === 0 ? (
          <p className="agents-empty">
            {emptyWords(leads.length > 0, mayOpenSpace(myRole(model, selfId)))}
          </p>
        ) : (
          <ul className="agent-list">{agents.map(row("agents"))}</ul>
        )}
        {foot !== undefined && (
          <p className="agents-empty" data-testid="agents-guest-foot">
            {foot}
          </p>
        )}
      </section>
      {count > 0 && (
        <section aria-label="Archived agents">
          <button
            type="button"
            className="agents-fold"
            aria-expanded={archived}
            data-testid="archived-agents"
            onClick={() => folds.onArchived(!archived)}
          >
            <span>{`Archived · ${count}`}</span>
            <span>{archived ? "Hide" : "Show"}</span>
          </button>
          {archived && (
            <>
              <ul className="agent-list">{here.map(row("here"))}</ul>
              {away.length > 0 && (
                <button
                  type="button"
                  className="agents-fold"
                  aria-expanded={elsewhere}
                  data-testid="archived-elsewhere"
                  onClick={() => folds.onElsewhere(!elsewhere)}
                >
                  <span>{`In spaces you're not in · ${away.length}`}</span>
                  <span>{elsewhere ? "Hide" : "Show"}</span>
                </button>
              )}
              {elsewhere && <ul className="agent-list">{away.map(row("elsewhere"))}</ul>}
            </>
          )}
        </section>
      )}
    </div>
  );
}

/** An agent's page: its card, then its message history, opening at the newest line. */
export function AgentPage({
  agentId,
  model,
  directory,
  selfId,
  files,
  faces,
  agents,
  onBack,
  onOpenRoom,
  onOpenAgent,
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
  readonly files: FileService;
  readonly faces: ReadonlyMap<string, SpaceIcon> | undefined;
  readonly agents: AgentsService;
  readonly onBack: () => void;
  readonly onOpenRoom: (spaceId: string) => void;
  /** Opens another agent's page: the one a copy was forked from. */
  readonly onOpenAgent?: ((agentId: string) => void) | undefined;
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
  const room = directory[agentId]?.room;
  const [stays, setStays] = useState<readonly AgentStay[] | undefined>(undefined);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again when the agent moves.
  useEffect(() => {
    let live = true;
    agents.stays(agentId).then(
      (read) => {
        if (live) setStays(read);
      },
      (error: unknown) => {
        if (live) setFailed(error instanceof Error ? error.message : "The server didn't say.");
      },
    );
    return () => {
      live = false;
    };
  }, [agents, agentId, room]);
  const card = agentCard(model, directory, selfId, agentId);
  const history = useMemo(
    () => (stays === undefined ? [] : agentHistory(model, directory, agentId, stays)),
    [stays, model, directory, agentId],
  );
  const scroller = useRef<HTMLDivElement>(null);
  // Like a room, it opens at the newest line, and stays there while the rows find their heights —
  // a row is laid out as it comes into view, so the history grows after it is drawn — until the
  // reader scrolls it themselves.
  useEffect(() => {
    const box = scroller.current;
    if (stays === undefined || box === null) return;
    let following = true;
    const pin = () => {
      if (following) box.scrollTop = box.scrollHeight;
    };
    const stop = () => {
      following = false;
    };
    pin();
    const watch = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(pin);
    if (box.firstElementChild !== null) watch?.observe(box.firstElementChild);
    box.addEventListener("wheel", stop, { passive: true });
    box.addEventListener("touchstart", stop, { passive: true });
    box.addEventListener("keydown", stop);
    return () => {
      watch?.disconnect();
      box.removeEventListener("wheel", stop);
      box.removeEventListener("touchstart", stop);
      box.removeEventListener("keydown", stop);
    };
  }, [stays]);
  // There from the card's first frame, with only its dates waiting on the server (`stayFact`).
  const stay = stayFact(card, stays, stays === undefined && failed === undefined);

  return (
    <main className="conv agent-page" aria-label={card.name}>
      <header className="conv-h">
        <div className="conv-h-t">
          <button type="button" className="agent-back" onClick={onBack}>
            ‹ Agents
          </button>
          <h1>{card.name}</h1>
        </div>
      </header>
      <CardSection
        agentId={agentId}
        card={card}
        stay={stay}
        model={model}
        directory={directory}
        selfId={selfId}
        agents={agents}
        onOpenRoom={onOpenRoom}
        onOpenAgent={onOpenAgent}
        onDeleted={onBack}
      >
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
      </CardSection>
      <div className="agent-scroll" ref={scroller}>
        <section className="agent-history" aria-label="Message history">
          <h2 className="agents-h">Message history</h2>
          {failed !== undefined && stays === undefined && <p className="agents-empty">{failed}</p>}
          {card.forkedFrom !== undefined && (
            <ForkedFrom
              from={card.forkedFrom}
              face={directory[card.forkedFrom.agentId]?.face}
              at={stays?.[0]?.from}
              onOpenAgent={onOpenAgent}
            />
          )}
          {stays !== undefined && stays.length === 0 && (
            <p className="agents-empty">
              Nothing yet. What it's asked and what it answers will be here.
            </p>
          )}
          {history.map((stretch, at) => (
            <Stretched
              // biome-ignore lint/suspicious/noArrayIndexKey: the stretches are in the log's order.
              key={at}
              stretch={stretch}
              model={model}
              directory={directory}
              selfId={selfId}
              files={files}
              faces={faces}
              onOpenRoom={onOpenRoom}
            />
          ))}
        </section>
      </div>
    </main>
  );
}

/**
 * Dates of the shape the server's will have, whose width the card's dates fact holds from its first
 * frame, so that the dates arriving move none of the facts after it (`.agent-fact-dates`). May is
 * the widest month's name, and the digits are tabular, so a date of this year never outgrows it;
 * one from another year, or a stay across two months, still does.
 */
const DATES_SAMPLE: Readonly<Record<StayFact["word"], string>> = {
  Since: "00 May",
  "Was there": "00–00 May",
};

/**
 * The card's name: the field for anybody who may rename it, the name alone for a guest, and while
 * its changes are locked the name alone with a small padlock beside it, so whoever reads the card
 * sees why it will not edit (ADR 0199).
 */
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
 * The card: its face and harness, where it is, since when, what it is doing, and what may be done;
 * then, for its harness's owner, the files it is built from (ADR 0135).
 */
function CardSection({
  agentId,
  card,
  stay,
  model,
  directory,
  selfId,
  agents,
  onOpenRoom,
  onOpenAgent,
  onDeleted,
  children,
}: {
  readonly agentId: string;
  readonly card: AgentCard;
  readonly stay: StayFact | undefined;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly agents: AgentsService;
  readonly onOpenRoom: (spaceId: string) => void;
  readonly onOpenAgent?: ((agentId: string) => void) | undefined;
  /** It was deleted from here (ADR 0095): the page steps back to the list. */
  readonly onDeleted: () => void;
  /** Beside the card's facts and acts, or under them in a narrow pane: its Context group (ADR 0135). */
  readonly children?: ReactNode;
}) {
  const from = card.forkedFrom;
  const owner = belongsTo(directory, agentId, selfId);
  return (
    <section className="agent-card" aria-label="Card" data-testid="agent-card">
      <Avatar
        name={card.name}
        kind="agent"
        size="lg"
        icon={card.face}
        {...(card.doing === "idle" ? {} : { status: card.doing })}
      />
      <div className="agent-card-words">
        <CardName card={card} rename={(next) => agents.rename(agentId, next)} />
        <div className="agent-card-sub" data-testid="agent-sub">
          {card.sub}
        </div>
        <div className="agent-facts">
          {card.room === undefined ? (
            <span className="agent-fact">No space</span>
          ) : card.room.readable ? (
            <button
              type="button"
              className="agent-fact agent-fact-room"
              data-testid="agent-room"
              onClick={() => onOpenRoom(card.room?.spaceId as string)}
            >
              {card.room.name}
              {card.room.archived ? " · archived" : ""} ›
            </button>
          ) : (
            <span className="agent-fact" data-testid="agent-room">
              {card.room.name}
            </span>
          )}
          {stay !== undefined && (
            <span className="agent-fact" data-testid="agent-stay">
              {stay.word}{" "}
              <span className="agent-fact-dates">
                <span className="agent-fact-sample" aria-hidden="true">
                  {DATES_SAMPLE[stay.word]}
                </span>
                <span data-testid="agent-stay-dates">{stay.dates}</span>
              </span>
            </span>
          )}
          {from !== undefined && (
            <button
              type="button"
              className="agent-fact agent-fact-room"
              data-testid="agent-forked-from"
              disabled={onOpenAgent === undefined}
              onClick={() => onOpenAgent?.(from.agentId)}
            >
              Forked from {from.name} ›
            </button>
          )}
          <span className="agent-fact" data-testid="agent-now">
            {card.now}
          </span>
          <Belongs owner={owner} />
          {card.held > 0 && (
            <span className="agent-fact agent-free" data-testid="agent-waiting">
              {`${card.held} waiting`}
            </span>
          )}
        </div>
        <HeldNote note={card.heldNote} />
        <Acts
          agentId={agentId}
          free={card.now === "Not in a space"}
          mayMove={card.mayMove}
          mayFork={card.mayFork}
          opens={mayOpenSpace(myRole(model, selfId))}
          name={card.name}
          model={model}
          directory={directory}
          agents={agents}
          onOpenRoom={onOpenRoom}
        />
        {keeps(card) && (
          <KeepActs
            agentId={agentId}
            card={card}
            model={model}
            directory={directory}
            selfId={selfId}
            agents={agents}
            onDeleted={onDeleted}
          />
        )}
        {card.note !== undefined && <p className="agent-note">{card.note}</p>}
      </div>
      {/* Empty, as for anybody but the harness's owner, it is not drawn (`:empty`). */}
      <div className="agent-card-side">{children}</div>
    </section>
  );
}

/** Under the card's facts, what their "1 waiting" is: who said it, and where it goes (`heldNote`). */
function HeldNote({ note }: { readonly note: string | undefined }) {
  if (note === undefined) return null;
  return (
    <p className="agent-held" data-testid="agent-waiting-note">
      {note}
    </p>
  );
}

/** Whether the card's foot has anything on it: Lock changes, Archive or Unarchive, or Delete…. */
function keeps(card: AgentCard): boolean {
  return card.mayLock || card.mayKeep || (card.archived && card.mayUnarchive);
}

/**
 * The card's foot: Lock changes over the buttons (ADR 0199), then archive or unarchive it, and
 * delete it (ADR 0095), the phone's swipe and card foot as buttons, asking first in the dialog the
 * room's panel uses — but Unarchive, which only puts it back. While its changes are locked core
 * offers neither Archive nor Delete, and the card's note says why; a locked agent that was
 * archived may still be unarchived.
 */
function KeepActs(props: {
  readonly agentId: string;
  readonly card: AgentCard;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly agents: AgentsService;
  readonly onDeleted: () => void;
}) {
  const { agentId, card, agents } = props;
  const [asking, setAsking] = useState<"archive" | "delete" | undefined>(undefined);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const refused = (error: unknown) =>
    setFailed(error instanceof Error ? error.message : "The server would not do it.");
  const unarchive = () => {
    setFailed(undefined);
    agents.archive(agentId, false).catch(refused);
  };
  const lock = async (locked: boolean) => {
    setFailed(undefined);
    setBusy(true);
    try {
      await agents.lock(agentId, locked);
      return true;
    } catch (error) {
      refused(error);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {card.mayLock && (
        <ul className="ctx-group agent-lock">
          <LockRow
            locked={card.locked}
            busy={busy}
            onLock={lock}
            testId="agent-lock"
            switchTestId="agent-lock-switch"
          />
        </ul>
      )}
      <div className="agent-keep">
        {card.archived && card.mayUnarchive && (
          <Button size="sm" onClick={unarchive} data-testid="unarchive-agent">
            Unarchive
          </Button>
        )}
        {!card.archived && card.mayKeep && (
          <Button size="sm" onClick={() => setAsking("archive")} data-testid="archive-agent">
            Archive
          </Button>
        )}
        {card.mayKeep && (
          <Button
            size="sm"
            variant="danger"
            onClick={() => setAsking("delete")}
            data-testid="delete-agent"
          >
            Delete…
          </Button>
        )}
        {failed !== undefined && (
          <p className="agent-failed" role="alert">
            {failed}
          </p>
        )}
      </div>
      {asking !== undefined && (
        <KeepAsking {...props} asking={asking} onDone={() => setAsking(undefined)} />
      )}
    </>
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

type Act = "put" | "move" | "fork";

/**
 * Move it, or put a free one in a room, and fork it where its harness makes copies (ADR 0087,
 * Fork): each a room picked from the reader's own, or for a free one or a copy a new one. Putting
 * one in a room is as moving it is, its harness's owner's or an owner's or admin's (ADR 0034's
 * addendum).
 */
function Acts(props: {
  readonly agentId: string;
  readonly free: boolean;
  readonly mayMove: boolean;
  readonly mayFork: boolean;
  /** Whether they may open a space, and so be offered a new room (ADR 0196). */
  readonly opens: boolean;
  readonly name: string;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly agents: AgentsService;
  readonly onOpenRoom: (spaceId: string) => void;
}) {
  // Put in a room as it would be moved (ADR 0034's addendum): its harness's owner's, or an
  // owner's or admin's.
  const acts: Act[] = [
    ...(props.mayMove ? [props.free ? ("put" as const) : ("move" as const)] : []),
    ...(props.mayFork ? ["fork" as const] : []),
  ];
  if (acts.length === 0) return null;
  return (
    <div className="agent-acts-all">
      {acts.map((act) => (
        <RoomAct key={act} act={act} {...props} />
      ))}
    </div>
  );
}

/** What each act says, and does with the room picked. */
const ACT_WORDS: Readonly<
  Record<Act, { readonly label: string; readonly button: string; readonly testId: string }>
> = {
  put: { label: "Put in a space", button: "Put it there", testId: "agent-put" },
  move: { label: "Move to another space", button: "Move", testId: "agent-move" },
  fork: { label: "Fork into a space", button: "Fork", testId: "agent-fork" },
};

function RoomAct(props: {
  readonly act: Act;
  readonly opens: boolean;
  readonly agentId: string;
  readonly name: string;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly agents: AgentsService;
  readonly onOpenRoom: (spaceId: string) => void;
}) {
  const { act, agentId, model, directory, agents } = props;
  const [target, setTarget] = useState("");
  const [failed, setFailed] = useState<string | undefined>(undefined);
  // One ask at a time: a second click while the first is on its way was a second room, a second
  // ask and a second copy (agents review, finding 20).
  const [busy, setBusy] = useState(false);
  const here = directory[agentId]?.room;
  const rooms = model.spaces
    .filter(
      (space) =>
        space.state === "open" &&
        space.kind !== "channel" &&
        space.home !== true &&
        space.parentSpaceId === undefined &&
        space.id !== here,
    )
    .sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));
  const words = ACT_WORDS[act];
  const go = async () => {
    if (target === "" || busy) return;
    setBusy(true);
    setFailed(undefined);
    try {
      const title = act === "fork" ? forkRoomTitle(directory, agentId) : props.name;
      props.onOpenRoom(await doAct(act, agents, agentId, title, target));
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "The server would not do it.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="agent-acts">
      <label className="agent-act-label">
        {words.label}
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          data-testid={words.testId}
        >
          <option value="">Choose a space…</option>
          {props.opens && act === "put" && (
            <option value="new">{`A new space with ${props.name}`}</option>
          )}
          {props.opens && act === "fork" && <option value="new">A new space with the copy</option>}
          {rooms.map((space) => (
            <option key={space.id} value={space.id}>
              {roomName(model, space.id, directory)}
            </option>
          ))}
        </select>
      </label>
      <Button onClick={() => void go()} disabled={target === "" || busy}>
        {words.button}
      </Button>
      {failed !== undefined && <p className="agent-failed">{failed}</p>}
    </div>
  );
}

/** Do an act into the room picked, or a new one, and say which room to open. */
async function doAct(
  act: Act,
  agents: AgentsService,
  agentId: string,
  name: string,
  target: string,
): Promise<string> {
  if (target === "new") {
    return act === "fork" ? agents.forkRoom(agentId, name) : agents.newRoom(agentId, name);
  }
  if (act === "put") agents.put(agentId, target);
  else if (act === "fork") await agents.fork(agentId, target);
  else await agents.move(agentId, target);
  return target;
}

/** Whose an agent is, when not the reader's (`belongsTo`, ADR 0196). */
function Belongs({ owner }: { readonly owner: string | undefined }) {
  if (owner === undefined) return null;
  return (
    <span className="agent-fact" data-testid="agent-belongs">
      {`${owner}'s`}
    </span>
  );
}

/** The head of a copy's history: the agent it was forked from, and when; opens its page. */
function ForkedFrom(props: {
  readonly from: { readonly agentId: string; readonly name: string };
  /** The original's own face, when one was chosen for it (ADR 0089). */
  readonly face: SpaceIcon | undefined;
  readonly at: string | undefined;
  readonly onOpenAgent?: ((agentId: string) => void) | undefined;
}) {
  const { from, at } = props;
  const when = at === undefined ? undefined : stretchDates(at, at).dates;
  return (
    <button
      type="button"
      className="agent-forked"
      data-testid="forked-from"
      disabled={props.onOpenAgent === undefined}
      onClick={() => props.onOpenAgent?.(from.agentId)}
    >
      <Avatar name={from.name} kind="agent" size="sm" icon={props.face} />
      <span className="agent-forked-words">
        <span>
          Forked from <strong>{from.name}</strong>
        </span>
        <span className="agent-forked-sub">
          {when === undefined ? "" : `${when}. `}What it knew before then is in {from.name}'s
          history.
        </span>
      </span>
      <span className="agent-forked-chev">›</span>
    </button>
  );
}

/** One stretch: its divider, then its room's lines, or a room the reader isn't in as a count. */
function Stretched(props: {
  readonly stretch: Stretch;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly files: FileService;
  readonly faces: ReadonlyMap<string, SpaceIcon> | undefined;
  readonly onOpenRoom: (spaceId: string) => void;
}) {
  const { stretch, model } = props;
  const { dates, ongoing } = stretchDates(stretch.from, stretch.to);
  if (stretch.kind === "away") {
    return (
      <div className="agent-stretch">
        <div className="agent-divider" data-testid="divider">
          <span className="agent-divider-pill">{`A space you're not in · ${dates}${ongoing ? " now" : ""}`}</span>
        </div>
        <p className="agent-away" data-testid="away-count">
          {awayWords(stretch.count)}
        </p>
      </div>
    );
  }
  return (
    <div className="agent-stretch">
      <div className="agent-divider" data-testid={stretch.now ? "divider-now" : "divider"}>
        <button
          type="button"
          className={stretch.now ? "agent-divider-pill agent-now" : "agent-divider-pill"}
          onClick={() => props.onOpenRoom(stretch.spaceId)}
        >
          <Avatar
            name={stretch.name}
            kind="person"
            size="xs"
            icon={props.faces?.get(stretch.spaceId)}
          />
          <b>{stretch.name}</b>
          {` · ${dates}`}
          {ongoing && <i> now</i>}
          {stretch.archived && " · archived"}
        </button>
      </div>
      {stretch.lines.length === 0 ? (
        <p className="agent-away">Nothing said here yet.</p>
      ) : (
        <div className="msgs agent-lines">
          {stretch.lines.map((line) => (
            <ReadOnlyRow
              key={line.id}
              line={line}
              lane={laneOf(model.lanes, line)}
              run={runOf(model, line)}
              faces={props.faces}
              directory={props.directory}
              selfId={props.selfId}
              files={props.files}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function laneOf(lanes: readonly Lane[], line: Line): Lane | undefined {
  return line.laneId === undefined ? undefined : lanes.find((lane) => lane.laneId === line.laneId);
}

function runOf(model: WorkspaceModel, line: Line): Run | undefined {
  if (line.runId === undefined) return undefined;
  for (const space of model.spaces) {
    const run = space.runs.find((each) => each.runId === line.runId);
    if (run !== undefined) return run;
  }
  return undefined;
}

/**
 * What the empty Agents section says. Under the Main agents listed above it, "No agents yet" said
 * the opposite of the page (the setup audit, 17 October 2026, M3): it says where more come from,
 * and the + only to whoever has one (ADR 0196).
 */
export function emptyWords(mainAgents: boolean, opens = true): string {
  if (!mainAgents) return "No agents yet. A harness's agents come when it connects.";
  return opens
    ? "None besides the Main agents yet. The + makes more, and so does Add in a space."
    : "None besides the Main agents yet. Add in a space makes more.";
}
