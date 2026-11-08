/**
 * Whether a sender may append an event: one function, in the domain, for the rules that used to
 * live in five places (phase-1-interim-review; ADR 0020's consequence). Pure: the use case
 * gathers what the rules need through its ports and asks.
 *
 * The rules, in the order they are asked — the cheap ones first, so a forgery costs no lookup:
 *
 * 1. the event stays in the sender's workspace, on the sender's own behalf;
 * 2. it is the kind of event that kind of sender sends: a harness's token sends what a harness
 *    sends, a person's device key what a person sends, both send a message, and nobody sends
 *    what is Chips's own to write. The catalogue says which, for every event (`sender`). A
 *    message marked as a heartbeat's check-in is a harness's or its agent's alone (ADR 0143);
 * 3. it carries an idempotency key, so a retry changes nothing;
 * 4. an event into a run names one that exists, in its own space, that the sending
 *    harness started, and that its state takes (`runAccepts`); `run.started` opens one, in a
 *    space, and an owner restating it is a retry;
 * 5. an event into a space comes from a member of it; opening a space is the
 *    exception, since nobody is a member of one that does not exist yet, and so is answering
 *    an approval or handing one on, which rule 9 judges instead (ADR 0042);
 * 6. a decision is the first: an approval already resolved and a question already answered
 *    take no second answer — first answer wins;
 * 7. a change to a space comes from somebody with standing in it (M3.3): a harness retitles or
 *    closes only a space it opened, a guest changes nothing, no person retitles or closes a
 *    space whose changes are locked (ADR 0156), and somebody else is removed from a space only
 *    by its owner — leaving is anyone's;
 * 8. somebody added to a space exists, so a room cannot list a participant nobody is, and is
 *    not a harness removed from the workspace (ADR 0078);
 * 9. a decision comes from somebody policy named to make it, when it named anyone — and when
 *    it named nobody, from anyone in the room but a guest (Gate 5) — and from a harness only
 *    when policy named it: the lane's lead, handed a low-risk ask (M5.5, open decision 7).
 *    Anybody named may answer from outside the room, since being named is standing enough
 *    (ADR 0042); a guest may not, being in one room and named only there;
 * 10. feedback is on a message an agent or a harness said, in the space the event names, and
 *     says what it is: a reaction carries its emoji, a correction its note (M3.4, PM-3);
 * 11. a person's standing in the workspace is honoured (ADR 0034): a guest opens no space and
 *     adds nobody to one, and a member opens no space but a thread (ADR 0196); a guest is in one
 *     open room at most, so somebody in more than one is not made a guest (Gate 5), and an
 *     archived room is not unarchived while a guest of it is in another open room (JR-24); only an owner or admin changes a role, an admin never an owner's,
 *     and the last owner stays; an owner or admin removes anybody from any space they are in,
 *     as the room's owner can, but an owner of the workspace, whom only an owner takes out of a
 *     room (JR-23); and only the room's owner, or an owner or admin, makes somebody
 *     else an owner of the room; and only an owner or an admin turns a harness's dial or
 *     lifts the workspace's cap (`policy.updated`), as only they cap attachments and set the
 *     exchange limits — the one workspace-wide event that was open to a guest (SEC-1);
 * 12. a message is changed by those with standing over it (M5.4): edited by its author alone;
 *     taken back by its author, the space's owner, or an owner or admin of the workspace;
 *     pinned or let go by anyone in the space but a guest; and one taken back is left alone;
 * 13. a thread grows in a space its opener is in, that is open and not a thread itself, from a
 *     message in that space that has no thread yet; and a thread has no members of its own,
 *     so nobody is added to one or removed from one (M5.4);
 * 14. an approval is handed on by somebody who may answer it, or who runs the workspace, while
 *     it is still pending (M5.5): a decision already made is not re-routed;
 * 15. a room is asked of a harness by a person — rule 2 already says so, since only a person
 *     sends `space.created` — of a harness in the workspace that declares `new_spaces` and has
 *     not been removed, and it is not a thread and carries no key: the key is the harness's to
 *     give when it claims the room;
 * 16. an agent is in one room at a time (ADR 0087, rules 1 and 7): one in another room is not
 *     added, an archived room takes none, a Main room takes people and its Main agent alone, and
 *     a person adds neither the Main agent anywhere else nor an agent archived in its harness.
 *     All but the last two are `refuseAgentInto`, which the store asks again of every path. A
 *     person puts an agent, or a harness as its default agent, in a room only as they would move
 *     it: as its harness's owner, or an owner or admin of the workspace (his call of 19 October
 *     2026, ADR 0034's addendum);
 * 17. the Main agent is not taken out of its Main room.
 *
 * Visibility — who may *read* an event — is `application/visibility.ts`; the two are halves of
 * the same idea and are kept side by side rather than merged, because a read has no sender.
 */

import {
  type ActionFlags,
  actionMatters,
  commandParts,
  type EventSender,
  eventDefinition,
  HARNESS_CAPABILITIES,
  isAgentKind,
  neverStanding,
  refuseAgentInto,
} from "@chipschat/protocol";
import {
  administers,
  isGuest,
  mayAddToSpaces,
  mayOpenSpace,
  refuseRoleChange,
  type WorkspaceRole,
} from "./roles.js";
import { type RunState, runAccepts } from "./run-state.js";

/** The caller, as the rules need to see it. `system` never comes from the wire. */
export interface Sender {
  readonly kind: "person" | "harness";
  readonly participantId: string;
  readonly workspaceId: string;
  /** A person's standing in the workspace (ADR 0034). Absent for a harness. */
  readonly role?: WorkspaceRole | undefined;
}

/** A run as the rules need it. */
export interface RunFacts {
  readonly run_id: string;
  readonly harness_id: string;
  readonly space_id: string | null;
  readonly state: string;
}

/** A space as the rules need it: who opened it, which is who may retitle or close it. */
export interface SpaceFacts {
  readonly space_id: string;
  readonly opened_by: string | null;
  readonly state: string;
  /** Direct or group, for a harness naming its home (ADR 0069). */
  readonly kind?: string | undefined;
  /** The space this one is a thread of, when it is one (M5.4). */
  readonly parent_space_id?: string | null | undefined;
  /** The harness's home, which no person archives (ADR 0069). */
  readonly home?: boolean | undefined;
  /** Its changes locked by a person there (ADR 0156): no person renames or archives it. */
  readonly locked?: boolean | undefined;
}

