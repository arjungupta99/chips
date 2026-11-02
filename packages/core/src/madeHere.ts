/**
 * Spaces made on this device that the server has not yet sent back (ADR 0149's third addendum).
 *
 * A space made from the + is named by the device (`createSpace`) and goes to the server through the
 * outbox with the people asked into it. Until its own `space.created` comes back, the device's
 * model has no such space, and the room the + opened under its window said "This space is not on
 * this phone. It may not have replayed yet." That is what Arjun saw on 1 November 2026, while the
 * server took seventy seconds to hear of "Dude char". So the device draws the space from what it
 * sent, folded by the same fold as everything else, and lets it go the moment the server's own is
 * in the model, or when the server turns it away. Overlaying it is pure, as `withPending` is, so it
 * is tested without a socket.
 */

import type { ClientEvent } from "./events.js";
import { buildModel, type Space, type WorkspaceModel } from "./model.js";
import type { OutboxEvent } from "./outbox.js";

/** A space made here and not yet heard back: what was sent for it, as the fold reads events. */
export interface MadeHere {
  /** The key its `space.created` went with, which the server answers for. */
  readonly key: string;
  /** `space.created` first, then each `membership.added` sent with it, in the order sent. */
  readonly events: readonly ClientEvent[];
  /** The same, as they were sent: what goes again after a relaunch, until the server has it. */
  readonly sent: readonly OutboxEvent[];
  /**
   * The server said yes to its `space.created`. It is drawn still, until its own comes back, but
   * it is the server's now and never goes again: sent again after the room was erased, it would
   * make the room again.
   */
  readonly taken?: true | undefined;
}

/**
 * A space made here as the cache keeps it (ADR 0149's third addendum): quit before the server
 * had it, the app draws it again on the next launch and sends it again, ahead of any message
 * written in it, which would otherwise go to a room the server had never heard of.
 */
export interface KeptSpace extends MadeHere {
  readonly spaceId: string;
}

/** What the cache keeps: the spaces made here the server has not said yes to. */
export function keptSpaces(made: ReadonlyMap<string, MadeHere>): KeptSpace[] {
  const kept: KeptSpace[] = [];
  for (const [spaceId, each] of made) if (each.taken !== true) kept.push({ spaceId, ...each });
  return kept;
}

/** Who sent them, and where: what the server would stamp on each. */
export interface Sender {
  readonly workspaceId: string;
  readonly participantId: string;
}

/**
 * What was sent, as the event the server will send back: stamped with the sender, the time and
 * the next place in this space's own short log.
 */
export function madeHereEvent(
  sent: OutboxEvent,
  sender: Sender,
  ts: string,
  seq: number,
): ClientEvent {
  return {
    ...sent,
    type: String(sent["type"]),
    id: `made-here:${sent.idempotency_key}`,
    ts,
    seq,
    workspace_id: sender.workspaceId,
    actor: { kind: "person", id: sender.participantId },
  };
}

/** Each space, as its events fold: kept by its events, so a space drawn again is the same object. */
const folded = new WeakMap<readonly ClientEvent[], Space | undefined>();

function spaceOf(made: MadeHere, spaceId: string, selfId: string): Space | undefined {
  if (folded.has(made.events)) return folded.get(made.events);
  const space = buildModel(made.events, { selfId }).spaces.find((each) => each.id === spaceId);
  folded.set(made.events, space);
  return space;
}

/**
 * The model with each space made here that it does not have yet: newest first, as the list puts a
 * space just made. One the model has is the server's, and the model's own is kept.
 */
export function withMadeHere(
  model: WorkspaceModel,
  made: ReadonlyMap<string, MadeHere>,
  selfId: string,
): WorkspaceModel {
  if (made.size === 0) return model;
  const known = new Set(model.spaces.map((space) => space.id));
  const extra: Space[] = [];
  for (const [spaceId, each] of made) {
    if (known.has(spaceId)) continue;
    const space = spaceOf(each, spaceId, selfId);
    if (space !== undefined) extra.unshift(space);
  }
  return extra.length === 0 ? model : { ...model, spaces: [...extra, ...model.spaces] };
}

/**
 * The spaces the model has now, which are the server's: no longer drawn from what was sent.
 * Answers whether any went, so the cache hears of it.
 */
export function settleMadeHere(made: Map<string, MadeHere>, model: WorkspaceModel): boolean {
  if (made.size === 0) return false;
  let settled = false;
  for (const space of model.spaces) settled = made.delete(space.id) || settled;
  return settled;
}
