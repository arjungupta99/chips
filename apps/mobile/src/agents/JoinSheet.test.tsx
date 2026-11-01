/**
 * Something asks to join, on the phone (ADR 0122): the sheet opens for an owner, shows the code and
 * what it asks for as switches, and allows only what is left on; Don't allow refuses it; nobody who
 * may not decide is asked. And Connect a harness is offered only to whoever may make links; its
 * sheet is `harnesses/Connect.test.tsx`'s.
 */

import type { JoinRequest, Snapshot } from "@chipschat/core";
import {
  act,
  fireEvent,
  render as renderBare,
  screen,
  userEvent,
} from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { Keyboard } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore } from "../testing/fixtures";
import { Agents } from "./Agents";
import { JoinAsks } from "./JoinSheet";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: () => undefined }),
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));
jest.mock("../store/provider", () => ({
  useSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
  useDeferredSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
}));

const TIDE: JoinRequest = {
  requestId: "jrq_01K4ZQPX0000000000000000J1",
  kind: "harness",
  state: "waiting",
  startedBy: "requester",
  code: "KQ7-M4P",
  name: "Tide",
  software: "tide 0.4.1",
  machine: "vps-fra-1",
  fromAddr: "100.88.4.12",
  wants: ["autonomy", "new_spaces", "restarts"],
  capabilities: [],
  url: "http://192.168.1.20:4431",
  createdAt: "2026-10-05T21:00:00.000Z",
  expiresAt: "2026-10-05T21:10:00.000Z",
};

