/** The room itself: opened, retitled, closed, and who is in it. */

import {
  DEFAULT_SPEND_CEILING_USD,
  dollars,
  eventIdOfMessage,
  FIRST_PERSON_NAME,
  NO_SPEND_CEILING,
} from "@chipschat/protocol";
import { actorKind, type ClientEvent } from "../events.js";
import { addLine, textLine } from "./lines.js";
import {
  type Building,
  bringBack,
  erase,
  type FoldStep,
  field,
  linkThread,
  type MutableSpace,
  putAway,
  spaceOf,
} from "./state.js";
import type { Line, SpaceRole } from "./types.js";

/**
 * An event that is no news in its room: a harness naming its home (ADR 0069), or an agent taking
 * its harness's place (ADR 0087), changes nothing anybody reads there, so the room neither comes
 * forward on the list nor says so. The upgrade to agents replaces a member in every room at once;
 * news, it would have brought every room to the top at the same minute.
 *
 * So too where an agent is (`agent.attached`, `agent.released`), which the membership event beside
 * it already says in the room, and an agent Chips itself takes out: the archive it follows is the
 * news, and the upgrade to one room per agent releases fifty-one from rooms archived long ago. A
 * person's Move is news.
 */
export function quiet(event: ClientEvent): boolean {
  if (event.type === "membership.replaced") return true;
  // A line deleted for oneself, or put back (ADR 0167), is no news in the room.
  if (event.type === "message.hidden" || event.type === "message.shown") return true;
  if (event.type === "agent.attached" || event.type === "agent.released") return true;
  if (event.type === "membership.removed" && event.actor.kind === "system") return true;
  return (
    event.type === "space.updated" &&
    field<string>(event, "title") === undefined &&
    field<string>(event, "state") === undefined
  );
}

