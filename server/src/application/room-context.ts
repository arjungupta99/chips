/**
 * What a harness is handed of a room (ADR 0088): with a message for it, the lines since it last
 * spoke there; from `GET /v1/spaces/:id/context`, a page of what came before.
 *
 * The lines are read from the log relative to the message, never from what this process has
 * seen, so a live delivery, a replay after a reconnect and a restart on either side hand over
 * the same ones. Which of them fit, and how they read, is the protocol's (`contextLines`), shared
 * with the conformance fake and the SDK. The room's files come with them (ADR 0099): with a
 * message, as of it; from the route, as of now.
 */

import {
  CONTEXT_CEILING,
  type ContextEvent,
  type ContextLine,
  contextLines,
  linesOf,
  quoteOf,
  quotesBefore,
  REPLY_BEFORE_LINES,
  REPLY_QUOTE_CHARS,
  type ReplyingTo,
  ROOM_FILES_IN_CONTEXT,
  type RoomContext,
  type Who,
} from "@chipschat/protocol";
import type { MessageView, ReadModels } from "./ports/index.js";
import { roomFilesFor, type Signer } from "./room-files.js";

/**
 * Who somebody is now: their kind and name, and a person's standing in the workspace (SEC-15), or
 * nothing for an id nobody knows.
 */
export type Lookup = (participantId: string) => Promise<ReturnType<Who> | undefined>;

interface Room {
  readonly readModels: ReadModels;
  readonly workspaceId: string;
  readonly spaceId: string;
  readonly lookup: Lookup;
  /** The URL the harness may fetch each of the room's files at; none where nothing signs. */
  readonly sign?: Signer | undefined;
}

/**
 * The lines since a participant last spoke in a room, before the message at `seq` and without it:
 * since it joined when it has not spoken there. Nothing for a budget of no lines. An agent is
 * asked about with the harness whose place it took in the room (ADR 0087): what the harness said
 * there before the upgrade, the agent said.
 *
 * From where the turn that said its last words began, not from the words (ADR 0105): what was said
 * while it worked came before its answer, and starting after the answer left it out of every turn
 * after. One taker's own words are left out instead; it knows what it said. Several share one
 * context, and each is owed what the others said, so theirs stay.
 *
 * One delivery for several of a harness's agents carries one context, and it starts from the one
 * that has heard least: the oldest of their marks. It used to start after whichever spoke last,
 * so an agent owed four lines was handed one (agents review, finding 15). The others see lines
 * again, which ADR 0088 allows: lines repeat, and they never leave a gap.
 */
export async function contextFor(
  room: Room & {
    /** Who is handed it: an agent, or several of one harness's that a message is for. */
    readonly participantIds: readonly string[];
    readonly seq: number;
    readonly budget: { readonly lines: number; readonly chars: number };
  },
): Promise<RoomContext | undefined> {
  if (room.budget.lines === 0) return undefined;
  const { readModels, workspaceId, spaceId, seq } = room;
  const replaced = await readModels.replacedIn(workspaceId, spaceId);
  const marks: number[] = [];
  const selves = new Set<string>();
  for (const id of new Set(room.participantIds)) {
    const ids = [id, ...replaced.filter((each) => each.to === id).map((each) => each.from)];
    for (const each of ids) selves.add(each);
    marks.push(
      (await readModels.lastTurnSeq(workspaceId, spaceId, ids, seq)) ??
        (await readModels.joinedSeq(workspaceId, spaceId, ids, seq)) ??
        0,
    );
  }
  const since = marks.length === 0 ? 0 : Math.min(...marks);
  const unsaidBy = marks.length === 1 ? [...selves] : [];
  return withFiles(
    room,
    await linesIn(room, { after: since, before: seq, budget: room.budget, unsaidBy }),
    seq,
  );
}

/**
 * What an agent is handed as it joins a room (ADR 0088, point 5): the room's last lines before it
 * joined, within its harness's budget. Nothing for a budget of no lines.
 */
export async function catchUpFor(
  room: Room & {
    readonly seq: number;
    readonly budget: { readonly lines: number; readonly chars: number };
  },
): Promise<RoomContext | undefined> {
  if (room.budget.lines === 0) return undefined;
  const lines = await linesIn(room, { after: 0, before: room.seq, budget: room.budget });
  return withFiles(room, lines, room.seq);
}

/**
 * A page of a room's lines before a cursor, as many as `limit` and never beyond the ceiling, and
 * the room's files as they are now.
 */
export async function contextPage(
  room: Room & { readonly before: number; readonly limit: number },
): Promise<RoomContext> {
  const lines = Math.min(Math.max(room.limit, 1), CONTEXT_CEILING.lines);
  const page = await linesIn(room, {
    after: 0,
    before: room.before,
    budget: { lines, chars: CONTEXT_CEILING.chars },
  });
  return withFiles(room, page, undefined);
}

/** A context with the room's files, as of the message at `upto` or as of now; none when it has none. */
async function withFiles(
  room: Room,
  context: RoomContext,
  upto: number | undefined,
): Promise<RoomContext> {
  const files = await roomFilesFor({ ...room, most: ROOM_FILES_IN_CONTEXT, upto });
  return files.length === 0 ? context : { ...context, files };
}

async function linesIn(
  room: Room,
  window: {
    readonly after: number;
    readonly before: number;
    readonly budget: { readonly lines: number; readonly chars: number };
    readonly unsaidBy?: readonly string[];
  },
): Promise<RoomContext> {
  const read = await room.readModels.roomLinesSince(room.workspaceId, room.spaceId, {
    after: window.after,
    before: window.before,
    limit: window.budget.lines,
    ...(window.unsaidBy === undefined ? {} : { unsaidBy: window.unsaidBy }),
  });
  return contextLines(await linesFor(room, read.events), window.budget, {
    since: window.after,
    before: window.before,
    more: read.more,
  });
}

