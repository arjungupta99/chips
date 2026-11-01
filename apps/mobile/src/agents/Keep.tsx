/**
 * Archiving, unarchiving and deleting an agent (ADR 0095), wherever the phone offers them: a row
 * pushed left on the Agents tab or the Archived page, and the foot of an agent's card (Arjun,
 * 2 October 2026: "I want the options on the card as well").
 *
 * The acts are Spaces' own — the same words, marks and colours (`SwipeRow`) — and Archive and
 * Delete ask first in the sheet Spaces' rows open (`ConfirmSheet`), with the agent on it and the
 * words core gives the desktop too. Unarchive does not ask: it only puts an agent back. Delete
 * waits for the server and says why it would not; for the one agent in its room, the sheet offers
 * to delete the room too, switched on.
 *
 * Who is offered them is core's (`mayKeepAgent`): the harness's owner, or an owner or admin of the
 * workspace, never for the Main agent.
 *
 * While an agent's changes are locked (ADR 0199) its row offers neither Archive nor Delete but
 * Locked, the graphite button a locked room's row slides on, which asks nothing: the row goes home
 * and the agent's card opens with its lock's row glowing, where the lock is let go. An archived one
 * that is locked still offers Unarchive, which only puts it back.
 */

import {
  agentArchiveAsking,
  agentDeleteAsking,
  agentLine,
  agentLocked,
  mayKeepAgent,
  mayLockAgent,
  mayUnarchiveAgent,
  nameOf,
  type AgentRow as Row,
  type Snapshot,
  type Store,
} from "@chipschat/core";
import { type ComponentProps, useCallback, useEffect, useRef, useState } from "react";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { ConfirmSheet } from "../spaces/ConfirmSheet";
import { actTone, type SpaceAct, SwipeRow } from "../spaces/SwipeRow";
import { Avatar } from "../ui/Avatar";
import * as feel from "../ui/haptics";
import { usePalette } from "../ui/theme";
import { AgentRow } from "./AgentRow";

/** What a swipe or the card asked for, until the sheet that asks first is answered. */
interface KeepAsk {
  readonly kind: "archive" | "delete";
  readonly agentId: string;
  /** The row the swipe left open behind the sheet; Cancel closes it. */
  readonly row?: SwipeableMethods | undefined;
}

/**
 * What an agent's row offers when pushed: Archive or Unarchive, and Delete; while its changes are
 * locked (ADR 0199), Locked, after Unarchive for an archived one; nothing if not theirs.
 */
export function keepActs(snapshot: Snapshot, selfId: string, agentId: string): SpaceAct[] {
  const { model, directory } = snapshot;
  if (!mayLockAgent(model, directory, selfId, agentId)) return [];
  const unarchive = mayUnarchiveAgent(model, directory, selfId, agentId);
  if (agentLocked(directory, agentId)) return unarchive ? ["unarchive", "locked"] : ["locked"];
  if (!mayKeepAgent(model, directory, selfId, agentId)) return [];
  return [unarchive ? "unarchive" : "archive", "delete"];
}

/** What a list or a card is told of what its acts did. */
export interface KeepOpeners {
  /** An agent is gone (ADR 0095), so a card showing it can step back. */
  readonly onDeleted?: ((agentId: string) => void) | undefined;
  /**
   * A locked agent's Locked was pressed (ADR 0199): open its card with the lock's row glowing,
   * pushed on a phone or beside the list on a wide screen, as the list decides.
   */
  readonly onLocked?: ((agentId: string) => void) | undefined;
}

/** The acts and the sheet, for a list of agents or one agent's card. */
export function useKeep(
  store: Store,
  snapshot: Snapshot,
  selfId: string,
  { onDeleted, onLocked }: KeepOpeners = {},
) {
  const [ask, setAsk] = useState<KeepAsk | undefined>(undefined);
  // The row a swipe has left open, if one has: another row coming open closes it.
  const openRow = useRef<SwipeableMethods | undefined>(undefined);
  const onOpened = useCallback((row: SwipeableMethods) => {
    if (openRow.current !== undefined && openRow.current !== row) openRow.current.close();
    openRow.current = row;
  }, []);
  const onClosed = useCallback((row: SwipeableMethods) => {
    if (openRow.current === row) openRow.current = undefined;
  }, []);
  // A row a swipe left open closes as the list starts picking (ADR 0182).
  const closeOpen = useCallback(() => {
    openRow.current?.close();
    openRow.current = undefined;
  }, []);
  const act = (kind: SpaceAct, agentId: string, row?: SwipeableMethods) => {
    if (kind === "locked") {
      // The row goes home, and the card opens where the lock is let go (ADR 0199).
      row?.close();
      onLocked?.(agentId);
      return;
    }
    if (kind !== "unarchive") {
      setAsk({ kind, agentId, row });
      return;
    }
    row?.close();
    store.setAgentArchived(agentId, false).then(feel.success, feel.warning);
  };
  const sheet = (
    <KeepSheet
      store={store}
      snapshot={snapshot}
      selfId={selfId}
      ask={ask}
      onDone={() => setAsk(undefined)}
      onDeleted={onDeleted}
    />
  );
  return {
    acts: (agentId: string): readonly SpaceAct[] => keepActs(snapshot, selfId, agentId),
    act,
    onOpened,
    onClosed,
    closeOpen,
    sheet,
  };
}

