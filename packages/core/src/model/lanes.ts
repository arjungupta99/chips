/** A lane: the lead's side, the specialist's side, and the news that comes back. */

import { attachmentFromWire } from "../attachments.js";
import type { ClientEvent } from "../events.js";
import { addLine, textLine } from "./lines.js";
import {
  type Building,
  type FoldStep,
  field,
  laneOf,
  linkSpace,
  type MutableLane,
  type MutableRun,
  type MutableSpace,
  required,
  runOf,
  spaceOf,
} from "./state.js";
import type { Lane, LaneDelivery, LaneHop, LaneState } from "./types.js";

/**
 * Seed the specialist's run from `run.requested`, so its first message or its completion lands
 * without a `run.started` — a harness that sends one restates this, which the run accepts. The
 * goal and the harness come from the lane; a run that already exists (an out-of-order event)
 * keeps what it has learned.
 */
export function seedLaneRun(
  state: Building,
  event: ClientEvent,
  lane: MutableLane,
  space: MutableSpace | undefined,
): void {
  if (event.run_id === undefined) return;
  const run = runOf(state, event) as MutableRun;
  // The harness it runs on, and the agent of it that works it (ADR 0087).
  run.harness = lane.specialistId;
  run.harnessId = field<string>(event, "agent_id") ?? lane.specialistId;
  run.spaceId = space?.id ?? run.spaceId;
  if (run.goal === "") run.goal = lane.goal;
  run.goalFrom ??= "chips";
  run.startedAt ??= event.ts;
}

/** The wire trail — `participant_id`, an optional run, an optional goal — as the fold holds it. */
export function trailOf(event: ClientEvent): LaneHop[] {
  const trail =
    field<{ participant_id: string; run_id?: string; goal?: string }[]>(event, "trail") ?? [];
  return trail.map((hop) => ({
    participantId: hop.participant_id,
    runId: hop.run_id,
    goal: hop.goal,
  }));
}

/**
 * The room a run worked in, when the reader has seen the run: a run is somewhere, and on a lane
 * between two spaces of one harness that somewhere is the only thing that tells its hops apart.
 */
function roomOfRun(state: Building, runId: string | undefined): string | undefined {
  if (runId === undefined) return undefined;
  const spaceId = state.runs.get(runId)?.spaceId;
  return spaceId === "" ? undefined : spaceId;
}

/**
 * What to call one hop of a lane between two spaces of one harness: the room it worked in, when
 * that room is one of the harness's own — opened by it and named after the part of it that works
 * there, a Jacobian Space's room — and has a title. There the lead and the specialist are one
 * participant, so its name tells the two ends apart no better than a monologue would (ADR 0032).
 *
 * Nothing otherwise, and the cards use the participant's name: on a lane between two
 * participants, whose names are the answer; for a room somebody else opened, a group room or a
 * direct space with the person, which is a place the harness works rather than a part of it; and
 * for a room the reader has not seen. J's own room is the direct space Chips opened when J was
 * added, so a hand-down from it still reads J.
 */
function roomLabel(
  state: Building,
  lane: MutableLane,
  participantId: string,
  spaceId: string | undefined,
): string | undefined {
  if (participantId !== lane.specialistId || spaceId === undefined) return undefined;
  const room = state.spaces.get(spaceId);
  return room?.openedBy === participantId ? room.title : undefined;
}

/** What the lead is called on a lane, and the room that is, when it is called after one. */
function leadRoomOf(
  state: Building,
  lane: MutableLane,
  leadRoom: string | undefined,
): { leadLabel?: string; leadSpaceId?: string } {
  const leadLabel = roomLabel(state, lane, lane.leadId, leadRoom);
  // A label is a room's title, so there is a room whenever there is a label.
  return leadLabel === undefined || leadRoom === undefined
    ? {}
    : { leadLabel, leadSpaceId: leadRoom };
}

/** Every lane the reader can see, newest first — the same order the sidebar reads spaces in. */
export function buildLanes(state: Building): Lane[] {
  return [...state.lanes.values()]
    .sort((a, b) => b.lastSeq - a.lastSeq)
    .map((lane): Lane => {
      // The lead routed from its run's room; with the run unseen, from the room it linked the
      // lane into, which a `task` names as the one it was sent from.
      const leadRoom = roomOfRun(state, lane.leadRunId) ?? lane.linkedSpaceIds[0];
      return {
        laneId: lane.laneId,
        runId: lane.runId,
        leadId: lane.leadId,
        specialistId: lane.specialistId,
        onBehalfOf: lane.onBehalfOf,
        leadRunId: lane.leadRunId,
        homeSpaceId: lane.homeSpaceId,
        linkedSpaceIds: [...lane.linkedSpaceIds],
        originMessageId: lane.originMessageId,
        goal: lane.goal,
        constraints: [...lane.constraints],
        deadline: lane.deadline,
        state: lane.state,
        delivery: lane.delivery,
        depth: lane.depth,
        trail: lane.trail.map((hop) => {
          const room =
            roomOfRun(state, hop.runId) ??
            (hop.runId !== undefined && hop.runId === lane.leadRunId ? leadRoom : undefined);
          const label = roomLabel(state, lane, hop.participantId, room);
          return label === undefined ? hop : { ...hop, label, spaceId: room };
        }),
        summary: lane.summary,
        attachments: lane.attachments === undefined ? undefined : [...lane.attachments],
        costUsd: lane.costUsd,
        label: lane.label,
        ...leadRoomOf(state, lane, leadRoom),
      };
    });
}

