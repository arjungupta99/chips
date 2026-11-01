/**
 * What an event means for the read models.
 *
 * This is pure (technical-plan 6.1): it turns one validated event into a list of changes and
 * touches no database. Infrastructure decides how to write them. Two things follow. Replay and
 * live traffic run exactly the same code, which is what makes `rebuild` trustworthy. And the
 * meaning of an event can be tested without opening a file.
 *
 * Events with no projector still append: the log is complete whether or not a screen cares.
 */

import { eventIdOfMessage } from "@chipschat/protocol";
import type { TrailEntry } from "./lane.js";
import type { RunTransition } from "./run-state.js";

/** The read models. Every one of them is rebuildable from the event log. */
export type ProjectionTable =
  | "participants"
  | "replacements"
  | "held_messages"
  | "spaces"
  | "sessions"
  | "memberships"
  | "messages"
  | "runs"
  | "steps"
  | "approvals"
  | "questions"
  | "attachments"
  | "lanes"
  | "read_state"
  | "harness_policy"
  | "workspace_policy"
  | "session_rules"
  | "workspace_members"
  | "pins"
  | "workspace_limits";

export const PROJECTION_TABLES: readonly ProjectionTable[] = [
  "participants",
  "replacements",
  "held_messages",
  "spaces",
  "sessions",
  "memberships",
  "messages",
  "runs",
  "steps",
  "approvals",
  "questions",
  "attachments",
  "lanes",
  "read_state",
  "harness_policy",
  "workspace_policy",
  "session_rules",
  "workspace_members",
  "pins",
  "workspace_limits",
];

/**
 * The rows of a table that are the log's, where the table also holds rows that are not: a
 * `participants` row is the registry's for a person or a harness, which have credentials no
 * replay should make, and the log's for an agent, which has none (ADR 0087). A rebuild clears
 * only these, and every other projection table whole.
 */
export const ROWS_OF_THE_LOG: Readonly<
  Partial<Record<ProjectionTable, { readonly column: string; readonly equals: string }>>
> = {
  participants: { column: "kind", equals: "agent" },
};

export type Row = Readonly<Record<string, unknown>>;

/** Insert the row, or replace it if its key is already there. */
export interface Upsert {
  readonly kind: "upsert";
  readonly table: ProjectionTable;
  readonly row: Row;
}

/** Change some columns of an existing row. A patch that matches nothing is a no-op. */
export interface Patch {
  readonly kind: "patch";
  readonly table: ProjectionTable;
  readonly key: Row;
  readonly set: Row;
}

/** Remove a row. A delete that matches nothing is a no-op. */
export interface Remove {
  readonly kind: "delete";
  readonly table: ProjectionTable;
  readonly key: Row;
}

/**
 * Move a run through its state machine. Separate from `patch` because the next state depends
 * on the current one, which only the store can see.
 */
export interface RunStep {
  readonly kind: "run_transition";
  readonly key: Row;
  readonly transition: RunTransition;
  readonly set: Row;
}

/**
 * A `usage` report: the run's tokens and cost, and the harness's spend. A run-scoped report is
 * the run's total so far and replaces it; a step's or a lane's adds to it. Either way what the
 * harness has spent grows by the difference, which only the store can work out (ADR 0021).
 */
export interface Spend {
  readonly kind: "spend";
  readonly table: "runs";
  readonly key: Row;
  readonly harness: Row;
  readonly scope: "run" | "step" | "lane";
  /** Absent when the harness could not say; the run's count stays as it was. */
  readonly inputTokens?: number | undefined;
  /** The same, for a harness that sent its cost alone (ADR 0162). */
  readonly outputTokens?: number | undefined;
  readonly usd?: number | undefined;
}

/**
 * A decision with `scope: "session"` becomes a rule for the rest of the run: the same kind of
 * action, with the same flags, is decided the same way without asking. The action is on the
 * approval's row, which only the store can see.
 */
export interface SessionRule {
  readonly kind: "session_rule";
  readonly table: "session_rules";
  readonly key: Row;
  readonly runId: string;
  readonly decision: "allow" | "deny";
  readonly decidedAt: string;
}

/**
 * Replace the steps of a run that are still to do. The ones already done or failed keep their
 * place; the new ones follow them. Separate from `upsert` because which steps stay depends on
 * their state, which only the store can see.
 */
export interface ReplacePlan {
  readonly kind: "replace_plan";
  readonly table: "steps";
  readonly key: Row;
  readonly steps: readonly { readonly step_id: string; readonly title: string }[];
  readonly updatedAt: string;
}

/**
 * What an erased room had cost, put back on its harness's account (ADR 0067). The room's `usage`
 * went with it, and a budget is not topped up by erasing where the money went: every policy row
 * of the harness grows by it, as `usage` grows them.
 */
export interface CarriedSpend {
  readonly kind: "carried_spend";
  readonly table: "harness_policy";
  readonly harness: Row;
  readonly usd: number;
}

/**
 * A harness's turns in a room, taken by the agent that takes its place there: each run the
 * harness began in the room as itself, before an agent of its was named. Separate from `patch`
 * because it matches the runs no agent has, which an equality cannot say. A room asked of
 * Jacobian from the + begins its first turn on the person's first words and claims the room
 * seconds into it: that turn is its agent's.
 */
export interface TakeRuns {
  readonly kind: "take_runs";
  readonly table: "runs";
  readonly key: {
    readonly workspace_id: string;
    readonly space_id: string;
    readonly harness_id: string;
  };
  readonly agentId: string;
}

export type Change =
  | Upsert
  | Patch
  | Remove
  | RunStep
  | Spend
  | ReplacePlan
  | SessionRule
  | CarriedSpend
  | TakeRuns;

