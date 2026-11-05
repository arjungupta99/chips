/**
 * The harnesses' shelf at the head of the Agents tab (ADR 0185): a tile for each, in the order
 * their rooms last spoke, each saying why it can't answer, what it is doing, or how many agents it
 * has; Connect a harness at its end for whoever may; and View all under it. Beside a room on an
 * iPad, a grid of them two to a row with nothing to view all of (ADR 0256).
 */

import type { Snapshot } from "@chipschat/core";
import { render as renderBare, screen, userEvent, within } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Agents } from "../agents/Agents";
import { agentsSnapshot, ME } from "../testing/agents";
import { fakeStore } from "../testing/fixtures";
import { Split } from "../ui/Split";
import { countdownPath } from "./Shelf";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}

const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const pushed: string[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (to: string) => pushed.push(to) }),
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));
jest.mock("../store/provider", () => ({
  useSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
  useDeferredSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
}));

// Connect a harness's sheet is the app's (`Connect.tsx`); here, what the tile reads of it.
const mockConnect: {
  open: jest.Mock;
  waiting: { left: string; share: number; taken: boolean } | undefined;
  newAgent: jest.Mock;
} = { open: jest.fn(), waiting: undefined, newAgent: jest.fn() };
jest.mock("./Connect", () => ({ useConnect: () => mockConnect }));

beforeEach(() => {
  pushed.length = 0;
  mockConnect.open.mockClear();
  mockConnect.waiting = undefined;
});

/**
 * The tab's agents, with two more harnesses: Codex, with no agents yet, and Scout, offline. OpenClaw's
 * room spoke last, then Jacobian's; neither of the other two has a room.
 */
function shelved(over: { role?: "owner" | "member"; working?: boolean } = {}): Snapshot {
  const base = agentsSnapshot();
  return {
    ...base,
    directory: {
      ...base.directory,
      hrn_codex: { id: "hrn_codex", kind: "harness", displayName: "Codex", ownerId: ME },
      hrn_scout: {
        id: "hrn_scout",
        kind: "harness",
        displayName: "Scout",
        ownerId: ME,
        state: { connected: false, since: "2026-10-09T08:00:00.000Z" },
      },
    },
    model: {
      ...base.model,
      people: { [ME]: { participantId: ME, displayName: "Arjun", role: over.role ?? "owner" } },
      fleet: over.working
        ? [
            {
              harnessId: "hrn_jacobian",
              liveSessions: 1,
              sessionCount: 1,
              spaceCount: 2,
              needsYou: 0,
              paused: false,
              status: "running",
            },
          ]
        : [],
    },
  } as unknown as Snapshot;
}

/** The tiles' names, in the order they stand. */
function tiles(): string[] {
  return within(screen.getByTestId("harness-shelf"))
    .getAllByRole("button")
    .map((tile) => tile.props["accessibilityLabel"] as string);
}

