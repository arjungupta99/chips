/**
 * A guest is in one open room at most (JR-24), asked inside the append's transaction at an
 * unarchive (SEC-48). The door asks it of a person or a harness reopening a room
 * (`guestsElsewhereOf`), but Chips's own reopening did not come through the door: a harness that
 * archived and restored its agent reopened the room its archive closed, with a guest in it who had
 * since been seated in another. Here every path is asked, and of two unarchives at once the second
 * reads the first.
 *
 * Asked as the one-room rule is (`agent-gate.ts`): after the row is in and before its projection,
 * so the room is still archived when this reads it. Adding a guest to a second room is refused at
 * each door that adds one (Gate 5, and an invite's `enter`); this is the way in that had none.
 */

import type { Transaction } from "kysely";
import type { IncomingEvent } from "../../application/ports/index.js";
import { type Refusal, refuseReopening } from "../../domain/index.js";
import type { Database } from "../db/schema.js";

type Trx = Transaction<Database>;

/** Whether this event unarchives a room that is archived now: the room, or nothing. */
async function reopening(trx: Trx, event: IncomingEvent): Promise<string | undefined> {
  if (event.type !== "space.updated" || event["state"] !== "open") return undefined;
  const spaceId = event["space_id"];
  if (typeof spaceId !== "string") return undefined;
  const room = await trx
    .selectFrom("spaces")
    .select("state")
    .where("workspace_id", "=", event.workspace_id)
    .where("id", "=", spaceId)
    .executeTakeFirst();
  return room?.state === "closed" ? spaceId : undefined;
}

/** The names of a room's guests who are in another open room, threads aside. */
async function guestsElsewhere(trx: Trx, workspaceId: string, spaceId: string) {
  const guests = await trx
    .selectFrom("memberships")
    .innerJoin("workspace_members", (join) =>
      join
        .onRef("workspace_members.participant_id", "=", "memberships.participant_id")
        .onRef("workspace_members.workspace_id", "=", "memberships.workspace_id"),
    )
    .innerJoin("participants", (join) =>
      join
        .onRef("participants.id", "=", "memberships.participant_id")
        .onRef("participants.workspace_id", "=", "memberships.workspace_id"),
    )
    .select(["memberships.participant_id as id", "participants.display_name as name"])
    .where("memberships.workspace_id", "=", workspaceId)
    .where("memberships.space_id", "=", spaceId)
    .where("workspace_members.role", "=", "guest")
    .execute();
  const elsewhere: string[] = [];
  for (const guest of guests) {
    const open = await trx
      .selectFrom("memberships")
      .innerJoin("spaces", (join) =>
        join
          .onRef("spaces.id", "=", "memberships.space_id")
          .onRef("spaces.workspace_id", "=", "memberships.workspace_id"),
      )
      .select("memberships.space_id")
      .where("memberships.workspace_id", "=", workspaceId)
      .where("memberships.participant_id", "=", guest.id)
      .where("spaces.state", "=", "open")
      .where("spaces.parent_space_id", "is", null)
      .executeTakeFirst();
    if (open !== undefined) elsewhere.push(guest.name);
  }
  return elsewhere;
}

/** Why the store will not reopen this room, or nothing. Everything else costs one comparison. */
export async function guestGate(trx: Trx, event: IncomingEvent): Promise<Refusal | undefined> {
  const spaceId = await reopening(trx, event);
  if (spaceId === undefined) return undefined;
  return refuseReopening(await guestsElsewhere(trx, event.workspace_id, spaceId));
}
