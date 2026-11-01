/**
 * The ask's own route (`app/needs/[id].tsx`), opened by a push as the app comes back: the ask may
 * not be in the store yet, and "Not here" waits until the store has caught up (Arjun's iPhone, 23
 * October 2026: "Not here" for a moment, then the ask). The test lives beside the page's parts
 * because every file under `app/` is a route.
 */

import type { Snapshot } from "@chipschat/core";
import { act, fireEvent, render as renderBare, screen } from "@testing-library/react-native";
import type { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import NeedsDetailScreen from "../../app/needs/[id]";
import { CATCH_UP_MS } from "../spaces/Thinking";
import { approval, fakeStore, snapshot } from "../testing/fixtures";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
const page = () => (
  <SafeAreaProvider initialMetrics={IPHONE}>
    <NeedsDetailScreen />
  </SafeAreaProvider>
);

jest.mock("expo-router", () => ({
  Redirect: () => null,
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: "apr_1" }),
  useRouter: () => ({ back: () => undefined, push: (to: unknown) => mockPushed.push(to) }),
}));
const mockPushed: unknown[] = [];

const mockPaired: { current?: { store: unknown; snapshot: Snapshot } } = {};
jest.mock("../store/provider", () => ({
  useChips: () => ({
    paired: { store: mockPaired.current?.store, device: { participantId: "per_arjun" } },
  }),
  useSnapshot: () => mockPaired.current?.snapshot,
}));
jest.mock("../ui/layout", () => ({
  ...jest.requireActual("../ui/layout"),
  useLayout: () => ({ wide: false, roomy: false, landscape: false }),
}));
jest.mock("./Decide", () => ({
  Decide: () => {
    const { Text: Shown } = jest.requireActual<{ Text: typeof Text }>("react-native");
    return <Shown testID="decide">the ask</Shown>;
  },
}));

const GONE = /not waiting on you any more/;

function holding(snap: Snapshot) {
  mockPaired.current = { store: fakeStore(snap), snapshot: snap };
}

async function beat(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("an ask opened by a push (app/needs/[id])", () => {
  it("says nothing while the catch-up is on its way, and draws the ask when it lands", async () => {
    // The socket still looks open as the app comes back, and the ask is not in yet.
    holding(snapshot({ needsYou: [], approvals: [], connection: "open" }));
    const { rerender } = await renderBare(page());
    expect(screen.queryByText(GONE)).toBeNull();
    await beat(CATCH_UP_MS / 2);
    expect(screen.queryByText(GONE)).toBeNull();
    holding(snapshot());
    await rerender(page());
    expect(screen.getByTestId("decide")).toBeOnTheScreen();
    expect(screen.queryByText(GONE)).toBeNull();
  });

  it("waits for the connection, then says Not here once caught up and still not waiting", async () => {
    holding(snapshot({ needsYou: [], approvals: [], connection: "connecting" }));
    const { rerender } = await renderBare(page());
    await beat(CATCH_UP_MS * 2);
    expect(screen.queryByText(GONE)).toBeNull();
    holding(snapshot({ needsYou: [], approvals: [], connection: "open" }));
    await rerender(page());
    expect(screen.queryByText(GONE)).toBeNull();
    await beat(CATCH_UP_MS);
    expect(screen.getByText(GONE)).toBeOnTheScreen();
  });

  it("draws an ask the store already holds at once", async () => {
    holding(snapshot());
    await renderBare(page());
    expect(screen.getByTestId("decide")).toBeOnTheScreen();
  });

  it("draws an ask somebody answered whole, and opens its space at its run (ADR 0255)", async () => {
    mockPushed.length = 0;
    const answered = approval({
      askedAt: "2026-09-07T10:00:00.000Z",
      question: "Send this email to dana@northwind.com?",
      resolved: {
        decision: "denied",
        by: "per_arjun",
        at: "2026-09-07T10:04:30.000Z",
        scope: "once",
        elsewhere: false,
      },
    });
    const base = snapshot({ needsYou: [], approvals: [answered] });
    const [space] = base.model.spaces;
    holding({
      ...base,
      model: {
        ...base.model,
        spaces: [
          {
            ...space,
            title: "Northwind",
            runs: [{ ...space?.runs[0], runId: "run_1", harnessId: "har_scout" }],
          },
        ],
      },
    } as unknown as Snapshot);
    await renderBare(page());
    expect(screen.queryByTestId("decide")).toBeNull();
    // The face's letter, then who asked where and when, the ask, its risk and the answer.
    expect(screen.getByTestId("answered")).toHaveTextContent(
      /^SScout in NorthwindAsked Monday 7 September at .*External messageYou said no/,
    );
    expect(screen.getByTestId("answered-verdict")).toHaveTextContent(
      /^You said noAt \d{1,2}:04 [AP]M, 4 minutes after Scout asked\.$/,
    );
    expect(screen.getByTestId("answered-open")).toHaveTextContent("Open in Northwind");
    await fireEvent.press(screen.getByTestId("answered-open"));
    expect(mockPushed).toEqual(["/spaces/sp_1?at=run%3Arun_1"]);
  });
});