/** A participant as the rules need it: that they exist, and what they are. */
export interface ParticipantFacts {
  readonly id: string;
  readonly kind: "person" | "harness" | "agent";
  /** What a harness declared it takes (ADR 0046), for rule 15. Absent or `null`: nothing. */
  readonly capabilities?: readonly string[] | null | undefined;
  /** A harness (ADR 0078) or a person (ADR 0160) removed from the workspace, for rules 8 and 15. */
  readonly removed?: boolean | undefined;
  /** For an agent (ADR 0087): its harness's Main agent, which stays in its Main room. */
  readonly lead?: boolean | undefined;
  /** For an agent: archived in its harness. */
  readonly archived?: boolean | undefined;
  /**
   * For an agent being added: a room it is a member of that is not the one named, open or
   * archived, or `null` while it is in no other (rule 16).
   */
  readonly room?: string | null | undefined;
  /** For an agent being added: how many agents the room named holds already, less itself. */
  readonly others?: number | undefined;
  /** For an agent or a harness: the person who owns it, its harness's owner (rule 16). */
  readonly owner?: string | null | undefined;
  /** For a person: their standing in the workspace (ADR 0034), for an owner in a room (rule 11). */
  readonly standing?: WorkspaceRole | null | undefined;
}

/**
 * The person a `role.changed` is about (M5.1): what they are now, whether they are the last
 * owner, and how many spaces they are in — a guest is in one at most (Gate 5).
 */
export interface RoleTarget {
  readonly role: WorkspaceRole;
  readonly lastOwner: boolean;
  readonly spaces: number;
}

/** A message as the rules need it (M3.4): whose it is, and where. */
export interface MessageFacts {
  readonly message_id: string;
  readonly space_id: string | null;
  readonly author_kind: "person" | "harness" | "agent" | "system";
  readonly author_id: string;
  /** True once it was taken back (M5.4): it is left alone after that. */
  readonly deleted?: boolean | undefined;
  /** The thread already grown from it, when one has (M5.4): a message roots one thread. */
  readonly thread_id?: string | null | undefined;
}

/**
 * What the use case looked up for this event. Every field is required, so a use case cannot
 * forget one and have a rule silently pass: `null` is "looked up, and nothing there".
 */
export interface AuthorizeContext {
  /** The sender's standing in the space the event names; `null` when they are not in it. */
  readonly role: "owner" | "member" | "guest" | null;
  /** The run the event names; `null` when no such run exists. */
  readonly run: RunFacts | null;
  /** For a decision: who already decided, or `null` when nobody has. */
  readonly decidedBy: string | null;
  /**
   * For a change to a space: the space, or `null` when there is no such space. For a thread
   * being opened, the space it grows in — and `role` is the sender's standing there (M5.4).
   */
  readonly space: SpaceFacts | null;
  /**
   * For a membership: the participant named; for a room asked of a harness, that harness (rule
   * 15). `null` when there is nobody by that id.
   */
  readonly participant: ParticipantFacts | null;
  /** For a decision: who policy said may answer, or `null` when it named nobody in particular. */
  readonly approvers: readonly string[] | null;
  /**
   * For a decision: the run the ask belongs to, as the approval or the question says; `null`
   * when there is no such ask. What says whether a harness is settling its own.
   */
  readonly askRun?: string | null | undefined;
  /**
   * For a decision on an approval: what the ask said about its action, its flags and its risk
   * classes, as stored; `null` when there is no such ask. What says whether it matters, which
   * always waits for a person (ADR 0195), and the command it carries, if any, which a standing
   * yes is given for part by part (ADR 0239).
   */
  readonly askAction?:
    | (ActionFlags & { readonly command?: string | readonly string[] | undefined })
    | null
    | undefined;
  /**
   * For feedback, an edit, a deletion or a pin: the message it is about; for a thread, the
   * message it grows from. `null` when there is no such message.
   */
  readonly message: MessageFacts | null;
  /** For a role change: the person it names as they stand, or `null` when there is nobody by that id. */
  readonly target: RoleTarget | null;
  /**
   * For a membership that names a workspace guest: how many spaces they are in already;
   * `null` when the named participant is not a guest, or is nobody.
   */
  readonly guestSpaces: number | null;
}

export type RefusalKind =
  | "wrong_workspace"
  | "wrong_actor"
  | "wrong_direction"
  | "wrong_space"
  | "missing_idempotency_key"
  | "invalid"
  | "unknown_run"
  | "wrong_run"
  | "run_state"
  | "already_decided"
  | "unknown_space"
  | "not_the_opener"
  | "wrong_role"
  | "unknown_participant"
  | "not_an_approver"
  | "unknown_message"
  | "wrong_message"
  | "guest_elsewhere"
  /** A harness sent as itself into a room where it has several agents (ADR 0087). */
  | "which_agent"
  /** An agent is in one room at a time (ADR 0087, rule 1): it is in another. */
  | "agent_elsewhere"
  /** The Main agent stays in its Main room, which takes no other agent (rule 7). */
  | "lead_room"
  /** An agent archived in its harness is not added to a room. */
  | "agent_archived"
  /** An archived room takes no agent until it is unarchived (agents review, finding 5). */
  | "room_closed"
  /** A person deleted the agent (ADR 0095): it is in no room again. */
  | "agent_deleted"
  /** A file made from a version of the room's file that is no longer current (ADR 0099). */
  | "stale_file";

export interface Refusal {
  readonly kind: RefusalKind;
  readonly message: string;
  /** For `agent_elsewhere`: the room the agent is in, where a client offers Move. */
  readonly space_id?: string | undefined;
}

/**
 * Who sends an event, as the catalogue says (agents review, finding 1). It used to be worked out
 * here: a harness's events from a harness, everything else from a person, less two lists kept by
 * hand. An event Chips wrote itself that was on neither list was then a person's to send, and
 * four agent events were. Now every event says, and one nothing declares is nobody's.
 *
 * `either` is what both send: a harness says something with `message.post`, and so does a person
 * typing in the composer; either may change or take back what it said (M5.4), which rule 12
 * narrows; a space is retitled or closed by a person in it or by the harness that opened it
 * (M3.3), which rule 7 narrows; and a harness decides only what policy handed it, or settles an
 * ask of its own run that was answered in its own tools (rule 9).
 */
export function senderOf(type: string): EventSender {
  return eventDefinition(type)?.sender ?? "chips";
}

/** The events that change a message after it was said (M5.4), which rule 12 has a say on. */
const MESSAGE_CHANGES: ReadonlySet<string> = new Set([
  "message.edited",
  "message.deleted",
  "message.hidden",
  "message.shown",
  "message.pinned",
  "message.unpinned",
]);

