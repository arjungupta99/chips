import { describe, expect, it } from "vitest";
import type { Directory } from "./events.js";
import { handChoices, runIsLane } from "./handOn.js";
import type { PersonModel } from "./model/types.js";

const DIRECTORY: Directory = {
  per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
  per_priya: { id: "per_priya", kind: "person", displayName: "Priya" },
  per_dana: { id: "per_dana", kind: "person", displayName: "Dana" },
  per_sam: { id: "per_sam", kind: "person", displayName: "Sam" },
  agt_ike: { id: "agt_ike", kind: "agent", displayName: "Ike" },
} as unknown as Directory;

const person = (id: string, displayName: string, role: PersonModel["role"]): PersonModel => ({
  participantId: id,
  displayName,
  role,
  joinedAt: "2026-10-20T06:31:34.468Z",
});

const PEOPLE = {
  per_arjun: person("per_arjun", "Arjun", "owner"),
  per_priya: person("per_priya", "Priya", "member"),
};

const values = (choices: readonly { value: string }[]) => choices.map((choice) => choice.value);

describe("who an ask may be handed to (6 November 2026)", () => {
  it("offers only the person outside a space of one person and an agent", () => {
    const choices = handChoices({
      directory: DIRECTORY,
      space: { members: ["per_arjun", "agt_ike"], roles: { per_arjun: "owner" } },
      people: PEOPLE,
      selfId: "per_arjun",
      lane: false,
    });
    expect(choices).toEqual([{ value: "per_priya", label: "Priya", elsewhere: true }]);
  });

  it("offers a standing only when it reaches somebody other than the reader", () => {
    const people = {
      ...PEOPLE,
      per_dana: person("per_dana", "Dana", "admin"),
      per_sam: person("per_sam", "Sam", "guest"),
    };
    const space = {
      members: ["per_arjun", "per_dana", "per_sam", "agt_ike"],
      roles: { per_arjun: "owner", per_dana: "member", per_sam: "guest" } as const,
    };
    const choices = handChoices({
      directory: DIRECTORY,
      space,
      people,
      selfId: "per_arjun",
      lane: false,
    });
    expect(values(choices)).toEqual(["per_dana", "per_sam", "per_priya", "role:admin", "any"]);
    // Dana, an admin, sees the owners, since Arjun is one; a guest alone is not "anyone".
    const fromDana = handChoices({
      directory: DIRECTORY,
      space: { members: ["per_arjun", "per_dana"], roles: space.roles },
      people,
      selfId: "per_dana",
      lane: true,
    });
    expect(values(fromDana)).toEqual(["per_arjun", "per_priya", "role:owner", "any", "lead"]);
  });

  it("knows a run is a lane's by the lanes the model holds", () => {
    const lanes = [{ runId: "run_2" }] as never;
    expect(runIsLane({ lanes }, "run_2")).toBe(true);
    expect(runIsLane({ lanes }, "run_1")).toBe(false);
  });
});
