/**
 * Picking agents on the Agents page to archive, unarchive or delete them together (ADR 0182;
 * Arjun, 17 October 2026: "add Select to the web and Mac too"), as the phone's Agents tab and its
 * Archived page pick theirs: never a Main agent, nor another's agent for somebody who may not change
 * it, nor one whose changes are locked (core's `mayPickAgent`; ADR 0199), which steps back and says
 * why when clicked, as a locked room on the rail does. The page's archived agents fold under it
 * rather than on a page of their own, so it picks them too, and the bar's first act is the Spaces
 * list's: Archive, or Unarchive where every agent picked is archived, which puts them back at once.
 * Archive and Delete ask first, Delete with one switch for the rooms the agents leave empty. Every
 * agent is asked of the server at once, but a room's agents one at a time (`agentLane`), a shared
 * room going with the last of them (`roomGoesWith`).
 */

import {
  type AgentRow,
  agentHintWords,
  agentLane,
  agentLocked,
  agentsArchiveAsking,
  agentsDeleteAsking,
  type Directory,
  mayLockAgent,
  mayPickAgent,
  roomGoesWith,
  type WorkspaceModel,
  whyNotPickedAgent,
} from "@chipschat/core";
import { useEffect, useState } from "react";
import { type BatchAsk, BatchDialog } from "./BatchDialog.tsx";
import type { Act } from "./PickParts.tsx";
import { usePick } from "./usePick.ts";

/** What the page does to an agent through the store (`AgentsService`). */
export interface AgentActs {
  /** Archive an agent, or bring it back (ADR 0095); rejects with the server's reason. */
  readonly archive: (agentId: string, archived: boolean) => Promise<void>;
  /** Delete an agent, and its room with it when asked (ADR 0095); rejects with the reason. */
  readonly remove: (agentId: string, options: { readonly deleteRoom: boolean }) => Promise<void>;
}

export function useAgentPicking({
  model,
  directory,
  selfId,
  items,
  visible,
  runOf,
  acts,
}: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  /** Every agent the page lists, shown or folded away. */
  readonly items: readonly AgentRow[];
  /** The agents shown now, in the page's order. */
  readonly visible: readonly AgentRow[];
  /** Which run of rows an agent stands in, where it is held as it goes. */
  readonly runOf: (row: AgentRow) => string;
  /** Nothing to act through, and nothing may be picked. */
  readonly acts: AgentActs | undefined;
}) {
  const [ask, setAsk] = useState<BatchAsk<AgentRow> | undefined>(undefined);
  const may = (row: AgentRow) =>
    acts !== undefined && mayPickAgent(model, directory, selfId, row.id);
  const pick = usePick({
    items,
    visible,
    may,
    whyNot: (row) => whyNotPickedAgent(directory, row),
    runOf,
  });
  const { chosen, picking, stop, hold, go, land, letGo } = pick;
  const none = !items.some(may);
  useEffect(() => {
    if (picking && none) stop();
  }, [picking, none, stop]);
  const putAway = chosen.filter((row) => !row.archived);
  const back = chosen.filter((row) => row.archived);
  // At once, as a swipe's Unarchive is: each row is held where it stood and folds away as the
  // server says it is back; one the server refuses stays.
  const unarchive = () => {
    const going = back;
    hold(going, "archive", "held");
    land(going);
    stop();
    void Promise.allSettled(going.map((row) => acts?.archive(row.id, false))).then((results) => {
      const done = going.filter((_, at) => results[at]?.status === "fulfilled");
      letGo(going.filter((row) => !done.includes(row)).map((row) => row.id));
      go(done.map((row) => row.id));
    });
  };
  const onlyUnarchive = putAway.length === 0 && back.length > 0;
  const left: Act = onlyUnarchive
    ? { act: "unarchive", count: back.length, onClick: unarchive }
    : {
        act: "archive",
        count: putAway.length,
        onClick: () => setAsk({ kind: "archive", going: putAway, staying: [] }),
      };
  const erase: Act = {
    act: "delete",
    count: chosen.length,
    onClick: () => setAsk({ kind: "delete", going: chosen, staying: [] }),
  };
  const ids = (rows: readonly AgentRow[]) => rows.map((row) => row.id);
  const dialog =
    ask === undefined || acts === undefined ? null : (
      <BatchDialog<AgentRow>
        ask={ask}
        asking={(kind, going) =>
          kind === "archive"
            ? agentsArchiveAsking(model, directory, ids(going))
            : agentsDeleteAsking(model, directory, selfId, ids(going))
        }
        nameOf={(row) => row.name}
        act={(kind, row, plan) => {
          if (kind === "archive") return acts.archive(row.id, true);
          const rooms = plan.too ? (plan.asking.roomsToo?.spaceIds ?? []) : [];
          return acts.remove(row.id, {
            deleteRoom: roomGoesWith(directory, ids(plan.going), rooms).has(row.id),
          });
        }}
        lane={(row) => agentLane(directory, row.id)}
        onCancel={() => setAsk(undefined)}
        onActing={(going) => {
          hold(going, ask.kind, "held");
          if (ask.kind === "archive") land(going);
        }}
        onDone={(done, refused) => {
          letGo(refused);
          go(done);
          // The dialog stays up with what was refused, and the rows that went go behind it.
          if (refused.length > 0) return;
          setAsk(undefined);
          stop();
        }}
      />
    );
  return {
    ...pick,
    left,
    erase,
    dialog,
    hint: agentHintWords(
      visible.some((row) => row.lead),
      // Others' agents are the ones this person may not change at all: one of their own that is
      // locked can't be picked either (ADR 0199), but it is not somebody else's, and its click
      // says why.
      visible.some((row) => !row.lead && !mayLockAgent(model, directory, selfId, row.id)),
      visible.some(
        (row) => agentLocked(directory, row.id) && mayLockAgent(model, directory, selfId, row.id),
      ),
    ),
  };
}