/** A message deleted for one person, and their Undo (ADR 0167): anyone in the room, any message. */
const FOR_ONESELF: ReadonlySet<string> = new Set(["message.hidden", "message.shown"]);

/** The events that change a space itself or who is in it, which rule 7 has a say on. */
const SPACE_CHANGES: ReadonlySet<string> = new Set([
  "space.updated",
  "membership.added",
  "membership.removed",
]);

/** The events that are a person's answer to a harness's ask, of which only the first counts. */
const DECISIONS: ReadonlySet<string> = new Set(["approval.resolved", "question.answered"]);

/** The events rule 9 has a say on: a decision, and handing an approval on (M5.5). */
const ANSWERS: ReadonlySet<string> = new Set(["approval.resolved", "approval.routed"]);

function noun(kind: Sender["kind"]): string {
  return kind === "harness" ? "a harness" : "a person";
}

function refusal(kind: RefusalKind, message: string): Refusal {
  return { kind, message };
}

/** Who an event is by, as the door left it. */
function actorOf(event: Readonly<Record<string, unknown>>): {
  readonly kind: string;
  readonly id: string;
  readonly harness_id?: string;
} {
  return event["actor"] as { kind: string; id: string; harness_id?: string };
}

/**
 * Whether the event is on the sender's own behalf: by the sender, or by one of a harness's agents
 * (ADR 0087). The door has already checked that an agent named as actor is the sender's own and
 * written its harness beside it, so that is what is asked here.
 */
export function speaksFor(sender: Sender, event: Readonly<Record<string, unknown>>): boolean {
  const actor = actorOf(event);
  if (actor.id === sender.participantId && actor.kind === sender.kind) return true;
  return (
    sender.kind === "harness" && actor.kind === "agent" && actor.harness_id === sender.participantId
  );
}

/** The ids the sender answers to in this event: itself, and the agent it speaks as. */
function selvesIn(sender: Sender, event: Readonly<Record<string, unknown>>): string[] {
  const actor = actorOf(event);
  return actor.kind === "agent" ? [sender.participantId, actor.id] : [sender.participantId];
}

/**
 * The rules that need nothing looked up: the sender, the workspace, the direction, the key.
 * Asked before anything that costs a query, so a forgery is refused on the cheap.
 */
export function refuseWithoutLookup(
  event: Readonly<Record<string, unknown>>,
  sender: Sender,
): Refusal | undefined {
  if (event["workspace_id"] !== sender.workspaceId) {
    return refusal("wrong_workspace", "an event may only be sent to its sender's workspace");
  }

  if (!speaksFor(sender, event)) {
    return refusal("wrong_actor", "an event may only be sent on the sender's own behalf");
  }

  const type = String(event["type"]);
  const sends = senderOf(type);
  if (sends === "chips") {
    return refusal(
      "wrong_direction",
      `${type} is written by Chips itself, and is not accepted from a client`,
    );
  }
  if (sends !== "either" && sender.kind !== sends) {
    return refusal(
      "wrong_direction",
      `${type} is something ${noun(sends)} sends, and this credential belongs to ${noun(sender.kind)}`,
    );
  }
  if (type === "message.post" && event["heartbeat"] === true && sender.kind !== "harness") {
    return refusal(
      "wrong_direction",
      "a heartbeat's check-in is something a harness sends, and this credential belongs to a person",
    );
  }

  if (typeof event["idempotency_key"] !== "string") {
    return refusal(
      "missing_idempotency_key",
      "every write carries an idempotency key, so that retrying it changes nothing",
    );
  }
  return refuseByWorkspaceRole(type, sender, event);
}

/**
 * Rule 11's cheap half: what a person's standing in the workspace settles before anything is
 * looked up. A guest opens no space and adds nobody to one; a member opens no space but a thread,
 * which rule 13 judges (ADR 0196); a role is changed, a dial turned and a limit set by an owner or
 * an admin. A harness has no standing and is not asked.
 */
function refuseByWorkspaceRole(
  type: string,
  sender: Sender,
  event: Readonly<Record<string, unknown>>,
): Refusal | undefined {
  if (sender.kind !== "person") return undefined;
  if (type === "space.created" && !mayOpenSpace(sender.role)) {
    if (isGuest(sender.role)) {
      return refusal("wrong_role", "a guest of the workspace may not open a space");
    }
    if (event["kind"] !== "thread") {
      return refusal(
        "wrong_role",
        "a member of the workspace may not open a space: an owner or an admin opens one and adds them",
      );
    }
  }
  if (type === "membership.added" && !mayAddToSpaces(sender.role)) {
    return refusal("wrong_role", "a guest of the workspace may not add anybody to a space");
  }
  const administered = ADMINISTERED[type];
  if (administered !== undefined && !administers(sender.role)) {
    return refusal("wrong_role", administered);
  }
  return undefined;
}

/**
 * What an owner or an admin alone sends, each with the refusal's words. A `policy.updated` sets
 * any harness's autonomy and the workspace's cap, so it switches the approval gate on or off for
 * everyone (SEC-1): it is theirs as the two limit events are, and never a member's or a guest's.
 */
const ADMINISTERED: Readonly<Record<string, string>> = {
  "role.changed": "only an owner or an admin changes a person's role",
  "policy.updated": "only an owner or an admin turns a harness's dial or lifts the workspace's cap",
  "attachment.limits_set": "only an owner or an admin caps what may be attached",
  "exchange.limits_set":
    "only an owner or an admin sets when Chips tells the agents to stop and holds them",
};

/**
 * Rule 11's other half, with the lookups: the person a role change names, as they stand, and
 * whether a guest being added to a space is in one already.
 */
export function refuseOnWorkspaceRole(
  event: Readonly<Record<string, unknown>>,
  sender: Sender,
  target: AuthorizeContext["target"],
  guestSpaces: AuthorizeContext["guestSpaces"],
): Refusal | undefined {
  const type = String(event["type"]);
  if (type === "role.changed") {
    if (target === null)
      return refusal("unknown_participant", "nobody in this workspace has that id");
    const why = refuseRoleChange({
      actor: sender.role,
      target: target.role,
      to: event["role"] as WorkspaceRole,
      lastOwner: target.lastOwner,
      spaces: target.spaces,
    });
    return why === undefined ? undefined : refusal("wrong_role", why);
  }
  if (type === "membership.added" && guestSpaces !== null && guestSpaces > 0) {
    return refusal("guest_elsewhere", "a guest of the workspace is in one space at most");
  }
  return undefined;
}

