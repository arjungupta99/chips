/**
 * The one way an event gets into Chips.
 *
 * Whatever the transport — a hook's `POST`, a socket frame, the CLI — an event arrives here,
 * is validated once against its schema, is checked against who is sending it, and is appended
 * with its projections in a single transaction (technical-plan 6.1). Everything downstream
 * trusts the result without revalidating.
 *
 * Who may append what is one function in the domain, `authorize` (ADR 0022): the sender, the
 * workspace, the direction, the key, the run, the space, and first answer wins. This use
 * case gathers what those rules need through its ports, cheapest rules first, and asks.
 *
 * What Chips fills in, because the sender should not have to and must not be able to: the
 * clock; who decided; `from` on a steer and on feedback, from the credential and the
 * membership; the run's space, when a hook posts to the run and names no space, and the
 * message's, when feedback names none; the workspace cap on a policy change that names none;
 * a cost on `usage` that carries none; and, since M3.3, what kind of participant a membership
 * names, the `mentions` a message's @handles resolve to against the space's members, and the
 * people an approval's `approvers` come down to — never a harness the asking harness named
 * itself, and never a harness at all for money, a deletion or an external action (Gate 5).
 *
 * And what Chips decides, as events of its own: an approval request is put to the policy engine
 * the moment it arrives, and an `allow` or a `deny` is an `approval.resolved` by `system`, logged
 * beside the request (technical-plan M1.4: auto-approvals logged as events); a decision made
 * "always" becomes a rule in the harness's policy, as a `policy.updated`.
 */

import type { Logger } from "@chipschat/platform";
import {
  type Address,
  type AddressInput,
  askedCommand,
  DEFAULT_EXCHANGE_LIMITS,
  type ExchangeLimits,
  eventDefinition,
  handlesIn,
  isAgentKind,
  isId,
  mayHoldName,
  mentionsEveryone,
  type PolicyRule,
  parseEvent,
  passIfNothingSaid,
  pickAgentName,
  resolveAddress,
  resolveMentions,
  type StandingOffer,
  standingOffer,
} from "@chipschat/protocol";
import {
  type ApproverFacts,
  type AuthorizeContext,
  approversFor,
  DEFAULT_APPROVERS,
  type Decision,
  estimateCost,
  evaluate,
  isGuest,
  type MessageFacts,
  matters,
  namedInPerson,
  type ParticipantFacts,
  type PolicyAction,
  type Refusal,
  type RoleTarget,
  type RunFacts,
  refuseAgentNotTheirs,
  refuseCapsOverCeiling,
  refuseLimits,
  refuseNotAnApprover,
  refuseOnAgentMembership,
  refuseOnAsking,
  refuseOnFeedback,
  refuseOnLeadRemoval,
  refuseOnMembership,
  refuseOnMessageChange,
  refuseOnParticipant,
  refuseOnReply,
  refuseOnRun,
  refuseOnSpaceChange,
  refuseOnThread,
  refuseOnWorkspaceRole,
  refuseOwnerOut,
  refuseReopening,
  refuseSecondAnswer,
  refuseWithoutLookup,
  resolveApprovers,
  type SpaceFacts,
  settlesItsOwn,
} from "../../domain/index.js";
import { type AgentDeps, defaultAgentOf, takenNames } from "../agents.js";
import type { UploadsRegistry } from "../ports/attachments.js";
import type { Principal } from "../ports/identity.js";
import {
  AppendRefused,
  type Clock,
  type EventStore,
  type IdGenerator,
  type LaneView,
  type MemberView,
  type ParticipantView,
  type ReadModels,
  type RunView,
  type SpaceView,
  type StoredEvent,
} from "../ports/index.js";
import { fillMadeFrom } from "../room-files.js";
import { attachmentOf } from "./uploads.js";

/** A brand-new harness, before anyone has set a dial: ask first, capped at the default. */
const DEFAULT_AUTONOMY = 1;
const DEFAULT_WORKSPACE_MAX = 2;

export type SubmitFailure =
  | {
      readonly kind: "invalid";
      readonly message: string;
      readonly issues?: readonly { path: string; message: string }[];
    }
  | { readonly kind: "not_submittable"; readonly message: string }
  | Refusal;

export interface SubmitResult {
  readonly event: StoredEvent;
  readonly duplicate: boolean;
  /** What policy did with an approval request as it arrived: allowed or denied it, as an event. */
  readonly resolution?: StoredEvent | undefined;
  /**
   * For a `task` that opened a lane: where the lane lives and which run it is, so a lead that
   * drives the lane itself knows where to post (M3.5). Absent when the task was flattened.
   */
  readonly lane?: LaneOpened | undefined;
  /**
   * For a message Chips held from the agents it named (ADR 0097): the messages agents had sent
   * agents in the room since the reset, this one included, and the workspace's hold (ADR 0187),
   * absent where it holds them only on a pause. The sender's acknowledgement says so, so its
   * adapter can tell the model.
   */
  readonly held?: { readonly count: number; readonly allowance?: number } | undefined;
}

/**
 * What a sender is told of its message Chips held from the agents it named (ADR 0097): that it
 * was held, and the count against the ceiling. Nothing for one that went.
 */
export function heldOf(
  held: { readonly count: number; readonly allowance?: number } | undefined,
): Record<string, unknown> {
  return held === undefined ? {} : { held: true, exchange: held };
}

export interface LaneOpened {
  readonly lane_id: string;
  readonly run_id: string;
  readonly space_id: string;
}

export interface SubmitEventDeps {
  readonly store: EventStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** The uploads a message may attach by id. */
  readonly uploads: Pick<UploadsRegistry, "find">;
  /** What the rules and the fills need. One indexed lookup per rule that applies. */
  readonly readModels: Pick<
    ReadModels,
    | "memberRole"
    | "sessionInSpace"
    | "run"
    | "priceTable"
    | "approval"
    | "question"
    | "harnessPolicy"
    | "workspacePolicy"
    | "sessionRules"
    | "participant"
    | "membersOf"
    | "laneByRun"
    | "space"
    | "message"
    | "lane"
    | "workspaceRole"
    | "ownerCount"
    | "spaceCountFor"
    | "lastAddressed"
    | "exchangeOf"
    | "agentByKey"
    | "participantsIn"
    | "heldNames"
    | "replacedIn"
    | "agentRoom"
    | "isMember"
    | "agentsOf"
    | "roomsHolding"
    | "attachmentFact"
  >;
  /**
   * What Chips does with a lane event after it is in: a `task` becomes a lane, a lane run's news
   * reaches its lead (M3.1). Injected, because routing needs read models this use case does not,
   * and because a test of the door itself wants to watch the event land without it (ADR 0029).
   */
  readonly routeLane?: (event: StoredEvent, principal: Principal) => Promise<StoredEvent[]>;
  /**
   * What Chips tells a sleeping phone about an ask that needs a person (M4.3). Injected for the
   * same reason as `routeLane`, and best effort besides: it never throws, and an append does not
   * wait on a push service to answer well.
   */
  readonly notify?: (event: StoredEvent, resolution: StoredEvent | undefined) => Promise<void>;
  /**
   * What Chips does before somebody is taken out of a room: an agent's work there is stopped
   * while its harness is still in the room to hear it (agents review, finding 12). Injected, as
   * routing is: it appends, and a test of the door wants to watch the event land without it.
   */
  readonly leaving?: (event: Readonly<Record<string, unknown>>) => Promise<void>;
  /**
   * What Chips does once a room is archived: nobody has it pinned any more (ADR 0240's addendum).
   * Injected, as `leaving` is.
   */
  readonly archived?: (workspaceId: string, spaceId: string) => Promise<void>;
  /**
   * The most the server takes in one upload (ADR 0047). A workspace cap set above it is
   * refused as it is sent; absent, and any cap is accepted.
   */
  readonly maxAttachmentBytes?: number | undefined;
  /**
   * Told the fields a sender wrote that the protocol does not declare, which the schema dropped
   * (ADR 0162): an event is still taken without them, and a bridge's author would never know.
   */
  readonly dropped?: ((dropped: DroppedFields) => void) | undefined;
  /**
   * Whether a commit is on the room's project's `main`, made by that agent (ADR 0222), for a post's
   * `change`. Absent where rooms have no projects, and every `change` is left off.
   */
  readonly changeBy?:
    | ((spaceId: string, commit: string, agentId: string) => Promise<boolean>)
    | undefined;
  /** Told of a post's `change` left off, for the log. */
  readonly changeLeftOff?:
    | ((left: { principal: Principal; spaceId: string; change: string }) => void)
    | undefined;
}

/** What an event lost at the edge: its type, the fields, and who sent them. */
export interface DroppedFields {
  readonly principal: Principal;
  readonly type: string;
  readonly fields: readonly string[];
}

/** How many sender-and-field pairs the log remembers saying; past it, nothing more is said. */
const DROPPED_REMEMBERED = 1000;

/**
 * Fields a sender wrote that the protocol does not declare, said in the log once per sender and
 * field (ADR 0162). Chips takes the event without them, so a bridge that misspells one, or
 * writes one from a newer protocol, would otherwise never hear it went nowhere.
 */
export function droppedInTheLog(logger: Pick<Logger, "warn">): (dropped: DroppedFields) => void {
  const said = new Set<string>();
  return ({ principal, type, fields }) => {
    const fresh = fields.filter((field) => {
      const key = `${principal.participantId}:${type}.${field}`;
      if (said.has(key) || said.size >= DROPPED_REMEMBERED) return false;
      said.add(key);
      return true;
    });
    if (fresh.length === 0) return;
    logger.warn(
      { sender: principal.participantId, type, fields: fresh },
      "an event's fields were dropped: the protocol does not declare them",
    );
  };
}

export interface SubmitEventInput {
  /** The raw thing off the wire. Nothing has looked at it yet. */
  readonly event: unknown;
  readonly principal: Principal;
  /** Supplied by the transport when the event body does not carry one. */
  readonly idempotencyKey?: string | undefined;
  /** Set by `POST /v1/runs/:id/events`, where the run is in the path rather than the body. */
  readonly runId?: string | undefined;
}

type Outcome = { ok: true; value: SubmitResult } | { ok: false; error: SubmitFailure };

