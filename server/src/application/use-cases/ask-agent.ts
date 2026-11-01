/**
 * A new agent in a room (ADR 0108): a person asks a harness for an agent made for this room, and
 * the harness's new agent, registered with `made_for` and the room, joins it. It is Fork's ask
 * (ADR 0087) with nothing to copy: the agent remembers nothing from elsewhere, and starts with the
 * room's last lines (ADR 0088) and its note (ADR 0092).
 *
 * - **The ask** is `agent.asked` in the room, naming the harness and what the agent is to be
 *   called. The room shows it waiting, and the harness is sent it. Who may ask is who may fork: a
 *   person in the room, not a guest, who owns the harness or is an owner or admin of the
 *   workspace, since the agent spends the harness's budget. Never into a Main room, a closed room
 *   or a thread, and only of a harness that declares `new_agents`. Two asks are two agents; the
 *   same `key` from the client is the same ask, so a send tried again makes one.
 * - **The name** is the person's, or else the harness's own, numbered to the first nobody here
 *   answers to (ADR 0091): *Jacobian 2*. Registration numbers it again if it is taken by then.
 * - **The answer** is the agent joining the room: `membership.added` with `made_for`, while the
 *   ask stands, `NEW_AGENT_WAIT_MS`. Nothing about the wait is stored but the event: an agent
 *   registered later is the harness's all the same, free, for a person to put in a room.
 */

import {
  freeAgentName,
  HARNESS_CAPABILITIES,
  NEW_AGENT_WAIT_MS,
  nameProblem,
} from "@chipschat/protocol";
import { administers, isGuest } from "../../domain/roles.js";
import { agentName, clashKeysTaken } from "../agents.js";
import type { AgentAsk, EventStore, Principal, ReadModels } from "../ports/index.js";

export interface AskAgentDeps {
  readonly store: Pick<EventStore, "append">;
  readonly readModels: Pick<
    ReadModels,
    "participant" | "participantsIn" | "space" | "memberRole" | "workspaceRole"
  >;
  readonly ids: { next: (kind: "event") => string };
  readonly clock: { nowIso: () => string };
}

export interface AskRefusal {
  readonly kind: "not_allowed" | "unknown_harness" | "unknown_space" | "invalid";
  readonly message: string;
}

export type AskResult =
  | {
      readonly ok: true;
      /** False when this `key` asked already, and this is that ask. */
      readonly asked: boolean;
      /** The `agent.asked` event: the ask the agent answers. */
      readonly askId: string;
      readonly ts: string;
      /** What the agent is to be called. */
      readonly name: string;
    }
  | { readonly ok: false; readonly error: AskRefusal };

function refused(kind: AskRefusal["kind"], message: string): AskResult {
  return { ok: false, error: { kind, message } };
}

/** Whether an ask still waits for its agent: none has joined, and the minute is not up. */
export function askStands(ask: AgentAsk | undefined, now: string): ask is AgentAsk {
  return (
    ask !== undefined && !ask.answered && Date.parse(now) - Date.parse(ask.ts) < NEW_AGENT_WAIT_MS
  );
}

