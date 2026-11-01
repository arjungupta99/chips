/**
 * The shared tag on the desktop (ADR 0234): a room somebody besides the reader reads wears it in
 * the Spaces rail, as on the phone, after Main where a Main room is shared; the reader's own
 * agents never mark a room, nor an agent whose harness has no owner on record.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildModel, type ClientEvent, type Directory } from "@chipschat/core";
import { render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar.tsx";

const FIXTURES = `${resolve(import.meta.dirname, "../../../../packages/protocol/fixtures")}/`;
const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const HERMES = "hrn_01K4ZQPX000000000000HERMES";
const MINE = "hrn_01K4ZQPX00000000000000MINE";
const OLD = "hrn_01K4ZQPX000000000000000OLD";
const THEO = "agt_01K4ZQPX0000000000000THEO";
const PIP = "agt_01K4ZQPX00000000000000PIP";
const ODD = "agt_01K4ZQPX00000000000000ODD";

function fixture(type: string, seq: number, overrides: Record<string, unknown> = {}): ClientEvent {
  return { ...JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")), seq, ...overrides };
}

const person = { kind: "person", id: ARJUN };
const ROOMS: readonly (readonly [string, string, readonly string[]])[] = [
  ["spc_japan", "Japan trip", [ARJUN, DANA]],
  ["spc_foodie", "Foodie", [ARJUN, THEO]],
  ["spc_mine", "Sudoku mini", [ARJUN, PIP]],
  ["spc_odd", "Old notes", [ARJUN, ODD]],
  ["spc_home", "Hermes main", [ARJUN, THEO]],
];
const built = buildModel(
  ROOMS.map(([id, title], index) =>
    fixture("space.created", index + 1, { actor: person, space_id: id, title }),
  ),
);
// Who is in each room, and which is a harness's Main room, as the server says it.
const model = {
  ...built,
  spaces: built.spaces.map((space) => ({
    ...space,
    members: [...(ROOMS.find(([id]) => id === space.id)?.[2] ?? [])],
    ...(space.id === "spc_home" ? { home: true } : {}),
  })),
};

const directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
  [HERMES]: { id: HERMES, kind: "harness", displayName: "Hermes", ownerId: DANA },
  [MINE]: { id: MINE, kind: "harness", displayName: "OpenClaw", ownerId: ARJUN },
  [OLD]: { id: OLD, kind: "harness", displayName: "Old" },
  [THEO]: { id: THEO, kind: "agent", harnessId: HERMES, displayName: "Theo" },
  [PIP]: { id: PIP, kind: "agent", harnessId: MINE, displayName: "Pip" },
  [ODD]: { id: ODD, kind: "agent", harnessId: OLD, displayName: "Odd" },
} as Directory;

describe("the shared tag (ADR 0234)", () => {
  it("is worn in the Spaces rail by a room somebody else reads, and by no other", () => {
    const { container } = render(
      <Sidebar
        model={model}
        directory={directory}
        readState={{}}
        spaceIcons={new Map()}
        selectedSpaceId={undefined}
        tab="spaces"
        personName="Arjun"
        selfId={ARJUN}
        onSelectTab={vi.fn()}
        onSelectSpace={vi.fn()}
        onNewSpace={vi.fn()}
      />,
    );
    const row = (id: string) => container.querySelector<HTMLElement>(`[data-space="${id}"]`);
    const tagged = (id: string) => row(id)?.querySelector('[data-testid="shared-tag"]') ?? null;
    // Another person, or somebody else's agent.
    expect(tagged("spc_japan")?.textContent).toBe("shared");
    expect(tagged("spc_foodie")).not.toBeNull();
    // The reader's own agent, or one whose harness nobody owns on record.
    expect(tagged("spc_mine")).toBeNull();
    expect(tagged("spc_odd")).toBeNull();
    // A Main room somebody else's agent is in: Main, then shared.
    const home = row("spc_home") as HTMLElement;
    const tags = within(home)
      .getAllByTestId(/^(main|shared)-tag$/)
      .map((tag) => tag.dataset["testid"]);
    expect(tags).toEqual(["main-tag", "shared-tag"]);
  });

  it("says nothing until the rail knows who is reading", () => {
    const { container } = render(
      <Sidebar
        model={model}
        directory={directory}
        readState={{}}
        spaceIcons={new Map()}
        selectedSpaceId={undefined}
        tab="spaces"
        personName="Arjun"
        selfId={undefined}
        onSelectTab={vi.fn()}
        onSelectSpace={vi.fn()}
        onNewSpace={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-testid="shared-tag"]')).toBeNull();
  });
});
