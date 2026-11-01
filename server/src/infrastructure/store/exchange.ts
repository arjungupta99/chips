/**
 * How the agents' talk in a room stands (ADR 0097), read from the log and the messages
 * projection: where the count starts — the newest thing a person did there, or the newest thing
 * an agent made — the messages agents sent agents since, and whether a person paused them. The
 * protocol's `exchangeFactsOf` turns this into the facts; nothing here decides a stage.
 *
 * Whether anybody has the room open is not known here: how far each person has read is kept by
 * their own device, and the server's `read_state` is never written. So it is `null`, which the
 * facts say means Chips cannot say.
 *
 * As of a seq, so a message delivered again is handed the same facts it was the first time.
 */

import {
  DEFAULT_EXCHANGE_LIMITS,
  type ExchangeLimits,
  type ExchangeMessage,
  type ExchangeReset,
  exchangeLimitsOf,
  messageIdOf,
  PERSON_ACTS,
  WORK_ACTS,
} from "@chipschat/protocol";
import { type Kysely, sql } from "kysely";
import type { ExchangeView, HeldMessageView } from "../../application/ports/index.js";
import type { Database } from "../db/schema.js";

/** How many of the newest messages the circle and the repeats are read from. */
const RECENT = 60;
/** How far back a reset by new work is looked for, in messages agents sent with files. */
const FILES_LOOKED_AT = 200;

const AGENT_KINDS = ["harness", "agent"] as const;

interface Act {
  readonly seq: number;
  readonly at: string;
  readonly by: string;
}

interface Posted {
  readonly id: string;
  readonly seq: number | null;
  readonly author_id: string;
  readonly text: string | null;
  readonly attachments: string | null;
  readonly created_at: string;
}

function filesOf(row: Posted): { filename: string; sha256: string }[] {
  if (row.attachments === null) return [];
  return (JSON.parse(row.attachments) as Record<string, unknown>[]).flatMap((each) =>
    typeof each["sha256"] === "string" && typeof each["filename"] === "string"
      ? [{ filename: each["filename"], sha256: each["sha256"] }]
      : [],
  );
}

/**
 * The newest thing a person did in the room that starts the count again, up to `upto`: where the
 * referee counts from (ADR 0097), and where a job begins (ADR 0117).
 */
export async function lastPersonAct(
  db: Kysely<Database>,
  workspaceId: string,
  spaceId: string,
  upto: number,
): Promise<Act | undefined> {
  const row = await db
    .selectFrom("events")
    .select(["seq", "ts", "actor_id"])
    .where("workspace_id", "=", workspaceId)
    .where("space_id", "=", spaceId)
    .where("seq", "<=", upto)
    .where("actor_kind", "=", "person")
    .where((eb) =>
      eb.or([
        eb("type", "in", [...PERSON_ACTS]),
        eb.and([
          eb("type", "=", "exchange.set"),
          eb(sql<string>`json_extract(payload, '$.state')`, "=", "going"),
        ]),
      ]),
    )
    .orderBy("seq", "desc")
    .limit(1)
    .executeTakeFirst();
  return row === undefined ? undefined : { seq: row.seq, at: row.ts, by: row.actor_id };
}

/**
 * The workspace's limits as of `upto` (ADR 0187): the newest `exchange.limits_set` at or before
 * it, read from the log as the rest of the stretch is, so a replay is handed the same facts; the
 * defaults where nobody has set any.
 */
export async function limitsAsOf(
  db: Kysely<Database>,
  workspaceId: string,
  upto: number,
): Promise<ExchangeLimits> {
  const row = await db
    .selectFrom("events")
    .select("payload")
    .where("workspace_id", "=", workspaceId)
    .where("space_id", "is", null)
    .where("seq", "<=", upto)
    .where("type", "=", "exchange.limits_set")
    .orderBy("seq", "desc")
    .limit(1)
    .executeTakeFirst();
  return row === undefined
    ? DEFAULT_EXCHANGE_LIMITS
    : exchangeLimitsOf(JSON.parse(row.payload) as Record<string, unknown>);
}