/**
 * Rule 11's guest at an unarchive (JR-24; his call of 20 October 2026, ADR 0034's addendum): a
 * guest is in one open room at most, and stays a member of a room that was archived, so the room is
 * not unarchived while one of its guests is in another open room by now. They are named, so the
 * room can say whom to take out of one, or make a member, first.
 */
export function refuseReopening(guestsElsewhere: readonly string[]): Refusal | undefined {
  const last = guestsElsewhere.at(-1);
  if (last === undefined) return undefined;
  const one = guestsElsewhere.length === 1;
  const who = one ? last : `${guestsElsewhere.slice(0, -1).join(", ")} and ${last}`;
  return refusal(
    "guest_elsewhere",
    one
      ? `${who} is a guest in another space now, and a guest is in one at a time: take them out of one first, or make them a member`
      : `${who} are guests in other spaces now, and a guest is in one at a time: take them out of one first, or make them members`,
  );
}

/** Rule 4: the run the event names. */
export function refuseOnRun(
  event: Readonly<Record<string, unknown>>,
  sender: Sender,
  run: RunFacts | null,
): Refusal | undefined {
  const runId = event["run_id"];
  if (typeof runId !== "string") return undefined;
  const type = String(event["type"]);
  const opening = type === "run.started";
  if (opening && typeof event["space_id"] !== "string") {
    return refusal("invalid", "a run starts in a space: run.started names one");
  }
  if (run === null) {
    if (opening) return undefined;
    return refusal(
      "unknown_run",
      `no run ${runId} in this workspace; a run begins with run.started`,
    );
  }
  // A lane's lead answers an approval in the specialist's run (M5.5): rule 9 says whether.
  const deciding = type === "approval.resolved";
  if (sender.kind === "harness" && run.harness_id !== sender.participantId && !deciding) {
    return refusal("wrong_run", `run ${runId} was started by another harness`);
  }
  const space = event["space_id"];
  if (typeof space === "string" && run.space_id !== null && space !== run.space_id) {
    return refusal("wrong_run", `run ${runId} belongs to another space`);
  }
  const accepted = runAccepts(run.state as RunState, type);
  return accepted.ok ? undefined : refusal("run_state", `${type} was refused: ${accepted.reason}`);
}

/**
 * Rule 5: the space the event names. Answering an approval, or handing one on, is the exception
 * (M5.5; ADR 0042): the lane's lead is not in the specialist's room, and neither is a person
 * policy named from elsewhere in the workspace. Rule 9 — which insists policy named them — is
 * what lets both in, and is where the room is still required of an ask that named nobody.
 */
export function refuseOnMembership(
  event: Readonly<Record<string, unknown>>,
  role: AuthorizeContext["role"],
): Refusal | undefined {
  if (typeof event["space_id"] !== "string" || event["type"] === "space.created") {
    return undefined;
  }
  if (ANSWERS.has(String(event["type"]))) return undefined;
  if (role === null) {
    return refusal(
      "wrong_space",
      "an event may only be sent into a space its sender is a member of",
    );
  }
  return undefined;
}

/**
 * Rule 7: a change to a space comes from somebody with standing in it. `space.updated` needs a
 * space and something to change; a harness changes only a space it opened; a guest changes
 * nothing; a person neither retitles nor closes a space whose changes are locked (ADR 0156);
 * adding somebody as the space's owner takes its owner, or an owner or admin of the workspace; and
 * removing somebody else takes the space's owner, where leaving takes nobody's leave. Rule 5 has
 * already said the sender is in the space at all.
 */
export function refuseOnSpaceChange(
  event: Readonly<Record<string, unknown>>,
  sender: Sender,
  role: AuthorizeContext["role"],
  space: AuthorizeContext["space"],
): Refusal | undefined {
  const type = String(event["type"]);
  if (!SPACE_CHANGES.has(type)) return undefined;
  if (type === "space.updated") return refuseOnSpaceUpdate(event, sender, role, space);
  // Rule 13's second half: whoever is in the room is in its threads, and nobody else.
  if (space?.parent_space_id != null) {
    return refusal(
      "invalid",
      "a thread has no members of its own: whoever is in the space is in its threads",
    );
  }
  // Leaving is anyone's, whatever their standing.
  if (
    type === "membership.removed" &&
    selvesIn(sender, event).includes(String(event["participant_id"]))
  ) {
    return undefined;
  }
  if (role === "guest") return refusal("wrong_role", "a guest may not change who is in a space");
  // An owner or admin of the workspace stands as the room's owner does, in any space they are in.
  if (role === "owner" || administers(sender.role)) return undefined;
  if (type === "membership.removed") {
    return refusal("wrong_role", "only the owner of a space removes somebody else from it");
  }
  if (event["role"] === "owner") {
    return refusal("wrong_role", "only the owner of a space makes somebody else its owner");
  }
  return undefined;
}

function refuseOnSpaceUpdate(
  event: Readonly<Record<string, unknown>>,
  sender: Sender,
  role: AuthorizeContext["role"],
  space: AuthorizeContext["space"],
): Refusal | undefined {
  if (space === null) return refusal("unknown_space", "no such space in this workspace");
  if (event["title"] === undefined && event["state"] === undefined && event["home"] === undefined) {
    return refusal("invalid", "a space.updated says what changed: a title, a state or a home");
  }
  if (sender.kind === "harness") return refuseHarnessOnSpaceUpdate(event, sender, role, space);
  if (role === "guest") return refusal("wrong_role", "a guest may not retitle or close a space");
  // The harness's home is its to name, and stays on the list (ADR 0069).
  if (event["home"] !== undefined) {
    return refusal("wrong_role", "only the harness that opened a space makes it its home");
  }
  if (space.home === true && event["state"] === "closed") {
    return refusal("invalid", "a harness's home is always there: it is not archived");
  }
  return refuseWhileLocked(event, space);
}

/**
 * A room whose changes a person locked (ADR 0156) is neither renamed nor archived by a person
 * until somebody lets them go; one archived may still be brought back. A harness's own rename or
 * close of a room it opened is not asked this, so that what it keeps and what Chips shows stay
 * one.
 */
function refuseWhileLocked(
  event: Readonly<Record<string, unknown>>,
  space: SpaceFacts,
): Refusal | undefined {
  if (space.locked !== true) return undefined;
  if (event["title"] === undefined && event["state"] !== "closed") return undefined;
  return refusal("invalid", "this space's changes are locked: unlock them in its sheet first");
}

