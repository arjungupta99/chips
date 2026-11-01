/**
 * An owner names the workspace again (ADR 0194). It was named once, at first run, and only a
 * database edit changed it after (ADR 0193); this is the edit, from You.
 *
 * Who may: an owner, as only an owner invites (ADR 0034's addendum): the name is what everybody
 * in the workspace knows it by, and what a link asks somebody new to join. An admin may not; a
 * member, a guest and a harness may not.
 *
 * What it may be: something, and not a paragraph, the rule a person's name has
 * (`cleanDisplayName`), whose 120 characters are also the most the hello carries (ADR 0193).
 * The name is the workspace registry's, so the registry row is written first, and
 * `workspace.renamed` records the change: every device connected takes the new name from it at
 * once, and the audit says who changed it. The same name again changes nothing and records
 * nothing.
 */

import { nameProblem } from "@chipschat/protocol";
import { mayRenameWorkspace } from "../../domain/index.js";
import type { Principal } from "../ports/identity.js";
import type { Clock, EventStore, IdGenerator, ReadModels } from "../ports/index.js";
import type { WorkspaceRegistry } from "../ports/workspaces.js";
import { cleanDisplayName } from "./join-workspace.js";

export interface RenameWorkspaceDeps {
  readonly workspaces: WorkspaceRegistry;
  readonly store: EventStore;
  readonly readModels: Pick<ReadModels, "workspace">;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export type WorkspaceRenameFailure = {
  readonly kind: "not_owner" | "unknown_workspace" | "invalid";
  readonly message: string;
};

export interface WorkspaceRenamed {
  readonly workspaceId: string;
  readonly name: string;
  readonly previousName: string;
  /** The `workspace.renamed`, when the name changed; nothing when it was the name already. */
  readonly eventId?: string;
}

type Answer = { ok: true; value: WorkspaceRenamed } | { ok: false; error: WorkspaceRenameFailure };

const refuse = (kind: WorkspaceRenameFailure["kind"], message: string): Answer => ({
  ok: false,
  error: { kind, message },
});

export function createRenameWorkspace(deps: RenameWorkspaceDeps) {
  return async function renameWorkspace(input: {
    principal: Principal;
    name: string;
  }): Promise<Answer> {
    const { principal } = input;
    const { workspaceId } = principal;
    if (principal.kind !== "person" || !mayRenameWorkspace(principal.role)) {
      return refuse("not_owner", "Only an owner of the workspace renames it.");
    }
    const workspace = await deps.readModels.workspace(workspaceId);
    if (workspace === undefined) return refuse("unknown_workspace", "No such workspace.");
    const name = cleanDisplayName(input.name);
    if (name === undefined) {
      return refuse("invalid", "A workspace's name is something, up to 120 characters.");
    }
    const previousName = workspace.name;
    if (name === previousName) return { ok: true, value: { workspaceId, name, previousName } };
    const problem = nameProblem(name);
    if (problem !== undefined) return refuse("invalid", problem);

    await deps.workspaces.rename({ workspaceId, name });
    const eventId = deps.ids.next("event");
    await deps.store.append({
      v: 1,
      type: "workspace.renamed",
      id: eventId,
      ts: deps.clock.nowIso(),
      workspace_id: workspaceId,
      actor: { kind: "person", id: principal.participantId },
      idempotency_key: `workspace-rename-${eventId}`,
      name,
      previous_name: previousName,
    });
    return { ok: true, value: { workspaceId, name, previousName, eventId } };
  };
}

export type RenameWorkspace = ReturnType<typeof createRenameWorkspace>;
