/**
 * ADR 0062: the Activity card is withdrawn, and its projection goes with it. 0023 stays in the
 * list because databases have applied it; this takes its table away again. The `activity.updated`
 * events already in a log stay there, as every event does, and nothing reads them.
 */
import type { Kysely } from "kysely";
import { up as createActivities, down as dropActivities } from "./0023-activities.js";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;
export const name = "0024-activities-withdrawn";

export async function up(db: Db): Promise<void> {
  await dropActivities(db);
}

export async function down(db: Db): Promise<void> {
  await createActivities(db);
}
