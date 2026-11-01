/**
 * Routing: what Chips does when a lead sends a `task` (M3.1, ADR 0029).
 *
 * A `task` is a lead's intent, logged in the lead's space as a route card. This turns it into a
 * lane: the specialist's own run in the specialist's own space, with a `run.requested` that
 * carries the trail. One object, two views, never a copy (blueprint) — the specialist's replies
 * are ordinary messages in its space, and the lead reads them through the lane it is linked to.
 *
 * Two things stop a chain running away, and the domain (`decideRoute`) decides both: a lane one
 * deeper than the limit, and a route back to a participant already in the trail. Neither is
 * refused — a refusal would fail a legitimate chain — so the work is flattened into a step on
 * the lead's own run instead (blueprint: "flattened into steps, not rejected").
 *
 * A lane between two spaces of one harness — a Space Jacobian hands down to, a subagent a
 * harness spawns beside itself — is a task the lead routes to itself, naming the room it has as
 * the lane's `home` and what to call the work as its `label` (M3.5, ADR 0032). The lane's run
 * is then the lead's own, so the lead's token drives it.
 *
 * The router appends its events straight to the store, the way the sweep and the policy engine
 * do: they are Chips' own, so they do not go back through the door that authorizes a client's.
 */

import type { Attachment } from "@chipschat/protocol";
import {
  decideRoute,
  deliveryForLane,
  isLaneTerminal,
  type LaneState,
  laneStateForRun,
  type RunState,
  type TrailEntry,
} from "../../domain/index.js";
import { defaultAgentOf, registerAgent } from "../agents.js";
import { AppendRefused } from "../ports/event-store.js";
import type { HarnessRegistry } from "../ports/harnesses.js";
import type { Principal } from "../ports/identity.js";
import type {
  Clock,
  EventStore,
  IdGenerator,
  LaneView,
  ParticipantView,
  ReadModels,
  StoredEvent,
} from "../ports/index.js";

export interface LaneRouterDeps {
  readonly store: EventStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly readModels: Pick<
    ReadModels,
    | "participant"
    | "run"
    | "lane"
    | "laneByRun"
    | "lanesLedBy"
    | "runAttachments"
    | "agentRoom"
    | "lastLeft"
    | "harnessPolicy"
    | "isMember"
    | "space"
    | "agentByKey"
    | "participantsIn"
    | "heldNames"
    | "agentsOf"
    | "membersOf"
  >;
  /** Mints the transient participant a `task.child` names, inheriting its lead's owner. */
  readonly registry: Pick<HarnessRegistry, "addHarness">;
}

/** What a `lane.updated` tells the lead: where the lane got to, and what it came back with. */
interface LaneNews {
  readonly state: LaneState;
  readonly summary?: string | undefined;
  readonly cost?: number | undefined;
  readonly attachments?: readonly Attachment[] | undefined;
}

/** A brand-new lane, before a dial is set, asks first: L1 (blueprint, Supervision). */
const DEFAULT_LANE_AUTONOMY = 1;

type Payload = Readonly<Record<string, unknown>>;

/** The harness a lead speaks through: its agent's (ADR 0087), or the lead itself before agents. */
function harnessOfActor(event: StoredEvent): string {
  return (event.actor as { harness_id?: string }).harness_id ?? event.actor.id;
}

/** Who works a lane: the harness it runs on, whose budget it is, and the agent of it that works it. */
interface Specialist {
  readonly id: string;
  readonly agent: string;
  readonly name: string;
}

