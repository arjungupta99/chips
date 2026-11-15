/**
 * About Chips (ADR 0295): the page opens on the chip, the name, the build and what Chips is; says
 * which Chips the computer runs and, when it is behind, what waits for it; copies a line for a bug
 * report; and opens What's new, the links, Licence and Acknowledgements. This build is held at
 * 1.2.4 so the release's own words are what the page says.
 */

import type { Directory, SelfUpdateFacts, Store } from "@chipschat/core";
import {
  act,
  fireEvent,
  render as renderBare,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import type { ReactElement, ReactNode } from "react";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { UpdatesProvider } from "../updates/updates";
import { AboutPage } from "./AboutPage";
import { LicencePage } from "./LicencePage";
import { NoticesPage } from "./NoticesPage";
import { WhatsNewPage } from "./WhatsNewPage";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}

const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const mockPushed: unknown[] = [];
jest.mock("expo-router", () => {
  const { useEffect } = require("react");
  return {
    useFocusEffect: (effect: () => (() => void) | undefined) => useEffect(effect, [effect]),
    useRouter: () => ({ push: (to: unknown) => mockPushed.push(to) }),
  };
});
jest.mock("./build", () => ({
  appBuild: () => ({ version: "1.2.4", build: "202611111859", commit: "b45d368" }),
  systemWords: () => "iOS 26.1",
}));
jest.mock("../ui/haptics", () => ({ tap: () => undefined }));
const mockSettings = new Map<string, string>();
jest.mock("../prefs", () => ({
  SETTINGS: {
    updateDot: "update.dot",
    updateSeen: "update.seen",
    updateSeenNeeds: "update.seen-needs",
  },
  readSetting: async (name: string) => mockSettings.get(name),
  writeSetting: async (name: string, value: string) => {
    mockSettings.set(name, value);
  },
}));

/**
 * A store that answers `GET /v1/server` as a computer on `version`, or not at all, with what it
 * read of the releases (ADR 0296).
 */
function computerOn(version: string | undefined, appStore?: string): Store {
  return {
    serverFacts: async () => {
      if (version === undefined) throw new Error("unreachable");
      return {
        machine: "Mac mini",
        version,
        publicUrl: "https://mini",
        relay: { url: undefined, status: "off" },
        ...(appStore === undefined ? {} : { updates: { releases: [], appStore } }),
      };
    },
  } as unknown as Store;
}

/** About as the app has it: under the updates provider, read by the workspace's owner or not. */
const about = (store: Store, owner = true) =>
  render(
    <UpdatesProvider store={store} owner={owner}>
      <AboutPage store={store} />
    </UpdatesProvider>,
  );

beforeEach(() => {
  mockPushed.length = 0;
  mockSettings.clear();
  jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  jest.mocked(Linking.openURL).mockClear();
  jest.mocked(Clipboard.setStringAsync).mockClear();
});

/** Who is who, as the paired store says it: the names in the Needs update list. */
const DIRECTORY = {
  har_hermes: { id: "har_hermes", kind: "harness", displayName: "Hermes" },
  par_n: { id: "par_n", kind: "person", displayName: "Natalie Wood" },
} as unknown as Directory;

/**
 * A computer from the install line that knows what everything runs (ADR 0297). `away` is one that
 * has gone: it takes no write, and answers no read after one was tried.
 */
function inStep(night: boolean[], away = false): Store {
  const now = new Date().toISOString();
  return {
    serverFacts: async () => {
      if (away && night.length > 0) throw new Error("offline");
      return {
        machine: "hetzner-box",
        version: "1.2.4",
        publicUrl: "https://box",
        relay: { url: undefined, status: "off" },
        updates: { releases: [], appStore: "1.2.5" },
        selfUpdate: { available: true, automatic: false },
      };
    },
    software: async () => ({
      harnesses: [
        {
          harnessId: "har_hermes",
          name: "chips-hermes",
          version: "1.0.31",
          seenAt: now,
          keepCurrent: true,
          bridgeUpdate: {
            package: "@chipschat/hermes",
            running: "1.0.31",
            phase: "refused",
            since: now,
            target: "1.0.32",
            reason: "room",
          },
        },
      ],
      devices: [
        {
          deviceId: "dev_n",
          personId: "par_n",
          name: "chips-iphone",
          version: "1.1.0",
          seenAt: now,
        },
      ],
    }),
    setSelfUpdate: async (automatic: boolean) => {
      night.push(automatic);
      if (away) throw new Error("offline");
      return { available: true, automatic };
    },
  } as unknown as Store;
}

