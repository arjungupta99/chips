/**
 * The Main tag on the desktop (ADR 0145): a harness's Main room wears it in the Spaces rail and its
 * Main agent in the Agents list, each in the colour its face stands on, and nothing else does.
 * The Main agents no longer sit under a heading of their own.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildModel, type ClientEvent, type Directory } from "@chipschat/core";
import { faceGround } from "@chipschat/ui";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentSections } from "./Agents.tsx";
import { SpacesList } from "./Sidebar.tsx";

const FIXTURES = `${resolve(import.meta.dirname, "../../../../packages/protocol/fixtures")}/`;
const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const CLAW = "hrn_01K4ZQPX0000000000000CLAW";
const MAIN = "agt_01K4ZQPX0000000000000MAIN";
const SCOUT = "agt_01K4ZQPX000000000000SCOUT";

function fixture(type: string, seq: number, overrides: Record<string, unknown> = {}): ClientEvent {
  return { ...JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")), seq, ...overrides };
}

const person = { kind: "person", id: ARJUN };
const built = buildModel([
  fixture("space.created", 1, { actor: person, space_id: "spc_main", title: "OpenClaw main" }),
  fixture("space.created", 2, { actor: person, space_id: "spc_work", title: "Garage door" }),
]);
// The server says which room is a harness's Main room; the log alone does not.
const model = {
  ...built,
  spaces: built.spaces.map((space) => (space.id === "spc_main" ? { ...space, home: true } : space)),
};

const directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [CLAW]: {
    id: CLAW,
    kind: "harness",
    displayName: "OpenClaw",
    ownerId: ARJUN,
    capabilities: ["agents"],
  },
  [MAIN]: { id: MAIN, kind: "agent", harnessId: CLAW, displayName: "Main", lead: true },
  [SCOUT]: { id: SCOUT, kind: "agent", harnessId: CLAW, displayName: "Scout" },
} as Directory;

const hueOf = (tag: HTMLElement) => tag.style.getPropertyValue("--main-hue");

describe("the Main tag (ADR 0145)", () => {
  it("is worn by the Main room in the Spaces rail, and by no other room", () => {
    const { container } = render(
      <SpacesList
        model={model}
        directory={directory}
        readState={{}}
        spaceIcons={new Map([["spc_main", { icon: "atom", ground: 13 }]])}
        selectedSpaceId={undefined}
        tab="spaces"
        selfId={ARJUN}
        onSelectTab={vi.fn()}
        onSelectSpace={vi.fn()}
        onNewSpace={vi.fn()}
      />,
    );
    const tags = screen.getAllByTestId("main-tag");
    expect(tags).toHaveLength(1);
    const row = container.querySelector<HTMLElement>('[data-space="spc_main"]');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByTestId("main-tag").textContent).toBe("Main");
    // The colour the room's face stands on: the ground its person picked.
    expect(hueOf(tags[0] as HTMLElement)).toBe(
      faceGround("OpenClaw main", { icon: "atom", ground: 13 }),
    );
  });

  it("is worn by the Main agent in the Agents list, with no Main agent heading", () => {
    render(<AgentSections model={model} directory={directory} selfId={ARJUN} onOpen={vi.fn()} />);
    expect(screen.queryByText("Main agent")).toBeNull();
    const tags = screen.getAllByTestId("main-tag");
    expect(tags).toHaveLength(1);
    const row = screen.getByRole("button", { name: /^Main\s*Main/ });
    expect(within(row).getByTestId("main-tag")).toBe(tags[0]);
    expect(hueOf(tags[0] as HTMLElement)).toBe(faceGround("Main", undefined));
  });
});
