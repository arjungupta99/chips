/**
 * The catalogue is the contract every layer reads. These tests hold three invariants:
 * every declared event has a fixture, every fixture parses, and every fixture is exactly
 * what the schema says it is — so a fixture cannot quietly become wrong.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EVENT_TYPES, EVENTS, eventDefinition, parseEvent, schemaFor } from "./catalogue.js";
import { CHIPS_TO_HARNESS } from "./chips-to-harness.js";
import { HARNESS_TO_CHIPS } from "./harness-to-chips.js";
import { WORKSPACE_EVENTS } from "./workspace.js";

const FIXTURES = fileURLToPath(new URL("../../fixtures/", import.meta.url));

function fixture(type: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8"));
}

const fixtureFiles = readdirSync(FIXTURES)
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.replace(/\.json$/, ""));

describe("the catalogue", () => {
  it("declares the twenty events a harness sends", () => {
    expect(HARNESS_TO_CHIPS.map((event) => event.type)).toEqual([
      "session.started",
      "session.ended",
      "session.renamed",
      "run.started",
      "run.status",
      "run.plan",
      "step.log",
      "message.post",
      "message.heard",
      "approval.request",
      "question.ask",
      "artifact.create",
      "checkpoint",
      "handoff",
      "task",
      "usage",
      "context.usage",
      "approval.executed",
      "run.completed",
      "run.failed",
    ]);
  });

  it("declares the fifteen events Chips sends", () => {
    expect(CHIPS_TO_HARNESS.map((event) => event.type)).toEqual([
      "hello",
      "message.new",
      "message.overheard",
      "run.requested",
      "approval.resolved",
      "question.answered",
      "run.steer",
      "run.pause",
      "run.resume",
      "run.cancel",
      "policy.updated",
      "budget.warning",
      "lane.updated",
      "feedback",
      "receipt",
    ]);
  });

  it("declares the forty-four events Chips records about a workspace", () => {
    expect(WORKSPACE_EVENTS.map((event) => event.type)).toEqual([
      "space.created",
      "space.updated",
      "space.claimed",
      "space.erased",
      "membership.added",
      "membership.removed",
      "membership.replaced",
      "agent.registered",
      "agent.updated",
      "agent.deleted",
      "agent.lock_set",
      "agent.attached",
      "agent.released",
      "agent.fork",
      "agent.asked",
      "message.held",
      "exchange.set",
      "message.handed",
      "space.lead_set",
      "space.spend_ceiling_set",
      "space.lock_set",
      "turn.passed",
      "context.compacted",
      "attachment.fetched",
      "project.changed",
      "person.joined",
      "person.renamed",
      "person.face_set",
      "role.changed",
      "harness.transferred",
      "harness.removed",
      "person.removed",
      "join.allowed",
      "join.denied",
      "message.edited",
      "message.deleted",
      "message.hidden",
      "message.shown",
      "message.pinned",
      "message.unpinned",
      "approval.routed",
      "approval.held_stopped",
      "attachment.limits_set",
      "exchange.limits_set",
      "workspace.renamed",
      "relay.set",
    ]);
  });

  it("names every event once", () => {
    expect(new Set(EVENT_TYPES).size).toBe(EVENT_TYPES.length);
  });

  /**
   * Who writes each event, pinned (agents review, finding 1). The door refuses what this says a
   * sender does not send, so a line that changes here changes who may write to the log: four agent
   * events once defaulted to "a person may", and a guest could rename another person's agent.
   */
  it("says who sends every event", () => {
    const by = (sender: string) =>
      EVENTS.filter((event) => event.sender === sender).map((event) => event.type);
    expect(by("harness")).toEqual([
      "session.started",
      "session.ended",
      "session.renamed",
      "run.started",
      "run.status",
      "run.plan",
      "step.log",
      "message.heard",
      "approval.request",
      "question.ask",
      "artifact.create",
      "checkpoint",
      "handoff",
      "task",
      "usage",
      "context.usage",
      "approval.executed",
      "run.completed",
      "run.failed",
    ]);
    expect(by("person")).toEqual([
      "run.steer",
      "run.pause",
      "run.resume",
      "run.cancel",
      "policy.updated",
      "feedback",
      "space.created",
      "membership.added",
      "membership.removed",
      "role.changed",
      "message.hidden",
      "message.shown",
      "message.pinned",
      "message.unpinned",
      "approval.routed",
      "approval.held_stopped",
      "attachment.limits_set",
      "exchange.limits_set",
    ]);
    expect(by("either")).toEqual([
      "message.post",
      "approval.resolved",
      "question.answered",
      "space.updated",
      "message.edited",
      "message.deleted",
    ]);
    expect(by("chips")).toEqual([
      "hello",
      "message.new",
      "message.overheard",
      "run.requested",
      "budget.warning",
      "lane.updated",
      "receipt",
      "space.claimed",
      "space.erased",
      "membership.replaced",
      "agent.registered",
      "agent.updated",
      "agent.deleted",
      "agent.lock_set",
      "agent.attached",
      "agent.released",
      "agent.fork",
      "agent.asked",
      "message.held",
      "exchange.set",
      "message.handed",
      "space.lead_set",
      "space.spend_ceiling_set",
      "space.lock_set",
      "turn.passed",
      "context.compacted",
      "attachment.fetched",
      "project.changed",
      "person.joined",
      "person.renamed",
      "person.face_set",
      "harness.transferred",
      "harness.removed",
      "person.removed",
      "join.allowed",
      "join.denied",
      "workspace.renamed",
      "relay.set",
    ]);
    expect(
      EVENTS.filter((event) => !["harness", "person", "either", "chips"].includes(event.sender)),
    ).toEqual([]);
  });

  it("names only fields an event has as Chips's to write", () => {
    for (const event of EVENTS) {
      for (const field of event.chipsWrites ?? []) {
        expect(event.payload.shape, `${event.type} has no ${field}`).toHaveProperty(field);
      }
    }
  });

  it("gives every event a summary and a schema", () => {
    for (const event of EVENTS) {
      expect(event.summary.length, `${event.type} has no summary`).toBeGreaterThan(20);
      expect(schemaFor(event.type), `${event.type} has no schema`).toBeDefined();
    }
  });

  it("has no fixture for an event it does not declare", () => {
    expect(fixtureFiles.filter((name) => eventDefinition(name) === undefined)).toEqual([]);
  });

  it("has a fixture for every event it declares", () => {
    expect(EVENT_TYPES.filter((type) => !fixtureFiles.includes(type))).toEqual([]);
  });
});

