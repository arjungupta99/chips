/** The Kysely adapter for what a person wants of the gold banner (ADR 0286). */

import type { Kysely } from "kysely";
import type { BannerRegistry } from "../../application/ports/banners.js";
import type { Database } from "../db/schema.js";

export function createBannerRegistry(db: Kysely<Database>): BannerRegistry {
  return {
    async forPerson(workspaceId, participantId) {
      const [choices, closed] = await Promise.all([
        db
          .selectFrom("banner_choices")
          .select(["target_id", "shown"])
          .where("workspace_id", "=", workspaceId)
          .where("participant_id", "=", participantId)
          .execute(),
        db
          .selectFrom("closed_banners")
          .select(["space_id", "asker", "since"])
          .where("workspace_id", "=", workspaceId)
          .where("participant_id", "=", participantId)
          .orderBy("closed_at")
          .execute(),
      ]);
      return {
        choices: Object.fromEntries(choices.map((row) => [row.target_id, row.shown === 1])),
        closed,
      };
    },

    async choose({ workspaceId, participantId, target, shown, at }) {
      await db
        .insertInto("banner_choices")
        .values({
          workspace_id: workspaceId,
          participant_id: participantId,
          target_id: target,
          shown: shown ? 1 : 0,
          chosen_at: at,
        })
        .onConflict((conflict) =>
          conflict
            .columns(["workspace_id", "participant_id", "target_id"])
            .doUpdateSet({ shown: shown ? 1 : 0, chosen_at: at }),
        )
        .execute();
    },

    async unchoose({ workspaceId, participantId, target }) {
      await db
        .deleteFrom("banner_choices")
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId)
        .where("target_id", "=", target)
        .execute();
    },

    async chooseForHarness({ workspaceId, participantId, harnessId, agentIds, shown, at }) {
      await db.transaction().execute(async (trx) => {
        if (agentIds.length > 0) {
          await trx
            .deleteFrom("banner_choices")
            .where("workspace_id", "=", workspaceId)
            .where("participant_id", "=", participantId)
            .where("target_id", "in", agentIds)
            .execute();
        }
        await trx
          .insertInto("banner_choices")
          .values({
            workspace_id: workspaceId,
            participant_id: participantId,
            target_id: harnessId,
            shown: shown ? 1 : 0,
            chosen_at: at,
          })
          .onConflict((conflict) =>
            conflict
              .columns(["workspace_id", "participant_id", "target_id"])
              .doUpdateSet({ shown: shown ? 1 : 0, chosen_at: at }),
          )
          .execute();
      });
    },

    async close({ workspaceId, participantId, spaceId, asker, since, at }) {
      await db
        .insertInto("closed_banners")
        .values({
          workspace_id: workspaceId,
          participant_id: participantId,
          space_id: spaceId,
          asker,
          since,
          closed_at: at,
        })
        .onConflict((conflict) =>
          conflict
            .columns(["workspace_id", "participant_id", "space_id", "asker"])
            .doUpdateSet({ since, closed_at: at }),
        )
        .execute();
    },

    async reopen({ workspaceId, participantId, spaceId, asker }) {
      await db
        .deleteFrom("closed_banners")
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId)
        .where("space_id", "=", spaceId)
        .where("asker", "=", asker)
        .execute();
    },
  };
}