export function createExchangeReads(db: Kysely<Database>) {
  /** Whether one of these files was in the room before the message at `seq`. */
  async function seenBefore(
    workspaceId: string,
    spaceId: string,
    seq: number,
    shas: readonly string[],
  ): Promise<Set<string>> {
    if (shas.length === 0) return new Set();
    const rows = await db
      .selectFrom("attachments")
      .innerJoin("messages", (join) =>
        join
          .onRef("messages.id", "=", "attachments.message_id")
          .onRef("messages.workspace_id", "=", "attachments.workspace_id"),
      )
      .select("attachments.sha256")
      .where("attachments.workspace_id", "=", workspaceId)
      .where("attachments.space_id", "=", spaceId)
      .where("attachments.sha256", "in", [...shas])
      .where("messages.seq", "<", seq)
      .execute();
    return new Set(rows.map((row) => row.sha256));
  }

  /** The newest file an agent posted that was new to the room, after `after`. */
  async function lastNewFile(
    workspaceId: string,
    spaceId: string,
    after: number,
    upto: number,
  ): Promise<ExchangeReset | undefined> {
    const rows = await db
      .selectFrom("messages")
      .select(["id", "seq", "author_id", "text", "attachments", "created_at"])
      .where("workspace_id", "=", workspaceId)
      .where("space_id", "=", spaceId)
      .where("type", "=", "text")
      .where("author_kind", "in", [...AGENT_KINDS])
      .where("seq", ">", after)
      .where("seq", "<=", upto)
      .where("attachments", "is not", null)
      .where("attachments", "!=", "[]")
      .orderBy("seq", "desc")
      .limit(FILES_LOOKED_AT)
      .execute();
    for (const row of rows) {
      const files = filesOf(row);
      const seen = await seenBefore(
        workspaceId,
        spaceId,
        row.seq ?? 0,
        files.map((file) => file.sha256),
      );
      const fresh = files.find((file) => !seen.has(file.sha256));
      if (fresh !== undefined) {
        return {
          kind: "work",
          seq: row.seq ?? 0,
          at: row.created_at,
          by: row.author_id,
          made: "file",
          file: fresh.filename,
        };
      }
    }
    return undefined;
  }

  /** The newest question or approval an agent asked in the room, after `after`. */
  async function lastAsk(
    workspaceId: string,
    spaceId: string,
    after: number,
    upto: number,
  ): Promise<ExchangeReset | undefined> {
    const row = await db
      .selectFrom("events")
      .select(["seq", "ts", "actor_id", "type"])
      .where("workspace_id", "=", workspaceId)
      .where("space_id", "=", spaceId)
      .where("seq", ">", after)
      .where("seq", "<=", upto)
      .where("type", "in", [...WORK_ACTS])
      .where("actor_kind", "!=", "person")
      .orderBy("seq", "desc")
      .limit(1)
      .executeTakeFirst();
    if (row === undefined) return undefined;
    const made = row.type === "question.ask" ? "question" : "approval";
    return { kind: "work", seq: row.seq, at: row.ts, by: row.actor_id, made };
  }

  /** Where the count starts: the newest of a person's act and an agent's new work. */
  async function resetOf(
    workspaceId: string,
    spaceId: string,
    person: Act | undefined,
    upto: number,
  ): Promise<ExchangeReset> {
    const after = person?.seq ?? 0;
    const [file, ask] = await Promise.all([
      lastNewFile(workspaceId, spaceId, after, upto),
      lastAsk(workspaceId, spaceId, after, upto),
    ]);
    const work = [file, ask]
      .filter((each): each is ExchangeReset => each !== undefined)
      .sort((a, b) => b.seq - a.seq)[0];
    if (work !== undefined) return work;
    if (person !== undefined)
      return { kind: "person", seq: person.seq, at: person.at, by: person.by };
    return { kind: "start", seq: 0 };
  }

  /** What agents sent agents in the room after `after`: held, or for an agent. */
  function talk(workspaceId: string, spaceId: string, after: number, upto: number) {
    return db
      .selectFrom("messages")
      .where("workspace_id", "=", workspaceId)
      .where("space_id", "=", spaceId)
      .where("type", "=", "text")
      .where("author_kind", "in", [...AGENT_KINDS])
      .where("seq", ">", after)
      .where("seq", "<=", upto)
      .where((eb) =>
        eb.or([
          eb.and([eb("addressed_to", "is not", null), eb("addressed_to", "!=", "[]")]),
          eb("held", "=", 1),
        ]),
      );
  }

  async function recentTalk(
    workspaceId: string,
    spaceId: string,
    after: number,
    upto: number,
  ): Promise<ExchangeMessage[]> {
    const rows = await talk(workspaceId, spaceId, after, upto)
      .select(["id", "seq", "author_id", "text", "attachments", "created_at"])
      .orderBy("seq", "desc")
      .limit(RECENT)
      .execute();
    const messages = await Promise.all(
      rows.reverse().map(async (row) => {
        const files = filesOf(row);
        const seen = await seenBefore(
          workspaceId,
          spaceId,
          row.seq ?? 0,
          files.map((file) => file.sha256),
        );
        return {
          message_id: messageIdOf(row.id),
          by: row.author_id,
          text: row.text ?? "",
          filesSeen: files.filter((file) => seen.has(file.sha256)).map((file) => file.filename),
        };
      }),
    );
    return messages;
  }

  /** Whether a person paused the agents after the last thing a person did. */
  async function pausedSince(workspaceId: string, spaceId: string, after: number, upto: number) {
    const row = await db
      .selectFrom("events")
      .select("seq")
      .where("workspace_id", "=", workspaceId)
      .where("space_id", "=", spaceId)
      .where("seq", ">", after)
      .where("seq", "<=", upto)
      .where("type", "=", "exchange.set")
      .where(sql<string>`json_extract(payload, '$.state')`, "=", "paused")
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }

  return {
    async exchangeOf(
      workspaceId: string,
      spaceId: string,
      options: { readonly uptoSeq?: number } = {},
    ): Promise<ExchangeView> {
      const upto = options.uptoSeq ?? Number.MAX_SAFE_INTEGER;
      const person = await lastPersonAct(db, workspaceId, spaceId, upto);
      const since = await resetOf(workspaceId, spaceId, person, upto);
      const [counted, messages, paused, limits] = await Promise.all([
        talk(workspaceId, spaceId, since.seq, upto)
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .executeTakeFirst(),
        recentTalk(workspaceId, spaceId, since.seq, upto),
        pausedSince(workspaceId, spaceId, person?.seq ?? 0, upto),
        limitsAsOf(db, workspaceId, upto),
      ]);
      return {
        count: Number(counted?.count ?? 0),
        since,
        messages,
        paused,
        personLooking: null,
        ...(person === undefined ? {} : { person: person.by }),
        personSeq: person?.seq,
        limits,
      };
    },

    async heldIn(
      workspaceId: string,
      spaceId: string,
      afterSeq: number,
      beforeSeq: number,
    ): Promise<HeldMessageView[]> {
      const rows = await db
        .selectFrom("events")
        .select(["id", "seq", "actor_id", "actor_kind", "payload"])
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .where("type", "=", "message.post")
        .where("seq", ">", afterSeq)
        .where("seq", "<", beforeSeq)
        .where(sql<number>`json_extract(payload, '$.held')`, "=", 1)
        .orderBy("seq", "desc")
        .limit(200)
        .execute();
      return rows.map((row) => {
        const payload = JSON.parse(row.payload) as Record<string, unknown>;
        return {
          event_id: row.id,
          seq: row.seq,
          author_id: row.actor_id,
          author_kind: row.actor_kind,
          text: typeof payload["text"] === "string" ? payload["text"] : "",
          mentions: Array.isArray(payload["mentions"]) ? (payload["mentions"] as string[]) : [],
          ...(payload["to"] === undefined ? {} : { to: payload["to"] as string[] | "all" }),
        };
      });
    },
  };
}
