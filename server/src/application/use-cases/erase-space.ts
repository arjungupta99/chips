/**
 * Erase a space (ADR 0067): what was said in it, its files and its search entries go from the
 * server for everyone, and the log keeps one `space.erased` saying which and by whom.
 *
 * Who may: a person in the space who is its owner, or an owner or admin of the workspace — the
 * same people who may take back anybody's message there (ADR 0035). Not a guest, and never a
 * harness: a harness puts its own rooms away by closing them.
 *
 * What may not be: a thread, which goes with the space it grew in; and a direct space nobody can
 * open again — the one a harness was handed when it was added, or two people's — which is how
 * they reach you, so it is archived, not erased. A room a harness opened by a key of its own is
 * erasable, direct or not: every Jacobian room is one, and the tombstone tells the harness,
 * which is how Jacobian deletes the Space behind it (ADR 0069). So is a room a person asked a
 * harness for from the + (`asked_of`), claimed or not: it was made to be about one thing, and a
 * harness that never took it up is no way anybody reaches anybody. One claimed later finds
 * nothing to claim. Never a harness's home, the room its lead speaks in (J's, for Jacobian),
 * which is always there. And never a room whose changes a person there locked (ADR 0156), until
 * somebody lets them go: an agent deleted with its room is refused with it, before anything
 * changes.
 *
 * The room's one agent may be deleted with it (ADR 0087, rule 5; ADR 0095, point 6), when the
 * person asks and may: the harness's owner, or an owner or admin of the workspace (agents review,
 * finding 4). It is deleted in Chips, and its harness deletes its own side. Never one whose
 * changes a person locked (ADR 0199): asked for, the erase is refused whole.
 *
 * Every run still going in the room is stopped first, with the lanes it opened, as an archive
 * stops them (agents review, finding 10): the agent's answer would otherwise turn up, held, in
 * the next room it joined.
 *
 * The rows go in the store's transaction; the files go after it has committed, since a file
 * cannot be put back if the transaction rolls back. A file that will not go is logged and left:
 * nothing refers to it any more, and the room is erased either way. The room's project goes the
 * same way, after the rows (ADR 0220): archiving a room keeps it.
 */

import { administers, isGuest } from "../../domain/index.js";
import type { BlobStore } from "../ports/attachments.js";
import type { Principal } from "../ports/identity.js";
import type { Clock, EventStore, IdGenerator, ReadModels } from "../ports/index.js";
import type { ProjectStore } from "../ports/projects.js";

export interface EraseSpaceDeps {
  readonly store: Pick<EventStore, "erase" | "append">;
  readonly readModels: Pick<ReadModels, "space" | "memberRole" | "membersOf" | "participant">;
  readonly blobs: Pick<BlobStore, "remove">;
  /** The rooms' projects (ADR 0220), when this server has them. */
  readonly projects?: Pick<ProjectStore, "remove"> | undefined;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Told of a file that would not go, so the log says so. */
  readonly onStrayFile?: (digest: string, error: unknown) => void;
  /** Told of a project that would not go, so the log says so. */
  readonly onStrayProject?: (spaceId: string, error: unknown) => void;
  /**
   * Stops every run in the room, and the lanes they opened, before it goes (agents review,
   * finding 10): an erase is a way out of a room like any other, and the work stops with it.
   */
  readonly stopWork?: (workspaceId: string, spaceId: string, by: string) => Promise<void>;
}

export type EraseFailure = {
  readonly kind: "not_allowed" | "unknown_space" | "invalid";
  readonly message: string;
};

export interface Erased {
  readonly eventId: string;
  /** The space and its threads. */
  readonly erased: readonly string[];
  /** How many stored files went with it. */
  readonly files: number;
  /** Whether the store had to rebuild every projection to erase it (ADR 0258), the slow way. */
  readonly rebuilt: boolean;
}

type Answer = { ok: true; value: Erased } | { ok: false; error: EraseFailure };

const refuse = (kind: EraseFailure["kind"], message: string): Answer => ({
  ok: false,
  error: { kind, message },
});

/** Why this person may not erase this space, or nothing when they may. */
async function refusal(
  deps: EraseSpaceDeps,
  principal: Principal,
  spaceId: string,
): Promise<Answer | undefined> {
  if (principal.kind !== "person") {
    return refuse("not_allowed", "A space is erased by a person; a harness closes its own.");
  }
  if (isGuest(principal.role)) return refuse("not_allowed", "A guest may not erase a space.");
  const { workspaceId, participantId } = principal;
  const role = await deps.readModels.memberRole(workspaceId, spaceId, participantId);
  const space = await deps.readModels.space(workspaceId, spaceId);
  // Not in it is the same answer as not there: an erase is no way to learn what exists.
  if (space === undefined || role === undefined) return refuse("unknown_space", "No such space.");
  if (space.parent_space_id !== null) {
    return refuse("invalid", "A thread goes with its space: erase the space it grew in.");
  }
  if (space.home) {
    return refuse("invalid", "This is a harness's home: it is always there, and is not erased.");
  }
  if (space.locked === true) {
    return refuse("invalid", "This space's changes are locked: unlock them in its sheet first.");
  }
  if (space.kind === "direct" && space.external_key === null && space.asked_of === null) {
    return refuse(
      "invalid",
      "This direct space is archived, not erased: it is the only way they reach you here.",
    );
  }
  if (role !== "owner" && !administers(principal.role)) {
    return refuse(
      "not_allowed",
      "A space is erased by its owner, or by an owner or admin of the workspace.",
    );
  }
  return undefined;
}

