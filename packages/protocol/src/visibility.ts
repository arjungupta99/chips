/**
 * Who may see an event (phase-0-review finding 6).
 *
 * Reading the log and subscribing to it are both scoped by membership: a credential sees the
 * spaces it belongs to, and nothing else. Before this, any credential in a workspace
 * could read every space's events, including a direct space it was not in.
 *
 * The rule, in one place so the live path and the replay path cannot drift:
 *
 * - An event that belongs to a space is visible only to that space's members.
 * - An event with no space — a workspace-wide thing — is visible to everyone in the
 *   workspace. In Phase 1 nothing appends one in normal flow; the ones that arrive in M1.4 and
 *   M3 (a policy change, a budget warning) will want per-recipient scoping, which is theirs to
 *   add. What an agent said in no room (`message.held`, ADR 0087) has no space either, and is
 *   its harness's alone: its words are for the room it joins next, not for the workspace.
 * - A person asking for a copy of an agent (`agent.fork`, ADR 0087) is visible to the agent's
 *   harness, which makes the copy for a room it is not in.
 * - A person asking a harness for a new agent (`agent.asked`, ADR 0108) is visible to that
 *   harness, which makes the agent for a room it is not in.
 * - A harness's agent being made, renamed, archived, given a face or deleted (`agent.registered`,
 *   `agent.updated`, `agent.deleted`) has no space either, and went to everybody: a guest in no room with the
 *   agent, and every other harness, were sent its name and its harness's own key for it (agents
 *   review, finding 3). It is its harness's to hear, and anybody's who is told every agent: an
 *   owner or admin of the workspace. Since his call of 19 October 2026 (ADR 0034's addendum) that
 *   is no longer every person who is not a guest: a member is told the agents in their rooms, as
 *   a guest is. Whoever shares a room with the agent, and a person who owns its harness, are told
 *   too, which the caller works out, since a room is not something an event with none can say.
 * - The event that adds or removes a participant is always visible to that participant, so a
 *   person can see themselves join a space they are not yet listed in.
 * - The event that opens a space is visible to whoever opened it, who is its first
 *   member (ADR 0018) but is not yet listed anywhere a live session has read — and to the
 *   person it was opened *for*, since ADR 0024, because a harness opens a space for its owner
 *   as it finds one and they would otherwise never be sent the event that names it — and to the
 *   harness it was asked *of*, when a person opens a room for a harness to claim, which is how
 *   the harness hears that there is one before it is added to it.
 * - The event that opens a thread is visible to everyone in the space it grows in (M5.4): a
 *   thread has no members of its own, and its events are theirs from then on.
 * - An approval that names the viewer as somebody who may answer it is visible to them
 *   wherever it is (M5.5): the lane's lead, handed a low-risk ask by policy, is not in the
 *   specialist's room and would otherwise never be sent what it is to decide. Since ADR 0042 a
 *   person named from elsewhere in the workspace is in the same position, and the decision and
 *   its outcome name them too, so what they were sent is answered on their screen as well.
 * - A message a person deleted for themselves, and their Undo (ADR 0167), are theirs alone,
 *   though they belong to a room: nobody else in it, and no harness, is told that one person
 *   stopped seeing a line. The one rule that takes something away from a room's members.
 *
 * The replay path builds a SQL predicate from the same member set (see the server's event store)
 * plus the membership events naming the viewer. The join needs no special case — a viewer's set
 * already lists every space they are in — but a removal is from a space they are no longer in,
 * and a client resuming after it left a space elsewhere must still be told.
 *
 * It lives with the protocol so that the server and the conformance fake ask the same function:
 * the fake's own copy had come to send what an agent said in no room to everybody (agents
 * review, finding 37).
 */

