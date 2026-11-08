/**
 * Picking agents on the Agents tab to archive or delete them together (ADR 0182; Arjun, 16 October
 * 2026: "we need the select option in the Agent tab as well, for the agents (not harnesses)").
 *
 * It is the Spaces list's picking (ADR 0181, `usePick`), over agents: Select beside the tab's name,
 * each agent's row a checkbox, the tab bar and the gold + stepping aside for a bar of Archive and
 * Delete. A Main agent can't be picked, nor another's agent for somebody who may not change it
 * (`mayPickAgent`, the swipe's own rule); the harnesses, and the rows that open other pages, step
 * back. Archive asks once, as an agent's swipe asks; Delete asks, with one switch for the rooms
 * the agents leave empty. Every agent is asked of the server at once, but a room's agents one at a
 * time (`agentLane`), a shared room going with the last of them (`roomGoesWith`). Both wait for
 * the server, and what it refuses stays on the sheet, with why.
 *
 * A locked agent can't be picked either (ADR 0199), as a locked room can't be on Spaces (ADR
 * 0181): its circle is Locked's padlock, and pressed, it says to unlock it on its card.
 *
 * The Archived page picks its agents the same way (Arjun, 16 October 2026: "add Select to the
 * Archived page too"), with Unarchive in Archive's place: at once, as a swipe's Unarchive is, since
 * it only puts agents back, and each row folds away as the server says it is back.
 */

import {
  type AgentRow,
  agentLane,
  agentLine,
  agentLocked,
  agentsArchiveAsking,
  agentsDeleteAsking,
  type Directory,
  mayPickAgent,
  roomGoesWith,
  type Snapshot,
  type Store,
  whyNotPickedAgent,
} from "@chipschat/core";
import { type ReactNode, useCallback, useState } from "react";
import type { Who } from "../spaces/ConfirmSheet";
import { Eraser } from "../spaces/Dust";
import { agentHintWords, listed } from "../spaces/picking";
import { type BatchAsk, BatchSheet, FaceStack } from "../spaces/Selecting";
import { Fold as FoldAway, type PickMark } from "../spaces/SelectMotion";
import { type Picking, usePick } from "../spaces/usePick";
import { Avatar, avatarCorner, faceGround } from "../ui/Avatar";
import type { SheetFrom } from "../ui/beside";
import * as feel from "../ui/haptics";
import { usePalette } from "../ui/theme";
import type { RowPick } from "./AgentRow";
import { whyNotKept } from "./Keep";

type Kind = BatchAsk<AgentRow>["kind"];

export function useAgentPicking({
  store,
  snapshot,
  selfId,
  items,
  visible,
  runOf,
  archived = false,
  closeRow,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  /** Every agent the list has, shown or folded away; a Main agent can't be picked. */
  readonly items: readonly AgentRow[];
  /** The agents shown now, which Select all picks. */
  readonly visible: readonly AgentRow[];
  /**
   * Which run of rows an agent stands in, which is where a row going is held: the Main agents
   * stand above the rest on the Agents tab, and counted with them a row stood four rows low as it
   * went (the simulator, 16 October 2026).
   */
  readonly runOf: (row: AgentRow) => string;
  /** The Archived page: Unarchive, at once, where the Agents tab has Archive. */
  readonly archived?: boolean;
  readonly closeRow: () => void;
}) {
  const [ask, setAsk] = useState<BatchAsk<AgentRow> | undefined>(undefined);
  const { model, directory } = snapshot;
  const may = useCallback(
    (row: AgentRow) => mayPickAgent(model, directory, selfId, row.id),
    [model, directory, selfId],
  );
  const locked = visible.some((row) => agentLocked(directory, row.id));
  const pick = usePick({
    items,
    visible,
    may,
    whyNot: (row) => ({
      words: whyNotPickedAgent(directory, row),
      locked: agentLocked(directory, row.id),
    }),
    hint: {
      // A locked agent is said as locked, not as somebody else's (ADR 0199).
      words: agentHintWords(
        visible.some((row) => row.lead),
        visible.some((row) => !row.lead && !may(row) && !agentLocked(directory, row.id)),
        locked,
      ),
      locked,
    },
    runOf,
    closeRow,
  });
  const { chosen, stop, hold, move, afterSheet, letGo } = pick;
  const asked = (kind: Kind) => (from: SheetFrom) =>
    setAsk({ kind, going: chosen, staying: [], from });
  // At once, as a swipe's Unarchive is: each row is held where it stood and folds away as the
  // server says it is back; one the server refuses stays, as a swipe's does, with a warning.
  const unarchive = () => {
    const going = chosen;
    hold(going, "archive", "held");
    stop();
    void Promise.allSettled(going.map((row) => store.setAgentArchived(row.id, false))).then(
      (results) => {
        const back = going.filter((_, at) => results[at]?.status === "fulfilled");
        const kept = going.filter((row) => !back.includes(row));
        letGo(kept.map((row) => row.id));
        move(
          back.map((row) => row.id),
          "folding",
        );
        if (kept.length > 0) feel.warning();
        else feel.success();
      },
    );
  };
  return {
    ...pick,
    left: archived
      ? { act: "unarchive" as const, count: chosen.length, onPress: unarchive }
      : { act: "archive" as const, count: chosen.length, onPress: asked("archive") },
    erase: { count: chosen.length, onPress: asked("delete") },
    sheet: {
      ask,
      onClose: () => setAsk(undefined),
      onActing: (kind: Kind, going: readonly AgentRow[]) => hold(going, kind, "held"),
      onDone: (kind: Kind, done: readonly string[], refused: readonly string[]) => {
        letGo(refused);
        const phase = kind === "archive" ? "folding" : "going";
        // The sheet stays up with what was refused, and the rows that went go behind it.
        if (refused.length > 0) {
          move(done, phase);
          return;
        }
        afterSheet(done, phase);
        setAsk(undefined);
        stop();
      },
    },
  };
}

