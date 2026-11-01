/**
 * Links that ask before they let anyone in (25 October 2026, ADR 0232).
 *
 * `invites` gains `asks`: the link went out as the relay's page, so redeeming it waits for its
 * maker's Allow. Invites already made ask too, since nothing says how they went out; any older
 * than 30 minutes are refused at use anyway.
 *
 * `join_requests` gains what a link's request needs: `asked_of`, the one person who decides it;
 * `invite_id`, the invite an `invite` request spends when it is collected; and `role`, the role
 * that invite gives. `null` for every request before this build.
 *
 * Both are registries, not projections: a rebuild does not touch them.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0053-links-ask";

export async function up(db: Db): Promise<void> {
  await db.schema
    .alterTable("invites")
    .addColumn("asks", "integer", (c) => c.notNull().defaultTo(1))
    .execute();
  await db.schema.alterTable("join_requests").addColumn("asked_of", "text").execute();
  await db.schema.alterTable("join_requests").addColumn("invite_id", "text").execute();
  await db.schema.alterTable("join_requests").addColumn("role", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("join_requests").dropColumn("role").execute();
  await db.schema.alterTable("join_requests").dropColumn("invite_id").execute();
  await db.schema.alterTable("join_requests").dropColumn("asked_of").execute();
  await db.schema.alterTable("invites").dropColumn("asks").execute();
}