/** A workspace Arjun owns, or is a member of, with what waits. */
function state(role: "owner" | "member", joins: JoinRequest[] = [TIDE]): Snapshot {
  return {
    connection: "open",
    link: "direct",
    directoryFrom: "server",
    busy: new Set<string>(),
    receipts: new Map(),
    readState: {},
    spaceIcons: new Map(),
    directory: { per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" } },
    joins: new Map(joins.map((each) => [each.requestId, each])),
    model: {
      needsYou: [],
      lanes: [],
      spaces: [],
      fleet: [],
      harnesses: {},
      connections: {},
      audit: [],
      people: { per_arjun: { id: "per_arjun", role, displayName: "Arjun" } },
    },
  } as unknown as Snapshot;
}

describe("the join sheet", () => {
  it("asks an owner, with the code and the switches, and allows only what is left on", async () => {
    const store = fakeStore(state("owner"));
    await render(<JoinAsks store={store} selfId="per_arjun" />);
    expect(await screen.findByText("Tide wants to join")).toBeTruthy();
    expect(screen.getByTestId("join-code")).toHaveTextContent("KQ7-M4P");
    expect(screen.getByText("tide 0.4.1 · vps-fra-1 · 100.88.4.12")).toBeTruthy();
    // A switch is turned by its value, as a thumb on it does.
    await act(async () => {
      fireEvent(screen.getByLabelText("Be restarted from Chips"), "valueChange", false);
    });
    await userEvent.press(screen.getByLabelText("Allow"));
    expect(store.calls.filter((each) => each.name === "allowJoin")).toEqual([
      {
        name: "allowJoin",
        args: { requestId: TIDE.requestId, capabilities: ["autonomy", "new_spaces"] },
      },
    ]);
  });

  it("asks for a device's code to be typed, and allows with it (SEC-6)", async () => {
    const ipad: JoinRequest = {
      ...TIDE,
      requestId: "jrq_01K4ZQPX0000000000000000J2",
      kind: "device",
      name: "Arjun's iPad",
      software: undefined,
      machine: undefined,
      code: undefined,
      wants: [],
    };
    const store = fakeStore(state("owner", [ipad]));
    await render(<JoinAsks store={store} selfId="per_arjun" />);
    expect(await screen.findByText("Arjun's iPad wants to pair")).toBeTruthy();
    // The code is the device's to show, so the sheet shows none, and Allow waits for it.
    expect(screen.queryByTestId("join-code")).toBeNull();
    expect(screen.getByLabelText("Allow")).toBeDisabled();
    await act(async () => {
      fireEvent.changeText(screen.getByTestId("join-code-field"), "kq7 m4p");
    });
    expect(screen.getByLabelText("Allow")).toBeEnabled();
    await userEvent.press(screen.getByLabelText("Allow"));
    expect(store.calls.filter((each) => each.name === "allowJoin")).toEqual([
      { name: "allowJoin", args: { requestId: ipad.requestId, capabilities: [], code: "KQ7-M4P" } },
    ]);
  });

  it("puts the keys away once a whole code is typed, and not before, so Allow is in sight (NP-2)", async () => {
    const ipad: JoinRequest = {
      ...TIDE,
      requestId: "jrq_01K4ZQPX0000000000000000J4",
      kind: "device",
      name: "Natalie's iPhone",
      software: undefined,
      machine: undefined,
      code: undefined,
      wants: [],
    };
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    try {
      await render(<JoinAsks store={fakeStore(state("owner", [ipad]))} selfId="per_arjun" />);
      expect(await screen.findByText("Natalie's iPhone wants to pair")).toBeTruthy();
      for (const typed of ["K", "KQ7", "KQ7-M4"]) {
        await act(async () => {
          fireEvent.changeText(screen.getByTestId("join-code-field"), typed);
        });
      }
      expect(dismiss).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.changeText(screen.getByTestId("join-code-field"), "KQ7-M4P");
      });
      expect(dismiss).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText("Allow")).toBeEnabled();
    } finally {
      dismiss.mockRestore();
    }
  });

  it("lets an owner pair a phone that asks as Natalie, whose own was wiped (ADR 0206)", async () => {
    const phone: JoinRequest = {
      ...TIDE,
      requestId: "jrq_01K4ZQPX0000000000000000J3",
      kind: "device",
      name: "iPhone 16",
      software: undefined,
      machine: undefined,
      code: undefined,
      wants: [],
    };
    const home = state("owner", [phone]);
    const snapshot = {
      ...home,
      directory: {
        ...home.directory,
        per_natalie: { id: "per_natalie", kind: "person", displayName: "Natalie" },
      },
      model: {
        ...home.model,
        people: {
          ...home.model.people,
          per_natalie: { id: "per_natalie", role: "member", displayName: "Natalie" },
        },
      },
    } as unknown as Snapshot;
    const store = fakeStore(snapshot);
    await render(<JoinAsks store={store} selfId="per_arjun" />);
    expect(await screen.findByText("iPhone 16 wants to pair")).toBeTruthy();
    expect(screen.getByTestId("join-paired-words")).toHaveTextContent(
      "It is paired as you, as if you had scanned your code with it.",
    );
    await userEvent.press(screen.getByLabelText("Natalie"));
    expect(screen.getByTestId("join-paired-words")).toHaveTextContent(
      "It is paired as Natalie, with their spaces and everything they said: for Natalie's new phone.",
    );
    await act(async () => {
      fireEvent.changeText(screen.getByTestId("join-code-field"), "KQ7-M4P");
    });
    await userEvent.press(screen.getByLabelText("Allow"));
    expect(store.calls.filter((each) => each.name === "allowJoin")).toEqual([
      {
        name: "allowJoin",
        args: { requestId: phone.requestId, capabilities: [], code: "KQ7-M4P", as: "per_natalie" },
      },
    ]);
  });

  it("refuses with Don't allow", async () => {
    const store = fakeStore(state("owner"));
    await render(<JoinAsks store={store} selfId="per_arjun" />);
    await userEvent.press(await screen.findByLabelText("Don't allow"));
    expect(store.calls.filter((each) => each.name === "denyJoin")).toEqual([
      { name: "denyJoin", args: TIDE.requestId },
    ]);
  });

  it("shows an invite's six digits to compare, and allows with nothing typed (ADR 0232)", async () => {
    const priya: JoinRequest = {
      ...TIDE,
      requestId: "jrq_01K4ZQPX0000000000000000J3",
      kind: "invite",
      name: "Priya",
      software: undefined,
      machine: "Priya's iPhone",
      fromAddr: undefined,
      code: "742913",
      role: "guest",
      spaceId: "spc_japan",
      wants: [],
    };
    const owner = state("owner", [priya]);
    const store = fakeStore({
      ...owner,
      model: { ...owner.model, spaces: [{ id: "spc_japan", title: "Japan trip" }] },
    } as unknown as Snapshot);
    await render(<JoinAsks store={store} selfId="per_arjun" />);
    expect(await screen.findByText("Priya is asking to join Japan trip")).toBeTruthy();
    expect(screen.getByTestId("join-line")).toHaveTextContent("As a guest · from your invite");
    expect(screen.getByText("Priya's screen shows")).toBeTruthy();
    expect(screen.getByTestId("join-code")).toHaveTextContent("742 913");
    // Compared, not typed: no field, and Allow is ready at once.
    expect(screen.queryByTestId("join-code-field")).toBeNull();
    await userEvent.press(screen.getByLabelText("Allow"));
    expect(store.calls.filter((each) => each.name === "allowJoin")).toEqual([
      { name: "allowJoin", args: { requestId: priya.requestId, capabilities: [] } },
    ]);
  });

  it("asks a member about a code they made for their own computer (ADR 0232)", async () => {
    const studio: JoinRequest = {
      ...TIDE,
      requestId: "jrq_01K4ZQPX0000000000000000J4",
      kind: "pairing",
      name: "Studio",
      software: undefined,
      machine: undefined,
      fromAddr: undefined,
      code: "018004",
      wants: [],
    };
    const store = fakeStore(state("member", [studio]));
    await render(<JoinAsks store={store} selfId="per_arjun" />);
    expect(await screen.findByText("Studio is asking to pair as you")).toBeTruthy();
    expect(screen.getByTestId("join-code")).toHaveTextContent("018 004");
  });

  it("asks nobody who may not decide", async () => {
    await render(<JoinAsks store={fakeStore(state("member"))} selfId="per_arjun" />);
    expect(screen.queryByText("Tide wants to join")).toBeNull();
  });
});

describe("Connect a harness on the phone", () => {
  it("is not offered to somebody who may not make links", async () => {
    await render(<Agents store={fakeStore(state("member", []))} selfId="per_arjun" />);
    expect(screen.queryByTestId("add-agent")).toBeNull();
    expect(
      screen.getByText("No agents yet. A harness's agents come when it connects."),
    ).toBeTruthy();
  });
});