/**
 * A harness changes a space it opened. It may also name as its home the direct room it was handed
 * when it was added, which a person opened — never a group room: a harness does not keep people's
 * rooms on their lists (ADR 0069).
 */
function refuseHarnessOnSpaceUpdate(
  event: Readonly<Record<string, unknown>>,
  sender: Sender,
  role: AuthorizeContext["role"],
  space: SpaceFacts,
): Refusal | undefined {
  if (space.opened_by === sender.participantId) return undefined;
  const homeOnly = event["title"] === undefined && event["state"] === undefined;
  if (homeOnly && space.kind === "direct" && role !== null) return undefined;
  return refusal("not_the_opener", "a harness retitles or closes only a space it opened");
}

/** Rule 8: somebody added to a space is somebody, and still here. */
export function refuseOnParticipant(
  event: Readonly<Record<string, unknown>>,
  participant: AuthorizeContext["participant"],
): Refusal | undefined {
  if (event["type"] !== "membership.added") return undefined;
  if (participant === null) {
    return refusal("unknown_participant", "nobody in this workspace has that id");
  }
  if (participant.removed === true && participant.kind === "agent") {
    return refusal("agent_deleted", "that agent was deleted");
  }
  if (participant.removed === true) {
    const who = participant.kind === "person" ? "person" : "harness";
    return refusal("invalid", `that ${who} was removed from the workspace`);
  }
  return undefined;
}

/**
 * Rule 16 (ADR 0087, rules 1 and 7): an agent is in one room at a time. One in another room is
 * refused, with where it is, so a client can offer to move it. The Main agent is only ever in its
 * Main room, and a Main room takes people and no other agent. An archived room takes no agent
 * until it is unarchived. An agent archived in its harness joins nothing.
 *
 * Most of that is `refuseAgentInto`, which the store asks again inside the append's transaction
 * of every path that puts an agent in a room (agents review, findings 5 to 8). Two things are the
 * door's alone, because Chips itself may do them: a person does not put the Main agent in a room
 * that is not a Main room, and does not add an agent archived in its harness.
 */
export function refuseOnAgentMembership(
  event: Readonly<Record<string, unknown>>,
  participant: AuthorizeContext["participant"],
  space: AuthorizeContext["space"],
): Refusal | undefined {
  if (event["type"] !== "membership.added" || participant?.kind !== "agent") return undefined;
  if (participant.lead === true && space?.home !== true) {
    return refusal("lead_room", "the Main agent stays in its Main space");
  }
  const placed = refuseAgentInto({
    agent: { id: participant.id, lead: participant.lead === true },
    room:
      space === null
        ? null
        : { space_id: space.space_id, state: space.state, home: space.home === true },
    elsewhere: participant.room ?? null,
    others: participant.others ?? 0,
    replacesLead: false,
  });
  // A Main room's own refusal comes first, as it did: it is the more lasting reason.
  if (placed?.kind === "lead_room") return placed;
  if (participant.archived === true) {
    return refusal("agent_archived", "that agent is archived");
  }
  return placed;
}

/**
 * Rule 16's last part (his call of 19 October 2026, ADR 0034's addendum): a person puts an agent in
 * a room, or a harness as its default agent, only as they would move it, as its harness's owner or
 * an owner or admin of the workspace. A member could put a free agent of the owner's in their room
 * by its id, though no list of theirs showed it; it runs on the owner's computer and account.
 */
export function refuseAgentNotTheirs(
  event: Readonly<Record<string, unknown>>,
  sender: Sender,
  participant: AuthorizeContext["participant"],
): Refusal | undefined {
  if (event["type"] !== "membership.added" || sender.kind !== "person") return undefined;
  if (participant?.kind !== "agent" && participant?.kind !== "harness") return undefined;
  if (administers(sender.role) || participant.owner === sender.participantId) return undefined;
  return refusal(
    "wrong_role",
    "an agent is put in a space by its harness's owner, or an owner or admin of the workspace",
  );
}

/**
 * Rule 11's rank in a room (JR-23; his call of 20 October 2026, ADR 0034's addendum): an owner of
 * the workspace is taken out of a room by an owner alone, as only an owner changes an owner's role.
 * Their agents answer a room only while they are in it (ADR 0204's addendum), so an admin who took
 * the owner out left the room quiet for everybody. Leaving stays anyone's.
 */
export function refuseOwnerOut(
  event: Readonly<Record<string, unknown>>,
  sender: Sender,
  participant: AuthorizeContext["participant"],
): Refusal | undefined {
  if (event["type"] !== "membership.removed" || participant?.standing !== "owner") return undefined;
  if (sender.role === "owner" || selvesIn(sender, event).includes(participant.id)) return undefined;
  return refusal("wrong_role", "only an owner of the workspace takes an owner out of a space");
}

/**
 * Rule 17 (ADR 0087, rule 7; agents review, finding 9): the Main agent is not taken out of its
 * Main room. The room would say it has no agent, would offer only people to add, and nothing a
 * person can reach would put the Main agent back.
 */
export function refuseOnLeadRemoval(
  event: Readonly<Record<string, unknown>>,
  participant: AuthorizeContext["participant"],
  space: AuthorizeContext["space"],
): Refusal | undefined {
  if (event["type"] !== "membership.removed") return undefined;
  if (participant?.kind !== "agent" || participant.lead !== true || space?.home !== true) {
    return undefined;
  }
  return refusal("lead_room", "the Main agent stays in its Main space");
}

/**
 * Rule 15: a room asked of a harness. Asked of one that takes new spaces, for it to claim under
 * a key of its own — so not a thread, which is its parent's, and not a room that has a key
 * already. Anything that does not ask is not asked.
 */
export function refuseOnAsking(
  event: Readonly<Record<string, unknown>>,
  participant: AuthorizeContext["participant"],
): Refusal | undefined {
  if (event["type"] !== "space.created" || event["asked_of"] === undefined) return undefined;
  if (event["kind"] === "thread") {
    return refusal("invalid", "a thread is its space's; a new space is asked of a harness");
  }
  if (event["external_key"] !== undefined) {
    return refusal(
      "invalid",
      "a space asked of a harness has no key yet: the harness gives it one when it claims it",
    );
  }
  if (participant === null || participant.kind !== "harness") {
    return refusal("unknown_participant", "no harness in this workspace has that id");
  }
  if (participant.removed === true) {
    return refusal("invalid", "that harness was removed from the workspace");
  }
  if (!participant.capabilities?.includes(HARNESS_CAPABILITIES.newSpaces)) {
    return refusal(
      "invalid",
      "that harness does not take new spaces: its manifest does not declare new_spaces",
    );
  }
  return undefined;
}