/** About for the owner of a workspace whose computer says what everything runs. */
const ownersAbout = (store: Store, owner = true) =>
  render(
    <UpdatesProvider
      store={store}
      owner={owner}
      me="par_me"
      thisDevice="dev_me"
      directory={DIRECTORY}
    >
      <AboutPage store={store} />
    </UpdatesProvider>,
  );

/** A computer on `version` that says this of its own updates, as it does to its owner. */
function computerSaying(version: string, selfUpdate: SelfUpdateFacts): Store {
  return {
    serverFacts: async () => ({
      machine: "Mac mini",
      version,
      publicUrl: "https://mini",
      relay: { url: undefined, status: "off" },
      selfUpdate,
    }),
  } as unknown as Store;
}

describe("everything in step (ADR 0297)", () => {
  it("lists what needs the owner, each with the dot, and a bridge's row opens its page", async () => {
    await ownersAbout(inStep([]));
    const needs = await screen.findByTestId("about-needs");
    const bridge = within(needs).getByTestId("about-needs-bridge");
    expect(bridge).toHaveTextContent(/Hermes bridge/);
    expect(bridge).toHaveTextContent(/Couldn't update to 1\.0\.32: this computer's disk is full\./);
    expect(within(bridge).getByTestId("needs-dot")).toBeTruthy();
    expect(within(needs).getByTestId("about-needs-device")).toHaveTextContent(
      /Natalie's iPhone.*Chips 1\.1\.0 · 1\.2\.5 is on the App Store/,
    );
    await userEvent.press(bridge);
    expect(mockPushed).toEqual([{ pathname: "/harnesses/[id]", params: { id: "har_hermes" } }]);
  });

  it("gives a computer from the install line its night switch, off, and turns it on", async () => {
    const night: boolean[] = [];
    await ownersAbout(inStep(night));
    const toggle = await screen.findByTestId("about-night-switch");
    expect(toggle).toHaveProp("value", false);
    expect(await screen.findByTestId("about-night-foot")).toHaveTextContent(
      /With this on, hetzner-box updates itself between 2 and 5 in the morning/,
    );
    await act(async () => {
      fireEvent(toggle, "valueChange", true);
    });
    expect(night).toEqual([true]);
    expect(screen.getByTestId("about-night-switch")).toHaveProp("value", true);
  });

  it("puts the night switch back when the computer didn't take it", async () => {
    const night: boolean[] = [];
    await ownersAbout(inStep(night, true));
    const toggle = await screen.findByTestId("about-night-switch");
    await act(async () => {
      fireEvent(toggle, "valueChange", true);
    });
    expect(night).toEqual([true]);
    // The write failed, and so did the read after it: the switch says what the computer holds.
    await waitFor(() =>
      expect(screen.getByTestId("about-night-switch")).toHaveProp("value", false),
    );
    expect(screen.getByTestId("about-night-foot")).toHaveTextContent(/^With this on,/);
  });

  it("shows a member no night switch, no Needs update list and no Update for the computer", async () => {
    // The computer tells only its owner of its own updates; here it is behind this app too.
    const store = {
      ...inStep([]),
      serverFacts: async () => ({
        machine: "hetzner-box",
        version: "1.2.3",
        publicUrl: "https://box",
        relay: { url: undefined, status: "off" },
        updates: { releases: [], appStore: "1.2.4" },
      }),
    } as unknown as Store;
    await ownersAbout(store, false);
    expect(await screen.findByText("Chips on hetzner-box")).toBeTruthy();
    expect(screen.getByTestId("about-computer-row")).toHaveTextContent(/1\.2\.3/);
    expect(screen.queryByTestId("about-night")).toBeNull();
    expect(screen.queryByTestId("about-needs")).toBeNull();
    expect(screen.queryByTestId("about-update")).toBeNull();
    // What waits for the computer is still said to anyone.
    expect(screen.getByTestId("about-behind")).toBeTruthy();
  });
});

