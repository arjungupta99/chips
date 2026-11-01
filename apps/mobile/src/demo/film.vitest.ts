/**
 * Where each chapter of a film opens on the phone (ADR 0213), as the phone's own routes. From there
 * the render acts as a person does (ADR 0217's addendum).
 */

import type { DemoState } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import { placeOf, routeOf } from "./film";

const ROOM = "spc_01KDEM00000000000000000001";
const MILO = "agt_01KDEM00000000000000000002";

function stateOf(over: Partial<DemoState>): DemoState {
  return { film: "watch", chapter: 0, screen: "spaces", playing: true, ended: false, ...over };
}

describe("where a chapter opens", () => {
  it("is a tab, or a room or an agent's page pushed over them", () => {
    expect(placeOf(stateOf({ screen: "spaces" }))).toEqual({ kind: "spaces" });
    expect(placeOf(stateOf({ screen: "agents" }))).toEqual({ kind: "agents" });
    expect(placeOf(stateOf({ screen: "room", spaceId: ROOM }))).toEqual({
      kind: "room",
      spaceId: ROOM,
    });
    expect(placeOf(stateOf({ screen: "agent", agentId: MILO }))).toEqual({
      kind: "agent",
      agentId: MILO,
    });
  });

  it("is the room under the lock screen, which is drawn over it", () => {
    expect(placeOf(stateOf({ screen: "lock", spaceId: ROOM }))).toEqual({
      kind: "room",
      spaceId: ROOM,
    });
  });

  it("is nowhere for a screen with nothing named", () => {
    expect(placeOf(stateOf({ screen: "room" }))).toBeUndefined();
    expect(placeOf(stateOf({ screen: "lock" }))).toBeUndefined();
    expect(placeOf(stateOf({ screen: "agent" }))).toBeUndefined();
  });

  it("is the app's own routes", () => {
    expect(routeOf({ kind: "spaces" })).toBe("/");
    expect(routeOf({ kind: "agents" })).toBe("/agents");
    expect(routeOf({ kind: "room", spaceId: ROOM })).toBe(`/spaces/${ROOM}`);
    expect(routeOf({ kind: "agent", agentId: MILO })).toBe(`/agents/${MILO}`);
  });
});