/**
 * Rule 9: a decision comes from who policy named, when it named anyone; a harness only when it
 * did; and an ask that names nobody is anyone's in the room but a guest's (Gate 5) — a guest is
 * named by id or not at all, since a vendor in the one room they were let into is not who the
 * owner meant by "anyone". Rule 14 rides on it: handing an approval on is for somebody who may
 * answer it, or who runs the workspace.
 *
 * Since ADR 0042 this rule carries the room as well, because rule 5 stands aside for a decision:
 * somebody policy named answers from wherever they are in the workspace, and everybody else —
 * an ask that named nobody, a guest named outside the one room they are in — must be in the
 * room, as they always had to be.
 */
export function refuseNotAnApprover(
  event: Readonly<Record<string, unknown>>,
  sender: Sender,
  approvers: AuthorizeContext["approvers"],
  role?: AuthorizeContext["role"],
  own = false,
  ask: AuthorizeContext["askAction"] = null,
): Refusal | undefined {
  const type = String(event["type"]);
  if (type === "question.answered") return refuseHarnessQuestion(event, sender, own);
  if (!ANSWERS.has(type)) return undefined;
  const routing = type === "approval.routed";
  if (sender.kind === "harness") {
    if (holdsOn(event)) {
      return refusal("invalid", "a yes that holds on is a person's to give, not a harness's");
    }
    return refuseHarnessAnswer(event, sender, approvers, routing, own, ask);
  }
  return (
    refuseStandingYes(event, ask) ??
    refuseYesForAWhile(event, ask) ??
    refuseEverywhere(event, sender) ??
    refusePersonAnswer(sender, approvers, role, routing)
  );
}

/**
 * An Always for every space changes what the harness may do everywhere, so it is an owner's or an
 * admin's to give, as the rules themselves are (SEC-1, ADR 0239); and it is said of an Always.
 */
function refuseEverywhere(
  event: Readonly<Record<string, unknown>>,
  sender: Sender,
): Refusal | undefined {
  if (event["type"] !== "approval.resolved" || event["everywhere"] !== true) return undefined;
  if (event["scope"] !== "always") {
    return refusal("invalid", "every space is said of an Always, not of a single answer");
  }
  if (!administers(sender.role)) {
    return refusal(
      "wrong_role",
      "only an owner or an admin gives an Always for every space: it changes what the harness may do everywhere",
    );
  }
  return undefined;
}

/**
 * An ask that matters is answered once (ADR 0195): This session and Always would be a standing
 * yes for money, an outside message, a deletion or something that can't be undone, and those
 * always wait for a person. Either way, yes or no; the card offers neither.
 */
export function refuseStandingYes(
  event: Readonly<Record<string, unknown>>,
  ask: AuthorizeContext["askAction"],
): Refusal | undefined {
  if (event["type"] !== "approval.resolved") return undefined;
  const scope = event["scope"];
  if (scope !== "session" && scope !== "always") return undefined;
  if (ask === null || ask === undefined) return undefined;
  if (actionMatters(ask)) {
    return refusal(
      "invalid",
      "an ask that matters is answered once: This session and Always are not given for money, outside messages, deletions or anything that can't be undone",
    );
  }
  return refuseStandingCommand(ask.command);
}

/** A yes that holds on past its ask: for a while, or until a person stops it (ADR 0281). */
function holdsOn(event: Readonly<Record<string, unknown>>): boolean {
  return event["for_minutes"] !== undefined || event["until_stopped"] !== undefined;
}

/**
 * A yes that holds on in the space, for a while (ADR 0239, addendum of 6 November 2026) or until
 * a person stops it (ADR 0281), is a yes given once: never with This session or Always, never a
 * no, never both at once, and never for an ask that matters. It reaches every other ask, commands
 * Chips can't read and those on the never list too, so a command is not looked at.
 */
export function refuseYesForAWhile(
  event: Readonly<Record<string, unknown>>,
  ask: AuthorizeContext["askAction"],
): Refusal | undefined {
  if (event["type"] !== "approval.resolved" || !holdsOn(event)) return undefined;
  if (event["for_minutes"] !== undefined && event["until_stopped"] !== undefined) {
    return refusal("invalid", "a yes holds for a while or until it is stopped, not both");
  }
  if ((event["scope"] ?? "once") !== "once") {
    return refusal("invalid", "a yes that holds on is given once, not with This session or Always");
  }
  if (event["decision"] !== "approved" && event["decision"] !== "edited") {
    return refusal("invalid", "only a yes holds on");
  }
  if (ask === null || ask === undefined || !actionMatters(ask)) return undefined;
  return refusal(
    "invalid",
    "an ask that matters is answered once: a yes that holds on is not given for money, outside messages, deletions or anything that can't be undone",
  );
}

/**
 * A standing yes on a command is remembered part by part (ADR 0239), so a command that can't be
 * read that way, or that uses one never given a standing yes, is answered once.
 */
function refuseStandingCommand(
  command: string | readonly string[] | undefined,
): Refusal | undefined {
  if (command === undefined) return undefined;
  const parts = commandParts(command);
  if (parts === undefined) {
    return refusal(
      "invalid",
      "a command Chips can't read part by part is answered once: This session and Always are not given for it",
    );
  }
  const never = neverStanding(parts);
  if (never === undefined) return undefined;
  return refusal(
    "invalid",
    `a command that uses ${never} is answered once: This session and Always are not given for it`,
  );
}

/** Rule 9 for a person: named, or anyone in the room but a guest when nobody was named. */
function refusePersonAnswer(
  sender: Sender,
  approvers: AuthorizeContext["approvers"],
  role: AuthorizeContext["role"] | undefined,
  routing: boolean,
): Refusal | undefined {
  if (approvers === null || approvers.length === 0) return refuseOnAnyone(sender, role);
  // A guest is in one room and answers there: being named does not take them out of it.
  if (isGuest(sender.role) && role === null) {
    return refusal("wrong_space", "a guest answers only in the space they are in");
  }
  if (approvers.includes(sender.participantId)) return undefined;
  if (routing && administers(sender.role)) return undefined;
  return refusal(
    "not_an_approver",
    routing
      ? "that approval is somebody else's to hand on: policy named who may answer it"
      : "that approval is somebody else's to answer: policy named who may",
  );
}

