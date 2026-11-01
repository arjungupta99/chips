/**
 * The upgrade to one room per agent (ADR 0087, point 9's second dry run, and its addendum of
 * 30 September, point 1): what Phase 2 left in more rooms than one is settled by appended events.
 *
 * - **An agent still in an archived room** is released from it, and the room is remembered as the
 *   one an unarchive brings it back to. Its reason is `archived` where a person archived the room,
 *   and `agent_archived` where its harness did, as rule 9 now does.
 * - **An agent in more than one open room** gives each room that has a key of its harness's the
 *   key's own agent (the addendum's point 2), and the harness's direct room its default agent, each
 *   in its place, so what it said there reads as theirs. Where it is still in more than one, it
 *   keeps the room with the latest activity and is released from the rest.
 *
 * A dry run first, and `--apply` on his word. Run twice, it adds nothing.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { unscopedKey } from "../../domain/index.js";
import { type AgentDeps, defaultAgentOf, registerAgent, replaceInRoom } from "../agents.js";
import type {
  AgentView,
  Clock,
  EventStore,
  IdGenerator,
  ParticipantView,
  ReadModels,
  SpaceView,
} from "../ports/index.js";

export interface UpgradeOneRoomDeps {
  readonly store: EventStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly readModels: Pick<
    ReadModels,
    | "participantsIn"
    | "roomsHolding"
    | "agentByKey"
    | "agentsOf"
    | "agentRoom"
    | "participant"
    | "heldNames"
  >;
}

/** A room, as the plan names it. */
export interface PlannedRoom {
  readonly space_id: string;
  readonly title: string | null;
}

/** One thing the upgrade does for an agent. */
export type OneRoomStep =
  | {
      readonly kind: "release";
      readonly room: PlannedRoom;
      readonly reason: "archived" | "agent_archived" | "removed";
    }
  | { readonly kind: "key_agent"; readonly room: PlannedRoom; readonly key: string }
  | { readonly kind: "default_agent"; readonly room: PlannedRoom }
  | { readonly kind: "keep"; readonly room: PlannedRoom };

export interface PlannedAgentRooms {
  readonly agent_id: string;
  readonly name: string;
  readonly harness: string;
  readonly harness_id: string;
  readonly steps: readonly OneRoomStep[];
}

export interface OneRoomPlan {
  readonly workspace_id: string;
  readonly agents: readonly PlannedAgentRooms[];
}

const room = (space: SpaceView): PlannedRoom => ({ space_id: space.space_id, title: space.title });

/** The key a room holds of this harness's own, less its prefix; nothing for any other room. */
function ownKey(harnessId: string, space: SpaceView): string | undefined {
  if (space.external_key === null || !space.external_key.startsWith(`${harnessId}:`)) {
    return undefined;
  }
  return unscopedKey(harnessId, space.external_key).key;
}

/** The direct room a harness was handed when it was added: no key, and asked of nobody. */
function handedRoom(space: SpaceView): boolean {
  return space.kind === "direct" && space.external_key === null && space.asked_of === null;
}

