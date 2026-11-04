/**
 * What a phone tells the server when it registers for pushes (ADR 0158): with the app's module,
 * the key the server seals an agent's words to; without it, as before, fixed words only.
 */

import { deleteJson, putJson } from "@chipschat/core";
import { requireOptionalNativeModule } from "expo";
import * as Notifications from "expo-notifications";

jest.mock("expo", () => ({
  ...jest.requireActual("expo"),
  requireOptionalNativeModule: jest.fn(),
}));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { eas: { projectId: "942a13f7-2a4f-47f6-9ba1-935ca499454f" } } },
  },
}));
jest.mock("@chipschat/core", () => ({
  putJson: jest.fn(),
  deleteJson: jest.fn(),
  isDemo: jest.requireActual("@chipschat/core").isDemo,
}));
const mockSettings = new Map<string, string>();
jest.mock("../prefs", () => ({
  SETTINGS: { push: "push" },
  writeSetting: async (name: string, value: string) => {
    mockSettings.set(name, value);
  },
}));

const optional = jest.mocked(requireOptionalNativeModule);
const put = jest.mocked(putJson);
const DEVICE = { deviceId: "dev_home" } as Parameters<typeof putJson>[0];
const KEY = Buffer.alloc(32, 7).toString("base64");

/** A fresh copy of the module, since it keeps what it found the first time it was asked. */
function load(): typeof import("./register") {
  let loaded: typeof import("./register") | undefined;
  jest.isolateModules(() => {
    loaded = require("./register");
  });
  return loaded as typeof import("./register");
}

afterEach(() => {
  mockSettings.clear();
  optional.mockReset();
  put.mockReset();
  jest.mocked(Notifications.getPermissionsAsync).mockReset();
  jest.mocked(Notifications.requestPermissionsAsync).mockReset();
  jest.mocked(Notifications.getExpoPushTokenAsync).mockReset();
});

it("sends the key the extension opens words with", async () => {
  optional.mockReturnValue({ sealKey: () => KEY });
  await load().registerToken(DEVICE, "ExponentPushToken[one]");
  expect(optional).toHaveBeenCalledWith("ChipsPushSeal");
  expect(put).toHaveBeenCalledWith(DEVICE, "/v1/me/push-token", {
    token: "ExponentPushToken[one]",
    platform: "ios",
    time_zone: expect.any(String),
    seal_key: KEY,
  });
});

it("sends each workspace's server the key of this phone's device there, and no other's", async () => {
  const keys = new Map([
    ["dev_home", Buffer.alloc(32, 1).toString("base64")],
    ["dev_work", Buffer.alloc(32, 2).toString("base64")],
  ]);
  const sealKey = jest.fn((deviceId: string) => keys.get(deviceId) ?? null);
  optional.mockReturnValue({ sealKey });
  const register = load();
  const work = { deviceId: "dev_work" } as Parameters<typeof putJson>[0];
  await register.registerToken(DEVICE, "ExponentPushToken[one]");
  await register.registerToken(work, "ExponentPushToken[one]");
  expect(sealKey.mock.calls).toEqual([["dev_home"], ["dev_work"]]);
  expect(
    put.mock.calls.map(([device, , body]) => [device, (body as { seal_key?: string }).seal_key]),
  ).toEqual([
    [DEVICE, keys.get("dev_home")],
    [work, keys.get("dev_work")],
  ]);
});

it("sends no key from a build without the module, or a keychain that kept none", async () => {
  optional.mockReturnValue(null);
  await load().registerToken(DEVICE, "ExponentPushToken[one]");
  optional.mockReturnValue({ sealKey: () => null });
  await load().registerToken(DEVICE, "ExponentPushToken[one]");
  optional.mockReturnValue({
    sealKey: () => {
      throw new Error("errSecMissingEntitlement");
    },
  });
  await load().registerToken(DEVICE, "ExponentPushToken[one]");
  for (const [, , body] of put.mock.calls) expect(body).not.toHaveProperty("seal_key");
  expect(put).toHaveBeenCalledTimes(3);
});

