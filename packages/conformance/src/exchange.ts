/**
 * The referee's reads (ADR 0097), as the fake plays them: the real server's `exchangeOf` and
 * `heldIn`, over the fake's log rather than its projections. Where the count starts — the newest
 * thing a person did in the room, or the newest thing an agent made — what agents sent agents
 * since, and a pause. As of a seq, so a replay is handed the same facts.
 */

import {
  DEFAULT_EXCHANGE_LIMITS,
  type ExchangeMessage,
  type ExchangeReset,
  type ExchangeStretch,
  exchangeLimitsOf,
  messageIdOf,
  resetsTheCount,
  WORK_ACTS,
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

/** How many of the newest messages the circle and the repeats are read from, as the server. */
const RECENT = 60;

/** The stretch, and the newest act of a person that started the count, if any. */
export interface FakeExchange extends ExchangeStretch {
  readonly personSeq: number | undefined;
}

const isAgent = (event: StoredEvent): boolean =>
  event.actor.kind === "harness" || event.actor.kind === "agent";

function filesOf(event: StoredEvent): { filename: string; sha256: string }[] {
  const files = event.payload["attachments"];
  return (Array.isArray(files) ? (files as Record<string, unknown>[]) : []).flatMap((each) =>
    typeof each["sha256"] === "string" && typeof each["filename"] === "string"
      ? [{ filename: each["filename"], sha256: each["sha256"] }]
      : [],
  );
}

/** What agents sent agents: a post of theirs for an agent, or held. */
function isTalk(event: StoredEvent): boolean {
  if (event.type !== "message.post" || !isAgent(event)) return false;
  const addressed = event.payload["addressed_to"];
  return (Array.isArray(addressed) && addressed.length > 0) || event.payload["held"] === true;
}

/** Whether this file's digest was in the room before `seq`. */
function seenBefore(room: readonly StoredEvent[], seq: number, sha256: string): boolean {
  return room.some(
    (event) =>
      event.seq < seq &&
      event.type === "message.post" &&
      filesOf(event).some((file) => file.sha256 === sha256),
  );
}

/** What an agent made with this event, if anything: a file new to the room, a question, an ask. */
function workOf(room: readonly StoredEvent[], event: StoredEvent): ExchangeReset | undefined {
  const at = { seq: event.seq, at: event.ts, by: event.actor.id };
  if (WORK_ACTS.has(event.type)) {
    return { kind: "work", ...at, made: event.type === "question.ask" ? "question" : "approval" };
  }
  if (event.type !== "message.post" || !isAgent(event)) return undefined;
  const fresh = filesOf(event).find((file) => !seenBefore(room, event.seq, file.sha256));
  return fresh === undefined
    ? undefined
    : { kind: "work", ...at, made: "file", file: fresh.filename };
}

/** The newest thing an agent made after `after`. */
function lastWork(room: readonly StoredEvent[], after: number): ExchangeReset | undefined {
  for (const event of [...room].reverse()) {
    if (event.seq <= after) break;
    const work = event.actor.kind === "person" ? undefined : workOf(room, event);
    if (work !== undefined) return work;
  }
  return undefined;
}

/** The workspace's limits as of `uptoSeq` (ADR 0187): the newest it set, or the defaults. */
function limitsInLog(log: readonly StoredEvent[], uptoSeq: number) {
  const set = log.findLast((event) => event.type === "exchange.limits_set" && event.seq <= uptoSeq);
  return set === undefined ? DEFAULT_EXCHANGE_LIMITS : exchangeLimitsOf(set.payload);
}

/** How the agents' talk in a room stands as of `uptoSeq`, from the log. */
export function exchangeInLog(
  log: readonly StoredEvent[],
  spaceId: string,
  uptoSeq = Number.MAX_SAFE_INTEGER,
): FakeExchange {
  const room = log.filter((event) => event.space_id === spaceId && event.seq <= uptoSeq);
  const person = room.findLast(
    (event) => event.actor.kind === "person" && resetsTheCount(event.type, event.payload),
  );
  const work = lastWork(room, person?.seq ?? 0);
  const since: ExchangeReset =
    work ??
    (person === undefined
      ? { kind: "start", seq: 0 }
      : { kind: "person", seq: person.seq, at: person.ts, by: person.actor.id });
  const talk = room.filter((event) => event.seq > since.seq && isTalk(event));
  const messages: ExchangeMessage[] = talk.slice(-RECENT).map((event) => ({
    message_id: messageIdOf(event.id),
    by: event.actor.id,
    text: typeof event.payload["text"] === "string" ? event.payload["text"] : "",
    filesSeen: filesOf(event)
      .filter((file) => seenBefore(room, event.seq, file.sha256))
      .map((file) => file.filename),
  }));
  const paused = room.some(
    (event) =>
      event.type === "exchange.set" &&
      event.seq > (person?.seq ?? 0) &&
      event.payload["state"] === "paused",
  );
  return {
    count: talk.length,
    since,
    messages,
    paused,
    // Nobody's reading is known here either: the fake keeps no read state.
    personLooking: null,
    ...(person === undefined ? {} : { person: person.actor.id }),
    personSeq: person?.seq,
    limits: limitsInLog(log, uptoSeq),
  };
}

/** The messages held in a room after `afterSeq` and before `beforeSeq`, newest first. */
export function heldInLog<E extends StoredEvent>(
  log: readonly E[],
  spaceId: string,
  afterSeq: number,
  beforeSeq: number,
): E[] {
  return log
    .filter(
      (event) =>
        event.space_id === spaceId &&
        event.type === "message.post" &&
        event.seq > afterSeq &&
        event.seq < beforeSeq &&
        event.payload["held"] === true,
    )
    .reverse();
}
