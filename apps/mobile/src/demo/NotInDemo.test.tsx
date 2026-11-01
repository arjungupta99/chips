/**
 * What the demo cannot do (ADR 0213, point 7): pairing a device, inviting somebody, connecting a
 * harness. In the demo's workspace each says "Not in the demo" where its action would be, with Set
 * up my own Chips beside it, and asks the server for nothing; in a workspace of one's own each is
 * as it was.
 */

import { DEMO_DEVICE_ID, type Store } from "@chipschat/core";
import { render as renderBare, screen, userEvent } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { InviteForm } from "../people/InviteForm";
import { PairSheet } from "../you/PairSheet";

const mockRouter = {
  push: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
  dismissAll: jest.fn(),
  canDismiss: jest.fn(() => true),
};
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

let mockDeviceId = DEMO_DEVICE_ID;
const mockLeave = jest.fn((): unknown => undefined);
jest.mock("../store/provider", () => ({
  useChips: () => ({
    paired: { device: { deviceId: mockDeviceId } },
    demo: { leave: mockLeave },
  }),
  useSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
}));

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const ME = "usr_me";
/** A store that is asked for nothing it is not expected to be asked for. */
function storeOf() {
  const snapshot = {
    directory: { [ME]: { id: ME, kind: "person", displayName: "Arjun" } },
    model: { spaces: [], people: { [ME]: { participantId: ME, role: "owner" } } },
  };
  return {
    getSnapshot: () => snapshot,
    issuePairingCode: jest.fn(() => new Promise(() => undefined)),
    devices: jest.fn(async () => []),
    createInvite: jest.fn(),
  } as unknown as Store & {
    issuePairingCode: jest.Mock;
    createInvite: jest.Mock;
  };
}

afterEach(() => {
  mockDeviceId = DEMO_DEVICE_ID;
  mockLeave.mockClear();
  for (const each of Object.values(mockRouter)) each.mockClear();
});

describe("Not in the demo", () => {
  it("stands where Pair a computer's code would, and asks for no code", async () => {
    const store = storeOf();
    await render(<PairSheet open onClose={() => undefined} store={store} serverUrl={undefined} />);
    expect(screen.getByText("Not in the demo")).toBeOnTheScreen();
    expect(screen.queryByText("Another code")).toBeNull();
    expect(store.issuePairingCode).not.toHaveBeenCalled();
  });

  it("stands where an invite's Make a link would", async () => {
    const store = storeOf();
    await render(<InviteForm store={store} selfId={ME} workspace="Chips demo" />);
    expect(screen.getByText("Not in the demo")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Make a link" })).toBeNull();
  });

  it("leaves the demo for the first screen's ways in, from Set up my own Chips", async () => {
    await render(
      <PairSheet open onClose={() => undefined} store={storeOf()} serverUrl={undefined} />,
    );
    await userEvent.press(screen.getByRole("button", { name: "Set up my own Chips" }));
    expect(mockLeave).toHaveBeenCalledTimes(1);
    expect(mockRouter.dismissAll).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: "/pair", params: { ways: "1" } });
  });

  it("is nowhere in a workspace of one's own", async () => {
    mockDeviceId = "dev_mine";
    const store = storeOf();
    await render(<PairSheet open onClose={() => undefined} store={store} serverUrl={undefined} />);
    expect(screen.queryByText("Not in the demo")).toBeNull();
    expect(store.issuePairingCode).toHaveBeenCalledTimes(1);
  });
});
