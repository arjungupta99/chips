/**
 * What a harness is handed with a question (ADR 0088): the room's lines since it last spoke there.
 *
 * Chips keeps the room's conversation, the harness keeps its own memory. What joins them is this
 * block, sent on `message.new` and read back through `GET /v1/spaces/:id/context`. The server that
 * builds it, the conformance fake that plays the server and the SDK that renders it have to hand
 * over the same lines, so the rule lives here, with the schemas, as `address.ts` does.
 *
 * Three steps, each pure:
 * - `linesOf` turns a room's events into lines: what was said, as it reads now, and who came, went
 *   or took a new name, and when the room was put away or brought back.
 * - `contextLines` keeps the newest that fit a budget, oldest first, and cuts a line longer than
 *   the whole budget rather than dropping it.
 * - `renderContext` writes them as the adapters always have: "Said in this room since you last
 *   spoke:", then `Name: words`, one per line; then the room's files, one per line (ADR 0099). A
 *   line for another agent says whom it was for, `Name, to Scout: words` (ADR 0088, addendum).
 *
 * A reply hands over the message it answers in the same shape (`replyingTo`, ADR 0219), and
 * `renderReplyingTo` writes it for the turn.
 */

import { z } from "zod";
import { messageIdOf } from "./ids/index.js";
import { agentId, id, isoTimestamp, MAX_TRANSCRIPT_LENGTH } from "./primitives.js";
import { namesInWords } from "./project.js";
import { ROOM_FILES_IN_CONTEXT, renderRoomFiles, roomFiles } from "./room-files.js";
import { MONTHS } from "./room-note.js";
import { jobSpend } from "./spend.js";

/**
 * What a harness is handed when it says nothing. It was the first adapters' own numbers, 20 lines
 * and 4,000 characters, until agents shared rooms: their answers run to 2,000 characters, and in a
 * room of four on 30 October 2026 the lead was handed two of the four introductions and another
 * agent three (ADR 0249).
 */
export const CONTEXT_BUDGET = { lines: 40, chars: 16_000 } as const;
/** The most Chips hands over with one message. More is the pull route's, a page at a time. */
export const CONTEXT_CEILING = { lines: 200, chars: 32_000 } as const;

/** The heading the plain form opens with. */
export const CONTEXT_HEADING = "Said in this space since you last spoke:";

export const contextBudget = z
  .object({
    lines: z
      .int()
      .nonnegative()
      .optional()
      .describe(
        "The most lines to be handed, 40 when absent. Chips hands over 200 at most, and none when this is 0.",
      ),
    chars: z
      .int()
      .nonnegative()
      .optional()
      .describe(
        "The most characters those lines may run to, as `Name: words` one per line, 16,000 when absent. Chips hands over 32,000 at most.",
      ),
  })
  .describe(
    "How much of the room a harness is handed with a message for it (ADR 0088). Its own to say: a budget promises nothing to anybody else.",
  );
export type ContextBudget = z.infer<typeof contextBudget>;

/** A budget as Chips applies it: what was asked, filled in and kept under the ceiling. */
export function budgetOf(asked?: ContextBudget | undefined): { lines: number; chars: number } {
  return {
    lines: Math.min(asked?.lines ?? CONTEXT_BUDGET.lines, CONTEXT_CEILING.lines),
    chars: Math.min(asked?.chars ?? CONTEXT_BUDGET.chars, CONTEXT_CEILING.chars),
  };
}

