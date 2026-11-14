/**
 * What an app understands, as one number (everything in step, "An older app always sees
 * something"). An app says its level in its `hello`; the computer sends each event as is to an app
 * whose level has it, and to one whose level doesn't, the line in words the event's addition came
 * with, or nothing. An app that says no level is one from before levels, and is sent everything as
 * it always was: those apps can't be told apart, and keep what they are sent in their caches.
 *
 * Adding an event a person's app is sent means: raise `CATALOGUE_LEVEL`, and put the event in
 * `LATER_EVENTS` with that level and its fallback. The catalogue test holds every event to one of
 * the two lists.
 */

/** The level of everything in this catalogue. */
export const CATALOGUE_LEVEL = 1;

/** Every event an app at level 1 knows: the catalogue as it stood on 13 November 2026. */
export const LEVEL_ONE_EVENTS: readonly string[] = [
  "agent.asked",
  "agent.attached",
  "agent.deleted",
  "agent.fork",
  "agent.lock_set",
  "agent.registered",
  "agent.released",
  "agent.updated",
  "approval.executed",
  "approval.held_started",
  "approval.held_stopped",
  "approval.request",
  "approval.resolved",
  "approval.routed",
  "artifact.create",
  "attachment.fetched",
  "attachment.limits_set",
  "budget.warning",
  "checkpoint",
  "context.compacted",
  "context.usage",
  "exchange.limits_set",
  "exchange.set",
  "feedback",
  "handoff",
  "harness.removed",
  "harness.transferred",
  "hello",
  "join.allowed",
  "join.denied",
  "lane.updated",
  "membership.added",
  "membership.removed",
  "membership.replaced",
  "message.deleted",
  "message.edited",
  "message.handed",
  "message.heard",
  "message.held",
  "message.hidden",
  "message.new",
  "message.overheard",
  "message.pinned",
  "message.post",
  "message.shown",
  "message.unpinned",
  "person.face_set",
  "person.joined",
  "person.removed",
  "person.renamed",
  "policy.updated",
  "project.changed",
  "question.answered",
  "question.ask",
  "receipt",
  "relay.set",
  "role.changed",
  "run.cancel",
  "run.completed",
  "run.failed",
  "run.pause",
  "run.plan",
  "run.requested",
  "run.resume",
  "run.started",
  "run.status",
  "run.steer",
  "session.ended",
  "session.renamed",
  "session.started",
  "space.claimed",
  "space.created",
  "space.erased",
  "space.lead_set",
  "space.lock_set",
  "space.spend_ceiling_lifted",
  "space.spend_ceiling_set",
  "space.updated",
  "step.log",
  "task",
  "turn.passed",
  "usage",
  "workspace.renamed",
];

/** A line in words an app below an event's level is sent in its place, said by an agent. */
export interface FallbackLine {
  /** The agent it is said by: one the event names, whom the app already knows. */
  readonly agentId: string;
  readonly text: string;
}

export interface LaterEvent {
  /** The level it came in at, above 1. */
  readonly level: number;
  /** What an app below that level is sent; nothing, when it has nothing to show. */
  readonly fallback: (event: Readonly<Record<string, unknown>>) => FallbackLine | undefined;
}

/** Events added after level 1, by type. */
export const LATER_EVENTS: Readonly<Record<string, LaterEvent>> = {};

/** The fields every event carries, which a fallback line keeps. */
const ENVELOPE = ["v", "id", "seq", "ts", "workspace_id", "space_id"] as const;

/**
 * An event as an app at `level` is sent it: as it is, a line in words in its place (a
 * `message.post` by the agent the line names, marked `fallback`, so an app that later reaches the
 * level reads the real one again), or nothing. `later` is the table; tests give their own.
 */
export function atLevel(
  event: Readonly<Record<string, unknown>>,
  level: number,
  later: Readonly<Record<string, LaterEvent>> = LATER_EVENTS,
): Readonly<Record<string, unknown>> | undefined {
  const type = event["type"];
  const entry = typeof type === "string" ? later[type] : undefined;
  if (entry === undefined || level >= entry.level) return event;
  const line = entry.fallback(event);
  if (line === undefined) return undefined;
  const kept = Object.fromEntries(
    ENVELOPE.filter((key) => key in event).map((key) => [key, event[key]]),
  );
  return {
    ...kept,
    type: "message.post",
    actor: { kind: "agent", id: line.agentId },
    text: line.text,
    fallback: true,
  };
}