export const SPACE_FOLDS: Readonly<Record<string, FoldStep>> = {
  "space.created": (state, event) => {
    const space = spaceOf(state, event);
    if (space === undefined) return;
    space.title = field<string>(event, "title");
    space.kind = field<string>(event, "kind") ?? "group";
    space.openedBy = event.actor.id;
    space.keyed = field<string>(event, "external_key") !== undefined;
    space.askedOf = field<string>(event, "asked_of");
    const parent = field<string>(event, "parent_space_id");
    if (parent !== undefined) {
      // A thread has no members of its own (M5.4): the parent's are its.
      space.parentSpaceId = parent;
      const root = field<string>(event, "root_message_id");
      space.rootLineId = root === undefined ? undefined : eventIdOfMessage(root);
      linkThread(state, space);
      return;
    }
    // Whoever opened it is its first member (ADR 0018), as the server's projection says.
    if (event.actor.kind !== "system" && !space.members.includes(event.actor.id)) {
      space.members.push(event.actor.id);
      space.roles.set(event.actor.id, "owner");
    }
  },

  // A retitle, an archive or an unarchive (M3.3, ADR 0066): the room changes, and a muted line
  // says who did it. The wire says closed and open; people say archived. Or the room named its
  // harness's home (ADR 0069), quietly.
  "space.updated": (state, event) => {
    const space = spaceOf(state, event);
    if (space === undefined) return;
    const home = field<boolean>(event, "home");
    if (home !== undefined) space.home = home;
    if (quiet(event)) return;
    const title = field<string>(event, "title");
    const next = field<"open" | "closed">(event, "state");
    if (title !== undefined) space.title = title;
    if (next !== undefined) space.state = next;
    const said =
      title !== undefined
        ? `renamed this space to ${title}`
        : next === "closed"
          ? "archived this space"
          : "unarchived this space";
    addLine(space, { ...textLine(event, said), kind: "system" });
  },

  // A room a person asked a harness for, taken by it under a key of its own: from here it is
  // the harness's room, as one it opened itself is — so it can be erased, and the sheet names
  // who can open it again. Its name, when it brought one, arrives without a line: nobody renamed
  // anything, the room was only waiting to be called something.
  "space.claimed": (state, event) => {
    const space = spaceOf(state, event);
    if (space === undefined) return;
    space.openedBy = event.actor.id;
    space.keyed = true;
    const title = field<string>(event, "title");
    if (title !== undefined) space.title = title;
  },

  // Who leads the room (ADR 0104), or that nobody does. A person's choice says so in one line; a
  // + room's claim choosing the agent that claimed it says nothing, as the claim itself does not.
  "space.lead_set": (state, event) => {
    const space = spaceOf(state, event);
    if (space === undefined) return;
    const agentId = field<string | null>(event, "agent_id") ?? undefined;
    space.lead = agentId;
    if (actorKind(event.actor) !== "person") return;
    if (agentId === undefined) {
      addLine(space, { ...textLine(event, "said nobody leads this space"), kind: "system" });
      return;
    }
    const by = state.people.get(event.actor.id)?.displayName;
    agentLine(
      space,
      event,
      agentId,
      `leads this space now${by === undefined ? "" : `, chosen by ${by}`}`,
    );
  },

  // What the room allows a job (ADR 0117), or that it follows the default again, in one line by
  // who set it.
  "space.spend_ceiling_set": (state, event) => {
    const usd = field<number | null>(event, "usd") ?? undefined;
    ceilingSet(
      state,
      event,
      usd,
      usd === undefined
        ? `set the spend per job back to the default, ${dollars(DEFAULT_SPEND_CEILING_USD)}`
        : `set the spend per job to ${dollars(usd)}`,
    );
  },

  // The room's cap taken off (ADR 0292): Chips holds no job here for what it spends.
  "space.spend_ceiling_lifted": (state, event) => {
    ceilingSet(state, event, NO_SPEND_CEILING, "took the cap off the spend per job");
  },

  // A room's changes locked or let go (ADR 0156), in one line by who did it.
  "space.lock_set": (state, event) => {
    const space = spaceOf(state, event);
    if (space === undefined) return;
    const locked = field<boolean>(event, "locked") === true;
    space.locked = locked;
    const said = locked ? "locked changes to the space" : "unlocked changes to the space";
    addLine(space, { ...textLine(event, said), kind: "system" });
  },

  // Rooms erased from the server (ADR 0067). The event names no space of its own, so nothing
  // above brought one back to hold it; the rooms it names go, with their threads and lanes.
  "space.erased": (state, event) => {
    const erased = field<string[]>(event, "erased");
    if (Array.isArray(erased)) erase(state, erased);
  },

  "membership.added": (state, event) => {
    // The reader added back to a room they were out of: it comes back whole (JR-16).
    if (event.space_id !== undefined && field<string>(event, "participant_id") === state.selfId) {
      bringBack(state, event.space_id);
    }
    const space = spaceOf(state, event);
    const participant = field<string>(event, "participant_id");
    if (space === undefined || participant === undefined) return;
    if (!space.members.includes(participant)) space.members.push(participant);
    space.roles.set(participant, field<SpaceRole>(event, "role") ?? "member");
    space.left.delete(participant);
    // A fork's copy answers the line that asked for it (ADR 0087, Fork), which says it joined.
    const forkOf = field<string>(event, "fork_of");
    if (forkOf !== undefined) space.forked.set(forkOf, participant);
    // So does a new agent a person asked for (ADR 0108).
    const madeFor = field<string>(event, "made_for");
    if (madeFor !== undefined) space.made.set(madeFor, participant);
    // A harness asked from the + waits under the first name held for its agent (ADR 0150): the
    // server writes one for nobody else.
    const held = field<string>(event, "agent_name");
    if (held !== undefined) space.held.set(participant, held);
    // An agent moved in says where from (ADR 0087): the room it left, when the reader knows it.
    const from = field<string>(event, "moved_from");
    if (from !== undefined)
      agentLine(space, event, participant, `moved here from ${named(state, from)}`);
    personAdded(state, space, event, participant);
  },

  // A person asking for a copy of an agent here (ADR 0087, Fork): one line, which waits for the
  // copy, and says it joined or that its harness didn't make it.
  "agent.fork": (state, event) => {
    const space = spaceOf(state, event);
    const agentId = field<string>(event, "agent_id");
    if (space === undefined || agentId === undefined) return;
    addLine(space, {
      ...textLine(event, "asked for a copy of an agent here"),
      kind: "system",
      fork: { agentId },
    });
  },

  // A person asking a harness for a new agent here (ADR 0108): one line, which waits for the
  // agent, and says it joined or that its harness didn't make it.
  "agent.asked": (state, event) => {
    const space = spaceOf(state, event);
    const harnessId = field<string>(event, "harness_id");
    const name = field<string>(event, "name");
    if (space === undefined || harnessId === undefined || name === undefined) return;
    addLine(space, {
      ...textLine(event, `asked for a new agent here, ${name}`),
      kind: "system",
      newAgent: { harnessId, name },
    });
  },

  // An agent in its harness's place in a room (ADR 0087, point 9): the member changes hands, and
  // what the harness said and did there before is its agent's — its answers under the agent's
  // name and face, and the runs it worked there.
  "membership.replaced": (state, event) => {
    const space = spaceOf(state, event);
    const from = field<string>(event, "from");
    const to = field<string>(event, "to");
    if (space === undefined || from === undefined || to === undefined) return;
    space.members = space.members.map((member) => (member === from ? to : member));
    space.left.delete(to);
    // Its agent is in its place, by the name the room held for it.
    space.held.delete(from);
    const role = space.roles.get(from);
    space.roles.delete(from);
    if (role !== undefined) space.roles.set(to, role);
    replaceIn(state, space, from, to);
  },

  "membership.removed": (state, event) => {
    const space = spaceOf(state, event);
    const participant = field<string>(event, "participant_id");
    if (space === undefined || participant === undefined) return;
    const wasIn = space.members.includes(participant);
    space.members = space.members.filter((member) => member !== participant);
    space.roles.delete(participant);
    space.held.delete(participant);
    if (participant.startsWith("agt_")) agentLeft(state, space, event, participant);
    // Somebody already out says nothing again: Foodie's log has Natalie taken out three times on
    // 19 October 2026, sent at once from a phone that had been connecting, before Chips refused
    // a second (`membership-gate.ts`).
    if (isPerson(participant) && wasIn) personLeft(state, space, event, participant);
    // A space the reader has left is not theirs to see. The server stops sending its events;
    // this is the same answer for the ones already in hand, so leaving takes effect at once
    // rather than at the next reload. Put away, not dropped: added back, the room is whole
    // again, and a replay that passes this on its way to the return keeps it (JR-16).
    if (participant === state.selfId) {
      noteTakenOut(state, space, event);
      putAway(state, space.id);
    }
  },
};

