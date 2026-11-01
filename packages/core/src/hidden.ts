/**
 * Lines a reader deleted for themselves (ADR 0167), taken out of what they see.
 *
 * The fold keeps every line and says which the log has hidden (`Space.hidden`); this device may
 * also have asked to hide one, or to put one back with Undo, that the log has not answered for
 * yet. Both meet here, once, as the store builds its snapshot: a hidden line leaves the room, the
 * Spaces list's last line, the pins and everything else drawn from `lines`, at the moment it is
 * asked for. Overlaying is pure, like `withPending`, so it is tested without a socket.
 */

import type { Space, WorkspaceModel } from "./model.js";

/** Hiding a line, or showing it again, as this device asked, until the log says the same. */
export interface Hiding {
  readonly spaceId: string;
  readonly hidden: boolean;
}

/** Each space as last overlaid, by the space it was made from and the lines it left out. */
const made = new WeakMap<Space, { readonly key: string; readonly space: Space }>();

/** The lines hidden in a space: the log's, then this device's asks over them. */
export function hiddenIn(space: Space, asked: ReadonlyMap<string, Hiding>): ReadonlySet<string> {
  let hidden = space.hidden;
  for (const [lineId, hiding] of asked) {
    if (hiding.spaceId !== space.id || (hidden?.has(lineId) ?? false) === hiding.hidden) continue;
    const next = new Set(hidden);
    if (hiding.hidden) next.add(lineId);
    else next.delete(lineId);
    hidden = next;
  }
  return hidden ?? new Set();
}

/** The model with each space's hidden lines, and the pins on them, left out. */
export function withHidden(
  model: WorkspaceModel,
  asked: ReadonlyMap<string, Hiding> = new Map(),
): WorkspaceModel {
  let changed = false;
  const spaces = model.spaces.map((space) => {
    const next = overlaid(space, asked);
    if (next !== space) changed = true;
    return next;
  });
  return changed ? { ...model, spaces } : model;
}

function overlaid(space: Space, asked: ReadonlyMap<string, Hiding>): Space {
  const hidden = hiddenIn(space, asked);
  if (hidden.size === 0 && space.hidden === undefined) return space;
  // The same space and the same lines left out make the same object, so a room that has not
  // changed is not drawn again.
  const key = [...hidden].sort().join(" ");
  const before = made.get(space);
  if (before?.key === key) return before.space;
  const next: Space =
    hidden.size === 0
      ? // All put back by Undo before the log has said so: the set is not carried on.
        { ...space, hidden: undefined }
      : {
          ...space,
          hidden,
          lines: space.lines.filter((line) => !hidden.has(line.id)),
          pins: space.pins.filter((pin) => !hidden.has(pin.lineId)),
        };
  made.set(space, { key, space: next });
  return next;
}
