/**
 * What a harness's socket was sent, in a shape two Chipses can be compared by (agents review,
 * finding 37). Ids, clocks and sequence numbers are each Chips's own; what must be the same is
 * which events arrive, in which order, for whom, saying what. So an id becomes the order in which
 * its kind first appeared (`agt#1`, `spc#2`), a time becomes `<time>`, and what only numbers an
 * event is dropped.
 */

import { ID_PREFIXES } from "@chipschat/protocol";

type Json = Record<string, unknown>;

/** What numbers or dates an event, and says nothing of what happened. */
const DROPPED: ReadonlySet<string> = new Set([
  "v",
  "id",
  "seq",
  "ts",
  "workspace_id",
  "idempotency_key",
  "message_id",
  "event_id",
  "url",
  "url_expires_at",
  "since",
  "before",
  "since_seq",
  "before_seq",
]);

/** Fields that hold a time. */
const TIMES: ReadonlySet<string> = new Set([
  "joined_at",
  "held_since",
  "at",
  "said_at",
  "created_at",
  "last_activity_at",
  "asked_at",
]);

/** An id, wherever it stands: alone, or inside a key Chips made from one. */
const ID = new RegExp(
  `\\b(?:${Object.values(ID_PREFIXES).join("|")})_[0-9A-HJKMNP-TV-Z]{26}\\b`,
  "g",
);

export interface Transcript {
  /** One line per event, as compared. */
  readonly lines: string[];
  /** The alias an id was given, for a failure that has to say which room or agent. */
  readonly aliasOf: (id: string) => string;
}

/** An alias for each id, by the order in which its kind first appeared: `agt#1`, `spc#2`. */
function aliases(): (id: string) => string {
  const seen = new Map<string, string>();
  const counts = new Map<string, number>();
  return (id) => {
    const known = seen.get(id);
    if (known !== undefined) return known;
    const prefix = id.slice(0, id.indexOf("_"));
    const next = (counts.get(prefix) ?? 0) + 1;
    counts.set(prefix, next);
    const made = `${prefix}#${next}`;
    seen.set(id, made);
    return made;
  };
}

/** A value as it is compared: ids aliased, times blanked, what only numbers an event dropped. */
function comparable(value: unknown, key: string, alias: (id: string) => string): unknown {
  if (typeof value === "string") {
    return TIMES.has(key) ? "<time>" : value.replace(ID, (id) => alias(id));
  }
  if (Array.isArray(value)) return value.map((each) => comparable(each, key, alias));
  if (typeof value !== "object" || value === null) return value;
  const kept = Object.keys(value as Json).filter((name) => !DROPPED.has(name));
  // A record keyed by participant, as the room note's `notes` is, is keyed by alias.
  const entries = kept.map(
    (name) =>
      [
        name.replace(ID, (id) => alias(id)),
        comparable((value as Json)[name], name, alias),
      ] as const,
  );
  return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * The events as lines. `skip` leaves out the ones a scenario does not compare: the room each
 * world keeps for telling when the socket has caught up.
 */
export function transcriptOf(
  events: readonly Json[],
  skip: (event: Json) => boolean,
  notes: readonly { readonly label: string; readonly value: unknown }[] = [],
): Transcript {
  const alias = aliases();
  const plain = (value: unknown, key: string): unknown => comparable(value, key, alias);
  const lines = events
    .filter((event) => !skip(event))
    .map((event) => JSON.stringify(plain(event, "")));
  // What the harness was answered over HTTP, where a scenario noted it: after the events, so the
  // ids in it are the ones the events already named.
  const answers = notes.map((note) => `${note.label}: ${JSON.stringify(plain(note.value, ""))}`);
  return { lines: [...lines, ...answers], aliasOf: alias };
}