/**
 * An ask that named nobody: anyone in the room but a guest, which is where rule 9 still asks
 * for the room, rule 5 having stood aside for every decision since ADR 0042.
 */
function refuseOnAnyone(sender: Sender, role?: AuthorizeContext["role"]): Refusal | undefined {
  if (role === null) {
    return refusal(
      "wrong_space",
      "an approval that names nobody is answered in the space: this sender is not in it",
    );
  }
  return isGuest(sender.role) || role === "guest"
    ? refusal(
        "not_an_approver",
        "an approval that names nobody is anyone's in the space but a guest's",
      )
    : undefined;
}

/**
 * Whether a decision is a harness settling its own ask: the ask is of the run the event names,
 * and that run is the sender's. Anything else a harness answers, policy must have handed it.
 */
export function settlesItsOwn(
  sender: Sender,
  run: RunFacts | null,
  askRun: AuthorizeContext["askRun"],
): boolean {
  return (
    sender.kind === "harness" &&
    run !== null &&
    typeof askRun === "string" &&
    askRun === run.run_id &&
    run.harness_id === sender.participantId
  );
}

/**
 * A harness decides only what policy handed it, and hands nothing on — or it settles an ask of
 * its own run that was answered in its own tools (OpenClaw test, finding 5), so the card cools
 * rather than waiting out its expiry.
 */
function refuseHarnessAnswer(
  event: Readonly<Record<string, unknown>>,
  sender: Sender,
  approvers: AuthorizeContext["approvers"],
  routing: boolean,
  own: boolean,
  ask: AuthorizeContext["askAction"],
): Refusal | undefined {
  if (routing) return refusal("not_an_approver", "an approval is handed on by a person");
  if (selvesIn(sender, event).some((self) => approvers?.includes(self))) return undefined;
  if (own) return refuseSettling(event, ask);
  return refusal(
    "not_an_approver",
    "a harness answers only an approval policy handed it, or settles one its own run asked",
  );
}

/**
 * What a harness's own answer may say: that ask, decided, and nothing beyond it. This session
 * and Always are rules a person makes; an expiry is Chips's, when nobody answered. And only an
 * ask that does not matter (SEC-10, ADR 0195): money, outside messages, deletions and anything
 * irreversible wait for a person, whatever the harness's own window said, so the audit shows a
 * person's yes for each of them.
 */
function refuseSettling(
  event: Readonly<Record<string, unknown>>,
  ask: AuthorizeContext["askAction"],
): Refusal | undefined {
  const scope = event["scope"];
  if (scope !== undefined && scope !== "once") {
    return refusal(
      "invalid",
      "a harness settles its own ask once: This session and Always are a person's to give",
    );
  }
  if (event["decision"] === "expired") {
    return refusal("invalid", "an expiry is Chips's to say, when nobody answered");
  }
  if (ask !== null && ask !== undefined && actionMatters(ask)) {
    return refusal(
      "not_an_approver",
      "a harness settles its own ask only when it does not matter: money, outside messages, deletions and anything that can't be undone wait for a person",
    );
  }
  return undefined;
}

/** A harness answers only a question its own run asked, as it was answered in its own tools. */
function refuseHarnessQuestion(
  event: Readonly<Record<string, unknown>>,
  sender: Sender,
  own: boolean,
): Refusal | undefined {
  if (sender.kind !== "harness") return undefined;
  if (!own) {
    return refusal("not_an_approver", "a harness answers only a question its own run asked");
  }
  if (event["timed_out"] === true) {
    return refusal("invalid", "a timeout is Chips's to say, when nobody answered");
  }
  return undefined;
}

/**
 * Rule 10: feedback is on a message somebody said, in the space the event names, and says
 * what it is. A reaction carries its emoji and goes on anyone's message (M5.4); a correction
 * carries its note and goes only on an agent's or a harness's, since it is the harness that
 * reads it (since ADR 0087 an agent says every reply; until 18 October 2026 this asked for a
 * harness's, and refused Not right? on all of them, PM-3). A message nobody sent, one taken
 * back, a system line, or one in another space takes none.
 */
export function refuseOnFeedback(
  event: Readonly<Record<string, unknown>>,
  message: AuthorizeContext["message"],
): Refusal | undefined {
  if (event["type"] !== "feedback") return undefined;
  return feedbackSays(event) ?? feedbackTarget(event, message);
}

/**
 * A reply answers a message said in the room it is said in (ADR 0219). One that names no message,
 * or a message in another space, is refused as feedback on it would be, rather than kept and
 * ignored. A message taken back can still be answered: the reply was written to it.
 */
export function refuseOnReply(
  event: Readonly<Record<string, unknown>>,
  message: AuthorizeContext["message"],
): Refusal | undefined {
  if (event["type"] !== "message.post" || typeof event["reply_to"] !== "string") return undefined;
  if (message === null) {
    return refusal("unknown_message", "a reply answers a message, and there is no such message");
  }
  return inTheSpaceNamed(event, message);
}

function feedbackSays(event: Readonly<Record<string, unknown>>): Refusal | undefined {
  const kind = event["kind"];
  if (kind === "reaction" && typeof event["reaction"] !== "string") {
    return refusal("invalid", "a reaction says which: `reaction` carries the emoji");
  }
  if (kind === "correction" && typeof event["text"] !== "string") {
    return refusal("invalid", "a correction says what went wrong: `text` carries the note");
  }
  return undefined;
}

function feedbackTarget(
  event: Readonly<Record<string, unknown>>,
  message: AuthorizeContext["message"],
): Refusal | undefined {
  if (message === null) return refusal("unknown_message", "no such message in this workspace");
  if (message.deleted === true) {
    return refusal("wrong_message", "that message was taken back, and takes nothing more");
  }
  if (event["kind"] === "correction" && !isAgentKind(message.author_kind)) {
    return refusal(
      "wrong_message",
      "a correction is on a message an agent said, and that one is not",
    );
  }
  if (message.author_kind === "system") {
    return refusal("wrong_message", "that line is Chips' own, and takes no feedback");
  }
  return inTheSpaceNamed(event, message);
}

function inTheSpaceNamed(
  event: Readonly<Record<string, unknown>>,
  message: MessageFacts,
): Refusal | undefined {
  const space = event["space_id"];
  if (typeof space === "string" && message.space_id !== null && message.space_id !== space) {
    return refusal("wrong_message", "that message is in another space");
  }
  return undefined;
}

