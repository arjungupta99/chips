import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ClientEvent } from "../events.js";
import { buildModel, createFold } from "./fold.js";
import { replyLane } from "./origin.js";

function fixture(type: string, seq: number, over: Record<string, unknown> = {}): ClientEvent {
  const raw = readFileSync(
    new URL(`../../../protocol/fixtures/${type}.json`, import.meta.url),
    "utf8",
  );
  return { ...JSON.parse(raw), seq, ...over };
}

it("retains explicit reply provenance before completion, after folding, and on replay into two spaces", () => {
  const actor = { kind: "harness", id: "har_generic" };
  const events = [
    fixture("run.requested", 1, {
      actor,
      specialist_id: actor.id,
      run_id: "run_source",
      lane_id: "lane_source",
      label: "Research",
      space_id: "sp_source",
      link_to: ["sp_a", "sp_b"],
    }),
    ...["sp_a", "sp_b"].flatMap((space_id, index) => [
      fixture("message.post", 2 + index * 2, {
        id: `evt_reply_${index}`,
        actor,
        space_id,
        run_id: "run_source",
        text: "A result",
      }),
      fixture("run.completed", 3 + index * 2, {
        id: `evt_done_${index}`,
        actor,
        space_id,
        run_id: "run_source",
        summary: "A result",
      }),
    ]),
  ];
  const fold = createFold();
  for (const event of events) {
    fold.push([event]);
    const model = fold.model();
    for (const space of model.spaces.filter((space) => space.id !== "sp_source")) {
      for (const line of space.lines) expect(replyLane(line, model.lanes)?.label).toBe("Research");
    }
  }
  expect(fold.model()).toEqual(buildModel(events));
});

describe("uncertain provenance", () => {
  const model = buildModel([
    fixture("run.requested", 1, { label: "Research" }),
    fixture("message.post", 2, { run_id: undefined }),
  ]);
  it("never attributes an unlinked message to its preceding lane", () => {
    const line = model.spaces.flatMap((space) => space.lines).find((line) => line.kind === "text");
    expect(line).toBeDefined();
    if (line !== undefined) expect(replyLane(line, model.lanes)).toBeUndefined();
  });
});