export const contextLine = z
  .object({
    seq: z.int().positive().describe("Where in the log it happened."),
    at: isoTimestamp.describe("When."),
    kind: z
      .enum(["said", "joined", "left", "renamed", "archived", "unarchived"])
      .describe(
        "`said`: a message, addressed to this harness or not. `joined` and `left`: somebody came into the room or went. `renamed`: somebody took a new name, or the room a new title. `archived` and `unarchived`: the room was put away or brought back.",
      ),
    from: z
      .object({
        id: z.string().min(1).max(120).describe("Their participant id, or `system`."),
        kind: z.enum(["person", "harness", "agent", "system"]),
        name: z.string().min(1).max(120).describe("What they go by now."),
        role: z
          .enum(["owner", "member", "guest"])
          .optional()
          .describe("Their standing in this room, when they are in it (SEC-15)."),
        workspace_role: z
          .enum(["owner", "admin", "member", "guest"])
          .optional()
          .describe(
            "A person's standing in the workspace (SEC-15): the plain form says it after the name, so a guest's line reads as a guest's. Absent for an agent or a harness.",
          ),
      })
      .describe(
        "Who: the one who said it, came, went or took the new name; for the room's own lines, who retitled, archived or unarchived it.",
      ),
    message_id: id("message").optional().describe("On `said`: the message."),
    text: z
      .string()
      .max(64_000)
      .optional()
      .describe(
        "On `said`: the words as they read now, so an edited message reads edited; a deleted one is not a line. Cut with an ellipsis when the one line is longer than the whole budget.",
      ),
    transcript: z
      .string()
      .max(MAX_TRANSCRIPT_LENGTH)
      .optional()
      .describe("On `said`: what a voice note said, as the server heard it (ADR 0054)."),
    files: z
      .array(z.string().min(1).max(255))
      .max(20)
      .optional()
      .describe("On `said`: the names of the files it carried."),
    addressed_to: z
      .array(agentId)
      .max(64)
      .optional()
      .describe(
        "On `said`: the agents it was for (ADR 0081, ADR 0087), so a harness can leave out a line one of its agents already took a turn on. Absent on a message from before Chips said so.",
      ),
    to: z
      .array(
        z.object({
          id: agentId.describe("One of `addressed_to`."),
          name: z.string().min(1).max(120).describe("What it goes by now."),
        }),
      )
      .max(64)
      .optional()
      .describe(
        "On `said`: the agents it was for, each by what it goes by now, in `addressed_to`'s order. The plain form says them when the line was for an agent other than the one reading it, `Arjun, to Scout: …`: a person's pick in the field leaves no @ in the words. Absent when it was for no agent, and from a Chips before it.",
      ),
    held: z
      .literal(true)
      .optional()
      .describe("On `said`: the guard held it (ADR 0081), so it was for nobody."),
    name: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe("On `renamed`, for a participant: the name they took."),
    previous: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe("On `renamed`, for a participant: the name they went by until then."),
    title: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("On `renamed`, for the room: its new title."),
  })
  .describe("One line of a room: something said, or something that happened to who is in it.");
export type ContextLine = z.infer<typeof contextLine>;

export const roomContext = z
  .object({
    lines: z
      .array(contextLine)
      .max(CONTEXT_CEILING.lines)
      .describe("Oldest first, the newest that fit the budget."),
    since_seq: z
      .int()
      .nonnegative()
      .describe(
        "Where they start: after this `seq`. With a message, where the harness's own last turn in the room began, one that said something or passed with NO_REPLY (ADR 0105), else its joining; from the pull route, 0.",
      ),
    truncated: z
      .boolean()
      .describe("Whether older lines after `since_seq` were left out to fit the budget."),
    before: z
      .int()
      .positive()
      .describe(
        "A cursor: `GET /v1/spaces/:id/context?before=` this reads what came before these lines.",
      ),
    files: roomFiles
      .max(ROOM_FILES_IN_CONTEXT)
      .optional()
      .describe(
        "The room's files at their current version, newest first, the 20 newest (ADR 0099): with a message, as of it, its own files included; from the pull route, as of now. Each with a URL for this harness. Absent from a Chips before files, and when the room has none.",
      ),
    spend: jobSpend
      .optional()
      .describe(
        "What the room's job has spent, as of the message (for one Chips held, as of its hand-over, when a new job began), against what the room allows a job (ADR 0117). With a message only; the room note says it in words. Absent from a Chips before it.",
      ),
  })
  .describe(
    "What was said in a room since the harness last spoke there (ADR 0088). Every line is from a room it is in now.",
  );
