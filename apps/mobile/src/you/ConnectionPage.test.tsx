/**
 * Connection (ADR 0211): the page says which way the phone reaches its server and what that
 * means, times a round trip while it is open, says since when and how it went before, and when
 * the socket leaves the relay, says so with the time now against the time before. The store is a
 * small one here whose snapshot a test changes, as the transport would.
 */

import type { Device, Snapshot, Store } from "@chipschat/core";
import {
  act,
  fireEvent,
  render as renderBare,
  screen,
  userEvent,
} from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConnectionPage, TRIP_EVERY_MS } from "./ConnectionPage";
import { GUIDE_CHECK_MS, GUIDE_DONE_MS } from "./GoDirectSheet";

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
jest.mock("../store/provider", () => {
  const { useSyncExternalStore } = require("react");
  return {
    useSnapshot: (store: {
      subscribe: (f: () => void) => () => void;
      getSnapshot: () => unknown;
    }) => useSyncExternalStore(store.subscribe, store.getSnapshot),
  };
});
const mockFelt: string[] = [];
jest.mock("../ui/haptics", () => ({ success: () => mockFelt.push("success") }));

const DEVICE = {
  participantId: "per_arjun",
  serverUrl: "https://adas-mac-mini.tail2f9c1e.ts.net",
  relayUrl: "wss://relay.chipschat.ai",
} as Device;

/** The workspace as far as the page reads it: who is its owner. */
const OWNER = { people: { per_arjun: { role: "owner" } } } as unknown as Snapshot["model"];
const MEMBER = { people: { per_arjun: { role: "member" } } } as unknown as Snapshot["model"];

/** A store whose snapshot moves when a test says, and whose round trips take what it says. */
function storeOn(first: Partial<Snapshot>) {
  let snapshot = { connection: "open", model: OWNER, ...first } as Snapshot;
  const listeners = new Set<() => void>();
  const trips: number[] = [];
  const asked: string[] = [];
  const store = {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    serverFacts: async () => ({ machine: "Arjun's Mac mini" }),
    roundTrip: async () => trips.shift() ?? 400,
    goDirect: async () => {
      asked.push("goDirect");
      return false;
    },
    setOnlyDirect: async (on: boolean) => {
      asked.push(`onlyDirect ${on}`);
    },
    readMyDirectAsk: async () => {
      asked.push("readMine");
      return snapshot.myDirectAsk;
    },
    askToGoDirect: async (tripMs?: number) => {
      asked.push(`ask ${tripMs}`);
    },
  } as unknown as Store;
  return {
    store,
    trips,
    asked,
    move(next: Partial<Snapshot>) {
      snapshot = { ...snapshot, ...next };
      for (const listener of listeners) listener();
    },
  };
}

const SINCE = "2026-10-20T07:40:00.000Z";

beforeEach(() => {
  jest.useFakeTimers();
  mockFelt.length = 0;
});
afterEach(() => jest.useRealTimers());