export function createSubmitEvent(deps: SubmitEventDeps) {
  return async function submitEvent(input: SubmitEventInput): Promise<Outcome> {
    const { principal } = input;
    const validated = await validate(input, deps);
    if (!validated.ok) return validated;
    const event = validated.value;

    const early =
      (await speakerOf(event, principal, deps)) ??
      refuseWithoutLookup(event, principal) ??
      refuseCapsOverCeiling(event, deps.maxAttachmentBytes) ??
      refuseLimits(event);
    if (early !== undefined) return { ok: false, error: early };

    await holdIfFree(event, principal, deps);
    const gathered = await gather(event, principal, deps);
    if (!gathered.ok) return gathered;
    const context = gathered.value;
    const unsaid =
      refuseRoomless(event) ?? (await fillMadeFrom(event, principal.workspaceId, deps.readModels));
    if (unsaid !== undefined) return { ok: false, error: unsaid };
    await keepChange(event, principal, deps);

    fillSpeakerRole(event, context);
    await priceUsage(event, principal, deps);
    await fillMentions(event, principal, deps);
    const talked = await fillAddress(event, principal, deps);
    const named = await nameWhoMayAnswer(event, principal, context, deps);
    if (!named.ok) return named;
    // An agent's `NO_REPLY` alone is its turn passed (ADR 0105), once it has passed every rule a
    // message does, so an agent that may not speak in the room is refused as it would be.
    passIfNothingSaid(event);
    return land(event, principal, context, deps, named.value, talked);
  };
}

/**
 * A message is said in a room. One that names none, and no run that has one, used to be stored
 * with no room, and an event with no room goes to everybody in the workspace: a harness posting
 * as itself reached every person, guest and harness (agents review, finding 3). An agent in no
 * room is held before this; whatever is left with no room by here is refused.
 */
function refuseRoomless(event: Record<string, unknown>): Refusal | undefined {
  if (event["type"] !== "message.post" || typeof event["space_id"] === "string") return undefined;
  return {
    kind: "invalid",
    message: "a message is said in a space: name one, or the run it belongs to",
  };
}

/**
 * An event the rules let through, into the log: what Chips does first, the append, and what it
 * does after one that was not a duplicate.
 */
async function land(
  event: Record<string, unknown>,
  principal: Principal,
  context: AuthorizeContext,
  deps: SubmitEventDeps,
  verdict: Decision | undefined,
  talked?: Talked,
): Promise<Outcome> {
  if (event["type"] === "membership.removed") await deps.leaving?.(event);
  const appended = await appendOrRefusal(deps, event);
  if (!appended.ok) return appended;
  if (!appended.duplicate) await archiving(appended.event, principal, deps);
  const resolution = appended.duplicate
    ? undefined
    : await settle(appended.event, principal, context, deps, verdict);
  const lane = await laneOpenedBy(appended.event, deps);
  const hold = (talked?.limits ?? DEFAULT_EXCHANGE_LIMITS).hold;
  const held =
    appended.event.payload["held"] === true && talked !== undefined
      ? { count: talked.count + 1, ...(hold === null ? {} : { allowance: hold }) }
      : undefined;
  return {
    ok: true,
    value: { event: appended.event, duplicate: appended.duplicate, resolution, lane, held },
  };
}

/**
 * The append, with the store's own refusal as the door's (agents review, findings 5 to 8): the
 * one-room rule is asked again inside the append's transaction, so an event that passed the door
 * a moment before something else put the agent elsewhere is refused there, in the door's words.
 */
async function appendOrRefusal(
  deps: SubmitEventDeps,
  event: Record<string, unknown>,
): Promise<
  { ok: true; event: StoredEvent; duplicate: boolean } | { ok: false; error: SubmitFailure }
> {
  try {
    const appended = await deps.store.append(event as Parameters<EventStore["append"]>[0]);
    return { ok: true, ...appended };
  } catch (error) {
    if (!(error instanceof AppendRefused)) throw error;
    return { ok: false, error: error.refusal as Refusal };
  }
}

/**
 * The lane a `task` opened, read back after routing so the sender's acknowledgement can carry
 * it. Read for a duplicate too: a lead that retried the task still needs to know where the
 * lane is. Nothing for any other event, and nothing for a task that was flattened.
 */
async function laneOpenedBy(
  event: StoredEvent,
  deps: SubmitEventDeps,
): Promise<LaneOpened | undefined> {
  if (event.type !== "task") return undefined;
  const laneId = event.payload["task_id"];
  if (typeof laneId !== "string") return undefined;
  const lane = await deps.readModels.lane(event.workspace_id, laneId);
  if (lane === undefined || lane.run_id === null || lane.home_space_id === null) return undefined;
  // A lane another lead opened is not this task's, whatever id the task wore (Gate 3).
  if (lane.lead_id !== event.actor.id) return undefined;
  return { lane_id: lane.lane_id, run_id: lane.run_id, space_id: lane.home_space_id };
}

/**
 * What Chips does once an event is in and is not a duplicate: put an approval to the policy
 * engine (returning its resolution), route what just landed — a `task` opens a lane, a lane
 * run's news reaches its lead — and push an ask still waiting on a person to their phone. A
 * duplicate's work was done the first time, so this is skipped for it by the caller.
 */
async function settle(
  event: StoredEvent,
  principal: Principal,
  context: AuthorizeContext,
  deps: SubmitEventDeps,
  verdict: Decision | undefined,
): Promise<StoredEvent | undefined> {
  const resolution = await decide(event, principal, context, deps, verdict);
  await deps.routeLane?.(event, principal);
  // After the rules have had their say: a resolution means policy answered, and nobody's phone
  // needs to hear about a decision that has already been made.
  await deps.notify?.(event, resolution);
  return resolution;
}

type Validated = { ok: true; value: Record<string, unknown> } | { ok: false; error: SubmitFailure };

/** The draft, filled in, and validated once against its schema. */
async function validate(input: SubmitEventInput, deps: SubmitEventDeps): Promise<Validated> {
  const draft = draftFrom(input, deps);

  // Checked before validation: the type alone settles it, and a caller who sends a
  // well-formed `message.new` deserves the same answer as one who sends a malformed one.
  const owned = chipsOwns(String(draft["type"]));
  if (owned !== undefined) return { ok: false, error: owned };

  await fillBeforeValidation(draft, input.principal, deps);
  const named = await unknownSession(draft, input.principal, deps);
  if (named !== undefined) return { ok: false, error: named };
  const parsed = parseEvent(draft);
  if (parsed.ok) {
    if (parsed.dropped.length > 0) {
      deps.dropped?.({
        principal: input.principal,
        type: String(draft["type"]),
        fields: parsed.dropped,
      });
    }
    return { ok: true, value: parsed.value };
  }
  return {
    ok: false,
    error: {
      kind: "invalid",
      message: parsed.error.message,
      ...(parsed.error.issues === undefined ? {} : { issues: parsed.error.issues }),
    },
  };
}

export type SubmitEvent = ReturnType<typeof createSubmitEvent>;

/**
 * The refusal for an event that is Chips's own to write, or nothing when a client may send it.
 * The catalogue says which (`sender: "chips"`): what Chips produces as it delivers (`hello`,
 * `message.new`), which accepted from a client would forge a handshake or put words in another
 * participant's mouth (ADR 0018); what it works out from the log (a budget warning, a lane's
 * state); and what one of its own doors writes beside a registry or a rule: a room claimed or
 * erased, a name changed, and everything about an agent, which is made, renamed, archived, put
 * in a room and copied only by its harness's door or a use case that asks who may (agents
 * review, finding 1).
 */
function chipsOwns(type: string): SubmitFailure | undefined {
  // An event nothing declares is left for the schema to refuse, as invalid.
  if (eventDefinition(type)?.sender !== "chips") return undefined;
  return {
    kind: "not_submittable",
    message: `${type} is written by Chips itself, and is not accepted from a client`,
  };
}

/**
 * Fields that say who did something and when. Chips fills them in from the credential that
 * sent the event and from its own clock, so a decision cannot be attributed to somebody else or
 * dated to another day. A sender may repeat them; its values are replaced. `from` on a steer
 * and on feedback is the same idea with a shape: a participant ref, whose role the membership
 * supplies after the lookup.
 */
const ATTRIBUTION: Readonly<
  Record<string, { readonly who: readonly string[]; readonly when: readonly string[] }>
> = {
  "approval.resolved": { who: ["resolved_by"], when: ["resolved_at"] },
  "question.answered": { who: ["answered_by"], when: ["answered_at"] },
  "run.pause": { who: ["by"], when: [] },
  "run.resume": { who: ["by"], when: [] },
  "run.cancel": { who: ["by"], when: [] },
  "policy.updated": { who: ["changed_by"], when: [] },
  "approval.routed": { who: ["routed_by"], when: ["routed_at"] },
};

/** The events whose `from` is a participant ref for the sender: a steer, and feedback (M3.4). */
const SPEAKS_FOR_SENDER: readonly string[] = ["run.steer", "feedback"];

/** The sender's standing in the space, onto the `from` a steer or feedback carries. */
function fillSpeakerRole(event: Record<string, unknown>, context: AuthorizeContext): void {
  if (!SPEAKS_FOR_SENDER.includes(String(event["type"]))) return;
  (event["from"] as { role: string }).role = context.role ?? "member";
}

/**
 * Fill in what the transport knows and the sender should not have to repeat: the version, the
 * workspace, who is acting, an event id, and the run when the route carried it. Then stamp what
 * the sender must not choose: the clock, and who made a decision. Done before validation, so
 * the schema sees the event the store will hold.
 */
function draftFrom(input: SubmitEventInput, deps: SubmitEventDeps): Record<string, unknown> {
  const { principal } = input;
  const now = deps.clock.nowIso();
  const draft = {
    v: 1,
    workspace_id: principal.workspaceId,
    actor: { kind: principal.kind, id: principal.participantId },
    ...(input.event as Record<string, unknown>),
    // Chips owns the clock. A sender's own `ts` would let it date an approval's expiry into
    // next year, or a message into last week; the log records when Chips saw it.
    ts: now,
    ...(input.runId === undefined ? {} : { run_id: input.runId }),
  } as Record<string, unknown>;

  stampWhatIsChips(draft, principal, now);
  if (SPEAKS_FOR_SENDER.includes(String(draft["type"]))) {
    draft["from"] = {
      participant_id: principal.participantId,
      kind: principal.kind,
      display_name: principal.displayName,
      // Provisional: the membership lookup says what the sender is in this space.
      role: "member",
    };
  }
  // A decision is never "elsewhere" where it was made; delivery says so on other surfaces.
  if (draft["type"] === "approval.resolved") draft["resolved_elsewhere"] = false;

  if (draft["id"] === undefined) draft["id"] = deps.ids.next("event");
  if (draft["idempotency_key"] === undefined && input.idempotencyKey !== undefined) {
    draft["idempotency_key"] = input.idempotencyKey;
  }
  return draft;
}

