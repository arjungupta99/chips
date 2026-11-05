/**
 * Relay (ADR 0211, Phase 4): the owner's switch lists every device by the way it goes now, asks
 * before it turns the relay off, with who would lose the server, asks those people to go direct
 * first when told to, and turns it back on in one tap. The store is a small one that answers as
 * the server would.
 */

import type { Device, RelayDevice, RelayFacts, Snapshot, Store } from "@chipschat/core";
import { act, fireEvent, render as renderBare, screen } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RELAY_EVERY_MS, RelayPage } from "./RelayPage";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}

const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

jest.mock("expo-router", () => {
  const { useEffect } = require("react");
  // In front for as long as it is drawn.
  return {
    useFocusEffect: (effect: () => (() => void) | undefined) => useEffect(effect, [effect]),
  };
});
jest.mock("../store/provider", () => ({
  useSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
}));

const DEVICE = {
  deviceId: "dev_mine",
  participantId: "per_arjun",
  serverUrl: "https://adas-mac-mini.tail2f9c1e.ts.net",
  relayUrl: "wss://relay.chipschat.ai",
} as Device;

const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const device = (over: Partial<RelayDevice> & Pick<RelayDevice, "deviceId">): RelayDevice => ({
  participantId: "per_arjun",
  name: "A device",
  now: undefined,
  lastVia: undefined,
  lastViaAt: undefined,
  directAt: undefined,
  ...over,
});

const DEVICES: readonly RelayDevice[] = [
  device({
    deviceId: "dev_mac",
    name: "Chips for Mac",
    now: "socket",
    lastVia: "socket",
    lastViaAt: ago(HOUR),
    directAt: ago(HOUR),
  }),
  device({
    deviceId: "dev_natalie",
    participantId: "per_natalie",
    name: "iPhone 16",
    now: "relay",
    lastVia: "relay",
    lastViaAt: ago(HOUR),
  }),
  device({
    deviceId: "dev_mine",
    name: "iPhone 17",
    lastVia: "relay",
    lastViaAt: ago(2 * HOUR),
    directAt: ago(3 * 24 * HOUR),
  }),
];

const FACTS: RelayFacts = {
  configured: true,
  on: true,
  setBy: undefined,
  setAt: undefined,
  devices: DEVICES,
  keptLink: "https://login.tailscale.com/admin/invite/abc123",
};

const SNAPSHOT = {
  directory: { per_natalie: { id: "per_natalie", kind: "person", displayName: "Natalie" } },
  model: { people: { per_arjun: { role: "owner" } } },
} as unknown as Snapshot;

