/**
 * An agent's message history (ADR 0087, rule 3.11, Phase 5), on a page of its own over its card,
 * as the phone pushes it from the card's Message history row (ADR 0270): a stretch for each room it
 * was in, its divider opening the room, and that room's lines, or a count for a room the reader
 * isn't in; a copy's begins with what it was forked from. It opens at the newest line and stays
 * there while the rows find their heights, until the reader scrolls it themselves. Until ADR 0270 it
 * stood under the card on the same page, in whatever height the card left it.
 */

import {
  type AgentStay,
  agentCard,
  agentHistory,
  awayWords,
  type Directory,
  type Lane,
  type Line,
  type Run,
  type Stretch,
  staysFailedWords,
  stretchDates,
  type WorkspaceModel,
} from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { Avatar } from "@chipschat/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FileService } from "../files.ts";
import { ReadOnlyRow } from "../SpaceView.tsx";
import type { AgentsService } from "./service.ts";

/**
 * The rooms an agent has been in, read from the server: undefined until it answers, and why it
 * didn't, in words worth reading. Read again when the agent moves, which the directory says.
 */
export function useStays(
  agents: AgentsService,
  agentId: string,
  room: string | null | undefined,
): { readonly stays: readonly AgentStay[] | undefined; readonly failed: string | undefined } {
  const [read, setRead] = useState<{
    readonly stays: readonly AgentStay[] | undefined;
    readonly failed: string | undefined;
  }>({ stays: undefined, failed: undefined });
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again when the agent moves.
  useEffect(() => {
    let live = true;
    agents.stays(agentId).then(
      (stays) => {
        if (live) setRead({ stays, failed: undefined });
      },
      (error: unknown) => {
        if (live) setRead((was) => ({ stays: was.stays, failed: staysFailedWords(error) }));
      },
    );
    return () => {
      live = false;
    };
  }, [agents, agentId, room]);
  return read;
}

export function AgentHistory(props: {
  readonly agentId: string;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly files: FileService;
  readonly faces: ReadonlyMap<string, SpaceIcon> | undefined;
  readonly agents: AgentsService;
  readonly backLabel: string;
  readonly onBack: () => void;
  readonly onOpenRoom: (spaceId: string) => void;
  readonly onOpenAgent?: ((agentId: string) => void) | undefined;
}) {
  const { agentId, model, directory } = props;
  const { stays, failed } = useStays(props.agents, agentId, directory[agentId]?.room);
  const from = agentCard(model, directory, props.selfId, agentId).forkedFrom;
  const history = useMemo(
    () => (stays === undefined ? [] : agentHistory(model, directory, agentId, stays)),
    [stays, model, directory, agentId],
  );
  const scroller = useFollowsNewest(stays);
  return (
    <main className="conv agent-page" aria-label={`${props.backLabel}: Message history`}>
      <header className="conv-h">
        <div className="conv-h-t">
          <button type="button" className="agent-back" onClick={props.onBack}>
            {`‹ ${props.backLabel}`}
          </button>
          <h1>Message history</h1>
        </div>
      </header>
      <div className="agent-scroll" ref={scroller}>
        <section className="agent-history" aria-label="Message history">
          {failed !== undefined && stays === undefined && <p className="agents-empty">{failed}</p>}
          {from !== undefined && (
            <ForkedFrom
              from={from}
              face={directory[from.agentId]?.face}
              at={stays?.[0]?.from}
              onOpenAgent={props.onOpenAgent}
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
              selfId={props.selfId}
              files={props.files}
              faces={props.faces}
              onOpenRoom={props.onOpenRoom}
            />
          ))}
        </section>
      </div>
    </main>
  );
}

/**
 * Like a room, the history opens at the newest line, and stays there while the rows find their
 * heights — a row is laid out as it comes into view, so the history grows after it is drawn —
 * until the reader scrolls it themselves.
 */
function useFollowsNewest(stays: readonly AgentStay[] | undefined) {
  const scroller = useRef<HTMLDivElement>(null);
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
  return scroller;
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
