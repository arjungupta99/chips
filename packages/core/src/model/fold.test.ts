import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ClientEvent } from "../events.js";
import { APPROVAL_FOLDS } from "./approvals.js";
import { EXCHANGE_LIMITS_FOLDS } from "./exchange-limits.js";
import { buildModel, createFold, NEWER_LINE } from "./fold.js";
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

describe("an event this app has no way to draw", () => {
  const FIXTURES = fileURLToPath(new URL("../../../protocol/fixtures/", import.meta.url));
  const ROOM = "spc_01K4ZQPX000000000000000002";
  const fixture = (type: string, seq: number, overrides: Record<string, unknown> = {}) =>
    ({
      ...JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")),
      seq,
      ...overrides,
    }) as ClientEvent;
  const newer = (seq: number) =>
    ({
      ...fixture("message.post", seq, { space_id: ROOM }),
      id: `evt_${seq}`,
      type: "poll.opened",
    }) as ClientEvent;
  const lines = (events: ClientEvent[]) =>
    buildModel(events).spaces.find((space) => space.id === ROOM)?.lines ?? [];

  it("leaves one line of Chips's own for a run of them, in place of nothing", () => {
    const said = lines([
      fixture("space.created", 1, { space_id: ROOM }),
      newer(2),
      newer(3),
      fixture("message.post", 4, { space_id: ROOM, id: "evt_4" }),
      newer(5),
    ]);
    const notes = said.filter((line) => line.newer === true);
    expect(notes.map((line) => line.seq)).toEqual([2, 5]);
    expect(notes[0]).toMatchObject({
      kind: "system",
      whole: true,
      text: NEWER_LINE,
      authorKind: "system",
    });
  });

  it("leaves one line for a run of them folded behind a later line", () => {
    // A replay out of order: the room's later line is there before the run it comes after.
    const fold = createFold();
    fold.push([
      fixture("space.created", 1, { space_id: ROOM }),
      fixture("message.post", 100, { space_id: ROOM, id: "evt_100" }),
    ]);
    fold.push([newer(10), newer(11), newer(12)]);
    const said = fold.model().spaces.find((space) => space.id === ROOM)?.lines ?? [];
    expect(said.filter((line) => line.newer === true).map((line) => line.seq)).toEqual([10]);
    expect(said.map((line) => line.seq)).toEqual([10, 100]);
    // The run's own events one at a time, last first, are still one line.
    const backwards = createFold();
    backwards.push([fixture("space.created", 1, { space_id: ROOM })]);
    for (const seq of [12, 10, 11]) backwards.push([newer(seq)]);
    const notes = backwards.model().spaces.find((space) => space.id === ROOM)?.lines ?? [];
    expect(notes.filter((line) => line.newer === true)).toHaveLength(1);
  });

  it("makes its line from the envelope alone, whatever the event holds", () => {
    // Fields a message has, holding something else: an unknown event's are not a message's.
    const odd = {
      ...newer(2),
      attachments: 3,
      reply_to: "poll-7",
      mentions: "everyone",
      addressed_to: 7,
      addressed_people: { all: true },
      session_ref: 5,
      run_id: "run_01K4ZQPX000000000000000009",
      idempotency_key: "k1",
      held: true,
      heartbeat: true,
    } as unknown as ClientEvent;
    const said = lines([fixture("space.created", 1, { space_id: ROOM }), odd]);
    expect(said.filter((line) => line.newer === true)).toEqual([
      {
        id: "evt_2",
        seq: 2,
        kind: "system",
        authorId: "chips",
        authorKind: "system",
        text: NEWER_LINE,
        ts: odd.ts,
        whole: true,
        newer: true,
      },
    ]);
  });

  it("never throws, whatever JSON an unknown event holds", () => {
    const opened = fixture("space.created", 1, { space_id: ROOM });
    const envelope = newer(2);
    const kept = {
      seq: envelope.seq,
      type: envelope.type,
      id: envelope.id,
      ts: envelope.ts,
      workspace_id: envelope.workspace_id,
      space_id: ROOM,
      actor: envelope.actor,
    };
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (body) => {
        const said = lines([opened, { ...body, ...kept } as ClientEvent]);
        const notes = said.filter((line) => line.newer === true);
        expect(notes).toHaveLength(1);
        expect(Object.keys(notes[0] ?? {}).sort()).toEqual(
          ["authorId", "authorKind", "id", "kind", "newer", "seq", "text", "ts", "whole"].sort(),
        );
      }),
    );
  });

  it("leaves none for an event the catalogue has, drawn or not", () => {
    const said = lines([
      fixture("space.created", 1, { space_id: ROOM }),
      {
        ...fixture("message.post", 2, { space_id: ROOM }),
        id: "evt_2",
        type: "message.overheard",
      } as ClientEvent,
    ]);
    expect(said.some((line) => line.newer === true)).toBe(false);
  });
});
