/**
 * *Notify me on this phone*. Several things can be wrong and each has to say which, because a
 * switch that fails silently is worse than no switch at all — and the sentence about what a
 * push carries is the one people will actually read before flipping it (in the Decisions sheet).
 */

import type { Device, ServerFacts } from "@chipschat/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";
import { pushNote, usePushRows } from "./Push";

const DEVICE = { deviceId: "dev_1", workspaceId: "ws_1" } as unknown as Device;

const granted = { granted: true, status: "granted" };
const denied = { granted: false, status: "denied" };

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationCategoryAsync: jest.fn(),
}));

jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));

jest.mock("@chipschat/core", () => ({
  putJson: jest.fn(),
  deleteJson: jest.fn(),
  isDemo: jest.requireActual("@chipschat/core").isDemo,
}));

const mockSettings = new Map<string, string>();
jest.mock("../prefs", () => ({
  SETTINGS: { push: "push" },
  readSetting: async (name: string) => mockSettings.get(name),
  writeSetting: async (name: string, value: string) => {
    mockSettings.set(name, value);
  },
}));

/** The switch's rows and the line under them, as Notifications' card on You draws them. */
function Push({
  device,
  store,
}: {
  readonly device: Device;
  readonly store?: { readonly serverFacts: () => Promise<ServerFacts> };
}) {
  const { rows, problem } = usePushRows({ device, store });
  return (
    <>
      {rows}
      {problem}
    </>
  );
}

const notifications = jest.requireMock("expo-notifications") as Record<string, jest.Mock>;
const constants = jest.requireMock("expo-constants") as {
  default: { expoConfig: { extra: Record<string, unknown> } };
};
const core = jest.requireMock("@chipschat/core") as Record<string, jest.Mock>;

/** The switch is disabled until the first read has answered; this waits for that. */
async function ready(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId("push-switch")).toBeEnabled());
}

/** A Switch answers `valueChange`, not a press. */
function flip(on: boolean): void {
  fireEvent(screen.getByTestId("push-switch"), "valueChange", on);
}

function withProject(id: string | undefined) {
  constants.default.expoConfig.extra = id === undefined ? {} : { eas: { projectId: id } };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings.clear();
  withProject("942a13f7-2a4f-47f6-9ba1-935ca499454f");
  notifications["getPermissionsAsync"]?.mockResolvedValue(denied);
  notifications["requestPermissionsAsync"]?.mockResolvedValue(granted);
  notifications["getExpoPushTokenAsync"]?.mockResolvedValue({ data: "ExponentPushToken[abc]" });
  core["putJson"]?.mockResolvedValue({});
  core["deleteJson"]?.mockResolvedValue({});
});