export type RoomContext = z.infer<typeof roomContext>;

/** As much of a quoted message's words as a reply hands over (ADR 0219), on a budget of its own. */
export const REPLY_QUOTE_CHARS = 2000;
/** The lines said just before a quoted message older than the turn's context (ADR 0219). */
export const REPLY_BEFORE_LINES = 3;

export const replyingTo = contextLine
  .extend({
    kind: z.literal("said"),
    message_id: id("message").describe("The message the reply answers: its `reply_to`."),
    edited: z
      .literal(true)
      .optional()
      .describe("Its author changed its words since: `text` is how it reads now."),
    deleted: z
      .literal(true)
      .optional()
      .describe("Taken back since it was answered: no words, no files, only who and when."),
    before: z
      .array(contextLine)
      .max(REPLY_BEFORE_LINES)
      .optional()
      .describe(
        "Up to three lines said just before it, oldest first, so the turn has what it was about. Only with a turn, and only when the message is older than the lines `context` hands over.",
      ),
  })
  .describe(
    "The message a reply answers, as the room reads it now (ADR 0219): one line in the context's shape, its words cut at 2,000 characters, said before the agent joined the room or not. It never names a message in another room.",
  );
export type ReplyingTo = z.infer<typeof replyingTo>;

/**
 * A message as a reply quotes it: its words cut to `REPLY_QUOTE_CHARS`, and a deleted one's words
 * and files gone. Both the server and the conformance fake shape it here.
 */
export function quoteOf(
  line: ContextLine & { readonly message_id: string },
  changed: { readonly edited?: boolean; readonly deleted?: boolean },
  before?: readonly ContextLine[],
): ReplyingTo {
  const { text, transcript, files, ...who } = line;
  const kept =
    changed.deleted === true
      ? {}
      : {
          text: quoted(text ?? ""),
          ...(transcript === undefined ? {} : { transcript }),
          ...(files === undefined ? {} : { files }),
        };
  return {
    ...who,
    kind: "said",
    ...kept,
    ...(changed.edited === true && changed.deleted !== true ? { edited: true as const } : {}),
    ...(changed.deleted === true ? { deleted: true as const } : {}),
    ...(before === undefined || before.length === 0 ? {} : { before: [...before] }),
  };
}

function quoted(text: string): string {
  return text.length <= REPLY_QUOTE_CHARS
    ? text
    : `${text.slice(0, REPLY_QUOTE_CHARS - 1).trimEnd()}…`;
}

/**
 * Whether a quoted message is older than the lines a turn was handed, so the lines before it come
 * too (ADR 0219): at or before where they start, or before the first of them when older ones were
 * left out to fit. No context, no lines before it: a harness that asked for none gets none.
 */
export function quotesBefore(
  seq: number,
  handed: Pick<RoomContext, "lines" | "since_seq" | "truncated"> | undefined,
): boolean {
  if (handed === undefined) return false;
  if (seq <= handed.since_seq) return true;
  const first = handed.lines[0]?.seq;
  return handed.truncated && first !== undefined && seq < first;
}

/** An event as `linesOf` reads it: the envelope's fields, and the rest of the event flat. */
export interface ContextEvent {
  readonly seq: number;
  readonly ts: string;
  readonly type: string;
  readonly id: string;
  readonly actor: { readonly kind: string; readonly id: string };
  readonly payload: Readonly<Record<string, unknown>>;
}

type From = ContextLine["from"];

/**
 * Who somebody is now, as the caller knows: their kind and name, and for a person their standing
 * in the room and the workspace when the caller knows those too (SEC-15).
 */
export type Who = (participantId: string) =>
  | {
      readonly kind: string;
      readonly name: string;
      readonly role?: From["role"] | undefined;
      readonly workspace_role?: From["workspace_role"] | undefined;
    }
  | undefined;

