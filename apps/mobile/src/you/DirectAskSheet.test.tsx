/**
 * A guest asks to go direct, on an owner's phone (ADR 0211, Phase 3): the sheet opens for an owner
 * alone, says who asks and how slow the relay is for them, holds Send until the field holds
 * Tailscale's link, offers to keep it for the next guest once it does, ticked, and says it went.
 */

import type { Device, DirectAsk, Snapshot, Store } from "@chipschat/core";
import {
  act,
  fireEvent,
  render as renderBare,
  screen,
  userEvent,
} from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DirectAsks } from "./DirectAskSheet";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));
jest.mock("../store/provider", () => {
  const { useSyncExternalStore } = require("react");
  return {
    useSnapshot: (store: {
      subscribe: (f: () => void) => () => void;
      getSnapshot: () => unknown;
    }) => useSyncExternalStore(store.subscribe, store.getSnapshot),
  };
});

const DEVICE = {
  participantId: "per_arjun",
  serverUrl: "https://adas-mac-mini.tail2f9c1e.ts.net",
} as Device;
const LINK = "https://login.tailscale.com/admin/invite/abc123";
const ASK: DirectAsk = {
  askId: "dra_1",
  participantId: "per_dana",
  state: "asked",
  tripMs: 432,
  link: undefined,
  sharedBy: undefined,
  askedAt: "2026-10-20T16:12:00.000Z",
  sharedAt: undefined,
};

/** A workspace Arjun owns or is a member of, with Dana's ask waiting. */
function storeOn(role: "owner" | "member", kept?: string) {
  let snapshot = {
    connection: "open",
    directory: { per_dana: { id: "per_dana", kind: "person", displayName: "Dana" } },
    directAsks: new Map([[ASK.askId, ASK]]),
    keptShareLink: kept,
    model: { people: { per_arjun: { role } } },
  } as unknown as Snapshot;
  const listeners = new Set<() => void>();
  const shared: unknown[] = [];
  const store = {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    serverFacts: async () => ({ machine: "Arjun's Mac mini" }),
    shareDirect: async (askId: string, link: string, keep: boolean) => {
      shared.push({ askId, link, keep });
      const done = { ...ASK, state: "shared", link, sharedBy: "per_arjun" } as DirectAsk;
      snapshot = { ...snapshot, directAsks: new Map([[askId, done]]) };
      for (const listener of listeners) listener();
      return done;
    },
  } as unknown as Store;
  return { store, shared };
}

/** Typed into the link's field, as a paste does. */
async function type(text: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByTestId("direct-ask-link"), text);
  });
}

describe("a guest's ask to go direct", () => {
  it("asks an owner for Tailscale's link, and sends it kept for the next guest", async () => {
    const on = storeOn("owner");
    await render(<DirectAsks store={on.store} device={DEVICE} />);
    expect(await screen.findByText("Dana wants to connect directly")).toBeOnTheScreen();
    expect(
      screen.getByText("They go through the relay now, 432 ms a round trip."),
    ).toBeOnTheScreen();
    expect(await screen.findByText(/open Arjun's Mac mini's menu, then Share/)).toBeOnTheScreen();
    expect(screen.getByTestId("direct-ask-warning")).toHaveTextContent(/but all of it/);
    const send = () => screen.getByRole("button", { name: "Send to Dana" });
    expect(send()).toBeDisabled();
    // Something that only looks like Tailscale's link is not one.
    await type("https://tailscale.evil.io/x");
    expect(send()).toBeDisabled();
    expect(screen.queryByTestId("direct-ask-keep")).toBeNull();
    await type(` ${LINK} `);
    expect(send()).toBeEnabled();
    // Offered once there is a link, ticked.
    expect(screen.getByTestId("direct-ask-keep")).toHaveProp("value", true);
    await userEvent.press(send());
    expect(on.shared).toEqual([{ askId: "dra_1", link: LINK, keep: true }]);
    expect(await screen.findByText("Sent to Dana")).toBeOnTheScreen();
    expect(screen.getByText("You'll hear when they're direct.")).toBeOnTheScreen();
  });

  it("fills in the link kept for the next guest, and forgets it when unticked", async () => {
    const on = storeOn("owner", LINK);
    await render(<DirectAsks store={on.store} device={DEVICE} />);
    expect(await screen.findByTestId("direct-ask-link")).toHaveDisplayValue(LINK);
    await act(async () => {
      fireEvent(screen.getByTestId("direct-ask-keep"), "valueChange", false);
    });
    await userEvent.press(screen.getByRole("button", { name: "Send to Dana" }));
    expect(on.shared).toEqual([{ askId: "dra_1", link: LINK, keep: false }]);
  });

  it("asks nobody but an owner", async () => {
    const on = storeOn("member");
    await render(<DirectAsks store={on.store} device={DEVICE} />);
    expect(screen.queryByTestId("direct-ask-sheet")).toBeNull();
  });
});