/** A room's events as lines, as the room reads now: whose place each took, and who each is. */
async function linesFor(room: Room, read: readonly ContextEvent[]): Promise<ContextLine[]> {
  const replaced = new Map(
    (await room.readModels.replacedIn(room.workspaceId, room.spaceId)).map((each) => [
      each.from,
      each.to,
    ]),
  );
  const events = replaced.size === 0 ? read : read.map((e) => asNow(e, replaced));
  // Each author with their standing: in the workspace, as the lookup knows it, and in this room
  // (SEC-15), so a harness can weigh a line by who said it.
  const known = new Map<string, ReturnType<Who>>();
  for (const id of namedIn(events)) {
    const found = await room.lookup(id);
    const role =
      found === undefined
        ? undefined
        : await room.readModels.memberRole(room.workspaceId, room.spaceId, id);
    known.set(
      id,
      found === undefined ? undefined : { ...found, ...(role === undefined ? {} : { role }) },
    );
  }
  return linesOf(events, (id) => known.get(id));
}

/** The message a reply answers, as a harness is handed it, its files signed for that harness. */
export type DeliveredReply = ReplyingTo & {
  readonly attachments?: readonly Record<string, unknown>[];
};

/**
 * The message a reply answers (ADR 0219), read as the context reads the room: its words as they
 * read now, who said it as they are now, and of one taken back only who and when. Its files come
 * as URLs this harness may fetch. With a turn (`handed`, the context it was given), and when the
 * message is older than those lines, the lines said just before it come too, on the quote's own
 * budget. Said before the agent joined or not, it is quoted. Nothing for a message not in the
 * room, or not something a person or an agent said.
 */
export async function replyingToFor(
  room: Room & {
    readonly replyTo: string;
    /** The context handed with the turn; none overheard, or for a harness that asked for none. */
    readonly handed?: RoomContext | undefined;
  },
): Promise<DeliveredReply | undefined> {
  const { readModels, workspaceId, spaceId } = room;
  const message = await readModels.message(workspaceId, room.replyTo);
  const seq = message?.seq;
  if (message === undefined || seq === undefined || seq === null || message.space_id !== spaceId) {
    return undefined;
  }
  const deleted = message.deleted_at !== null;
  // A message taken back is no line of the room's any more: who said it and when, from its row.
  const events = deleted
    ? [takenBack(message, seq)]
    : (
        await readModels.roomLinesSince(workspaceId, spaceId, {
          after: seq - 1,
          before: seq + 1,
          limit: 1,
        })
      ).events;
  const said = events.find((event) => event.type === "message.post");
  const [line] = said === undefined ? [] : await linesFor(room, [said]);
  if (said === undefined || line?.message_id === undefined) return undefined;
  const before = quotesBefore(seq, room.handed)
    ? (
        await linesIn(room, {
          after: 0,
          before: seq,
          budget: { lines: REPLY_BEFORE_LINES, chars: REPLY_QUOTE_CHARS },
        })
      ).lines
    : undefined;
  const quote = quoteOf(
    { ...line, message_id: line.message_id },
    { edited: message.edited_at !== null, deleted },
    before,
  );
  const files = deleted ? [] : signedIn(said.payload, room.sign);
  return files.length === 0 ? quote : { ...quote, attachments: files };
}

/** A message taken back, as an event: who said it and when, and no words. */
function takenBack(message: MessageView, seq: number): ContextEvent {
  return {
    seq,
    ts: message.created_at,
    type: "message.post",
    id: message.event_id,
    actor: { kind: message.author_kind, id: message.author_id },
    payload: { text: "" },
  };
}

/** A message's files, each with a URL for this harness where something signs. */
function signedIn(
  payload: Readonly<Record<string, unknown>>,
  sign: Signer | undefined,
): Record<string, unknown>[] {
  const files = payload["attachments"];
  if (!Array.isArray(files)) return [];
  return (files as Record<string, unknown>[])
    .filter((file) => typeof file["attachment_id"] === "string")
    .map((file) => {
      const grant = sign?.(String(file["attachment_id"]));
      return grant === undefined
        ? file
        : { ...file, url: grant.url, url_expires_at: grant.expiresAt };
    });
}

/**
 * A line as it reads now: what a harness said or was sent in a room before its agent took its
 * place there is the agent's (ADR 0087, point 9).
 */
function asNow(event: ContextEvent, replaced: ReadonlyMap<string, string>): ContextEvent {
  const now = (id: string): string => replaced.get(id) ?? id;
  const addressed = event.payload["addressed_to"];
  const subject = event.payload["participant_id"];
  const actor = replaced.get(event.actor.id);
  return {
    ...event,
    actor: actor === undefined ? event.actor : { kind: "agent", id: actor },
    payload: {
      ...event.payload,
      ...(Array.isArray(addressed) ? { addressed_to: (addressed as string[]).map(now) } : {}),
      ...(typeof subject === "string" ? { participant_id: now(subject) } : {}),
    },
  };
}

/** Everybody a line names: who said or did it, and who came, went or took a new name. */
function namedIn(events: readonly ContextEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.actor.id !== "system") ids.add(event.actor.id);
    const subject = event.payload["participant_id"];
    if (typeof subject === "string") ids.add(subject);
  }
  return ids;
}