describe("a computer Chips for Mac carries (ADR 0298)", () => {
  it("says a release comes with Chips for Mac, with no Update and no night switch", async () => {
    await about(computerSaying("1.2.3", { available: false, automatic: false, withApp: true }));
    expect(await screen.findByText("Chips on Mac mini")).toBeTruthy();
    expect(screen.getByTestId("about-computer-row")).toHaveTextContent(
      /1\.2\.3 · 1\.2\.4 comes with Chips for Mac/,
    );
    expect(screen.queryByTestId("about-update")).toBeNull();
    expect(screen.queryByTestId("about-night")).toBeNull();
  });

  it("says it starts again on its own once the app has updated, with no Update", async () => {
    await about(
      computerSaying("1.2.3", {
        available: false,
        automatic: false,
        withApp: true,
        restartsOnto: "1.2.4",
      }),
    );
    expect(await screen.findByText("Chips on Mac mini")).toBeTruthy();
    expect(screen.getByTestId("about-computer-row")).toHaveTextContent(
      /Starts again on 1\.2\.4 when nothing is going on/,
    );
    expect(screen.queryByTestId("about-update")).toBeNull();
  });
});

describe("About Chips", () => {
  it("opens on the chip, the name, the build and what Chips is", async () => {
    await about(computerOn("1.2.4"));
    expect(screen.getByTestId("about-mark")).toBeTruthy();
    expect(screen.getByTestId("about-name")).toHaveTextContent("Chips");
    expect(screen.getByTestId("about-capsule")).toHaveTextContent("1.2.4 (202611111859) · b45d368");
    expect(
      screen.getByText(
        /^Chips is a chat app for you and the AI agents you already run\. It runs on your own computer, and this (phone|iPad) reaches it\.$/,
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("about-made")).toHaveTextContent(/Made by Arjun Gupta\./);
  });

  it("says the computer's Chips, and nothing waits when it is as new as the app", async () => {
    await about(computerOn("1.2.4"));
    expect(await screen.findByText("Chips on Mac mini")).toBeTruthy();
    expect(screen.getByTestId("about-computer-row")).toHaveTextContent(/1\.2\.4/);
    expect(screen.queryByTestId("about-update")).toBeNull();
    expect(screen.queryByTestId("about-behind")).toBeNull();
  });

  it("says what waits for a computer that is behind, and opens the steps to update it", async () => {
    await about(computerOn("1.2.3"));
    expect(await screen.findByTestId("about-behind")).toHaveTextContent(
      /has 1\.2\.4\. Pause, No cap and See all need 1\.2\.4 on Mac mini too\./,
    );
    await userEvent.press(screen.getByTestId("about-update"));
    expect(Linking.openURL).toHaveBeenCalledWith("https://chipschat.ai/start/install/#updating");
  });

  it("tells only the owner Update for the computer, and anyone what waits for it", async () => {
    await about(computerOn("1.2.3"), false);
    expect(await screen.findByTestId("about-behind")).toBeTruthy();
    expect(screen.queryByTestId("about-update")).toBeNull();
    expect(screen.getByTestId("about-computer-row")).toHaveTextContent(/1\.2\.3/);
  });

  it("offers this app's update from the App Store when it has a newer one (ADR 0296)", async () => {
    await about(computerOn("1.2.4", "1.2.5"));
    expect(await screen.findByTestId("about-update-app")).toHaveTextContent("Update");
    expect(screen.getByTestId("about-app-row")).toHaveTextContent(
      /1\.2\.4 · 1\.2\.5 is on the App Store/,
    );
    await userEvent.press(screen.getByTestId("about-update-app"));
    expect(Linking.openURL).toHaveBeenCalledWith("https://apps.apple.com/app/id6824148802");
  });

  it("turns the update dot off on this device, and says updates still show here", async () => {
    await about(computerOn("1.2.4"));
    expect(screen.getByTestId("about-dot-foot")).toHaveTextContent(
      /A gold dot shows at the top of the screen/,
    );
    await act(async () => {
      fireEvent(screen.getByTestId("about-dot-switch"), "valueChange", false);
    });
    expect(screen.getByTestId("about-dot-foot")).toHaveTextContent(/No update dot on this device/);
    expect(mockSettings.get("update.dot")).toBe("off");
  });

  it("says so when the computer can't be reached, and draws the rest", async () => {
    await about(computerOn(undefined));
    expect(await screen.findByText("Not reached just now")).toBeTruthy();
    expect(screen.getByTestId("about-whats-new-row")).toBeTruthy();
  });

  it("copies a line for a bug report, and says it did", async () => {
    await about(computerOn("1.2.3"));
    await screen.findByText("Chips on Mac mini");
    await userEvent.press(screen.getByTestId("about-capsule"));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
      "Chips 1.2.4 (202611111859) · b45d368 · iOS 26.1 · Mac mini on 1.2.3",
    );
    expect(screen.getByTestId("about-capsule")).toHaveTextContent("Copied for a bug report");
  });

  it("pushes What's new, Licence and Acknowledgements on a phone", async () => {
    await about(computerOn("1.2.4"));
    expect(screen.getByTestId("about-whats-new-row")).toHaveTextContent(/What's new in 1\.2\.4/);
    await userEvent.press(screen.getByTestId("about-whats-new-row"));
    await userEvent.press(screen.getByTestId("about-licence"));
    await userEvent.press(screen.getByTestId("about-notices"));
    expect(mockPushed).toEqual(["/about/whats-new", "/about/licence", "/about/notices"]);
  });

  it("opens the site's pages and the App Store's review page", async () => {
    await about(computerOn("1.2.4"));
    const links = within(screen.getByTestId("about-links"));
    await userEvent.press(links.getByTestId("about-website"));
    await userEvent.press(links.getByTestId("about-rate"));
    await userEvent.press(screen.getByTestId("about-privacy"));
    expect(jest.mocked(Linking.openURL).mock.calls.map(([url]) => url)).toEqual([
      "https://chipschat.ai/",
      "https://apps.apple.com/app/id6824148802?action=write-review",
      "https://chipschat.ai/privacy/",
    ]);
  });

  it("lights the pins again when the chip is tapped", async () => {
    jest.useFakeTimers();
    try {
      await about(computerOn("1.2.4"));
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });
      await userEvent.press(screen.getByTestId("about-mark"));
      expect(screen.getByTestId("about-mark")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("the pages a level deeper", () => {
  it("lists what 1.2.4 changed, with its day", async () => {
    await render(<WhatsNewPage />);
    expect(screen.getByText("Chips 1.2.4")).toBeTruthy();
    expect(screen.getByText("11 November 2026")).toBeTruthy();
    expect(screen.getByTestId("whats-new-changes")).toHaveTextContent(/Pause, Resume and Stop/);
  });

  it("says the licence in plain words", async () => {
    await render(<LicencePage />);
    expect(
      screen.getByText(/each release becomes Apache-2\.0 two years after it comes out/i),
    ).toBeTruthy();
    expect(screen.getByText("Neither licence covers the name Chips or the mark.")).toBeTruthy();
  });

  it("folds a package's licence text open in place", async () => {
    await render(<NoticesPage />);
    const row = screen.getByTestId("notice-@babel/runtime");
    expect(row).toHaveTextContent(/MIT/);
    expect(screen.queryByTestId("notice-text-@babel/runtime")).toBeNull();
    await userEvent.press(row);
    expect(screen.getByTestId("notice-text-@babel/runtime")).toHaveTextContent(
      /Permission is hereby granted/,
    );
  });
});