/**
 * The room's agents are freed as it goes (ADR 0087, rule 5): each is told, and the one the person
 * asked to delete in its harness too is deleted here (ADR 0095, point 6), which tells its harness
 * to delete its side. Only a room with one agent offers that.
 */
async function releaseAgents(
  deps: EraseSpaceDeps,
  principal: Principal,
  spaceId: string,
  agents: readonly string[],
  deleteAgent: boolean,
): Promise<void> {
  const { workspaceId, participantId } = principal;
  const envelope = (key: string) => ({
    v: 1 as const,
    id: deps.ids.next("event"),
    ts: deps.clock.nowIso(),
    workspace_id: workspaceId,
    actor: { kind: "system" as const, id: "system" },
    idempotency_key: key,
  });
  for (const agentId of agents) {
    await deps.store.append({
      ...envelope(`erase-${spaceId}-release-${agentId}`),
      type: "agent.released",
      space_id: spaceId,
      agent_id: agentId,
      by: participantId,
      reason: "deleted",
    });
    if (!deleteAgent) continue;
    const agent = await deps.readModels.participant(workspaceId, agentId);
    await deps.store.append({
      ...envelope(`agent-deleted-${agentId}`),
      actor: { kind: "person" as const, id: participantId },
      type: "agent.deleted",
      agent_id: agentId,
      harness_id: agent?.harness_id ?? "",
      key: agent?.key ?? agentId,
      name: agent?.display_name ?? agentId,
      by: participantId,
    });
  }
}

/**
 * Whether this person may have the room's agent deleted in its harness too (agents review,
 * finding 4): its harness's owner, or an owner or admin of the workspace, as for a move or a
 * fork. A room's owner who owns neither deletes the room, and the agent is freed.
 */
async function mayDeleteAgent(
  deps: EraseSpaceDeps,
  principal: Principal,
  agentId: string | undefined,
): Promise<boolean> {
  if (agentId === undefined) return false;
  if (administers(principal.role)) return true;
  const agent = await deps.readModels.participant(principal.workspaceId, agentId);
  return agent?.owner_id === principal.participantId;
}

/** Why the room's agent is not deleted in its harness with it, or nothing when it is. */
async function refuseAgentToo(
  deps: EraseSpaceDeps,
  principal: Principal,
  agents: readonly string[],
): Promise<Answer | undefined> {
  const [only] = agents;
  if (agents.length !== 1 || only === undefined) {
    return refuse("invalid", "An agent is deleted with its space only when it is the one there.");
  }
  // An agent whose changes a person locked is not deleted with its room (ADR 0199, point 7).
  const agent = await deps.readModels.participant(principal.workspaceId, only);
  if (agent?.locked === true) {
    return refuse(
      "invalid",
      `${agent.display_name}'s changes are locked: unlock them on its card first.`,
    );
  }
  if (await mayDeleteAgent(deps, principal, only)) return undefined;
  return refuse(
    "not_allowed",
    "An agent is deleted in its harness by the harness's owner, or by an owner or admin of the workspace.",
  );
}

/** The erased rooms' projects (ADR 0220), each that will not go logged and left, as a file is. */
async function removeProjects(deps: EraseSpaceDeps, erased: readonly string[]): Promise<void> {
  for (const spaceId of erased) {
    try {
      await deps.projects?.remove(spaceId);
    } catch (error) {
      deps.onStrayProject?.(spaceId, error);
    }
  }
}

export function createEraseSpace(deps: EraseSpaceDeps) {
  return async function eraseSpace(input: {
    principal: Principal;
    spaceId: string;
    /** Delete the room's one agent in its harness too (ADR 0087, rule 5). */
    deleteAgent?: boolean | undefined;
  }): Promise<Answer> {
    const { principal, spaceId } = input;
    const refused = await refusal(deps, principal, spaceId);
    if (refused !== undefined) return refused;
    const members = await deps.readModels.membersOf(principal.workspaceId, spaceId);
    const agents = members
      .filter((member) => member.kind === "agent")
      .map((member) => member.participant_id);
    const deleteAgent = input.deleteAgent === true;
    const notToo = deleteAgent ? await refuseAgentToo(deps, principal, agents) : undefined;
    if (notToo !== undefined) return notToo;
    // While the room is still there: its agents' harnesses hear a room's events only while they
    // are in it, and a cancel sent after the tombstone would name a room that is gone.
    await deps.stopWork?.(principal.workspaceId, spaceId, principal.participantId);
    const eventId = deps.ids.next("event");
    const result = await deps.store.erase({
      workspaceId: principal.workspaceId,
      spaceId,
      tombstone: {
        v: 1,
        type: "space.erased",
        id: eventId,
        ts: deps.clock.nowIso(),
        workspace_id: principal.workspaceId,
        actor: { kind: "person", id: principal.participantId },
        idempotency_key: `erase-${spaceId}`,
      },
    });
    await releaseAgents(deps, principal, spaceId, agents, deleteAgent);
    let files = 0;
    for (const digest of result.orphanedDigests) {
      try {
        await deps.blobs.remove(digest);
        files += 1;
      } catch (error) {
        deps.onStrayFile?.(digest, error);
      }
    }
    await removeProjects(deps, result.erased);
    return { ok: true, value: { eventId, erased: result.erased, files, rebuilt: result.rebuilt } };
  };
}

export type EraseSpace = ReturnType<typeof createEraseSpace>;
