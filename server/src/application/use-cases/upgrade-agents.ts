/**
 * The upgrade to agents (ADR 0087, point 9, and its addendum of 29 September): what is there
 * today moves by appended events, and nothing is rewritten.
 *
 * Every harness still in a room is given an agent there, and the agent takes its place:
 *
 * - A harness that follows its rooms (`follows_rooms`) keys each room it opened or claimed by
 *   the thing it keeps for it — a Space, for Jacobian — and that thing is an agent: one per keyed
 *   room, keyed as the room is less the harness's prefix, named after the room. Its home's is its
 *   Main agent (J), and a closed room's is archived, as its Space was in the harness.
 * - Every other room a harness is in — and every room of a harness that does not follow its
 *   rooms, whose keys name only rooms (OpenClaw's, one per session) — holds its one default
 *   agent, named after it.
 * - One `membership.replaced` per room says that what the harness said there is its agent's.
 *
 * A room asked of a harness from the + and not yet claimed keeps the harness: its claim moves it.
 * A harness removed from the workspace keeps its rooms as they are. Run twice, it adds nothing:
 * an agent is found by its key, and each event carries a key of its own.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { unscopedKey } from "../../domain/index.js";
import {
  type AgentDeps,
  agentName,
  archiveAgent,
  registerAgent,
  replaceInRoom,
} from "../agents.js";
import type {
  Clock,
  EventStore,
  IdGenerator,
  ParticipantView,
  ReadModels,
  SpaceView,
} from "../ports/index.js";

export interface UpgradeAgentsDeps {
  readonly store: EventStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly readModels: Pick<
    ReadModels,
    "participantsIn" | "roomsHolding" | "agentByKey" | "agentsOf" | "participant" | "heldNames"
  >;
}

/** One agent the upgrade gives a harness, and the rooms it takes the harness's place in. */
export interface PlannedAgent {
  readonly key: string;
  readonly name: string;
  readonly lead: boolean;
  /** Archived in its harness: the room it is for was closed. */
  readonly archived: boolean;
  /** Registered already, by a run before this one or by the harness. */
  readonly known: boolean;
  readonly rooms: readonly {
    readonly space_id: string;
    readonly title: string | null;
    readonly state: "open" | "closed";
  }[];
}

export interface PlannedHarness {
  readonly harness_id: string;
  readonly name: string;
  readonly follows_rooms: boolean;
  readonly agents: readonly PlannedAgent[];
  /** Rooms asked of it from the + and not claimed, which keep the harness until it claims them. */
  readonly waiting: readonly string[];
}

export interface UpgradePlan {
  readonly workspace_id: string;
  readonly harnesses: readonly PlannedHarness[];
}

/** The rooms a room key names for a harness: its own key, less its prefix. */
function keyOf(harnessId: string, room: SpaceView): string | undefined {
  if (room.external_key === null) return undefined;
  const { key, shared } = unscopedKey(harnessId, room.external_key);
  return shared || key === room.external_key ? undefined : key;
}

/** A room waiting for its harness to claim it: asked of it from the +, with no key yet. */
function waitsFor(harnessId: string, room: SpaceView): boolean {
  return room.asked_of === harnessId && room.external_key === null;
}

/** An agent's rooms, as the plan gathers them. */
interface Gathered {
  readonly lead: boolean;
  readonly archived: boolean;
  readonly name: string;
  readonly rooms: readonly SpaceView[];
}

/**
 * One room, onto the agent it goes to: the room's own, keyed by its key, for a harness that
 * follows its rooms — the Main agent for its home, archived when closed — or the harness's default.
 */
function gather(
  byKey: Map<string, Gathered>,
  harness: ParticipantView,
  room: SpaceView,
  follows: boolean,
): void {
  const own = follows ? keyOf(harness.id, room) : undefined;
  const key = own ?? harness.id;
  const name = own === undefined ? harness.display_name : (room.title ?? own);
  const planned = byKey.get(key) ?? { lead: false, archived: false, name, rooms: [] };
  byKey.set(key, {
    name: planned.name,
    lead: planned.lead || (own !== undefined && room.home),
    archived: own !== undefined && room.state === "closed" && !room.home,
    rooms: [...planned.rooms, room],
  });
}

