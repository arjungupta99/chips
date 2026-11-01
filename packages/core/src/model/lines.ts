/** The line a message-shaped event becomes, and where it sits in its space. */

import { eventIdOfMessage } from "@chipschat/protocol";
import { attachmentFromWire } from "../attachments.js";
import { actorKind, type ClientEvent } from "../events.js";
import { field, type MutableRun, type MutableSpace, required } from "./state.js";
import type { AuditEntry, Line } from "./types.js";

/**
 * A summary that repeats one of the run's own messages word for word, or its beginning cut short
 * (`repeats`), becomes that message's card — the bubble it already has, with the receipt beneath
 * it — rather than the same sentence twice. The Ledger sample and Jacobian both say their answer and then summarise it (Phase 3
 * review, finding 9). It was the run's *last* message alone until 15 September 2026, when
 * Jacobian said its status, sent a file with a caption, asked a question and completed with the
 * status again, and the Chess Game room read the status twice (Arjun): so the fold reaches back
 * over what the run said, newest first, as far as `LOOK_BACK`, since a summary repeats something
 * recent. True when a line was folded that way; false leaves the summary to be added. The folded
 * line is marked, so a client that would rather draw a reply as a reply can tell it from a
 * summary that stood alone.
 */
export function closeOnLastSaid(
  space: MutableSpace | undefined,
  run: MutableRun,
  event: ClientEvent,
  summary: string,
): boolean {
  if (space === undefined) return false;
  const wanted = summary.trim();
  const oldest = Math.max(0, run.saidIds.length - LOOK_BACK);
  for (let back = run.saidIds.length - 1; back >= oldest; back -= 1) {
    const index = lastIndexOfLine(space.lines, run.saidIds[back] as string);
    const line = space.lines[index];
    if (line === undefined || line.kind !== "text") continue;
    if (!repeats(line.text.trim(), wanted) && !namesItsFiles(line, wanted)) continue;
    space.lines[index] = { ...line, kind: "summary", runId: event.run_id, folded: true };
    return true;
  }
  return false;
}

/**
 * Whether a summary says again what was said: word for word, or as its beginning cut short with an
 * ellipsis. The OpenCode, Hermes and ACP bridges cut a long answer's summary to 2,000 characters
 * and an ellipsis, so the room read a long answer twice, the second time stopping before its
 * tables (the OpenCode room, 17 October 2026).
 */
function repeats(said: string, summary: string): boolean {
  if (said === summary) return true;
  const cut = summary.endsWith("…")
    ? summary.slice(0, -1)
    : summary.endsWith("...")
      ? summary.slice(0, -3)
      : undefined;
  const start = cut?.trimEnd();
  return (
    start !== undefined && start !== "" && said.length > start.length && said.startsWith(start)
  );
}

/**
 * Whether a summary only names the files of a message that is nothing but files: "Sent welcome.html."
 * is what the bridges summarise such an answer with (the SDK's `sendAnswer`, OpenClaw's), and the
 * room read the file and then the sentence, as two answers (the setup audit, 17 October 2026, M2).
 */
function namesItsFiles(line: Line, summary: string): boolean {
  const files = line.attachments ?? [];
  if (line.text.trim() !== "" || files.length === 0) return false;
  return summary === `Sent ${files.map((file) => file.filename).join(", ")}.`;
}

/** How many of the run's own messages a summary is checked against, newest first. */
const LOOK_BACK = 12;

/** The index of the line with this id, searched from the newest, or -1. */
export function lastIndexOfLine(lines: readonly Line[], id: string): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index]?.id === id) return index;
  }
  return -1;
}

/**
 * A line into its space, in `seq` order. The common path is an append — events arrive
 * ascending — and the search is there for the replay that does not, so a frozen space
 * can hand out its lines without sorting them again.
 */
export function addLine(space: MutableSpace | undefined, line: Line): void {
  if (space === undefined) return;
  const lines = space.lines;
  const last = lines.at(-1);
  if (last === undefined || last.seq <= line.seq) lines.push(line);
  else lines.splice(placeOf(lines, line.seq), 0, line);
  if (line.kind === "checkpoint") space.checkpoints.push(line);
}

