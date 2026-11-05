/**
 * Which room an agent goes to, from its card's Put, Move and Fork rows (ADR 0087, Phase 5), in a
 * dialog grown out of the row, as the phone's sheet (`RoomPicker`; here since ADR 0270): its title
 * and a line on what the act does to the agent, a new space for whoever may open one, and the
 * reader's rooms with their faces. A click acts. Until ADR 0270 it was a menu and a button beside
 * each act, with nothing said about what moving or forking does.
 *
 * An agent is in one room at a time, so a move takes it out of the one it is in; a free agent's
 * waiting words are said in the room it joins; a fork's copy joins the room picked, named as the
 * copy will be when it is a new one, and the agent stays where it is. Never a Main room (rule 7).
 */

import {
  type Directory,
  forkRoomTitle,
  mayOpenSpace,
  myRole,
  pickableRooms,
  type RoomPick,
  roomName,
  roomPickWords,
  type WorkspaceModel,
} from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { Avatar, Icon } from "@chipschat/ui";
import { useId, useRef, useState } from "react";
import { GrowingDialog } from "../GrowingDialog.tsx";
import type { AgentsService } from "./service.ts";

export function RoomPickDialog(props: {
  readonly mode: RoomPick;
  readonly from: HTMLElement;
  readonly agentId: string;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly faces: ReadonlyMap<string, SpaceIcon> | undefined;
  readonly agents: AgentsService;
  readonly onOpenRoom: (spaceId: string) => void;
  readonly onClosed: () => void;
}) {
  const { mode, agentId, model, directory } = props;
  const titleId = useId();
  const [leaving, setLeaving] = useState(false);
  // One ask at a time: a second click while the first is on its way was a second room, a second
  // ask and a second copy (agents review, finding 20).
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const opened = useRef<string | undefined>(undefined);
  const name = directory[agentId]?.displayName ?? "It";
  const here = directory[agentId]?.room ?? undefined;
  // What the dialog shows, held while it is up: the pick changes the rooms and the copy's name.
  const [shown] = useState(() => ({
    rooms: pickableRooms(model.spaces, here),
    words: roomPickWords(mode, name, roomName(model, here, directory)),
    copyTitle: forkRoomTitle(directory, agentId),
  }));
  // A new room is for whoever may open one: an owner or an admin (ADR 0196); never for a move.
  const fresh = mode !== "move" && mayOpenSpace(myRole(model, props.selfId));
  const leave = () => {
    if (!busy) setLeaving(true);
  };
  const ask = async (target: string | "new") => {
    if (busy) return;
    setBusy(true);
    setFailed(undefined);
    try {
      opened.current = await act(mode, props.agents, agentId, target, {
        name,
        copy: shown.copyTitle,
      });
      setBusy(false);
      setLeaving(true);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "The server would not do it.");
      setBusy(false);
    }
  };
  return (
    <GrowingDialog
      from={props.from}
      labelledBy={titleId}
      className="room-pick"
      testId="room-picker"
      focus=".room-pick-row"
      leaving={leaving}
      onLeave={leave}
      onGone={() => {
        const spaceId = opened.current;
        props.onClosed();
        if (spaceId !== undefined) props.onOpenRoom(spaceId);
      }}
    >
      <div className="room-pick-card">
        <div className="new-space-head">
          <h2 id={titleId}>{shown.words.title}</h2>
          <button type="button" className="new-space-close" aria-label="Close" onClick={leave}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <p className="room-pick-hint">{shown.words.hint}</p>
        {fresh && (
          <ul className="ctx-group">
            <li>
              <button
                type="button"
                className="ctx-row room-pick-row"
                disabled={busy}
                onClick={() => void ask("new")}
                data-testid="picker-new"
              >
                <span className="ctx-tile room-pick-plus" aria-hidden="true">
                  <Icon name="plus" size={16} />
                </span>
                <span className="ctx-row-words">
                  <span className="ctx-row-title">
                    {mode === "fork" ? "A new space with the copy" : "A new space with it"}
                  </span>
                  <span className="ctx-row-line">
                    {`Named ${mode === "fork" ? shown.copyTitle : name}`}
                  </span>
                </span>
              </button>
            </li>
          </ul>
        )}
        <h3 className="agents-h room-pick-h">Your spaces</h3>
        {shown.rooms.length === 0 ? (
          <p className="room-pick-hint">No other space is open.</p>
        ) : (
          <ul className="ctx-group room-pick-list">
            {shown.rooms.map((space) => {
              const title = roomName(model, space.id, directory);
              return (
                <li key={space.id}>
                  <button
                    type="button"
                    className="ctx-row room-pick-row"
                    disabled={busy}
                    onClick={() => void ask(space.id)}
                    data-testid={`picker-${space.id}`}
                  >
                    <Avatar
                      name={title}
                      kind="person"
                      size="sm"
                      icon={props.faces?.get(space.id)}
                    />
                    <span className="ctx-row-title">{title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {failed !== undefined && (
          <p className="harness-add-error" role="alert" data-testid="picker-failed">
            {failed}
          </p>
        )}
      </div>
    </GrowingDialog>
  );
}

/** Do the act into the room picked, or a new one, and say which room to open. */
async function act(
  mode: RoomPick,
  agents: AgentsService,
  agentId: string,
  target: string | "new",
  names: { readonly name: string; readonly copy: string },
): Promise<string> {
  if (target === "new") {
    return mode === "fork"
      ? agents.forkRoom(agentId, names.copy)
      : agents.newRoom(agentId, names.name);
  }
  if (mode === "put") agents.put(agentId, target);
  else if (mode === "fork") await agents.fork(agentId, target);
  else await agents.move(agentId, target);
  return target;
}
