/**
 * Fork an agent into a room (ADR 0087, Fork and point 4): a person asks the agent's harness for a
 * copy of it in this room, and the harness's copy, registered with `forked_from` and the room,
 * joins it. The copy remembers everything the agent did up to the ask; after that the two remember
 * separately, which is the harness's to keep.
 *
 * - **The ask** is `agent.fork` in the room the copy is for. The room shows it waiting, and the
 *   agent's harness is sent it. Who may ask is who may move the agent: a person in the room, not a
 *   guest, who owns its harness or is an owner or admin of the workspace, since a copy spends the
 *   harness's budget. Never the Main agent, an archived agent, a free one (putting it in the room
 *   loses nothing), into a Main room or a closed one, or into the room it is in; and only for a
 *   harness that declares `forks`. Asked again while an ask stands, it is the same ask.
 * - **The answer** is the copy joining the room: `membership.added` with `fork_of`, while the ask
 *   stands. An ask stands for `FORK_WAIT_MS`, and nothing about it is stored but the event: a copy
 *   registered later is the harness's agent all the same, free, for a person to put in a room.
 */

import { FORK_WAIT_MS, HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { administers, isGuest } from "../../domain/roles.js";
import type { EventStore, ForkAsk, Principal, ReadModels } from "../ports/index.js";

export interface ForkAgentDeps {
  readonly store: Pick<EventStore, "append" | "head">;
  readonly readModels: Pick<
    ReadModels,
    "participant" | "space" | "memberRole" | "workspaceRole" | "agentRoom" | "forkAsk"
  >;
  readonly ids: { next: (kind: "event") => string };
  readonly clock: { nowIso: () => string };
}

export interface ForkRefusal {
  readonly kind: "not_allowed" | "unknown_agent" | "unknown_space" | "invalid";
  readonly message: string;
}

export type ForkResult =
  | {
      readonly ok: true;
      /** False when an ask for this copy stands already, and this is it. */
      readonly asked: boolean;
      /** The `agent.fork` event: the ask the copy answers. */
      readonly forkId: string;
      readonly ts: string;
    }
  | { readonly ok: false; readonly error: ForkRefusal };

function refused(kind: ForkRefusal["kind"], message: string): ForkResult {
  return { ok: false, error: { kind, message } };
}

/** Whether an ask still waits for its copy: none has joined, and the minute is not up. */
export function stands(ask: ForkAsk | undefined, now: string): ask is ForkAsk {
  return ask !== undefined && !ask.answered && Date.parse(now) - Date.parse(ask.ts) < FORK_WAIT_MS;
}

export function createForkAgent(deps: ForkAgentDeps) {
  const { readModels } = deps;

  /** Why this person may not ask for a copy of this agent in this room, or nothing when they may. */
  async function refusal(
    principal: Principal,
    agentId: string,
    spaceId: string,
  ): Promise<ForkResult | undefined> {
    if (principal.kind !== "person") return refused("not_allowed", "A person forks an agent.");
    const { workspaceId, participantId } = principal;
    const standing = await readModels.workspaceRole(workspaceId, participantId);
    if (isGuest(standing)) return refused("not_allowed", "A guest does not fork agents.");
    const agent = await readModels.participant(workspaceId, agentId);
    if (agent?.kind !== "agent") return refused("unknown_agent", "No agent of that id here.");
    const space = await readModels.space(workspaceId, spaceId);
    const role = await readModels.memberRole(workspaceId, spaceId, participantId);
    if (space === undefined || role === undefined || space.parent_space_id !== null) {
      return refused("unknown_space", "No space of that id here.");
    }
    const owns = agent.owner_id === participantId || administers(standing);
    return (
      mayAsk(role, owns) ??
      (await ofTheAgent(workspaceId, agent)) ??
      (await ofTheRoom(workspaceId, agent, space))
    );
  }

  /** A guest in the room forks nothing, and nobody forks an agent that is not theirs to. */
  function mayAsk(role: string, owns: boolean): ForkResult | undefined {
    if (role === "guest") return refused("not_allowed", "A guest does not fork agents.");
    if (owns) return undefined;
    return refused(
      "not_allowed",
      "An agent is forked by its harness's owner, or an owner or admin of the workspace.",
    );
  }

  /** What about the agent, or its harness, refuses a fork, whoever asks. */
  async function ofTheAgent(
    workspaceId: string,
    agent: {
      readonly display_name: string;
      readonly harness_id?: string;
      readonly lead?: boolean;
      readonly state?: string;
      readonly removed_at: string | null;
    },
  ): Promise<ForkResult | undefined> {
    if (agent.removed_at !== null)
      return refused("invalid", "That agent was deleted, or its harness removed.");
    if (agent.lead === true) return refused("invalid", "The Main agent isn't forked.");
    if (agent.state === "archived") {
      return refused("invalid", "That agent was archived in its harness.");
    }
    const harness = await readModels.participant(workspaceId, agent.harness_id ?? "");
    if (harness?.capabilities?.includes(HARNESS_CAPABILITIES.forks) !== true) {
      return refused(
        "invalid",
        `${harness?.display_name ?? "Its harness"} doesn't make copies of its agents.`,
      );
    }
    return undefined;
  }

  /** What about the room, or where the agent is, refuses a fork into it. */
  async function ofTheRoom(
    workspaceId: string,
    agent: { readonly id: string; readonly display_name: string },
    space: { readonly space_id: string; readonly home: boolean; readonly state: string },
  ): Promise<ForkResult | undefined> {
    if (space.home) return refused("invalid", "A Main space takes people, and no other agent.");
    if (space.state !== "open") return refused("invalid", "Unarchive the space first.");
    const where = await readModels.agentRoom(workspaceId, agent.id);
    if (where === undefined) {
      return refused(
        "invalid",
        `${agent.display_name} isn't in a space. Put it in this one instead: nothing is lost.`,
      );
    }
    if (where === space.space_id) {
      return refused("invalid", `${agent.display_name} is in this space already.`);
    }
    return undefined;
  }

  return async function forkAgent(input: {
    readonly principal: Principal;
    readonly agentId: string;
    readonly spaceId: string;
  }): Promise<ForkResult> {
    const { principal, agentId, spaceId } = input;
    const refused = await refusal(principal, agentId, spaceId);
    if (refused !== undefined) return refused;
    const { workspaceId, participantId } = principal;
    const now = deps.clock.nowIso();
    const ask = await readModels.forkAsk(workspaceId, agentId, spaceId);
    if (stands(ask, now)) return { ok: true, asked: false, forkId: ask.event_id, ts: ask.ts };
    const head = await deps.store.head(workspaceId);
    const appended = await deps.store.append({
      v: 1,
      type: "agent.fork",
      id: deps.ids.next("event"),
      ts: now,
      workspace_id: workspaceId,
      space_id: spaceId,
      actor: { kind: "person", id: participantId },
      idempotency_key: `fork-${agentId}-${spaceId}-at-${head}`,
      agent_id: agentId,
      by: participantId,
    });
    return {
      ok: true,
      asked: !appended.duplicate,
      forkId: appended.event.id,
      ts: appended.event.ts,
    };
  };
}

export type ForkAgent = ReturnType<typeof createForkAgent>;

export interface ForkAnswerDeps {
  readonly store: Pick<EventStore, "append">;
  readonly readModels: Pick<ReadModels, "space" | "agentRoom" | "forkAsk">;
  readonly ids: { next: (kind: "event") => string };
  readonly clock: { nowIso: () => string };
}

/** What came of a copy registered for a room: in it, or free and why. */
export type ForkAnswer =
  | { readonly attached: true }
  | { readonly attached: false; readonly why?: string | undefined };

/**
 * A harness's copy of one of its agents, registered for the room a person asked it for: it joins
 * the room while the ask stands (`membership.added` with `fork_of`, by the harness), and is free
 * otherwise, with why. Asked again once it is there, nothing changes.
 */
export async function answerFork(
  deps: ForkAnswerDeps,
  copy: {
    readonly workspaceId: string;
    readonly harnessId: string;
    readonly agentId: string;
    readonly forkedFrom: string;
    readonly spaceId: string;
  },
): Promise<ForkAnswer> {
  const { workspaceId, agentId, spaceId } = copy;
  const where = await deps.readModels.agentRoom(workspaceId, agentId);
  if (where === spaceId) return { attached: false };
  const ask = await deps.readModels.forkAsk(workspaceId, copy.forkedFrom, spaceId);
  if (ask === undefined) {
    return { attached: false, why: "Nobody asked for a copy of that agent in that space." };
  }
  if (ask.answered) return { attached: false, why: "That space has its copy already." };
  if (!stands(ask, deps.clock.nowIso())) {
    return {
      attached: false,
      why: "The space stopped waiting for the copy after a minute, so it is free: a person can put it in a space.",
    };
  }
  const space = await deps.readModels.space(workspaceId, spaceId);
  if (space?.state !== "open") {
    return { attached: false, why: "The space was archived while it waited, so the copy is free." };
  }
  if (where !== undefined) {
    return {
      attached: false,
      why: "The copy is in another space, and an agent is in one at a time.",
    };
  }
  await deps.store.append({
    v: 1,
    type: "membership.added",
    id: deps.ids.next("event"),
    ts: deps.clock.nowIso(),
    workspace_id: workspaceId,
    space_id: spaceId,
    actor: { kind: "harness", id: copy.harnessId },
    idempotency_key: `fork-in-${ask.event_id}`,
    participant_id: agentId,
    participant_kind: "agent",
    role: "member",
    fork_of: ask.event_id,
  });
  return { attached: true };
}
