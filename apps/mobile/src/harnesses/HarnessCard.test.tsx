/**
 * The harnesses' cards, in the list View all opens under the Agents tab's shelf (ADR 0185): the
 * fleet that was the Harnesses tab until ADR 0087's Phase 5, and the foot of the Agents tab until
 * the shelf. What matters is that each one's state is a word as well as a ring, and that the
 * roll-up says something true about a harness that has never been connected to anything.
 */

import type { Snapshot } from "@chipschat/core";
import { render as renderBare, screen, userEvent } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore } from "../testing/fixtures";
import { All } from "./All";

/** Every harness's card, as View all opens them: what the Harnesses tab was. */
function Fleet(props: {
  readonly store: Parameters<typeof All>[0]["store"];
  readonly selected?: string;
  readonly onOpen?: (harnessId: string) => void;
}) {
  return (
    <All
      store={props.store}
      selfId="per_arjun"
      selected={props.selected}
      onOpen={props.onOpen ?? ((id) => pushed.push(`/harnesses/${id}`))}
    />
  );
}

/**
 * A tab's name floats over its list on iOS, and asks for the safe area to know where the status
 * bar ends (`ui/Screen.tsx`), so every render here gets a provider with an iPhone's metrics — as
 * the app always has one, from the router. A wrapper, so a re-render keeps it.
 */
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

beforeEach(() => {
  pushed.length = 0;
});

function state(over: { directory?: unknown; fleet?: unknown[] } = {}): Snapshot {
  return {
    connection: "open",
    link: "direct",
    // The server has said who is who: the tab lists them (`agentsLook`).
    directoryFrom: "server",
    busy: new Set<string>(),
    receipts: new Map(),
    readState: {},
    directory: over.directory ?? {
      har_scout: {
        id: "har_scout",
        kind: "harness",
        displayName: "Scout",
        capabilities: ["autonomy"],
      },
      har_ledger: { id: "har_ledger", kind: "harness", displayName: "Ledger" },
      per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
    },
    model: {
      needsYou: [],
      lanes: [],
      spaces: [],
      people: {},
      harnesses: {
        har_scout: {
          harnessId: "har_scout",
          autonomy: 2,
          maxAutonomy: 3,
          rules: [],
          spentUsd: 0,
          bySpace: {},
        },
      },
      fleet: over.fleet ?? [
        {
          harnessId: "har_scout",
          liveSessions: 1,
          sessionCount: 2,
          spaceCount: 3,
          needsYou: 2,
          paused: false,
          status: "running",
          statusVerb: "Drafting the reply",
        },
      ],
    },
  } as unknown as Snapshot;
}

/** The counting half of a fleet entry, for a test that is only about the status half. */
const COUNTS = {
  liveSessions: 0,
  sessionCount: 0,
  spaceCount: 1,
  needsYou: 0,
  paused: false,
} as const;

