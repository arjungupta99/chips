/**
 * What a room's job has spent, against what the room allows a job (ADR 0117): the shape a
 * harness is handed as `context.spend` with a message, and a person's device reads from
 * `GET /v1/spaces/:id/spend`. A room nobody has set a ceiling for allows the default.
 */

import { DEFAULT_SPEND_CEILING_USD, type JobSpend } from "@chipschat/protocol";
import type { ReadModels } from "./ports/index.js";

export async function roomSpendFor(input: {
  readonly readModels: Pick<ReadModels, "jobSpendOf" | "spendCeilingOf">;
  readonly workspaceId: string;
  readonly spaceId: string;
  /** As of this seq, as a message is handed what was so when it was said; else as of now. */
  readonly uptoSeq?: number;
}): Promise<JobSpend> {
  const { readModels, workspaceId, spaceId, uptoSeq } = input;
  const [ceiling, spent] = await Promise.all([
    readModels.spendCeilingOf(workspaceId, spaceId),
    readModels.jobSpendOf(workspaceId, spaceId, uptoSeq === undefined ? {} : { uptoSeq }),
  ]);
  return { ceiling_usd: ceiling ?? DEFAULT_SPEND_CEILING_USD, ...spent };
}
