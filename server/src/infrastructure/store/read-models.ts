/**
 * The Kysely adapter for the read-model port. Each method is one query against one projection,
 * scoped to a workspace (technical-plan 6.2) — never a join assembled at request time.
 */

import {
  type Attachment,
  type AttachmentCaps,
  type ContextEvent,
  eventIdOfMessage,
  messageIdOf,
  NO_CAPS,
  type PolicyRule,
  parseSpaceIcon,
  type SpaceIcon,
} from "@chipschat/protocol";
import { type ExpressionBuilder, type Kysely, type RawBuilder, type Selectable, sql } from "kysely";
import type {
  AgentAsk,
  AgentStay,
  AgentView,
  ApprovalView,
  AskedSpaceView,
  ExpiredApproval,
  ForkAsk,
  HarnessPolicyView,
  HeldName,
  HeldView,
  LaneView,
  MemberView,
  MessageView,
  OpenedSpaceView,
  ParticipantView,
  PersonView,
  QuestionView,
  ReadModels,
  RunView,
  SearchHit,
  SearchPage,
  SearchQuery,
  SpaceView,
  TimedOutQuestion,
  WorkspacePolicyView,
  WorkspaceView,
} from "../../application/ports/index.js";
import { SNIPPET_CLOSE, SNIPPET_OPEN } from "../../application/ports/index.js";
import {
  type PriceTable,
  parsePriceTable,
  TERMINAL_RUN_STATES,
  type TrailEntry,
  unscopedKey,
  type WorkspaceRole,
} from "../../domain/index.js";
import type {
  Database,
  HarnessPolicyTable,
  LanesTable,
  QuestionsTable,
  RunsTable,
} from "../db/schema.js";
import { endedAtArchive, everyoneFor, holders, selvesIn, staysOf } from "./agent-stays.js";
import { createExchangeReads } from "./exchange.js";
import { createLeadReads } from "./lead.js";
import { attachmentFact, madeFromIn, postedFilesIn } from "./room-files.js";
import { drainSearchIndex } from "./search-index.js";
import { createSpendReads } from "./spend.js";

function toPolicyView(row: HarnessPolicyTable): HarnessPolicyView {
  return {
    harness_id: row.harness_id,
    space_id: row.space_id,
    autonomy: row.autonomy,
    rules: JSON.parse(row.rules) as PolicyRule[],
    budget_usd: row.budget_usd,
    spent_usd: row.spent_usd,
    updated_seq: row.updated_seq,
  };
}

function toQuestionView(row: QuestionsTable): QuestionView {
  return {
    ask_id: row.id,
    run_id: row.run_id,
    space_id: row.space_id,
    state: row.state === "answered" ? "answered" : "pending",
    answered_by: row.answered_by,
    timeout_at: row.timeout_at,
    on_no_answer: row.on_no_answer,
    questions: JSON.parse(row.questions) as QuestionView["questions"],
  };
}

function toLaneView(row: LanesTable): LaneView {
  return {
    lane_id: row.id,
    run_id: row.run_id,
    lead_id: row.lead_id,
    specialist_id: row.specialist_id,
    on_behalf_of: row.on_behalf_of,
    lead_run_id: row.lead_run_id,
    home_space_id: row.home_space_id,
    linked_space_ids:
      row.linked_space_ids === null ? [] : (JSON.parse(row.linked_space_ids) as string[]),
    origin_message_id: row.origin_message_id,
    goal: row.goal,
    state: row.state,
    delivery: row.delivery,
    depth: row.depth,
    trail: row.trail === null ? [] : (JSON.parse(row.trail) as TrailEntry[]),
    summary: row.summary,
    cost_usd: row.cost_usd,
  };
}

/** A participant with the role a person holds in the workspace, or none for a harness. */
function toParticipantView(row: {
  readonly id: string;
  readonly kind: "person" | "harness" | "agent";
  readonly display_name: string;
  readonly owner_id: string | null;
  readonly role: WorkspaceRole | null;
  readonly capabilities: string | null;
  readonly removed_at: string | null;
  readonly last_seen_at: string | null;
  readonly harness_id: string | null;
  readonly agent_key: string | null;
  readonly lead: number;
  readonly agent_state: string | null;
  readonly released_from: string | null;
  readonly last_space_id: string | null;
  readonly room: string | null;
  readonly held: number | null;
  readonly forked_from: string | null;
  readonly face: string | null;
  readonly locked: number;
  readonly guest_of: string | null;
}): ParticipantView {
  return {
    id: row.id,
    kind: row.kind,
    display_name: row.display_name,
    owner_id: row.owner_id,
    role: row.kind === "person" ? row.role : null,
    capabilities: row.kind === "harness" ? declared(row.capabilities) : null,
    removed_at: row.removed_at,
    last_seen_at: row.kind === "harness" ? row.last_seen_at : null,
    ...(row.kind === "agent" && row.harness_id !== null
      ? {
          harness_id: row.harness_id,
          key: row.agent_key ?? "",
          lead: row.lead === 1,
          state: row.agent_state === "archived" ? ("archived" as const) : ("active" as const),
          released_from: row.released_from,
          last_space_id: row.last_space_id,
          room: row.room,
          held: Number(row.held ?? 0),
          forked_from: row.forked_from,
          face: faceOf(row.face),
          locked: row.locked === 1,
        }
      : {}),
    // A person's own face (ADR 0139), as an agent's is above.
    ...(row.kind === "person" ? { face: faceOf(row.face) } : {}),
    // A guest's one space (ADR 0034), so nobody is offered a guest a second room would refuse.
    ...(row.kind === "person" && row.role === "guest" ? { guest_of: row.guest_of } : {}),
  };
}

/**
 * The columns a participant is read with. An agent's owner and whether it was removed are its
 * harness's (ADR 0087), read through the join every such query makes as `harness`.
 */
const PARTICIPANT_COLUMNS = [
  "participants.id as id",
  "participants.kind as kind",
  "participants.display_name as display_name",
  sql<string | null>`coalesce(participants.owner_id, harness.owner_id)`.as("owner_id"),
  "participants.capabilities as capabilities",
  sql<string | null>`coalesce(participants.removed_at, harness.removed_at)`.as("removed_at"),
  "participants.harness_id as harness_id",
  "participants.agent_key as agent_key",
  "participants.lead as lead",
  "participants.agent_state as agent_state",
  "participants.released_from as released_from",
  "participants.last_space_id as last_space_id",
  "participants.forked_from as forked_from",
  "participants.face as face",
  "participants.locked as locked",
  // For an agent, the open room it is in (ADR 0087): one at most.
  sql<
    string | null
  >`(select m.space_id from memberships m join spaces s on s.id = m.space_id where m.workspace_id = participants.workspace_id and m.participant_id = participants.id and s.state = 'open' and s.parent_space_id is null limit 1)`.as(
    "room",
  ),
  // For an agent, how many of its words wait for its next room (ADR 0087, rule 6).
  sql<number>`(select count(*) from held_messages h where h.workspace_id = participants.workspace_id and h.agent_id = participants.id)`.as(
    "held",
  ),
  "workspace_members.role as role",
  // For a guest (ADR 0034), the open room they are in, as the door counts them (JR-24).
  sql<
    string | null
  >`case when workspace_members.role = 'guest' then (select m.space_id from memberships m join spaces s on s.id = m.space_id where m.workspace_id = participants.workspace_id and m.participant_id = participants.id and s.state = 'open' and s.parent_space_id is null order by m.joined_at limit 1) end`.as(
    "guest_of",
  ),
] as const;

/**
 * When any of a participant's harness tokens was last used, withdrawn ones included: whether a
 * harness has ever connected (the OpenClaw test, finding 18). A person holds none, so nothing.
 */
function lastSeenAt(eb: ExpressionBuilder<Database, "participants">) {
  return eb
    .selectFrom("harness_tokens")
    .select(({ fn }) => fn.max("harness_tokens.last_used_at").as("last_used_at"))
    .whereRef("harness_tokens.workspace_id", "=", "participants.workspace_id")
    .whereRef("harness_tokens.harness_id", "=", "participants.id")
    .as("last_seen_at");
}

/**
 * As many files as `lane.updated` may carry (the protocol's cap). A run that said more than
 * twenty hands back the first twenty, which is the answer's own order.
 */
const MOST_FILES = 20;

/** A message's attachments column: the JSON list the post carried, or nothing worth reading. */
function carried(column: string | null): Attachment[] {
  if (column === null) return [];
  try {
    const parsed: unknown = JSON.parse(column);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (each): each is Attachment =>
        typeof each === "object" && each !== null && typeof each["attachment_id"] === "string",
    );
  } catch {
    return [];
  }
}

/** A face column (ADR 0089, ADR 0139): the mark or letters and ground chosen, or nothing. */
function faceOf(column: string | null): SpaceIcon | null {
  if (column === null) return null;
  try {
    const parsed = parseSpaceIcon(JSON.parse(column));
    return parsed.ok ? parsed.value : null;
  } catch {
    return null;
  }
}

