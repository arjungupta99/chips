/**
 * Rooms a person asked this harness for: `space.created` naming it in `asked_of`, the harness
 * added, and the person's first words (Phase 2 of the new-space plan). Each room is handed to the
 * harness once, at the moment there is something to act on — its first words — whether those
 * were heard live or read from the room's history at a catch-up. The words handed over are the
 * ask's, and are not heard a second time as `message.new`.
 *
 * Once is per connection object: a reconnect keeps what was handed. A harness that stops before
 * it claims a room is handed it again at its next start, because the room is still listed as
 * asked until it is claimed, which is the point of the list.
 */

import { messageIdOf } from "@chipschat/protocol";

/** A room a person asked this harness for, and what they said it was for. */
export interface SpaceAsked {
  readonly spaceId: string;
  /** The person who asked. */
  readonly askedBy: string;
  /** Their first words in the room. Name the room from these, and answer them. */
  readonly firstMessage: { readonly messageId: string; readonly text: string };
}

/** What `claimSpace` did. */
export interface ClaimedSpace {
  readonly spaceId: string;
  /** False on a retry of a claim that had landed: the room was the harness's already. */
  readonly claimed: boolean;
  /** True when the title was taken. False without one, or when a person named the room first. */
  readonly retitled: boolean;
}

/** One room of the listing's `asked`, as `GET /v1/harnesses/:id/spaces` answers it. */
export interface AskedListing {
  readonly space_id: string;
  readonly asked_by: string;
}

interface AskedRoom {
  readonly askedBy: string;
  /** The words handed over, once they have been. */
  first: string | undefined;
}

type Frame = Readonly<Record<string, unknown>>;

export class Asks {
  private readonly rooms = new Map<string, AskedRoom>();

  constructor(
    /** Who this harness is, once the server has said. */
    private readonly harnessId: () => string | undefined,
    /** Whether anybody is listening for asks, and the way to tell them. */
    private readonly listener: {
      readonly listening: () => boolean;
      readonly hand: (asked: SpaceAsked) => void;
    },
  ) {}

  /**
   * An event heard live. True when it is an ask's first words, handed over now or before, and so
   * is the ask's rather than `message.new` for the harness's own handler.
   */
  heard(event: Frame): boolean {
    const spaceId = event["space_id"];
    if (typeof spaceId !== "string") return false;
    if (event["type"] === "space.created") {
      const actor = event["actor"] as { id?: unknown } | undefined;
      if (this.askedOfMe(event) && typeof actor?.id === "string") this.note(spaceId, actor.id);
      return false;
    }
    if (event["type"] !== "message.new") return false;
    const room = this.rooms.get(spaceId);
    if (room === undefined) return false;
    if (room.first !== undefined) return room.first === event["message_id"];
    const from = event["from"] as { kind?: unknown } | undefined;
    if (!this.listener.listening() || from?.kind !== "person") return false;
    this.hand(spaceId, room, {
      messageId: String(event["message_id"]),
      text: String(event["text"] ?? ""),
    });
    return true;
  }

  /**
   * Whether a room asks this harness: first, or beside another (ADR 0087's addendum of 30
   * September, point 6). Asked beside another, `claimSpace` answers with its own agent and leaves
   * the room's name to the first.
   */
  private askedOfMe(event: Frame): boolean {
    const me = this.harnessId();
    if (me === undefined) return false;
    const also = event["also_asked_of"];
    return event["asked_of"] === me || (Array.isArray(also) && also.includes(me));
  }

  /** Whether this room has been handed over already. */
  handed(spaceId: string): boolean {
    return this.rooms.get(spaceId)?.first !== undefined;
  }

  /**
   * A room read from the listing at a catch-up, with its first words when its history has them:
   * handed over then, and left to be handed when they arrive otherwise.
   */
  caughtUp(listed: AskedListing, first: SpaceAsked["firstMessage"] | undefined): void {
    const room = this.note(listed.space_id, listed.asked_by);
    if (first !== undefined && room.first === undefined) this.hand(listed.space_id, room, first);
  }

  private note(spaceId: string, askedBy: string): AskedRoom {
    const known = this.rooms.get(spaceId);
    if (known !== undefined) return known;
    const room: AskedRoom = { askedBy, first: undefined };
    this.rooms.set(spaceId, room);
    return room;
  }

  private hand(spaceId: string, room: AskedRoom, first: SpaceAsked["firstMessage"]): void {
    room.first = first.messageId;
    this.listener.hand({ spaceId, askedBy: room.askedBy, firstMessage: first });
  }
}

/** The first thing a person said in a page of a room's history, as `GET /v1/events` returns it. */
export function firstWords(history: readonly Frame[]): SpaceAsked["firstMessage"] | undefined {
  for (const event of history) {
    const actor = event["actor"] as { kind?: unknown } | undefined;
    if (event["type"] !== "message.post" || actor?.kind !== "person") continue;
    return { messageId: messageIdOf(String(event["id"])), text: String(event["text"] ?? "") };
  }
  return undefined;
}
