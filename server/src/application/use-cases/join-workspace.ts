/**
 * A person enters the workspace (ADR 0034).
 *
 * The one way a person is made, whoever asks: an invite being redeemed, `chips serve` on a
 * clean machine, the demo bootstrap, the dev-mode stand-in for an invite. Two writes, in this
 * order: the person into the registry — who they are is identity, not replayed (ADR 0018) —
 * and then `person.joined` into the log, which is where their role lives and what every screen
 * and every rule reads. The first person into a workspace is its owner; nobody else may be
 * made one here without saying so.
 *
 * A name is nobody else's here, case and spaces aside, as a rename's is (ADR 0082, ADR 0091): two
 * people called Priya Nair would share one @, and the room could not say which of them spoke.
 * Somebody removed from the workspace holds their name no longer.
 */

import { nameProblem } from "@chipschat/protocol";
import type { WorkspaceRole } from "../../domain/index.js";
import { nameHolder } from "../agents.js";
import type {
  Clock,
  EventStore,
  IdGenerator,
  ParticipantView,
  ReadModels,
} from "../ports/index.js";
import type { PeopleRegistry } from "../ports/people.js";

export interface JoinWorkspaceDeps {
  readonly people: Pick<PeopleRegistry, "addPerson">;
  readonly store: EventStore;
  readonly readModels: Pick<ReadModels, "ownerCount" | "participantsIn">;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface JoinWorkspaceInput {
  readonly workspaceId: string;
  readonly displayName: string;
  /** Absent means: an owner when the workspace has none, a member otherwise. */
  readonly role?: WorkspaceRole | undefined;
  /** The invite they came by, when they did. */
  readonly invite?: { readonly inviteId: string; readonly invitedBy: string } | undefined;
}

export interface JoinedPerson {
  readonly participantId: string;
  readonly displayName: string;
  readonly role: WorkspaceRole;
  readonly joinedAt: string;
}

export type JoinFailure = { readonly kind: "invalid" | "taken"; readonly message: string };

/** A display name a person can be shown by: something, and not a paragraph. */
export function cleanDisplayName(name: string): string | undefined {
  const trimmed = name.trim().replace(/\s+/g, " ");
  return trimmed === "" || trimmed.length > 120 ? undefined : trimmed;
}

/** Why a name is not to be had: who has it, an agent or a person. */
export function takenWords(holder: Pick<ParticipantView, "kind" | "display_name">): string {
  const who = holder.kind === "person" ? "Somebody" : "An agent";
  return `${who} here goes by ${holder.display_name} already.`;
}

/**
 * Why somebody new may not go by this name here, or nothing: it is nobody's, a harness's
 * included, since a person called Scout would take the @ that reaches Scout (ADR 0087).
 */
export async function nameRefusal(
  readModels: Pick<ReadModels, "participantsIn">,
  workspaceId: string,
  displayName: string,
): Promise<string | undefined> {
  const holder = await nameTakenBy(readModels, workspaceId, displayName);
  return holder === undefined ? undefined : takenWords(holder);
}

/** Who goes by this name here already, so that somebody new may not: `nameRefusal`'s holder. */
export async function nameTakenBy(
  readModels: Pick<ReadModels, "participantsIn">,
  workspaceId: string,
  displayName: string,
): Promise<ParticipantView | undefined> {
  const everyone = await readModels.participantsIn(workspaceId);
  return nameHolder(everyone, "", displayName, { harnesses: true });
}

export function createJoinWorkspace(deps: JoinWorkspaceDeps) {
  return async function joinWorkspace(
    input: JoinWorkspaceInput,
  ): Promise<{ ok: true; value: JoinedPerson } | { ok: false; error: JoinFailure }> {
    const displayName = cleanDisplayName(input.displayName);
    if (displayName === undefined) {
      return {
        ok: false,
        error: { kind: "invalid", message: "Give the person a name, up to 120 characters." },
      };
    }
    const problem = nameProblem(displayName);
    if (problem !== undefined) return { ok: false, error: { kind: "invalid", message: problem } };
    const taken = await nameRefusal(deps.readModels, input.workspaceId, displayName);
    if (taken !== undefined) return { ok: false, error: { kind: "taken", message: taken } };
    const role =
      input.role ??
      ((await deps.readModels.ownerCount(input.workspaceId)) === 0 ? "owner" : "member");
    const at = deps.clock.nowIso();
    const participantId = deps.ids.next("person");
    await deps.people.addPerson({
      id: participantId,
      workspaceId: input.workspaceId,
      displayName,
      createdAt: at,
    });
    await deps.store.append({
      v: 1,
      type: "person.joined",
      id: deps.ids.next("event"),
      ts: at,
      workspace_id: input.workspaceId,
      actor: { kind: "person", id: participantId },
      idempotency_key: `joined-${participantId}`,
      participant_id: participantId,
      display_name: displayName,
      role,
      ...(input.invite === undefined
        ? {}
        : { invite_id: input.invite.inviteId, invited_by: input.invite.invitedBy }),
    });
    return { ok: true, value: { participantId, displayName, role, joinedAt: at } };
  };
}

export type JoinWorkspace = ReturnType<typeof createJoinWorkspace>;