export function createUpgradeOneRoom(deps: UpgradeOneRoomDeps) {
  const agentDeps: AgentDeps = deps;

  /** What each open room of an agent in several gets instead of it, and the one it keeps. */
  async function openSteps(
    workspaceId: string,
    harness: ParticipantView,
    agent: AgentView,
    open: readonly SpaceView[],
  ): Promise<OneRoomStep[]> {
    const steps: OneRoomStep[] = [];
    const left: SpaceView[] = [];
    for (const space of open) {
      const instead = await insteadOf(workspaceId, harness, agent, space);
      if (instead === undefined) left.push(space);
      else steps.push(instead);
    }
    return [...steps, ...keepLatest(left)];
  }

  /**
   * Who takes an agent's place in one of its several rooms: a room keyed by its harness gets the
   * key's own agent, and the room the harness was handed its default one while that is free.
   * Nothing for any other room. Not for a harness that follows its rooms, whose keyed rooms were
   * each their own agent's already.
   */
  async function insteadOf(
    workspaceId: string,
    harness: ParticipantView,
    agent: AgentView,
    space: SpaceView,
  ): Promise<OneRoomStep | undefined> {
    if (harness.capabilities?.includes(HARNESS_CAPABILITIES.followsRooms) === true) {
      return undefined;
    }
    const key = ownKey(harness.id, space);
    if (key !== undefined && key !== agent.key)
      return { kind: "key_agent", room: room(space), key };
    const isDefault = agent.key === harness.id;
    if (!handedRoom(space) || isDefault) return undefined;
    return (await defaultIsFree(workspaceId, harness))
      ? { kind: "default_agent", room: room(space) }
      : undefined;
  }

  /** Whether the harness's default agent is in no room, so it may take the handed room. */
  async function defaultIsFree(workspaceId: string, harness: ParticipantView): Promise<boolean> {
    const known = await deps.readModels.agentByKey(workspaceId, harness.id, harness.id);
    if (known === undefined) return true;
    return (await deps.readModels.agentRoom(workspaceId, known.agent_id)) === undefined;
  }

  async function stepsFor(
    workspaceId: string,
    harness: ParticipantView,
    agent: AgentView,
  ): Promise<OneRoomStep[]> {
    const rooms = (await deps.readModels.roomsHolding(workspaceId, agent.agent_id)).filter(
      (space) => space.parent_space_id === null,
    );
    const closed: OneRoomStep[] = rooms
      .filter((space) => space.state === "closed")
      .map((space) => ({
        kind: "release",
        room: room(space),
        reason: space.state_by === "person" ? "archived" : "agent_archived",
      }));
    const open = rooms.filter((space) => space.state === "open");
    if (open.length < 2) return closed;
    return [...closed, ...(await openSteps(workspaceId, harness, agent, open))];
  }

  /** One harness's agents that have something to settle. */
  async function planFor(
    workspaceId: string,
    harness: ParticipantView,
  ): Promise<PlannedAgentRooms[]> {
    const planned: PlannedAgentRooms[] = [];
    for (const agent of await deps.readModels.agentsOf(workspaceId, harness.id)) {
      const steps = await stepsFor(workspaceId, harness, agent);
      if (steps.every((step) => step.kind === "keep")) continue;
      planned.push({
        agent_id: agent.agent_id,
        name: agent.name,
        harness: harness.display_name,
        harness_id: harness.id,
        steps,
      });
    }
    return planned;
  }

  async function plan(workspaceId: string): Promise<OneRoomPlan> {
    const agents: PlannedAgentRooms[] = [];
    for (const harness of await deps.readModels.participantsIn(workspaceId)) {
      if (harness.kind !== "harness" || harness.removed_at !== null) continue;
      agents.push(...(await planFor(workspaceId, harness)));
    }
    return { workspace_id: workspaceId, agents };
  }

  /** The room with the latest activity is kept; the rest release the agent. */
  function keepLatest(left: readonly SpaceView[]): OneRoomStep[] {
    const latest = [...left].sort((a, b) =>
      String(b.last_activity_at ?? "").localeCompare(String(a.last_activity_at ?? "")),
    );
    return latest.map((space, index) =>
      index === 0
        ? { kind: "keep", room: room(space) }
        : { kind: "release", room: room(space), reason: "removed" },
    );
  }

  /** One step, as events. */
  async function take(
    workspaceId: string,
    harness: ParticipantView,
    agentId: string,
    step: OneRoomStep,
  ): Promise<void> {
    if (step.kind === "keep") return;
    if (step.kind === "release") {
      await release(workspaceId, agentId, step.room.space_id, step.reason);
      return;
    }
    const { agent } =
      step.kind === "key_agent"
        ? await registerAgent(agentDeps, {
            workspaceId,
            harnessId: harness.id,
            key: step.key,
            name: harness.display_name,
            actor: { kind: "system", id: "system" },
          })
        : await defaultAgentOf(agentDeps, workspaceId, harness);
    await replaceInRoom(deps, {
      workspaceId,
      spaceId: step.room.space_id,
      from: agentId,
      to: agent.agent_id,
      once: `one-room-${step.room.space_id}-${agentId}`,
    });
  }

  /** An agent out of a room, as a person taking it out would be, with the reason. */
  async function release(
    workspaceId: string,
    agentId: string,
    spaceId: string,
    reason: "archived" | "agent_archived" | "removed",
  ): Promise<void> {
    await deps.store.append({
      v: 1,
      type: "membership.removed",
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: workspaceId,
      space_id: spaceId,
      actor: { kind: "system", id: "system" },
      idempotency_key: `one-room-release-${spaceId}-${agentId}`,
      participant_id: agentId,
      removed_by: "system",
      reason,
    });
  }

  async function apply(workspaceId: string): Promise<{ plan: OneRoomPlan; appended: number }> {
    const planned = await plan(workspaceId);
    const before = await deps.store.head(workspaceId);
    const participants = await deps.readModels.participantsIn(workspaceId);
    for (const agent of planned.agents) {
      const harness = participants.find((each) => each.id === agent.harness_id);
      if (harness === undefined) continue;
      for (const step of agent.steps) await take(workspaceId, harness, agent.agent_id, step);
    }
    return { plan: planned, appended: (await deps.store.head(workspaceId)) - before };
  }

  return { plan, apply };
}

export type UpgradeOneRoom = ReturnType<typeof createUpgradeOneRoom>;

/** The plan as lines a person reads before saying apply. */
export function describeOneRoom(plan: OneRoomPlan): string {
  if (plan.agents.length === 0) return "  Nothing to settle: every agent is in one space at most.";
  const releases = plan.agents.flatMap((agent) =>
    agent.steps.filter((step) => step.kind === "release"),
  ).length;
  return [
    `  ${plan.agents.length} agents to settle, ${releases} releases:`,
    ...plan.agents.map(
      (agent) =>
        `    ${agent.name} (${agent.harness}, ${agent.agent_id})\n${agent.steps.map(stepLine).join("\n")}`,
    ),
  ].join("\n");
}

function stepLine(step: OneRoomStep): string {
  const where = `${step.room.title ?? "(untitled)"} [${step.room.space_id}]`;
  switch (step.kind) {
    case "release":
      return `      release from ${where} (${step.reason})`;
    case "key_agent":
      return `      ${where}: its key's own agent in its place (key ${step.key})`;
    case "default_agent":
      return `      ${where}: the harness's default agent in its place`;
    default:
      return `      keeps ${where}`;
  }
}