describe("the harnesses' shelf", () => {
  it("stands a tile for each harness, in the order their rooms last spoke, then Connect a harness", async () => {
    await render(<Agents store={fakeStore(shelved())} selfId={ME} />);
    expect(tiles()).toEqual(["OpenClaw", "Jacobian", "Codex", "Scout", "Connect a harness"]);
  });

  it("says how many agents each has, why one can't answer, and that one has none yet", async () => {
    await render(<Agents store={fakeStore(shelved())} selfId={ME} />);
    const shelf = within(screen.getByTestId("harness-shelf"));
    expect(
      within(screen.getByTestId("harness-tile-hrn_openclaw")).getByText("2 agents"),
    ).toBeTruthy();
    // J, Shopping and Bland Pricing; never the archived Chess Game and Researcher.
    expect(
      within(screen.getByTestId("harness-tile-hrn_jacobian")).getByText("3 agents"),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("harness-tile-hrn_codex")).getByText("No agents yet"),
    ).toBeTruthy();
    expect(within(screen.getByTestId("harness-tile-hrn_scout")).getByText("Offline")).toBeTruthy();
    expect(shelf.queryByText(/since/)).toBeNull();
  });

  it("says what one is doing, in the status's word, in place of its count", async () => {
    await render(<Agents store={fakeStore(shelved({ working: true }))} selfId={ME} />);
    const jacobian = within(screen.getByTestId("harness-tile-hrn_jacobian"));
    expect(jacobian.getByText("Working")).toBeTruthy();
    expect(jacobian.getByLabelText("Jacobian, working")).toBeTruthy();
    expect(jacobian.queryByText("3 agents")).toBeNull();
  });

  it("says only that one can't answer, in its ring as in its line, while a run of it stands", async () => {
    const snapshot = shelved({ working: true });
    // Scout went offline with a run of its still open.
    const fleet = snapshot.model.fleet.map((each) => ({ ...each, harnessId: "hrn_scout" }));
    const both: Snapshot = { ...snapshot, model: { ...snapshot.model, fleet } };
    await render(<Agents store={fakeStore(both)} selfId={ME} />);
    const tile = within(screen.getByTestId("harness-tile-hrn_scout"));
    expect(tile.getByText("Offline")).toBeTruthy();
    expect(tile.queryByText("Working")).toBeNull();
    expect(tile.queryByLabelText(/working/i)).toBeNull();
    expect(tile.getByLabelText("Scout, can't answer")).toBeTruthy();
  });

  it("opens a harness's page, pushed on a phone and beside the list when told how", async () => {
    await render(<Agents store={fakeStore(shelved())} selfId={ME} />);
    await userEvent.press(screen.getByTestId("harness-tile-hrn_scout"));
    expect(pushed).toEqual(["/harnesses/hrn_scout"]);

    const opened: string[] = [];
    await render(
      <Agents
        store={fakeStore(shelved())}
        selfId={ME}
        selected="hrn_codex"
        onOpenHarness={(id) => opened.push(id)}
      />,
    );
    expect(screen.getByTestId("harness-tile-hrn_codex")).toBeSelected();
    await userEvent.press(screen.getByTestId("harness-tile-hrn_codex"));
    expect(opened).toEqual(["hrn_codex"]);
  });

  it("opens every harness's card from View all, pushed or beside the list", async () => {
    await render(<Agents store={fakeStore(shelved())} selfId={ME} />);
    await userEvent.press(screen.getByLabelText("View all harnesses"));
    expect(pushed).toEqual(["/harnesses"]);

    let all = 0;
    await render(
      <Agents store={fakeStore(shelved())} selfId={ME} onAllHarnesses={() => (all += 1)} />,
    );
    await userEvent.press(screen.getByLabelText("View all harnesses"));
    expect(all).toBe(1);
    expect(pushed).toEqual(["/harnesses"]);
  });

  it("stands beside a room as a grid, two to a row, Connect last and no View all (ADR 0256)", async () => {
    await render(
      <Split
        list={<Agents store={fakeStore(shelved())} selfId={ME} />}
        detail={<Text>the card</Text>}
      />,
    );
    expect(tiles()).toEqual(["OpenClaw", "Jacobian", "Codex", "Scout", "Connect a harness"]);
    expect(screen.queryByLabelText("View all harnesses")).toBeNull();
    // Two to a row, sharing the row, Connect alone in the last.
    const rows = screen.getByTestId("harness-shelf").children as unknown as Parameters<
      typeof within
    >[0][];
    expect(rows.map((row) => within(row).getAllByRole("button").length)).toEqual([2, 2, 1]);
    expect(StyleSheet.flatten(rows[0]?.props["style"])).toMatchObject({ flexDirection: "row" });
    expect(StyleSheet.flatten(screen.getByTestId("add-agent").props["style"])).toMatchObject({
      flexDirection: "row",
    });
  });

  it("opens Connect a harness's sheet from its last tile (ADR 0190)", async () => {
    await render(<Agents store={fakeStore(shelved())} selfId={ME} />);
    expect(screen.getByTestId("add-agent")).toHaveTextContent(/Connect.*a harness/);
    await userEvent.press(screen.getByLabelText("Connect a harness"));
    expect(mockConnect.open).toHaveBeenCalledTimes(1);
  });

  it("waits on this phone's link: its minutes, then that it is connecting", async () => {
    mockConnect.waiting = { left: "14:12", share: 0.95, taken: false };
    const { rerender } = await render(<Agents store={fakeStore(shelved())} selfId={ME} />);
    expect(screen.getByLabelText("Connect a harness, waiting, 14:12 left")).toBeTruthy();
    expect(screen.getByTestId("add-agent")).toHaveTextContent(/Waiting.*14:12/);
    mockConnect.waiting = { left: "13:40", share: 0.9, taken: true };
    await rerender(<Agents store={fakeStore(shelved())} selfId={ME} />);
    expect(screen.getByTestId("add-agent")).toHaveTextContent(/Connecting.*One moment…/);
  });

  it("empties the waiting ring from twelve o'clock, clockwise", () => {
    const ring = countdownPath(1.25, 56, 14);
    const steps = ring.d.split(/ (?=[MHVA])/);
    // From the middle of the top edge, round to the left first, and back to the middle of the top:
    // a dash of the share left then leaves its gap just clockwise of twelve.
    expect(steps[0]).toBe("M 29.25 1.25");
    expect(steps[1]).toBe("H 15.25");
    expect(steps.at(-1)).toBe("H 29.25");
    // Its corners turn about the square's inside (sweep 0, round to the left), not its outside.
    expect(steps[2]).toBe("A 14 14 0 0 0 1.25 15.25");
    expect(ring.length).toBeCloseTo(4 * 56 - (8 - 2 * Math.PI) * 14);
  });

  it("offers Connect a harness only to whoever may make links", async () => {
    await render(<Agents store={fakeStore(shelved({ role: "member" }))} selfId={ME} />);
    expect(tiles()).toEqual(["OpenClaw", "Jacobian", "Codex", "Scout"]);
    expect(screen.queryByTestId("add-agent")).toBeNull();
  });
});
