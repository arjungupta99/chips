/**
 * The line for what a newer computer sent (ADR 0297), once the catalogue has grown past its first
 * level: an event added at a later level is one the catalogue has, so an app that leaves it
 * undrawn on purpose draws no line for it. The catalogue here is a made-up later one, since the
 * real one has no later events yet; it is swapped in for the whole file, which is why this is one.
 */

import { CATALOGUE_LEVEL, LATER_EVENTS } from "@chipschat/protocol";
import { describe, expect, it, vi } from "vitest";
import type { ClientEvent } from "../events.js";
import { buildModel } from "./fold.js";

vi.mock("@chipschat/protocol", async (importOriginal) => {
  const real = await importOriginal<typeof import("@chipschat/protocol")>();
  return {
    ...real,
    CATALOGUE_LEVEL: 2,
    LATER_EVENTS: {
      "poll.opened": { level: 2, fallback: () => undefined },
      "poll.closed": { level: 2, fallback: () => undefined },
    },
  };
});

const ROOM = "spc_1";

function event(seq: number, type: string, extra: Record<string, unknown> = {}): ClientEvent {
  return {
    seq,
    type,
    id: `evt_${seq}`,
    ts: "2026-11-13T00:00:00.000Z",
    workspace_id: "ws_1",
    space_id: ROOM,
    actor: { kind: "person", id: "usr_1" },
    ...extra,
  };
}

const newerLines = (events: ClientEvent[]) =>
  (buildModel(events).spaces.find((space) => space.id === ROOM)?.lines ?? []).filter(
    (line) => line.newer === true,
  );

describe("an event the catalogue has at a later level", () => {
  const opened = event(1, "space.created", { kind: "group", title: "Polls" });

  it("draws no line when the app leaves it undrawn on purpose", () => {
    expect(CATALOGUE_LEVEL).toBe(2);
    const later = Object.keys(LATER_EVENTS);
    expect(later).toEqual(["poll.opened", "poll.closed"]);
    // Every later event's type, one after another: none of them is news of a newer Chips.
    const said = newerLines([opened, ...later.map((type, at) => event(at + 2, type))]);
    expect(said).toEqual([]);
  });

  it("still draws the line for one the catalogue has at no level", () => {
    const said = newerLines([opened, event(2, "poll.opened"), event(3, "poll.reopened")]);
    expect(said.map((line) => line.seq)).toEqual([3]);
  });
});