function fromOf(who: Who, participantId: string, kind?: unknown): From {
  if (participantId === "system") return { id: "system", kind: "system", name: "Chips" };
  const known = who(participantId);
  const said = known?.kind ?? (typeof kind === "string" ? kind : undefined);
  return {
    id: participantId,
    kind: said === "person" || said === "system" || said === "agent" ? said : "harness",
    name: (known?.name ?? participantId).slice(0, 120) || participantId,
    ...(known?.role === undefined ? {} : { role: known.role }),
    ...(known?.workspace_role === undefined ? {} : { workspace_role: known.workspace_role }),
  };
}

/**
 * A person's name with their standing in the workspace after it, "Priya (guest)", for the words a
 * model reads (SEC-15): a guest's "delete the old branches" read exactly as the owner's would. The
 * room's role is not said: a room's "owner" is whoever opened it, which a member can, and would
 * read as the workspace's. An agent's or a harness's name is itself.
 */
export function withRole(
  name: string,
  from: { readonly kind?: string | undefined; readonly workspace_role?: string | undefined },
): string {
  if (from.kind !== "person" || from.workspace_role === undefined) return name;
  return `${name} (${from.workspace_role})`;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * The agents a message was for, each by the name it goes by now. One nobody knows is left out: an
 * id is no name to say to a model.
 */
function toOf(addressed: unknown, who: Who): NonNullable<ContextLine["to"]> {
  const ids = Array.isArray(addressed) ? (addressed as unknown[]) : [];
  return ids.flatMap((id) => {
    if (typeof id !== "string") return [];
    const name = who(id)?.name.slice(0, 120);
    return name === undefined || name === "" ? [] : [{ id, name }];
  });
}

/**
 * A message's words and what it carried: text as given, voice notes heard, files by name, and
 * whom it was for.
 */
function saidFields(payload: Readonly<Record<string, unknown>>, who: Who): Partial<ContextLine> {
  const files = Array.isArray(payload["attachments"])
    ? (payload["attachments"] as Record<string, unknown>[])
    : [];
  const heard = files.map((file) => str(file["transcript"])).filter((each) => each !== undefined);
  const names = files.map((file) => str(file["filename"])).filter((each) => each !== undefined);
  const addressed = payload["addressed_to"];
  const to = toOf(addressed, who);
  return {
    text: typeof payload["text"] === "string" ? payload["text"] : "",
    ...(heard.length === 0 ? {} : { transcript: heard.join(" ").slice(0, MAX_TRANSCRIPT_LENGTH) }),
    ...(names.length === 0 ? {} : { files: names.slice(0, 20) }),
    ...(Array.isArray(addressed) ? { addressed_to: addressed as string[] } : {}),
    ...(to.length === 0 ? {} : { to }),
    ...(payload["held"] === true ? { held: true as const } : {}),
  };
}

/** The room's own line for a `space.updated`: archived, unarchived or retitled, or none. */
function roomLine(event: ContextEvent, base: Pick<ContextLine, "seq" | "at" | "from">) {
  const { state, title } = event.payload;
  if (state === "closed") return { ...base, kind: "archived" as const };
  if (state === "open") return { ...base, kind: "unarchived" as const };
  const named = str(title);
  return named === undefined ? undefined : { ...base, kind: "renamed" as const, title: named };
}

/** One event as a line, or nothing for an event that is not one. */
function lineOf(event: ContextEvent, who: Who): ContextLine | undefined {
  const at = { seq: event.seq, at: event.ts };
  const p = event.payload;
  const subject = str(p["participant_id"]);
  switch (event.type) {
    case "message.post":
      return {
        ...at,
        kind: "said",
        from: fromOf(who, event.actor.id, event.actor.kind),
        message_id: messageIdOf(event.id),
        ...saidFields(p, who),
      };
    case "membership.added":
    case "membership.removed":
      if (subject === undefined) return undefined;
      return {
        ...at,
        kind: event.type === "membership.added" ? "joined" : "left",
        from: fromOf(who, subject, p["participant_kind"]),
      };
    case "person.renamed":
      if (subject === undefined) return undefined;
      return {
        ...at,
        kind: "renamed",
        from: fromOf(who, subject, "person"),
        ...(str(p["display_name"]) === undefined ? {} : { name: str(p["display_name"]) }),
        ...(str(p["previous_name"]) === undefined ? {} : { previous: str(p["previous_name"]) }),
      };
    case "space.updated":
      return roomLine(event, { ...at, from: fromOf(who, event.actor.id, event.actor.kind) });
    default:
      return undefined;
  }
}

/**
 * A room's events as lines, in the order given. A message edited among them reads edited, and
 * one deleted among them is left out: what a harness is handed is the room as it reads now. A
 * caller that already holds the words as they read now (the server's projection) passes the
 * messages with them, and no edits.
 */
export function linesOf(events: readonly ContextEvent[], who: Who): ContextLine[] {
  const { edited, deleted } = changesIn(events);
  const lines: ContextLine[] = [];
  for (const event of events) {
    const line = lineOf(event, who);
    const message = line?.message_id;
    if (line === undefined || (message !== undefined && deleted.has(message))) continue;
    const text = message === undefined ? undefined : edited.get(message);
    lines.push(text === undefined ? line : { ...line, text });
  }
  return lines;
}

/** The latest words of each message edited among the events, and those deleted. */
function changesIn(events: readonly ContextEvent[]) {
  const edited = new Map<string, string>();
  const deleted = new Set<string>();
  for (const event of events) {
    const target = str(event.payload["message_id"]);
    const text = event.payload["text"];
    if (target === undefined) continue;
    if (event.type === "message.deleted") deleted.add(target);
    else if (event.type === "message.edited" && typeof text === "string") edited.set(target, text);
  }
  return { edited, deleted };
}

/** A line's words, on one line: newlines become spaces, as the adapters have always written them. */
function flat(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").trim();
}

/** What a message said: its words, what a voice note said, what it carried. */
function wordsOf(line: ContextLine): string {
  const text = flat(line.text ?? "");
  const heard = line.transcript === undefined ? "" : flat(line.transcript);
  const parts = [text];
  if (heard !== "") parts.push(text === "" ? `(voice note) ${heard}` : `(voice note: ${heard})`);
  if (heard === "" && line.files !== undefined) parts.push(`(sent ${line.files.join(", ")})`);
  if (line.held === true) parts.push("(held by Chips until a person acts)");
  return parts.filter((part) => part !== "").join(" ");
}

/** Who reads a line, when the caller knows. */
export interface LineReading {
  /**
   * The agent taking the turn. A line for it and others reads "to you and Scout", and one for it
   * alone says nothing more, as it always has. Unsaid, every agent a line was for is named.
   */
  readonly taker?: string | undefined;
}

/**
 * Whom a line was for, after who said it: ", to Scout", ", to you and Scout". Nothing for a line
 * that was for no agent, or for the reader alone. A person's pick in the field puts no @ in the
 * words, so without this a line for another agent reads as the room's, or the reader's: on
 * 13 November 2026 an agent asked for "echo" answered "delta", the word asked of another one line
 * earlier (finding NR-13).
 */
function toWords(line: ContextLine, taker: string | undefined): string {
  const to = line.to ?? [];
  const others = to.filter((each) => each.id !== taker).map((each) => each.name);
  if (others.length === 0) return "";
  return `, to ${namesInWords(others.length === to.length ? others : ["you", ...others])}`;
}

/**
 * One line in the plain form; what was said is said under the name with its standing (SEC-15),
 * and whom it was for when that was another agent. Two signatures, so `lines.map(renderLine)`
 * still reads: an index is no reader.
 */
export function renderLine(line: ContextLine): string;
export function renderLine(line: ContextLine, reading: LineReading | undefined): string;
export function renderLine(line: ContextLine, reading?: LineReading): string {
  const name = line.from.name;
  switch (line.kind) {
    case "said":
      return `${withRole(name, line.from)}${toWords(line, reading?.taker)}: ${wordsOf(line)}`;
    case "joined":
      return `(${name} joined the space)`;
    case "left":
      return `(${name} left the space)`;
    case "renamed":
      if (line.title !== undefined) return `(${name} renamed the space "${line.title}")`;
      return `(${line.previous ?? name} is now called ${line.name ?? name})`;
    case "archived":
      return `(${name} archived the space)`;
    default:
      return `(${name} unarchived the space)`;
  }
}

/** A line cut to fit `chars` in the plain form: its words first, then what a voice note said. */
function cut(line: ContextLine, chars: number): ContextLine {
  let clipped = line;
  for (const field of ["text", "transcript"] as const) {
    const over = renderLine(clipped).length - chars;
    const value = clipped[field];
    if (over <= 0) return clipped;
    if (value === undefined || value === "") continue;
    const keep = Math.max(0, value.length - over - 1);
    clipped = { ...clipped, [field]: `${value.slice(0, keep).trimEnd()}…` };
  }
  return clipped;
}

/**
 * The newest lines that fit a budget, oldest first. Counted as the plain form's lines joined by
 * newlines, heading aside, as the adapters counted. The oldest goes first until the rest fit, and
 * one line longer than the whole budget is cut to it rather than dropped, so the newest line is
 * always there. `more` says there were older lines in the window than the caller passed.
 */
export function contextLines(
  lines: readonly ContextLine[],
  budget: { readonly lines: number; readonly chars: number },
  window: { readonly since: number; readonly before: number; readonly more?: boolean },
): RoomContext {
  const kept: ContextLine[] = [];
  let used = 0;
  for (let at = lines.length - 1; at >= 0 && kept.length < budget.lines; at -= 1) {
    const line = lines[at] as ContextLine;
    const cost = renderLine(line).length + (kept.length === 0 ? 0 : 1);
    if (kept.length > 0 && used + cost > budget.chars) break;
    kept.unshift(kept.length === 0 ? cut(line, budget.chars) : line);
    used += Math.min(cost, budget.chars);
  }
  return {
    lines: kept,
    since_seq: window.since,
    truncated: kept.length < lines.length || window.more === true,
    before: kept[0]?.seq ?? window.before,
  };
}

/**
 * The plain form: the heading, then one line each, oldest first; then the room's files, one each
 * (ADR 0099). Nothing at all when there are neither, so a harness can put it ahead of a turn's
 * words unconditionally.
 */
export function renderContext(
  context: (Pick<RoomContext, "lines"> & Pick<Partial<RoomContext>, "files">) | undefined,
  reading?: LineReading,
): string {
  if (context === undefined) return "";
  const said =
    context.lines.length === 0
      ? ""
      : [CONTEXT_HEADING, ...context.lines.map((line) => renderLine(line, reading))].join("\n");
  return [said, renderRoomFiles(context.files)].filter((part) => part !== "").join("\n\n");
}

/** A file a message carried, as a line a model can read: the turn's own and a quote's (ADR 0219). */
export function renderAttachment(file: QuotedFile): string {
  const heard = file.transcript === undefined ? "" : `, which says: "${file.transcript}"`;
  return `(attached: ${file.filename}, ${file.mime_type}${heard})`;
}

interface QuotedFile {
  readonly filename: string;
  readonly mime_type: string;
  readonly transcript?: string | undefined;
}

/** A quote as a harness is handed it: with its files signed, on `message.new`. */
type Quoted = ReplyingTo & { readonly attachments?: readonly QuotedFile[] | undefined };

/** Who is replying, who takes the turn, and the clock the quote is told by (ADR 0219). */
export interface ReplyReading {
  /** With a person's kind and standing, so "Priya (guest) is replying" reads as a guest's (SEC-49). */
  readonly sender: {
    readonly id: string;
    readonly name: string;
    readonly kind?: string | undefined;
    readonly workspace_role?: string | undefined;
  };
  /** Who takes the turn, so a message of its own reads "your message". */
  readonly taker?: string | undefined;
  /** When the reply was said, which "today" and "yesterday" count from. Now, unless said. */
  readonly at?: string | Date | undefined;
  /** The zone the harness tells time in. The host's, unless said or not one the host knows. */
  readonly zone?: string | undefined;
}

export const REPLY_BEFORE_HEADING = "Said just before it:";

/**
 * The plain form of the message a reply answers (ADR 0219), for the turn between what was said
 * since and the words: whose message and when, the lines said just before it when they came, and
 * the message quoted with `> `. A deleted one is only who and when. Nothing when it answers none.
 * Both names carry a person's standing, as every other line does (SEC-49).
 */
export function renderReplyingTo(replying: Quoted | undefined, reading: ReplyReading): string {
  if (replying === undefined) return "";
  const author = replying.from.id;
  const whose =
    author === reading.taker
      ? "your message"
      : author === reading.sender.id
        ? "their own message"
        : `${withRole(replying.from.name, replying.from)}'s message`;
  const gone = replying.deleted === true ? ", which has since been deleted" : "";
  const replier = withRole(reading.sender.name, reading.sender);
  const said = [
    `${replier} is replying to ${whose} from ${saidWhen(replying.at, reading)}${gone}.`,
  ];
  if (replying.before !== undefined && replying.before.length > 0) {
    const reader = { taker: reading.taker };
    said.push(REPLY_BEFORE_HEADING, ...replying.before.map((line) => renderLine(line, reader)));
  }
  if (replying.deleted === true) return said.join("\n");
  const edited = replying.edited === true ? " (edited)" : "";
  said.push(`${whose[0]?.toUpperCase()}${whose.slice(1)}${edited}:`, ...quoteLines(replying));
  return said.join("\n");
}

/** The quoted message's words, what a voice note said and its files, each line under `> `. */
function quoteLines(replying: Quoted): string[] {
  const text = replying.text ?? "";
  const body = text === "" ? [] : text.split("\n");
  const files = replying.attachments ?? [];
  if (files.length > 0) body.push(...files.map(renderAttachment));
  else {
    if (replying.transcript !== undefined && replying.transcript !== "") {
      body.push(`(voice note: ${flat(replying.transcript)})`);
    }
    if (replying.files !== undefined && replying.files.length > 0) {
      body.push(`(sent ${replying.files.join(", ")})`);
    }
  }
  return body.map((line) => (line === "" ? ">" : `> ${line}`));
}

const DAY_MS = 86_400_000;

/**
 * When a quoted message was said, from the reply's day: "today at 9:12 AM", "yesterday at …", a
 * weekday within the week, else the date, with the year when it was another.
 */
function saidWhen(at: string, reading: ReplyReading): string {
  const then = dayIn(new Date(at), reading.zone);
  const today = dayIn(reading.at === undefined ? new Date() : new Date(reading.at), reading.zone);
  const ago = Math.round((today.utc - then.utc) / DAY_MS);
  const day =
    ago <= 0
      ? "today"
      : ago === 1
        ? "yesterday"
        : ago < 7
          ? then.weekday
          : `${then.day} ${MONTHS[then.month - 1]}${then.year === today.year ? "" : ` ${then.year}`}`;
  return `${day} at ${then.clock}`;
}

/** An instant's calendar day and wall clock in a zone, the host's when the zone is not known. */
function dayIn(instant: Date, zone: string | undefined) {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-US", {
      ...(zone === undefined ? {} : { timeZone: zone }),
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
      weekday: "long",
    });
  } catch {
    return dayIn(instant, undefined);
  }
  const parts = format.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((each) => each.type === type)?.value ?? "";
  const [year, month, day] = [Number(part("year")), Number(part("month")), Number(part("day"))];
  const [hour, minute] = [Number(part("hour")) % 24, Number(part("minute"))];
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const clock = `${twelve}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
  return { utc: Date.UTC(year, month - 1, day), year, month, day, weekday: part("weekday"), clock };
}