describe("the switch", () => {
  it("says what a push carries", () => {
    const said = pushNote("ios");
    expect(said).toMatch(/carries no words about the ask/);
    expect(said).toMatch(/Face ID/);
    expect(said).toMatch(/sealed so only this phone can read it/);
  });

  it("on Android, says Approve opens the ask, because nothing there asks for the unlock first", () => {
    const said = pushNote("android");
    expect(said).toMatch(/Approve opens the ask once the phone is unlocked/);
    expect(said).not.toMatch(/Face ID/);
  });

  it("says nothing under the switch while nothing is wrong", async () => {
    await render(<Push device={DEVICE} />);
    await ready();
    expect(screen.queryByTestId("push-problem")).toBeNull();
  });

  it("says under the switch when the server can't push, on or off (ADR 0244)", async () => {
    const facts = (pushes: ServerFacts["pushes"]) => ({
      serverFacts: async (): Promise<ServerFacts> => ({
        machine: "Mac mini",
        version: "1.0.0",
        publicUrl: "http://192.168.1.4:4431",
        relay: { url: undefined, status: "off" },
        pushes,
      }),
    });
    const first = await render(<Push device={DEVICE} store={facts("no_access_token")} />);
    await ready();
    expect(await screen.findByTestId("push-problem")).toHaveTextContent(
      /Your server can't send notifications yet\. It needs an access token for Expo/,
    );
    // Still a switch: on, the phone is told the day the server can push.
    expect(screen.getByTestId("push-switch")).toBeEnabled();
    await first.unmount();

    const second = await render(<Push device={DEVICE} store={facts("refused")} />);
    await ready();
    expect(await screen.findByTestId("push-problem")).toHaveTextContent(
      /Expo turned down its access token/,
    );
    await second.unmount();

    // Pushes that didn't get through: said, and the switch is as it was.
    const third = await render(<Push device={DEVICE} store={facts("failing")} />);
    await ready();
    expect(await screen.findByTestId("push-problem")).toHaveTextContent(
      /Your server's last notifications didn't get through/,
    );
    expect(screen.getByTestId("push-switch")).toBeEnabled();
    await third.unmount();

    await render(<Push device={DEVICE} store={facts("ready")} />);
    await ready();
    expect(screen.queryByTestId("push-problem")).toBeNull();
  });

  it("asks the phone, then the push service, then tells the server", async () => {
    await render(<Push device={DEVICE} />);
    await ready();

    flip(true);
    await waitFor(() => expect(notifications["requestPermissionsAsync"]).toHaveBeenCalled());
    expect(core["putJson"]).toHaveBeenCalledWith(DEVICE, "/v1/me/push-token", {
      token: "ExponentPushToken[abc]",
      platform: "ios",
      time_zone: expect.any(String),
    });
    await waitFor(() => expect(screen.getByTestId("push-switch").props["value"]).toBe(true));
    expect(mockSettings.get("push")).toBe("on");
  });

  it("tells the server to stop when it is turned off", async () => {
    notifications["getPermissionsAsync"]?.mockResolvedValue(granted);
    await render(<Push device={DEVICE} />);
    await ready();

    flip(false);
    await waitFor(() =>
      expect(core["deleteJson"]).toHaveBeenCalledWith(DEVICE, "/v1/me/push-token"),
    );
    await waitFor(() => expect(screen.getByTestId("push-switch").props["value"]).toBe(false));
  });

  it("reads off while the server never took the token, though the phone allows notifications", async () => {
    // Allowed when it asked, and the server out of reach that moment: nothing was written.
    notifications["getPermissionsAsync"]?.mockResolvedValue(granted);
    const first = await render(<Push device={DEVICE} />);
    await ready();
    expect(screen.getByTestId("push-switch").props["value"]).toBe(false);
    await first.unmount();
    // The launch registered it again, and the server took it this time.
    mockSettings.set("push", "on");
    await render(<Push device={DEVICE} />);
    await ready();
    expect(screen.getByTestId("push-switch").props["value"]).toBe(true);
  });

  it("stays off when opened again, though the phone still allows notifications", async () => {
    notifications["getPermissionsAsync"]?.mockResolvedValue(granted);
    const first = await render(<Push device={DEVICE} />);
    await ready();
    flip(false);
    await waitFor(() => expect(mockSettings.get("push")).toBe("off"));
    await first.unmount();

    await render(<Push device={DEVICE} />);
    await ready();
    expect(screen.getByTestId("push-switch").props["value"]).toBe(false);
  });
});

