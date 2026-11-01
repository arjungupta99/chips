/**
 * Messaging depth in the shell (M5.4): a line the room should land on, and what may be done to
 * a line — kept here so the shell stays about which pane is open. What may be done is decided by
 * the reader's standing where the line is, the same way the door decides it. The thread beside
 * the room lived here too, until the offer was withdrawn (ADR 0035's addendum, 15 September
 * 2026).
 */

import type { Space, Store, WorkspaceModel } from "@chipschat/core";
import { myRole, standingIn } from "@chipschat/core";
import { useCallback, useMemo, useState } from "react";
import type { LineHandlers, Standing } from "./LineActions.tsx";
import type { LineFocus } from "./SpaceView.tsx";

export interface Messaging {
  /** A line the room should land on, and how to ask for one. */
  readonly jumpTo: LineFocus | undefined;
  /** Land on a line, with the words a search looked for to mark there for a moment. */
  readonly jump: (lineId: string, words?: string | undefined) => void;
  readonly standingIn: (space: Space) => Standing;
  readonly handlers: LineHandlers;
  /**
   * Open a space — or, for a thread the log holds, the room it grew in — at a line when one is
   * named: a search hit, a pin. `select` is the shell's own opening of a room, and `words` what a
   * search looked for, marked where the room lands (ADR 0133).
   */
  readonly open: (
    spaceId: string,
    lineId: string | undefined,
    select: (roomId: string) => void,
    words?: string | undefined,
  ) => void;
}

export function useMessaging(store: Store, model: WorkspaceModel, selfId: string): Messaging {
  const [jumpTo, setJumpTo] = useState<LineFocus | undefined>(undefined);

  const standing = useCallback(
    (space: Space): Standing => ({
      inSpace: standingIn(model, space, selfId),
      inWorkspace: myRole(model, selfId),
    }),
    [model, selfId],
  );
  const handlers = useMemo<LineHandlers>(
    () => ({
      edit: (spaceId, line, text) => store.editMessage({ spaceId, lineId: line.id, text }),
      remove: (spaceId, line) => store.deleteMessage({ spaceId, lineId: line.id }),
      hide: (spaceId, line) => store.hideMessage({ spaceId, lineId: line.id }),
      show: (spaceId, lineId) => store.showMessage({ spaceId, lineId }),
      pin: (spaceId, line) => store.pinMessage({ spaceId, lineId: line.id }),
      unpin: (spaceId, line) => store.unpinMessage({ spaceId, lineId: line.id }),
    }),
    [store],
  );
  const jump = useCallback(
    (lineId: string, words?: string | undefined) =>
      setJumpTo({ lineId, nonce: Date.now(), ...(words === undefined ? {} : { words }) }),
    [],
  );
  const open = useCallback(
    (
      spaceId: string,
      lineId: string | undefined,
      select: (roomId: string) => void,
      words?: string | undefined,
    ) => {
      // A hit in a thread opens the room it grew in; the room does not hold the line to land on.
      const parent = model.spaces.find((each) => each.id === spaceId)?.parentSpaceId;
      select(parent ?? spaceId);
      if (lineId !== undefined && parent === undefined) jump(lineId, words);
    },
    [model.spaces, jump],
  );
  return { jumpTo, jump, standingIn: standing, handlers, open };
}
