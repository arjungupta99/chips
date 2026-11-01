/**
 * The room's files (ADR 0099), as the fake plays them: the real server's reads and door over the
 * fake's log rather than its projections. The files posted in a room, in order, none from a message
 * taken back; what each file of a post was made from, copied onto it from the post's `replaces`;
 * and the refusal of one made from a version no longer current. Which file is which version, and
 * the refusal's words, are the protocol's, so the two cannot differ.
 */

import {
  currentFiles,
  type FileVersion,
  messageIdOf,
  type PostedFile,
  type RoomFile,
  type StaleRefusal,
  staleRefusal,
  staleVersion,
  versionsNamed,
  versionsOf,
} from "@chipschat/protocol";

/** An event as the fake's log holds it, as far as these reads need it (the workspace's own). */
interface StoredEvent {
  readonly seq: number;
  readonly id: string;
  readonly type: string;
  readonly ts: string;
  readonly space_id: string | null;
  readonly actor: { readonly kind: string; readonly id: string };
  readonly payload: Readonly<Record<string, unknown>>;
}

/** The events whose files are the room's: a message, and an artifact (as the server's projection). */
const CARRIES: ReadonlySet<string> = new Set(["message.post", "artifact.create"]);

function filesOf(event: StoredEvent): Record<string, unknown>[] {
  const one = event.payload["attachment"];
  const many = event.payload["attachments"];
  if (Array.isArray(many)) return many as Record<string, unknown>[];
  return typeof one === "object" && one !== null ? [one as Record<string, unknown>] : [];
}

/** The files posted in a room, oldest first, up to the event at `upto` and with it. */
export function postedFilesInLog(
  log: readonly StoredEvent[],
  spaceId: string,
  upto = Number.POSITIVE_INFINITY,
): PostedFile[] {
  const taken = new Set(
    log
      .filter((event) => event.type === "message.deleted")
      .map((event) => String(event.payload["message_id"])),
  );
  return log
    .filter((event) => CARRIES.has(event.type) && event.space_id === spaceId && event.seq <= upto)
    .filter((event) => !taken.has(messageIdOf(event.id)))
    .flatMap((event) =>
      filesOf(event).map((file) => ({
        seq: event.seq,
        at: event.ts,
        by: event.actor.id,
        attachment_id: String(file["attachment_id"]),
        filename: String(file["filename"]),
        sha256: String(file["sha256"]),
        byte_size: Number(file["byte_size"]),
        mime_type: String(file["mime_type"]),
        message_id: messageIdOf(event.id),
        ...measured(file),
      })),
    );
}

/** A file's pixels and length, where the server measured them. */
function measured(
  file: Record<string, unknown>,
): Pick<PostedFile, "width" | "height" | "duration_ms"> {
  const { width, height, duration_ms: duration } = file;
  return {
    ...(typeof width === "number" ? { width } : {}),
    ...(typeof height === "number" ? { height } : {}),
    ...(typeof duration === "number" ? { duration_ms: duration } : {}),
  };
}

/** How a room's files are read out: for whom, how many, and who each was posted by now. */
interface Reading {
  readonly spaceId: string;
  readonly most: number;
  /** Who a participant is now, as a line's `from` says it. */
  readonly by: (participantId: string) => RoomFile["by"];
  readonly sign?: ((attachmentId: string) => { url: string; url_expires_at: string }) | undefined;
}

/** One version as the real server says it. */
function wireOf(version: FileVersion, room: Reading, madeFrom?: string | undefined): RoomFile {
  return {
    name: version.filename,
    version: version.version,
    attachment_id: version.attachment_id,
    sha256: version.sha256,
    byte_size: version.byte_size,
    mime_type: version.mime_type,
    by: room.by(version.by),
    at: version.at,
    ...(version.message_id === undefined ? {} : { message_id: version.message_id }),
    ...(version.width === undefined ? {} : { width: version.width }),
    ...(version.height === undefined ? {} : { height: version.height }),
    ...(version.duration_ms === undefined ? {} : { duration_ms: version.duration_ms }),
    ...(madeFrom === undefined ? {} : { replaces: madeFrom }),
    ...(room.sign?.(version.attachment_id) ?? {}),
  };
}

/** A room's files at their current version, newest first, as the real server hands them over. */
export function roomFilesInLog(
  log: readonly StoredEvent[],
  room: Reading & { readonly upto?: number | undefined },
): RoomFile[] {
  const posted = postedFilesInLog(log, room.spaceId, room.upto);
  return currentFiles(posted, room.most).map((version) => wireOf(version, room));
}

/** One name's versions, newest first, each with what it was made from (ADR 0100). */
export function fileVersionsInLog(
  log: readonly StoredEvent[],
  room: Reading & { readonly name: string },
): RoomFile[] {
  const posted = postedFilesInLog(log, room.spaceId);
  const made = new Map<string, string>();
  for (const event of log) {
    if (!CARRIES.has(event.type) || event.space_id !== room.spaceId) continue;
    for (const file of filesOf(event)) {
      if (typeof file["replaces"] === "string")
        made.set(String(file["attachment_id"]), file["replaces"]);
    }
  }
  return versionsNamed(posted, room.name, room.most).map((version) =>
    wireOf(version, room, made.get(version.attachment_id)),
  );
}

/** Where an attachment was posted in the log, under what name, and its digest. */
function factOf(log: readonly StoredEvent[], attachmentId: string) {
  for (const event of log) {
    if (!CARRIES.has(event.type)) continue;
    const file = filesOf(event).find((each) => each["attachment_id"] === attachmentId);
    if (file !== undefined) {
      return {
        space_id: event.space_id,
        filename: file["filename"],
        sha256: String(file["sha256"]),
      };
    }
  }
  return undefined;
}

/**
 * The real door's `fillMadeFrom` and the store's `fileGate`, at once, since the fake has one writer
 * and nothing between them: each file's `replaces` copied onto it when it names a version of that
 * file in this room, the map not kept; a key that is none of the post's files refused; a file made
 * from a version no longer current refused `stale_file`.
 */
export function madeFromInLog(
  log: readonly StoredEvent[],
  event: Record<string, unknown>,
  nameOf: (participantId: string) => string,
): { kind: "invalid"; message: string } | StaleRefusal | undefined {
  if (event["type"] !== "message.post") return undefined;
  const files = Array.isArray(event["attachments"])
    ? (event["attachments"] as Record<string, unknown>[])
    : [];
  for (const file of files) delete file["replaces"];
  const map = event["replaces"];
  delete event["replaces"];
  if (typeof map !== "object" || map === null) return undefined;
  const made: { filename: string; sha256: string; from: string }[] = [];
  for (const [carried, from] of Object.entries(map as Record<string, string>)) {
    const file = files.find((each) => each["attachment_id"] === carried);
    if (file === undefined) {
      return {
        kind: "invalid",
        message: `replaces names ${carried}, which this message does not carry`,
      };
    }
    const was = factOf(log, from);
    if (
      was === undefined ||
      was.space_id !== event["space_id"] ||
      was.filename !== file["filename"]
    )
      continue;
    file["replaces"] = from;
    made.push({
      filename: String(file["filename"]),
      sha256: String(file["sha256"]),
      from: was.sha256,
    });
  }
  const current = staleVersion(made, versionsOf(postedFilesInLog(log, String(event["space_id"]))));
  return current === undefined ? undefined : staleRefusal(current, nameOf(current.by));
}