describe("every fixture", () => {
  it.each(EVENTS.map((event) => [event.type]))("%s parses", (type) => {
    const result = parseEvent(fixture(type));
    if (!result.ok)
      throw new Error(`${type}: ${result.error.message} ${JSON.stringify(result.error.issues)}`);
    expect(result.value["type"]).toBe(type);
  });

  it.each(EVENTS.map((event) => [event.type]))("%s says who acted and where", (type) => {
    const parsed = fixture(type) as Record<string, unknown>;
    expect(parsed["v"]).toBe(1);
    expect(parsed["workspace_id"]).toMatch(/^ws_/);
    expect(parsed["id"]).toMatch(/^evt_/);
    expect(parsed["actor"]).toMatchObject({ kind: expect.any(String), id: expect.any(String) });
  });

  it.each(EVENTS.filter((event) => event.requiresRun).map((event) => [event.type]))(
    "%s carries a run id, because it belongs to a run",
    (type) => {
      expect((fixture(type) as Record<string, unknown>)["run_id"]).toMatch(/^run_/);
    },
  );
});

describe("parseEvent", () => {
  it("rejects a value with no type", () => {
    const result = parseEvent({ v: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe("unknown_type");
  });

  it("rejects a type nothing declares", () => {
    const result = parseEvent({ type: "run.exploded" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("run.exploded");
  });

  it("rejects a null", () => {
    expect(parseEvent(null).ok).toBe(false);
  });

  it("reports the path of each problem", () => {
    const broken = { ...(fixture("run.started") as Record<string, unknown>), workspace_id: "nope" };
    const result = parseEvent(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("invalid");
      expect(result.error.issues?.map((issue) => issue.path)).toContain("workspace_id");
    }
  });

  it("rejects an event that claims the wrong protocol version", () => {
    const broken = { ...(fixture("run.started") as Record<string, unknown>), v: 2 };
    expect(parseEvent(broken).ok).toBe(false);
  });

  it("strips fields the schema does not declare, so the inside is trusted", () => {
    const extra = { ...(fixture("checkpoint") as Record<string, unknown>), smuggled: "payload" };
    const result = parseEvent(extra);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).not.toHaveProperty("smuggled");
  });

  it("names what it dropped, and nothing a sender left out", () => {
    const step: Record<string, unknown> = {
      ...(fixture("step.log") as Record<string, unknown>),
      kind: "file",
      glyph: "page",
    };
    delete step["summary"];
    const result = parseEvent(step);
    expect(result.ok && result.dropped).toEqual(["glyph"]);
    const plain = parseEvent(fixture("step.log"));
    expect(plain.ok && plain.dropped).toEqual([]);
  });

  it("fills in the defaults the schema declares", () => {
    const withoutDefaults = fixture("run.failed") as Record<string, unknown>;
    delete withoutDefaults["retryable"];
    const result = parseEvent(withoutDefaults);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value["retryable"]).toBe(false);
  });
});