export type Keep = ReturnType<typeof useKeep>;

/**
 * An agent's row that a thumb can push left for its acts, when the reader may (ADR 0095). Still
 * while the list picks, or while the row is on its way out (ADR 0182).
 */
export function KeepRow({
  keep,
  row,
  still = false,
  ...rest
}: {
  /** What it offers and does: a list's own (`useKeep`), or what a row of it was handed. */
  readonly keep: Pick<Keep, "acts" | "act" | "onOpened" | "onClosed">;
  readonly row: Row;
  readonly still?: boolean;
} & Omit<ComponentProps<typeof AgentRow>, "row" | "acts" | "onAct">) {
  const palette = usePalette();
  const acts = keep.acts(row.id);
  return (
    <SwipeRow
      acts={acts}
      palette={palette}
      onAct={(act, swiped) => keep.act(act, row.id, swiped)}
      onOpen={keep.onOpened}
      onClose={keep.onClosed}
      enabled={!still}
      testID={`swipe-agent-${row.id}`}
    >
      <AgentRow row={row} acts={acts} onAct={(act, id) => keep.act(act, id)} {...rest} />
    </SwipeRow>
  );
}

/** Why an agent was not archived or deleted, in words worth reading. */
function notDone(kind: KeepAsk["kind"], error: unknown): string {
  return `${kind === "archive" ? "Not archived" : "Not deleted"}: ${whyNotKept(error)}`;
}

/** Why the server would not archive or delete an agent, after "not archived" or "not deleted". */
export function whyNotKept(error: unknown): string {
  const said = error instanceof Error ? error.message : "";
  if (/no route matches/i.test(said))
    return "this server is older than the app, and cannot do that yet.";
  return said === "" ? "the server would not do it." : said;
}

/**
 * The sheet that asks before Archive and Delete. It holds the agent past the close, so the sheet
 * can still name it while it slides away, and unmounts when the exit is done (`Sheet`).
 */
function KeepSheet({
  store,
  snapshot,
  selfId,
  ask,
  onDone,
  onDeleted,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly ask: KeepAsk | undefined;
  readonly onDone: () => void;
  readonly onDeleted?: ((agentId: string) => void) | undefined;
}) {
  const palette = usePalette();
  const [showing, setShowing] = useState<KeepAsk | undefined>(ask);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  // Whether the room it is the one agent in goes with it (ADR 0095, point 4): on until turned off.
  const [roomToo, setRoomToo] = useState(true);
  useEffect(() => {
    if (ask === undefined) return;
    setShowing(ask);
    setFailed(undefined);
    setRoomToo(true);
  }, [ask]);
  if (showing === undefined) return null;
  const { kind, agentId, row } = showing;
  const { model, directory } = snapshot;
  const asking =
    kind === "archive"
      ? agentArchiveAsking(model, directory, agentId)
      : agentDeleteAsking(model, directory, selfId, agentId);
  const cancel = () => {
    row?.close();
    onDone();
  };
  const confirm = async () => {
    setBusy(true);
    setFailed(undefined);
    try {
      if (kind === "archive") await store.setAgentArchived(agentId, true);
      else
        await store.deleteAgent(agentId, { deleteRoom: asking.roomToo !== undefined && roomToo });
      if (kind === "archive") feel.success();
      else feel.warning();
      onDone();
      if (kind === "delete") onDeleted?.(agentId);
    } catch (error) {
      setFailed(notDone(kind, error));
    } finally {
      setBusy(false);
    }
  };
  const name = nameOf(directory, agentId);
  const agent = directory[agentId];
  return (
    <ConfirmSheet
      open={ask !== undefined}
      onClose={cancel}
      onGone={() => setShowing(undefined)}
      room={{
        face: <Avatar name={name} kind="agent" size="row" icon={agent?.face} decorative />,
        name,
        last: agentLine(model, directory, selfId, agentId),
      }}
      confirming={{ asking, tone: actTone(kind, palette), busy, failed }}
      onConfirm={() => void confirm()}
      too={{ on: roomToo, onChange: setRoomToo }}
    />
  );
}
