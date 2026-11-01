/**
 * Whether this phone's pushes are on, as the switch on You and the setup card's tick both read it:
 * allowed by the system and taken by the server, which is when the setting is written "on". The
 * system's yes alone once stood for a token the server never had (the new-person sweep's 13).
 */

import * as Notifications from "expo-notifications";
import { pushIsOn } from "./turnOn";

jest.mock("expo-notifications", () => ({ getPermissionsAsync: jest.fn() }));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { eas: { projectId: "942a13f7-2a4f-47f6-9ba1-935ca499454f" } } },
  },
}));
const mockSettings = new Map<string, string>();
jest.mock("../prefs", () => ({
  SETTINGS: { push: "push" },
  readSetting: async (name: string) => mockSettings.get(name),
  writeSetting: async (name: string, value: string) => {
    mockSettings.set(name, value);
  },
}));

const permission = (granted: boolean) =>
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValue({ granted } as Awaited<
      ReturnType<typeof Notifications.getPermissionsAsync>
    >);

beforeEach(() => mockSettings.clear());

it("is on only once the server has taken the token", async () => {
  permission(true);
  // Allowed when it asked, but the server never took the token: off, so it is asked again.
  expect(await pushIsOn()).toBe(false);
  mockSettings.set("push", "on");
  expect(await pushIsOn()).toBe(true);
});

it("is off when turned off here, or refused at the system", async () => {
  permission(true);
  mockSettings.set("push", "off");
  expect(await pushIsOn()).toBe(false);
  permission(false);
  mockSettings.set("push", "on");
  expect(await pushIsOn()).toBe(false);
});