export function createAskAgent(deps: AskAgentDeps) {
  const { readModels } = deps;

  /** Why this person may not ask this harness for an agent in this room, or nothing. */
  async function refusal(
    principal: Principal,
    harnessId: string,
    spaceId: string,
  ): Promise<AskResult | undefined> {
    if (principal.kind !== "person") return refused("not_allowed", "A person asks for an agent.");
    const { workspaceId, participantId } = principal;
    const standing = await readModels.workspaceRole(workspaceId, participantId);
    if (isGuest(standing)) return refused("not_allowed", "A guest does not ask for agents.");
    const harness = await readModels.participant(workspaceId, harnessId);
    if (harness?.kind !== "harness" || harness.removed_at !== null) {
      return refused("unknown_harness", "No harness of that id here.");
    }
    const space = await readModels.space(workspaceId, spaceId);
    const role = await readModels.memberRole(workspaceId, spaceId, participantId);
    if (space === undefined || role === undefined || space.parent_space_id !== null) {
      return refused("unknown_space", "No space of that id here.");
    }
    const owns = harness.owner_id === participantId || administers(standing);
    return mayAsk(role, owns) ?? ofTheHarness(harness) ?? ofTheRoom(space);
  }

  /** A guest in the room asks for nothing, and nobody asks a harness that is not theirs to. */
  function mayAsk(role: string, owns: boolean): AskResult | undefined {
    if (role === "guest") return refused("not_allowed", "A guest does not ask for agents.");
    if (owns) return undefined;
    return refused(
      "not_allowed",
      "A new agent is asked for by its harness's owner, or an owner or admin of the workspace.",
    );
  }

  /** A harness that doesn't say it makes new agents is not asked for one. */
  function ofTheHarness(harness: {
    readonly display_name: string;
    readonly capabilities?: readonly string[] | null | undefined;
  }): AskResult | undefined {
    if (harness.capabilities?.includes(HARNESS_CAPABILITIES.newAgents) === true) return undefined;
    return refused("invalid", `${harness.display_name} doesn't make new agents for a space.`);
  }

  /** A Main room takes no other agent, and a closed one none at all. */
  function ofTheRoom(space: { readonly home: boolean; readonly state: string }) {
    if (space.home) return refused("invalid", "A Main space takes people, and no other agent.");
    if (space.state !== "open") return refused("invalid", "Unarchive the space first.");
    return undefined;
  }

  /** The person's name for it, or the harness's, numbered to the first nobody here answers to. */
  async function nameFor(workspaceId: string, harnessName: string, wanted: string | undefined) {
    const asked = agentName(wanted ?? harnessName);
    const everyone = await readModels.participantsIn(workspaceId);
    return freeAgentName(asked, clashKeysTaken(everyone));
  }

  return async function askAgent(input: {
    readonly principal: Principal;
    readonly harnessId: string;
    readonly spaceId: string;
    readonly name?: string | undefined;
    /** The client's own word for this ask: the same one again is the same ask. */
    readonly key?: string | undefined;
  }): Promise<AskResult> {
    const { principal, harnessId, spaceId } = input;
    const stop = await refusal(principal, harnessId, spaceId);
    if (stop !== undefined) return stop;
    const problem = input.name === undefined ? undefined : nameProblem(input.name.trim());
    if (problem !== undefined) return refused("invalid", problem);
    const { workspaceId, participantId } = principal;
    const harness = await readModels.participant(workspaceId, harnessId);
    const name = await nameFor(workspaceId, harness?.display_name ?? "Agent", input.name);
    const id = deps.ids.next("event");
    const appended = await deps.store.append({
      v: 1,
      type: "agent.asked",
      id,
      ts: deps.clock.nowIso(),
      workspace_id: workspaceId,
      space_id: spaceId,
      actor: { kind: "person", id: participantId },
      idempotency_key: `ask-${harnessId}-${spaceId}-${input.key ?? id}`,
      harness_id: harnessId,
      name,
      by: participantId,
    });
    return {
      ok: true,
      asked: !appended.duplicate,
      askId: appended.event.id,
      ts: appended.event.ts,
      name: String(appended.event.payload["name"] ?? name),
    };
  };
}

export type AskAgent = ReturnType<typeof createAskAgent>;

export interface AskAnswerDeps {
  readonly store: Pick<EventStore, "append">;
  readonly readModels: Pick<ReadModels, "space" | "agentRoom" | "agentAsk">;
  readonly ids: { next: (kind: "event") => string };
  readonly clock: { nowIso: () => string };
}

/** What came of an agent registered for an ask: in its room, or free and why. */
export type AskAnswer =
  | { readonly attached: true }
  | { readonly attached: false; readonly why?: string | undefined };

/**
 * A harness's new agent, registered for the ask it answers: it joins the ask's room while the ask
 * stands (`membership.added` with `made_for`, by the harness), and is free otherwise, with why.
 * Registered again once it is there, nothing changes.
 */
export async function answerAsk(
  deps: AskAnswerDeps,
  made: {
    readonly workspaceId: string;
    readonly harnessId: string;
    readonly agentId: string;
    readonly madeFor: string;
    readonly spaceId: string;
  },
): Promise<AskAnswer> {
  const { workspaceId, agentId, spaceId } = made;
  const where = await deps.readModels.agentRoom(workspaceId, agentId);
  if (where === spaceId) return { attached: false };
  const ask = await deps.readModels.agentAsk(workspaceId, made.madeFor);
  if (ask === undefined || ask.space_id !== spaceId || ask.harness_id !== made.harnessId) {
    return { attached: false, why: "Nobody asked this harness for an agent in that space." };
  }
  if (ask.answered) return { attached: false, why: "That ask has its agent already." };
  if (!askStands(ask, deps.clock.nowIso())) {
    return {
      attached: false,
      why: "The space stopped waiting for the agent after a minute, so it is free: a person can put it in a space.",
    };
  }
  const space = await deps.readModels.space(workspaceId, spaceId);
  if (space?.state !== "open") {
    return {
      attached: false,
      why: "The space was archived while it waited, so the agent is free.",
    };
  }
  if (where !== undefined) {
    return {
      attached: false,
      why: "The agent is in another space, and an agent is in one at a time.",
    };
  }
  await deps.store.append({
    v: 1,
    type: "membership.added",
    id: deps.ids.next("event"),
    ts: deps.clock.nowIso(),
    workspace_id: workspaceId,
    space_id: spaceId,
    actor: { kind: "harness", id: made.harnessId },
    idempotency_key: `made-in-${ask.event_id}`,
    participant_id: agentId,
    participant_kind: "agent",
    role: "member",
    made_for: ask.event_id,
  });
  return { attached: true };
}
