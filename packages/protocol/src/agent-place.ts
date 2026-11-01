/**
 * Where an agent may be (ADR 0087, rules 1 and 7), in one place (agents review, findings 5 to 8).
 *
 * An agent is in one room at a time. Nine paths put an agent in a room: a person's add, a move, an
 * unarchive, a room opened or claimed by key, a harness's attach, a fork's copy, a hand-off's
 * home, an agent's first words, and the answer to a room asked of several. Each used to read where
 * the agent was and then write, with its own version of the rule or none. Two at once, or a path
 * that did not ask, left an agent in two rooms.
 *
 * The rule is this function. The store asks it inside the append's transaction, of every event
 * that puts an agent in a room, whichever path wrote it: that is what makes it hold. The door asks
 * it first, with the same facts, so a person is told why before anything is written. It lives
 * with the protocol so that the conformance fake asks the same function, and cannot differ.
 *
 * What it says:
 *
 * - the room is there, and open: an archived room takes no agent until it is unarchived;
 * - a Main room takes people and its Main agent, and no other agent;
 * - the Main agent's place in its Main room is not taken by another;
 * - a deleted agent is in no room again (ADR 0095);
 * - the agent is in no other room, open or archived. An archived room's agents are released as it
 *   is archived, so one still in such a room is one whose release has not been written yet, and it
 *   is not put anywhere else until it has.
 *
 * What it leaves to the door, because Chips itself may do it: a Main agent put in a room that is
 * not a Main room yet (its harness opens the room, then names it its home), and an agent archived
 * in its harness (an unarchive brings back whoever the archive released).
 */

/** Why an agent may not be put in a room: the rule, in words, and where the agent is. */
export interface PlaceRefusal {
  readonly kind:
    | "unknown_space"
    | "lead_room"
    | "room_closed"
    | "agent_elsewhere"
    | "agent_deleted";
  readonly message: string;
  /** For `agent_elsewhere`: the room the agent is in, where a client offers Move. */
  readonly space_id?: string | undefined;
}

/** A room as the rule needs it. */
export interface PlaceRoom {
  readonly space_id: string;
  readonly state: string;
  /** A harness's home (ADR 0069): the Main room of its Main agent. */
  readonly home: boolean;
}

export interface AgentPlacement {
  /** The agent to be put in the room; `deleted` when a person deleted it (ADR 0095). */
  readonly agent: { readonly id: string; readonly lead: boolean; readonly deleted?: boolean };
  /** The room, or `null` when there is none by that id: erased, or never there. */
  readonly room: PlaceRoom | null;
  /** A room the agent is a member of now that is not this one, open or archived; `null`: none. */
  readonly elsewhere: string | null;
  /** How many agents the room holds already, less this one and the one whose place it takes. */
  readonly others: number;
  /** True when it takes the place of a Main agent: a harness's attach, in its Main room. */
  readonly replacesLead: boolean;
}

/** Why this agent may not be put in this room, or nothing when it may. */
export function refuseAgentInto(placement: AgentPlacement): PlaceRefusal | undefined {
  const { agent, room, elsewhere } = placement;
  if (agent.deleted === true) {
    return { kind: "agent_deleted", message: "that agent was deleted" };
  }
  if (room === null) return { kind: "unknown_space", message: "no such space in this workspace" };
  if (room.home && (!agent.lead || placement.others > 0)) {
    return { kind: "lead_room", message: "a Main space takes people, and no other agent" };
  }
  if (room.home && placement.replacesLead) {
    return { kind: "lead_room", message: "the Main agent stays in its Main space" };
  }
  if (room.state === "closed") {
    return { kind: "room_closed", message: "that space is archived: unarchive it first" };
  }
  if (elsewhere !== null) {
    return {
      kind: "agent_elsewhere",
      message: "that agent is in another space: move it, or pick another",
      space_id: elsewhere,
    };
  }
  return undefined;
}

/** Why an agent left a room, as `agent.released` says it. */
type LeftBecause =
  | "archived"
  | "deleted"
  | "moved"
  | "agent_archived"
  | "removed"
  | "agent_deleted";

/**
 * What a run is told when its agent leaves the room it was working in, by why it left (agents
 * review, findings 10 and 12): the `reason` on the `run.cancel` that stops it. Leaving a room
 * stops the work, whatever the reason.
 */
export const STOPPED_BECAUSE: Readonly<Record<LeftBecause, string>> = {
  archived: "The space was archived.",
  deleted: "The space was deleted.",
  moved: "The agent was moved to another space.",
  agent_archived: "The agent was archived.",
  removed: "The agent was taken out of the space.",
  agent_deleted: "The agent was deleted.",
};

/**
 * The refusals an `error` frame names in `refusal`, for a client that offers a way on (ADR 0087):
 * Move for an agent that is elsewhere, Unarchive for a room that is archived, and words for the
 * other two. The server's socket and the conformance fake's both read this list.
 */
export const ONE_ROOM_REFUSALS: ReadonlySet<string> = new Set([
  "agent_elsewhere",
  "lead_room",
  "agent_archived",
  "room_closed",
  "agent_deleted",
]);