/** Lets the timers run on, and what they started come back. */
async function wait(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

describe("Connection (ADR 0211)", () => {
  it("says the relay is in the way, what it sees, and how long a round trip takes", async () => {
    const on = storeOn({ link: "relay", linkSince: SINCE });
    on.trips.push(410, 2000, 420);
    await render(<ConnectionPage store={on.store} device={DEVICE} />);
    expect(screen.getByTestId("connection-path")).toHaveTextContent("Through the relay");
    expect(screen.getByTestId("connection-words")).toHaveTextContent(/never what's said\./);
    // The first read is made as the page opens; two more on the clock.
    expect(screen.getByTestId("connection-trip")).toHaveTextContent("410 ms");
    await wait(TRIP_EVERY_MS * 2);
    // The middle of the three: one slow read does not move it.
    expect(screen.getByTestId("connection-trip")).toHaveTextContent("420 ms");
    expect(
      screen.getByLabelText("This phone through relay.chipschat.ai to Arjun's Mac mini"),
    ).toBeOnTheScreen();
    expect(screen.getByTestId("connection-history")).toHaveTextContent(
      /^Since(\d{1,2}:40\s(AM|PM)|[A-Z][a-z]{2} \d{1,2})$/,
    );
  });

  it("says it went direct, with the time now against the time before, and feels it", async () => {
    const on = storeOn({ link: "relay", linkSince: SINCE });
    on.trips.push(410, 410, 410);
    await render(<ConnectionPage store={on.store} device={DEVICE} />);
    await wait(TRIP_EVERY_MS * 2);
    on.trips.push(38);
    await act(() =>
      on.move({
        link: "tunnel",
        linkSince: "2026-10-20T09:43:00.000Z",
        linkBefore: { kind: "relay", since: SINCE, until: "2026-10-20T09:43:00.000Z" },
      }),
    );
    await wait(0);
    expect(screen.getByTestId("connection-toast")).toHaveTextContent(
      "Direct now · 38 ms, was 410 ms",
    );
    expect(mockFelt).toEqual(["success"]);
    expect(screen.getByTestId("connection-path")).toHaveTextContent("Direct");
    expect(screen.getByTestId("connection-words")).toHaveTextContent(
      "Straight to Arjun's Mac mini over Tailscale, encrypted end to end. Nothing else is in the path.",
    );
    expect(screen.getByLabelText("This phone straight to Arjun's Mac mini")).toBeOnTheScreen();
    expect(screen.getByText("Relay, 2 h")).toBeOnTheScreen();
    await wait(4000);
    expect(screen.queryByTestId("connection-toast")).toBeNull();
  });

  it("says when neither way answers, and times nothing", async () => {
    const on = storeOn({ connection: "closed", link: undefined });
    await render(<ConnectionPage store={on.store} device={DEVICE} />);
    await wait(0);
    expect(screen.getByTestId("connection-path")).toHaveTextContent("Can't reach Arjun's Mac mini");
    expect(screen.queryByTestId("connection-trip")).toBeNull();
    expect(screen.queryByTestId("connection-history")).toBeNull();
  });

  it("offers the owner Go direct on the relay, and the guide waits on the server (Phase 2)", async () => {
    const on = storeOn({ link: "relay", linkSince: SINCE });
    await render(<ConnectionPage store={on.store} device={DEVICE} />);
    await wait(0);
    await userEvent.press(screen.getByTestId("go-direct-row"));
    expect(screen.getByTestId("go-direct-sheet")).toBeOnTheScreen();
    expect(screen.getByTestId("go-direct-step-2")).toHaveTextContent(
      /Arjun's Mac mini is in tail2f9c1e\. Sign in to the same one\./,
    );
    expect(screen.getByTestId("go-direct-step-3")).toHaveTextContent(
      /Waiting for Arjun's Mac mini/,
    );
    // Asked at once, and again every few seconds while it waits.
    await wait(GUIDE_CHECK_MS * 2);
    expect(on.asked.filter((each) => each === "goDirect")).toHaveLength(3);
    // The server answers: every step goes green, and the sheet goes by itself.
    await act(() => on.move({ link: "tunnel", wentDirect: true }));
    expect(screen.getByTestId("go-direct-step-3")).toHaveTextContent(/answered directly/);
    expect(screen.getByLabelText(/^Step 1, done/)).toBeOnTheScreen();
    await wait(GUIDE_DONE_MS);
    // Then the sheet's own way down.
    await wait(2000);
    expect(screen.queryByTestId("go-direct-step-3")).toBeNull();
    expect(screen.queryByTestId("go-direct-row")).toBeNull();
  });

  it("guides somebody who is not an owner through an ask, and the invite once shared (Phase 3)", async () => {
    const on = storeOn({
      link: "relay",
      model: MEMBER,
      directory: { per_natalie: { displayName: "Natalie" } } as unknown as Snapshot["directory"],
    });
    on.trips.push(430);
    await render(<ConnectionPage store={on.store} device={DEVICE} />);
    await wait(0);
    // Their ask is read as the page opens.
    expect(on.asked).toContain("readMine");
    expect(screen.getByTestId("go-direct-row")).toHaveTextContent(/An owner shares the server/);
    await userEvent.press(screen.getByTestId("go-direct-row"));
    expect(screen.getByTestId("go-direct-step-1")).toHaveTextContent(
      /Chips asks the owners to share Arjun's Mac mini with you\./,
    );
    // Nothing to wait on before it is shared.
    expect(on.asked).not.toContain("goDirect");
    await userEvent.press(screen.getByRole("button", { name: "Ask an owner" }));
    expect(on.asked).toContain("ask 430");
    const ask = {
      askId: "dra_1",
      participantId: "per_arjun",
      state: "asked",
      askedAt: "2026-10-20T16:12:00.000Z",
    };
    await act(() => on.move({ myDirectAsk: ask } as Partial<Snapshot>));
    expect(screen.getByTestId("go-direct-step-1")).toHaveTextContent(
      /Asked at .+ when it's shared/,
    );
    expect(screen.queryByRole("button", { name: "Ask an owner" })).toBeNull();
    // Read again while it waits.
    const reads = on.asked.filter((each) => each === "readMine").length;
    await wait(GUIDE_CHECK_MS * 2);
    expect(on.asked.filter((each) => each === "readMine").length).toBe(reads + 2);
    // Shared: the invite to open, and the server waited on.
    await act(() =>
      on.move({
        myDirectAsk: {
          ...ask,
          state: "shared",
          sharedBy: "per_natalie",
          link: "https://login.tailscale.com/admin/invite/x",
        },
      } as Partial<Snapshot>),
    );
    expect(screen.getByTestId("go-direct-step-1")).toHaveTextContent(/Natalie shared it\./);
    expect(screen.getByLabelText(/^Step 1, done/)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Open the invite" })).toBeOnTheScreen();
    await wait(GUIDE_CHECK_MS);
    expect(on.asked).toContain("goDirect");
  });

  it("offers Go direct to nobody off a tailnet", async () => {
    const lan = storeOn({ link: "relay" });
    await render(
      <ConnectionPage
        store={lan.store}
        device={{ ...DEVICE, serverUrl: "http://192.168.1.20:4431" }}
      />,
    );
    await wait(0);
    expect(screen.queryByTestId("go-direct-row")).toBeNull();
  });

  it("offers Only direct once the phone has gone direct, and says why it is not connected while on", async () => {
    const on = storeOn({ link: "relay" });
    await render(<ConnectionPage store={on.store} device={DEVICE} />);
    await wait(0);
    expect(screen.getByTestId("only-direct-switch")).toBeDisabled();
    expect(screen.getByTestId("only-direct-foot")).toHaveTextContent(
      "Connect directly once to turn this on.",
    );
    await act(() => on.move({ link: "tunnel", wentDirect: true }));
    expect(screen.getByTestId("only-direct-switch")).toBeEnabled();
    expect(screen.getByTestId("only-direct-foot")).toHaveTextContent(/never uses the relay/);
    await fireEvent(screen.getByTestId("only-direct-switch"), "valueChange", true);
    expect(on.asked).toContain("onlyDirect true");
    await act(() => on.move({ onlyDirect: true, connection: "closed" }));
    await wait(0);
    expect(screen.getByTestId("connection-words")).toHaveTextContent(
      /Only direct is on, so this phone won't use the relay/,
    );
  });

  it("says who turned the relay off once it cannot connect, and keeps Go direct offered (Phase 4)", async () => {
    const on = storeOn({
      connection: "closed",
      link: undefined,
      model: {
        ...OWNER,
        relay: { on: false, by: "per_natalie", at: "2026-10-21T09:05:00.000Z" },
      } as unknown as Snapshot["model"],
      directory: { per_natalie: { displayName: "Natalie" } } as unknown as Snapshot["directory"],
    });
    await render(<ConnectionPage store={on.store} device={DEVICE} />);
    await wait(0);
    expect(screen.getByTestId("connection-words")).toHaveTextContent(
      /^Natalie turned the relay off at .+, so Chips reaches Arjun's Mac mini only over Tailscale now\. What you send waits here and goes once it is connected\.$/,
    );
    expect(screen.getByTestId("go-direct-row")).toBeOnTheScreen();
    // Trying again says the same: the relay being off is still why.
    await act(() => on.move({ connection: "connecting" }));
    await wait(0);
    expect(screen.getByTestId("connection-words")).toHaveTextContent(
      /^Natalie turned the relay off/,
    );
  });

  it("offers no Only direct to a phone with no relay to leave", async () => {
    const on = storeOn({ link: "tunnel", wentDirect: true });
    await render(
      <ConnectionPage
        store={on.store}
        device={{ participantId: "per_arjun", serverUrl: DEVICE.serverUrl } as Device}
      />,
    );
    await wait(0);
    expect(screen.queryByTestId("only-direct")).toBeNull();
  });
});
