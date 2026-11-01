/** Explicit provenance only: adjacent route rows and message text do not identify a speaker. */
import type { Lane, Line } from "./types.js";

/** The specialist identity carried by a lane's run, including same-room delegation. */
export function replyLane(line: Line, lanes: readonly Lane[]): Lane | undefined {
  if (line.authorKind !== "harness" || line.via !== undefined) return undefined;
  const runId = line.sourceRunId ?? line.runId;
  const matches = lanes.filter(
    (lane) =>
      lane.specialistId === line.authorId &&
      (line.laneId !== undefined
        ? lane.laneId === line.laneId
        : runId !== undefined && lane.runId === runId),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
