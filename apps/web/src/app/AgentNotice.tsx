/**
 * What a room says above its composer about its agents (ADR 0087, rules 4 and 10), in the
 * phone's words (`noAgentNotice`, `roomAgents` in core): in amber, as *can't answer* is, when no
 * agent is left in it — who went where, and that messages reach people only — with Move back;
 * and a row for each agent its archive released that is in another room now. Where the agent's
 * harness makes copies, each offers Fork too (ADR 0087, Fork), which asks first.
 */

import {
  type Directory,
  harnessOf,
  mayForkInto,
  mayMove,
  nameOf,
  noAgentNotice,
  roomAgents,
  roomName,
  type Space,
  type WorkspaceModel,
} from "@chipschat/core";
import { Avatar, Button } from "@chipschat/ui";
import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

export function AgentNotice({
  space,
  directory,
  model,
  selfId,
  onMove,
  onFork,
}: {
  readonly space: Space;
  readonly directory: Directory;
  readonly model: WorkspaceModel;
  readonly selfId: string;
  /** Move an agent back into this room; rejects with the server's reason. */
  readonly onMove: (agentId: string) => Promise<void>;
  /** Ask for a copy of an agent in this room; rejects with the server's reason. */
  readonly onFork?: ((agentId: string) => Promise<void>) | undefined;
}) {
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const [forking, setForking] = useState<string | undefined>(undefined);
  const notice = noAgentNotice(model, space, directory);
  const { elsewhere } = roomAgents(space, directory);
  if (space.state !== "open" || (notice === undefined && elsewhere.length === 0)) return null;
  const back = (agentId: string) => {
    setFailed(undefined);
    onMove(agentId).catch((error: unknown) => {
      setFailed(error instanceof Error ? error.message : "The server would not move it.");
    });
  };
  const movable = notice?.moveBack;
  const forkable = (agentId: string) =>
    onFork !== undefined && mayForkInto(model, directory, selfId, agentId, space);
  return (
    <div className="agent-notices">
      {forking !== undefined && onFork !== undefined && (
        <ConfirmDialog
          asking={forkAsking(directory, model, forking)}
          danger={false}
          tooOld="Not asked: this server is older than the app, and cannot fork an agent yet."
          onCancel={() => setForking(undefined)}
          onConfirm={async () => {
            await onFork(forking);
            setForking(undefined);
          }}
        />
      )}
      {notice !== undefined && (
        <div className="no-agent" role="status" data-testid="no-agent">
          <strong>{notice.title}</strong>
          <p>{notice.body}</p>
          {movable !== undefined && mayMove(model, directory, selfId, movable) && (
            <Button size="sm" onClick={() => back(movable)}>
              Move back
            </Button>
          )}
          {movable !== undefined && forkable(movable) && (
            <Button size="sm" onClick={() => setForking(movable)}>
              Fork
            </Button>
          )}
        </div>
      )}
      {elsewhere.map(({ agentId, spaceId }) => (
        <div key={agentId} className="elsewhere" data-testid="elsewhere">
          <Avatar
            name={nameOf(directory, agentId)}
            kind="agent"
            icon={directory[agentId]?.face}
            size="xs"
          />
          <span>
            <strong>
              {nameOf(directory, agentId)} is in {roomName(model, spaceId, directory)}
            </strong>{" "}
            It's in one space at a time.
          </span>
          {mayMove(model, directory, selfId, agentId) && (
            <Button size="sm" onClick={() => back(agentId)}>
              Move back
            </Button>
          )}
          {forkable(agentId) && (
            <Button size="sm" onClick={() => setForking(agentId)}>
              Fork
            </Button>
          )}
        </div>
      ))}
      {failed !== undefined && (
        <p className="confirm-failed" role="alert">
          {failed}
        </p>
      )}
    </div>
  );
}

/** What Fork asks first, in the phone's words. */
function forkAsking(directory: Directory, model: WorkspaceModel, agentId: string) {
  const name = nameOf(directory, agentId);
  const where = roomName(model, directory[agentId]?.room, directory);
  return {
    title: `Fork ${name} here?`,
    body: `A copy joins this space, remembering everything up to now. ${name} stays in ${where}. From then on, the two remember separately.`,
    note: `${nameOf(directory, harnessOf(directory, agentId))} makes the copy, and the space says when it joins.`,
    confirm: "Fork",
  };
}
