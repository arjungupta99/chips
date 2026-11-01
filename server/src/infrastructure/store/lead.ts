/**
 * What a room's lead is told, and when Chips hands it a turn (ADR 0104), read from the log and its
 * projections: who leads a room, the room's last words, the agents' turns there, and who joined;
 * and which turns going there hear what is said (ADR 0106).
 *
 * A lead is the agent `space.lead_set` named, for as long as it is a member of the room: one that
 * has left leads it no more, whatever the row says, so leaving writes nothing here.
 */

import { type Kysely, sql } from "kysely";
import type { JoinView, LedRoomView, PostView, TurnView } from "../../application/ports/index.js";
import { TERMINAL_RUN_STATES } from "../../domain/index.js";
import type { Database } from "../db/schema.js";

/** How many of a room's runs are read for its turns: plenty for the agents one room holds. */
const RUNS_READ = 200;
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