/**
 * What the room allows a job set: an amount, the default (nothing) or No cap. One line by who set
 * it, which a carrying on at the ceiling right behind it turns into both (ADR 0282).
 */
function ceilingSet(
  state: Building,
  event: ClientEvent,
  usd: number | typeof NO_SPEND_CEILING | undefined,
  said: string,
): void {
  const space = spaceOf(state, event);
  if (space === undefined) return;
  const was = space.spendCeiling ?? DEFAULT_SPEND_CEILING_USD;
  space.spendCeiling = usd;
  addLine(space, { ...textLine(event, said), kind: "system" });
  space.ceilingLine = { id: event.id, seq: event.seq, by: event.actor.id, usd, was };
}

/**
 * An agent out of a room (ADR 0087): the room remembers why, for its notice and for an agent an
 * unarchive finds elsewhere, and a move, an archive, a delete (ADR 0095) or a person's removal
 * (ADR 0111) says so in the room.
 */
function agentLeft(
  state: Building,
  space: MutableSpace,
  event: ClientEvent,
  agentId: string,
): void {
  const reason = field<string>(event, "reason") ?? "removed";
  const movedTo = field<string>(event, "moved_to");
  const by = field<string>(event, "removed_by");
  space.left.set(agentId, {
    agentId,
    reason,
    ...(movedTo === undefined ? {} : { movedTo }),
    ...(by === undefined ? {} : { by }),
    seq: event.seq,
  });
  // A person archiving or deleting it is named (ADR 0095); its harness archiving it is not.
  const person = by === undefined ? undefined : state.people.get(by)?.displayName;
  const byPerson = person === undefined ? "" : ` by ${person}`;
  if (reason === "moved") agentLine(space, event, agentId, `moved to ${named(state, movedTo)}`);
  if (reason === "agent_archived") {
    agentLine(
      space,
      event,
      agentId,
      person === undefined ? "was archived in its harness" : `was archived${byPerson}`,
    );
  }
  if (reason === "agent_deleted") agentLine(space, event, agentId, `was deleted${byPerson}`);
  // A person taking it out (ADR 0111). One that left on its own, or that an upgrade or a restart
  // released, has no person to name, and the room says nothing, as before.
  if (reason === "removed" && person !== undefined) {
    agentLine(space, event, agentId, `was removed${byPerson}`);
  }
}

/** Whether an id is a person's: not a harness's, an agent's or Chips's own. */
function isPerson(id: string): boolean {
  return id.startsWith("usr_");
}

/**
 * A person, as the reader says them: "You" or "you" for themselves, their name otherwise, and "An
 * owner" for one still under the name the server first gave them, which is "You" (JR-17): read by
 * anybody else, "You joined by You's link" named the wrong person twice.
 */
function who(state: Building, id: string, first: boolean): string {
  if (id === state.selfId) return first ? "You" : "you";
  const name = state.people.get(id)?.displayName;
  if (name === FIRST_PERSON_NAME) return first ? "An owner" : "an owner";
  return name ?? "Somebody";
}

/** "You added Priya", "Arjun added you", "Arjun removed Priya": one person doing to another. */
function saying(state: Building, actorId: string, did: string, subjectId: string): string {
  return `${who(state, actorId, true)} ${did} ${who(state, subjectId, false)}`;
}

/**
 * A person brought in by somebody says so (JR-5); the room's maker, in as it opens, does not. One
 * who came by a space's link says that (ADR 0168): the link's maker put them here.
 */