/** The capabilities column, as written by the registry: a JSON list of strings, or nothing. */
function declared(column: string | null): readonly string[] | null {
  if (column === null) return null;
  try {
    const parsed: unknown = JSON.parse(column);
    return Array.isArray(parsed)
      ? parsed.filter((each): each is string => typeof each === "string")
      : null;
  } catch {
    return null;
  }
}

/** A JSON list of ids, as a projection writes one, or none. */
function parsedIds(column: string | null): readonly string[] {
  return declared(column) ?? [];
}

/** The events in a space that are lines of it (ADR 0088); a member's new name is read apart. */
const ROOM_LINE_TYPES = ["message.post", "membership.added", "membership.removed", "space.updated"];

const LINE_COLUMNS = [
  "events.seq",
  "events.id",
  "events.type",
  "events.ts",
  "events.actor_kind",
  "events.actor_id",
  "events.payload",
] as const;

/** A line's event as the protocol's renderer reads it, a message with its words as they are now. */
function toContextEvent(row: {
  readonly seq: number;
  readonly id: string;
  readonly type: string;
  readonly ts: string;
  readonly actor_kind: string;
  readonly actor_id: string;
  readonly payload: string;
  readonly now: string | null;
}): ContextEvent {
  const payload = JSON.parse(row.payload) as Record<string, unknown>;
  return {
    seq: row.seq,
    id: row.id,
    type: row.type,
    ts: row.ts,
    actor: { kind: row.actor_kind, id: row.actor_id },
    payload: row.type === "message.post" ? { ...payload, text: row.now ?? "" } : payload,
  };
}

function toRunView(row: Selectable<RunsTable>): RunView {
  return {
    run_id: row.id,
    space_id: row.space_id,
    harness_id: row.harness_id,
    agent_id: row.agent_id ?? null,
    goal: row.goal,
    state: row.state,
    status_verb: row.status_verb,
    summary: row.summary,
    cost_usd: row.cost_usd,
    context_used: row.context_used,
    context_limit: row.context_limit,
    started_at: row.started_at,
    ended_at: row.ended_at,
  };
}

/** A membership row and the participant it names, as `membersOf` reads them. */
function toMemberView(row: {
  readonly participant_id: string;
  readonly kind: MemberView["kind"];
  readonly harness_id: string | null;
  readonly display_name: string;
  readonly role: MemberView["role"];
  readonly owner_id: string | null;
  readonly workspace_role: MemberView["workspace_role"];
  readonly removed_at: string | null;
  readonly agent_name: string | null;
}): MemberView {
  const person = row.kind === "person";
  return {
    participant_id: row.participant_id,
    kind: row.kind,
    harness_id: row.kind === "agent" ? row.harness_id : null,
    display_name: row.display_name,
    role: row.role,
    owner_id: row.owner_id,
    workspace_role: person ? (row.workspace_role ?? "member") : null,
    ...(row.removed_at === null ? {} : { removed: true }),
    // A harness waiting in a room asked of it goes by the name held for its agent (ADR 0150).
    ...(row.kind === "harness" && row.agent_name !== null ? { held_name: row.agent_name } : {}),
  };
}