describe("registering again as the app opens (ADRs 0157, 0158)", () => {
  const granted = { granted: true } as Awaited<
    ReturnType<typeof Notifications.getPermissionsAsync>
  >;

  it("sends the token, today's zone and the key, when the person switched pushes on", async () => {
    optional.mockReturnValue({ sealKey: () => KEY });
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(granted);
    jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({
      type: "expo",
      data: "ExponentPushToken[two]",
    });
    await load().refreshRegistration(DEVICE, "on");
    expect(put).toHaveBeenCalledWith(DEVICE, "/v1/me/push-token", {
      token: "ExponentPushToken[two]",
      platform: "ios",
      time_zone: expect.any(String),
      seal_key: KEY,
    });
  });

  it("asks nothing and sends nothing when it was switched off, never on, or refused", async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      granted: false,
    } as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);
    await load().refreshRegistration(DEVICE, "off");
    await load().refreshRegistration(DEVICE, undefined);
    await load().refreshRegistration(DEVICE, "on");
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    // Switched off here, though the phone allows notifications: still nothing.
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(granted);
    await load().refreshRegistration(DEVICE, "off");
    expect(put).not.toHaveBeenCalled();
    expect(mockSettings.size).toBe(0);
  });

  it("registers a phone the server never took, allowed with nothing saved, and saves on once it does", async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(granted);
    jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({
      type: "expo",
      data: "ExponentPushToken[three]",
    });
    put.mockRejectedValueOnce(new Error("no route to host"));
    // Out of reach again: nothing saved, so it is tried at the next launch.
    await expect(load().refreshRegistration(DEVICE, undefined)).rejects.toThrow("no route");
    expect(mockSettings.get("push")).toBeUndefined();
    await load().refreshRegistration(DEVICE, undefined);
    expect(put).toHaveBeenLastCalledWith(
      DEVICE,
      "/v1/me/push-token",
      expect.objectContaining({ token: "ExponentPushToken[three]" }),
    );
    expect(mockSettings.get("push")).toBe("on");
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe("saying it again as the app opens (the stranger review, P-6)", () => {
  const granted = { granted: true } as Awaited<
    ReturnType<typeof Notifications.getPermissionsAsync>
  >;
  const withdraw = jest.mocked(deleteJson);
  afterEach(() => withdraw.mockReset());

  it("tells a workspace muted here, and every one when pushes are off, to stop again", async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(granted);
    const muted = { deviceId: "dev_muted", muted: true } as Parameters<typeof putJson>[0];
    const register = load();
    await register.settleRegistration(muted, "on");
    await register.settleRegistration(DEVICE, "off");
    expect(withdraw.mock.calls).toEqual([
      [muted, "/v1/me/push-token"],
      [DEVICE, "/v1/me/push-token"],
    ]);
    expect(put).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("registers one switched on and not muted, as before, and withdraws nothing", async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(granted);
    jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({
      type: "expo",
      data: "ExponentPushToken[four]",
    });
    await load().settleRegistration(DEVICE, "on");
    expect(put).toHaveBeenCalledWith(
      DEVICE,
      "/v1/me/push-token",
      expect.objectContaining({ token: "ExponentPushToken[four]" }),
    );
    expect(withdraw).not.toHaveBeenCalled();
  });

  it("lets a withdraw that fails again throw, for the launch to try once more next time", async () => {
    withdraw.mockRejectedValueOnce(new Error("no route to host"));
    await expect(load().settleRegistration(DEVICE, "off")).rejects.toThrow("no route");
  });
});

describe("the demo's made-up workspace (ADR 0213)", () => {
  const DEMO = { deviceId: jest.requireActual("@chipschat/core").DEMO_DEVICE_ID } as Parameters<
    typeof putJson
  >[0];

  it("is never registered, told again, or told to stop, and nothing is asked of the phone for it", async () => {
    optional.mockReturnValue({ sealKey: () => KEY });
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValue({ granted: true } as Awaited<
        ReturnType<typeof Notifications.getPermissionsAsync>
      >);
    jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({
      type: "expo",
      data: "ExponentPushToken[demo]",
    });
    const register = load();
    await register.registerToken(DEMO, "ExponentPushToken[demo]");
    await register.refreshRegistration(DEMO, "on");
    await register.unregisterToken(DEMO);
    expect(put).not.toHaveBeenCalled();
    expect(deleteJson).not.toHaveBeenCalled();
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it("is never turned on: no permission is asked for", async () => {
    let turnOn: typeof import("./turnOn") | undefined;
    jest.isolateModules(() => {
      turnOn = require("./turnOn");
    });
    const turned = await turnOn?.turnOnPush(DEMO);
    expect(turned).toEqual({ kind: "not_a_phone" });
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
