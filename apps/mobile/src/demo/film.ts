/**
 * The film's state as the phone draws it (ADR 0213): what the player says, read as it changes, and
 * where each chapter opens, as the phone's own routes. From there the render acts as a person does
 * on the app's own controls (ADR 0217's addendum), so no screen carries a word for the film.
 */

import type { DemoPlayer, DemoState } from "@chipschat/core";
import { useEffect, useState } from "react";

/** What the player says now, and at every change; nothing without a player. */
export function usePlayerState(player: DemoPlayer | undefined): DemoState | undefined {
  const [state, setState] = useState<DemoState | undefined>(() => player?.getState());
  useEffect(() => {
    if (player === undefined) {
      setState(undefined);
      return;
    }
    // A player tells a new listener at once what it holds.
    return player.subscribe(setState);
  }, [player]);
  return player === undefined ? undefined : state;
}

/** Where a chapter opens: a tab, or a room or an agent's page pushed over them. */
export type Place =
  | { readonly kind: "spaces" }
  | { readonly kind: "agents" }
  | { readonly kind: "room"; readonly spaceId: string }
  | { readonly kind: "agent"; readonly agentId: string };

/** Where a state's chapter opens. The lock screen is drawn over the room it asks from. */
export function placeOf(state: DemoState): Place | undefined {
  const { spaceId, agentId } = state;
  switch (state.screen) {
    case "spaces":
      return { kind: "spaces" };
    case "agents":
      return { kind: "agents" };
    case "room":
    case "lock":
      return spaceId === undefined ? undefined : { kind: "room", spaceId };
    case "agent":
      return agentId === undefined ? undefined : { kind: "agent", agentId };
  }
}

/** The route each place is: the tabs' own, a room's, an agent's page. */
export function routeOf(place: Place): string {
  switch (place.kind) {
    case "spaces":
      return "/";
    case "agents":
      return "/agents";
    case "room":
      return `/spaces/${place.spaceId}`;
    case "agent":
      return `/agents/${place.agentId}`;
  }
}