export const LANE_FOLDS: Readonly<Record<string, FoldStep>> = {
  // The lead's side of a lane. A `task` becomes the route card in the lead's chat and opens the
  // lane with what the lead knows; the specialist and the trail are filled in by `run.requested`,
  // which the router appends next. An ephemeral child's `to` is a label until then.
  task: (state, event) => {
    const laneId = field<string>(event, "task_id");
    if (laneId === undefined) return;
    const lane = laneOf(state, laneId);
    if (lane.leadId === "") lane.leadId = event.actor.id;
    if (lane.specialistId === "") lane.specialistId = required<string>(event, "to");
    if (lane.onBehalfOf === "") lane.onBehalfOf = required<string>(event, "on_behalf_of");
    if (lane.goal === "") lane.goal = required<string>(event, "goal");
    if (lane.constraints.length === 0)
      lane.constraints = field<string[]>(event, "constraints") ?? [];
    lane.deadline ??= field<string>(event, "deadline");
    lane.originMessageId ??= field<string>(event, "origin");
    lane.label ??= field<string>(event, "label");
    lane.leadRunId ??= event.run_id;
    linkSpace(lane, field<string>(event, "link_to") ?? event.space_id);
    lane.lastSeq = Math.max(lane.lastSeq, event.seq);
    addLine(spaceOf(state, event), {
      ...textLine(event, required<string>(event, "goal")),
      kind: "route",
      laneId,
    });
  },

  // The specialist's side: `run.requested` is what opens the lane (ADR 0029). It carries the
  // trail and the specialist, seeds the specialist's run so its first message lands without a
  // `run.started`, and draws the task card in the specialist's chat.
  "run.requested": (state, event) => {
    const laneId = field<string>(event, "lane_id");
    if (laneId === undefined) return;
    const lane = laneOf(state, laneId);
    lane.leadId = required<string>(event, "requested_by");
    lane.specialistId = required<string>(event, "specialist_id");
    lane.onBehalfOf = required<string>(event, "on_behalf_of");
    lane.goal = required<string>(event, "goal");
    lane.constraints = field<string[]>(event, "constraints") ?? lane.constraints;
    lane.deadline = field<string>(event, "deadline") ?? lane.deadline;
    lane.originMessageId = field<string>(event, "origin") ?? lane.originMessageId;
    lane.label = field<string>(event, "label") ?? lane.label;
    lane.runId = event.run_id ?? lane.runId;
    lane.homeSpaceId = event.space_id ?? lane.homeSpaceId;
    lane.trail = trailOf(event);
    lane.depth = Math.max(1, lane.trail.length - 1);
    lane.leadRunId = lane.trail.at(-1)?.runId ?? lane.leadRunId;
    for (const spaceId of field<string[]>(event, "link_to") ?? []) linkSpace(lane, spaceId);
    lane.lastSeq = Math.max(lane.lastSeq, event.seq);
    const space = spaceOf(state, event);
    seedLaneRun(state, event, lane, space);
    addLine(space, {
      ...textLine(event, required<string>(event, "goal")),
      kind: "task",
      laneId,
    });
  },

  // A lane you opened has news: it went to waiting, or completed with a summary and the cost
  // rolled onto it. It arrives in the lead's linked space, which `spaceOf` marks for a re-freeze.
  "lane.updated": (state, event) => {
    const laneId = field<string>(event, "lane_id");
    if (laneId === undefined) return;
    const lane = laneOf(state, laneId);
    lane.state = required<LaneState>(event, "state");
    lane.delivery = required<LaneDelivery>(event, "delivery");
    lane.summary = field<string>(event, "summary") ?? lane.summary;
    // The files the specialist's answer carried, so the lead's room has the answer and not only
    // the sentence about it. Kept once given: a later update with none does not take them away.
    const wire = field<Parameters<typeof attachmentFromWire>[0][]>(event, "attachments");
    if (wire !== undefined && wire.length > 0) lane.attachments = wire.map(attachmentFromWire);
    lane.costUsd = field<number>(event, "cost_usd") ?? lane.costUsd;
    lane.lastSeq = Math.max(lane.lastSeq, event.seq);
    spaceOf(state, event);
  },
};