/**
 * What the sender does not get to write. The fields the catalogue says are Chips's go: words
 * marked as held ones, a copy marked as a fork's answer, why an agent left (agents review,
 * finding 2). Who decided, and when, come from the credential and the clock. And who took
 * somebody out of a room is whoever sent the removal, and nobody when they left themselves.
 */
function stampWhatIsChips(draft: Record<string, unknown>, principal: Principal, now: string): void {
  const type = String(draft["type"]);
  for (const field of eventDefinition(type)?.chipsWrites ?? []) delete draft[field];
  const attribution = ATTRIBUTION[type];
  for (const field of attribution?.who ?? []) draft[field] = principal.participantId;
  for (const field of attribution?.when ?? []) draft[field] = now;
  if (type !== "membership.removed") return;
  if (draft["participant_id"] === principal.participantId) delete draft["removed_by"];
  else draft["removed_by"] = principal.participantId;
}

/**
 * Who a harness's event is by (ADR 0087, point 2, and its addendum). A harness speaks as its
 * agents: one it names as `actor` must be its own, and its own id is read as its one agent in the
 * room the event is in — so a harness written before agents goes on working unchanged. In a room
 * where it has several, that is refused: it has to say which. A room it is in itself, from before
 * the upgrade, and anything that is in no room, stay the harness's.
 */
