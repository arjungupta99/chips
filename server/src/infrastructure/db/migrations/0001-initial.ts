/**
 * The first migration: the sixteen tables of M0.3.
 *
 * Every index here is declared beside the query that needs it (technical-plan 6.2). Where an
 * index exists for a query that has not been written yet, the comment says which one.
 */

import { type Kysely, sql } from "kysely";

/** A migration runs against the schema of its own moment, so it must not be tied to today's. */
// biome-ignore lint/suspicious/noExplicitAny: see above.
type Db = Kysely<any>;

export const name = "0001-initial";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("workspaces")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("max_autonomy", "integer", (c) => c.notNull().defaultTo(2))
    .addColumn("created_at", "text", (c) => c.notNull())
    .execute();

  await db.schema
    .createTable("participants")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("kind", "text", (c) => c.notNull())
    .addColumn("display_name", "text", (c) => c.notNull())
    .addColumn("owner_id", "text")
    .addColumn("autonomy", "integer")
    .addColumn("budget_usd", "real")
    .addColumn("spent_usd", "real")
    .addColumn("parent_id", "text")
    .addColumn("ephemeral", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("capabilities", "text")
    .addColumn("created_at", "text", (c) => c.notNull())
    .execute();

  // Listing a workspace's harnesses, and finding the harnesses a person owns.
  await index(db, "participants", ["workspace_id", "kind"]);
  await index(db, "participants", ["workspace_id", "owner_id"]);

  await db.schema
    .createTable("devices")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("participant_id", "text", (c) => c.notNull().references("participants.id"))
    .addColumn("public_key", "text", (c) => c.notNull())
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("paired_at", "text", (c) => c.notNull())
    .addColumn("last_seen_at", "text")
    .addColumn("revoked_at", "text")
    .execute();

  // Verifying a signed request: look the device up by the key it signed with.
  await db.schema
    .createIndex("devices_workspace_public_key")
    .on("devices")
    .columns(["workspace_id", "public_key"])
    .unique()
    .execute();

  await db.schema
    .createTable("harness_tokens")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("harness_id", "text", (c) => c.notNull().references("participants.id"))
    .addColumn("token_hash", "text", (c) => c.notNull())
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("created_at", "text", (c) => c.notNull())
    .addColumn("last_used_at", "text")
    .addColumn("revoked_at", "text")
    .execute();

  // Authenticating a bearer token: one lookup by hash. The comparison itself is constant-time.
  await db.schema
    .createIndex("harness_tokens_hash")
    .on("harness_tokens")
    .column("token_hash")
    .unique()
    .execute();
  await index(db, "harness_tokens", ["workspace_id", "harness_id"]);

  // ---- the log ----
  await db.schema
    .createTable("events")
    .addColumn("workspace_id", "text", (c) => c.notNull())
    .addColumn("seq", "integer", (c) => c.notNull())
    .addColumn("id", "text", (c) => c.notNull())
    .addColumn("type", "text", (c) => c.notNull())
    .addColumn("ts", "text", (c) => c.notNull())
    .addColumn("space_id", "text")
    .addColumn("run_id", "text")
    .addColumn("actor_kind", "text", (c) => c.notNull())
    .addColumn("actor_id", "text", (c) => c.notNull())
    .addColumn("idempotency_key", "text")
    .addColumn("payload", "text", (c) => c.notNull())
    .addColumn("appended_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("events_pk", ["workspace_id", "seq"])
    .execute();

  // Sending the same event twice is a no-op, whether it is retried by id or by key.
  await db.schema
    .createIndex("events_workspace_id_unique")
    .on("events")
    .columns(["workspace_id", "id"])
    .unique()
    .execute();
  await db.schema
    .createIndex("events_idempotency_key")
    .on("events")
    .columns(["workspace_id", "idempotency_key"])
    .unique()
    .where(sql.ref("idempotency_key"), "is not", null)
    .execute();

  // The audit view of one run, and of one space.
  await index(db, "events", ["workspace_id", "run_id", "seq"]);
  await index(db, "events", ["workspace_id", "space_id", "seq"]);

  // ---- projections ----
  await db.schema
    .createTable("spaces")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull())
    .addColumn("kind", "text", (c) => c.notNull().defaultTo("group"))
    .addColumn("title", "text")
    .addColumn("created_at", "text", (c) => c.notNull())
    .addColumn("last_activity_at", "text")
    .addColumn("last_event_seq", "integer")
    .execute();

  // The space list, most recent first.
  await index(db, "spaces", ["workspace_id", "last_activity_at"]);

  await db.schema
    .createTable("memberships")
    .addColumn("workspace_id", "text", (c) => c.notNull())
    .addColumn("space_id", "text", (c) => c.notNull())
    .addColumn("participant_id", "text", (c) => c.notNull())
    .addColumn("role", "text", (c) => c.notNull())
    .addColumn("joined_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("memberships_pk", ["space_id", "participant_id"])
    .execute();

  // Which spaces a participant is in.
  await index(db, "memberships", ["workspace_id", "participant_id"]);

  await db.schema
    .createTable("messages")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull())
    .addColumn("space_id", "text")
    .addColumn("run_id", "text")
    .addColumn("seq", "integer")
    .addColumn("type", "text", (c) => c.notNull())
    .addColumn("author_kind", "text", (c) => c.notNull())
    .addColumn("author_id", "text", (c) => c.notNull())
    .addColumn("text", "text")
    .addColumn("reply_to", "text")
    .addColumn("attachments", "text")
    .addColumn("approval_id", "text")
    .addColumn("ask_id", "text")
    .addColumn("created_at", "text", (c) => c.notNull())
    .execute();

  // The space screen: a page of messages, newest first, by cursor and never by offset.
  await index(db, "messages", ["workspace_id", "space_id", "seq"]);
  // The receipt panel: every message a run produced.
  await index(db, "messages", ["workspace_id", "run_id"]);

  await db.schema
    .createTable("runs")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull())
    .addColumn("space_id", "text")
    .addColumn("harness_id", "text", (c) => c.notNull())
    .addColumn("goal", "text", (c) => c.notNull())
    .addColumn("state", "text", (c) => c.notNull())
    .addColumn("status_phase", "text")
    .addColumn("status_verb", "text")
    .addColumn("plan", "text")
    .addColumn("session_ref", "text")
    .addColumn("summary", "text")
    .addColumn("error", "text")
    .addColumn("cost_usd", "real")
    .addColumn("input_tokens", "integer")
    .addColumn("output_tokens", "integer")
    .addColumn("context_used", "integer")
    .addColumn("context_limit", "integer")
    .addColumn("started_at", "text", (c) => c.notNull())
    .addColumn("ended_at", "text")
    .execute();

  // The runs still going, for the fleet view and for the status pill.
  await index(db, "runs", ["workspace_id", "state", "started_at"]);
  await index(db, "runs", ["workspace_id", "space_id", "started_at"]);

  await db.schema
    .createTable("steps")
    .addColumn("workspace_id", "text", (c) => c.notNull())
    .addColumn("run_id", "text", (c) => c.notNull())
    .addColumn("step_id", "text", (c) => c.notNull())
    .addColumn("ordinal", "integer")
    .addColumn("title", "text")
    .addColumn("status", "text", (c) => c.notNull())
    .addColumn("tool", "text")
    .addColumn("summary", "text")
    .addColumn("sources", "text")
    .addColumn("duration_ms", "integer")
    .addColumn("error", "text")
    .addColumn("updated_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("steps_pk", ["run_id", "step_id"])
    .execute();

  // The run timeline: every step of one run, in plan order.
  await index(db, "steps", ["workspace_id", "run_id", "ordinal"]);

  await db.schema
    .createTable("approvals")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull())
    .addColumn("space_id", "text")
    .addColumn("run_id", "text")
    .addColumn("step_id", "text")
    .addColumn("action", "text", (c) => c.notNull())
    .addColumn("preview", "text")
    .addColumn("risk", "text", (c) => c.notNull())
    .addColumn("sources", "text")
    .addColumn("requested_at", "text", (c) => c.notNull())
    .addColumn("expires_at", "text")
    .addColumn("fallback", "text", (c) => c.notNull().defaultTo("deny"))
    .addColumn("approvers", "text")
    .addColumn("editable", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("state", "text", (c) => c.notNull())
    .addColumn("decision", "text")
    .addColumn("scope", "text")
    .addColumn("reason", "text")
    .addColumn("updated_input", "text")
    .addColumn("resolved_by", "text")
    .addColumn("resolved_at", "text")
    .addColumn("executed_outcome", "text")
    .addColumn("executed_detail", "text")
    .execute();

  // For you: what is still pending, oldest first. And the expiry sweep.
  await index(db, "approvals", ["workspace_id", "state", "requested_at"]);
  await index(db, "approvals", ["state", "expires_at"]);
  await index(db, "approvals", ["workspace_id", "run_id"]);

  await db.schema
    .createTable("questions")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull())
    .addColumn("space_id", "text")
    .addColumn("run_id", "text")
    .addColumn("questions", "text", (c) => c.notNull())
    .addColumn("asked_at", "text", (c) => c.notNull())
    .addColumn("timeout_at", "text")
    .addColumn("on_no_answer", "text", (c) => c.notNull().defaultTo("use_default"))
    .addColumn("state", "text", (c) => c.notNull())
    .addColumn("answers", "text")
    .addColumn("answered_by", "text")
    .addColumn("answered_at", "text")
    .addColumn("timed_out", "integer", (c) => c.notNull().defaultTo(0))
    .execute();

  await index(db, "questions", ["workspace_id", "state", "asked_at"]);
  await index(db, "questions", ["state", "timeout_at"]);

  await db.schema
    .createTable("attachments")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull())
    .addColumn("filename", "text", (c) => c.notNull())
    .addColumn("mime_type", "text", (c) => c.notNull())
    .addColumn("byte_size", "integer", (c) => c.notNull())
    .addColumn("sha256", "text", (c) => c.notNull())
    .addColumn("width", "integer")
    .addColumn("height", "integer")
    .addColumn("duration_ms", "integer")
    .addColumn("created_at", "text", (c) => c.notNull())
    .execute();

  // The store is content-addressed: the same bytes are stored once per workspace.
  await index(db, "attachments", ["workspace_id", "sha256"]);

  await db.schema
    .createTable("lanes")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull())
    .addColumn("lead_id", "text", (c) => c.notNull())
    .addColumn("specialist_id", "text", (c) => c.notNull())
    .addColumn("on_behalf_of", "text", (c) => c.notNull())
    .addColumn("origin_message_id", "text")
    .addColumn("goal", "text", (c) => c.notNull())
    .addColumn("state", "text", (c) => c.notNull())
    .addColumn("delivery", "text", (c) => c.notNull())
    .addColumn("summary", "text")
    .addColumn("depth", "integer", (c) => c.notNull().defaultTo(1))
    .addColumn("created_at", "text", (c) => c.notNull())
    .addColumn("updated_at", "text", (c) => c.notNull())
    .execute();

  // Phase 3: the lanes a lead opened, and the lanes a specialist owes.
  await index(db, "lanes", ["workspace_id", "lead_id", "state"]);
  await index(db, "lanes", ["workspace_id", "specialist_id", "state"]);

  await db.schema
    .createTable("read_state")
    .addColumn("workspace_id", "text", (c) => c.notNull())
    .addColumn("space_id", "text", (c) => c.notNull())
    .addColumn("participant_id", "text", (c) => c.notNull())
    .addColumn("last_read_seq", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("updated_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("read_state_pk", ["space_id", "participant_id"])
    .execute();

  // The unread badge, per participant.
  await index(db, "read_state", ["workspace_id", "participant_id"]);
}

export async function down(db: Db): Promise<void> {
  for (const table of [
    "read_state",
    "lanes",
    "attachments",
    "questions",
    "approvals",
    "steps",
    "runs",
    "messages",
    "memberships",
    "spaces",
    "events",
    "harness_tokens",
    "devices",
    "participants",
    "workspaces",
  ]) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}

/** A non-unique index, named after the table and its columns so a plan is easy to read. */
async function index(db: Db, table: string, columns: string[]): Promise<void> {
  await db.schema
    .createIndex(`${table}_${columns.join("_")}`)
    .on(table)
    .columns(columns)
    .execute();
}
