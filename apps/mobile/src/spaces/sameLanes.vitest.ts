import type { Lane } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import { sameLanes } from "./sameLanes";

function lane(over: Partial<Lane> = {}): Lane {
  return {
    laneId: "lane_1",
    runId: "run_2",
    leadId: "har_scout",
    specialistId: "har_scout",
    onBehalfOf: "per_arjun",
    leadRunId: "run_1",
    homeSpaceId: "sp_eng",
    linkedSpaceIds: ["sp_chess"],
    goal: "Build the board",
    constraints: ["no external calls"],
    state: "running",
    delivery: "pending",
    depth: 1,
    trail: [{ participantId: "per_arjun" }, { participantId: "har_scout", runId: "run_1" }],
    label: "Engineer",
    leadLabel: "Chess Game",
    ...over,
  };
}

describe("a room's lanes, read again", () => {
  it("are the same lanes when every field a row reads is the same, whatever the objects are", () => {
    expect(sameLanes([lane()], [lane()])).toBe(true);
    expect(sameLanes([], [])).toBe(true);
  });

  it("differ when a lane's state, words, files or trail move on, or one is added", () => {
    expect(sameLanes([lane()], [lane({ state: "completed" })])).toBe(false);
    expect(sameLanes([lane()], [lane({ summary: "Done: the board is built." })])).toBe(false);
    expect(sameLanes([lane()], [lane({ constraints: [] })])).toBe(false);
    expect(
      sameLanes([lane()], [lane({ trail: [{ participantId: "per_arjun", label: "Arjun" }] })]),
    ).toBe(false);
    expect(
      sameLanes(
        [lane()],
        [
          lane({
            attachments: [
              { attachmentId: "att_1", filename: "board.png", mimeType: "image/png", url: "/f/1" },
            ] as unknown as Lane["attachments"],
          }),
        ],
      ),
    ).toBe(false);
    expect(sameLanes([lane()], [lane(), lane({ laneId: "lane_2" })])).toBe(false);
  });
});
