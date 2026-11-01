/**
 * Whether two readings of a room's lanes say the same thing, so the room can keep the array it
 * had. The model builds every lane afresh at each flush — a lane's labels are read off the
 * spaces around it, so the fold cannot cheaply know one is unchanged — and the rows of the room
 * are memoised on their props; a fresh array on every event anywhere in the workspace would draw
 * the whole room again for a message in another one. So the fields a row reads are compared,
 * one by one, and a lane that reads the same is the same.
 *
 * Pure, over the type alone, so a test can hand it two literals.
 */

import type { Lane } from "@chipschat/core";

const FLAT = [
  "laneId",
  "runId",
  "leadId",
  "specialistId",
  "onBehalfOf",
  "leadRunId",
  "homeSpaceId",
  "originMessageId",
  "goal",
  "deadline",
  "state",
  "delivery",
  "depth",
  "summary",
  "costUsd",
  "label",
  "leadLabel",
] as const;

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((each, index) => each === b[index]);
}

/** The hops and the files are small, and rarely change: their JSON is the cheapest honest compare. */
function sameShape(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export function sameLane(a: Lane, b: Lane): boolean {
  return (
    FLAT.every((field) => a[field] === b[field]) &&
    sameList(a.linkedSpaceIds, b.linkedSpaceIds) &&
    sameList(a.constraints, b.constraints) &&
    sameShape(a.trail, b.trail) &&
    sameShape(a.attachments, b.attachments)
  );
}

export function sameLanes(before: readonly Lane[], after: readonly Lane[]): boolean {
  return (
    before.length === after.length &&
    before.every((lane, index) => sameLane(lane, after[index] as Lane))
  );
}