export function createReadModels(db: Kysely<Database>): ReadModels {
  /**
   * Who stands for a participant in rooms: itself, and a harness's agents (ADR 0087), whose rooms
   * are its rooms on its one connection.
   */
  function selvesOf(workspaceId: string, participantId: string) {
    return db
      .selectFrom("participants")
      .select("id")
      .where("workspace_id", "=", workspaceId)
      .where((eb) => eb.or([eb("id", "=", participantId), eb("harness_id", "=", participantId)]));
  }

  /**
   * How many messages of an agent's history one stay holds (ADR 0087, rule 3.11): what it said,
   * what was addressed to it, and what people said to the room before Chips said who a message
   * is for (ADR 0081), when it was the room's. A reply and its run's summary are one; a room's
   * own notices are none. `selves` is who stands for the agent in that room.
   */
  async function linesOfStay(
    workspaceId: string,
    spaceId: string,
    selves: ReadonlySet<string>,
    fromSeq: number,
    toSeq: number | undefined,
  ): Promise<number> {
    let query = db
      .selectFrom("messages")
      .select(["type", "author_kind", "author_id", "addressed_to", "run_id"])
      .where("workspace_id", "=", workspaceId)
      .where("space_id", "=", spaceId)
      .where("deleted_at", "is", null)
      .where("type", "!=", "system")
      .where("seq", ">=", fromSeq);
    if (toSeq !== undefined) query = query.where("seq", "<=", toSeq);
    const rows = await query.execute();
    const answered = new Set(
      rows
        .filter((row) => row.type === "text" && selves.has(row.author_id) && row.run_id !== null)
        .map((row) => row.run_id),
    );
    return rows.filter((row) => {
      if (selves.has(row.author_id)) {
        return !(row.type === "summary" && row.run_id !== null && answered.has(row.run_id));
      }
      if (row.addressed_to !== null) {
        const to = JSON.parse(row.addressed_to) as unknown;
        return Array.isArray(to) && to.some((id) => selves.has(String(id)));
      }
      return row.author_kind === "person";
    }).length;
  }

  /** Agents with their rooms, in the order the rows came. */
  async function withSpaces(
    workspaceId: string,
    rows: readonly {
      readonly id: string;
      readonly harness_id: string | null;
      readonly agent_key: string | null;
      readonly display_name: string;
      readonly lead: number;
      readonly agent_state: string | null;
      readonly released_from: string | null;
      readonly forked_from: string | null;
      readonly name_by: string | null;
    }[],
  ): Promise<AgentView[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const memberships = await db
      .selectFrom("memberships")
      .innerJoin("spaces", "spaces.id", "memberships.space_id")
      .select([
        "memberships.participant_id as participant_id",
        "memberships.space_id as space_id",
        "spaces.state as state",
      ])
      .where("memberships.workspace_id", "=", workspaceId)
      .where("memberships.participant_id", "in", ids)
      .orderBy("memberships.joined_at")
      .orderBy("memberships.space_id")
      .execute();
    const held = await db
      .selectFrom("held_messages")
      .select(["agent_id", ({ fn }) => fn.countAll<number>().as("count")])
      .where("workspace_id", "=", workspaceId)
      .where("agent_id", "in", ids)
      .groupBy("agent_id")
      .execute();
    return rows.map((row) => {
      const its = memberships.filter((membership) => membership.participant_id === row.id);
      return {
        agent_id: row.id,
        harness_id: row.harness_id ?? "",
        key: row.agent_key ?? "",
        name: row.display_name,
        lead: row.lead === 1,
        state: row.agent_state === "archived" ? "archived" : "active",
        spaces: its.map((membership) => membership.space_id),
        room: its.find((membership) => membership.state === "open")?.space_id ?? null,
        released_from: row.released_from,
        held: Number(held.find((each) => each.agent_id === row.id)?.count ?? 0),
        forked_from: row.forked_from,
        name_by: row.name_by,
      };
    });
  }

  const AGENT_COLUMNS = [
    "id",
    "harness_id",
    "agent_key",
    "display_name",
    "lead",
    "agent_state",
    "released_from",
    "forked_from",
    "name_by",
  ] as const;

  /** The space a thread grows in, or nothing when the space is not a thread (M5.4). */
  async function parentOf(workspaceId: string, spaceId: string): Promise<string | undefined> {
    const row = await db
      .selectFrom("spaces")
      .select("parent_space_id")
      .where("workspace_id", "=", workspaceId)
      .where("id", "=", spaceId)
      .executeTakeFirst();
    return row?.parent_space_id ?? undefined;
  }

  async function memberRole(
    workspaceId: string,
    spaceId: string,
    participantId: string,
  ): Promise<"owner" | "member" | "guest" | undefined> {
    // One lookup on the table's own key; the workspace predicate is belt and braces.
    const row = await db
      .selectFrom("memberships")
      .select("role")
      .where("workspace_id", "=", workspaceId)
      .where("space_id", "=", spaceId)
      .where("participant_id", "=", participantId)
      .executeTakeFirst();
    if (row !== undefined) return row.role;
    // A thread's members are its parent's (M5.4): a second lookup, only when the first found
    // nothing, since most spaces are not threads and most senders are in the room they name.
    const parent = await parentOf(workspaceId, spaceId);
    return parent === undefined ? undefined : memberRole(workspaceId, parent, participantId);
  }

  const exchangeReads = createExchangeReads(db);
  const leadReads = createLeadReads(db);
  const spendReads = createSpendReads(db);

  return {
    async approval(workspaceId: string, approvalId: string): Promise<ApprovalView | undefined> {
      const row = await db
        .selectFrom("approvals")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", approvalId)
        .executeTakeFirst();
      if (row === undefined) return undefined;

      return {
        approval_id: row.id,
        run_id: row.run_id,
        space_id: row.space_id,
        action: JSON.parse(row.action) as Record<string, unknown>,
        state: row.state === "resolved" ? "resolved" : "pending",
        decision: row.decision,
        scope: row.scope,
        reason: row.reason,
        resolved_by: row.resolved_by,
        resolved_at: row.resolved_at,
        updated_input: row.updated_input === null ? null : JSON.parse(row.updated_input),
        expires_at: row.expires_at,
        fallback: row.fallback,
        executed_outcome: row.executed_outcome,
        approvers: row.approvers === null ? [] : (JSON.parse(row.approvers) as string[]),
        risk: JSON.parse(row.risk) as string[],
      };
    },

    async run(workspaceId: string, runId: string): Promise<RunView | undefined> {
      const row = await db
        .selectFrom("runs")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", runId)
        .executeTakeFirst();
      return row === undefined ? undefined : toRunView(row);
    },

    async liveRun(workspaceId: string, spaceId: string, by?: string): Promise<RunView | undefined> {
      // The index on (workspace_id, space_id, started_at) is this query's.
      let query = db
        .selectFrom("runs")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .where("state", "not in", [...TERMINAL_RUN_STATES]);
      // An agent's runs, or all of a harness's: its own and its agents' (ADR 0087).
      if (by !== undefined) {
        query = query.where((eb) => eb.or([eb("harness_id", "=", by), eb("agent_id", "=", by)]));
      }
      const row = await query.orderBy("started_at", "desc").limit(1).executeTakeFirst();
      return row === undefined ? undefined : toRunView(row);
    },

    async membersOf(workspaceId: string, spaceId: string): Promise<MemberView[]> {
      // The members with their names, for resolving a mention or an approver. One query: the
      // membership row and the participant it names, in the order they joined. A thread's
      // members are the parent's (M5.4).
      const parent = await parentOf(workspaceId, spaceId);
      const rows = await db
        .selectFrom("memberships")
        .innerJoin("participants", "participants.id", "memberships.participant_id")
        .leftJoin("participants as harness", "harness.id", "participants.harness_id")
        .leftJoin("workspace_members", (join) =>
          join
            .onRef("workspace_members.participant_id", "=", "memberships.participant_id")
            .onRef("workspace_members.workspace_id", "=", "memberships.workspace_id"),
        )
        .select([
          "memberships.participant_id as participant_id",
          "participants.kind as kind",
          "participants.display_name as display_name",
          "participants.harness_id as harness_id",
          "memberships.role as role",
          "memberships.agent_name as agent_name",
          sql<string | null>`coalesce(participants.owner_id, harness.owner_id)`.as("owner_id"),
          sql<string | null>`coalesce(participants.removed_at, harness.removed_at)`.as(
            "removed_at",
          ),
          "workspace_members.role as workspace_role",
        ])
        .where("memberships.workspace_id", "=", workspaceId)
        .where("memberships.space_id", "=", parent ?? spaceId)
        .orderBy("memberships.joined_at", "asc")
        .execute();
      return rows.map(toMemberView);
    },

    async heldNames(workspaceId: string): Promise<HeldName[]> {
      // Held while the harness itself is the member: its agent in its place holds the name as its
      // own, and the projection clears the row's. A closed room holds nothing.
      const rows = await db
        .selectFrom("memberships")
        .innerJoin("spaces", (join) =>
          join
            .onRef("spaces.id", "=", "memberships.space_id")
            .onRef("spaces.workspace_id", "=", "memberships.workspace_id"),
        )
        .innerJoin("participants", "participants.id", "memberships.participant_id")
        .select([
          "memberships.space_id as space_id",
          "memberships.participant_id as harness_id",
          "memberships.agent_name as name",
          "memberships.agent_name_by as by",
        ])
        .where("memberships.workspace_id", "=", workspaceId)
        .where("memberships.agent_name", "is not", null)
        .where("participants.kind", "=", "harness")
        .where("spaces.state", "=", "open")
        .execute();
      return rows.map((row) => ({
        space_id: row.space_id,
        harness_id: row.harness_id,
        name: row.name as string,
        by: row.by,
      }));
    },

    async message(workspaceId: string, messageId: string): Promise<MessageView | undefined> {
      // The wire names a message by the ULID of the event that carried it (decision 11); the
      // row is keyed by the event's id. An id that is not one names nothing.
      let eventId: string;
      try {
        eventId = eventIdOfMessage(messageId);
      } catch {
        return undefined;
      }
      const row = await db
        .selectFrom("messages")
        .select([
          "id",
          "seq",
          "space_id",
          "run_id",
          "type",
          "author_kind",
          "author_id",
          "created_at",
          "edited_at",
          "deleted_at",
        ])
        // The thread grown from it, if one has been (M5.4): its own row says nothing of it.
        .select((eb) =>
          eb
            .selectFrom("spaces")
            .select("spaces.id")
            .whereRef("spaces.workspace_id", "=", "messages.workspace_id")
            .where("spaces.root_message_id", "=", messageId)
            .limit(1)
            .as("thread_id"),
        )
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", eventId)
        .executeTakeFirst();
      if (row === undefined) return undefined;
      return {
        message_id: messageId,
        event_id: row.id,
        seq: row.seq,
        space_id: row.space_id,
        run_id: row.run_id,
        type: row.type,
        author_kind: row.author_kind as MessageView["author_kind"],
        author_id: row.author_id,
        created_at: row.created_at,
        edited_at: row.edited_at,
        deleted_at: row.deleted_at,
        thread_id: row.thread_id ?? null,
      };
    },

    async lastAddressed(
      workspaceId: string,
      spaceId: string,
      actorId: string,
    ): Promise<string[] | "all" | undefined> {
      // Newest first by the (workspace_id, space_id, seq) index; the author is a filter on it.
      const row = await db
        .selectFrom("messages")
        .select(["addressed_to", "addressed_to_all"])
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .where("type", "=", "text")
        .where("author_id", "=", actorId)
        .where("addressed_to", "is not", null)
        .orderBy("seq", "desc")
        .limit(1)
        .executeTakeFirst();
      if (row?.addressed_to == null) return undefined;
      return row.addressed_to_all === 1 ? "all" : (JSON.parse(row.addressed_to) as string[]);
    },

    ...exchangeReads,
    ...leadReads,
    ...spendReads,

    async lastSpokeSeq(
      workspaceId: string,
      spaceId: string,
      participantIds: readonly string[],
      beforeSeq: number,
    ): Promise<number | undefined> {
      if (participantIds.length === 0) return undefined;
      // Newest first on the (workspace_id, space_id, seq) index; the author is a filter on it.
      const row = await db
        .selectFrom("messages")
        .select("seq")
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .where("seq", "<", beforeSeq)
        .where("type", "=", "text")
        .where("author_id", "in", [...participantIds])
        .orderBy("seq", "desc")
        .limit(1)
        .executeTakeFirst();
      return row?.seq ?? undefined;
    },

    async lastTurnSeq(
      workspaceId: string,
      spaceId: string,
      participantIds: readonly string[],
      beforeSeq: number,
    ): Promise<number | undefined> {
      if (participantIds.length === 0) return undefined;
      const said = await db
        .selectFrom("messages")
        .select(["seq", "run_id"])
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .where("seq", "<", beforeSeq)
        .where("type", "=", "text")
        .where("author_id", "in", [...participantIds])
        .orderBy("seq", "desc")
        .limit(1)
        .executeTakeFirst();
      if (said?.seq === null || said?.seq === undefined) return undefined;
      if (said.run_id === null) return said.seq;
      // The run's first event, on the (workspace_id, run_id, seq) index.
      const began = await db
        .selectFrom("events")
        .select("seq")
        .where("workspace_id", "=", workspaceId)
        .where("run_id", "=", said.run_id)
        .orderBy("seq")
        .limit(1)
        .executeTakeFirst();
      return Math.min(said.seq, began?.seq ?? said.seq);
    },

    async joinedSeq(
      workspaceId: string,
      spaceId: string,
      participantIds: readonly string[],
      beforeSeq: number,
    ): Promise<number | undefined> {
      if (participantIds.length === 0) return undefined;
      const ids = [...participantIds];
      // A thread's members are its parent's (M5.4), so it was joined there.
      const room = (await parentOf(workspaceId, spaceId)) ?? spaceId;
      const row = await db
        .selectFrom("events")
        .select("seq")
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", room)
        .where("seq", "<", beforeSeq)
        .where((eb) =>
          eb.or([
            eb.and([
              eb("type", "=", "membership.added"),
              eb(sql<string>`json_extract(payload, '$.participant_id')`, "in", ids),
            ]),
            // Whoever opened a room is its first member (ADR 0018).
            eb.and([eb("type", "=", "space.created"), eb("actor_id", "in", ids)]),
          ]),
        )
        .orderBy("seq", "desc")
        .limit(1)
        .executeTakeFirst();
      return row?.seq;
    },

    async roomLinesSince(
      workspaceId: string,
      spaceId: string,
      window: {
        readonly after: number;
        readonly before: number;
        readonly limit: number;
        readonly unsaidBy?: readonly string[];
      },
    ): Promise<{ readonly events: ContextEvent[]; readonly more: boolean }> {
      const inWindow = (eb: ExpressionBuilder<Database, "events">) =>
        eb.and([
          eb("events.workspace_id", "=", workspaceId),
          eb("events.seq", ">", window.after),
          eb("events.seq", "<", window.before),
        ]);
      // Newest first on the (workspace_id, space_id, seq) index. A message reads as it does now,
      // from its row, and a deleted one is no line (ADR 0088).
      const unsaid = [...(window.unsaidBy ?? [])];
      const room = await db
        .selectFrom("events")
        .leftJoin("messages", (join) =>
          join
            .onRef("messages.workspace_id", "=", "events.workspace_id")
            .onRef("messages.id", "=", "events.id"),
        )
        .select(LINE_COLUMNS)
        .select("messages.text as now")
        .where(inWindow)
        .where("events.space_id", "=", spaceId)
        .where("events.type", "in", ROOM_LINE_TYPES)
        .where((eb) =>
          eb.or([eb("events.type", "!=", "message.post"), eb("messages.deleted_at", "is", null)]),
        )
        .$if(unsaid.length > 0, (query) =>
          query.where((eb) =>
            eb.or([
              eb("events.type", "!=", "message.post"),
              eb("events.actor_id", "not in", unsaid),
            ]),
          ),
        )
        .orderBy("events.seq", "desc")
        .limit(window.limit + 1)
        .execute();
      // A person's new name is the workspace's; it is a line of every room they are in.
      const members = db
        .selectFrom("memberships")
        .select("participant_id")
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", (await parentOf(workspaceId, spaceId)) ?? spaceId);
      const renamed = await db
        .selectFrom("events")
        .select(LINE_COLUMNS)
        .select(sql<string | null>`null`.as("now"))
        .where(inWindow)
        .where("events.space_id", "is", null)
        .where("events.type", "=", "person.renamed")
        .where(sql<string>`json_extract(events.payload, '$.participant_id')`, "in", members)
        .orderBy("events.seq", "desc")
        .limit(window.limit + 1)
        .execute();
      const rows = [...room, ...renamed].sort((a, b) => b.seq - a.seq);
      return {
        events: rows.slice(0, window.limit).reverse().map(toContextEvent),
        more: rows.length > window.limit,
      };
    },

    async space(workspaceId: string, spaceId: string): Promise<SpaceView | undefined> {
      const row = await db
        .selectFrom("spaces")
        .select([
          "id",
          "kind",
          "title",
          "state",
          "opened_by",
          "title_by",
          "external_key",
          "parent_space_id",
          "root_message_id",
          "asked_of",
          "also_asked_of",
          "home",
          "lead_id",
          "locked",
        ])
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", spaceId)
        .executeTakeFirst();
      if (row === undefined) return undefined;
      return {
        space_id: row.id,
        kind: row.kind,
        title: row.title,
        state: row.state === "closed" ? "closed" : "open",
        opened_by: row.opened_by,
        title_by: row.title_by,
        external_key: row.external_key,
        parent_space_id: row.parent_space_id,
        root_message_id: row.root_message_id,
        asked_of: row.asked_of,
        also_asked_of: parsedIds(row.also_asked_of),
        home: row.home === 1,
        lead_id: row.lead_id,
        locked: row.locked === 1,
      };
    },

    async agentRoom(workspaceId: string, agentId: string): Promise<string | undefined> {
      // The open room an agent is in (ADR 0087, rule 1): one at most, and none for a free agent.
      const row = await db
        .selectFrom("memberships")
        .innerJoin("spaces", "spaces.id", "memberships.space_id")
        .select("spaces.id as id")
        .where("memberships.workspace_id", "=", workspaceId)
        .where("memberships.participant_id", "=", agentId)
        .where("spaces.state", "=", "open")
        .where("spaces.parent_space_id", "is", null)
        .orderBy("memberships.joined_at", "desc")
        .limit(1)
        .executeTakeFirst();
      return row?.id;
    },

    async liveRunsIn(workspaceId: string, spaceId: string): Promise<RunView[]> {
      // The room's own, and its threads': whoever leaves the room leaves those too.
      const rows = await db
        .selectFrom("runs")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where((eb) =>
          eb.or([
            eb("space_id", "=", spaceId),
            eb(
              "space_id",
              "in",
              eb
                .selectFrom("spaces")
                .select("id")
                .where("workspace_id", "=", workspaceId)
                .where("parent_space_id", "=", spaceId),
            ),
          ]),
        )
        .where("state", "not in", [...TERMINAL_RUN_STATES])
        .orderBy("started_at")
        .execute();
      return rows.map(toRunView);
    },

    async agentsInClosedRooms(workspaceId: string) {
      return await db
        .selectFrom("memberships")
        .innerJoin("spaces", (join) =>
          join
            .onRef("spaces.id", "=", "memberships.space_id")
            .onRef("spaces.workspace_id", "=", "memberships.workspace_id"),
        )
        .innerJoin("participants", (join) =>
          join
            .onRef("participants.id", "=", "memberships.participant_id")
            .onRef("participants.workspace_id", "=", "memberships.workspace_id"),
        )
        .select(["memberships.participant_id as agent_id", "memberships.space_id as space_id"])
        .where("memberships.workspace_id", "=", workspaceId)
        .where("participants.kind", "=", "agent")
        .where("spaces.state", "=", "closed")
        .orderBy("memberships.joined_at")
        .orderBy("memberships.participant_id")
        .execute();
    },

    async strandedRuns(workspaceId: string) {
      // A thread's members and state are its room's, so a run in a thread is judged by the room.
      const rows = await db
        .selectFrom("runs")
        .innerJoin("spaces", (join) =>
          join
            .onRef("spaces.id", "=", "runs.space_id")
            .onRef("spaces.workspace_id", "=", "runs.workspace_id"),
        )
        .leftJoin("spaces as room", (join) =>
          join
            .onRef("room.id", "=", "spaces.parent_space_id")
            .onRef("room.workspace_id", "=", "spaces.workspace_id"),
        )
        .select([
          "runs.id as run_id",
          "runs.space_id as space_id",
          sql<string>`coalesce(room.state, spaces.state)`.as("room_state"),
        ])
        .where("runs.workspace_id", "=", workspaceId)
        .where("runs.state", "not in", [...TERMINAL_RUN_STATES])
        .where((eb) =>
          eb.or([
            eb(sql<string>`coalesce(room.state, spaces.state)`, "=", "closed"),
            eb.and([
              eb("runs.agent_id", "is not", null),
              eb.not(
                eb.exists(
                  eb
                    .selectFrom("memberships")
                    .select("memberships.participant_id")
                    .whereRef("memberships.workspace_id", "=", "runs.workspace_id")
                    .whereRef("memberships.participant_id", "=", "runs.agent_id")
                    .whereRef(
                      "memberships.space_id",
                      "=",
                      sql<string>`coalesce(spaces.parent_space_id, spaces.id)`,
                    ),
                ),
              ),
            ]),
          ]),
        )
        .orderBy("runs.started_at")
        .execute();
      return rows.flatMap((row) =>
        row.space_id === null
          ? []
          : [
              {
                run_id: row.run_id,
                space_id: row.space_id,
                why: row.room_state === "closed" ? ("archived" as const) : ("left" as const),
              },
            ],
      );
    },

    async agentsInSeveralRooms(workspaceId: string) {
      const rows = await db
        .selectFrom("memberships")
        .innerJoin("participants", (join) =>
          join
            .onRef("participants.id", "=", "memberships.participant_id")
            .onRef("participants.workspace_id", "=", "memberships.workspace_id"),
        )
        .select(["memberships.participant_id as agent_id", "memberships.space_id as space_id"])
        .where("memberships.workspace_id", "=", workspaceId)
        .where("participants.kind", "=", "agent")
        .orderBy("memberships.participant_id")
        .orderBy("memberships.joined_at")
        .execute();
      const rooms = new Map<string, string[]>();
      for (const row of rows)
        rooms.set(row.agent_id, [...(rooms.get(row.agent_id) ?? []), row.space_id]);
      return [...rooms]
        .filter(([, held]) => held.length > 1)
        .map(([agentId, held]) => ({ agent_id: agentId, rooms: held }));
    },

    async lastLeft(workspaceId: string, spaceId: string, participantId: string) {
      const row = await db
        .selectFrom("events")
        .select("seq")
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .where("type", "=", "membership.removed")
        .where(sql<string>`json_extract(payload, '$.participant_id')`, "=", participantId)
        .orderBy("seq", "desc")
        .limit(1)
        .executeTakeFirst();
      return row?.seq;
    },

    async spacesAmong(workspaceId: string, spaceIds: readonly string[]) {
      if (spaceIds.length === 0) return new Set<string>();
      const rows = await db
        .selectFrom("spaces")
        .select("id")
        .where("workspace_id", "=", workspaceId)
        .where("id", "in", [...spaceIds])
        .execute();
      return new Set(rows.map((row) => row.id));
    },

    async workspaces() {
      const rows = await db.selectFrom("workspaces").select("id").orderBy("id").execute();
      return rows.map((row) => row.id);
    },

    async heldFor(workspaceId: string, agentId: string): Promise<HeldView[]> {
      const rows = await db
        .selectFrom("held_messages")
        .select(["event_id", "said_at", "text", "attachments"])
        .where("workspace_id", "=", workspaceId)
        .where("agent_id", "=", agentId)
        .orderBy("seq")
        .execute();
      return rows.map((row) => ({
        event_id: row.event_id,
        said_at: row.said_at,
        text: row.text,
        attachments: row.attachments === null ? [] : (JSON.parse(row.attachments) as unknown[]),
      }));
    },

    async releasedFrom(workspaceId: string, spaceId: string): Promise<AgentView[]> {
      const rows = await db
        .selectFrom("participants")
        .select(AGENT_COLUMNS)
        .where("workspace_id", "=", workspaceId)
        .where("kind", "=", "agent")
        .where("released_from", "=", spaceId)
        .orderBy("created_at")
        .execute();
      return withSpaces(workspaceId, rows);
    },

    async stateChangeOf(workspaceId: string, spaceId: string) {
      const row = await db
        .selectFrom("events")
        .select(["actor_kind", "idempotency_key"])
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .where("type", "=", "space.updated")
        .where(sql<unknown>`json_extract(payload, '$.state')`, "is not", null)
        .orderBy("seq", "desc")
        .limit(1)
        .executeTakeFirst();
      return row === undefined ? undefined : { by: row.actor_kind, key: row.idempotency_key };
    },

    async harnessPolicy(
      workspaceId: string,
      harnessId: string,
      spaceId?: string,
    ): Promise<HarnessPolicyView | undefined> {
      // The room's own row wins over the harness's row everywhere; one query for both.
      const rows = await db
        .selectFrom("harness_policy")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where("harness_id", "=", harnessId)
        .where("space_id", "in", ["*", ...(spaceId === undefined ? [] : [spaceId])])
        .execute();
      const room = rows.find((row) => row.space_id !== "*");
      const everywhere = rows.find((row) => row.space_id === "*");
      const chosen = room ?? everywhere;
      if (chosen === undefined) return undefined;
      // Spend and budget are the harness's, not the room's.
      const view = toPolicyView({
        ...chosen,
        budget_usd: everywhere?.budget_usd ?? chosen.budget_usd,
        spent_usd: everywhere?.spent_usd ?? chosen.spent_usd,
      });
      // The level is the room's; the harness's rules everywhere are read after the room's own.
      return room === undefined || everywhere === undefined
        ? view
        : { ...view, everywhere_rules: JSON.parse(everywhere.rules) as PolicyRule[] };
    },

    async workspacePolicy(workspaceId: string): Promise<WorkspacePolicyView | undefined> {
      const row = await db
        .selectFrom("workspace_policy")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .executeTakeFirst();
      if (row === undefined) return undefined;
      return { max_autonomy: row.max_autonomy, rules: JSON.parse(row.rules) as PolicyRule[] };
    },

    async sessionInSpace(
      workspaceId: string,
      spaceId: string,
      sessionRef: string,
    ): Promise<boolean> {
      const row = await db
        .selectFrom("sessions")
        .select("session_ref")
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .where("session_ref", "=", sessionRef)
        .executeTakeFirst();
      return row !== undefined;
    },

    async sessionRules(workspaceId: string, runId: string): Promise<PolicyRule[]> {
      const rows = await db
        .selectFrom("session_rules")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where("run_id", "=", runId)
        .orderBy("decided_at", "asc")
        .execute();
      return rows.flatMap((row) => {
        const when = { external: row.external === 1, irreversible: row.irreversible === 1 };
        const rule = {
          match: row.match,
          decision: row.decision,
          reason: `decided for this session at ${row.decided_at}`,
          // A person's answer made it, so it never allows an action that matters (ADR 0195).
          made_at: row.decided_at,
        };
        // A command's answer is a rule per start of its parts (ADR 0239).
        const starts =
          row.starts_with === null ? undefined : (JSON.parse(row.starts_with) as string[][]);
        return starts === undefined
          ? [{ ...rule, when }]
          : starts.map((start) => ({ ...rule, when: { ...when, starts_with: start } }));
      });
    },

    async question(workspaceId: string, askId: string): Promise<QuestionView | undefined> {
      const row = await db
        .selectFrom("questions")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", askId)
        .executeTakeFirst();
      return row === undefined ? undefined : toQuestionView(row);
    },

    async lane(workspaceId: string, laneId: string): Promise<LaneView | undefined> {
      const row = await db
        .selectFrom("lanes")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", laneId)
        .executeTakeFirst();
      return row === undefined ? undefined : toLaneView(row);
    },

    async laneByRun(workspaceId: string, runId: string): Promise<LaneView | undefined> {
      // The index on (workspace_id, run_id) is this query's.
      const row = await db
        .selectFrom("lanes")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where("run_id", "=", runId)
        .executeTakeFirst();
      return row === undefined ? undefined : toLaneView(row);
    },

    async lanesLedBy(workspaceId: string, leadRunId: string): Promise<LaneView[]> {
      // The index on (workspace_id, lead_run_id) is this query's.
      const rows = await db
        .selectFrom("lanes")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where("lead_run_id", "=", leadRunId)
        .execute();
      return rows.map(toLaneView);
    },

    async directSpaceBetween(
      workspaceId: string,
      a: string,
      b: string,
    ): Promise<string | undefined> {
      // A direct space both are members of: the room a lane to this specialist lives in, so
      // the person reads it where they already talk to the harness. A harness that opens a room
      // per thing it keeps has many such rooms with the person; its home, the one its lead speaks
      // in (ADR 0069), comes first, then an open room before an archived one, then the oldest.
      const row = await db
        .selectFrom("spaces")
        .innerJoin("memberships as ma", "ma.space_id", "spaces.id")
        .innerJoin("memberships as mb", "mb.space_id", "spaces.id")
        .select("spaces.id as id")
        .where("spaces.workspace_id", "=", workspaceId)
        .where("spaces.kind", "=", "direct")
        .where("ma.participant_id", "=", a)
        .where("mb.participant_id", "=", b)
        .orderBy("spaces.home", "desc")
        .orderBy(sql`case when spaces.state = 'open' then 0 else 1 end`)
        .orderBy("spaces.created_at", "asc")
        .limit(1)
        .executeTakeFirst();
      return row?.id;
    },

    async approvalsAwaiting(workspaceId: string, participantId: string) {
      // Approvers are a JSON list of ids; the LIKE narrows, and the parse decides.
      const rows = await db
        .selectFrom("approvals")
        .select(["id", "run_id", "space_id", "approvers"])
        .where("workspace_id", "=", workspaceId)
        .where("state", "=", "pending")
        .where("approvers", "like", `%"${participantId}"%`)
        .execute();
      return rows
        .map((row) => ({
          approval_id: row.id,
          run_id: row.run_id,
          space_id: row.space_id,
          approvers: row.approvers === null ? [] : (JSON.parse(row.approvers) as string[]),
        }))
        .filter((row) => row.approvers.includes(participantId));
    },

    async approvalsExpiredBy(nowIso: string): Promise<ExpiredApproval[]> {
      // The index on (state, expires_at) is this query's.
      const rows = await db
        .selectFrom("approvals")
        .select(["workspace_id", "id", "run_id", "space_id", "fallback", "expires_at", "approvers"])
        .where("state", "=", "pending")
        .where("expires_at", "is not", null)
        .where("expires_at", "<=", nowIso)
        .orderBy("expires_at", "asc")
        .execute();
      return rows.map((row) => ({
        workspace_id: row.workspace_id,
        approval_id: row.id,
        run_id: row.run_id,
        space_id: row.space_id,
        fallback: row.fallback,
        expires_at: row.expires_at ?? nowIso,
        approvers: row.approvers === null ? [] : (JSON.parse(row.approvers) as string[]),
      }));
    },

    async questionsTimedOutBy(nowIso: string): Promise<TimedOutQuestion[]> {
      // The index on (state, timeout_at) is this query's.
      const rows = await db
        .selectFrom("questions")
        .selectAll()
        .where("state", "=", "pending")
        .where("timeout_at", "is not", null)
        .where("timeout_at", "<=", nowIso)
        .orderBy("timeout_at", "asc")
        .execute();
      return rows.map((row) => ({ ...toQuestionView(row), workspace_id: row.workspace_id }));
    },

    async participant(workspaceId: string, participantId: string) {
      const row = await db
        .selectFrom("participants")
        .leftJoin("participants as harness", "harness.id", "participants.harness_id")
        .leftJoin("workspace_members", (join) =>
          join
            .onRef("workspace_members.participant_id", "=", "participants.id")
            .onRef("workspace_members.workspace_id", "=", "participants.workspace_id"),
        )
        .select(PARTICIPANT_COLUMNS)
        .select(lastSeenAt)
        .where("participants.workspace_id", "=", workspaceId)
        .where("participants.id", "=", participantId)
        .executeTakeFirst();
      return row === undefined ? undefined : toParticipantView(row);
    },

    async homesOf(workspaceId: string, harnessId: string) {
      // The two rooms a harness may name its home (ADR 0069): one it opened, or the direct room
      // it was handed and is in. A group room it is merely in is somebody else's.
      const inIt = db
        .selectFrom("memberships")
        .select("space_id")
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", harnessId);
      const rows = await db
        .selectFrom("spaces")
        .select("id")
        .where("workspace_id", "=", workspaceId)
        .where("home", "=", 1)
        .where((where) =>
          where.or([
            where("opened_by", "=", harnessId),
            where.and([where("kind", "=", "direct"), where("id", "in", inIt)]),
          ]),
        )
        .orderBy("created_at", "asc")
        .execute();
      return rows.map((row) => row.id);
    },

    postedFiles: (
      workspaceId: string,
      spaceId: string,
      options?: { readonly upto?: number | undefined; readonly name?: string | undefined },
    ) =>
      postedFilesIn(db, workspaceId, spaceId, {
        upto: options?.upto,
        ...(options?.name === undefined ? {} : { names: [options.name] }),
      }),

    madeFrom: (workspaceId: string, messageIds: readonly string[]) =>
      madeFromIn(db, workspaceId, messageIds),

    attachmentFact: (workspaceId: string, attachmentId: string) =>
      attachmentFact(db, workspaceId, attachmentId),

    async attachmentSpaces(workspaceId: string, attachmentId: string) {
      const rows = await db
        .selectFrom("attachments")
        .select("space_id")
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", attachmentId)
        .execute();
      return rows.flatMap((row) => (row.space_id === null ? [] : [row.space_id]));
    },

    async runAttachments(workspaceId: string, runId: string): Promise<Attachment[]> {
      const rows = await db
        .selectFrom("messages")
        .select("attachments")
        .where("workspace_id", "=", workspaceId)
        .where("run_id", "=", runId)
        // The harness's own, its agents' (ADR 0087), and still said: the task the lead sent down
        // carries the lead's files, and handing those back up would answer a question with its
        // own attachments.
        .where("author_kind", "in", ["harness", "agent"])
        .where("deleted_at", "is", null)
        .orderBy("seq", "asc")
        .execute();
      const seen = new Set<string>();
      const out: Attachment[] = [];
      for (const row of rows) {
        for (const each of carried(row.attachments)) {
          if (seen.has(each.attachment_id) || out.length >= MOST_FILES) continue;
          seen.add(each.attachment_id);
          out.push(each);
        }
      }
      return out;
    },

    async priceTable(workspaceId: string): Promise<PriceTable> {
      const row = await db
        .selectFrom("workspaces")
        .select("price_table")
        .where("id", "=", workspaceId)
        .executeTakeFirst();
      return parsePriceTable(row?.price_table);
    },

    async spacesForMember(workspaceId: string, participantId: string): Promise<string[]> {
      // A harness is in its agents' rooms (ADR 0087): it speaks for them on one connection.
      const rows = await db
        .selectFrom("memberships")
        .select("space_id")
        .distinct()
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "in", selvesOf(workspaceId, participantId))
        .execute();
      const mine = rows.map((row) => row.space_id);
      if (mine.length === 0) return mine;
      // And the threads of those spaces (M5.4), which have no memberships of their own.
      const threads = await db
        .selectFrom("spaces")
        .select("id")
        .where("workspace_id", "=", workspaceId)
        .where("parent_space_id", "in", mine)
        .execute();
      return [...mine, ...threads.map((row) => row.id)];
    },

    async spaceByExternalKey(
      workspaceId: string,
      externalKey: string,
    ): Promise<string | undefined> {
      const row = await db
        .selectFrom("spaces")
        .select("id")
        .where("workspace_id", "=", workspaceId)
        .where("external_key", "=", externalKey)
        .executeTakeFirst();
      return row?.id;
    },

    async spacesOpenedBy(workspaceId: string, harnessId: string): Promise<OpenedSpaceView[]> {
      const rows = await db
        .selectFrom("spaces")
        .select(["id", "external_key", "title", "state", "state_by"])
        .where("workspace_id", "=", workspaceId)
        .where("opened_by", "=", harnessId)
        .where("external_key", "is not", null)
        .orderBy("created_at")
        .orderBy("id")
        .execute();
      return rows.map((row) => ({
        space_id: row.id,
        ...unscopedKey(harnessId, row.external_key ?? ""),
        title: row.title,
        state: row.state === "closed" ? "closed" : "open",
        ...(row.state_by === "person" || row.state_by === "harness"
          ? { moved_by: row.state_by }
          : {}),
      }));
    },

    async spacesAskedOf(workspaceId: string, harnessId: string): Promise<AskedSpaceView[]> {
      const rows = await db
        .selectFrom("spaces")
        .innerJoin("memberships", (join) =>
          join
            .onRef("memberships.workspace_id", "=", "spaces.workspace_id")
            .onRef("memberships.space_id", "=", "spaces.id")
            .on("memberships.participant_id", "=", harnessId),
        )
        .select([
          "spaces.id",
          "spaces.opened_by",
          "spaces.title",
          "spaces.state",
          "spaces.created_at",
        ])
        .where("spaces.workspace_id", "=", workspaceId)
        // Asked first and unclaimed, or asked beside another (ADR 0087's addendum of 30
        // September): the harness is in the room as itself until its claim puts its agent there.
        .where((eb) =>
          eb.or([
            eb.and([eb("spaces.asked_of", "=", harnessId), eb("spaces.external_key", "is", null)]),
            sql<boolean>`exists (select 1 from json_each(${sql.ref("spaces.also_asked_of")}) where value = ${harnessId})`,
          ]),
        )
        .orderBy("spaces.created_at")
        .orderBy("spaces.id")
        .execute();
      return rows.map((row) => ({
        space_id: row.id,
        asked_by: row.opened_by ?? "",
        title: row.title,
        state: row.state === "closed" ? "closed" : "open",
        asked_at: row.created_at,
      }));
    },

    async isMember(workspaceId: string, spaceId: string, participantId: string): Promise<boolean> {
      return (await memberRole(workspaceId, spaceId, participantId)) !== undefined;
    },

    memberRole,

    async participantsVisibleTo(
      workspaceId: string,
      participantId: string,
    ): Promise<ParticipantView[]> {
      // The people and agents sharing any space with the caller, or with one of a harness's
      // agents (ADR 0087). The caller is a member of those spaces too, so they name themselves;
      // the distinct keeps a shared room from listing anyone twice.
      const mine = db
        .selectFrom("memberships")
        .select("space_id")
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "in", selvesOf(workspaceId, participantId));

      const rows = await db
        .selectFrom("participants")
        .innerJoin("memberships", "memberships.participant_id", "participants.id")
        .leftJoin("participants as harness", "harness.id", "participants.harness_id")
        .leftJoin("workspace_members", (join) =>
          join
            .onRef("workspace_members.participant_id", "=", "participants.id")
            .onRef("workspace_members.workspace_id", "=", "participants.workspace_id"),
        )
        .select(PARTICIPANT_COLUMNS)
        .select(lastSeenAt)
        .distinct()
        .where("participants.workspace_id", "=", workspaceId)
        .where("memberships.workspace_id", "=", workspaceId)
        .where("memberships.space_id", "in", mine)
        .execute();

      return rows.map(toParticipantView);
    },

    async agentsOf(workspaceId: string, harnessId: string): Promise<AgentView[]> {
      const rows = await db
        .selectFrom("participants")
        .select(AGENT_COLUMNS)
        .where("workspace_id", "=", workspaceId)
        .where("kind", "=", "agent")
        .where("harness_id", "=", harnessId)
        // A deleted one is not its harness's any more (ADR 0095).
        .where("removed_at", "is", null)
        .orderBy("created_at")
        .orderBy("id")
        .execute();
      return withSpaces(workspaceId, rows);
    },

    async forkAsk(
      workspaceId: string,
      agentId: string,
      spaceId: string,
    ): Promise<ForkAsk | undefined> {
      const ask = await db
        .selectFrom("events")
        .select(["id", "seq", "ts", "payload"])
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .where("type", "=", "agent.fork")
        .where(sql<string>`json_extract(payload, '$.agent_id')`, "=", agentId)
        .orderBy("seq", "desc")
        .limit(1)
        .executeTakeFirst();
      if (ask === undefined) return undefined;
      const answer = await db
        .selectFrom("events")
        .select("seq")
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .where("type", "=", "membership.added")
        .where(sql<string>`json_extract(payload, '$.fork_of')`, "=", ask.id)
        .limit(1)
        .executeTakeFirst();
      const payload = JSON.parse(ask.payload) as Record<string, unknown>;
      return {
        event_id: ask.id,
        seq: ask.seq,
        ts: ask.ts,
        by: String(payload["by"] ?? ""),
        answered: answer !== undefined,
      };
    },

    async agentAsk(workspaceId: string, askId: string): Promise<AgentAsk | undefined> {
      const ask = await db
        .selectFrom("events")
        .select(["id", "ts", "space_id", "payload"])
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", askId)
        .where("type", "=", "agent.asked")
        .executeTakeFirst();
      if (ask === undefined || ask.space_id === null) return undefined;
      const answer = await db
        .selectFrom("events")
        .select("seq")
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", ask.space_id)
        .where("type", "=", "membership.added")
        .where(sql<string>`json_extract(payload, '$.made_for')`, "=", ask.id)
        .limit(1)
        .executeTakeFirst();
      const payload = JSON.parse(ask.payload) as Record<string, unknown>;
      return {
        event_id: ask.id,
        ts: ask.ts,
        space_id: ask.space_id,
        harness_id: String(payload["harness_id"] ?? ""),
        name: String(payload["name"] ?? ""),
        by: String(payload["by"] ?? ""),
        answered: answer !== undefined,
      };
    },

    async agentStays(workspaceId: string, agentId: string): Promise<AgentStay[]> {
      const rooms = holders(
        await db
          .selectFrom("replacements")
          .select(["space_id", "from_id", "to_id"])
          .where("workspace_id", "=", workspaceId)
          .orderBy("seq")
          .execute(),
      );
      const ids = everyoneFor(rooms, agentId);
      const moves = await db
        .selectFrom("events")
        .select(["seq", "ts", "type", "space_id", "payload"])
        .where("workspace_id", "=", workspaceId)
        .where("type", "in", ["membership.added", "membership.removed", "membership.replaced"])
        .where((eb) =>
          eb.or(
            ["participant_id", "from", "to"].map((field) =>
              eb(sql<string>`json_extract(payload, ${`$.${field}`})`, "in", ids),
            ),
          ),
        )
        .orderBy("seq")
        .execute();
      const selves = (room: string) => selvesIn(rooms, room, agentId);
      const stays = staysOf(moves, selves);
      if (stays.length === 0) return [];

      const its = [...new Set(stays.map((stay) => stay.room))];
      // An erased room is gone from every history, though a membership of it might outlive it.
      const kept = new Set(
        (
          await db
            .selectFrom("spaces")
            .select("id")
            .where("workspace_id", "=", workspaceId)
            .where("id", "in", its)
            .execute()
        ).map((row) => row.id),
      );
      const archives = await db
        .selectFrom("events")
        .select([
          "seq",
          "ts",
          "space_id",
          sql<string | null>`json_extract(payload, '$.state')`.as("state"),
        ])
        .where("workspace_id", "=", workspaceId)
        .where("type", "=", "space.updated")
        .where("space_id", "in", its)
        .where(sql<string | null>`json_extract(payload, '$.state')`, "in", ["open", "closed"])
        .orderBy("seq")
        .execute();

      const ended = stays
        .filter((stay) => kept.has(stay.room))
        .map((stay) => endedAtArchive(stay, archives))
        .sort((a, b) => a.from.seq - b.from.seq);
      return Promise.all(
        ended.map(async (stay) => ({
          space_id: stay.room,
          from_seq: stay.from.seq,
          from_at: stay.from.at,
          to_seq: stay.to?.seq ?? null,
          to_at: stay.to?.at ?? null,
          lines: await linesOfStay(
            workspaceId,
            stay.room,
            selves(stay.room),
            stay.from.seq,
            stay.to?.seq,
          ),
        })),
      );
    },

    async roomsHolding(workspaceId: string, participantId: string): Promise<SpaceView[]> {
      const rows = await db
        .selectFrom("memberships")
        .innerJoin("spaces", "spaces.id", "memberships.space_id")
        .select([
          "spaces.id as id",
          "spaces.kind as kind",
          "spaces.title as title",
          "spaces.state as state",
          "spaces.opened_by as opened_by",
          "spaces.title_by as title_by",
          "spaces.external_key as external_key",
          "spaces.parent_space_id as parent_space_id",
          "spaces.root_message_id as root_message_id",
          "spaces.asked_of as asked_of",
          "spaces.also_asked_of as also_asked_of",
          "spaces.home as home",
          "spaces.state_by as state_by",
          "spaces.last_activity_at as last_activity_at",
        ])
        .where("memberships.workspace_id", "=", workspaceId)
        .where("memberships.participant_id", "=", participantId)
        .orderBy("memberships.joined_at")
        .orderBy("spaces.id")
        .execute();
      return rows.map((row) => ({
        state_by: row.state_by,
        last_activity_at: row.last_activity_at,
        space_id: row.id,
        kind: row.kind,
        title: row.title,
        state: row.state === "closed" ? ("closed" as const) : ("open" as const),
        opened_by: row.opened_by,
        title_by: row.title_by,
        external_key: row.external_key,
        parent_space_id: row.parent_space_id,
        root_message_id: row.root_message_id,
        asked_of: row.asked_of,
        also_asked_of: parsedIds(row.also_asked_of),
        home: row.home === 1,
      }));
    },

    async agentByKey(
      workspaceId: string,
      harnessId: string,
      key: string,
    ): Promise<AgentView | undefined> {
      const row = await db
        .selectFrom("participants")
        .select(AGENT_COLUMNS)
        .where("workspace_id", "=", workspaceId)
        .where("harness_id", "=", harnessId)
        .where("agent_key", "=", key)
        .executeTakeFirst();
      return row === undefined ? undefined : (await withSpaces(workspaceId, [row]))[0];
    },

    async replacedIn(workspaceId: string, spaceId: string) {
      const room = (await parentOf(workspaceId, spaceId)) ?? spaceId;
      const rows = await db
        .selectFrom("replacements")
        .select(["from_id", "to_id"])
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", room)
        .orderBy("seq")
        .execute();
      // Places change hands more than once — a harness's to its default agent at the upgrade, then
      // to the agent it names (ADR 0087, Phase 3) — so each reads as whoever holds it last.
      const now = new Map<string, string>();
      for (const row of rows) {
        for (const [from, to] of now) if (to === row.from_id) now.set(from, row.to_id);
        now.set(row.from_id, row.to_id);
      }
      return [...now].filter(([from, to]) => from !== to).map(([from, to]) => ({ from, to }));
    },

    async participantsMet(workspaceId: string, participantId: string): Promise<string[]> {
      const mine = db
        .selectFrom("memberships")
        .select("space_id")
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId);
      const now = await db
        .selectFrom("memberships")
        .select("participant_id")
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "in", mine)
        .execute();
      // Who was there before: added, or either side of a replacement (ADR 0087).
      const before = await db
        .selectFrom("events")
        .select([
          sql<string | null>`json_extract(payload, '$.participant_id')`.as("added"),
          sql<string | null>`json_extract(payload, '$.from')`.as("from"),
          sql<string | null>`json_extract(payload, '$.to')`.as("to"),
        ])
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "in", mine)
        .where("type", "in", ["membership.added", "membership.replaced"])
        .execute();
      const ids = [
        participantId,
        ...now.map((row) => row.participant_id),
        ...before.flatMap((row) => [row.added, row.from, row.to]),
      ];
      return [...new Set(ids.filter((id): id is string => typeof id === "string"))];
    },

    async participantsIn(workspaceId: string): Promise<ParticipantView[]> {
      const rows = await db
        .selectFrom("participants")
        .leftJoin("participants as harness", "harness.id", "participants.harness_id")
        .leftJoin("workspace_members", (join) =>
          join
            .onRef("workspace_members.participant_id", "=", "participants.id")
            .onRef("workspace_members.workspace_id", "=", "participants.workspace_id"),
        )
        .select(PARTICIPANT_COLUMNS)
        .select(lastSeenAt)
        .where("participants.workspace_id", "=", workspaceId)
        .orderBy("participants.created_at", "asc")
        .execute();
      return rows.map(toParticipantView);
    },

    async workspaceRole(
      workspaceId: string,
      participantId: string,
    ): Promise<WorkspaceRole | undefined> {
      // One lookup on the table's own key.
      const row = await db
        .selectFrom("workspace_members")
        .select("role")
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId)
        .executeTakeFirst();
      return row?.role;
    },

    async ownerCount(workspaceId: string): Promise<number> {
      // The index on (workspace_id, role) is this query's.
      const row = await db
        .selectFrom("workspace_members")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .where("workspace_id", "=", workspaceId)
        .where("role", "=", "owner")
        .executeTakeFirst();
      return row?.count ?? 0;
    },

    async attachmentCaps(workspaceId: string): Promise<AttachmentCaps> {
      const row = await db
        .selectFrom("workspace_limits")
        .select(["image_bytes", "video_bytes", "file_bytes"])
        .where("workspace_id", "=", workspaceId)
        .executeTakeFirst();
      if (row === undefined) return NO_CAPS;
      return { image: row.image_bytes, video: row.video_bytes, file: row.file_bytes };
    },

    async spaceCountFor(workspaceId: string, participantId: string): Promise<number> {
      const row = await db
        .selectFrom("memberships")
        .innerJoin("spaces", "spaces.id", "memberships.space_id")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .where("memberships.workspace_id", "=", workspaceId)
        .where("memberships.participant_id", "=", participantId)
        .where("spaces.state", "=", "open")
        .where("spaces.parent_space_id", "is", null)
        .executeTakeFirst();
      return row?.count ?? 0;
    },

    async peopleIn(workspaceId: string): Promise<PersonView[]> {
      // The name is the participant row's: the joining event's copy is what it was then.
      const rows = await db
        .selectFrom("workspace_members")
        .innerJoin("participants", "participants.id", "workspace_members.participant_id")
        .select([
          "workspace_members.participant_id as participant_id",
          "participants.display_name as display_name",
          "workspace_members.role as role",
          "workspace_members.joined_at as joined_at",
          "workspace_members.invited_by as invited_by",
        ])
        .where("workspace_members.workspace_id", "=", workspaceId)
        .orderBy("workspace_members.joined_at", "asc")
        .orderBy("workspace_members.participant_id", "asc")
        .execute();
      return rows.map((row) => ({
        participant_id: row.participant_id,
        display_name: row.display_name,
        role: row.role,
        joined_at: row.joined_at,
        invited_by: row.invited_by,
      }));
    },

    async search(
      workspaceId: string,
      spaces: readonly string[],
      query: SearchQuery,
    ): Promise<SearchPage> {
      const match = ftsQuery(query.text);
      const wanted =
        query.spaceId === undefined ? spaces : spaces.filter((id) => id === query.spaceId);
      if (match === undefined || wanted.length === 0) return { hits: [], next_cursor: null };
      // The index follows the tables by a queue (Gate 5): brought up to date first, so a hit
      // is never stale, at the cost of a read when nothing is queued.
      await drainSearchIndex(db);
      const after = decodeCursor(query.cursor);
      const take = query.limit + 1;
      const [messages, receipts] = await Promise.all([
        messageHits(db, workspaceId, wanted, match, after, take),
        receiptHits(db, workspaceId, wanted, match, after, take),
      ]);
      const found = [...messages, ...receipts].sort(newestFirst);
      const page = found.slice(0, query.limit);
      const last = page.at(-1);
      return {
        hits: page.map((each) => each.hit),
        next_cursor: found.length > query.limit && last !== undefined ? encodeCursor(last) : null,
      };
    },

    async workspace(workspaceId: string): Promise<WorkspaceView | undefined> {
      const row = await db
        .selectFrom("workspaces")
        .select(["id", "name"])
        .where("id", "=", workspaceId)
        .executeTakeFirst();
      return row === undefined ? undefined : { workspace_id: row.id, name: row.name };
    },

    /**
     * The server's own person (ADR 0048): the oldest owner still here, or the oldest person
     * still here when no owner is. One who was removed is never it (SEC-25): a code issued for
     * them is refused at pairing, and the machine's own door would be shut with nobody told.
     */
    async anyPerson(): Promise<{ workspaceId: string; participantId: string } | undefined> {
      const here = db
        .selectFrom("participants")
        .select(["participants.id", "participants.workspace_id"])
        .where("participants.kind", "=", "person")
        .where("participants.removed_at", "is", null)
        .orderBy("participants.created_at", "asc")
        .orderBy("participants.id", "asc")
        .limit(1);
      const owner = await here
        .innerJoin("workspace_members", (join) =>
          join
            .onRef("workspace_members.participant_id", "=", "participants.id")
            .onRef("workspace_members.workspace_id", "=", "participants.workspace_id"),
        )
        .where("workspace_members.role", "=", "owner")
        .executeTakeFirst();
      const row = owner ?? (await here.executeTakeFirst());
      return row === undefined
        ? undefined
        : { workspaceId: row.workspace_id, participantId: row.id };
    },
  };
}