/**
 * What a row wears at its leading edge while the list picks, and keeps as it stops: Locked's
 * padlock for an agent whose changes are locked (ADR 0199), as a locked room's row wears it.
 */
function markOf(row: AgentRow, picking: Picking<AgentRow>, directory: Directory): PickMark {
  if (agentLocked(directory, row.id)) return "locked";
  if (!picking.may(row)) return "none";
  return picking.picked.has(row.id) ? "on" : "off";
}

/** What a row is told about picking, whether or not the list is picking. */
export function pickOf(row: AgentRow, picking: Picking<AgentRow>, directory: Directory): RowPick {
  return {
    active: picking.active,
    mark: markOf(row, picking, directory),
    dim: !picking.may(row),
    shake: picking.shakes.get(row.id) ?? 0,
    onPick: () => picking.onPick(row),
  };
}

/**
 * An agent's row on its way out (ADR 0182): folding away once archived or unarchived, or gone to
 * dust first once deleted, as a room's row on Spaces goes. It is told whether it is going, and
 * what covers it.
 */
export function Going({
  row,
  going,
  children,
}: {
  readonly row: AgentRow;
  readonly going: ReturnType<typeof useAgentPicking>["going"];
  readonly children: (away: boolean, cover: ReactNode) => ReactNode;
}) {
  const palette = usePalette();
  const away = going.leaving.get(row.id);
  return (
    <FoldAway folding={away?.phase === "folding"} onFolded={() => going.onFolded(row.id)}>
      {children(
        away !== undefined,
        away?.kind === "delete" && away.phase !== "held" ? (
          <Eraser
            crumbling={{
              backwards: false,
              ground: faceGround(row.name, row.face),
              ink: palette.ink3,
            }}
            dust={going.dust}
            onWiped={() => undefined}
            onDone={() => going.onDusted(row.id)}
          />
        ) : null,
      )}
    </FoldAway>
  );
}

/**
 * The sheet that asks before picked agents are archived or deleted (ADR 0182): what core says of
 * them, their faces, and every agent asked of the server at once, a room's agents in turn.
 */
export function AgentsBatch({
  store,
  snapshot,
  selfId,
  sheet,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly sheet: ReturnType<typeof useAgentPicking>["sheet"];
}) {
  const { model, directory } = snapshot;
  const ids = (rows: readonly AgentRow[]) => rows.map((row) => row.id);
  return (
    <BatchSheet<AgentRow>
      {...sheet}
      asking={(kind, going) =>
        kind === "archive"
          ? agentsArchiveAsking(model, directory, ids(going))
          : agentsDeleteAsking(model, directory, selfId, ids(going))
      }
      who={(going) => agentsWho(going, snapshot, selfId)}
      nameOf={(row) => row.name}
      act={(kind, row, plan) => {
        if (kind === "archive") return store.setAgentArchived(row.id, true);
        const rooms = plan.too ? (plan.asking.roomsToo?.spaceIds ?? []) : [];
        return store.deleteAgent(row.id, {
          deleteRoom: roomGoesWith(directory, ids(plan.going), rooms).has(row.id),
        });
      }}
      lane={(row) => agentLane(directory, row.id)}
      why={(_kind, error) => whyNotKept(error)}
    />
  );
}

/** What a batch sheet is about: one agent as its row draws it, or several as a stack of faces. */
function agentsWho(rows: readonly AgentRow[], snapshot: Snapshot, selfId: string): Who {
  const [only] = rows;
  if (rows.length === 1 && only !== undefined) {
    return {
      face: <Avatar name={only.name} kind="agent" size="row" icon={only.face} decorative />,
      name: only.name,
      last: agentLine(snapshot.model, snapshot.directory, selfId, only.id),
    };
  }
  return {
    face: (
      <FaceStack
        faces={rows.map((row) => ({
          key: row.id,
          corner: avatarCorner("md", "agent"),
          face: <Avatar name={row.name} kind="agent" size="md" icon={row.face} decorative />,
        }))}
      />
    ),
    name: `${rows.length} agents`,
    last: listed(rows.map((row) => row.name)),
  };
}