function str(payload: Payload, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

export function createLaneRouter(deps: LaneRouterDeps) {
  /**
   * The specialist's home (ADR 0087, rule 8): the room its agent is in, or, when it is free, a
   * new room with the person the work is for, which it is put in. The hand-off follows the agent.
   */
  async function resolveHome(
    workspaceId: string,
    agentId: string,
    ownerId: string,
    displayName: string,
  ): Promise<string> {
    const found = await deps.readModels.agentRoom(workspaceId, agentId);
    if (found !== undefined) return found;
    try {
      return await openHome(workspaceId, agentId, ownerId, displayName);
    } catch (error) {
      // The store's own answer: somebody put the agent in a room between the read above and
      // the room's making. The hand-off follows the agent, so that room is its home.
      if (!(error instanceof AppendRefused)) throw error;
      const now = await deps.readModels.agentRoom(workspaceId, agentId);
      if (now === undefined) throw error;
      return now;
    }
  }

  /**
   * A home the lead named: one of its own rooms, for a lane between two spaces of one harness.
   * Both the lead and the specialist must be in it — a lane is worked by posting into it, and
   * the door lets only a member post — so a room that holds neither is refused as a home, and
   * the task is flattened rather than landing somewhere the lead did not say.
   */
  async function checkHome(
    event: StoredEvent,
    home: string,
    who: Specialist,
  ): Promise<string | undefined> {
    // A lane to the lead's own harness is in a room of that harness's: its agent there is the
    // one working it, and the harness is in the room through it (ADR 0087's addendum, point 3).
    const own = who.id === harnessOfActor(event);
    const members = own ? [who.agent] : [...new Set([event.actor.id, who.agent])];
    for (const member of members) {
      if (await deps.readModels.isMember(event.workspace_id, home, member)) continue;
      const yours = own || member === event.actor.id;
      return `Kept in this run: ${home} is not a space ${yours ? "of yours" : "the specialist is in"}.`;
    }
    return undefined;
  }

  /**
   * Open a room for a free specialist with the person, idempotently by an owned key. The key
   * names the agent's last leaving of the room it was last in: two lanes at once, after the same
   * leaving, open one room, and a hand-off after any later leaving opens another rather than
   * finding that one again. It named the room alone once, and an agent released from the same
   * room twice was handed the first hand-off's room without being put in it (agents review,
   * finding 14).
   *
   * The members are added whether or not this call made the room: the appends are keyed, so they
   * add nothing where they landed, and finish the job where a process stopped between the room
   * and its members (finding 7).
   */
  async function openHome(
    workspaceId: string,
    agentId: string,
    ownerId: string,
    displayName: string,
  ): Promise<string> {
    const spaceId = deps.ids.next("space");
    const at = deps.clock.nowIso();
    const last = (await deps.readModels.participant(workspaceId, agentId))?.last_space_id;
    const left =
      last === null || last === undefined
        ? undefined
        : await deps.readModels.lastLeft(workspaceId, last, agentId);
    const envelope = {
      v: 1 as const,
      ts: at,
      workspace_id: workspaceId,
      actor: { kind: "system" as const, id: "system" },
    };
    const opened = await deps.store.append({
      ...envelope,
      type: "space.created",
      id: deps.ids.next("event"),
      space_id: spaceId,
      idempotency_key: `lane-home-${agentId}-${ownerId}-after-${last ?? "none"}-${left ?? 0}`,
      kind: "direct",
      title: displayName,
      // The person reads it, so they must be sent the event that names it (ADR 0024).
      opened_for: ownerId,
    });
    // Two lanes opening a home at once both find none and both write; the loser gets the
    // winner's space by the key.
    const room = opened.event.space_id ?? spaceId;
    for (const [participantId, kind, role] of [
      [ownerId, "person", "owner"],
      [agentId, "agent", "member"],
    ] as const) {
      await deps.store.append({
        ...envelope,
        type: "membership.added",
        id: deps.ids.next("event"),
        space_id: room,
        idempotency_key: `${room}-member-${participantId}`,
        participant_id: participantId,
        participant_kind: kind,
        role,
      });
    }
    return room;
  }

  /** The lane the lead's own run belongs to, when the lead is a specialist of a lane above. */
  async function parentOf(
    workspaceId: string,
    leadRunId: string | undefined,
  ): Promise<LaneView | undefined> {
    if (leadRunId === undefined) return undefined;
    return deps.readModels.laneByRun(workspaceId, leadRunId);
  }

  /** What the lead itself was asked, to name its hop in the trail. */
  async function leadGoal(
    workspaceId: string,
    leadRunId: string | undefined,
    parent: LaneView | undefined,
  ): Promise<string | undefined> {
    if (parent !== undefined) return parent.goal;
    if (leadRunId === undefined) return undefined;
    return (await deps.readModels.run(workspaceId, leadRunId))?.goal;
  }

  /** Flatten a task Chips will not open a lane for: a step on the lead's run, or a note. */
  async function flatten(event: StoredEvent, note: string): Promise<StoredEvent[]> {
    const at = deps.clock.nowIso();
    const base = {
      v: 1 as const,
      ts: at,
      workspace_id: event.workspace_id,
      actor: event.actor,
      idempotency_key: `${str(event.payload, "task_id")}-flattened`,
    };
    if (event.run_id !== null) {
      const appended = await deps.store.append({
        ...base,
        type: "step.log",
        id: deps.ids.next("event"),
        run_id: event.run_id,
        ...(event.space_id === null ? {} : { space_id: event.space_id }),
        step_id: `${str(event.payload, "task_id")}-flattened`,
        status: "done",
        title: note,
      });
      return [appended.event];
    }
    if (event.space_id === null) return [];
    const appended = await deps.store.append({
      ...base,
      type: "checkpoint",
      id: deps.ids.next("event"),
      space_id: event.space_id,
      run_id: event.run_id ?? undefined,
      label: note,
    });
    return [appended.event];
  }

  /** What the router decides for a task: open a lane with this trail, or flatten with a note. */
  async function plan(
    event: StoredEvent,
    specialistId: string,
    onBehalfOf: string,
    specialistName: string,
  ): Promise<{ open: true; trail: TrailEntry[] } | { open: false; note: string }> {
    const leadRunId = event.run_id ?? undefined;
    const parent = await parentOf(event.workspace_id, leadRunId);
    // By harness: a lead handing to another of its own agents is a lane between two spaces of
    // one harness (M3.5), not a loop.
    const decision = decideRoute(
      {
        leadId: harnessOfActor(event),
        leadRunId,
        leadGoal: await leadGoal(event.workspace_id, leadRunId, parent),
        onBehalfOf,
        specialistId,
      },
      parent === undefined ? undefined : { depth: parent.depth, trail: parent.trail },
    );
    if (decision.route) return { open: true, trail: decision.trail };
    const note =
      decision.reason === "loops"
        ? `Kept in this run: ${specialistName} is already in this chain.`
        : `Kept in this run: the chain is ${decision.depth} deep, past the limit.`;
    return { open: false, note };
  }

  /**
   * Mint the transient participant a `task.child` names: an agent of the lead's harness scoped to
   * this one lane (ADR 0087), so it shares the lead's owner, autonomy and budget, and the lead's
   * connection speaks for it (blueprint).
   */
  async function resolveChild(event: StoredEvent, label: string): Promise<Resolved> {
    const harness = harnessOfActor(event);
    const lead = await deps.readModels.participant(event.workspace_id, harness);
    if (lead === undefined) {
      return { kind: "flatten", note: "Kept in this run: no lead to mint a child under." };
    }
    const { agent } = await registerAgent(deps, {
      workspaceId: event.workspace_id,
      harnessId: harness,
      key: `lane:${str(event.payload, "task_id") ?? event.id}`,
      name: label,
      actor: { kind: "system", id: "system" },
    });
    return { kind: "ok", id: harness, agent: agent.agent_id, name: agent.name };
  }

  type Resolved =
    | ({ kind: "ok" } & Specialist)
    | { kind: "flatten"; note: string }
    | { kind: "skip" };

  /**
   * Who of the lead's own harness works a lane in the home it named: the harness itself in a
   * room it is in from before agents, else its one agent there. Nothing when it has none there,
   * and a note when it has several.
   */
  async function ownIn(
    event: StoredEvent,
    home: string,
    harnessId: string,
  ): Promise<string | { note: string } | undefined> {
    const members = await deps.readModels.membersOf(event.workspace_id, home);
    if (members.some((member) => member.participant_id === harnessId)) return harnessId;
    const theirs = members.filter(
      (member) => member.harness_id === harnessId && member.removed !== true,
    );
    if (theirs.length > 1) {
      return { note: `Kept in this run: ${home} has more than one of your agents; name one.` };
    }
    return theirs[0]?.participant_id;
  }

  /**
   * The agent of a harness that takes a lane, when the lead named the harness (ADR 0087's
   * addendum, point 3): for its own harness, its one agent in the home it named; for another's,
   * its Main agent, or its default one, whose room with the person is the lane's home.
   */
  async function agentOfHarness(
    event: StoredEvent,
    harness: { readonly id: string; readonly display_name: string },
  ): Promise<string | { note: string }> {
    const home = str(event.payload, "home");
    const own = harness.id === harnessOfActor(event);
    const inHome = own && home !== undefined ? await ownIn(event, home, harness.id) : undefined;
    if (inHome !== undefined) return inHome;
    const agents = await deps.readModels.agentsOf(event.workspace_id, harness.id);
    const lead = agents.find((agent) => agent.lead && agent.state === "active");
    if (lead !== undefined) return lead.agent_id;
    return (await defaultAgentOf(deps, event.workspace_id, harness)).agent.agent_id;
  }

  /**
   * Who the task routes to: a named harness, a freshly minted ephemeral child, or the lead
   * itself — a lane between two of its own spaces, called by the task's `label`.
   */
  async function resolveSpecialist(event: StoredEvent): Promise<Resolved> {
    const task = event.payload;
    const child = task["child"] as { label?: unknown } | undefined;
    if (typeof child?.label === "string") return resolveChild(event, child.label);
    const to = str(task, "to");
    if (to === undefined) return { kind: "skip" };
    const specialist = await deps.readModels.participant(event.workspace_id, to);
    if (
      specialist === undefined ||
      (specialist.kind !== "harness" && specialist.kind !== "agent")
    ) {
      return { kind: "flatten", note: `Kept in this run: no harness or agent ${to} to route to.` };
    }
    // A removed harness cannot connect to work a lane, or be added to its home (ADR 0078).
    if (specialist.removed_at !== null) {
      return {
        kind: "flatten",
        note: `Kept in this run: ${specialist.display_name} was removed from the workspace.`,
      };
    }
    return specialistOf(event, specialist);
  }

  /** The harness a lane runs on, the agent of it that works it, and what to call it. */
  async function specialistOf(event: StoredEvent, specialist: ParticipantView): Promise<Resolved> {
    const isAgent = specialist.kind === "agent";
    const harness = isAgent ? (specialist.harness_id ?? specialist.id) : specialist.id;
    const agent = isAgent ? specialist.id : await agentOfHarness(event, specialist);
    if (typeof agent !== "string") return { kind: "flatten", note: agent.note };
    const label = harness === harnessOfActor(event) ? str(event.payload, "label") : undefined;
    const named = isAgent
      ? undefined
      : (await deps.readModels.participant(event.workspace_id, agent))?.display_name;
    return { kind: "ok", id: harness, agent, name: label ?? named ?? specialist.display_name };
  }

  /**
   * Where the lane lives: the room the lead named, once both parties are known to be in it,
   * or the specialist's direct space with the person.
   */
  async function homeFor(
    event: StoredEvent,
    who: Specialist,
    onBehalfOf: string,
  ): Promise<{ home: string } | { note: string }> {
    const named = str(event.payload, "home");
    const resolved = () => resolveHome(event.workspace_id, who.agent, onBehalfOf, who.name);
    if (named === undefined) return { home: await resolved() };
    const refused = await checkHome(event, named, who);
    if (refused === undefined) return { home: named };
    // A lead naming a room its harness opened, that its agent has left, as one that keeps rooms
    // by key does: the lane goes where the agent is (ADR 0087, rule 8).
    if (await openedByItsHarness(event, named, who)) return { home: await resolved() };
    return { note: refused };
  }

  /** Whether a room was opened by the harness a lane to its own agent is on. */
  async function openedByItsHarness(
    event: StoredEvent,
    spaceId: string,
    who: Specialist,
  ): Promise<boolean> {
    if (who.id !== harnessOfActor(event)) return false;
    return (await deps.readModels.space(event.workspace_id, spaceId))?.opened_by === who.id;
  }

  /**
   * A lane id is its lead's own. A task wearing the id of a lane another lead opened would be
   * acknowledged with that lane's whereabouts and folded into it on screen, so it is kept in
   * the run instead (Gate 3). The same lead sending the same id again is a retry, which the
   * `run.requested` key already makes harmless.
   */
  async function checkLaneId(event: StoredEvent, laneId: string): Promise<string | undefined> {
    const existing = await deps.readModels.lane(event.workspace_id, laneId);
    if (existing === undefined || existing.lead_id === event.actor.id) return undefined;
    return "Kept in this run: that lane id belongs to another lead.";
  }

  /**
   * The person the work is for: somebody who exists, and either the lead's own owner or in the
   * space the task was sent from — the person whose message the lead took. A lane opens a room
   * for this person and names them on every card, so a lead may not route on behalf of a
   * stranger, or of nobody (Gate 3).
   */
  async function checkPerson(event: StoredEvent, onBehalfOf: string): Promise<string | undefined> {
    const person = await deps.readModels.participant(event.workspace_id, onBehalfOf);
    if (person === undefined || person.kind !== "person") {
      return `Kept in this run: ${onBehalfOf} is not a person here.`;
    }
    const lead = await deps.readModels.participant(event.workspace_id, event.actor.id);
    if (lead?.owner_id === onBehalfOf) return undefined;
    if (
      event.space_id !== null &&
      (await deps.readModels.isMember(event.workspace_id, event.space_id, onBehalfOf))
    ) {
      return undefined;
    }
    return `Kept in this run: ${person.display_name} is not in this space, so the work cannot be on their behalf.`;
  }

  /**
   * Where the route card appears, and where the lane's news is written: the space the task was
   * sent from, and the one `link_to` names when the lead is in it. A lane's summary and cost
   * land in every linked space, so a space the lead cannot read is not one it may link a lane
   * into (Gate 3).
   */
  async function linkedSpaces(event: StoredEvent): Promise<string[]> {
    const linked = event.space_id === null ? [] : [event.space_id];
    const named = str(event.payload, "link_to");
    if (named === undefined || linked.includes(named)) return linked;
    if (await deps.readModels.isMember(event.workspace_id, named, event.actor.id)) {
      linked.push(named);
    }
    return linked;
  }

  /** Where a lane for this specialist goes — its trail and its home — or the note to flatten with. */
  async function placeLane(
    event: StoredEvent,
    who: Specialist,
    onBehalfOf: string,
  ): Promise<{ trail: TrailEntry[]; home: string } | { note: string }> {
    const decision = await plan(event, who.id, onBehalfOf, who.name);
    if (!decision.open) return { note: decision.note };
    const where = await homeFor(event, who, onBehalfOf);
    return "note" in where ? where : { trail: decision.trail, home: where.home };
  }

  /** Route one `task` into a lane, or flatten it. */
  async function onTask(event: StoredEvent): Promise<StoredEvent[]> {
    const task = event.payload;
    const laneId = str(task, "task_id");
    const onBehalfOf = str(task, "on_behalf_of");
    if (laneId === undefined || onBehalfOf === undefined) return [];

    // What the lead may say, before a child is minted or a home opened for nothing.
    const refused = (await checkLaneId(event, laneId)) ?? (await checkPerson(event, onBehalfOf));
    if (refused !== undefined) return flatten(event, refused);

    const who = await resolveSpecialist(event);
    if (who.kind === "skip") return [];
    if (who.kind === "flatten") return flatten(event, who.note);

    const placed = await placeLane(event, who, onBehalfOf);
    if ("note" in placed) return flatten(event, placed.note);
    return [
      await request(event, {
        laneId,
        specialistId: who.id,
        agentId: who.agent,
        onBehalfOf,
        goal: str(task, "goal"),
        home: placed.home,
        trail: placed.trail,
        linked: await linkedSpaces(event),
      }),
    ];
  }

  /** The optional fields of `run.requested` a task carries, each only when it has one. */
  function optionalFields(event: StoredEvent): Record<string, unknown> {
    const task = event.payload;
    const out: Record<string, unknown> = {};
    if (Array.isArray(task["constraints"])) out["constraints"] = task["constraints"];
    const deadline = str(task, "deadline");
    if (deadline !== undefined) out["deadline"] = deadline;
    const origin = str(task, "origin");
    if (origin !== undefined) out["origin"] = origin;
    const label = str(task, "label");
    if (label !== undefined) out["label"] = label;
    return out;
  }

  /** Append the `run.requested` that opens the lane in the specialist's home space. */
  async function request(
    event: StoredEvent,
    lane: {
      laneId: string;
      specialistId: string;
      agentId: string;
      onBehalfOf: string;
      goal: string | undefined;
      home: string;
      trail: TrailEntry[];
      /** The lead spaces the route card appears in, each one the lead is in. */
      linked: string[];
    },
  ): Promise<StoredEvent> {
    const autonomy =
      typeof event.payload["autonomy"] === "number"
        ? event.payload["autonomy"]
        : DEFAULT_LANE_AUTONOMY;
    const appended = await deps.store.append({
      v: 1,
      type: "run.requested",
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: event.workspace_id,
      space_id: lane.home,
      run_id: deps.ids.next("run"),
      actor: { kind: "system", id: "system" },
      idempotency_key: `${lane.laneId}-requested`,
      lane_id: lane.laneId,
      goal: lane.goal ?? "",
      on_behalf_of: lane.onBehalfOf,
      requested_by: event.actor.id,
      specialist_id: lane.specialistId,
      ...(lane.agentId.startsWith("agt_") ? { agent_id: lane.agentId } : {}),
      trail: lane.trail,
      autonomy,
      ...(lane.linked.length === 0 ? {} : { link_to: lane.linked }),
      ...optionalFields(event),
    });
    return appended.event;
  }

  /**
   * The lead's rooms that are still there. One that was erased (ADR 0067) is still named by the
   * request that opened the lane, since that is the specialist's room's history; news for it
   * would bring it back.
   */
  async function stillThere(workspaceId: string, spaces: readonly string[]): Promise<string[]> {
    const there: string[] = [];
    for (const space of spaces) {
      if ((await deps.readModels.space(workspaceId, space)) !== undefined) there.push(space);
    }
    return there;
  }

  /** Tell a lane's lead the news, into every space the lane is linked into. */
  async function emitLaneUpdated(
    workspaceId: string,
    lane: LaneView,
    news: LaneNews,
    keySuffix: string,
  ): Promise<StoredEvent[]> {
    const out: StoredEvent[] = [];
    for (const space of await stillThere(workspaceId, lane.linked_space_ids)) {
      const appended = await deps.store.append({
        v: 1,
        type: "lane.updated",
        id: deps.ids.next("event"),
        ts: deps.clock.nowIso(),
        workspace_id: workspaceId,
        space_id: space,
        actor: { kind: "system", id: "system" },
        idempotency_key: `${lane.lane_id}-${keySuffix}-${space}`,
        lane_id: lane.lane_id,
        state: news.state,
        delivery: deliveryForLane(news.state),
        ...(news.summary === undefined ? {} : { summary: news.summary }),
        ...(news.cost === undefined ? {} : { cost_usd: news.cost }),
        ...(news.attachments === undefined ? {} : { attachments: news.attachments }),
      });
      out.push(appended.event);
    }
    return out;
  }

  /**
   * Whether a lane's run has moved somewhere worth telling the lead: a new state, or a terminal
   * state reached from a live one. A second event that keeps it running says nothing new.
   */
  function laneMoved(lane: LaneView, state: LaneState): boolean {
    if (state === lane.state) return false;
    if (isLaneTerminal(state) && isLaneTerminal(lane.state as LaneState)) return false;
    return true;
  }

  /** What a lane in this state carries: its summary when completed, its cost when done for good. */
  function laneNews(
    run: { summary: string | null; cost_usd: number | null },
    state: LaneState,
  ): LaneNews {
    return {
      state,
      ...(state === "completed" && run.summary !== null ? { summary: run.summary } : {}),
      ...(isLaneTerminal(state) && run.cost_usd !== null ? { cost: run.cost_usd } : {}),
    };
  }

  /**
   * A lane run changed: if its state moved, tell the lead. A completed lane carries the
   * specialist's summary and the cost rolled onto it.
   */
  async function tellLead(event: StoredEvent, lane: LaneView): Promise<StoredEvent[]> {
    const run = await deps.readModels.run(event.workspace_id, event.run_id ?? "");
    if (run === undefined) return [];
    const state = laneStateForRun(run.state as RunState);
    if (!laneMoved(lane, state)) return [];
    const news = laneNews(run, state);
    return emitLaneUpdated(
      event.workspace_id,
      lane,
      { ...news, ...(await filesOf(event, state)) },
      `upd-${event.id}`,
    );
  }

  /**
   * The files a completed lane hands back with its summary: the attachments on the specialist's
   * own messages in the lane's run (Arjun, 12 September 2026). He asked his lead for photos of a
   * restaurant's menu; four arrived in the room the lead routed the work to and none in the room
   * he had asked in, where the answer read "Here are four menu photos" with nothing under it. A
   * summary is words, and a lane that ends in pictures has none to give.
   *
   * Only on the way to completed. A lane that failed or was cancelled has no answer, and one
   * still running would hand back the same files again at every step.
   */
  async function filesOf(
    event: StoredEvent,
    state: LaneState,
  ): Promise<{ attachments?: Attachment[] }> {
    if (state !== "completed" || event.run_id === null) return {};
    const files = await deps.readModels.runAttachments(event.workspace_id, event.run_id);
    return files.length === 0 ? {} : { attachments: files };
  }

  /** Stop one lane's run, and tell its lead the lane was cancelled. */
  async function cancelLane(
    event: StoredEvent,
    lane: LaneView,
    runId: string,
  ): Promise<StoredEvent[]> {
    const appended = await deps.store.append({
      v: 1,
      type: "run.cancel",
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: event.workspace_id,
      space_id: lane.home_space_id ?? undefined,
      run_id: runId,
      actor: { kind: "system", id: "system" },
      idempotency_key: `${lane.lane_id}-cascade-cancel`,
      reason: "The lead's run was cancelled.",
      by: "system",
    });
    return [
      appended.event,
      ...(await emitLaneUpdated(event.workspace_id, lane, { state: "cancelled" }, "cancel")),
    ];
  }

  /**
   * Cancelling a lead's run cancels the lanes it opened, and theirs, down the chain. A lane
   * that has already ended keeps its ending: a completed lane is not cancelled after the fact,
   * and its specialist is not told to stop a run it finished (Gate 3). The chain below it is
   * still walked, in case a lane of its own outlived it.
   */
  async function cascade(event: StoredEvent, leadRunId: string): Promise<StoredEvent[]> {
    const out: StoredEvent[] = [];
    for (const lane of await deps.readModels.lanesLedBy(event.workspace_id, leadRunId)) {
      if (lane.run_id === null) continue;
      if (!isLaneTerminal(lane.state as LaneState)) {
        out.push(...(await cancelLane(event, lane, lane.run_id)));
      }
      out.push(...(await cascade(event, lane.run_id)));
    }
    return out;
  }

  /** React to a run event: tell the lane's lead its news, and cascade a cancellation. */
  async function onRunEvent(event: StoredEvent): Promise<StoredEvent[]> {
    if (event.run_id === null) return [];
    const out: StoredEvent[] = [];
    const lane = await deps.readModels.laneByRun(event.workspace_id, event.run_id);
    if (lane !== undefined) out.push(...(await tellLead(event, lane)));
    if (event.type === "run.cancel") out.push(...(await cascade(event, event.run_id)));
    return out;
  }

  /** The one entry point: react to an appended event Chips should route. */
  return {
    async after(event: StoredEvent, _principal?: Principal): Promise<StoredEvent[]> {
      if (event.type === "task") return onTask(event);
      return onRunEvent(event);
    },
  };
}

export type LaneRouter = ReturnType<typeof createLaneRouter>;