function storeWith(first: RelayFacts) {
  let facts = first;
  const asked: string[] = [];
  const store = {
    getSnapshot: () => SNAPSHOT,
    serverFacts: async () => ({ machine: "Arjun's Mac mini" }),
    readRelay: async () => {
      asked.push("read");
      return facts;
    },
    setRelay: async (on: boolean) => {
      asked.push(`set ${on}`);
      facts = { ...facts, on };
      return facts;
    },
    askRelayedToGoDirect: async () => {
      asked.push("ask");
      return 1;
    },
    forgetKeptShareLink: async () => {
      asked.push("forget");
      facts = { ...facts, keptLink: undefined };
    },
  } as unknown as Store;
  return { store, asked };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function wait(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

const text = (testId: string) => screen.getByTestId(testId);

describe("Relay (ADR 0211, Phase 4)", () => {
  it('names a server with no address "your server" in its words, as the demo is', async () => {
    const { store } = storeWith(FACTS);
    const silent = {
      ...store,
      serverFacts: async () => Promise.reject(new Error("Not in the demo")),
    };
    await render(<RelayPage store={silent as Store} device={{ ...DEVICE, serverUrl: "" }} />);
    await wait(0);
    expect(text("relay-foot")).toHaveTextContent(/can't reach your server directly/);
    expect(text("relay-foot")).not.toHaveTextContent(/This network/);
  });

  it("lists every device by the way it goes now, and says what the relay does", async () => {
    const { store, asked } = storeWith(FACTS);
    await render(<RelayPage store={store} device={DEVICE} />);
    await wait(0);
    expect(text("relay-switch")).toHaveProp("value", true);
    expect(text("relay-foot")).toHaveTextContent(
      "relay.chipschat.ai carries sealed traffic for devices that can't reach Arjun's Mac mini directly. With it off, Chips is reachable only over Tailscale. Each day the relay writes down how many servers and connections it carried. What Chips counts ›",
    );
    // Chips's own relay links the page that says what it counts (ADR 0208).
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await fireEvent.press(text("relay-foot-link"));
    expect(open).toHaveBeenCalledWith("https://chipschat.ai/operate/what-chips-counts/");
    open.mockRestore();
    expect(text("relay-relayed")).toHaveTextContent("iPhone 16 · Natalienever direct");
    expect(text("relay-direct")).toHaveTextContent("Chips for Macdirect");
    // This phone is itself in the list.
    expect(text("relay-away")).toHaveTextContent("This phonerelay, 2 h ago");
    // Read again while the page is open: the list moves as people go direct.
    await wait(RELAY_EVERY_MS);
    expect(asked.filter((each) => each === "read")).toHaveLength(2);
  });

  it("says why the server isn't connected while the relay is on, and nothing once it is", async () => {
    const { store } = storeWith({ ...FACTS, status: "connecting", why: "busy" });
    await render(<RelayPage store={store} device={DEVICE} />);
    await wait(0);
    expect(text("relay-switch")).toHaveProp("value", true);
    expect(text("relay-not-connected")).toHaveTextContent(
      "On, but not connected: the relay already lists as many servers from your internet address as it takes.",
    );
    await render(
      <RelayPage store={storeWith({ ...FACTS, status: "connected" }).store} device={DEVICE} />,
    );
    await wait(0);
    expect(screen.queryByTestId("relay-not-connected")).toBeNull();
  });

  it("asks before it turns off, with who would lose the server, and asks them to go direct first", async () => {
    const { store, asked } = storeWith(FACTS);
    await render(<RelayPage store={store} device={DEVICE} />);
    await wait(0);
    await fireEvent(text("relay-switch"), "valueChange", false);
    expect(text("relay-off-lead")).toHaveTextContent(
      "2 devices last reached Chips through the relay. They would lose their connection until they go direct.",
    );
    expect(text("relay-off-sheet")).toHaveTextContent(
      /iPhone 16 · Natalienever directThis phonedirect 3 d agoNew invite and pairing links will open only on your tailnet\./,
    );
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Ask them to go direct first" }));
    });
    expect(asked).toContain("ask");
    expect(asked).not.toContain("set false");
    expect(text("relay-toast")).toHaveTextContent("Asked 1 person to go direct");
    expect(text("relay-switch")).toHaveProp("value", true);
  });

  it("turns off when told now, and back on in one tap", async () => {
    const { store, asked } = storeWith(FACTS);
    await render(<RelayPage store={store} device={DEVICE} />);
    await wait(0);
    await fireEvent(text("relay-switch"), "valueChange", false);
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Turn off now" }));
    });
    expect(asked).toContain("set false");
    expect(text("relay-switch")).toHaveProp("value", false);
    await act(async () => {
      fireEvent(text("relay-switch"), "valueChange", true);
    });
    expect(asked).toContain("set true");
    expect(text("relay-switch")).toHaveProp("value", true);
  });

  it("forgets the share link kept for the next guest", async () => {
    const { store, asked } = storeWith(FACTS);
    await render(<RelayPage store={store} device={DEVICE} />);
    await wait(0);
    expect(text("relay-kept")).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Forget" }));
    });
    expect(asked).toContain("forget");
    expect(screen.queryByTestId("relay-kept")).toBeNull();
  });

  it("says so when the server has no relay to turn", async () => {
    const { store } = storeWith({ ...FACTS, configured: false, devices: [] });
    await render(<RelayPage store={store} device={DEVICE} />);
    await wait(0);
    expect(text("relay-none")).toBeOnTheScreen();
    expect(screen.queryByTestId("relay-switch")).toBeNull();
  });
});
