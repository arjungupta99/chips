/**
 * M5.1: people join by invite, hold a role in the workspace, and come back by passkey
 * (ADR 0034).
 *
 * Three tables. `workspace_members` is a projection of `person.joined` and `role.changed`:
 * a person's standing in the workspace — owner, admin, member or guest — as distinct from their
 * standing in a room, which `memberships` holds. `invites` and `passkeys` are registry rows
 * (ADR 0018): an invite is a capability stored as a digest, and a passkey's public key is a
 * credential, and neither belongs in an exportable log.
 *
 * Every person who exists already is given a `person.joined` here, so the read model can be
 * rebuilt from the log for them too: the oldest person in each workspace is its owner, the rest
 * are members. The events are keyed `0009-joined-<person>`, which is also how `down` finds them.
 */

import { createIdGenerator } from "@chipschat/protocol";
import { type Kysely, sql } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0009-people";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("workspace_members")
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("participant_id", "text", (c) => c.notNull())
    .addColumn("role", "text", (c) => c.notNull())
    .addColumn("display_name", "text", (c) => c.notNull())
    .addColumn("invited_by", "text")
    .addColumn("invite_id", "text")
    .addColumn("joined_at", "text", (c) => c.notNull())
    .addColumn("updated_seq", "integer", (c) => c.notNull().defaultTo(0))
    .addPrimaryKeyConstraint("workspace_members_pk", ["workspace_id", "participant_id"])
    .execute();
  // Counting a workspace's owners, and listing its people by role.
  await db.schema
    .createIndex("workspace_members_workspace_id_role")
    .on("workspace_members")
    .columns(["workspace_id", "role"])
    .execute();

  await db.schema
    .createTable("invites")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("token_hash", "text", (c) => c.notNull())
    .addColumn("role", "text", (c) => c.notNull())
    .addColumn("single_use", "integer", (c) => c.notNull().defaultTo(1))
    .addColumn("uses", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("created_by", "text", (c) => c.notNull())
    .addColumn("created_at", "text", (c) => c.notNull())
    .addColumn("expires_at", "text", (c) => c.notNull())
    .addColumn("revoked_at", "text")
    .execute();
  // Redeeming an invite: one lookup by the digest of the token presented.
  await db.schema
    .createIndex("invites_token_hash")
    .on("invites")
    .column("token_hash")
    .unique()
    .execute();
  // Listing a workspace's invites, newest first.
  await db.schema
    .createIndex("invites_workspace_id_created_at")
    .on("invites")
    .columns(["workspace_id", "created_at"])
    .execute();

  await db.schema
    .createTable("passkeys")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("participant_id", "text", (c) => c.notNull().references("participants.id"))
    .addColumn("credential_id", "text", (c) => c.notNull())
    .addColumn("public_key", "text", (c) => c.notNull())
    .addColumn("algorithm", "integer", (c) => c.notNull())
    .addColumn("sign_count", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("transports", "text")
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("created_at", "text", (c) => c.notNull())
    .addColumn("last_used_at", "text")
    .addColumn("revoked_at", "text")
    .execute();
  // Signing in: the authenticator names the credential, and one lookup finds whose it is.
  await db.schema
    .createIndex("passkeys_credential_id")
    .on("passkeys")
    .column("credential_id")
    .unique()
    .execute();
  // Listing a person's passkeys.
  await db.schema
    .createIndex("passkeys_workspace_id_participant_id")
    .on("passkeys")
    .columns(["workspace_id", "participant_id"])
    .execute();

  await backfill(db);
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("passkeys").execute();
  await db.schema.dropTable("invites").execute();
  await db.schema.dropTable("workspace_members").execute();
  await db.deleteFrom("events").where("idempotency_key", "like", "0009-joined-%").execute();
}

interface PersonRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly display_name: string;
  readonly created_at: string;
}

/**
 * A `person.joined` for everyone who was here before roles were: the oldest person in each
 * workspace — who ran `chips serve`, or the demo's own — is its owner, and the rest are
 * members. Appended the way the store appends, one seq per workspace, and projected by hand
 * into the table this migration just made; a later `rebuild` reproduces the same rows from
 * these events.
 */
async function backfill(db: Db): Promise<void> {
  const ids = createIdGenerator();
  const appendedAt = new Date().toISOString();
  const people = (await db
    .selectFrom("participants")
    .select(["id", "workspace_id", "display_name", "created_at"])
    .where("kind", "=", "person")
    .orderBy("workspace_id", "asc")
    .orderBy("created_at", "asc")
    .orderBy("id", "asc")
    .execute()) as PersonRow[];

  const owned = new Set<string>();
  for (const person of people) {
    const role = owned.has(person.workspace_id) ? "member" : "owner";
    owned.add(person.workspace_id);
    const id = ids.next("event");
    const payload = {
      v: 1,
      type: "person.joined",
      id,
      ts: person.created_at,
      workspace_id: person.workspace_id,
      actor: { kind: "person", id: person.id },
      idempotency_key: `0009-joined-${person.id}`,
      participant_id: person.id,
      display_name: person.display_name,
      role,
    };
    const inserted = await db
      .insertInto("events")
      .values({
        workspace_id: person.workspace_id,
        seq: sql`(select coalesce(max(seq), 0) + 1 from events where workspace_id = ${person.workspace_id})`,
        id,
        type: "person.joined",
        ts: person.created_at,
        space_id: null,
        run_id: null,
        actor_kind: "person",
        actor_id: person.id,
        idempotency_key: payload.idempotency_key,
        payload: JSON.stringify(payload),
        appended_at: appendedAt,
      })
      .returning("seq")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("workspace_members")
      .values({
        workspace_id: person.workspace_id,
        participant_id: person.id,
        role,
        display_name: person.display_name,
        invited_by: null,
        invite_id: null,
        joined_at: person.created_at,
        updated_seq: (inserted as { seq: number }).seq,
      })
      .execute();
  }
}