async function speakerOf(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<SubmitFailure | undefined> {
  if (principal.kind !== "harness") return undefined;
  const actor = event["actor"] as { kind?: unknown; id?: unknown };
  if (actor.kind === "agent") return ownAgent(event, principal, deps, String(actor.id));
  if (actor.kind !== "harness" || actor.id !== principal.participantId) return undefined;
  const room = await roomOf(event, principal, deps);
  if (room === undefined) return undefined;
  const members = await deps.readModels.membersOf(principal.workspaceId, room);
  if (members.some((member) => member.participant_id === principal.participantId)) return undefined;
  const mine = agentsOfIn(members, principal.participantId);
  if (mine.length > 1) {
    return {
      kind: "which_agent",
      message: `this harness has ${mine.length} agents in that space (${mine.map((each) => each.display_name).join(", ")}): name one as the actor`,
    };
  }
  if (mine[0] !== undefined) speakAs(event, principal, mine[0]);
  return undefined;
}

/**
 * A post's `change` (ADR 0222), kept only when the commit is its agent's on the room's project's
 * `main`: the one its push left the project at. Left off otherwise, and the log says so: the words
 * still go, and the room shows no change with them. A thread's post names its room's project.
 */
async function keepChange(
  event: Record<string, unknown>,
  principal: Principal,
  deps: Pick<SubmitEventDeps, "changeBy" | "changeLeftOff" | "readModels">,
): Promise<void> {
  const change = event["change"];
  if (event["type"] !== "message.post" || typeof change !== "string") return;
  const spaceId = typeof event["space_id"] === "string" ? event["space_id"] : undefined;
  const actor = event["actor"] as { kind?: unknown; id?: unknown } | undefined;
  let kept = false;
  if (
    spaceId !== undefined &&
    actor?.kind === "agent" &&
    typeof actor.id === "string" &&
    deps.changeBy !== undefined
  ) {
    const space = await deps.readModels.space(principal.workspaceId, spaceId);
    const room = space?.parent_space_id ?? spaceId;
    kept = await deps.changeBy(room, change, actor.id).catch(() => false);
  }
  if (kept) return;
  delete event["change"];
  if (spaceId !== undefined) deps.changeLeftOff?.({ principal, spaceId, change });
}

/** The fields of a post that mean a room, which words held in no room do not keep. */
const ROOM_FIELDS = [
  "space_id",
  "run_id",
  "reply_to",
  "session_ref",
  "mentions",
  "to",
  "addressed_to",
  "addressed_to_all",
  "held",
  "upload_ids",
  "replaces",
  "change",
] as const;

/**
 * What an agent in no room says (ADR 0087, rule 6, and its addendum of 30 September, point 4).
 *
 * - Naming no room, an agent that is in one says it there.
 * - A free agent's words are held, whether they name no room or the room it left, and posted in
 *   the next room it joins. A harness that has not learnt agents, posting as itself into the room
 *   its one agent left, is held as that agent.
 * - An agent that has never been in a room opens one with its harness's owner, as a hand-off does,
 *   and says it there.
 * - One naming a room it has left while it is in another is left to the door, which refuses it.
 * - So is one naming a room that is gone (agents review, finding 10): the answer to a room that
 *   was deleted has nowhere to be read, and is not kept for whichever room the agent joins next.
 */
async function holdIfFree(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<void> {
  if (event["type"] !== "message.post" || principal.kind !== "harness") return;
  const { workspaceId } = principal;
  const named = typeof event["space_id"] === "string" ? event["space_id"] : undefined;
  const agentId = await speakerOutside(event, principal, deps, named);
  if (agentId === undefined) return;
  const room = await deps.readModels.agentRoom(workspaceId, agentId);
  if (room !== undefined) {
    if (named === undefined) event["space_id"] = room;
    return;
  }
  const opened = await firstRoom(deps, workspaceId, agentId);
  if (opened !== undefined) {
    event["space_id"] = opened;
    return;
  }
  for (const field of ROOM_FIELDS) delete event[field];
  event["type"] = "message.held";
  event["agent_id"] = agentId;
}

/**
 * The agent a post is said by, when it is not in the room the post names: one that names no room,
 * or a room the agent has left. Nothing for an agent in the room it names, and nothing for a room
 * that is gone, which the door refuses.
 */
async function speakerOutside(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
  named: string | undefined,
): Promise<string | undefined> {
  const { workspaceId } = principal;
  if (named !== undefined && (await deps.readModels.space(workspaceId, named)) === undefined) {
    return undefined;
  }
  const agentId = await speakerAgent(event, principal, deps, named);
  if (agentId === undefined) return undefined;
  const there =
    named !== undefined && (await deps.readModels.isMember(workspaceId, named, agentId));
  return there ? undefined : agentId;
}

/** The room an agent's first words open, when it has never been in one; nothing otherwise. */
async function firstRoom(
  deps: SubmitEventDeps,
  workspaceId: string,
  agentId: string,
): Promise<string | undefined> {
  const agent = await deps.readModels.participant(workspaceId, agentId);
  if (agent === undefined) return undefined;
  if (agent.last_space_id !== null && agent.last_space_id !== undefined) return undefined;
  return roomForNewAgent(deps, workspaceId, agent);
}

/**
 * Who a harness's post is said by: the agent it named, or, for one that has not learnt agents,
 * posting as itself into a room it has no agent in, its agent that was last there and is free.
 */
async function speakerAgent(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
  named: string | undefined,
): Promise<string | undefined> {
  const actor = event["actor"] as { kind?: unknown; id?: unknown };
  if (actor.kind === "agent") return String(actor.id);
  if (actor.kind !== "harness" || named === undefined) return undefined;
  const { workspaceId, participantId } = principal;
  if (await deps.readModels.isMember(workspaceId, named, participantId)) return undefined;
  for (const agent of await deps.readModels.agentsOf(workspaceId, participantId)) {
    if (agent.room !== null) continue;
    const found = await deps.readModels.participant(workspaceId, agent.agent_id);
    if (found?.last_space_id !== named) continue;
    speakAs(event, principal, { participant_id: agent.agent_id, display_name: agent.name });
    return agent.agent_id;
  }
  return undefined;
}

/**
 * A room for an agent's first words, with its harness's owner: the room a hand-off to a free
 * agent opens (ADR 0087, rule 8), for an agent made outside Chips — a Space made in Telegram.
 */
async function roomForNewAgent(
  deps: SubmitEventDeps,
  workspaceId: string,
  agent: ParticipantView,
): Promise<string | undefined> {
  // Only an agent never in any room: one in a room that is archived has a room.
  if ((await deps.readModels.roomsHolding(workspaceId, agent.id)).length > 0) return undefined;
  const owner = agent.owner_id;
  if (owner === null) return undefined;
  const envelope = {
    v: 1 as const,
    ts: deps.clock.nowIso(),
    workspace_id: workspaceId,
    actor: { kind: "system" as const, id: "system" },
  };
  const spaceId = deps.ids.next("space");
  const opened = await deps.store.append({
    ...envelope,
    type: "space.created",
    id: deps.ids.next("event"),
    space_id: spaceId,
    idempotency_key: `agent-room-${agent.id}`,
    kind: "direct",
    title: agent.display_name,
    opened_for: owner,
  });
  const room = opened.event.space_id ?? spaceId;
  // Added whether or not this call made the room: keyed, so they add nothing where they landed,
  // and finish the job where a process stopped between the room and its members (finding 7).
  for (const [participantId, kind, role] of [
    [owner, "person", "owner"],
    [agent.id, "agent", "member"],
  ] as const) {
    await deps.store.append({
      ...envelope,
      type: "membership.added",
      id: deps.ids.next("event"),
      space_id: room,
      idempotency_key: `agent-room-${agent.id}-${participantId}`,
      participant_id: participantId,
      participant_kind: kind,
      role,
    });
  }
  return room;
}

/** An agent named as the actor: the sender's own, or refused. */
async function ownAgent(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
  agentId: string,
): Promise<SubmitFailure | undefined> {
  const agent = await deps.readModels.participant(principal.workspaceId, agentId);
  if (agent?.kind !== "agent" || agent.harness_id !== principal.participantId) {
    return { kind: "wrong_actor", message: "a harness speaks only as one of its own agents" };
  }
  // Deleted stays deleted (ADR 0095): nothing more is said as it, held or otherwise.
  if (agent.removed_at !== null) return { kind: "wrong_actor", message: "that agent was deleted" };
  speakAs(event, principal, {
    participant_id: agent.id,
    display_name: agent.display_name,
  });
  return undefined;
}

/** The room an event is in: the one it names, or its run's. */
async function roomOf(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<string | undefined> {
  const space = event["space_id"];
  if (typeof space === "string") return space;
  const runId = event["run_id"];
  if (typeof runId !== "string") return undefined;
  return (await deps.readModels.run(principal.workspaceId, runId))?.space_id ?? undefined;
}

/** A harness's agents among a room's members, in the order they joined. */
function agentsOfIn(members: readonly MemberView[], harnessId: string): MemberView[] {
  return members.filter(
    (member) =>
      member.kind === "agent" && member.harness_id === harnessId && member.removed !== true,
  );
}

/**
 * The event as its agent's: the actor, with the harness beside it for what is the harness's (its
 * budget, its runs), and the fields that say who decided or who is speaking.
 */
function speakAs(
  event: Record<string, unknown>,
  principal: Principal,
  agent: { readonly participant_id: string; readonly display_name: string },
): void {
  event["actor"] = { kind: "agent", id: agent.participant_id, harness_id: principal.participantId };
  for (const field of ATTRIBUTION[String(event["type"])]?.who ?? []) {
    event[field] = agent.participant_id;
  }
  if (SPEAKS_FOR_SENDER.includes(String(event["type"]))) {
    event["from"] = {
      participant_id: agent.participant_id,
      kind: "agent",
      display_name: agent.display_name,
      role: "member",
    };
  }
}

/**
 * What Chips knows and the sender need not repeat, filled in before the schema sees the event.
 * A policy change from the dial names the level and not the cap: the cap is the workspace's.
 * A message names its uploads by id: the attachment each one is comes from the store, as the
 * bytes turned out, never as the sender describes them — and never as the sender's own
 * `attachments` (SEC-5). The row an attachment projects to is keyed by its id alone, so a
 * message naming another room's attachment would have moved it into this room, bytes and all;
 * the schema has always said Chips fills `attachments`, and now nothing else does.
 */
async function fillBeforeValidation(
  draft: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<void> {
  if (draft["type"] === "policy.updated" && draft["workspace_max_autonomy"] === undefined) {
    const workspace = await deps.readModels.workspacePolicy(principal.workspaceId);
    draft["workspace_max_autonomy"] = workspace?.max_autonomy ?? DEFAULT_WORKSPACE_MAX;
  }
  if (draft["type"] === "message.post") {
    const uploadIds = Array.isArray(draft["upload_ids"]) ? (draft["upload_ids"] as unknown[]) : [];
    const attached: unknown[] = [];
    for (const uploadId of uploadIds) {
      attached.push(await attachmentFor(uploadId, principal, deps));
    }
    if (attached.length > 0) draft["attachments"] = attached;
    else delete draft["attachments"];
  }
  await fillParticipantKind(draft, principal, deps);
}

/**
 * A message that says which visit it is for must name one of this space's (ADR 0040). Refused,
 * not quietly dropped: a message whose session was dropped would go wherever the harness chose
 * next, and somebody would read an answer from the wrong terminal as an answer from the right
 * one. A message that names no session is the ordinary case and is not asked about.
 */
async function unknownSession(
  draft: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<SubmitFailure | undefined> {
  if (draft["type"] !== "message.post") return undefined;
  const named = draft["session_ref"];
  if (named === undefined) return undefined;
  const spaceId = draft["space_id"];
  if (typeof named !== "string" || typeof spaceId !== "string") return undefined;
  if (await deps.readModels.sessionInSpace(principal.workspaceId, spaceId, named)) return undefined;
  return {
    kind: "invalid",
    message: `session_ref ${named} does not name a session of this space`,
  };
}

/**
 * What a membership names is whatever the registry says it is, not what the sender wrote. A
 * harness added to a room is its default agent (ADR 0087's addendum, point 5): a harness is in no
 * room itself once it has agents, and until Phase 4 a person adds a harness, not one of its agents.
 * Except a room asked of it from the +, which it is in until it claims it.
 */
async function fillParticipantKind(
  draft: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<void> {
  if (draft["type"] !== "membership.added" || typeof draft["participant_id"] !== "string") return;
  const proposed = draft["agent_name"];
  delete draft["agent_name"];
  const named = await deps.readModels.participant(principal.workspaceId, draft["participant_id"]);
  if (named === undefined) return;
  draft["participant_kind"] = named.kind;
  if (named.kind !== "harness" || named.removed_at !== null) return;
  // A room asked of it from the + holds the harness itself until it claims the room, or, asked
  // with others, until it answers with an agent of its own (ADR 0087's addendum, point 6), and
  // holds a first name for that agent meanwhile (ADR 0150).
  const space = draft["space_id"];
  const room =
    typeof space === "string"
      ? await deps.readModels.space(principal.workspaceId, space)
      : undefined;
  const waits =
    (room?.asked_of === named.id && room.external_key === null) ||
    room?.also_asked_of.includes(named.id) === true;
  if (waits && typeof space === "string") {
    draft["agent_name"] = await holdFirstName(deps, principal.workspaceId, space, proposed);
    return;
  }
  const { agent } = await defaultAgentOf(agentDeps(deps), principal.workspaceId, named);
  draft["participant_id"] = agent.agent_id;
  draft["participant_kind"] = "agent";
}

/**
 * The first name a room asked of a harness holds for its agent (ADR 0150): the one the person's
 * device proposed when nobody has it, so the room keeps the name it was drawn with; else one off
 * the list, whose first letter nobody in the room has while there is one.
 */
async function holdFirstName(
  deps: SubmitEventDeps,
  workspaceId: string,
  spaceId: string,
  proposed: unknown,
): Promise<string> {
  const taken = await takenNames(agentDeps(deps), workspaceId);
  if (mayHoldName(proposed, taken)) return proposed.trim();
  const here = await deps.readModels.membersOf(workspaceId, spaceId);
  return pickAgentName(
    taken,
    here.map((member) => member.held_name ?? member.display_name),
  );
}

function agentDeps(deps: SubmitEventDeps): AgentDeps {
  return { store: deps.store, readModels: deps.readModels, clock: deps.clock, ids: deps.ids };
}

/**
 * The participants a message's @handles name, resolved against the space's members (M3.3).
 * Chips' answer replaces whatever the sender wrote, and a message that names nobody carries
 * nothing. Done after the space is known — a hook's message names the run and not the space.
 */
async function fillMentions(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<void> {
  if (event["type"] !== "message.post") return;
  delete event["mentions"];
  const text = String(event["text"] ?? "");
  if (typeof event["space_id"] !== "string" || handlesIn(text).length === 0) return;
  const members = await deps.readModels.membersOf(principal.workspaceId, event["space_id"]);
  // A removed harness stays a member, for its history, and is nobody a mention reaches.
  const here = members.filter((member) => member.removed !== true);
  const harnesses = await harnessNamesOf(here, principal, deps);
  // A harness waiting in the room goes by the first name held for its agent, and by its own as
  // well, as an agent of it would (ADR 0150).
  const mentions = resolveMentions(
    text,
    here.map((member) => ({
      id: member.participant_id,
      displayName: member.held_name ?? member.display_name,
      also:
        member.held_name === undefined
          ? alsoKnownAs(member, here, harnesses)
          : [member.display_name],
    })),
  );
  if (mentions.length > 0) event["mentions"] = mentions;
}

/** The names of the harnesses whose agents are in a room, by harness. */
async function harnessNamesOf(
  members: readonly MemberView[],
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const member of members) {
    const harness = member.harness_id;
    if (typeof harness !== "string" || names.has(harness)) continue;
    const found = await deps.readModels.participant(principal.workspaceId, harness);
    if (found !== undefined) names.set(harness, found.display_name);
  }
  return names;
}

/**
 * The harness's name, for its one agent in the room (ADR 0087's addendum, point 2): `@Jacobian`
 * names Jacobian's agent there, whatever the agent is called.
 */
function alsoKnownAs(
  member: MemberView,
  members: readonly MemberView[],
  harnesses: ReadonlyMap<string, string>,
): string[] {
  const harness = member.harness_id;
  if (typeof harness !== "string") return [];
  const name = harnesses.get(harness);
  const alone = members.filter((each) => each.harness_id === harness).length === 1;
  return alone && name !== undefined ? [name] : [];
}

/**
 * Which harnesses a message is for, and so which take a turn on it (ADR 0081), and which people a
 * person's is for, who are pushed as an @ pushes them (ADR 0204). Chips decides it once, here,
 * beside the mentions, and writes it on the event, so a replay, a catch-up and every screen read
 * the same answer. Chips' answer replaces whatever the sender wrote; `to`, the
 * sender's own choice, stays as sent. Every message in a space gets one: rules past the @ hold
 * without a handle in the text. An agent's message is held from the agents it names past the
 * workspace's hold (ADR 0187), or while a person has paused them (ADR 0097): the count it was
 * weighed against, and the limits, come back for the sender's acknowledgement.
 */
async function fillAddress(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<Talked | undefined> {
  if (event["type"] !== "message.post") return undefined;
  delete event["addressed_to"];
  delete event["addressed_to_all"];
  delete event["addressed_people"];
  delete event["held"];
  const space = event["space_id"];
  const actor = event["actor"] as { kind?: unknown; id?: unknown } | undefined;
  if (typeof space !== "string" || typeof actor?.id !== "string") return undefined;
  if (typeof actor.kind !== "string" || actor.kind === "system") return undefined;
  const workspace = principal.workspaceId;
  const members = await deps.readModels.membersOf(workspace, space);
  const exchange = isAgentKind(actor.kind)
    ? await deps.readModels.exchangeOf(workspace, space)
    : undefined;
  const address = resolveAddress({
    sender: { id: actor.id, kind: actor.kind },
    mentioned: Array.isArray(event["mentions"]) ? (event["mentions"] as string[]) : [],
    everyone: mentionsEveryone(String(event["text"] ?? "")),
    to: aimedAt(event["to"], members),
    ...(await asNowIn(
      event,
      { workspace, space, actor: { id: actor.id, kind: actor.kind } },
      deps,
    )),
    agents: here(members, isAgentKind),
    // Who besides its agents a person's message can be for (ADR 0204).
    people: here(members, (kind) => kind === "person"),
    ...(exchange === undefined
      ? {}
      : {
          exchange: { count: exchange.count, paused: exchange.paused, limits: exchange.limits },
        }),
  });
  writeAddress(event, address);
  return exchange === undefined ? undefined : { count: exchange.count, limits: exchange.limits };
}

/** The members of a kind still in the room, in the order they joined. */
function here(members: readonly MemberView[], of: (kind: string) => boolean): string[] {
  return members
    .filter((member) => of(member.kind) && member.removed !== true)
    .map((member) => member.participant_id);
}

/** Chips's answer, written on the message as the wire says it. */
function writeAddress(event: Record<string, unknown>, address: Address): void {
  event["addressed_to"] = address.addressed_to;
  if (address.addressed_to_all === true) event["addressed_to_all"] = true;
  if (address.addressed_people !== undefined) event["addressed_people"] = address.addressed_people;
  if (address.held === true) event["held"] = true;
}

/** What an agent's message was weighed against: the talk before it, and the workspace's limits. */
interface Talked {
  readonly count: number;
  readonly limits?: ExchangeLimits | undefined;
}

/**
 * The reply's author and the sender's last aim, as the room reads now: who took whose place here
 * (ADR 0087) — a reply to, or a last message for, the harness before the upgrade is to or for its
 * agent now.
 */
async function asNowIn(
  event: Record<string, unknown>,
  where: {
    readonly workspace: string;
    readonly space: string;
    readonly actor: { readonly id: string; readonly kind: string };
  },
  deps: SubmitEventDeps,
): Promise<Pick<AddressInput, "replyAuthor" | "last">> {
  const { workspace, space, actor } = where;
  const replaced = new Map(
    (await deps.readModels.replacedIn(workspace, space)).map((each) => [each.from, each.to]),
  );
  const now = (id: string): string => replaced.get(id) ?? id;
  const reply = await replyAuthorOf(event, workspace, space, deps);
  const last =
    actor.kind === "person"
      ? await deps.readModels.lastAddressed(workspace, space, actor.id)
      : undefined;
  return {
    ...(reply === undefined
      ? {}
      : {
          replyAuthor: { id: now(reply.id), kind: replaced.has(reply.id) ? "agent" : reply.kind },
        }),
    ...(last === undefined ? {} : { last: Array.isArray(last) ? last.map(now) : last }),
  };
}

/**
 * The sender's own choice, `to`, with a harness's id read as its one agent in the room (ADR
 * 0087's addendum, point 2), as its name is in an @.
 */
function aimedAt(to: unknown, members: readonly MemberView[]): string[] | "all" | undefined {
  if (to === "all" || !Array.isArray(to)) return to === "all" ? "all" : undefined;
  return (to as string[]).map((id) => {
    const theirs = members.filter((member) => member.harness_id === id);
    return theirs.length === 1 && theirs[0] !== undefined ? theirs[0].participant_id : id;
  });
}

/** Who wrote the message this one answers, when it answers one in the same space. */
async function replyAuthorOf(
  event: Record<string, unknown>,
  workspace: string,
  space: string,
  deps: SubmitEventDeps,
): Promise<{ id: string; kind: "person" | "harness" | "agent" } | undefined> {
  const replyTo = event["reply_to"];
  if (typeof replyTo !== "string") return undefined;
  const reply = await deps.readModels.message(workspace, replyTo);
  if (reply?.space_id !== space || reply.author_kind === "system") return undefined;
  return { id: reply.author_id, kind: reply.author_kind };
}

/**
 * The attachment an upload id stands for. Only the uploader may attach an upload, and only
 * once its bytes are in; anything else is left for the schema to refuse, naming the id.
 */
async function attachmentFor(
  uploadId: unknown,
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<unknown> {
  if (typeof uploadId !== "string") return uploadId;
  const row = await deps.uploads.find(principal.workspaceId, uploadId);
  const attachment = row === undefined ? undefined : attachmentOf(row);
  if (attachment === undefined || row?.uploaded_by !== principal.participantId) {
    return { attachment_id: uploadId, upload_not_found: true };
  }
  const { kind: _kind, has_thumbnail: _thumb, ...wire } = attachment;
  return wire;
}

function runFacts(run: RunView | undefined): RunFacts | null {
  return run === undefined
    ? null
    : {
        run_id: run.run_id,
        harness_id: run.harness_id,
        space_id: run.space_id,
        state: run.state,
      };
}

type Gathered = { ok: true; value: AuthorizeContext } | { ok: false; error: Refusal };
type GatheredPart<T> = { ok: true; value: T } | { ok: false; error: Refusal };

/**
 * The domain's rules, one lookup each, in the order that fills in what the next one needs: the
 * run (which knows its space), then the sender's standing in the space and what the event does
 * to it, then who has already decided and who may. A rule that refuses stops the gathering, so
 * a forgery costs no query beyond the one that caught it.
 */
async function gather(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<Gathered> {
  const run = await gatherRun(event, principal, deps);
  if (!run.ok) return run;
  const message = await gatherMessage(event, principal, deps);
  const standing = await gatherStanding(event, principal, deps);
  if (!standing.ok) return standing;
  const roles = await gatherWorkspaceRoles(event, principal, deps, standing.value.space);
  if (!roles.ok) return roles;
  // After the membership rule, so that whether a message exists is told only to the room.
  const onMessage =
    refuseOnFeedback(event, message) ??
    refuseOnReply(event, message) ??
    refuseOnMessageChange(event, principal, standing.value.role, message) ??
    refuseOnThread(event, standing.value.role, standing.value.space, message);
  if (onMessage !== undefined) return { ok: false, error: onMessage };
  const decision = await gatherDecision(event, principal, deps, standing.value.role, run.value);
  if (!decision.ok) return decision;
  return {
    ok: true,
    value: { run: run.value, message, ...standing.value, ...roles.value, ...decision.value },
  };
}

/**
 * Rule 11's lookups (ADR 0034): for a role change, the person it names as they stand and
 * whether they are the last owner; for a membership, whether the participant named is a guest
 * of the workspace — in which case their standing in the room is a guest's whatever the sender
 * wrote, and they may be in no other open room already; and for an archived room unarchived, its
 * guests who are in another open room by now (JR-24).
 */
async function gatherWorkspaceRoles(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
  space: SpaceFacts | null,
): Promise<GatheredPart<Pick<AuthorizeContext, "target" | "guestSpaces">>> {
  const type = event["type"];
  const target = type === "role.changed" ? await roleTargetOf(event, principal, deps) : null;
  const guestSpaces =
    type === "membership.added" ? await guestSpacesOf(event, principal, deps) : null;
  const refused =
    refuseOnWorkspaceRole(event, principal, target, guestSpaces) ??
    refuseReopening(await guestsElsewhereOf(event, principal, deps, space));
  if (refused !== undefined) return { ok: false, error: refused };
  return { ok: true, value: { target, guestSpaces } };
}

/**
 * The person a role change names, as they stand: their role, whether they are the last owner,
 * and — when they are to be a guest — how many spaces they are in, since a guest is in one at
 * most (Gate 5).
 */
async function roleTargetOf(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<RoleTarget | null> {
  const { workspaceId } = principal;
  const named = String(event["participant_id"]);
  const role = await deps.readModels.workspaceRole(workspaceId, named);
  if (role === undefined) return null;
  const owners = role === "owner" ? await deps.readModels.ownerCount(workspaceId) : 0;
  const spaces =
    event["role"] === "guest" ? await deps.readModels.spaceCountFor(workspaceId, named) : 0;
  return { role, lastOwner: role === "owner" && owners <= 1, spaces };
}

/**
 * For a membership naming a guest of the workspace: their standing in the room is a guest's,
 * and how many spaces they are in already — none, when the space named is the one they are in,
 * since being added again is a retry rather than a second space. `null` for anyone else.
 */
async function guestSpacesOf(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<number | null> {
  const { workspaceId } = principal;
  const named = String(event["participant_id"]);
  if (!isGuest(await deps.readModels.workspaceRole(workspaceId, named))) return null;
  event["role"] = "guest";
  const count = await deps.readModels.spaceCountFor(workspaceId, named);
  const space = event["space_id"];
  if (count === 0 || typeof space !== "string") return count;
  const here = await deps.readModels.memberRole(workspaceId, space, named);
  return here === undefined ? count : 0;
}

/** A room just archived: what goes with it, its pins. */
async function archiving(event: StoredEvent, principal: Principal, deps: SubmitEventDeps) {
  if (event.type !== "space.updated" || event.payload["state"] !== "closed") return;
  if (event.space_id === null) return;
  await deps.archived?.(principal.workspaceId, event.space_id);
}

/**
 * For an archived room being unarchived (JR-24): the names of its guests who are in another open
 * room by now, whom unarchiving it would put in a second. Nobody, for any other event.
 */
async function guestsElsewhereOf(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
  space: SpaceFacts | null,
): Promise<string[]> {
  if (event["type"] !== "space.updated" || event["state"] !== "open") return [];
  if (space?.state !== "closed") return [];
  const { workspaceId } = principal;
  const members = await deps.readModels.membersOf(workspaceId, space.space_id);
  const elsewhere: string[] = [];
  for (const member of members) {
    if (member.kind !== "person" || member.workspace_role !== "guest") continue;
    const open = await deps.readModels.spaceCountFor(workspaceId, member.participant_id);
    if (open > 0) elsewhere.push(member.display_name);
  }
  return elsewhere;
}

/** The events about a message somebody said: feedback on it, and the changes to it (M5.4). */
const ABOUT_A_MESSAGE: readonly string[] = [
  "feedback",
  "message.edited",
  "message.deleted",
  "message.hidden",
  "message.shown",
  "message.pinned",
  "message.unpinned",
];

/**
 * Rules 10, 12 and 13's lookup: the message the event is about — or, for a thread, the one it
 * grows from, and for a reply the one it answers (ADR 0219) — and, as with a hook's run, the space
 * it lands in when the event names none, since the message knows. A thread's own `space_id` is the
 * thread's, and a reply's is where it is said: both are left alone.
 */
async function gatherMessage(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<MessageFacts | null> {
  const type = String(event["type"]);
  const about = ABOUT_A_MESSAGE.includes(type);
  const named = about
    ? event["message_id"]
    : type === "space.created"
      ? event["root_message_id"]
      : type === "message.post"
        ? event["reply_to"]
        : undefined;
  if (typeof named !== "string") return null;
  const found = await deps.readModels.message(principal.workspaceId, named);
  if (found === undefined) return null;
  if (about && event["space_id"] === undefined && found.space_id !== null) {
    event["space_id"] = found.space_id;
  }
  return {
    message_id: found.message_id,
    space_id: found.space_id,
    author_kind: found.author_kind,
    author_id: found.author_id,
    deleted: found.deleted_at !== null,
    thread_id: found.thread_id,
  };
}

/** Rule 4, and the space a hook's event lands in. */
async function gatherRun(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<GatheredPart<RunFacts | null>> {
  const runId = event["run_id"];
  const run = runFacts(
    typeof runId === "string" ? await deps.readModels.run(principal.workspaceId, runId) : undefined,
  );
  const onRun = refuseOnRun(event, principal, run);
  if (onRun !== undefined) return { ok: false, error: onRun };
  // A hook posts to `/v1/runs/:id/events` and need not repeat the space: the run knows
  // it, and an event that names the run and not the space lands there.
  if (event["space_id"] === undefined && run?.space_id != null) {
    event["space_id"] = run.space_id;
  }
  return { ok: true, value: run };
}

/** The events whose rules need the space itself: a change to it, and a thread grown in it. */
const NEEDS_THE_SPACE: ReadonlySet<string> = new Set([
  "space.updated",
  "membership.added",
  "membership.removed",
  "space.created",
]);

/**
 * The space whose standing an event is judged by: the one it names — except that opening a
 * space asks nothing, since nobody is a member of one that does not exist yet, and opening a
 * thread is judged by the space it grows in (M5.4).
 */
function standingSpaceOf(event: Record<string, unknown>): string | undefined {
  const space = event["space_id"];
  if (event["type"] !== "space.created") return typeof space === "string" ? space : undefined;
  const parent = event["parent_space_id"];
  return typeof parent === "string" ? parent : undefined;
}

/**
 * Who rules 8, 15, 16 and 17 are about: somebody being added to a space or taken out of one, or
 * a harness asked for one.
 */
function participantNamed(event: Record<string, unknown>): string | undefined {
  if (event["type"] === "membership.added" || event["type"] === "membership.removed") {
    return String(event["participant_id"]);
  }
  const asked = event["type"] === "space.created" ? event["asked_of"] : undefined;
  return typeof asked === "string" ? asked : undefined;
}

/**
 * Who rules 8, 15, 16 and 17 are about, as they stand: for an agent being added, a room it is in
 * already that is not this one, and how many agents this one holds (ADR 0087, rules 1 and 7),
 * since an agent is in one room at a time and a Main room holds one.
 */
async function namedFacts(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<ParticipantFacts | null> {
  const named = participantNamed(event);
  if (named === undefined) return null;
  const found = await deps.readModels.participant(principal.workspaceId, named);
  if (found?.kind !== "agent" || event["type"] !== "membership.added") {
    return participantFacts(found);
  }
  return participantFacts(found, await placeOf(event, principal, deps, found.id));
}

/** Where an agent being added is, and who is in the room it is added to. */
async function placeOf(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
  agentId: string,
): Promise<{ readonly room: string | null; readonly others: number }> {
  const { workspaceId } = principal;
  const here = typeof event["space_id"] === "string" ? event["space_id"] : undefined;
  const held = await deps.readModels.roomsHolding(workspaceId, agentId);
  const elsewhere = held.find((room) => room.space_id !== here);
  const members = here === undefined ? [] : await deps.readModels.membersOf(workspaceId, here);
  const others = members.filter(
    (member) => member.kind === "agent" && member.participant_id !== agentId,
  );
  return { room: elsewhere?.space_id ?? null, others: others.length };
}

/** Rules 5, 7, 8, 13 and 15: the sender's standing in the space, and what the event does to it. */
async function gatherStanding(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<GatheredPart<Pick<AuthorizeContext, "role" | "space" | "participant">>> {
  const { workspaceId } = principal;
  const space = standingSpaceOf(event);
  const type = String(event["type"]);
  // An agent's standing is its own (ADR 0087): the door has said it is the sender's.
  const actor = event["actor"] as { kind: string; id: string };
  const who = actor.kind === "agent" ? actor.id : principal.participantId;
  const role =
    space === undefined ? undefined : await deps.readModels.memberRole(workspaceId, space, who);
  const onMembership = refuseOnMembership(event, role ?? null);
  if (onMembership !== undefined) return { ok: false, error: onMembership };

  const facts =
    space !== undefined && NEEDS_THE_SPACE.has(type)
      ? spaceFacts(await deps.readModels.space(workspaceId, space))
      : null;
  const onSpace = refuseOnSpaceChange(event, principal, role ?? null, facts);
  if (onSpace !== undefined) return { ok: false, error: onSpace };

  const participant = await namedFacts(event, principal, deps);
  const onParticipant =
    refuseOnParticipant(event, participant) ??
    refuseOnAgentMembership(event, participant, facts) ??
    refuseAgentNotTheirs(event, principal, participant) ??
    refuseOwnerOut(event, principal, participant) ??
    refuseOnLeadRemoval(event, participant, facts) ??
    refuseOnAsking(event, participant) ??
    (await refuseOnAlsoAsked(event, principal, deps));
  if (onParticipant !== undefined) return { ok: false, error: onParticipant };

  return { ok: true, value: { role: role ?? null, space: facts, participant } };
}

/**
 * Rule 15 again, for each other harness asked with the first from the + (ADR 0087's addendum of
 * 30 September, point 6): each is a harness here that takes new spaces, and none is the first.
 */
async function refuseOnAlsoAsked(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<Refusal | undefined> {
  const also = event["also_asked_of"];
  if (event["type"] !== "space.created" || !Array.isArray(also)) return undefined;
  if (event["asked_of"] === undefined) {
    return { kind: "invalid", message: "a space asks others as well only when it asks one first" };
  }
  for (const harnessId of also) {
    if (harnessId === event["asked_of"]) {
      return { kind: "invalid", message: "the harness asked first is not asked again" };
    }
    const found = await deps.readModels.participant(principal.workspaceId, String(harnessId));
    const refused = refuseOnAsking(
      { type: "space.created", kind: event["kind"], asked_of: harnessId },
      participantFacts(found),
    );
    if (refused !== undefined) return refused;
  }
  return undefined;
}

/** Rules 6 and 9: who already answered the ask this decision is for, and who may. */
async function gatherDecision(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
  role: AuthorizeContext["role"],
  run: RunFacts | null,
): Promise<
  GatheredPart<Pick<AuthorizeContext, "decidedBy" | "approvers" | "askRun" | "askAction">>
> {
  const { workspaceId } = principal;
  const approval =
    event["type"] === "approval.resolved" || event["type"] === "approval.routed"
      ? await deps.readModels.approval(workspaceId, String(event["approval_id"]))
      : undefined;
  const question =
    event["type"] === "question.answered"
      ? await deps.readModels.question(workspaceId, String(event["ask_id"]))
      : undefined;
  const decidedBy =
    approval?.state === "resolved"
      ? (approval.resolved_by ?? "somebody")
      : question?.state === "answered"
        ? (question.answered_by ?? "somebody")
        : null;
  const second = refuseSecondAnswer(event, decidedBy);
  if (second !== undefined) return { ok: false, error: second };

  const approvers = approval === undefined ? null : approval.approvers;
  const askRun = approval?.run_id ?? question?.run_id ?? null;
  const askAction = actionOfStored(approval);
  const own = settlesItsOwn(principal, run, askRun);
  const notAnApprover = refuseNotAnApprover(event, principal, approvers, role, own, askAction);
  if (notAnApprover !== undefined) return { ok: false, error: notAnApprover };
  return { ok: true, value: { decidedBy, approvers, askRun, askAction } };
}

function spaceFacts(space: SpaceView | undefined): SpaceFacts | null {
  return space === undefined
    ? null
    : {
        space_id: space.space_id,
        opened_by: space.opened_by,
        state: space.state,
        kind: space.kind,
        parent_space_id: space.parent_space_id,
        home: space.home,
        locked: space.locked === true,
      };
}

function participantFacts(
  participant: ParticipantView | undefined,
  place?: { readonly room: string | null; readonly others: number },
): ParticipantFacts | null {
  return participant === undefined
    ? null
    : {
        id: participant.id,
        kind: participant.kind,
        capabilities: participant.capabilities,
        removed: participant.removed_at !== null,
        ...(participant.kind === "person"
          ? { standing: participant.role }
          : { owner: participant.owner_id }),
        ...(participant.kind === "agent"
          ? {
              lead: participant.lead === true,
              archived: participant.state === "archived",
              ...place,
            }
          : {}),
      };
}

/**
 * A `usage` that carries no cost gets one from the workspace's price table, so the meter and
 * the audit read the same number; a model the table cannot price gets none, which the meter
 * shows as tokens alone. A cost the harness computed itself is kept.
 */
async function priceUsage(
  event: Record<string, unknown>,
  principal: Principal,
  deps: SubmitEventDeps,
): Promise<void> {
  if (event["type"] !== "usage" || event["cost"] !== undefined) return;
  const table = await deps.readModels.priceTable(principal.workspaceId);
  const cost = estimateCost(
    {
      model: String(event["model"]),
      input_tokens: typeof event["input_tokens"] === "number" ? event["input_tokens"] : undefined,
      cache_read_tokens:
        typeof event["cache_read_tokens"] === "number" ? event["cache_read_tokens"] : undefined,
      cache_write_tokens:
        typeof event["cache_write_tokens"] === "number" ? event["cache_write_tokens"] : undefined,
      output_tokens:
        typeof event["output_tokens"] === "number" ? event["output_tokens"] : undefined,
    },
    table,
  );
  if (cost !== undefined) event["cost"] = cost;
}

/** What Chips decides once an event is in: policy on an ask, a rule from an "always". */
async function decide(
  event: StoredEvent,
  principal: Principal,
  context: AuthorizeContext,
  deps: SubmitEventDeps,
  verdict: Decision | undefined,
): Promise<StoredEvent | undefined> {
  if (event.type === "approval.request" && verdict !== undefined) {
    return decideApproval(event, principal, verdict, deps);
  }
  if (event.type === "approval.resolved" && event.payload["scope"] === "always") {
    await ruleFromAlways(event, principal, context, deps);
  }
  return undefined;
}

interface ActionShape {
  readonly kind: string;
  readonly external?: boolean;
  readonly irreversible?: boolean;
  readonly money_usd?: number;
  /** What it was asked with; a command in it is read part by part (ADR 0239). */
  readonly input?: unknown;
}

type Named = { ok: true; value: Decision | undefined } | { ok: false; error: Refusal };

/**
 * An approval is judged before it is stored, so the event carries who may answer it; handing
 * one on resolves the new names the same way (M5.5), and must name somebody (Gate 5).
 */
async function nameWhoMayAnswer(
  event: Record<string, unknown>,
  principal: Principal,
  context: AuthorizeContext,
  deps: SubmitEventDeps,
): Promise<Named> {
  const verdict = await judge(event, principal, context, deps);
  const routed = await fillRouting(event, principal, context, deps);
  if (routed !== undefined) return { ok: false, error: routed };
  await stampApprovers(event, principal, context, deps);
  return { ok: true, value: verdict };
}

/**
 * A decision carries who could have answered it (ADR 0042). Read from the approval rather than
 * taken from the sender, so that somebody named outside the room — who is sent the ask and the
 * hand-on because those name them — is sent the answer and its outcome too; visibility has
 * nothing else to go on. A value the sender wrote is replaced, as everywhere else.
 */
async function stampApprovers(
  event: Record<string, unknown>,
  principal: Principal,
  context: AuthorizeContext,
  deps: SubmitEventDeps,
): Promise<void> {
  const type = String(event["type"]);
  if (type !== "approval.resolved" && type !== "approval.executed") return;
  const approvers =
    type === "approval.resolved"
      ? context.approvers
      : ((await deps.readModels.approval(principal.workspaceId, String(event["approval_id"])))
          ?.approvers ?? null);
  if (approvers === null || approvers.length === 0) delete event["approvers"];
  else event["approvers"] = [...approvers];
}

/**
 * The policy engine on an approval request, before it is stored: `ask`, `allow` or `deny`, and
 * — whatever the verdict — the people who may answer it, written onto the event as ids (M3.3).
 * Policy's own list wins when a rule names one; else the harness's, else the owner. The
 * harness's own list names people: `lead`, or a harness's id, is a person's rule to write, so
 * a specialist cannot hand its own ask to the lead and have two harnesses agree (Gate 5).
 */
async function judge(
  event: Record<string, unknown>,
  principal: Principal,
  context: AuthorizeContext,
  deps: SubmitEventDeps,
): Promise<Decision | undefined> {
  if (event["type"] !== "approval.request") return undefined;
  const decision = await evaluateAsk(event, principal, context, deps);
  const asked = Array.isArray(event["approvers"]) ? peopleOnly(event["approvers"] as string[]) : [];
  const refs = decision.rule?.approvers ?? (asked.length > 0 ? asked : DEFAULT_APPROVERS);
  event["approvers"] = await nameApprovers(refs, event, principal, context.run, deps, {
    action: askedAction(event["action"], event["risk"]),
  });
  return decision;
}

/** The refs a harness may name for its own ask: people, by role or by id; never a harness. */
function peopleOnly(refs: readonly string[]): string[] {
  return refs.filter((ref) => ref !== "lead" && !isId("harness", ref));
}

/** A stored approval's action and risk, for the door to say whether it matters (ADR 0195). */
function actionOfStored(approval: { action: unknown; risk?: unknown } | undefined) {
  if (approval === undefined) return null;
  return askedAction(approval.action, approval.risk) ?? null;
}

/** An approval's action as the engine reads it, with the risk classes the ask declared. */
function askedAction(action: unknown, risk: unknown): PolicyAction | undefined {
  if (typeof action !== "object" || action === null) return undefined;
  const shape = action as ActionShape;
  return {
    kind: shape.kind,
    external: shape.external,
    irreversible: shape.irreversible,
    money_usd: shape.money_usd,
    risk: Array.isArray(risk) ? (risk as PolicyAction["risk"]) : undefined,
    command: askedCommand(shape.input),
  };
}

/** The engine's verdict on an ask: the harness's policy in this room, under the workspace's cap. */
async function evaluateAsk(
  event: Record<string, unknown>,
  principal: Principal,
  context: AuthorizeContext,
  deps: SubmitEventDeps,
): Promise<Decision> {
  const { workspaceId } = principal;
  const space = typeof event["space_id"] === "string" ? event["space_id"] : undefined;
  const [harnessPolicy, workspace, session] = await Promise.all([
    deps.readModels.harnessPolicy(workspaceId, principal.participantId, space),
    deps.readModels.workspacePolicy(workspaceId),
    context.run === null
      ? Promise.resolve([])
      : deps.readModels.sessionRules(workspaceId, context.run.run_id),
  ]);
  const action = event["action"] as ActionShape;
  return evaluate(
    {
      kind: action.kind,
      external: action.external,
      irreversible: action.irreversible,
      money_usd: action.money_usd,
      risk: event["risk"] as never,
      command: askedCommand(action.input),
    },
    {
      autonomy: (harnessPolicy?.autonomy ?? DEFAULT_AUTONOMY) as 0 | 1 | 2 | 3,
      // What was decided for this session comes before the harness's standing rules: the
      // space's own, then the harness's everywhere (ADR 0239).
      rules: [
        ...session,
        ...(harnessPolicy?.rules ?? []),
        ...(harnessPolicy?.everywhere_rules ?? []),
      ],
    },
    {
      maxAutonomy: (workspace?.max_autonomy ?? DEFAULT_WORKSPACE_MAX) as 0 | 1 | 2 | 3,
      rules: workspace?.rules ?? [],
    },
  );
}

/**
 * Handing an approval on (M5.5): the new names are resolved as the request's were, from the
 * same refs, and written onto the event, so the log says who may answer from here on and a
 * value the sender wrote is replaced. `owner` is the asking harness's, so its owner is looked
 * up rather than the router's. Handed to nobody — an id that is nobody's, a guest outside the
 * one room they are in, `lead` outside a lane or for an ask that matters — is refused rather
 * than widened to anyone in the room (Gate 5). Somebody elsewhere in the workspace is a name,
 * not nobody, since ADR 0042.
 */
async function fillRouting(
  event: Record<string, unknown>,
  principal: Principal,
  context: AuthorizeContext,
  deps: SubmitEventDeps,
): Promise<Refusal | undefined> {
  if (event["type"] !== "approval.routed") return undefined;
  const { workspaceId } = principal;
  const refs = Array.isArray(event["to"]) ? (event["to"] as string[]) : [];
  const [asker, approval] = await Promise.all([
    context.run === null
      ? undefined
      : deps.readModels.participant(workspaceId, context.run.harness_id),
    deps.readModels.approval(workspaceId, String(event["approval_id"])),
  ]);
  const named = await nameApprovers(refs, event, principal, context.run, deps, {
    owner: asker?.owner_id ?? undefined,
    action: askedAction(approval?.action, approval?.risk),
    strict: true,
  });
  if (named.length === 0) {
    return {
      kind: "invalid",
      message:
        "`to` names nobody who can answer this: somebody in the workspace who is not a guest of another space, a role somebody in the space holds, or — for an ask that is not money, a deletion or an external action — the lane's lead",
    };
  }
  event["approvers"] = named;
  // What the ask is, for whoever is handed it in a room they are not in and so never saw the
  // request that raised it (ADR 0042). Written by Chips; a value the sender wrote is replaced.
  if (approval === undefined || context.run === null) delete event["ask"];
  else {
    event["ask"] = {
      harness_id: context.run.harness_id,
      action: approval.action,
      ...(approval.risk === undefined ? {} : { risk: [...approval.risk] }),
      ...(approval.expires_at === null ? {} : { expires_at: approval.expires_at }),
    };
  }
  return undefined;
}

/** What resolving a list needs beyond the refs: the asking harness's owner, when known, and the action. */
interface Naming {
  /** The asking harness's owner, when the sender is not the asker (a routing). */
  readonly owner?: string | undefined;
  /** The action the ask is about: a harness is dropped from the names when it matters. */
  readonly action: PolicyAction | undefined;
  /**
   * Whether the refs must name somebody who can answer, with no falling back to the owner or
   * the lane's person: a routing is somebody's deliberate word, and nobody is refused (Gate 5).
   */
  readonly strict?: boolean | undefined;
}

/**
 * The people a list of approver refs comes down to, from the owner, the room and the lane —
 * and then only those who are in the room (`inTheRoom`), or lead the lane; and never a harness
 * for money, a deletion or an external action, which always reach a person (blueprint; Gate
 * 5). A room the event cannot name is left as policy named it.
 */
async function nameApprovers(
  refs: readonly string[],
  event: Record<string, unknown>,
  principal: Principal,
  run: AuthorizeContext["run"],
  deps: SubmitEventDeps,
  naming: Naming,
): Promise<string[]> {
  const { workspaceId } = principal;
  const owner =
    "owner" in naming
      ? naming.owner
      : (principal.ownerId ??
        (await deps.readModels.participant(workspaceId, principal.participantId))?.owner_id ??
        undefined);
  const space = typeof event["space_id"] === "string" ? event["space_id"] : undefined;
  const members = space === undefined ? [] : await deps.readModels.membersOf(workspaceId, space);
  const people = members
    .filter((member) => member.kind === "person")
    .map((member) => ({
      id: member.participant_id,
      role: member.role,
      workspaceRole: member.workspace_role,
    }));
  // The lane's lead, when the run is a lane's: who policy may hand a low-risk ask to (M5.5).
  const lane = run === null ? undefined : await deps.readModels.laneByRun(workspaceId, run.run_id);
  const lead = lane?.lead_id;
  const facts = { owner, people, lead };
  const strict = naming.strict === true;
  const named = peopleFor(
    strict ? resolveApprovers(refs, facts) : approversFor(refs, facts),
    naming.action,
  );
  if (space === undefined) return named;
  const away = await namedElsewhere(refs, named, facts, { workspaceId, deps });
  if (strict) {
    const both =
      away.owner === undefined ? away.byId : new Set([...away.byId, away.owner as string]);
    return presentIn(named, people, lead, both);
  }
  return inTheRoom(named, people, lane, lead, owner, away.byId, away.owner);
}

/** Who a list names outside the room, by their own id and as the harness's owner (ADR 0042). */
interface Elsewhere {
  /** Named by their own id: a deliberate choice, which reaches them wherever they are. */
  readonly byId: ReadonlySet<string>;
  /** The harness's owner, when `owner` was a ref and they are not here. */
  readonly owner: string | undefined;
}

/**
 * Of the names, those who may answer from outside the room: a person in this workspace who is
 * not a guest, a guest being in one room and named only there. `any` and `role:<name>` name the
 * room and reach nobody outside it, so a name they produced is never asked about here. `owner`
 * is kept apart because it is a role, not a choice of person: it reaches the owner wherever
 * they are, but a lane's own person still comes first when they are here (Gate 3).
 */
async function namedElsewhere(
  refs: readonly string[],
  named: readonly string[],
  facts: ApproverFacts,
  where: { workspaceId: string; deps: SubmitEventDeps },
): Promise<Elsewhere> {
  const here = new Set(facts.people.map((person) => person.id));
  const byId = namedInPerson(refs, { ...facts, owner: undefined });
  const owner = facts.owner;
  const asked = named.filter((id) => byId.includes(id) && !here.has(id));
  const ownerAway = owner !== undefined && refs.includes("owner") && !here.has(owner);
  const may = await mayAnswerElsewhere(ownerAway ? [...asked, owner] : asked, where);
  return {
    byId: new Set(asked.filter((id) => may.has(id))),
    owner: ownerAway && owner !== undefined && may.has(owner) ? owner : undefined,
  };
}

/** Of the candidates, the people of this workspace who are not guests of one room. */
async function mayAnswerElsewhere(
  candidates: readonly string[],
  where: { workspaceId: string; deps: SubmitEventDeps },
): Promise<ReadonlySet<string>> {
  if (candidates.length === 0) return new Set();
  const found = await Promise.all(
    candidates.map(async (id) => {
      const participant = await where.deps.readModels.participant(where.workspaceId, id);
      return participant?.kind === "person" && participant.role !== "guest" ? id : undefined;
    }),
  );
  return new Set(found.filter((id): id is string => id !== undefined));
}

/** Of the names, those in the room, the lane's lead, and those named who may answer elsewhere. */
function presentIn(
  named: readonly string[],
  people: readonly { id: string }[],
  lead: string | undefined,
  elsewhere: ReadonlySet<string> = new Set(),
): string[] {
  const here = new Set(people.map((person) => person.id));
  return named.filter(
    (id) => here.has(id) || (lead !== undefined && id === lead) || elsewhere.has(id),
  );
}

/** Money, deletions and external actions reach a person: a harness named for one is dropped. */
function peopleFor(named: readonly string[], action: PolicyAction | undefined): string[] {
  if (action === undefined || !matters(action)) return [...named];
  return named.filter((id) => !isId("harness", id));
}

/**
 * Who policy's list comes down to. The people in the room, the lane's lead, and — since ADR
 * 0042 — anybody policy named in person, wherever they are in the workspace: the harness's
 * owner who is not in this room, or somebody named by id, both of whom now receive the card and
 * may answer it (rule 9). What `any` and `role:<name>` produced is still the room's, so a name
 * they could never have meant is dropped: a specialist's owner, say, when the specialist works
 * a lane in a room the person the work is for owns (Gate 3).
 *
 * When that leaves nobody, the harness's owner answers when they are here (Gate 5: a list that
 * named nobody present used to become anyone's, which a harness could bring about by naming a
 * ghost); else the person the lane is for, when the run is a lane's and they are here, which
 * keeps Gate 3's answer to a specialist working somebody else's room; else the owner wherever
 * they are, since `owner` was named and naming is standing (ADR 0042); otherwise the list is
 * empty, which means anyone in the room but a guest.
 */
function inTheRoom(
  named: readonly string[],
  people: readonly { id: string }[],
  lane: LaneView | undefined,
  lead: string | undefined,
  owner: string | undefined,
  elsewhere: ReadonlySet<string>,
  ownerElsewhere: string | undefined,
): string[] {
  const here = new Set(people.map((person) => person.id));
  const present = presentIn(named, people, lead, elsewhere);
  if (present.length > 0) return present;
  if (owner !== undefined && here.has(owner)) return [owner];
  if (lane !== undefined && here.has(lane.on_behalf_of)) return [lane.on_behalf_of];
  return ownerElsewhere === undefined ? [] : [ownerElsewhere];
}

/**
 * `allow` and `deny` are Chips' own decisions and are logged as `approval.resolved` by
 * `system`, with the engine's reason, beside the request: an auto-approval is an event. `ask`
 * leaves the card for a person.
 */
async function decideApproval(
  event: StoredEvent,
  principal: Principal,
  decision: Decision,
  deps: SubmitEventDeps,
): Promise<StoredEvent | undefined> {
  if (decision.decision === "ask") return undefined;
  const { workspaceId } = principal;
  const now = deps.clock.nowIso();
  const approvalId = String(event.payload["approval_id"]);
  // The request was just stored with its names on it; policy's answer carries the same ones.
  const approvers = event.payload["approvers"];
  const appended = await deps.store.append({
    v: 1,
    type: "approval.resolved",
    id: deps.ids.next("event"),
    ts: now,
    workspace_id: workspaceId,
    ...(event.space_id === null ? {} : { space_id: event.space_id }),
    ...(event.run_id === null ? {} : { run_id: event.run_id }),
    actor: { kind: "system", id: "system" },
    idempotency_key: `${approvalId}-policy`,
    approval_id: approvalId,
    decision: decision.decision === "allow" ? "approved" : "denied",
    scope: "once",
    reason: decision.reason,
    resolved_by: "system",
    resolved_at: now,
    resolved_elsewhere: false,
    ...(Array.isArray(approvers) && approvers.length > 0 ? { approvers } : {}),
  });
  return appended.event;
}

/**
 * "Always" is a rule, not a decision to make again: the action's kind, with its flags, decided
 * the same way from now on, in front of the harness's other rules. Recorded as `policy.updated`
 * so the audit says where the rule came from and a replay reproduces it.
 *
 * For a command it is a rule per part, each for how that part starts (ADR 0239), never the kind
 * whole. It is kept in the ask's space, or, said for every space, in the harness's own policy.
 */
async function ruleFromAlways(
  event: StoredEvent,
  principal: Principal,
  context: AuthorizeContext,
  deps: SubmitEventDeps,
): Promise<void> {
  const decision = String(event.payload["decision"]);
  if (decision === "expired" || context.run === null) return;
  const { workspaceId } = principal;
  const asked = await alwaysAsked(event, workspaceId, deps);
  if (asked === undefined) return;
  const { action, offer } = asked;
  const everywhere = event.payload["everywhere"] === true;
  const space = everywhere ? undefined : (event.space_id ?? undefined);
  const [current, workspace] = await Promise.all([
    deps.readModels.harnessPolicy(workspaceId, context.run.harness_id, space),
    deps.readModels.workspacePolicy(workspaceId),
  ]);
  const rules = alwaysRules(action, offer?.starts, decision, principal, event);
  // The row this scope holds; a space without one of its own starts with none, since the
  // harness's everywhere are read after it rather than copied in (ADR 0239).
  const kept = current?.space_id === (space ?? "*") ? (current?.rules ?? []) : [];
  const fresh = rules.filter((rule) => !alreadyKept(kept, rule));
  if (fresh.length === 0) return;

  await deps.store.append({
    v: 1,
    type: "policy.updated",
    id: deps.ids.next("event"),
    ts: deps.clock.nowIso(),
    workspace_id: workspaceId,
    ...(space === undefined ? {} : { space_id: space }),
    actor: { kind: "system", id: "system" },
    idempotency_key: `${String(event.payload["approval_id"])}-always`,
    harness_id: context.run.harness_id,
    policy: {
      autonomy: current?.autonomy ?? DEFAULT_AUTONOMY,
      // A twin of one (the same kind, flags and start, turned off or deciding the other way)
      // gives way.
      rules: [...fresh, ...kept.filter((other) => !fresh.some((rule) => sameShape(other, rule)))],
    },
    workspace_max_autonomy: workspace?.max_autonomy ?? DEFAULT_WORKSPACE_MAX,
    changed_by: principal.participantId,
    reason: alwaysReason(principal, action, offer, decision, everywhere),
  });
}

/**
 * The action an Always answers, and for a command what it remembers; nothing when the ask is gone
 * or its command can't be remembered (the door let through only one that can: `refuseStandingYes`).
 */
async function alwaysAsked(
  event: StoredEvent,
  workspaceId: string,
  deps: SubmitEventDeps,
): Promise<
  { action: ActionShape; offer: (StandingOffer & { kind: "starts" }) | undefined } | undefined
> {
  const approval = await deps.readModels.approval(
    workspaceId,
    String(event.payload["approval_id"]),
  );
  const action = approval?.action as ActionShape | undefined;
  if (action === undefined) return undefined;
  const offer = standingOffer(action.input);
  if (offer === undefined) return { action, offer };
  return offer.kind === "starts" ? { action, offer } : undefined;
}

/** What the policy change says it was: who decided what, and how far it reaches. */
function alwaysReason(
  principal: Principal,
  action: ActionShape,
  offer: { readonly starts: readonly (readonly string[])[] } | undefined,
  decision: string,
  everywhere: boolean,
): string {
  const what =
    offer === undefined
      ? action.kind
      : offer.starts.map((start) => `${start.join(" ")} …`).join(", ");
  const verdict = decision === "denied" ? "is not" : "is fine";
  return `${principal.displayName} decided ${what} ${verdict} always${everywhere ? ", in every space" : ""}.`;
}

/** The rules an Always makes: the kind whole, or for a command one per start of its parts. */
function alwaysRules(
  action: ActionShape,
  starts: readonly (readonly string[])[] | undefined,
  decision: string,
  principal: Principal,
  event: StoredEvent,
): PolicyRule[] {
  const resolvedAt = String(event.payload["resolved_at"]);
  return (starts ?? [undefined]).map((start) => ({
    match: action.kind,
    when: { ...flagsOf(action), ...(start === undefined ? {} : { starts_with: [...start] }) },
    decision: decision === "denied" ? "deny" : "allow",
    reason: `${principal.displayName} said always, on ${resolvedAt}`,
    made_by: principal.participantId,
    made_at: resolvedAt,
  }));
}

/** The flags an action claimed, and only those, as a rule's `when`. */
function flagsOf(action: ActionShape): NonNullable<PolicyRule["when"]> {
  return {
    ...(action.external === undefined ? {} : { external: action.external }),
    ...(action.irreversible === undefined ? {} : { irreversible: action.irreversible }),
  };
}

/** Whether two rules are for the same kind of action with the same flags. */
function sameShape(one: PolicyRule, other: PolicyRule): boolean {
  return (
    one.match === other.match && JSON.stringify(one.when ?? {}) === JSON.stringify(other.when ?? {})
  );
}

/**
 * Whether an "always" is one the room already has: the rule there for that kind and those flags
 * decides the same way and is on, so a second would only grow the list. One turned off is
 * replaced by the new answer, switched on (ADR 0195).
 */
function alreadyKept(rules: readonly PolicyRule[], rule: PolicyRule): boolean {
  const kept = rules.find((other) => sameShape(other, rule));
  return kept?.decision === rule.decision && kept.off !== true;
}

/** Every event type is in the catalogue; this keeps the import honest for the tests. */
export const knownEvent = (type: string): boolean => eventDefinition(type) !== undefined;
