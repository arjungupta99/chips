/**
 * How a harness's turns have gone since a time, for the computer watching a bridge release through
 * its first day (bridges-keep-current.md, rule 3): how many began since then and are over, how
 * many of those failed, and whether the last one over before then had failed too. A release whose
 * first turns all fail, where the turn before the switch hadn't, is put back.
 *
 * A turn a person stopped is neither done nor failed, and isn't counted.
 */

import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";

export interface TurnsSince {
  /** Turns begun since the time, done or failed. */
  readonly ended: number;
  /** Those of them that failed. */
  readonly failed: number;
  /** Whether the newest turn over that began before the time had failed: it was failing already. */
  readonly failedBefore: boolean;
}

export function createHarnessTurns(
  db: Kysely<Database>,
): (workspaceId: string, harnessId: string, sinceIso: string) => Promise<TurnsSince> {
  return async (workspaceId, harnessId, sinceIso) => {
    const over = () =>
      db
        .selectFrom("runs")
        .where("workspace_id", "=", workspaceId)
        .where("harness_id", "=", harnessId)
        .where("state", "in", ["done", "failed"]);
    const since = await over()
      .select(({ fn }) => ["state", fn.countAll<number>().as("turns")])
      .where("started_at", ">", sinceIso)
      .groupBy("state")
      .execute();
    const before = await over()
      .select("state")
      .where("started_at", "<=", sinceIso)
      .orderBy("started_at", "desc")
      .limit(1)
      .executeTakeFirst();
    const count = (state: string) => Number(since.find((each) => each.state === state)?.turns ?? 0);
    return {
      ended: count("done") + count("failed"),
      failed: count("failed"),
      failedBefore: before?.state === "failed",
    };
  };
}