/** The index where a line of this `seq` belongs, so equal seqs keep their arrival order. */
export function placeOf(lines: readonly Line[], seq: number): number {
  let low = 0;
  let high = lines.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((lines[middle] as Line).seq <= seq) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** A message-shaped line from an event: who, when, what, and the key a receipt would name. */
export function textLine(event: ClientEvent, text: string): Line {
  const key = event["idempotency_key"];
  const wire = field<Parameters<typeof attachmentFromWire>[0][]>(event, "attachments");
  const attachments = wire === undefined ? undefined : wire.map(attachmentFromWire);
  const mentions = field<string[]>(event, "mentions");
  const sessionRef = field<string>(event, "session_ref");
  const replyTo = field<string>(event, "reply_to");
  return {
    id: event.id,
    seq: event.seq,
    kind: "text",
    authorId: event.actor.id,
    authorKind: actorKind(event.actor),
    text,
    ts: event.ts,
    ...(event.run_id === undefined ? {} : { sourceRunId: event.run_id }),
    ...(typeof key === "string" ? { key } : {}),
    ...(sessionRef === undefined ? {} : { sessionRef }),
    ...(replyTo === undefined ? {} : { replyTo: eventIdOfMessage(replyTo) }),
    ...(attachments === undefined || attachments.length === 0 ? {} : { attachments }),
    ...(mentions === undefined || mentions.length === 0 ? {} : { mentions }),
    ...addressOfEvent(event),
    ...(field<boolean>(event, "held") === true ? { held: true as const } : {}),
    ...(field<boolean>(event, "heartbeat") === true ? { heartbeat: true as const } : {}),
  };
}

/** Who Chips said a message is for (ADR 0081): its agents, all of them or not, and its people (ADR 0204). */
function addressOfEvent(
  event: ClientEvent,
): Pick<Line, "addressedTo" | "addressedToAll" | "addressedPeople"> {
  const addressedTo = field<string[]>(event, "addressed_to");
  const addressedPeople = field<string[]>(event, "addressed_people");
  return {
    ...(addressedTo === undefined ? {} : { addressedTo }),
    ...(field<boolean>(event, "addressed_to_all") === true
      ? { addressedToAll: true as const }
      : {}),
    ...(addressedPeople === undefined || addressedPeople.length === 0 ? {} : { addressedPeople }),
  };
}

/**
 * The line with a reaction or a note added. One reaction per person per emoji, and the same
 * emoji from the same person again takes it back (M5.4): a tap is a toggle, so a thumb given by
 * mistake is not there for good.
 */
export function withFeedback(line: Line, event: ClientEvent, by: string): Line {
  if (field<string>(event, "kind") === "reaction") {
    const reaction = required<string>(event, "reaction");
    const had = line.reactions ?? [];
    const same = had.find((each) => each.by === by && each.reaction === reaction);
    // The same event again — a re-delivery — is not a second tap.
    if (same?.seq === event.seq) return line;
    if (same !== undefined) return { ...line, reactions: had.filter((each) => each !== same) };
    return { ...line, reactions: [...had, { by, reaction, seq: event.seq }] };
  }
  const note = { by, text: required<string>(event, "text"), ts: event.ts, seq: event.seq };
  return { ...line, corrections: [...(line.corrections ?? []), note] };
}

/** Where the line an event names sits in its space, or -1 when it is not there. */
export function lineIndexOf(space: MutableSpace | undefined, event: ClientEvent): number {
  if (space === undefined) return -1;
  const lineId = eventIdOfMessage(required<string>(event, "message_id"));
  return space.lines.findIndex((line) => line.id === lineId);
}

export function messageAudit(event: ClientEvent, what: string): AuditEntry {
  return {
    seq: event.seq,
    ts: event.ts,
    kind: "message",
    who: event.actor.id,
    what,
    spaceId: event.space_id,
    reason: field<string>(event, "reason"),
  };
}
