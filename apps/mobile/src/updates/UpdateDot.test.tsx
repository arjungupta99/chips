/**
 * The update dot (ADR 0296): lit at the top of the tabs when an update that asks for it waits, out
 * when nothing does, when About already put it out for that version, or when it is turned off here;
 * a tap opens About.
 */

import type { Store } from "@chipschat/core";
import { render, screen, userEvent } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { flights } from "./flight";
import { UpdateDot } from "./UpdateDot";
import { UpdatesProvider } from "./updates";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const mockPushed: string[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (to: string) => mockPushed.push(to) }),
}));
jest.mock("../about/build", () => ({
  appBuild: () => ({ version: "1.2.4", build: "202611111859", commit: "b45d368" }),
}));
const mockSettings = new Map<string, string>();
jest.mock("../prefs", () => ({
  SETTINGS: { updateDot: "update.dot", updateSeen: "update.seen" },
  readSetting: async (name: string) => mockSettings.get(name),
  writeSetting: async (name: string, value: string) => {
    mockSettings.set(name, value);
  },
}));

/**
 * A computer on 1.2.4 that read the App Store at `appStore`, and the site's releases: by default
 * 1.3.0, long out and asking for the dot.
 */
function storeWith(
  appStore: string,
  releases = [{ version: "1.3.0", date: "2026-01-05", line: "Something new.", dot: true }],
): Store {
  return {
    serverFacts: async () => ({
      machine: "Mac mini",
      version: "1.2.4",
      publicUrl: "https://mini",
      relay: { url: undefined, status: "off" },
      updates: {
        releases,
        appStore,
      },
    }),
  } as unknown as Store;
}

function tabs(store: Store, children: ReactNode = <UpdateDot />) {
  return render(
    <SafeAreaProvider initialMetrics={IPHONE}>
      <UpdatesProvider store={store} owner>
        {children}
      </UpdatesProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockPushed.length = 0;
  mockSettings.clear();
});

describe("the update dot", () => {
  it("lights when the App Store has a release that asks for it, and opens About", async () => {
    await tabs(storeWith("1.3.0"));
    const dot = await screen.findByTestId("update-dot");
    expect(dot).toHaveProp("accessibilityLabel", "Update available. Opens About.");
    await userEvent.press(dot);
    expect(mockPushed).toEqual(["/about"]);
  });

  it("takes off for About's Update button when tapped, from where it stands (17 November 2026)", async () => {
    const measured = jest
      .spyOn(View.prototype as unknown as { measureInWindow: () => void }, "measureInWindow")
      .mockImplementation(((answer: (x: number, y: number, w: number, h: number) => void) =>
        answer(174.5, 43, 44, 44)) as never);
    try {
      await tabs(storeWith("1.3.0"));
      await userEvent.press(await screen.findByTestId("update-dot"));
      const flight = flights.now();
      expect(flight).toMatchObject({ stage: "up", from: { x: 196.5, y: 65 } });
      expect(mockPushed).toEqual(["/about"]);
      flights.miss(flight.id);
    } finally {
      measured.mockRestore();
    }
  });

  it("stays out while nothing waits", async () => {
    await tabs(storeWith("1.2.4", []));
    await screen.findByText(/never/, {}, { timeout: 50 }).catch(() => undefined);
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("stays out for the version About already put it out for", async () => {
    mockSettings.set("update.seen", JSON.stringify({ version: "1.3.0", at: Date.now() }));
    await tabs(storeWith("1.3.0"));
    await screen.findByText(/never/, {}, { timeout: 50 }).catch(() => undefined);
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("stays out on a device where it was turned off", async () => {
    mockSettings.set("update.dot", "off");
    await tabs(storeWith("1.3.0"));
    await screen.findByText(/never/, {}, { timeout: 50 }).catch(() => undefined);
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });
});
