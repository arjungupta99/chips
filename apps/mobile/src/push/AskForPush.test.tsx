/**
 * Notifications asked for when an agent first asks something (ADR 0170): once, and only when they
 * aren't on already.
 */

import type { Device, Snapshot, Store } from "@chipschat/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { readSetting, writeSetting } from "../prefs";
import { AskForPush } from "./AskForPush";
import { pushIsOn, turnOnPush } from "./turnOn";

jest.mock("./turnOn", () => ({ pushIsOn: jest.fn(), turnOnPush: jest.fn() }));
jest.mock("../prefs", () => ({
  SETTINGS: { pushAsked: "push.asked" },
  readSetting: jest.fn(),
  writeSetting: jest.fn(),
}));

let snapshot: Snapshot;
const listeners = new Set<() => void>();
const store = {
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => snapshot,
} as unknown as Store;
const DEVICE = { deviceId: "dev_phone", participantId: "usr_a" } as Device;
const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
const asker = () => (
  <SafeAreaProvider initialMetrics={IPHONE}>
    <AskForPush store={store} device={DEVICE} />
  </SafeAreaProvider>
);

function waiting(count: number): Snapshot {
  return {
    model: { needsYou: Array.from({ length: count }, (_, i) => ({ id: `apr_${i}` })) },
  } as unknown as Snapshot;
}

beforeEach(() => {
  jest.mocked(readSetting).mockResolvedValue(undefined);
  jest.mocked(writeSetting).mockResolvedValue(undefined);
  jest.mocked(pushIsOn).mockResolvedValue(false);
  jest.mocked(turnOnPush).mockResolvedValue({ kind: "on" });
});
afterEach(() => jest.clearAllMocks());

it("asks nothing until an agent asks something, then turns them on from the sheet", async () => {
  snapshot = waiting(0);
  await render(asker());
  await act(async () => undefined);
  expect(screen.queryByText("Hear when an agent needs you?")).toBeNull();

  snapshot = waiting(1);
  await act(async () => {
    for (const listener of listeners) listener();
  });
  expect(await screen.findByText("Hear when an agent needs you?")).toBeTruthy();
  // Not "nothing else": what other people write in a space reaches the phone too (ADR 0216).
  expect(
    screen.getByText(
      "Chips tells you when an agent asks you something, so it isn't left waiting, and when another person writes in one of your spaces. Each space's sheet can change that.",
    ),
  ).toBeTruthy();
  await fireEvent.press(screen.getByText("Turn on notifications"));
  await waitFor(() => expect(turnOnPush).toHaveBeenCalledWith(DEVICE));
  await waitFor(() => expect(writeSetting).toHaveBeenCalledWith("push.asked", "1"));
});

it("doesn't ask a phone that has asked before, or whose pushes are on", async () => {
  snapshot = waiting(1);
  jest.mocked(readSetting).mockResolvedValue("1");
  await render(asker());
  await act(async () => undefined);
  expect(screen.queryByText("Hear when an agent needs you?")).toBeNull();
});

it("doesn't ask while the server can't send them, and doesn't count it as asked (ADR 0244)", async () => {
  snapshot = waiting(1);
  const cannot = {
    ...store,
    serverFacts: async () => ({ pushes: "no_access_token" }),
  } as unknown as Store;
  await render(
    <SafeAreaProvider initialMetrics={IPHONE}>
      <AskForPush store={cannot} device={DEVICE} />
    </SafeAreaProvider>,
  );
  await act(async () => undefined);
  expect(screen.queryByText("Hear when an agent needs you?")).toBeNull();
  expect(writeSetting).not.toHaveBeenCalled();
});

it("is put away by its X, as not now, and not asked again", async () => {
  snapshot = waiting(1);
  await render(asker());
  expect(await screen.findByText("Hear when an agent needs you?")).toBeTruthy();
  expect(screen.queryByText("Not now")).toBeNull();
  await fireEvent.press(screen.getByTestId("push-ask-close"));
  await waitFor(() => expect(writeSetting).toHaveBeenCalledWith("push.asked", "1"));
  expect(turnOnPush).not.toHaveBeenCalled();
});

describe("a guest (ADR 0198)", () => {
  const saved: unknown[] = [];
  const guestStore = {
    ...store,
    loadNotificationSettings: async () => ({
      decide: "now",
      review: "hourly",
      fyi: "daily",
      harnesses: {},
      spaces: { spc_other: "none" },
    }),
    notificationSettings: () => ({ decide: "now", review: "hourly", fyi: "daily", harnesses: {} }),
    saveNotificationSettings: async (settings: unknown) => {
      saved.push(settings);
    },
  } as unknown as Store;
  const inJapan = {
    model: {
      needsYou: [],
      people: { usr_a: { participantId: "usr_a", role: "guest" } },
      spaces: [{ id: "spc_japan", title: "Japan trip", members: ["usr_a"] }],
    },
  } as unknown as Snapshot;

  it("is asked about their room once in it, and yes hears every message there", async () => {
    snapshot = inJapan;
    await render(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <AskForPush store={guestStore} device={DEVICE} />
      </SafeAreaProvider>,
    );
    expect(await screen.findByText("Hear when someone writes?")).toBeTruthy();
    expect(
      screen.getByText(
        "Chips tells you when someone writes in Japan trip, and when an agent there needs you.",
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText("Turn on notifications"));
    await waitFor(() =>
      expect(saved).toEqual([
        {
          decide: "now",
          review: "hourly",
          fyi: "daily",
          harnesses: {},
          spaces: { spc_other: "none", spc_japan: "all" },
        },
      ]),
    );
  });

  it("keeps their room as it was when iOS says no", async () => {
    saved.length = 0;
    snapshot = inJapan;
    jest.mocked(turnOnPush).mockResolvedValue({ kind: "denied" } as never);
    await render(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <AskForPush store={guestStore} device={DEVICE} />
      </SafeAreaProvider>,
    );
    await fireEvent.press(await screen.findByText("Turn on notifications"));
    await waitFor(() => expect(writeSetting).toHaveBeenCalledWith("push.asked", "1"));
    expect(saved).toEqual([]);
  });
});