/**
 * Search (M5.4). The words as typed become an FTS5 query: each a quoted term, all of them
 * required, the last one a prefix, so a search narrows as it is typed. Quotes are dropped
 * rather than escaped, and eight terms are plenty.
 */
export function ftsQuery(text: string): string | undefined {
  const terms = text
    .split(/\s+/u)
    .map((term) => term.replaceAll('"', ""))
    .filter((term) => term !== "")
    .slice(0, 8);
  if (terms.length === 0) return undefined;
  return terms.map((term, index) => `"${term}"${index === terms.length - 1 ? " *" : ""}`).join(" ");
}

/** Where a page of hits left off: the time and the key of its last hit, newest first. */
interface SearchCursor {
  readonly at: string;
  readonly key: string;
}

/** A hit with the key the cursor needs, which the wire does not carry. */
interface Found {
  readonly hit: SearchHit;
  readonly key: string;
}

function encodeCursor(found: Found): string {
  const cursor: SearchCursor = { at: found.hit.at, key: found.key };
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

/** The cursor a client sent back, or nothing for none — or for one that is not ours. */
export function decodeCursor(cursor: string | undefined): SearchCursor | undefined {
  if (cursor === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const { at, key } = parsed as { at?: unknown; key?: unknown };
    return typeof at === "string" && typeof key === "string" ? { at, key } : undefined;
  } catch {
    return undefined;
  }
}

function newestFirst(a: Found, b: Found): number {
  if (a.hit.at !== b.hit.at) return a.hit.at < b.hit.at ? 1 : -1;
  return a.key < b.key ? 1 : a.key > b.key ? -1 : 0;
}

/** How many words of context a snippet shows around the match. */
const SNIPPET_WORDS = 12;

/** The keyset clause: everything older than where the last page ended. */
function olderThan(
  after: SearchCursor | undefined,
  at: RawBuilder<unknown>,
  key: RawBuilder<unknown>,
) {
  return after === undefined
    ? sql``
    : sql`and (${at} < ${after.at} or (${at} = ${after.at} and ${key} < ${after.key}))`;
}

async function messageHits(
  db: Kysely<Database>,
  workspaceId: string,
  spaces: readonly string[],
  match: string,
  after: SearchCursor | undefined,
  take: number,
): Promise<Found[]> {
  const rows = await sql<{
    message_id: string;
    space_id: string;
    at: string;
    author_id: string;
    typed: string;
    heard: string;
  }>`
    select message_id, space_id, created_at as at, author_id,
      snippet(messages_fts, 0, ${SNIPPET_OPEN}, ${SNIPPET_CLOSE}, '…', ${SNIPPET_WORDS}) as typed,
      snippet(messages_fts, 1, ${SNIPPET_OPEN}, ${SNIPPET_CLOSE}, '…', ${SNIPPET_WORDS}) as heard
    from messages_fts
    where messages_fts match ${match}
      and workspace_id = ${workspaceId}
      and space_id in (${sql.join(spaces)})
      ${olderThan(after, sql`created_at`, sql`message_id`)}
    order by created_at desc, message_id desc
    limit ${take}
  `.execute(db);
  return rows.rows.map((row) => {
    // The typed words when they matched; what was heard in a voice note only when they did not.
    const heard = !row.typed.includes(SNIPPET_OPEN) && row.heard.includes(SNIPPET_OPEN);
    return {
      key: row.message_id,
      hit: {
        kind: "message",
        space_id: row.space_id,
        at: row.at,
        snippet: heard ? row.heard : row.typed,
        ...(heard ? { snippet_from: "transcript" as const } : {}),
        message_id: messageIdOf(row.message_id),
        author_id: row.author_id,
      },
    };
  });
}

/**
 * The steps found, each in its run's space. A step of a turn that ended on `NO_REPLY` is left out
 * (ADR 0105): the turn drew nothing in the room, so a result for it had nowhere to open.
 */
async function receiptHits(
  db: Kysely<Database>,
  workspaceId: string,
  spaces: readonly string[],
  match: string,
  after: SearchCursor | undefined,
  take: number,
): Promise<Found[]> {
  const rows = await sql<{
    run_id: string;
    step_id: string;
    space_id: string;
    at: string;
    snippet: string;
  }>`
    select run_id, step_id, space_id, updated_at as at,
      snippet(steps_fts, 0, ${SNIPPET_OPEN}, ${SNIPPET_CLOSE}, '…', ${SNIPPET_WORDS}) as snippet
    from steps_fts
    where steps_fts match ${match}
      and workspace_id = ${workspaceId}
      and space_id in (${sql.join(spaces)})
      and not exists (
        select 1 from runs where runs.id = steps_fts.run_id and no_reply(runs.summary)
      )
      ${olderThan(after, sql`updated_at`, sql`(run_id || '/' || step_id)`)}
    order by updated_at desc, run_id desc, step_id desc
    limit ${take}
  `.execute(db);
  return rows.rows.map((row) => ({
    key: `${row.run_id}/${row.step_id}`,
    hit: {
      kind: "receipt",
      space_id: row.space_id,
      at: row.at,
      snippet: row.snippet,
      run_id: row.run_id,
      step_id: row.step_id,
    },
  }));
}
