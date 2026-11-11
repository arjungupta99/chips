/**
 * What a room's job has spent, against what the room allows a job (ADR 0117): the shape a
 * person's device reads from `GET /v1/spaces/:id/spend`, and, through `cappedSpend`, what a
 * harness is handed as `context.spend` with a message. A room nobody has set a ceiling for allows
 * the default; a room with no cap allows any amount (`ceiling_usd: null`, ADR 0292).
 */

import { DEFAULT_SPEND_CEILING_USD, NO_SPEND_CEILING, type RoomJob } from "@chipschat/protocol";
import type { ReadModels } from "./ports/index.js";

export async function roomSpendFor(input: {
  readonly readModels: Pick<ReadModels, "jobSpendOf" | "spendCeilingOf">;
  readonly workspaceId: string;
  readonly spaceId: string;
  /** As of this seq, as a message is handed what was so when it was said; else as of now. */
  readonly uptoSeq?: number;
}): Promise<RoomJob> {
  const { readModels, workspaceId, spaceId, uptoSeq } = input;
  const [ceiling, spent] = await Promise.all([
    readModels.spendCeilingOf(workspaceId, spaceId),
    readModels.jobSpendOf(workspaceId, spaceId, uptoSeq === undefined ? {} : { uptoSeq }),
  ]);
  const ceiling_usd = ceiling === NO_SPEND_CEILING ? null : (ceiling ?? DEFAULT_SPEND_CEILING_USD);
  return { ceiling_usd, ...spent };
}