/**
 * An event as the projector sees it: validated against its schema, and stamped with the
 * sequence number the store assigned. Validation happens once at the edge and is trusted
 * inside (technical-plan 6.1), which is why the readers below distinguish `required` from
 * `field` instead of defending against shapes the schema has already refused.
 */
interface EventLike {
  readonly type: string;
  readonly id: string;
  readonly ts: string;
  readonly workspace_id: string;
  readonly space_id?: string;
  readonly run_id?: string;
  readonly seq: number;
  readonly actor: { readonly kind: string; readonly id: string; readonly harness_id?: string };
  readonly [field: string]: unknown;
}

/** The harness an event's actor speaks through: an agent's, or the harness itself (ADR 0087). */
function harnessOf(event: EventLike): string {
  return event.actor.harness_id ?? event.actor.id;
}

/** The agent an event is by, when an agent sent it. */
function agentOf(event: EventLike): string | null {
  return event.actor.kind === "agent" ? event.actor.id : null;
}

/**
 * Which side changed a room, a person or the harness: `title_by` and `state_by` say whose word
 * holds (ADR 0066), and an agent's word is its harness's.
 */
function sideOf(event: EventLike): string {
  return event.actor.kind === "agent" ? "harness" : event.actor.kind;
}

type Projector = (event: EventLike) => Change[];

/** A field the schema marks optional. Absent is a real answer. */
function field<T>(event: EventLike, name: string): T | undefined {
  return event[name] as T | undefined;
}

/**
 * A field the schema marks required, read without a guard. A fallback here would be dead code
 * that no valid event can reach, and dead code in a projector is worse than none: it would
 * quietly write a default instead of failing where the mistake actually is.
 */
function required<T>(event: EventLike, name: string): T {
  return event[name] as T;
}

