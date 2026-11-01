/**
 * M2.3: sessions, the visits a harness makes to a space (ADR 0024).
 *
 * A space is durable — a worktree, a Jacobian Space — and a session is one visit to it: a
 * terminal that opens, works and closes. The space outlives it, which is why this is its own
 * row rather than a column on `spaces`: two terminals in one worktree are two live sessions of
 * one space, and their runs are told apart by which one they came from.
 *
 * Not to be confused with `session_rules`, which is an approval's "for this session" scope.
 */

import { type Kysely, sql } from "kysely";

/** A migration runs against the schema of its own moment, so it must not be tied to today's. */
// biome-ignore lint/suspicious/noExplicitAny: see above.
type Db = Kysely<any>;

export const name = "0005-sessions";

export async function up(db: Db): Promise<void> {
  await refuseAPreRenameDatabase(db);
  // What a space is, in the adapter's own terms. Unique, so "find or create the space for this
  // worktree" is a lookup rather than a map the adapter could lose (ADR 0024).
  await db.schema.alterTable("spaces").addColumn("external_key", "text").execute();
  await db.schema
    .createIndex("spaces_workspace_id_external_key")
    .on("spaces")
    .columns(["workspace_id", "external_key"])
    .unique()
    .execute();

  await db.schema
    .createTable("sessions")
    .addColumn("workspace_id", "text", (c) => c.notNull())
    // The harness's own name for the visit, `<harness>:<session id>`. Unique per workspace:
    // it is what every run of that visit carries in `session_ref`.
    .addColumn("session_ref", "text", (c) => c.notNull())
    .addColumn("space_id", "text", (c) => c.notNull())
    .addColumn("harness_id", "text", (c) => c.notNull())
    .addColumn("state", "text", (c) => c.notNull().defaultTo("live"))
    .addColumn("started_reason", "text")
    .addColumn("ended_reason", "text")
    // Where it is running, for a person to read: "mbp · ~/Work/Chips".
    .addColumn("where", "text")
    .addColumn("transcript_ref", "text")
    .addColumn("started_at", "text", (c) => c.notNull())
    .addColumn("ended_at", "text")
    .addColumn("last_event_seq", "integer")
    .addPrimaryKeyConstraint("sessions_pkey", ["workspace_id", "session_ref"])
    .execute();
  // The session strip asks one question: which of this space's sessions are live?
  await db.schema
    .createIndex("sessions_workspace_id_space_id")
    .on("sessions")
    .columns(["workspace_id", "space_id"])
    .execute();
  // The harness card asks the same question across every space it works in.
  await db.schema
    .createIndex("sessions_workspace_id_harness_id_state")
    .on("sessions")
    .columns(["workspace_id", "harness_id", "state"])
    .execute();
}

/**
 * A database made before `conversations` became `spaces` (ADR 0024's addendum) has a ledger
 * saying 0001 to 0004 are applied and none of the tables this expects. The rename rewrote those
 * migrations in place rather than adding one, because nothing outside a scratch directory held
 * data — so there is nothing to migrate, and the honest answer is to say so rather than to fail
 * on the first missing table with a stack trace.
 */
async function refuseAPreRenameDatabase(db: Db): Promise<void> {
  const found = await sql<{
    name: string;
  }>`select name from sqlite_master where type = 'table' and name in ('spaces', 'conversations')`.execute(
    db,
  );
  const names = new Set(found.rows.map((row) => row.name));
  if (names.has("conversations") && !names.has("spaces")) {
    throw new Error(
      "This database was made before harness and space replaced agent and conversation " +
        "(4 September 2026). Its migrations were rewritten in place rather than added to, so " +
        "there is nothing to migrate: delete the data directory and start again.",
    );
  }
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("sessions").execute();
  await db.schema.dropIndex("spaces_workspace_id_external_key").execute();
  await db.schema.alterTable("spaces").dropColumn("external_key").execute();
}
