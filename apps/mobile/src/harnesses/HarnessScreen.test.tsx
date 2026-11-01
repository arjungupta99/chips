/**
 * A harness's route (`app/harnesses/[id]/index.tsx`) for each role (ADR 0196): a guest who reaches it by
 * a link finds "Not here", with nothing to turn; anybody else finds the harness's page. The test
 * lives beside the page because every file under `app/` is a route.
 */

import type { Snapshot } from "@chipschat/core";
import { render as renderBare, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import type { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import HarnessScreen from "../../app/harnesses/[id]/index";
import { fakeStore, snapshot } from "../testing/fixtures";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
const render = (element: ReactElement) =>
  renderBare(<SafeAreaProvider initialMetrics={IPHONE}>{element}</SafeAreaProvider>);

jest.mock("expo-router", () => ({
  Redirect: () => null,
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: "har_scout" }),
}));

const mockPaired: { current?: { store: unknown; snapshot: Snapshot; selfId: string } } = {};
jest.mock("../store/provider", () => ({
  useChips: () => ({
    paired: {
      store: mockPaired.current?.store,
      device: { participantId: mockPaired.current?.selfId },
    },
  }),
  useSnapshot: () => mockPaired.current?.snapshot,
}));
jest.mock("../ui/layout", () => ({
  ...jest.requireActual("../ui/layout"),
  useLayout: () => ({ wide: false, roomy: false, landscape: false }),
}));
jest.mock("../context/useFocusCount", () => ({ useFocusCount: () => 0 }));
jest.mock("./Profile", () => ({
  Profile: ({ harnessId }: { readonly harnessId: string }) => {
    const { Text: Shown } = jest.requireActual<{ Text: typeof Text }>("react-native");
    return <Shown testID="harness-profile">{harnessId}</Shown>;
  },
}));

/** The fixture's workspace, read by Dana with the role given. */
function as(role: "admin" | "member" | "guest"): Snapshot {
  const base = snapshot();
  return {
    ...base,
    model: {
      ...base.model,
      people: {
        ...base.model.people,
        per_dana: { participantId: "per_dana", displayName: "Dana Ruiz", role },
      },
    },
  } as unknown as Snapshot;
}

describe("a harness's page, by role (ADR 0196)", () => {
  it("says Not here to a guest who opens it by a link, with nothing on it to turn", async () => {
    const snap = as("guest");
    mockPaired.current = { store: fakeStore(snap), snapshot: snap, selfId: "per_dana" };
    await render(<HarnessScreen />);
    expect(
      screen.getByText("Not here: a harness's page is for the people who run the workspace."),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId("harness-profile")).toBeNull();
  });

  for (const role of ["member", "admin"] as const) {
    it(`opens the harness's page for ${role === "admin" ? "an" : "a"} ${role}`, async () => {
      const snap = as(role);
      mockPaired.current = { store: fakeStore(snap), snapshot: snap, selfId: "per_dana" };
      await render(<HarnessScreen />);
      expect(screen.getByTestId("harness-profile")).toHaveTextContent("har_scout");
      expect(screen.queryByText(/^Not here/)).toBeNull();
    });
  }
});
