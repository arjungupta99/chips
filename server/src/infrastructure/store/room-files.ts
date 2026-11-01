/**
 * The room's files (ADR 0099), read from the `attachments` projection and the messages that
 * carried them: every file posted in a room, in the order it was posted, none from a message taken
 * back. The protocol's `versionsOf` and `currentFiles` turn them into versions; nothing here
 * decides one.
 *
 * And the rule a post made from a version keeps, asked inside the append's transaction as the
 * one-room rule is (`agent-gate.ts`): two agents that each changed the current version and posted
 * at once cannot both be taken, since the store holds one writer at a time and the second reads
 * what the first wrote.
 */

import {
  eventIdOfMessage,
  type MadeFrom,
  messageIdOf,
  type PostedFile,
  type StaleRefusal,
  staleRefusal,
  staleVersion,
  versionsOf,
} from "@chipschat/protocol";
import type { Kysely, Transaction } from "kysely";
import type { IncomingEvent } from "../../application/ports/index.js";
import type { Database } from "../db/schema.js";

type Db = Kysely<Database> | Transaction<Database>;

/**
 * The files posted in a room, oldest first, up to the message at `upto` and with it; those of the
 * names given, when some are.
 */
export async function postedFilesIn(
  db: Db,
  workspaceId: string,
  spaceId: string,
  options: { readonly upto?: number | undefined; readonly names?: readonly string[] } = {},
): Promise<PostedFile[]> {
  let query = db
    .selectFrom("attachments")
    .innerJoin("messages", (join) =>
      join
        .onRef("messages.id", "=", "attachments.message_id")
        .onRef("messages.workspace_id", "=", "attachments.workspace_id"),
    )
    .select([
      "attachments.id as attachment_id",
      "attachments.filename as filename",
      "attachments.sha256 as sha256",
      "attachments.byte_size as byte_size",
      "attachments.mime_type as mime_type",
      "attachments.width as width",
      "attachments.height as height",
      "attachments.duration_ms as duration_ms",
      "messages.id as message_id",
      "messages.seq as seq",
      "messages.created_at as at",
      "messages.author_id as by",
    ])
    .where("attachments.workspace_id", "=", workspaceId)
    .where("attachments.space_id", "=", spaceId)
    .where("messages.deleted_at", "is", null)
    .where("messages.seq", "is not", null);
  if (options.upto !== undefined) query = query.where("messages.seq", "<=", options.upto);
  if (options.names !== undefined) query = query.where("attachments.filename", "in", options.names);
  const rows = await query.orderBy("messages.seq").orderBy("attachments.id").execute();
  return rows.map(({ width, height, duration_ms, message_id, ...row }) => ({
    ...row,
    seq: row.seq as number,
    // A message's id on the wire is its event's, with the message's prefix.
    message_id: messageIdOf(message_id),
    ...(width === null ? {} : { width }),
    ...(height === null ? {} : { height }),
    ...(duration_ms === null ? {} : { duration_ms }),
  }));
}

/**
 * What each file these messages carried was made from (ADR 0099, point 3): the `replaces` the door
 * copied onto its attachment, which the message's row keeps with the rest of what it carried. The
 * messages are named by their ids on the wire.
 */
export async function madeFromIn(
  db: Db,
  workspaceId: string,
  messageIds: readonly string[],
): Promise<Map<string, string>> {
  const made = new Map<string, string>();
  if (messageIds.length === 0) return made;
  const rows = await db
    .selectFrom("messages")
    .select("attachments")
    .where("workspace_id", "=", workspaceId)
    .where("id", "in", messageIds.map(eventIdOfMessage))
    .execute();
  for (const row of rows) {
    for (const file of carriedBy(row.attachments)) {
      const { attachment_id: id, replaces } = file;
      if (typeof id === "string" && typeof replaces === "string") made.set(id, replaces);
    }
  }
  return made;
}

/** The files a message's row says it carried, or none where it says nothing readable. */
function carriedBy(json: string | null): Record<string, unknown>[] {
  if (json === null) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

/** Where an attachment was posted, under what name, and its bytes' digest; nothing for none. */
export async function attachmentFact(
  db: Db,
  workspaceId: string,
  attachmentId: string,
): Promise<{ space_id: string | null; filename: string; sha256: string } | undefined> {
  return await db
    .selectFrom("attachments")
    .select(["space_id", "filename", "sha256"])
    .where("workspace_id", "=", workspaceId)
    .where("id", "=", attachmentId)
    .executeTakeFirst();
}

/** The files a post carries that say which version they were made from. */
function madeIn(event: IncomingEvent): { filename: string; sha256: string; replaces: string }[] {
  if (event.type !== "message.post" || typeof event["space_id"] !== "string") return [];
  const files = event["attachments"];
  if (!Array.isArray(files)) return [];
  return (files as Record<string, unknown>[]).flatMap((file) => {
    const { filename, sha256, replaces } = file;
    return typeof filename === "string" &&
      typeof sha256 === "string" &&
      typeof replaces === "string"
      ? [{ filename, sha256, replaces }]
      : [];
  });
}

/**
 * Why the store will not take this post, or nothing when it will: a file in it made from a version
 * that is no longer its name's current one in the room (ADR 0099). Only a post whose files say what
 * they were made from is asked about; everything else costs one look at its type.
 */
export async function fileGate(
  trx: Transaction<Database>,
  event: IncomingEvent,
): Promise<StaleRefusal | undefined> {
  const made = madeIn(event);
  if (made.length === 0) return undefined;
  const workspaceId = event.workspace_id;
  const spaceId = String(event["space_id"]);
  const posted = await postedFilesIn(trx, workspaceId, spaceId, {
    names: [...new Set(made.map((file) => file.filename))],
  });
  const from: MadeFrom[] = [];
  for (const file of made) {
    const was = await attachmentFact(trx, workspaceId, file.replaces);
    if (was !== undefined)
      from.push({ filename: file.filename, sha256: file.sha256, from: was.sha256 });
  }
  const current = staleVersion(from, versionsOf(posted));
  return current === undefined
    ? undefined
    : staleRefusal(current, await nameIn(trx, workspaceId, current.by));
}

/** What a participant goes by now, or their id when nobody by it is known. */
async function nameIn(trx: Transaction<Database>, workspaceId: string, participantId: string) {
  const found = await trx
    .selectFrom("participants")
    .select("display_name")
    .where("workspace_id", "=", workspaceId)
    .where("id", "=", participantId)
    .executeTakeFirst();
  return found?.display_name ?? participantId;
}