describe("when it cannot work", () => {
  it("says the build has no project id rather than failing quietly", async () => {
    withProject(undefined);
    await render(<Push device={DEVICE} />);
    expect(await screen.findByTestId("push-problem")).toBeTruthy();
    expect(screen.getByText(/no Expo project id/)).toBeTruthy();
  });

  it("says the phone is refusing notifications, and offers Settings", async () => {
    notifications["requestPermissionsAsync"]?.mockResolvedValue(denied);
    await render(<Push device={DEVICE} />);
    await ready();

    flip(true);

    expect(await screen.findByText(/not allowing notifications/)).toBeTruthy();
    // Where the person has to go is this app's row, not Expo Go's: the phone runs its own build.
    expect(screen.getByText(/Settings → Notifications → Chips\b/)).toBeTruthy();
    expect(screen.queryByText(/Expo Go/)).toBeNull();
    expect(screen.getByText("Open Settings")).toBeTruthy();
    // And still flippable: they allow it in Settings and come back.
    expect(screen.getByTestId("push-switch")).toBeEnabled();
  });

  it("says what the server said, when the server refuses it", async () => {
    core["putJson"]?.mockRejectedValue(new Error("no route to host"));
    await render(<Push device={DEVICE} />);
    await ready();

    flip(true);

    expect(await screen.findByText(/The server did not take it: no route to host/)).toBeTruthy();
  });

  it("says the build cannot receive push when it was signed without the entitlement, and not that the server refused it", async () => {
    // What iOS says through expo-notifications for a build signed by a free Apple team.
    notifications["getExpoPushTokenAsync"]?.mockRejectedValue(
      new Error(
        "Error encountered while fetching device push token: no valid “aps-environment” entitlement string found for application",
      ),
    );
    await render(<Push device={DEVICE} />);
    await ready();

    flip(true);

    expect(await screen.findByText(/This build cannot receive push/)).toBeTruthy();
    expect(screen.getByText(/paid Apple team/)).toBeTruthy();
    expect(screen.queryByText(/server/)).toBeNull();
    expect(core["putJson"]).not.toHaveBeenCalled();
    // Flipping it again cannot help: the build has to change. Read off the prop, because the
    // testing library's `toBeDisabled` does not read a Switch's `disabled` and passes either way.
    expect(screen.getByTestId("push-switch").props["disabled"]).toBe(true);
  });

  it("says the build cannot receive push when it has no Firebase project, and not that the server refused it", async () => {
    // What Android says through expo-notifications for a build with no google-services.json,
    // as an emulator build said it on 14 September 2026.
    notifications["getExpoPushTokenAsync"]?.mockRejectedValue(
      new Error(
        "Unable to get Firebase Messaging instance. Did you configure `googleServicesFile` path in app config? Make sure to complete the guide at https://docs.expo.dev/push-notifications/fcm-credentials/ : Default FirebaseApp is not initialized in this process chat.chips.app. Make sure to call FirebaseApp.initializeApp(Context) first.",
      ),
    );
    await render(<Push device={DEVICE} />);
    await ready();

    flip(true);

    expect(await screen.findByText(/This build cannot receive push/)).toBeTruthy();
    expect(screen.getByText(/Firebase project/)).toBeTruthy();
    expect(screen.queryByText(/could not get a push token/)).toBeNull();
    expect(core["putJson"]).not.toHaveBeenCalled();
    expect(screen.getByTestId("push-switch").props["disabled"]).toBe(true);
  });

  it("on an Android build with no Firebase project, says so before the switch is touched", async () => {
    // The emulator, 16 October 2026: notifications allowed at the system, the switch stood on.
    notifications["getPermissionsAsync"]?.mockResolvedValue(granted);
    const android = jest.replaceProperty(Platform, "OS", "android");
    try {
      await render(<Push device={DEVICE} />);
      expect(await screen.findByText(/This build cannot receive push/)).toBeTruthy();
      // Android's own switch, which names its value `on`.
      expect(screen.getByTestId("push-switch").props["on"]).toBe(false);
      expect(screen.getByTestId("push-switch")).toBeDisabled();
    } finally {
      android.restore();
    }
  });

  it("on an Android build with a Firebase project, reads the switch as the phone allows it", async () => {
    notifications["getPermissionsAsync"]?.mockResolvedValue(granted);
    mockSettings.set("push", "on");
    const config = constants.default.expoConfig as Record<string, unknown>;
    config["android"] = { googleServicesFile: "./google-services.json" };
    const android = jest.replaceProperty(Platform, "OS", "android");
    try {
      await render(<Push device={DEVICE} />);
      await ready();
      expect(screen.getByTestId("push-switch").props["on"]).toBe(true);
      expect(screen.queryByText(/This build cannot receive push/)).toBeNull();
    } finally {
      android.restore();
      delete config["android"];
    }
  });

  it("says the phone could not get a token when the push service fails, and not that the server refused it", async () => {
    notifications["getExpoPushTokenAsync"]?.mockRejectedValue(
      new Error("The Internet connection appears to be offline."),
    );
    await render(<Push device={DEVICE} />);
    await ready();

    flip(true);

    expect(
      await screen.findByText(
        /could not get a push token: The Internet connection appears to be offline/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/server/)).toBeNull();
    expect(core["putJson"]).not.toHaveBeenCalled();
    // And still flippable: a dropped connection is worth trying again.
    expect(screen.getByTestId("push-switch").props["disabled"]).toBe(false);
  });
});