/** An optional field kept as JSON, or null when the event has none: absent means something. */
function jsonOrNull(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

/** Every event lands in its space's activity, so the list sorts without a join. */
function touchSpace(event: EventLike): Change[] {
  if (event["space_id"] === undefined) return [];
  return [
    {
      kind: "patch",
      table: "spaces",
      key: { workspace_id: event.workspace_id, id: event.space_id },
      set: { last_activity_at: event.ts, last_event_seq: event.seq },
    },
  ];
}

/** A message row, whatever kind of message it is. Eleven types, one model (blueprint). */
function message(event: EventLike, type: string, extra: Row = {}): Change {
  return {
    kind: "upsert",
    table: "messages",
    row: {
      id: event.id,
      workspace_id: event.workspace_id,
      space_id: event.space_id ?? null,
      run_id: event.run_id ?? null,
      seq: event.seq,
      type,
      author_kind: event.actor.kind,
      author_id: event.actor.id,
      created_at: event.ts,
      ...extra,
    },
  };
}

/** An attachment belongs to the space of the message that carried it (M1.5). */
function attachmentRows(event: EventLike): Change[] {
  const attachments = field<Row[]>(event, "attachments") ?? [];
  return attachments.map((attachment) => ({
    kind: "upsert" as const,
    table: "attachments" as const,
    row: {
      id: attachment["attachment_id"],
      workspace_id: event.workspace_id,
      space_id: event.space_id ?? null,
      message_id: event.id,
      filename: attachment["filename"],
      mime_type: attachment["mime_type"],
      byte_size: attachment["byte_size"],
      sha256: attachment["sha256"],
      width: attachment["width"] ?? null,
      height: attachment["height"] ?? null,
      duration_ms: attachment["duration_ms"] ?? null,
      created_at: event.ts,
    },
  }));
}

const PROJECTORS: Readonly<Record<string, Projector>> = {
  "space.created": (event) => [
    {
      kind: "upsert",
      table: "spaces",
      row: {
        id: event.space_id,
        workspace_id: event.workspace_id,
        kind: required<string>(event, "kind"),
        title: field<string>(event, "title") ?? null,
        external_key: field<string>(event, "external_key") ?? null,
        // A thread grows in a space from one of its messages (M5.4).
        parent_space_id: field<string>(event, "parent_space_id") ?? null,
        root_message_id: field<string>(event, "root_message_id") ?? null,
        state: "open",
        closed_at: null,
        // Who opened it is who may retitle or close it later, when that is a harness (M3.3).
        opened_by: event.actor.id,
        title_by: field<string>(event, "title") === undefined ? null : sideOf(event),
        state_by: null,
        // The harness a person asked into it, which claims it under a key of its own.
        asked_of: field<string>(event, "asked_of") ?? null,
        // And the others asked with it, each of which answers with an agent (ADR 0087).
        also_asked_of: jsonOrNull(field<string[]>(event, "also_asked_of")),
        created_at: event.ts,
        last_activity_at: event.ts,
        last_event_seq: event.seq,
      },
    },
    // Whoever opened the space is its first member (ADR 0018): the membership rule on
    // writes would otherwise refuse the creator's own first message. A later `membership.added`
    // for the same person only refines the row, since the key is the pair. A thread has no
    // members of its own (M5.4): whoever is in the parent is in it, and leaves with it.
    ...(field<string>(event, "parent_space_id") === undefined
      ? [
          {
            kind: "upsert" as const,
            table: "memberships" as const,
            row: {
              workspace_id: event.workspace_id,
              space_id: event.space_id,
              participant_id: event.actor.id,
              role: "owner",
              joined_at: event.ts,
            },
          },
        ]
      : []),
  ],

  // A retitle, a close or a reopening (M3.3): the row changes, and a muted line says so. Or the
  // harness's home named (ADR 0069), which changes nothing anybody reads in the room.
  "space.updated": (event) => {
    const title = field<string>(event, "title");
    const state = field<string>(event, "state");
    const home = field<boolean>(event, "home");
    const said = title !== undefined || state !== undefined;
    return [
      {
        kind: "patch",
        table: "spaces",
        key: { workspace_id: event.workspace_id, id: event.space_id },
        set: {
          ...(home === undefined ? {} : { home: home ? 1 : 0 }),
          ...(title === undefined ? {} : { title, title_by: sideOf(event) }),
          // Who archived it, or brought it back: a person's word goes back into the harness
          // that follows its own spaces rather than being undone by it (ADR 0066).
          ...(state === undefined
            ? {}
            : {
                state,
                closed_at: state === "closed" ? event.ts : null,
                state_by: sideOf(event),
              }),
        },
      },
      ...(said ? [message(event, "system", { text: null }), ...touchSpace(event)] : []),
    ];
  },

  // A room a person asked a harness for, taken by it under its own key: the key makes the
  // harness's door find it again, and the harness is now who opened it, so it retitles, archives
  // and follows the room as one it opened itself (M3.3, ADR 0066). The door wrote the title only
  // when no person had named the room. No line in the room: nothing was said.
  "space.claimed": (event) => {
    const title = field<string>(event, "title");
    return [
      {
        kind: "patch",
        table: "spaces",
        key: { workspace_id: event.workspace_id, id: event.space_id },
        set: {
          external_key: required<string>(event, "external_key"),
          opened_by: event.actor.id,
          ...(title === undefined ? {} : { title, title_by: sideOf(event) }),
        },
      },
    ];
  },

  // Who leads a room (ADR 0104), or that nobody does. An agent that leaves leads it no more, which
  // is read where the lead is read, so leaving writes nothing here. No line in the room's log: the
  // people's devices say who chose, from this event.
  "space.lead_set": (event) => [
    {
      kind: "patch",
      table: "spaces",
      key: { workspace_id: event.workspace_id, id: event.space_id },
      set: { lead_id: field<string | null>(event, "agent_id") ?? null },
    },
  ],

  // What a room allows a job (ADR 0117), or that it follows the default again. No line in the
  // room's log: the people's devices say who set it, from this event.
  "space.spend_ceiling_set": (event) => [
    {
      kind: "patch",
      table: "spaces",
      key: { workspace_id: event.workspace_id, id: event.space_id },
      set: { spend_ceiling_usd: field<number | null>(event, "usd") ?? null },
    },
  ],

  // A room's changes locked, or let go (ADR 0156): what the door reads to refuse a person's
  // rename, archive or delete. No line in the room's log: the people's devices say who did it,
  // from this event.
  "space.lock_set": (event) => [
    {
      kind: "patch",
      table: "spaces",
      key: { workspace_id: event.workspace_id, id: event.space_id },
      set: { locked: field<boolean>(event, "locked") === true ? 1 : 0 },
    },
  ],

  // A room erased (ADR 0067). Its rows went with its events before this was written, so there is
  // nothing of it here to remove; what stays is its cost, on the account of whoever ran it.
  "space.erased": (event) =>
    (field<{ harness_id: string; usd: number }[]>(event, "spent") ?? []).map((each) => ({
      kind: "carried_spend" as const,
      table: "harness_policy" as const,
      harness: { workspace_id: event.workspace_id, harness_id: each.harness_id },
      usd: each.usd,
    })),

  // A harness's agent (ADR 0087): a participant whose row is the log's. Its owner and whether it
  // was removed are its harness's, read through `harness_id`.
  "agent.registered": (event) => [
    {
      kind: "upsert",
      table: "participants",
      row: {
        id: required<string>(event, "agent_id"),
        workspace_id: event.workspace_id,
        kind: "agent",
        display_name: required<string>(event, "name"),
        owner_id: null,
        parent_id: null,
        ephemeral: 0,
        capabilities: null,
        created_at: event.ts,
        harness_id: required<string>(event, "harness_id"),
        agent_key: required<string>(event, "key"),
        lead: field<boolean>(event, "lead") === true ? 1 : 0,
        forked_from: field<string>(event, "forked_from") ?? null,
        agent_state: "active",
      },
    },
  ],

  "agent.updated": (event) => {
    const name = field<string>(event, "name");
    const state = field<string>(event, "state");
    // A face a person chose (ADR 0089), or `null` when the choice was taken back.
    const face = field<{ icon: string; ground: number; letters?: string } | null>(event, "face");
    // Main from here, or not (ADR 0183): a harness's default agent taking Main from another.
    const lead = field<boolean>(event, "lead");
    return [
      {
        kind: "patch",
        table: "participants",
        key: { workspace_id: event.workspace_id, id: required<string>(event, "agent_id") },
        set: {
          ...(name === undefined ? {} : { display_name: name }),
          ...(lead === undefined ? {} : { lead: lead ? 1 : 0 }),
          // A person's name for it holds against its harness (ADR 0091); Chips numbering it
          // afterwards keeps whose name it is.
          ...(name !== undefined && event.actor.kind === "person"
            ? { name_by: event.actor.id }
            : {}),
          ...(state === undefined ? {} : { agent_state: state }),
          ...(face === undefined ? {} : { face: face === null ? null : JSON.stringify(face) }),
        },
      },
    ];
  },

  // An agent a person deleted (ADR 0095): removed, as a harness is (ADR 0078), so every read of an
  // agent's removal reads it, and its key retired, so its harness asking for it again finds none
  // and is refused at its registration. What it was keeping to post in its next room goes.
  "agent.deleted": (event) => {
    const agentId = required<string>(event, "agent_id");
    return [
      {
        kind: "patch",
        table: "participants",
        key: { workspace_id: event.workspace_id, id: agentId },
        set: {
          removed_at: event.ts,
          agent_key: `${required<string>(event, "key")}#deleted-${agentId}`,
        },
      },
      {
        kind: "delete",
        table: "held_messages",
        key: { workspace_id: event.workspace_id, agent_id: agentId },
      },
    ];
  },

  // An agent's changes locked, or let go (ADR 0199): what the door reads to refuse a person's
  // rename, archive or delete. No room is told: the lock is the agent's.
  "agent.lock_set": (event) => [
    {
      kind: "patch",
      table: "participants",
      key: { workspace_id: event.workspace_id, id: required<string>(event, "agent_id") },
      set: { locked: field<boolean>(event, "locked") === true ? 1 : 0 },
    },
  ],

  // An agent put in a room (ADR 0087): no longer waiting to come back to one an archive took it
  // from. Where it is, is its membership's.
  "agent.attached": (event) => [
    {
      kind: "patch",
      table: "participants",
      key: { workspace_id: event.workspace_id, id: required<string>(event, "agent_id") },
      set: { released_from: null },
    },
  ],

  // An agent taken out of its room: the room it was last in, and, when an archive took it, the
  // room an unarchive brings it back to while it is still free.
  "agent.released": (event) => {
    const room = required<string>(event, "space_id");
    const reason = required<string>(event, "reason");
    return [
      {
        kind: "patch",
        table: "participants",
        key: { workspace_id: event.workspace_id, id: required<string>(event, "agent_id") },
        set: {
          last_space_id: room,
          released_from: reason === "archived" || reason === "agent_archived" ? room : null,
        },
      },
    ];
  },

  // What an agent said in no room (ADR 0087, rule 6): kept, and gone again once posted.
  "message.held": (event) => [
    {
      kind: "upsert",
      table: "held_messages",
      row: {
        event_id: event.id,
        workspace_id: event.workspace_id,
        agent_id: required<string>(event, "agent_id"),
        seq: event.seq,
        said_at: event.ts,
        text: required<string>(event, "text"),
        attachments: jsonOrNull(field<unknown[]>(event, "attachments")),
      },
    },
  ],

  // An agent in its harness's place in a room (ADR 0087, point 9): the membership row changes
  // hands, keeping its role and when it began, and the room remembers whose place it took, so
  // what the harness said there reads as the agent's. Nothing is said in the room.
  "membership.replaced": (event) => [
    // The one whose place it was was last in this room (ADR 0087): an agent put somewhere else
    // is not new to rooms.
    {
      kind: "patch",
      table: "participants",
      key: { workspace_id: event.workspace_id, id: required<string>(event, "from") },
      set: { last_space_id: event.space_id },
    },
    {
      kind: "patch",
      table: "memberships",
      key: {
        workspace_id: event.workspace_id,
        space_id: event.space_id,
        participant_id: required<string>(event, "from"),
      },
      // The agent is in its place, by the name the room held for it, which nobody holds now.
      set: { participant_id: required<string>(event, "to"), agent_name: null, agent_name_by: null },
    },
    // And the turns the harness began there as itself are its agent's, the one going among them,
    // so the room counts it as working.
    ...(event.space_id === undefined
      ? []
      : [
          {
            kind: "take_runs" as const,
            table: "runs" as const,
            key: {
              workspace_id: event.workspace_id,
              space_id: event.space_id,
              harness_id: required<string>(event, "from"),
            },
            agentId: required<string>(event, "to"),
          },
        ]),
    {
      kind: "upsert",
      table: "replacements",
      row: {
        workspace_id: event.workspace_id,
        space_id: event.space_id,
        from_id: required<string>(event, "from"),
        to_id: required<string>(event, "to"),
        seq: event.seq,
      },
    },
  ],

  "membership.added": (event) => [
    {
      kind: "upsert",
      table: "memberships",
      row: {
        workspace_id: event.workspace_id,
        space_id: event.space_id,
        participant_id: required<string>(event, "participant_id"),
        role: required<string>(event, "role"),
        joined_at: field<string>(event, "joined_at") ?? event.ts,
        // The first name held for a harness's agent-to-be here (ADR 0150), and whose naming it is.
        agent_name: field<string>(event, "agent_name") ?? null,
        agent_name_by: field<string>(event, "agent_name") === undefined ? null : event.actor.id,
      },
    },
    message(event, "system", { text: null }),
    ...touchSpace(event),
  ],

  // A harness read a file: a muted line in the room, and an entry in the audit.
  "attachment.fetched": (event) => [message(event, "system", { text: null }), ...touchSpace(event)],

  "membership.removed": (event) => [
    {
      kind: "delete",
      table: "memberships",
      key: {
        workspace_id: event.workspace_id,
        space_id: event.space_id,
        participant_id: required<string>(event, "participant_id"),
      },
    },
    message(event, "system", { text: null }),
    ...touchSpace(event),
  ],

  // A visit began. The space is already there — the adapter opened it before saying this —
  // and it outlives every session in it (ADR 0024), so this writes only the visit.
  "session.started": (event) => [
    {
      kind: "upsert",
      table: "sessions",
      row: {
        workspace_id: event.workspace_id,
        session_ref: required<string>(event, "session_ref"),
        space_id: event.space_id,
        harness_id: harnessOf(event),
        state: "live",
        started_reason: field<string>(event, "started_reason") ?? null,
        ended_reason: null,
        where: field<string>(event, "where") ?? null,
        transcript_ref: field<string>(event, "transcript_ref") ?? null,
        started_at: event.ts,
        ended_at: null,
        last_event_seq: event.seq,
      },
    },
    ...touchSpace(event),
  ],

  // The visit is over. A patch, not an upsert: an end nobody saw the start of belongs to no
  // space, and inventing a row for it would put a session in a space it may not be in.
  "session.ended": (event) => [
    {
      kind: "patch",
      table: "sessions",
      key: {
        workspace_id: event.workspace_id,
        session_ref: required<string>(event, "session_ref"),
      },
      set: {
        state: "closed",
        ended_reason: field<string>(event, "ended_reason") ?? null,
        ended_at: event.ts,
        last_event_seq: event.seq,
      },
    },
    ...touchSpace(event),
  ],

  // What the visit is called. A patch of one column, and deliberately not the upsert
  // `session.started` uses: a rename must never revive a visit that has ended, or move when it
  // began (ADR 0040). A name for a visit nobody saw the start of belongs to no space, so it
  // lands nowhere, which is the same rule as an end nobody saw.
  "session.renamed": (event) => [
    {
      kind: "patch",
      table: "sessions",
      key: {
        workspace_id: event.workspace_id,
        session_ref: required<string>(event, "session_ref"),
      },
      set: { title: required<string>(event, "title") },
    },
  ],

  "run.started": (event) => [
    {
      kind: "upsert",
      table: "runs",
      row: {
        id: event.run_id,
        workspace_id: event.workspace_id,
        space_id: event.space_id ?? null,
        harness_id: harnessOf(event),
        agent_id: agentOf(event),
        goal: required<string>(event, "goal"),
        state: "running",
        plan: JSON.stringify(field(event, "plan") ?? []),
        session_ref: field<string>(event, "session_ref") ?? null,
        started_at: event.ts,
        ended_at: null,
        status_phase: null,
        status_verb: null,
        summary: null,
        error: null,
        cost_usd: null,
        input_tokens: null,
        output_tokens: null,
        context_used: null,
        context_limit: null,
      },
    },
    // The plan's steps become hollow dots before anything has happened to them.
    ...(field<Row[]>(event, "plan") ?? []).map((step, ordinal) => ({
      kind: "upsert" as const,
      table: "steps" as const,
      row: {
        run_id: event.run_id,
        step_id: step["step_id"],
        workspace_id: event.workspace_id,
        ordinal,
        title: step["title"],
        status: "planned",
        tool: null,
        summary: null,
        sources: null,
        duration_ms: null,
        error: null,
        updated_at: event.ts,
      },
    })),
    ...touchSpace(event),
  ],

  "run.status": (event) => [
    {
      kind: "patch",
      table: "runs",
      key: { workspace_id: event.workspace_id, id: event.run_id },
      set: {
        status_phase: required<string>(event, "phase"),
        status_verb: required<string>(event, "verb_phrase"),
      },
    },
  ],

  "run.plan": (event) => [
    {
      kind: "replace_plan",
      table: "steps",
      key: runKey(event),
      steps: required<{ step_id: string; title: string }[]>(event, "plan"),
      updatedAt: event.ts,
    },
    ...touchSpace(event),
  ],

  // A step that was in the plan keeps its place and its title: the upsert writes only the
  // columns named here, so `ordinal` is never touched and `title` only when the log carries one.
  "step.log": (event) => {
    const title = field<string>(event, "title");
    return [
      {
        kind: "upsert",
        table: "steps",
        row: {
          run_id: event.run_id,
          step_id: required<string>(event, "step_id"),
          workspace_id: event.workspace_id,
          ...(title === undefined ? {} : { title }),
          status: required<string>(event, "status"),
          tool: field<string>(event, "tool") ?? null,
          summary: field<string>(event, "summary") ?? null,
          sources: JSON.stringify(field(event, "sources") ?? []),
          duration_ms: field<number>(event, "duration_ms") ?? null,
          error: field<string>(event, "error") ?? null,
          updated_at: event.ts,
        },
      },
    ];
  },

  "message.post": (event) => [
    // Words held while the agent was in no room, posted now it is in one (ADR 0087, rule 6).
    ...(field<string>(event, "from_held") === undefined
      ? []
      : [
          {
            kind: "delete" as const,
            table: "held_messages" as const,
            key: {
              workspace_id: event.workspace_id,
              event_id: required<string>(event, "from_held"),
            },
          },
        ]),
    message(event, "text", {
      text: required<string>(event, "text"),
      reply_to: field<string>(event, "reply_to") ?? null,
      attachments: JSON.stringify(field(event, "attachments") ?? []),
      addressed_to: jsonOrNull(field<string[]>(event, "addressed_to")),
      addressed_to_all: field<boolean>(event, "addressed_to_all") === true ? 1 : null,
      held: field<boolean>(event, "held") === true ? 1 : null,
    }),
    ...attachmentRows(event),
    ...touchSpace(event),
  ],

  // The author changed the words (M5.4): the row shows the latest and says it changed; the
  // log holds every version. A patch, so a message that never landed gets no row.
  "message.edited": (event) => [
    {
      kind: "patch",
      table: "messages",
      key: { workspace_id: event.workspace_id, id: messageRowId(event) },
      set: { text: required<string>(event, "text"), edited_at: event.ts },
    },
    ...touchSpace(event),
  ],

  // Taken back: the words leave the row and the search index; the event that carried them stays.
  "message.deleted": (event) => [
    {
      kind: "patch",
      table: "messages",
      key: { workspace_id: event.workspace_id, id: messageRowId(event) },
      set: { text: null, attachments: "[]", deleted_at: event.ts },
    },
    {
      kind: "delete",
      table: "pins",
      key: { workspace_id: event.workspace_id, message_id: required<string>(event, "message_id") },
    },
    ...touchSpace(event),
  ],

  "message.pinned": (event) => [
    {
      kind: "upsert",
      table: "pins",
      row: {
        workspace_id: event.workspace_id,
        space_id: event.space_id,
        message_id: required<string>(event, "message_id"),
        pinned_by: event.actor.id,
        pinned_at: event.ts,
      },
    },
    ...touchSpace(event),
  ],

  "message.unpinned": (event) => [
    {
      kind: "delete",
      table: "pins",
      key: {
        workspace_id: event.workspace_id,
        space_id: event.space_id,
        message_id: required<string>(event, "message_id"),
      },
    },
    ...touchSpace(event),
  ],

  "approval.request": (event) => [
    {
      kind: "upsert",
      table: "approvals",
      row: {
        id: required<string>(event, "approval_id"),
        workspace_id: event.workspace_id,
        space_id: event.space_id ?? null,
        run_id: event.run_id ?? null,
        step_id: field<string>(event, "step_id") ?? null,
        action: JSON.stringify(required(event, "action")),
        preview: JSON.stringify(field(event, "preview") ?? null),
        risk: JSON.stringify(required(event, "risk")),
        sources: JSON.stringify(field(event, "sources") ?? []),
        requested_at: event.ts,
        expires_at: expiryOf(event),
        fallback: required<string>(event, "fallback"),
        approvers: JSON.stringify(field(event, "approvers") ?? []),
        editable: required<boolean>(event, "editable") ? 1 : 0,
        state: "pending",
        decision: null,
        scope: null,
        reason: null,
        updated_input: null,
        resolved_by: null,
        resolved_at: null,
        executed_outcome: null,
        executed_detail: null,
      },
    },
    message(event, "approval", { approval_id: field(event, "approval_id") }),
    { kind: "run_transition", key: runKey(event), transition: "await_person", set: {} },
    ...touchSpace(event),
  ],

  // Handed on (M5.5): who may answer changes; the ask, its expiry and its state do not.
  "approval.routed": (event) => [
    {
      kind: "patch",
      table: "approvals",
      key: { workspace_id: event.workspace_id, id: required<string>(event, "approval_id") },
      set: { approvers: JSON.stringify(field(event, "approvers") ?? []) },
    },
    ...touchSpace(event),
  ],

  "approval.resolved": (event) => {
    const decision = required<string>(event, "decision");
    const changes: Change[] = [
      {
        kind: "patch",
        table: "approvals",
        key: { workspace_id: event.workspace_id, id: field(event, "approval_id") },
        set: {
          state: "resolved",
          decision,
          scope: required<string>(event, "scope"),
          reason: field<string>(event, "reason") ?? null,
          updated_input: JSON.stringify(field(event, "updated_input") ?? null),
          resolved_by: required<string>(event, "resolved_by"),
          resolved_at: required<string>(event, "resolved_at"),
        },
      },
      { kind: "run_transition", key: runKey(event), transition: "person_answered", set: {} },
      ...touchSpace(event),
    ];
    // "This session" is the rest of this run; an expiry decides nothing beyond itself.
    if (required<string>(event, "scope") === "session" && decision !== "expired") {
      changes.push({
        kind: "session_rule",
        table: "session_rules",
        key: { workspace_id: event.workspace_id, id: required<string>(event, "approval_id") },
        runId: String(event.run_id),
        decision: decision === "denied" ? "deny" : "allow",
        decidedAt: event.ts,
      });
    }
    return changes;
  },

  "approval.executed": (event) => [
    {
      kind: "patch",
      table: "approvals",
      key: { workspace_id: event.workspace_id, id: field(event, "approval_id") },
      set: {
        executed_outcome: required<string>(event, "outcome"),
        executed_detail: field<string>(event, "detail") ?? null,
      },
    },
  ],

  "question.ask": (event) => [
    {
      kind: "upsert",
      table: "questions",
      row: {
        id: required<string>(event, "ask_id"),
        workspace_id: event.workspace_id,
        space_id: event.space_id ?? null,
        run_id: event.run_id ?? null,
        questions: JSON.stringify(required(event, "questions")),
        asked_at: event.ts,
        timeout_at: timeoutOf(event),
        on_no_answer: required<string>(event, "on_no_answer"),
        state: "pending",
        answers: null,
        answered_by: null,
        answered_at: null,
        timed_out: 0,
      },
    },
    message(event, "question", { ask_id: field(event, "ask_id") }),
    { kind: "run_transition", key: runKey(event), transition: "await_person", set: {} },
    ...touchSpace(event),
  ],

  "question.answered": (event) => [
    {
      kind: "patch",
      table: "questions",
      key: { workspace_id: event.workspace_id, id: field(event, "ask_id") },
      set: {
        state: "answered",
        answers: JSON.stringify(required(event, "answers")),
        answered_by: required<string>(event, "answered_by"),
        answered_at: required<string>(event, "answered_at"),
        timed_out: required<boolean>(event, "timed_out") ? 1 : 0,
      },
    },
    { kind: "run_transition", key: runKey(event), transition: "person_answered", set: {} },
  ],

  "artifact.create": (event) => [
    message(event, "artifact", {
      text: required<string>(event, "title"),
      attachments: JSON.stringify(
        field(event, "attachment") === undefined ? [] : [field(event, "attachment")],
      ),
    }),
    ...attachmentRows({ ...event, attachments: [field(event, "attachment")].filter(Boolean) }),
    ...touchSpace(event),
  ],

  checkpoint: (event) => [
    message(event, "checkpoint", { text: required<string>(event, "label") }),
    ...touchSpace(event),
  ],

  handoff: (event) => [
    message(event, "handoff", { text: required<string>(event, "context_summary") }),
    ...touchSpace(event),
  ],

  // A lead routed work: the route card in the lead's chat. Chips turns the task into a lane
  // (`run.requested`) or, past the depth limit, into a step; either way the lead's intent is
  // logged and shown here.
  task: (event) => [
    message(event, "task", { text: required<string>(event, "goal") }),
    ...touchSpace(event),
  ],

  // Chips opened a lane: the specialist's run in its own space, and the lane row both chats
  // read. One object, two views (blueprint). The specialist's task card is the message in the
  // home space; the lead's route card is the `task` above, in the lead's space.
  "run.requested": (event) => {
    const trail = required<TrailEntry[]>(event, "trail");
    const runId = event.run_id;
    const changes: Change[] = [
      {
        kind: "upsert",
        table: "lanes",
        row: {
          id: required<string>(event, "lane_id"),
          workspace_id: event.workspace_id,
          lead_id: required<string>(event, "requested_by"),
          specialist_id: required<string>(event, "specialist_id"),
          on_behalf_of: required<string>(event, "on_behalf_of"),
          origin_message_id: field<string>(event, "origin") ?? null,
          goal: required<string>(event, "goal"),
          state: "running",
          delivery: "pending",
          summary: null,
          // The trail is the person then every lead down to this one; the specialist is not in
          // it, so the number of leads — the lane's own nesting — is one fewer.
          depth: Math.max(1, trail.length - 1),
          run_id: runId ?? null,
          lead_run_id: trail.at(-1)?.run_id ?? null,
          home_space_id: event.space_id ?? null,
          linked_space_ids: JSON.stringify(field<string[]>(event, "link_to") ?? []),
          trail: JSON.stringify(trail),
          cost_usd: null,
          created_at: event.ts,
          updated_at: event.ts,
        },
      },
    ];
    // The specialist's run, seeded so its first message or completion lands without a
    // `run.started` — a harness that sends one restates this, which the run accepts.
    if (runId !== undefined) {
      changes.push({
        kind: "upsert",
        table: "runs",
        row: {
          id: runId,
          workspace_id: event.workspace_id,
          space_id: event.space_id ?? null,
          harness_id: required<string>(event, "specialist_id"),
          agent_id: field<string>(event, "agent_id") ?? null,
          goal: required<string>(event, "goal"),
          state: "running",
          status_phase: null,
          status_verb: null,
          plan: "[]",
          session_ref: null,
          summary: null,
          error: null,
          cost_usd: null,
          input_tokens: null,
          output_tokens: null,
          context_used: null,
          context_limit: null,
          started_at: event.ts,
          ended_at: null,
        },
      });
    }
    changes.push(message(event, "task", { text: required<string>(event, "goal") }));
    changes.push(...touchSpace(event));
    return changes;
  },

  // A lane you opened has news: its state, how far the result has travelled, and the summary
  // when there is one. Delivered into a lead space, so the route card there re-renders.
  "lane.updated": (event) => {
    const summary = field<string>(event, "summary");
    return [
      {
        kind: "patch",
        table: "lanes",
        key: { workspace_id: event.workspace_id, id: required<string>(event, "lane_id") },
        set: {
          state: required<string>(event, "state"),
          delivery: required<string>(event, "delivery"),
          ...(summary === undefined ? {} : { summary }),
          ...(field<number>(event, "cost_usd") === undefined
            ? {}
            : { cost_usd: field<number>(event, "cost_usd") }),
          updated_at: event.ts,
        },
      },
      ...touchSpace(event),
    ];
  },

  // A run-scoped report is the run's total so far and replaces what was there; a step's or a
  // lane's numbers add to it (blueprint: cost rolls up the trail). The harness's spend grows by
  // the difference either way.
  usage: (event) => [
    {
      kind: "spend",
      table: "runs",
      key: runKey(event),
      harness: { workspace_id: event.workspace_id, harness_id: harnessOf(event) },
      scope: required<"run" | "step" | "lane">(event, "scope"),
      inputTokens: field<number>(event, "input_tokens"),
      outputTokens: field<number>(event, "output_tokens"),
      usd: field<{ usd?: number }>(event, "cost")?.usd,
    },
  ],

  // A harness's policy is a projection (ADR 0019): the event is the truth, this row is the view.
  // The budget is written only when the event carries one; the spend is `usage`'s to grow.
  "policy.updated": (event) => {
    const policy = required<{ autonomy: number; rules: unknown[] }>(event, "policy");
    const budget = field<number>(event, "budget_usd");
    return [
      {
        kind: "upsert",
        table: "harness_policy",
        row: {
          workspace_id: event.workspace_id,
          harness_id: required<string>(event, "harness_id"),
          space_id: event.space_id ?? "*",
          autonomy: policy.autonomy,
          rules: JSON.stringify(policy.rules),
          ...(budget === undefined ? {} : { budget_usd: budget }),
          updated_at: event.ts,
          updated_seq: event.seq,
        },
      },
      {
        kind: "upsert",
        table: "workspace_policy",
        row: {
          workspace_id: event.workspace_id,
          max_autonomy: required<number>(event, "workspace_max_autonomy"),
          updated_at: event.ts,
          updated_seq: event.seq,
        },
      },
      // A policy change in a space is a muted centred line there (blueprint: system).
      ...(event.space_id === undefined
        ? []
        : [message(event, "system", { text: null }), ...touchSpace(event)]),
    ];
  },

  "context.usage": (event) => [
    {
      kind: "patch",
      table: "runs",
      key: { workspace_id: event.workspace_id, id: event.run_id },
      set: {
        context_used: required<number>(event, "used_tokens"),
        context_limit: required<number>(event, "limit_tokens"),
      },
    },
  ],

  "run.completed": (event) => [
    {
      kind: "run_transition",
      key: runKey(event),
      transition: "complete",
      set: { ended_at: event.ts, summary: required<string>(event, "summary") },
    },
    message(event, "summary", { text: required<string>(event, "summary") }),
    ...touchSpace(event),
  ],

  "run.failed": (event) => [
    {
      kind: "run_transition",
      key: runKey(event),
      transition: "fail",
      set: { ended_at: event.ts, error: required<string>(event, "error") },
    },
    message(event, "status", { text: required<string>(event, "error") }),
    ...touchSpace(event),
  ],

  "run.pause": (event) => [
    { kind: "run_transition", key: runKey(event), transition: "pause", set: {} },
  ],

  "run.resume": (event) => [
    { kind: "run_transition", key: runKey(event), transition: "resume", set: {} },
  ],

  "run.cancel": (event) => [
    {
      kind: "run_transition",
      key: runKey(event),
      transition: "cancel",
      set: { ended_at: event.ts },
    },
  ],

  "run.steer": (event) => [
    message(event, "text", { text: required<string>(event, "text") }),
    ...touchSpace(event),
  ],

  // A reaction or a note on a harness's message (M3.4): the room's activity moves. The client
  // folds it onto the message from the log, and the harness hears it as the event it is.
  feedback: (event) => touchSpace(event),

  // A person entered the workspace with a role (ADR 0034): the row every role rule reads.
  "person.joined": (event) => [
    {
      kind: "upsert",
      table: "workspace_members",
      row: {
        workspace_id: event.workspace_id,
        participant_id: required<string>(event, "participant_id"),
        role: required<string>(event, "role"),
        display_name: required<string>(event, "display_name"),
        invited_by: field<string>(event, "invited_by") ?? null,
        invite_id: field<string>(event, "invite_id") ?? null,
        joined_at: event.ts,
        updated_seq: event.seq,
      },
    },
  ],

  // A person named themselves again (ADR 0082): the members row keeps the name beside the role.
  // A patch, as for a role: a name for somebody who never joined is nobody's.
  "person.renamed": (event) => [
    {
      kind: "patch",
      table: "workspace_members",
      key: {
        workspace_id: event.workspace_id,
        participant_id: required<string>(event, "participant_id"),
      },
      set: { display_name: required<string>(event, "display_name"), updated_seq: event.seq },
    },
  ],

  // A person's face (ADR 0139), on their row: the registry's, which a rebuild keeps and this
  // writes again, so the last face in the log is the one they wear. `null` is the initials.
  "person.face_set": (event) => {
    const face = field<{ icon: string; ground: number; letters?: string } | null>(event, "face");
    return [
      {
        kind: "patch",
        table: "participants",
        key: { workspace_id: event.workspace_id, id: required<string>(event, "participant_id") },
        set: { face: face == null ? null : JSON.stringify(face) },
      },
    ];
  },

  // The caps replace each other whole — an event carries all three — so the last one in the
  // log is the row, live and on a rebuild alike (ADR 0047).
  "attachment.limits_set": (event) => [
    {
      kind: "upsert",
      table: "workspace_limits",
      row: {
        workspace_id: event.workspace_id,
        image_bytes: field<number | null>(event, "image_bytes") ?? null,
        video_bytes: field<number | null>(event, "video_bytes") ?? null,
        file_bytes: field<number | null>(event, "file_bytes") ?? null,
        set_by: event.actor.id,
        updated_seq: event.seq,
      },
    },
  ],

  // A harness removed (ADR 0078): the registry marks it, and its homes stop being homes here, so
  // a rebuild clears them as the live server did. No line in any room: nothing was said there.
  "harness.removed": (event) =>
    (field<string[]>(event, "homes") ?? []).map((spaceId) => ({
      kind: "patch" as const,
      table: "spaces" as const,
      key: { workspace_id: event.workspace_id, id: spaceId },
      set: { home: 0 },
    })),

  // A person removed from the workspace (ADR 0160): their standing goes, so no role rule finds
  // them and no list of the workspace's people has them. The registry marks them; their rooms each
  // have a `membership.removed` of their own.
  "person.removed": (event) => [
    {
      kind: "delete",
      table: "workspace_members",
      key: {
        workspace_id: event.workspace_id,
        participant_id: required<string>(event, "participant_id"),
      },
    },
  ],

  // A patch, not an upsert: a role for somebody who never joined is nobody's.
  "role.changed": (event) => [
    {
      kind: "patch",
      table: "workspace_members",
      key: {
        workspace_id: event.workspace_id,
        participant_id: required<string>(event, "participant_id"),
      },
      set: { role: required<string>(event, "role"), updated_seq: event.seq },
    },
  ],
};

/** The row a `message_id` names: the id of the event that carried it (decision 11). */
function messageRowId(event: EventLike): string {
  return eventIdOfMessage(required<string>(event, "message_id"));
}

function runKey(event: EventLike): Row {
  return { workspace_id: event.workspace_id, id: event.run_id };
}

/** `expires_in` is seconds from when the harness asked; the row stores the instant. */
function expiryOf(event: EventLike): string | null {
  const seconds = field<number>(event, "expires_in");
  return seconds === undefined ? null : addSeconds(event.ts, seconds);
}

function timeoutOf(event: EventLike): string | null {
  const seconds = field<number>(event, "timeout_seconds");
  return seconds === undefined ? null : addSeconds(event.ts, seconds);
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}

/** Event types that change a read model. The rest append and change nothing. */
export const PROJECTED_EVENT_TYPES: readonly string[] = Object.keys(PROJECTORS).sort();

/**
 * What this event means for the read models. Pure, total, and the same on replay as it was
 * live — which is the whole reason `rebuild` can be trusted.
 */
export function project(event: EventLike): Change[] {
  const projector = PROJECTORS[event.type];
  return projector === undefined ? [] : projector(event);
}
