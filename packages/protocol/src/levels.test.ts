/**
 * What an app understands, as one number: every event at a level, and an app below an event's
 * level sent the line its addition came with (everything in step).
 */

import { describe, expect, it } from "vitest";
import { EVENT_TYPES } from "./events/catalogue.js";
import {
  atLevel,
  CATALOGUE_LEVEL,
  LATER_EVENTS,
  type LaterEvent,
  LEVEL_ONE_EVENTS,
} from "./levels.js";

describe("the catalogue's levels", () => {
  it("hold every event: one an app at level 1 knows, or one added later with its fallback", () => {
    const placed = new Set([...LEVEL_ONE_EVENTS, ...Object.keys(LATER_EVENTS)]);
    const unplaced = EVENT_TYPES.filter((type) => !placed.has(type));
    // A new event: raise CATALOGUE_LEVEL and put it in LATER_EVENTS, with the line an older app
    // is sent in its place (src/levels.ts).
    expect(unplaced).toEqual([]);
  });

  it("name each later event a level above 1, and none above the catalogue's", () => {
    for (const [type, entry] of Object.entries(LATER_EVENTS)) {
      expect(LEVEL_ONE_EVENTS, type).not.toContain(type);
      expect(entry.level, type).toBeGreaterThan(1);
      expect(entry.level, type).toBeLessThanOrEqual(CATALOGUE_LEVEL);
    }
  });
});

describe("an event at a level", () => {
  const later: Record<string, LaterEvent> = {
    "chart.made": {
      level: 3,
      fallback: (event) => ({
        agentId: String(event["by"]),
        text: "Hermes made a chart. Update Chips to see it.",
      }),
    },
    "quiet.thing": { level: 3, fallback: () => undefined },
  };
  const chart = {
    v: 1,
    id: "evt_1",
    seq: 42,
    ts: "2026-11-20T10:00:00.000Z",
    workspace_id: "ws_1",
    space_id: "spc_1",
    type: "chart.made",
    actor: { kind: "harness", id: "hrn_1" },
    by: "agt_1",
    chart: { points: [1, 2, 3] },
  };

  it("is sent as it is to an app at its level or above", () => {
    expect(atLevel(chart, 3, later)).toBe(chart);
    expect(atLevel(chart, 4, later)).toBe(chart);
    const known = { ...chart, type: "message.post" };
    expect(atLevel(known, 1, later)).toBe(known);
  });

  it("is sent below its level as the line it came with, said by its agent, marked so it is read again", () => {
    expect(atLevel(chart, 2, later)).toEqual({
      v: 1,
      id: "evt_1",
      seq: 42,
      ts: "2026-11-20T10:00:00.000Z",
      workspace_id: "ws_1",
      space_id: "spc_1",
      type: "message.post",
      actor: { kind: "agent", id: "agt_1" },
      text: "Hermes made a chart. Update Chips to see it.",
      fallback: true,
    });
  });

  it("is not sent below its level when it has no line to show", () => {
    expect(atLevel({ ...chart, type: "quiet.thing" }, 1, later)).toBeUndefined();
  });
});