/** An event as the rule needs it: what it is, where, by whom, and what it carries. */
export interface SeenEvent {
  readonly type: string;
  readonly space_id: string | null;
  readonly actor: { readonly id: string };
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface Viewer {
  readonly participantId: string;
  /** The spaces this viewer is a member of, resolved from the memberships projection. */
  readonly memberSpaces: ReadonlySet<string>;
  /**
   * Whether the viewer is told who every person in the workspace is: a person who is not a guest
   * (ADR 0034). A guest and a harness are told only whom they share a room with.
   */
  readonly seesDirectory?: boolean | undefined;
  /**
   * Whether the viewer is told every agent in the workspace: an owner or admin, who may move,
   * archive or delete any of them (his call of 19 October 2026, ADR 0034's addendum). Anybody
   * else is told the agents in their rooms, and a harness its own.
   */
  readonly seesAgents?: boolean | undefined;
  /**
   * Who else the viewer is in rooms: a harness's agents (ADR 0087), which it speaks for on one
   * connection. What names one of them names the viewer.
   */
  readonly alsoIs?: ReadonlySet<string> | undefined;
}

/** The ids a viewer answers to: itself, and a harness's agents. */
function idsOf(viewer: Viewer): string[] {
  return [viewer.participantId, ...(viewer.alsoIs ?? [])];
}

/** The events that add a participant to a space or remove one. Always visible to that participant. */
export const MEMBERSHIP_EVENTS: ReadonlySet<string> = new Set([
  "membership.added",
  "membership.removed",
  "membership.replaced",
]);

/**
 * Where an agent is (ADR 0087): put in a room or taken out of one. The room is told, as of
 * anything in it, and so is the agent's harness, which has left the room by the time its agent's
 * release is written. Nobody else: a person reads an agent's room from the directory, and an
 * event naming a room a client has never heard of would make it one.
 */
export const WHEREABOUTS_EVENTS: ReadonlySet<string> = new Set([
  "agent.attached",
  "agent.released",
]);

/**
 * A person asking for a copy of an agent in a room (ADR 0087, Fork). The room is told, as of
 * anything in it, and so is the agent's harness, which makes the copy: the agent it names is in
 * another room, so its harness is not a member of the room the copy is for.
 */
export const FORK_EVENTS: ReadonlySet<string> = new Set(["agent.fork"]);

/**
 * A person asking a harness for a new agent in a room (ADR 0108). The room is told, as of anything
 * in it, and so is the harness the event names, which makes the agent: no agent of its is there
 * yet, and a harness is a member of no room itself.
 */
export const ASK_EVENTS: ReadonlySet<string> = new Set(["agent.asked"]);

/**
 * What an agent said while in no room (ADR 0087, rule 6). It has no space, so the workspace-wide
 * rule would send it to everyone — every person, guests too, and every other harness — before
 * the room it is meant for hears it. Only the agent's own harness is told; a person reads how
 * many wait from the directory (`held`).
 */
export const HELD_EVENTS: ReadonlySet<string> = new Set(["message.held"]);

/**
 * A harness's agent made or changed (ADR 0087): who it is, what it is called, whether it is
 * archived, the face it wears. No space, and not everybody's: see the rule above.
 */
export const DIRECTORY_EVENTS: ReadonlySet<string> = new Set([
  "agent.registered",
  "agent.updated",
  "agent.deleted",
]);

/**
 * What came of a join request (ADR 0122): who asked, from where, and what a person let in. No
 * space, and not everybody's: a harness and a guest are told nothing of who else is let in. A
 * person who sees the whole directory is, as they see the harness appear in it.
 */
export const JOIN_EVENTS: ReadonlySet<string> = new Set(["join.allowed", "join.denied"]);

/**
 * A person's face chosen (ADR 0139). No space, and a person's to see, not a harness's: a harness
 * draws nobody, and one that does not know the event has no business being sent it. A person who
 * sees the directory is told, as of a join; a guest reads it the next time it reads who is who.
 */
export const FACE_EVENTS: ReadonlySet<string> = new Set(["person.face_set"]);

/**
 * An agent's changes locked or let go (ADR 0199). No space, and a person's to see, not a harness's,
 * as a face is: the lock holds people's hands, and a harness is held by nothing it says. A person
 * told every agent is told; anybody else reads it the next time they read who is who.
 */
export const LOCK_EVENTS: ReadonlySet<string> = new Set(["agent.lock_set"]);

/**
 * A person deleting a message for themselves, and taking that back (ADR 0167). They belong to the
 * room the message is in, and are sent only to the person who did them, on each of their devices.
 */
export const SELF_EVENTS: ReadonlySet<string> = new Set(["message.hidden", "message.shown"]);

/** Whether an event with no space is this viewer's: most are everybody's, and five kinds are not. */
function seesRoomless(event: SeenEvent, viewer: Viewer): boolean {
  const agent = String(event.payload["agent_id"]);
  if (HELD_EVENTS.has(event.type)) return idsOf(viewer).includes(agent);
  if (JOIN_EVENTS.has(event.type) || FACE_EVENTS.has(event.type)) {
    return viewer.seesDirectory === true;
  }
  if (LOCK_EVENTS.has(event.type)) return viewer.seesAgents === true;
  if (!DIRECTORY_EVENTS.has(event.type)) return true;
  return (
    viewer.seesAgents === true ||
    idsOf(viewer).includes(agent) ||
    event.payload["harness_id"] === viewer.participantId
  );
}

/**
 * Whether a live event should be delivered to a viewer. For `DIRECTORY_EVENTS` a caller that
 * gets `false` asks one thing more, which this cannot: whether the viewer shares a room with the
 * agent the event is about, or is a person who owns its harness.
 */
export function canSee(event: SeenEvent, viewer: Viewer): boolean {
  if (SELF_EVENTS.has(event.type)) return event.actor.id === viewer.participantId;
  const space = event.space_id;
  if (space === null) return seesRoomless(event, viewer);
  if (viewer.memberSpaces.has(space)) return true;
  const ids = idsOf(viewer);
  if (MEMBERSHIP_EVENTS.has(event.type)) return ids.some((id) => namesViewer(event, id));
  if (WHEREABOUTS_EVENTS.has(event.type) || FORK_EVENTS.has(event.type)) {
    return ids.includes(String(event.payload["agent_id"]));
  }
  if (ASK_EVENTS.has(event.type)) return event.payload["harness_id"] === viewer.participantId;
  return (
    opensFor(event, viewer.participantId) ||
    opensThreadIn(event, viewer.memberSpaces) ||
    ids.some((id) => namesApprover(event, id))
  );
}

/**
 * The events that carry who may answer an approval, resolved to ids. The two decisions are
 * here as well since ADR 0042: somebody named outside the room is sent the ask, so they are
 * sent what came of it — otherwise the card on their phone would never cool.
 */
export const APPROVER_EVENTS: ReadonlySet<string> = new Set([
  "approval.request",
  "approval.routed",
  "approval.resolved",
  "approval.executed",
]);

/** True when an approval names the viewer as somebody who may answer it (M5.5). */
export function namesApprover(event: SeenEvent, participantId: string): boolean {
  if (!APPROVER_EVENTS.has(event.type)) return false;
  const approvers = event.payload["approvers"];
  return Array.isArray(approvers) && approvers.includes(participantId);
}

/** True when this opens a thread in one of the viewer's spaces, which makes it theirs too (M5.4). */
export function opensThreadIn(event: SeenEvent, memberSpaces: ReadonlySet<string>): boolean {
  if (event.type !== "space.created") return false;
  const parent = event.payload["parent_space_id"];
  return typeof parent === "string" && memberSpaces.has(parent);
}

/**
 * True when this is a space being opened for the viewer: by them, on their behalf, or for them
 * to claim. A harness asked beside another from the + (`also_asked_of`) is asked as much as the
 * first: it was sent nothing until its next `hello`, so it never learnt the room was asked of it,
 * and the first words there went unanswered (agents review, finding 17).
 */
export function opensFor(event: SeenEvent, participantId: string): boolean {
  if (event.type !== "space.created") return false;
  const also = event.payload["also_asked_of"];
  return (
    event.actor.id === participantId ||
    event.payload["opened_for"] === participantId ||
    event.payload["asked_of"] === participantId ||
    (Array.isArray(also) && also.includes(participantId))
  );
}

/**
 * True when a membership event is about this viewer, so they see the moment they are added: the
 * one added or removed, or either side of a replacement (ADR 0087).
 */
export function namesViewer(event: SeenEvent, participantId: string): boolean {
  const { payload } = event;
  return (
    payload["participant_id"] === participantId ||
    (event.type === "membership.replaced" &&
      (payload["to"] === participantId || payload["from"] === participantId))
  );
}
