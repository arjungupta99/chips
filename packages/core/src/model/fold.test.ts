import { describe, expect, it } from "vitest";
import { APPROVAL_FOLDS } from "./approvals.js";
import { EXCHANGE_LIMITS_FOLDS } from "./exchange-limits.js";
import { LANE_FOLDS } from "./lanes.js";
import { LIMITS_FOLDS } from "./limits.js";
import { MESSAGE_FOLDS } from "./messages.js";
import { PEOPLE_FOLDS } from "./people.js";
import { POLICY_FOLDS } from "./policy.js";
import { PROJECT_FOLDS } from "./project.js";
import { RUN_FOLDS } from "./runs.js";
import { SESSION_FOLDS } from "./sessions.js";
import { SPACE_FOLDS } from "./spaces.js";
import { WORKSPACE_FOLDS } from "./workspace.js";

/**
 * The fold is one table split across eight files (M4.2). A key that moved to two families at
 * once, or one dropped on the way, would silently stop an event being folded — the screens
 * would simply not show it — so the table is asserted here rather than left to the behaviour
 * tests in `model.test.ts` to notice.
 */
const FAMILIES = {
  spaces: SPACE_FOLDS,
  sessions: SESSION_FOLDS,
  messages: MESSAGE_FOLDS,
  runs: RUN_FOLDS,
  approvals: APPROVAL_FOLDS,
  policy: POLICY_FOLDS,
  lanes: LANE_FOLDS,
  people: PEOPLE_FOLDS,
  limits: LIMITS_FOLDS,
  exchangeLimits: EXCHANGE_LIMITS_FOLDS,
  workspace: WORKSPACE_FOLDS,
  project: PROJECT_FOLDS,
} as const;

/** Every event type the client folds, as the one table held them before the split. */
const EVERY_EVENT = [
  "agent.asked",
  "agent.fork",
  "approval.executed",
  "approval.held_started",
  "approval.held_stopped",
  "approval.request",
  "approval.resolved",
  "approval.routed",
  "attachment.fetched",
  "attachment.limits_set",
  "budget.warning",
  "checkpoint",
  "context.compacted",
  "context.usage",
  "exchange.limits_set",
  "exchange.set",
  "feedback",
  "harness.removed",
  "harness.transferred",
  "lane.updated",
  "membership.added",
  "membership.removed",
  "membership.replaced",
  "message.deleted",
  "message.edited",
  "message.handed",
  "message.heard",
  "message.hidden",
  "message.pinned",
  "message.post",
  "message.shown",
  "message.unpinned",
  "person.joined",
  "person.removed",
  "person.renamed",
  "policy.updated",
  "project.changed",
  "question.answered",
  "question.ask",
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

const everyKey = Object.values(FAMILIES).flatMap((family) => Object.keys(family));

describe("the fold table", () => {
  it("holds every event type the client folds", () => {
    expect([...everyKey].sort()).toEqual(EVERY_EVENT);
  });

  it("gives each event type to exactly one family", () => {
    expect(new Set(everyKey).size).toBe(everyKey.length);
  });

  it("has a handler behind every key", () => {
    for (const [family, folds] of Object.entries(FAMILIES)) {
      for (const [key, step] of Object.entries(folds)) {
        expect(typeof step, `${family}.${key}`).toBe("function");
      }
    }
  });
});
