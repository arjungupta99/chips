/**
 * The render mode's stage (ADR 0217): none. In the web build made for `pnpm film`, a chapter of a
 * film plays at the window's full size through the demo's store, and the shell is moved only by
 * what the render does on its controls (ADR 0217's addendum). The Mac is filmed on Spaces alone,
 * where the shell opens; a Mac shot of somewhere else would get there by its steps. The lock screen
 * is a picture over the shell when the film says, and the page marks where the film stands and an
 * act nobody did, for `pnpm film`.
 *
 * Only the render mode plays a film live; a person watches its video (`film/FilmPlayer.tsx`).
 */

import type { DemoPlayer, DemoState, Store } from "@chipschat/core";
import { type ReactNode, useEffect, useState } from "react";
import { markFilm } from "./filmSource.ts";
import { LockPicture } from "./pictures.tsx";

export interface FilmSourceStageProps {
  readonly player: DemoPlayer;
  /** What the lock screen's own Approve answers through. */
  readonly store: Pick<Store, "resolveApproval">;
  /** The shell. */
  readonly children: ReactNode;
}

/** The player's state, as it is now and at each change. */
function usePlayerState(player: DemoPlayer): DemoState {
  const [state, setState] = useState(() => player.getState());
  useEffect(() => player.subscribe(setState), [player]);
  return state;
}

export function FilmSourceStage(props: FilmSourceStageProps) {
  const { player } = props;
  const state = usePlayerState(player);
  // The film starts as the page comes up, and again for a player made anew.
  useEffect(() => player.play(), [player]);
  useEffect(() => markFilm(state), [state]);
  const lock = state.screen === "lock" ? state.lockScreen : undefined;
  return (
    <div className="film-source" data-testid="film-source">
      {props.children}
      {lock !== undefined && (
        <LockPicture
          lock={lock}
          onApprove={() =>
            props.store.resolveApproval({
              spaceId: lock.spaceId,
              runId: lock.runId,
              approvalId: lock.approvalId,
              decision: "approved",
            })
          }
        />
      )}
    </div>
  );
}
