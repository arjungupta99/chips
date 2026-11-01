/**
 * Somebody a person takes out of a room is in it (19 October 2026). Arjun took Natalie out of
 * Foodie from his phone while it was still connecting over the relay: nothing on the sheet moved,
 * so he asked again, and twice more; when the phone came up all three went in, and the room said
 * three times that he had taken her out.
 *
 * Asked inside the append's transaction, as the one-room rule is (`agent-gate.ts`): after the row
 * is in, so a retry of a removal already in the log is answered as the duplicate it is, and before
 * its projection, so the membership is read as this removal finds it. The store holds one writer
 * at a time, so of two removals at once the second reads the first's and is refused. Only a
 * person's: Chips's own removals (a move, an archive, a delete) are its own to settle, and a
 * replay does not come through here.
 */

import type { Transaction } from "kysely";
import type { IncomingEvent } from "../../application/ports/index.js";
import type { Database } from "../db/schema.js";

export interface OutAlready {
  readonly kind: "invalid";
  readonly message: string;
}

export async function membershipGate(
  trx: Transaction<Database>,
  event: IncomingEvent,
): Promise<OutAlready | undefined> {
  if (event.type !== "membership.removed" || event.actor.kind !== "person") return undefined;
  const spaceId = event["space_id"];
  const participantId = event["participant_id"];
  if (typeof spaceId !== "string" || typeof participantId !== "string") return undefined;
  const here = await trx
    .selectFrom("memberships")
    .select("participant_id")
    .where("workspace_id", "=", event.workspace_id)
    .where("space_id", "=", spaceId)
    .where("participant_id", "=", participantId)
    .executeTakeFirst();
  return here === undefined
    ? { kind: "invalid", message: "they are not in this space any more" }
    : undefined;
}