/**
 * Rule 12: a message is changed by those with standing over it (M5.4). Its author edits it;
 * its author, the space's owner, or an owner or admin of the workspace takes it back; anyone
 * in the space but a guest pins it or lets it go. One taken back is left alone — a second
 * deletion or an unpin of it is a retry, and harmless. Rule 5 has already said the sender is
 * in the space; rule 2, by direction, that a pin is a person's. Deleting a message for oneself,
 * and Undo (ADR 0167), change nobody else's room, so anyone in it may, a guest too, on any
 * message there, one taken back included: its tombstone can go from their screen as well.
 */
export function refuseOnMessageChange(
  event: Readonly<Record<string, unknown>>,
  sender: Sender,
  role: AuthorizeContext["role"],
  message: AuthorizeContext["message"],
): Refusal | undefined {
  const type = String(event["type"]);
  if (!MESSAGE_CHANGES.has(type)) return undefined;
  if (message === null) return refusal("unknown_message", "no such message in this workspace");
  const elsewhere = inTheSpaceNamed(event, message);
  if (elsewhere !== undefined) return elsewhere;
  if (FOR_ONESELF.has(type)) return undefined;
  const mine = saidBy(sender, event, message);
  if (type === "message.deleted") return refuseDeletion(sender, role, mine);
  if (message.deleted === true && type !== "message.unpinned") {
    return refusal("wrong_message", "that message was taken back, and is left alone");
  }
  if (type === "message.edited") {
    return mine ? undefined : refusal("wrong_role", "a message is edited by its author alone");
  }
  return role === "guest"
    ? refusal("wrong_role", "a guest may not pin a message, or let one go")
    : undefined;
}

/** Whether the sender said the message: itself, or as the agent it speaks as (ADR 0087). */
function saidBy(
  sender: Sender,
  event: Readonly<Record<string, unknown>>,
  message: MessageFacts,
): boolean {
  if (message.author_id === sender.participantId && message.author_kind === sender.kind) {
    return true;
  }
  const actor = actorOf(event);
  return (
    actor.kind === "agent" && message.author_id === actor.id && message.author_kind === "agent"
  );
}

function refuseDeletion(
  sender: Sender,
  role: AuthorizeContext["role"],
  mine: boolean,
): Refusal | undefined {
  if (mine || role === "owner" || administers(sender.role)) return undefined;
  return refusal(
    "wrong_role",
    "a message is taken back by its author, the space's owner, or an admin of the workspace",
  );
}

/**
 * Rule 13: a thread grows in a space its opener is in — `role` and `space` are the opener's
 * standing in, and the facts of, that space — which is open and not a thread itself, from a
 * message in it that has no thread yet, when it names one. A `space.created` that is not a
 * thread is not asked; rule 11 has already said a guest of the workspace opens no space.
 */
export function refuseOnThread(
  event: Readonly<Record<string, unknown>>,
  role: AuthorizeContext["role"],
  space: AuthorizeContext["space"],
  message: AuthorizeContext["message"],
): Refusal | undefined {
  if (event["type"] !== "space.created") return undefined;
  const parent = event["parent_space_id"];
  if ((event["kind"] === "thread") !== (typeof parent === "string")) {
    return refusal("invalid", "a thread names the space it grows in, and only a thread does");
  }
  if (typeof parent !== "string") return undefined;
  if (space === null) return refusal("unknown_space", "no such space in this workspace");
  if (role === null) return refusal("wrong_space", "a thread is opened by somebody in the space");
  if (space.parent_space_id != null) {
    return refusal("invalid", "a thread grows in a space, not in another thread");
  }
  if (space.state === "closed") return refusal("invalid", "a closed space takes no new thread");
  return threadRoot(event, parent, message);
}

function threadRoot(
  event: Readonly<Record<string, unknown>>,
  parent: string,
  message: AuthorizeContext["message"],
): Refusal | undefined {
  if (typeof event["root_message_id"] !== "string") return undefined;
  if (message === null) return refusal("unknown_message", "no such message in this workspace");
  if (message.space_id !== parent) {
    return refusal("wrong_message", "a thread grows from a message in the space it is opened in");
  }
  if (message.deleted === true) {
    return refusal("wrong_message", "that message was taken back, and grows no thread");
  }
  if (message.thread_id != null) {
    return refusal("wrong_message", `that message already has a thread: ${message.thread_id}`);
  }
  return undefined;
}

/** Rule 6: first answer wins — and a decision made is not handed on (rule 14). */
export function refuseSecondAnswer(
  event: Readonly<Record<string, unknown>>,
  decidedBy: AuthorizeContext["decidedBy"],
): Refusal | undefined {
  const type = String(event["type"]);
  if (!DECISIONS.has(type) && type !== "approval.routed") return undefined;
  if (decidedBy === null) return undefined;
  const what = type === "question.answered" ? "question" : "approval";
  return refusal(
    "already_decided",
    `that ${what} was already answered by ${decidedBy}; the first answer wins`,
  );
}

/**
 * Every rule, cheap ones first. Returns the reason to refuse, or nothing. A use case that
 * looks things up one at a time asks the rules one at a time instead, so a run that refuses
 * costs no membership query; this is the same rules with everything already in hand.
 */
export function authorize(
  event: Readonly<Record<string, unknown>>,
  sender: Sender,
  context: AuthorizeContext,
): Refusal | undefined {
  return (
    refuseWithoutLookup(event, sender) ??
    refuseOnRun(event, sender, context.run) ??
    refuseOnMembership(event, context.role) ??
    refuseOnSpaceChange(event, sender, context.role, context.space) ??
    refuseOnParticipant(event, context.participant) ??
    refuseOnAgentMembership(event, context.participant, context.space) ??
    refuseAgentNotTheirs(event, sender, context.participant) ??
    refuseOwnerOut(event, sender, context.participant) ??
    refuseOnLeadRemoval(event, context.participant, context.space) ??
    refuseOnAsking(event, context.participant) ??
    refuseOnWorkspaceRole(event, sender, context.target, context.guestSpaces) ??
    refuseOnFeedback(event, context.message) ??
    refuseOnReply(event, context.message) ??
    refuseOnMessageChange(event, sender, context.role, context.message) ??
    refuseOnThread(event, context.role, context.space, context.message) ??
    refuseSecondAnswer(event, context.decidedBy) ??
    refuseNotAnApprover(
      event,
      sender,
      context.approvers,
      context.role,
      settlesItsOwn(sender, context.run, context.askRun),
      context.askAction ?? null,
    )
  );
}