describe("every harness's card", () => {
  it("opens a harness beside itself when told how, and says which card is open", async () => {
    const snapshot = state();
    const opened: string[] = [];
    await render(
      <Fleet
        store={fakeStore(snapshot)}
        selected="har_scout"
        onOpen={(id: string) => opened.push(id)}
      />,
    );
    const row = screen.getByLabelText("Scout");
    expect(row).toBeSelected();
    await userEvent.press(row);
    expect(opened).toEqual(["har_scout"]);
    expect(pushed).toEqual([]);
  });

  it("lists the harnesses, by name, and leaves the people out", async () => {
    const snapshot = state();
    await render(<Fleet store={fakeStore(snapshot)} />);
    expect(screen.getByText("Scout")).toBeTruthy();
    expect(screen.getByText("Ledger")).toBeTruthy();
    expect(screen.queryByText("Arjun")).toBeNull();
  });

  it("leaves out a harness removed from the workspace (ADR 0078)", async () => {
    const snapshot = state({
      directory: {
        har_scout: { id: "har_scout", kind: "harness", displayName: "Scout" },
        har_gone: {
          id: "har_gone",
          kind: "harness",
          displayName: "Gone",
          removedAt: "2026-09-27T10:00:00.000Z",
        },
      },
    });
    await render(<Fleet store={fakeStore(snapshot)} />);
    expect(screen.getByText("Scout")).toBeTruthy();
    expect(screen.queryByText("Gone")).toBeNull();
  });

  it("says why one can't answer, in its own words, and one that is offline, since when (ADR 0083)", async () => {
    const snapshot = state({
      directory: {
        har_scout: {
          id: "har_scout",
          kind: "harness",
          displayName: "Scout",
          state: {
            connected: true,
            since: "2026-09-28T18:00:00.000Z",
            trouble: {
              reason: "Can't reach its gateway",
              since: new Date(Date.now() - 23 * 60_000).toISOString(),
            },
          },
        },
        har_ledger: {
          id: "har_ledger",
          kind: "harness",
          displayName: "Ledger",
          state: { connected: false, since: new Date().toISOString() },
        },
        har_fine: {
          id: "har_fine",
          kind: "harness",
          displayName: "Fine",
          state: { connected: true, since: "2026-09-28T18:00:00.000Z" },
        },
      },
    });
    await render(<Fleet store={fakeStore(snapshot)} />);
    expect(screen.getByTestId("trouble-har_scout")).toHaveTextContent(
      "Can't reach its gateway · 23 min",
    );
    expect(screen.getByTestId("trouble-har_ledger")).toHaveTextContent(/^Offline · since /);
    expect(screen.queryByTestId("trouble-har_fine")).toBeNull();
  });

  it("says Offline, not what its last run was doing, for one that can't answer", async () => {
    const snapshot = state({
      directory: {
        har_scout: {
          id: "har_scout",
          kind: "harness",
          displayName: "Scout",
          state: { connected: false, since: new Date().toISOString() },
        },
      },
    });
    await render(<Fleet store={fakeStore(snapshot)} />);
    expect(screen.getByTestId("trouble-har_scout")).toHaveTextContent(/^Offline · since /);
    expect(screen.queryByText("Working")).toBeNull();
    expect(screen.getByLabelText("Scout, can't answer")).toBeTruthy();
  });

  it("says each one's state in words, not only as a ring", async () => {
    await render(<Fleet store={fakeStore(state())} />);
    // Its run.status prose is not said: the bubble's top line is, and this run is not in view.
    expect(screen.getByText("Working")).toBeTruthy();
    expect(screen.queryByText(/Drafting the reply/)).toBeNull();
  });

  it("says nothing about one that is idle or has finished (WP5)", async () => {
    await render(
      <Fleet
        store={fakeStore(
          state({
            fleet: [
              { harnessId: "har_scout", ...COUNTS, status: "done" },
              { harnessId: "har_ledger", ...COUNTS, status: "cancelled" },
            ],
          }),
        )}
      />,
    );
    // Both rows are there; neither wears a word, because neither has any news.
    expect(screen.getByText("Scout")).toBeTruthy();
    expect(screen.getByText("Ledger")).toBeTruthy();
    expect(screen.queryByText("Done")).toBeNull();
    expect(screen.queryByText("Idle")).toBeNull();
  });

  it("rolls a harness up across its spaces, and says when it has none", async () => {
    await render(<Fleet store={fakeStore(state())} />);
    expect(screen.getByTestId("rollup-har_scout")).toBeTruthy();
    expect(screen.getByText("1 live session · 3 spaces · 2 waiting on you")).toBeTruthy();
    expect(screen.getByText("No spaces yet")).toBeTruthy();
  });

  it("says how far one is trusted only when it takes the dial (ADR 0046)", async () => {
    await render(<Fleet store={fakeStore(state())} />);
    expect(screen.getByText("L2 · Ask when it matters")).toBeTruthy();
    // Ledger declared nothing, as Jacobian does: no level, and no "No policy yet" either.
    expect(screen.queryByText("No policy yet")).toBeNull();
    expect(screen.getAllByText(/^L[0-3] · /)).toHaveLength(1);
  });

  it("says nothing has decided a level yet, for one that takes the dial and has no policy", async () => {
    const snapshot = state({
      directory: {
        har_new: {
          id: "har_new",
          kind: "harness",
          displayName: "Newcomer",
          capabilities: ["autonomy"],
        },
      },
    });
    await render(<Fleet store={fakeStore(snapshot)} />);
    expect(screen.getByText("No policy yet")).toBeTruthy();
  });

  it("opens a profile", async () => {
    await render(<Fleet store={fakeStore(state())} />);
    await userEvent.press(screen.getByLabelText("Scout"));
    expect(pushed).toEqual(["/harnesses/har_scout"]);
  });

  it("says where harnesses come from when there are none", async () => {
    await render(<Fleet store={fakeStore(state({ directory: {} }))} />);
    expect(screen.getByText(/They are added from a computer/)).toBeTruthy();
  });
});
