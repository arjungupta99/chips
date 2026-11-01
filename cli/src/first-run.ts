/**
 * The workspace a server starts with.
 *
 * `chips serve` on a clean machine has nothing to serve: no workspace, no person, and so
 * nothing to pair with. This makes exactly that much and no more — one workspace, one person —
 * and is idempotent, so a server that already has one is left alone. It is deliberately not
 * the dev-mode bootstrap beside it, which also makes a harness, a space and a token, and
 * writes them all to a file: those are demo conveniences, and this is somebody's actual
 * workspace.
 */

import { FIRST_PERSON_NAME } from "@chipschat/protocol";
import type { Database, Gateway } from "@chipschat/server";
import type { Kysely } from "kysely";

/** What a workspace is called when nobody's name was to be had (ADR 0194). */
export const NAMELESS_WORKSPACE = "My workspace";

/**
 * What a new workspace is called (ADR 0194): after the person it is made for, "Ada's workspace",
 * which its owner renames from You whenever they like. Nobody's name, the "You" a first person is
 * called when the account has none (ADR 0170), or a name too long for the hello to carry with the
 * rest (ADR 0193), and it is "My workspace".
 */
export function firstWorkspaceName(personName: string): string {
  const name = personName.trim();
  if (name === "" || name === FIRST_PERSON_NAME) return NAMELESS_WORKSPACE;
  const called = `${name}'s workspace`;
  return called.length > 120 ? NAMELESS_WORKSPACE : called;
}

export interface FirstRun {
  readonly workspaceId: string;
  readonly participantId: string;
  readonly displayName: string;
  /** True when this run is what made them. */
  readonly created: boolean;
}

export async function ensureWorkspace(input: {
  readonly db: Kysely<Database>;
  readonly gateway: Gateway;
  readonly name: string;
  readonly personName: string;
}): Promise<FirstRun> {
  const { db, gateway } = input;
  const now = gateway.deps.clock.nowIso();
  // The oldest, by id: ids are ULIDs, so "the first workspace" is a question with one answer
  // however the query planner feels about it.
  const workspace = await db
    .selectFrom("workspaces")
    .selectAll()
    .orderBy("id", "asc")
    .limit(1)
    .executeTakeFirst();
  const workspaceId = workspace?.id ?? gateway.deps.ids.next("workspace");
  if (workspace === undefined) {
    await db
      .insertInto("workspaces")
      .values({ id: workspaceId, name: input.name, created_at: now })
      .execute();
  }

  const existing = await db
    .selectFrom("participants")
    .selectAll()
    .where("workspace_id", "=", workspaceId)
    .where("kind", "=", "person")
    .orderBy("created_at", "asc")
    .orderBy("id", "asc")
    .limit(1)
    .executeTakeFirst();
  if (existing !== undefined) {
    return {
      workspaceId,
      participantId: existing.id,
      displayName: existing.display_name,
      created: false,
    };
  }

  // The first person into a workspace is its owner (ADR 0034), joined the way anyone is.
  const joined = await gateway.deps.joinWorkspace({ workspaceId, displayName: input.personName });
  if (!joined.ok) throw new Error(joined.error.message);
  return {
    workspaceId,
    participantId: joined.value.participantId,
    displayName: joined.value.displayName,
    created: true,
  };
}
