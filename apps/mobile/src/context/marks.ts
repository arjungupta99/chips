/**
 * The tile each context file's row stands on (ADR 0135): the role its harness gave it picks an
 * icon and a ground (`CONTEXT_MARKS` in core), the same on every harness, so Who it is looks the
 * same whoever sends it. The grounds are the faces' own, by the index a face's ground is sent as.
 */

import { CONTEXT_GROUND_INDEX, CONTEXT_MARKS, type ContextIcon } from "@chipschat/core";
import type { ContextRole } from "@chipschat/protocol";
import type { IconName } from "../ui/icons";
import { ICON_GROUNDS } from "../ui/tokens";

const ICON: Readonly<Record<ContextIcon, IconName>> = {
  sparkle: "sparkle",
  list: "list",
  person: "user",
  drawers: "drawers",
  page: "doc",
};

/** A role's icon and the colour of its tile. */
export function markOf(role: ContextRole): { readonly icon: IconName; readonly tint: string } {
  const mark = CONTEXT_MARKS[role];
  return {
    icon: ICON[mark.icon],
    tint: ICON_GROUNDS[CONTEXT_GROUND_INDEX[mark.ground]] ?? ICON_GROUNDS[0],
  };
}