function personAdded(
  state: Building,
  space: MutableSpace,
  event: ClientEvent,
  participant: string,
): void {
  const by = event.actor.id;
  if (!isPerson(participant) || by === participant || !isPerson(by)) return;
  const byLink = field<string>(event, "invite_id") !== undefined;
  peopleLine(
    space,
    event,
    byLink ? joinedByLink(state, by, participant) : saying(state, by, "added", participant),
  );
}

/** "Priya Nair joined by your link", "… by Arjun's link", "You joined by Arjun's link" (ADR 0168). */
function joinedByLink(state: Building, makerId: string, personId: string): string {
  const whose = makerId === state.selfId ? "your" : `${who(state, makerId, false)}'s`;
  return `${who(state, personId, true)} joined by ${whose} link`;
}

/**
 * The reader taken out of a room by somebody else (JR-6): which room, by whom, so the room's place
 * can say so. Their own leaving, and a removal from the whole workspace (ADR 0160), which says
 * so for every room at once, are not this.
 */
function noteTakenOut(state: Building, space: MutableSpace, event: ClientEvent): void {
  const by = field<string>(event, "removed_by") ?? event.actor.id;
  if (by === state.selfId || !isPerson(by)) return;
  const reason = field<string>(event, "reason");
  if (reason === "person_removed" || reason === "person_left") return;
  state.takenOut.set(space.id, {
    spaceId: space.id,
    ...(space.title === undefined ? {} : { title: space.title }),
    byId: by,
    byName: who(state, by, true),
    at: event.ts,
  });
}

/** A muted line, whole as it is worded, for somebody coming into a room or going (JR-5). */
function peopleLine(space: MutableSpace, event: ClientEvent, words: string): void {
  addLine(space, { ...textLine(event, words), kind: "system", whole: true });
}

/**
 * A person out of a room (JR-5): they left, or somebody took them out, or they were removed from
 * the workspace (ADR 0160), or left it by deleting their account (ADR 0243). The reader's own
 * leaving is no news to them: the room goes, and the line would never be seen.
 */
function personLeft(
  state: Building,
  space: MutableSpace,
  event: ClientEvent,
  personId: string,
): void {
  if (personId === state.selfId) return;
  const by = field<string>(event, "removed_by") ?? event.actor.id;
  if (field<string>(event, "reason") === "person_left") {
    peopleLine(space, event, `${who(state, personId, true)} left the workspace`);
    return;
  }
  if (field<string>(event, "reason") === "person_removed") {
    const removed = `${who(state, personId, true)} was removed from the workspace`;
    peopleLine(space, event, isPerson(by) ? `${removed} by ${who(state, by, false)}` : removed);
    return;
  }
  if (by === personId || !isPerson(by)) {
    peopleLine(space, event, `${who(state, personId, true)} left`);
    return;
  }
  peopleLine(space, event, saying(state, by, "removed", personId));
}

/** A muted line said by the agent itself, so its name on it is its name now. */
export function agentLine(
  space: MutableSpace,
  event: ClientEvent,
  agentId: string,
  words: string,
  more: Pick<Line, "compacted" | "unpicked"> = {},
): void {
  addLine(space, {
    ...textLine(event, words),
    kind: "system",
    authorId: agentId,
    authorKind: "harness",
    ...more,
  });
}

/** A room by its title, when the reader has it, and generically when not. */
function named(state: Building, spaceId: string | undefined): string {
  const title = spaceId === undefined ? undefined : state.spaces.get(spaceId)?.title;
  return title ?? "another space";
}

/**
 * What one member said and did in a room, as another's (ADR 0087, point 9): the room's lines
 * and its threads' — who said them, and whom they were for — and the runs worked there.
 */
function replaceIn(state: Building, space: MutableSpace, from: string, to: string): void {
  const now = (id: string): string => (id === from ? to : id);
  const moved = (line: Line): Line =>
    line.authorId !== from &&
    line.addressedTo?.includes(from) !== true &&
    line.mentions?.includes(from) !== true
      ? line
      : {
          ...line,
          authorId: now(line.authorId),
          ...(line.addressedTo === undefined ? {} : { addressedTo: line.addressedTo.map(now) }),
          ...(line.mentions === undefined ? {} : { mentions: line.mentions.map(now) }),
        };
  const rooms = [
    space,
    ...[...state.spaces.values()].filter((each) => each.parentSpaceId === space.id),
  ];
  for (const room of rooms) {
    room.lines = room.lines.map(moved);
    room.checkpoints = room.checkpoints.map(moved);
  }
  for (const run of state.runs.values()) {
    if (run.harnessId === from && rooms.some((room) => room.id === run.spaceId)) {
      run.harnessId = to;
    }
  }
}
