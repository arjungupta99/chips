/**
 * Picking rooms on the rail to archive, unarchive or delete them together (ADR 0181; Arjun, 17
 * October 2026: "add Select to the web and Mac too"), as the phone's Spaces list picks them: the
 * open rooms and the archived ones shown, never a locked room or the Main room (core's `mayPick`).
 * Archive asks once; Unarchive, where every room picked is archived, puts them back at once, as a
 * swipe's does; Delete asks, with one switch for the rooms' lone agents, and asks the server about
 * every room at once.
 * Read (ADR 0181 addendum, 18 October 2026) reads every room with nothing picked, locked, Main and
 * archived ones too, or the picked ones, at once, and picking ends.
 */

import {
  archiveManyAsking,
  type Batch,
  batchOf,
  type Directory,
  eraseManyAsking,
  mayPick,
  type ReadState,
  type Space,
  unreadCount,
  type WorkspaceModel,
  whyNotPicked,
} from "@chipschat/core";
import { useEffect, useState } from "react";
import { type BatchAsk, BatchDialog } from "./BatchDialog.tsx";
import type { Act } from "./PickParts.tsx";
import { usePick } from "./usePick.ts";

/** What the rail does to a room through the store. */
export interface RoomActs {
  /** Archive a room, or bring it back (ADR 0066). */
  readonly archive: (spaceId: string, archived: boolean) => void;
  /** Delete a room, its one agent with it when asked (ADR 0067, ADR 0087); rejects with why. */
  readonly erase: (spaceId: string, options: { readonly deleteAgent: boolean }) => Promise<void>;
  /** Read rooms as far as opening each would (ADR 0181 addendum). */
  readonly read: (spaceIds: readonly string[]) => void;
}

const NO_BATCH: Batch = { archive: [], unarchive: [], erase: [] };
/** How long the rail's counts read away are taken to be one wave (`.side[data-wave]`). */
const WAVE_MS = 1000;

export function useRoomPicking({
  model,
  directory,
  readState,
  selfId,
  rooms,
  visible,
  hidden,
  acts,
  titleOf,
}: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly readState: ReadState;
  readonly selfId: string | undefined;
  /** Every room the rail lists, open and archived. */
  readonly rooms: readonly Space[];
  /** The rooms shown now, in the rail's order. */
  readonly visible: readonly Space[];
  /** The rooms the reader hid (ADR 0205), which stand in a run of their own. */
  readonly hidden?: ReadonlySet<string> | undefined;
  /** Nothing to act through, and nothing may be picked. */
  readonly acts: RoomActs | undefined;
  readonly titleOf: (space: Space) => string;
}) {
  const [ask, setAsk] = useState<BatchAsk<Space> | undefined>(undefined);
  const may = (space: Space) =>
    acts !== undefined && selfId !== undefined && mayPick(model, space, selfId);
  const pick = usePick({
    items: rooms,
    visible,
    may,
    whyNot: (space) => whyNotPicked(space, titleOf(space)),
    runOf: (space) =>
      space.state === "closed" ? "closed" : hidden?.has(space.id) === true ? "hidden" : "open",
  });
  const { chosen, picking, stop, hold, go, land, letGo } = pick;
  const batch = selfId === undefined ? NO_BATCH : batchOf(model, chosen, selfId);
  // Nothing left to pick from, as another device archived or deleted the last of it: it stops.
  const none = !rooms.some(may);
  useEffect(() => {
    if (picking && none) stop();
  }, [picking, none, stop]);
  const unarchive = () => {
    // At once, as a swipe's Unarchive is: it only puts rooms back. Each row folds out of
    // Archived and unfolds where it lands among the open rooms.
    const going = batch.unarchive;
    hold(going, "archive", "going");
    land(going);
    for (const space of going) acts?.archive(space.id, false);
    stop();
  };
  const onlyUnarchive = batch.archive.length === 0 && batch.unarchive.length > 0;
  const left: Act = onlyUnarchive
    ? { act: "unarchive", count: batch.unarchive.length, onClick: unarchive }
    : {
        act: "archive",
        count: batch.archive.length,
        onClick: () => setAsk({ kind: "archive", going: batch.archive, staying: [] }),
      };
  const erase: Act = {
    act: "delete",
    count: batch.erase.length,
    onClick: () =>
      setAsk({
        kind: "delete",
        going: batch.erase,
        staying: chosen.filter((space) => !batch.erase.includes(space)),
      }),
  };
  const all = chosen.length === 0;
  const reading = (all ? rooms : chosen).filter((space) => unreadCount(space, readState) > 0);
  // The counts read away go down the rail a beat a row, for as long as they take to go.
  const [wave, setWave] = useState(false);
  useEffect(() => {
    if (!wave) return;
    const ends = setTimeout(() => setWave(false), WAVE_MS);
    return () => clearTimeout(ends);
  }, [wave]);
  const read: Act = {
    act: "read",
    all,
    count: reading.length,
    onClick: () => {
      setWave(true);
      acts?.read(reading.map((space) => space.id));
      stop();
    },
  };
  const named = (space: Space) => ({ space, name: titleOf(space) });
  const dialog =
    ask === undefined || acts === undefined || selfId === undefined ? null : (
      <BatchDialog<Space>
        ask={ask}
        asking={(kind, going, staying) =>
          kind === "archive"
            ? archiveManyAsking(going.map(named), directory)
            : eraseManyAsking(going.map(named), staying.map(named), directory, selfId)
        }
        nameOf={titleOf}
        act={(kind, space, plan) =>
          kind === "archive"
            ? acts.archive(space.id, true)
            : acts.erase(space.id, {
                deleteAgent:
                  plan.too && plan.asking.agentsToo?.spaceIds.includes(space.id) === true,
              })
        }
        onCancel={() => setAsk(undefined)}
        onActing={(going) => {
          hold(going, ask.kind, "held");
          // Archived, a row unfolds under Archived as it gets there, which is at once.
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
  return { ...pick, read, wave, left, erase, dialog };
}
