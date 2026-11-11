/**
 * What a room's lead is told, and when Chips hands it a turn (ADR 0104), read from the log and its
 * projections: who leads a room, the room's last words, the agents' turns there, and who joined;
 * and which turns going there hear what is said (ADR 0106).
 *
 * A lead is the agent `space.lead_set` named, for as long as it is a member of the room: one that
 * has left leads it no more, whatever the row says, so leaving writes nothing here.
 */

import { type Kysely, sql } from "kysely";
import type {
  HandOffView,
  JoinView,
  LedRoomView,
  PickUpView,
  PostView,
  TurnView,
} from "../../application/ports/index.js";
import { TERMINAL_RUN_STATES } from "../../domain/index.js";
import type { Database } from "../db/schema.js";

/** How many of a room's runs are read for its turns: plenty for the agents one room holds. */
const RUNS_READ = 200;
/** How many messages agents sent agents are read for what nobody picked up: an hour's, amply. */
const HAND_OFFS_READ = 200;
/** How many of a going run's newest events are read for when it was last heard from, and its step. */
const EVENTS_READ = 40;

/** A JSON array of ids from a column, or none. */
function idsOf(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** A step's line, as the run timeline shows it: its summary, else its title, else its tool. */
function stepLine(payload: Record<string, unknown>): string | undefined {
  for (const key of ["summary", "title", "tool"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim() !== "") {
      const line = value.trim().split("\n")[0] ?? "";
      return line.length > 200 ? `${line.slice(0, 199)}…` : line;
    }
  }
  return undefined;
}

/** Whether a run in this state is still going. */
function isGoing(state: string): boolean {
  return !(TERMINAL_RUN_STATES as readonly string[]).includes(state);
}

export function createLeadReads(db: Kysely<Database>) {
  /** When anything was last heard from a run still going, and the last step it said it was on. */
  async function heardFrom(
    workspaceId: string,
    run: { readonly id: string; readonly started_at: string },
  ): Promise<{ readonly last_heard_at: string; readonly step?: string }> {
    const events = await db
      .selectFrom("events")
      .select(["type", "ts", "payload"])
      .where("workspace_id", "=", workspaceId)
      .where("run_id", "=", run.id)
      .orderBy("seq", "desc")
      .limit(EVENTS_READ)
      .execute();
    const step = events.find((event) => event.type === "step.log");
    const line =
      step === undefined
        ? undefined
        : stepLine(JSON.parse(step.payload) as Record<string, unknown>);
    return {
      last_heard_at: events[0]?.ts ?? run.started_at,
      ...(line === undefined ? {} : { step: line }),
    };
  }

  /** Whether an agent said something after a message, passed after it, or a turn of its heard it. */
  async function answeredSince(
    workspaceId: string,
    spaceId: string,
    agentId: string,
    message: { readonly message_id: string; readonly seq: number },
  ): Promise<boolean> {
    const said = await db
      .selectFrom("messages")
      .select("id")
      .where("workspace_id", "=", workspaceId)
      .where("space_id", "=", spaceId)
      .where("seq", ">", message.seq)
      .where("type", "=", "text")
      .where("author_id", "=", agentId)
      .limit(1)
      .executeTakeFirst();
    if (said !== undefined) return true;
    // It passed after it, or a turn of its heard it (ADRs 0105, 0106).
    const heard = await db
      .selectFrom("events")
      .select("seq")
      .where("workspace_id", "=", workspaceId)
      .where("space_id", "=", spaceId)
      .where("seq", ">", message.seq)
      .where("actor_id", "=", agentId)
      .where((eb) =>
        eb.or([
          eb("type", "=", "turn.passed"),
          eb.and([
            eb("type", "=", "message.heard"),
            eb(sql<string>`json_extract(payload, '$.message_id')`, "=", message.message_id),
          ]),
        ]),
      )
      .limit(1)
      .executeTakeFirst();
    return heard !== undefined;
  }

  /**
   * An agent's turn in a room that says what it did about a message said at `seq`: one still
   * going, else its newest that began after the message. Nothing when it has had none since.
   */
  async function turnSince(
    workspaceId: string,
    spaceId: string,
    agentId: string,
    seq: number,
  ): Promise<PickUpView["turn"]> {
    const run = await db
      .selectFrom("runs")
      .select(["id", "state", "started_at", "error"])
      .where("workspace_id", "=", workspaceId)
      .where("space_id", "=", spaceId)
      .where("agent_id", "=", agentId)
      .orderBy("started_at", "desc")
      .limit(1)
      .executeTakeFirst();
    if (run === undefined) return undefined;
    if (isGoing(run.state))
      return { going: true, failed: false, ...(await heardFrom(workspaceId, run)) };
    // Its newest turn ended: only one that began after the message was its turn on it.
    const began = await db
      .selectFrom("events")
      .select("seq")
      .where("workspace_id", "=", workspaceId)
      .where("run_id", "=", run.id)
      .orderBy("seq")
      .limit(1)
      .executeTakeFirst();
    if (began === undefined || began.seq <= seq) return undefined;
    return {
      going: false,
      failed: run.state === "failed",
      ...(run.error === null ? {} : { error: run.error }),
    };
  }

  return {
    async leadOf(workspaceId: string, spaceId: string): Promise<string | undefined> {
      const row = await db
        .selectFrom("spaces")
        .innerJoin("memberships", (join) =>
          join
            .onRef("memberships.space_id", "=", "spaces.id")
            .onRef("memberships.participant_id", "=", "spaces.lead_id")
            .onRef("memberships.workspace_id", "=", "spaces.workspace_id"),
        )
        .select("spaces.lead_id as lead_id")
        .where("spaces.workspace_id", "=", workspaceId)
        .where("spaces.id", "=", spaceId)
        .executeTakeFirst();
      return row?.lead_id ?? undefined;
    },

    async ledRooms(): Promise<LedRoomView[]> {
      const rows = await db
        .selectFrom("spaces")
        .innerJoin("memberships", (join) =>
          join
            .onRef("memberships.space_id", "=", "spaces.id")
            .onRef("memberships.participant_id", "=", "spaces.lead_id")
            .onRef("memberships.workspace_id", "=", "spaces.workspace_id"),
        )
        .select([
          "spaces.workspace_id as workspace_id",
          "spaces.id as space_id",
          "spaces.lead_id as lead_id",
        ])
        .where("spaces.state", "=", "open")
        .where("spaces.lead_id", "is not", null)
        .execute();
      return rows.flatMap((row) =>
        row.lead_id === null
          ? []
          : [{ workspace_id: row.workspace_id, space_id: row.space_id, lead_id: row.lead_id }],
      );
    },

    async lastPost(
      workspaceId: string,
      spaceId: string,
      options?: { readonly beforeSeq?: number; readonly byPerson?: boolean },
    ): Promise<PostView | undefined> {
      let query = db
        .selectFrom("messages")
        .select([
          "id",
          "seq",
          "created_at",
          "author_id",
          "author_kind",
          "addressed_to",
          "addressed_to_all",
          "held",
        ])
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .where("type", "=", "text")
        .where("deleted_at", "is", null)
        .where("seq", "is not", null);
      if (options?.beforeSeq !== undefined) query = query.where("seq", "<", options.beforeSeq);
      if (options?.byPerson === true) query = query.where("author_kind", "=", "person");
      const row = await query.orderBy("seq", "desc").limit(1).executeTakeFirst();
      if (row === undefined || row.seq === null) return undefined;
      const event = await db
        .selectFrom("events")
        .select(sql<string | null>`json_extract(payload, '$.mentions')`.as("mentions"))
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", row.id)
        .executeTakeFirst();
      return {
        event_id: row.id,
        seq: row.seq,
        ts: row.created_at,
        author_id: row.author_id,
        author_kind: row.author_kind,
        addressed_to: idsOf(row.addressed_to),
        addressed_to_all: row.addressed_to_all === 1,
        held: row.held === 1,
        mentions: idsOf(event?.mentions ?? null),
      };
    },

    async turnsIn(workspaceId: string, spaceId: string): Promise<TurnView[]> {
      const runs = await db
        .selectFrom("runs")
        .select(["id", "agent_id", "state", "started_at", "ended_at"])
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .where("agent_id", "is not", null)
        .orderBy("started_at", "desc")
        .limit(RUNS_READ)
        .execute();
      const ended = new Set<string>();
      const turns: TurnView[] = [];
      for (const run of runs) {
        const agentId = run.agent_id;
        if (agentId === null) continue;
        const turn = { run_id: run.id, agent_id: agentId, started_at: run.started_at };
        if (isGoing(run.state)) {
          turns.push({
            ...turn,
            going: true,
            ended_at: null,
            ...(await heardFrom(workspaceId, run)),
          });
        } else if (!ended.has(agentId)) {
          // Each agent's last turn that ended; the older ones say nothing more.
          ended.add(agentId);
          turns.push({ ...turn, going: false, ended_at: run.ended_at });
        }
      }
      return turns;
    },

    async turnsGoing(
      workspaceId: string,
      spaceId: string,
      agentIds: readonly string[],
    ): Promise<{ run_id: string; agent_id: string; last_heard_at: string }[]> {
      if (agentIds.length === 0) return [];
      const runs = await db
        .selectFrom("runs")
        .select(["id", "agent_id", "started_at"])
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .where("agent_id", "in", [...agentIds])
        .where("state", "not in", [...TERMINAL_RUN_STATES])
        .execute();
      const going: { run_id: string; agent_id: string; last_heard_at: string }[] = [];
      for (const run of runs) {
        if (run.agent_id === null) continue;
        const { last_heard_at } = await heardFrom(workspaceId, run);
        going.push({ run_id: run.id, agent_id: run.agent_id, last_heard_at });
      }
      return going;
    },

    async handOffsSince(sinceIso: string): Promise<HandOffView[]> {
      const rows = await db
        .selectFrom("messages")
        .innerJoin("spaces", (join) =>
          join
            .onRef("spaces.id", "=", "messages.space_id")
            .onRef("spaces.workspace_id", "=", "messages.workspace_id"),
        )
        .select([
          "messages.workspace_id as workspace_id",
          "messages.space_id as space_id",
          "messages.id as id",
          "messages.seq as seq",
          "messages.created_at as created_at",
          "messages.author_id as author_id",
          "messages.addressed_to as addressed_to",
        ])
        // The rooms first, by what happened in them lately; then each room's own messages.
        .where("spaces.state", "=", "open")
        .where("spaces.last_activity_at", ">=", sinceIso)
        .where("messages.created_at", ">=", sinceIso)
        .where("messages.type", "=", "text")
        .where("messages.deleted_at", "is", null)
        .where("messages.seq", "is not", null)
        .where("messages.author_kind", "in", ["harness", "agent"])
        .where("messages.addressed_to", "is not", null)
        .where("messages.addressed_to", "!=", "[]")
        .where((eb) => eb.or([eb("messages.held", "is", null), eb("messages.held", "=", 0)]))
        .orderBy("messages.seq", "desc")
        .limit(HAND_OFFS_READ)
        .execute();
      return rows.flatMap((row) =>
        row.space_id === null || row.seq === null
          ? []
          : [
              {
                workspace_id: row.workspace_id,
                space_id: row.space_id,
                event_id: row.id,
                seq: row.seq,
                ts: row.created_at,
                author_id: row.author_id,
                addressed_to: idsOf(row.addressed_to),
              },
            ],
      );
    },

    async pickUpOf(
      workspaceId: string,
      spaceId: string,
      agentId: string,
      message: { readonly message_id: string; readonly seq: number },
    ): Promise<PickUpView> {
      if (await answeredSince(workspaceId, spaceId, agentId, message)) return { answered: true };
      const turn = await turnSince(workspaceId, spaceId, agentId, message.seq);
      return { answered: false, ...(turn === undefined ? {} : { turn }) };
    },

    async handedOnSince(
      workspaceId: string,
      spaceId: string,
      afterSeq: number,
    ): Promise<
      { readonly seq: number; readonly message_id: string; readonly unanswered_by: string }[]
    > {
      const rows = await db
        .selectFrom("events")
        .select([
          "seq",
          sql<string | null>`json_extract(payload, '$.message_id')`.as("message_id"),
          sql<string | null>`json_extract(payload, '$.unanswered_by')`.as("unanswered_by"),
        ])
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .where("seq", ">", afterSeq)
        .where("type", "=", "message.handed")
        .execute();
      return rows.flatMap((row) =>
        row.message_id === null || row.unanswered_by === null
          ? []
          : [{ seq: row.seq, message_id: row.message_id, unanswered_by: row.unanswered_by }],
      );
    },

    async lastLeadChoice(
      workspaceId: string,
      spaceId: string,
    ): Promise<{ readonly agent_id: string | null; readonly by_person: boolean } | undefined> {
      const row = await db
        .selectFrom("events")
        .select([
          "actor_kind",
          sql<string | null>`json_extract(payload, '$.agent_id')`.as("agent_id"),
        ])
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .where("type", "=", "space.lead_set")
        .orderBy("seq", "desc")
        .limit(1)
        .executeTakeFirst();
      return row === undefined
        ? undefined
        : { agent_id: row.agent_id, by_person: row.actor_kind === "person" };
    },

    async ranSince(
      workspaceId: string,
      spaceId: string,
      agentIds: readonly string[],
      sinceIso: string,
    ): Promise<boolean> {
      if (agentIds.length === 0) return false;
      const row = await db
        .selectFrom("runs")
        .select("id")
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .where("agent_id", "in", [...agentIds])
        .where("started_at", ">=", sinceIso)
        .limit(1)
        .executeTakeFirst();
      return row !== undefined;
    },

    async joinsIn(
      workspaceId: string,
      spaceId: string,
      afterSeq: number,
      beforeSeq: number,
    ): Promise<JoinView[]> {
      const rows = await db
        .selectFrom("events")
        .select([
          "seq",
          "ts",
          "actor_id",
          "actor_kind",
          sql<string>`json_extract(payload, '$.participant_id')`.as("participant_id"),
        ])
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .where("type", "=", "membership.added")
        .where("seq", ">", afterSeq)
        .where("seq", "<", beforeSeq)
        .orderBy("seq")
        .limit(200)
        .execute();
      return rows.map((row) => ({
        participant_id: row.participant_id,
        seq: row.seq,
        ts: row.ts,
        by: row.actor_id,
        by_kind: row.actor_kind,
      }));
    },
  };
}
