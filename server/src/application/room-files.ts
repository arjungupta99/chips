/**
 * The room's files as they are handed over (ADR 0099): the current version of each name, newest
 * first, who posted it by name, and, for a harness, a URL for its own token, as a message's
 * attachments have. With a message, as of that message, its own files included, so a delivery and
 * a replay of it hand over the same versions; from a route, as of now. Which file is which version
 * is the protocol's (`currentFiles`), shared with the conformance fake.
 */

import { currentFiles, type FileVersion, type RoomFile, versionsNamed } from "@chipschat/protocol";
import type { ReadModels } from "./ports/index.js";

/** Who somebody is now: their kind and name, or nothing for an id nobody knows. */
type Lookup = (
  participantId: string,
) => Promise<{ readonly kind: string; readonly name: string } | undefined>;

/** A URL a harness may fetch an attachment at, for its own token; nothing where none is made. */
export type Signer = (
  attachmentId: string,
) => { readonly url: string; readonly expiresAt: string } | undefined;

type By = RoomFile["by"];

/** Who posted a version, as a line's `from` says it. */
async function byOf(lookup: Lookup, participantId: string): Promise<By> {
  const known = await lookup(participantId);
  const kind = known?.kind;
  return {
    id: participantId,
    kind: kind === "person" || kind === "agent" || kind === "system" ? kind : "harness",
    name: (known?.name ?? participantId).slice(0, 120) || participantId,
  };
}

/** What a room's files are read from, and for whom. */
interface Room {
  readonly readModels: Pick<ReadModels, "postedFiles" | "replacedIn" | "madeFrom">;
  readonly workspaceId: string;
  readonly spaceId: string;
  readonly lookup: Lookup;
  readonly most: number;
  readonly sign?: Signer | undefined;
}

/** One version as the wire says it: who by name, its measurements, a URL where one is signed. */
async function wireOf(
  room: Room,
  replaced: ReadonlyMap<string, string>,
  version: FileVersion,
  madeFrom?: string | undefined,
): Promise<RoomFile> {
  const grant = room.sign?.(version.attachment_id);
  return {
    name: version.filename,
    version: version.version,
    attachment_id: version.attachment_id,
    sha256: version.sha256,
    byte_size: version.byte_size,
    mime_type: version.mime_type,
    by: await byOf(room.lookup, replaced.get(version.by) ?? version.by),
    at: version.at,
    ...(version.message_id === undefined ? {} : { message_id: version.message_id }),
    ...(version.width === undefined ? {} : { width: version.width }),
    ...(version.height === undefined ? {} : { height: version.height }),
    ...(version.duration_ms === undefined ? {} : { duration_ms: version.duration_ms }),
    ...(madeFrom === undefined ? {} : { replaces: madeFrom }),
    ...(grant === undefined ? {} : { url: grant.url, url_expires_at: grant.expiresAt }),
  };
}

/** Who took whose place in the room: a version a harness posted is now its agent's. */
async function placesIn(room: Room): Promise<Map<string, string>> {
  const { readModels, workspaceId, spaceId } = room;
  return new Map(
    (await readModels.replacedIn(workspaceId, spaceId)).map((each) => [each.from, each.to]),
  );
}

/**
 * A room's files at their current version, as many as `most`, newest first. A version a harness
 * posted before its agent took its place in the room is the agent's (ADR 0087, point 9).
 */
export async function roomFilesFor(
  room: Room & {
    /** As of the message at this seq, with it; as of now when absent. */
    readonly upto?: number | undefined;
  },
): Promise<RoomFile[]> {
  const posted = await room.readModels.postedFiles(room.workspaceId, room.spaceId, {
    upto: room.upto,
  });
  if (posted.length === 0) return [];
  const replaced = await placesIn(room);
  const files: RoomFile[] = [];
  for (const version of currentFiles(posted, room.most)) {
    files.push(await wireOf(room, replaced, version));
  }
  return files;
}

/**
 * One name's versions, newest first, as many as `most` (ADR 0100): what a person reads to open an
 * older one. Each says what it was made from, where its post said.
 */
export async function fileVersionsFor(room: Room & { readonly name: string }): Promise<RoomFile[]> {
  const { readModels, workspaceId, spaceId, name } = room;
  const versions = versionsNamed(
    await readModels.postedFiles(workspaceId, spaceId, { name }),
    name,
    room.most,
  );
  if (versions.length === 0) return [];
  const replaced = await placesIn(room);
  const made = await readModels.madeFrom(
    workspaceId,
    versions.flatMap((version) => (version.message_id === undefined ? [] : [version.message_id])),
  );
  const files: RoomFile[] = [];
  for (const version of versions) {
    files.push(await wireOf(room, replaced, version, made.get(version.attachment_id)));
  }
  return files;
}

/**
 * What each file of a post was made from (ADR 0099), as the post's `replaces` says: copied onto the
 * file's attachment, and the map not kept. A key that is none of the post's files is refused, as a
 * post that does not say what it means. A value that is no version of that file in this room — an
 * attachment of another name, of another room, or none Chips has — is left out, and the file is
 * the next version unchecked, as one posted without `replaces`: refusing it would refuse every
 * later post of the file by a harness that has lost track, which nothing it is handed puts right,
 * and a version of another room is nothing to say to a harness that is not there. Whether the
 * version kept is still the current one is the store's to ask, inside the append.
 */
export async function fillMadeFrom(
  event: Record<string, unknown>,
  workspaceId: string,
  readModels: Pick<ReadModels, "attachmentFact">,
): Promise<{ readonly kind: "invalid"; readonly message: string } | undefined> {
  if (event["type"] !== "message.post") return undefined;
  const files = Array.isArray(event["attachments"])
    ? (event["attachments"] as Record<string, unknown>[])
    : [];
  // What a sender wrote on an attachment is not what it was made from: the post's map is.
  for (const file of files) delete file["replaces"];
  const map = event["replaces"];
  delete event["replaces"];
  if (typeof map !== "object" || map === null) return undefined;
  for (const [carried, from] of Object.entries(map as Record<string, string>)) {
    const file = files.find((each) => each["attachment_id"] === carried);
    if (file === undefined) {
      return {
        kind: "invalid",
        message: `replaces names ${carried}, which this message does not carry`,
      };
    }
    const was = await readModels.attachmentFact(workspaceId, from);
    if (was?.space_id === event["space_id"] && was?.filename === file["filename"])
      file["replaces"] = from;
  }
  return undefined;
}
