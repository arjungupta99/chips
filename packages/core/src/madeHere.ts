/**
 * Spaces made on this device that the server has not yet sent back (ADR 0149's third addendum).
 *
 * A space made from the + is named by the device (`createSpace`) and goes to the server through the
 * outbox with the people asked into it. Until its own `space.created` comes back, the device's
 * model has no such space, and the room the + opened under its window said "This space is not on
 * this phone. It may not have replayed yet." That is what Arjun saw on 1 November 2026, while the
 * server took seventy seconds to hear of "Dude char". So the device draws the space from what it
 * sent, folded by the same fold as everything else, and lets it go once the server's own is in the
 * model with everybody sent into it, or when the server turns it away. Overlaying it is pure, as
 * `withPending` is, so it is tested without a socket.
 *
 * The server sends the space back before the agents asked into it: `space.created` and each
 * `membership.added` are events of their own, a round trip or more apart on a phone away from the
 * Mac. Let go at the first, the room had nobody in it but the person for that while, and said
 * "Nobody's here yet" between two "What would you like to do?" (Arjun, 7 November 2026: "some
 * screen flipping … Looks very unpolished"). So who was sent in is drawn in the server's own until
 * the server sends them back too (`heardMadeHere`), or says no to them.
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
  /**
   * The keys of what was sent for it that the server has sent back, or turned away. Who was sent
   * in under one of these is not waited for.
   */
  readonly heard?: readonly string[] | undefined;
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
 * Who was sent into a space made here and is not in the server's own yet, nor sent back or turned
 * away: drawn in it until they are.
 */
function waitingIn(made: MadeHere, space: Space): string[] {
  const heard = new Set(made.heard);
  const waiting: string[] = [];
  for (const event of made.events) {
    const id = event["participant_id"];
    if (event.type !== "membership.added" || typeof id !== "string") continue;
    if (heard.has(String(event["idempotency_key"])) || space.members.includes(id)) continue;
    if (!waiting.includes(id)) waiting.push(id);
  }
  return waiting;
}

/** The server's own, kept by the object, so a space drawn again is the same object. */
const overlaid = new WeakMap<Space, { readonly made: MadeHere; readonly drawn: Space }>();

/** The server's own space, with whoever was sent into it that it does not have yet. */
function withWaiting(space: Space, made: MadeHere, selfId: string): Space {
  const kept = overlaid.get(space);
  if (kept?.made === made) return kept.drawn;
  const waiting = waitingIn(made, space);
  const sent = waiting.length === 0 ? undefined : spaceOf(made, space.id, selfId);
  let drawn = space;
  if (sent !== undefined) {
    const roles = { ...space.roles };
    const held = { ...space.held };
    for (const id of waiting) {
      roles[id] = sent.roles[id] ?? "member";
      const name = sent.held?.[id];
      if (name !== undefined) held[id] = name;
    }
    drawn = { ...space, members: [...space.members, ...waiting], roles, held };
  }
  overlaid.set(space, { made, drawn });
  return drawn;
}

/**
 * The model with each space made here that it does not have yet: newest first, as the list puts a
 * space just made. One the model has is the server's, and the model's own is kept, with whoever
 * was sent into it that the server has not sent back yet.
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
  let changed = extra.length > 0;
  const spaces = model.spaces.map((space) => {
    const each = made.get(space.id);
    const drawn = each === undefined ? space : withWaiting(space, each, selfId);
    if (drawn !== space) changed = true;
    return drawn;
  });
  return changed ? { ...model, spaces: [...extra, ...spaces] } : model;
}

/**
 * The spaces made here the server has sent back with everybody sent into them: no longer drawn
 * from what was sent. And one it sent back that has gone again, erased before its agents came:
 * not drawn again from what was sent. Answers whether any went, so the cache hears of it.
 */
export function settleMadeHere(made: Map<string, MadeHere>, model: WorkspaceModel): boolean {
  if (made.size === 0) return false;
  const spaces = new Map(model.spaces.map((space) => [space.id, space]));
  let settled = false;
  for (const [spaceId, each] of made) {
    const space = spaces.get(spaceId);
    const done =
      space === undefined
        ? each.heard?.includes(each.key) === true
        : waitingIn(each, space).length === 0;
    if (done) settled = made.delete(spaceId) || settled;
  }
  return settled;
}

/**
 * What the server sent back, or turned away, by the keys it went with: who was sent in under one is
 * not waited for. Answers whether any space made here heard of it.
 */
export function heardMadeHere(made: Map<string, MadeHere>, keys: readonly string[]): boolean {
  if (made.size === 0 || keys.length === 0) return false;
  let heard = false;
  for (const [spaceId, each] of made) {
    const sent = new Set(each.events.map((event) => event["idempotency_key"]));
    const fresh = keys.filter((key) => sent.has(key) && each.heard?.includes(key) !== true);
    if (fresh.length === 0) continue;
    made.set(spaceId, { ...each, heard: [...(each.heard ?? []), ...fresh] });
    heard = true;
  }
  return heard;
}