async function planFor(
  deps: UpgradeAgentsDeps,
  workspaceId: string,
  harness: ParticipantView,
): Promise<PlannedHarness> {
  const follows = harness.capabilities?.includes(HARNESS_CAPABILITIES.followsRooms) === true;
  const rooms = await deps.readModels.roomsHolding(workspaceId, harness.id);
  const byKey = new Map<string, Gathered>();
  const waiting: string[] = [];
  for (const room of rooms) {
    if (waitsFor(harness.id, room)) waiting.push(room.space_id);
    else gather(byKey, harness, room, follows);
  }
  const agents: PlannedAgent[] = [];
  for (const [key, planned] of byKey) {
    const known = await deps.readModels.agentByKey(workspaceId, harness.id, key);
    agents.push({
      key,
      name: agentName(planned.name),
      lead: planned.lead,
      archived: planned.archived,
      known: known !== undefined,
      rooms: planned.rooms.map((room) => ({
        space_id: room.space_id,
        title: room.title,
        state: room.state,
      })),
    });
  }
  return {
    harness_id: harness.id,
    name: harness.display_name,
    follows_rooms: follows,
    agents,
    waiting,
  };
}

async function applyHarness(
  deps: UpgradeAgentsDeps,
  workspaceId: string,
  harness: PlannedHarness,
): Promise<void> {
  const agentDeps: AgentDeps = deps;
  for (const planned of harness.agents) {
    const { agent } = await registerAgent(agentDeps, {
      workspaceId,
      harnessId: harness.harness_id,
      key: planned.key,
      name: planned.name,
      lead: planned.lead,
      actor: { kind: "system", id: "system" },
    });
    if (planned.archived && agent.state !== "archived") {
      await archiveAgent(deps, workspaceId, agent.agent_id);
    }
    for (const room of planned.rooms) {
      await replaceInRoom(deps, {
        workspaceId,
        spaceId: room.space_id,
        from: harness.harness_id,
        to: agent.agent_id,
      });
    }
  }
}

export function createUpgradeAgents(deps: UpgradeAgentsDeps) {
  /** What the upgrade would do in a workspace, without doing it. */
  async function plan(workspaceId: string): Promise<UpgradePlan> {
    const everyone = await deps.readModels.participantsIn(workspaceId);
    const harnesses = everyone.filter(
      (each) => each.kind === "harness" && each.removed_at === null,
    );
    const planned: PlannedHarness[] = [];
    for (const harness of harnesses) planned.push(await planFor(deps, workspaceId, harness));
    return { workspace_id: workspaceId, harnesses: planned };
  }

  /** Do it: the plan, then the events, harness by harness. */
  async function apply(workspaceId: string): Promise<{ plan: UpgradePlan; appended: number }> {
    const planned = await plan(workspaceId);
    const before = await deps.store.head(workspaceId);
    for (const harness of planned.harnesses) await applyHarness(deps, workspaceId, harness);
    return { plan: planned, appended: (await deps.store.head(workspaceId)) - before };
  }

  return { plan, apply };
}

export type UpgradeAgents = ReturnType<typeof createUpgradeAgents>;

/** The plan as a person reads it: a line per harness, then its agents and their rooms. */
export function describePlan(plan: UpgradePlan): string {
  return plan.harnesses.flatMap(harnessLines).join("\n");
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function harnessLines(harness: PlannedHarness): string[] {
  const rooms = harness.agents.reduce((sum, agent) => sum + agent.rooms.length, 0);
  const fresh = harness.agents.filter((agent) => !agent.known).length;
  const archived = harness.agents.filter((agent) => agent.archived).length;
  const how = harness.follows_rooms
    ? "follows its spaces: an agent per keyed space"
    : "one agent in every space";
  return [
    `${harness.name} (${harness.harness_id}) — ${how}`,
    `  ${plural(harness.agents.length, "agent")} (${fresh} new), ${archived} archived, in ${plural(rooms, "room")}; ${harness.waiting.length} asked from the + and unclaimed, left as they are`,
    ...harness.agents.map(agentLine),
  ];
}

function agentLine(agent: PlannedAgent): string {
  const marks = [
    agent.lead ? "Main" : undefined,
    agent.archived ? "archived" : undefined,
    agent.known ? "registered already" : undefined,
  ].filter((mark) => mark !== undefined);
  const where = agent.rooms.map(
    (room) => `${room.title ?? "(untitled)"}${room.state === "closed" ? " [closed]" : ""}`,
  );
  const marked = marks.length === 0 ? "" : ` (${marks.join(", ")})`;
  return `    ${agent.name}${marked} — key ${agent.key} — ${where.join("; ")}`;
}
